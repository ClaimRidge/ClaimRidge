import logging
from typing import Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from core.security import get_current_user
from core.database import supabase

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
        return {"status": "success", "message": "Policy successfully embedded for AI Adjudication."}
    except Exception as e:
        logger.error(f"Failed to process policy for {insurer_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to process policy document.")


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

    try:
        import hashlib
        import json
        payload_hash = hashlib.sha256(json.dumps(payload.dict()).encode()).hexdigest()
        supabase.table("audit_log").insert({
            "actor_id": current_user.id,
            "action": f"manual_review_{payload.action}",
            "target_id": payload.claim_id,
            "target_type": "claim",
            "payload_hash": payload_hash,
        }).execute()
    except Exception as e:
        logger.error(f"Failed to create audit log for claim {payload.claim_id}: {e}")

    return {"status": "success", "claim": update_res.data[0]}


@router.post("/claims/{claim_id}/analyze")
async def analyze_claim_medical_necessity(claim_id: str, current_user = Depends(get_current_user)):
    """Triggers the LLM to generate a clinical medical necessity recommendation for a claim."""
    from services.ai_services import generate_medical_recommendation

    claim_res = supabase.table("claims").select("*").eq("id", claim_id).execute()
    if not claim_res.data:
        raise HTTPException(status_code=404, detail="Claim not found")
    claim_data = claim_res.data[0]

    recommendation_text = await generate_medical_recommendation(claim_data)

    update_res = (
        supabase.table("claims")
        .update({"ai_recommendation": recommendation_text})
        .eq("id", claim_id)
        .execute()
    )
    if not update_res.data:
        raise HTTPException(status_code=500, detail="Failed to save AI recommendation")

    try:
        supabase.table("ai_inference_log").insert({
            "claim_id": claim_id,
            "model_version": "groq-llama-3.3",
            "prompt_template_name": "medical_necessity_review",
            "input_data": {
                "dx": claim_data.get("diagnosis_codes"),
                "cpt": claim_data.get("procedure_codes"),
            },
            "output_data": {"recommendation": recommendation_text},
        }).execute()
    except Exception as e:
        logger.error(f"Failed to log AI inference: {e}")

    return {"status": "success", "ai_recommendation": recommendation_text}
