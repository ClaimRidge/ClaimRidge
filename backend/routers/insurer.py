import logging
from typing import Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from core.security import get_current_user
from core.database import supabase
from services import audit

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/insurer", tags=["insurer"])


# ---------------------------------------------------------------------------
# Policy upload + embedding (insurer tenant model — uses profiles.insurer_id)
# ---------------------------------------------------------------------------
class PolicyUploadRequest(BaseModel):
    policy_file_base64: str


@router.post("/process-policy")
async def process_policy(payload: PolicyUploadRequest, current_user = Depends(get_current_user)):
    """Receives the PDF directly in the request body, chunks it, and embeds it."""
    profile_res = supabase.table("profiles").select("insurer_id").eq("id", current_user.id).execute()
    if not profile_res.data or not profile_res.data[0].get("insurer_id"):
        raise HTTPException(status_code=403, detail="Not authorized. No insurer linked to profile.")

    insurer_id = profile_res.data[0]["insurer_id"]

    if not payload.policy_file_base64:
        raise HTTPException(status_code=400, detail="No policy document provided in request.")

    try:
        from services.ai_services import process_and_embed_policy_file
        await process_and_embed_policy_file(insurer_id, payload.policy_file_base64)
        audit.record_event(
            action="policy_uploaded", category="action",
            actor_id=current_user.id, tenant_type="insurer", tenant_id=insurer_id,
            target_type="insurer", target_id=insurer_id,
            summary="Medical policy handbook uploaded and embedded",
        )
        return {"status": "success", "message": "Policy successfully embedded for AI Adjudication."}
    except Exception as e:
        logger.error(f"Failed to process policy for {insurer_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to process policy document.")


@router.delete("/policy")
async def delete_policy(current_user = Depends(get_current_user)):
    """Removes every policy_chunks row for the caller's insurer and clears the
    cached policy_file_name in insurers.config."""
    profile_res = supabase.table("profiles").select("insurer_id, account_type").eq("id", current_user.id).execute()
    if not profile_res.data or profile_res.data[0].get("account_type") != "insurance":
        raise HTTPException(status_code=403, detail="Not authorized as an insurer.")
    insurer_id = profile_res.data[0].get("insurer_id")
    if not insurer_id:
        raise HTTPException(status_code=403, detail="No insurer linked to profile.")

    try:
        supabase.table("policy_chunks").delete().eq("insurer_id", insurer_id).execute()

        ins_res = supabase.table("insurers").select("config").eq("id", insurer_id).maybe_single().execute()
        config = (ins_res.data or {}).get("config") or {}
        config.pop("policy_file_name", None)
        supabase.table("insurers").update({
            "config": config,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", insurer_id).execute()

        return {"status": "success"}
    except Exception as e:
        logger.error(f"Failed to delete policy for {insurer_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete policy.")


# ---------------------------------------------------------------------------
# Provider-claims dashboard (legacy provider-side model — uses profiles.account_type='insurance')
# ---------------------------------------------------------------------------
class ReviewClaimRequest(BaseModel):
    claim_id: str
    action: str
    reason: Optional[str] = None


@router.get("/dashboard/claims")
async def get_insurer_claims(current_user = Depends(get_current_user)):
    """Fetches all claims routed to the currently logged-in insurance company."""
    profile_res = supabase.table("profiles").select("account_type, insurer_id").eq("id", current_user.id).execute()
    if not profile_res.data or profile_res.data[0].get("account_type") != "insurance":
        raise HTTPException(status_code=403, detail="Not authorized as an insurer")

    insurer_id = profile_res.data[0].get("insurer_id")
    if not insurer_id:
        raise HTTPException(status_code=403, detail="Insurer staff profile has no linked insurer.")

    try:
        claims_res = (
            supabase.table("claims")
            .select("*")
            .eq("payer_id", insurer_id)
            .order("created_at", desc=True)
            .execute()
        )
        return claims_res.data
    except Exception as e:
        logger.error(f"Failed to fetch claims for insurer {insurer_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch dashboard claims")


@router.post("/review-claim")
async def review_claim(payload: ReviewClaimRequest, current_user = Depends(get_current_user)):
    """Handles manual approvals, rejections, and info requests by a human Medical Officer."""
    profile_res = supabase.table("profiles").select("account_type, insurer_id").eq("id", current_user.id).execute()
    if not profile_res.data or profile_res.data[0].get("account_type") != "insurance":
        raise HTTPException(status_code=403, detail="Not authorized as an insurer")

    insurer_id = profile_res.data[0].get("insurer_id")
    if not insurer_id:
        raise HTTPException(status_code=403, detail="Insurer staff profile has no linked insurer.")

    update_data = {
        "status": payload.action,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if payload.reason:
        update_data["notes"] = payload.reason

    update_res = (
        supabase.table("claims")
        .update(update_data)
        .eq("id", payload.claim_id)
        .eq("payer_id", insurer_id)
        .execute()
    )

    if not update_res.data:
        raise HTTPException(status_code=404, detail="Claim not found or you do not have permission to review it.")

    audit.record_event(
        action=f"claim_review_{payload.action}",
        category="decision",
        actor_id=current_user.id,
        tenant_type="insurer",
        tenant_id=insurer_id,
        target_type="claim",
        target_id=payload.claim_id,
        summary=f"Claim manually {payload.action} by reviewer",
        metadata={"action": payload.action, "reason": payload.reason},
    )

    return {"status": "success", "claim": update_res.data[0]}


@router.post("/claims/{claim_id}/analyze")
async def analyze_claim_medical_necessity(claim_id: str, current_user = Depends(get_current_user)):
    """Generates the advisory, structured AI Medical Necessity Review for a claim.

    Advisory clinical input only — it never decides accept/deny (claim
    adjudication owns the binding verdict). The structured result is persisted
    to claims.medical_necessity and returned to the caller.
    """
    from services.ai_services import generate_medical_recommendation

    profile_res = supabase.table("profiles").select("account_type, insurer_id").eq("id", current_user.id).execute()
    if not profile_res.data or profile_res.data[0].get("account_type") != "insurance":
        raise HTTPException(status_code=403, detail="Not authorized as an insurer")
    insurer_id = profile_res.data[0].get("insurer_id")
    if not insurer_id:
        raise HTTPException(status_code=403, detail="Insurer staff profile has no linked insurer.")

    # Tenant scope: the claim must be routed to the caller's insurer.
    claim_res = (
        supabase.table("claims")
        .select("*")
        .eq("id", claim_id)
        .eq("payer_id", insurer_id)
        .execute()
    )
    if not claim_res.data:
        raise HTTPException(status_code=404, detail="Claim not found")
    claim_data = claim_res.data[0]

    review = await generate_medical_recommendation(claim_data)
    review["generated_at"] = datetime.now(timezone.utc).isoformat()

    update_res = (
        supabase.table("claims")
        .update({"medical_necessity": review})
        .eq("id", claim_id)
        .eq("payer_id", insurer_id)
        .execute()
    )
    if not update_res.data:
        raise HTTPException(status_code=500, detail="Failed to save the medical necessity review")

    audit.record_ai_inference(
        event_type="medical_necessity_review",
        model_version="groq-llama-3.3",
        prompt_template_name="MEDICAL_NECESSITY_PROMPT",
        input_data={
            "dx": claim_data.get("diagnosis_codes"),
            "cpt": claim_data.get("procedure_codes"),
        },
        output_data=review,
        actor_id=current_user.id,
        tenant_type="insurer",
        tenant_id=insurer_id,
        claim_id=claim_id,
        summary=f"AI medical-necessity review generated ({review.get('assessment')})",
    )

    return {"status": "success", "medical_necessity": review}


@router.post("/claims/{claim_id}/adjudicate")
async def adjudicate_claim_endpoint(
    claim_id: str, force: bool = False, current_user = Depends(get_current_user)
):
    """Run (or return the cached) automatic adjudication verdict for a claim.

    Fired by the insurer claim-detail page the first time a claim is opened.
    `?force=true` forces a fresh re-adjudication. Insurer-scoped — the claim
    must be routed to the caller's insurer.

    Pipeline lives in `services/adjudication.py`: fraud hard-gate → policy
    check → LLM adjudication. The verdict sets `claims.status` to
    accepted | denied | escalated and is cached on the claim row."""
    profile_res = supabase.table("profiles").select("account_type, insurer_id").eq("id", current_user.id).execute()
    if not profile_res.data or profile_res.data[0].get("account_type") != "insurance":
        raise HTTPException(status_code=403, detail="Not authorized as an insurer")

    insurer_id = profile_res.data[0].get("insurer_id")
    if not insurer_id:
        raise HTTPException(status_code=403, detail="Insurer staff profile has no linked insurer.")

    from services.adjudication import adjudicate_claim, ClaimNotFound
    try:
        return await adjudicate_claim(
            claim_id=claim_id, insurer_id=insurer_id,
            actor_id=current_user.id, force=force,
        )
    except ClaimNotFound:
        raise HTTPException(status_code=404, detail="Claim not found or not routed to your insurer.")
    except Exception as e:
        logger.error(f"Adjudication failed for claim {claim_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to adjudicate claim.")
