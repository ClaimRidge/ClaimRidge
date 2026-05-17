import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from core.database import supabase
from core.security import get_current_user
from services import audit

logger = logging.getLogger(__name__)

class ReviewRequest(BaseModel):
    action: str
    reason: str

# Dedicated router for Pre-Auth management and dashboard operations
router = APIRouter(prefix="/api/pre-auth", tags=["pre-auth"])

@router.get("/queue")
async def get_pre_auth_queue(current_user = Depends(get_current_user)):
    """
    Fetches the Pre-Authorisation queue for the currently logged-in insurer.
    Used by the Medical Officers to see incoming cases and SLA timers.
    """
    # 1. Get the current user's profile to find their insurer_id
    profile_res = supabase.table("profiles").select("insurer_id, role").eq("id", current_user.id).execute()
    
    if not profile_res.data or not profile_res.data[0].get("insurer_id"):
        raise HTTPException(status_code=403, detail="User is not associated with an insurer.")
        
    insurer_id = profile_res.data[0]["insurer_id"]
    
    # 2. Fetch the pre-auths for this insurer, ordered by SLA deadline (most urgent first)
    try:
        queue_res = supabase.table("pre_auth_requests").select(
            "id, reference_number, provider_name, patient_name, patient_id, claim_amount, status, sla_deadline, created_at"
        ).eq("insurer_id", insurer_id).order("created_at", desc=True).execute()
        
        return {"status": "success", "data": queue_res.data}
    except Exception as e:
        logger.error(f"Failed to fetch pre-auth queue for insurer {insurer_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch pre-auth queue.")


@router.get("/{id}")
async def get_pre_auth_detail(id: str, current_user = Depends(get_current_user)):
    """Returns a single pre-auth request plus its documents, scoped to the
    caller's insurer. The insurer review page uses this instead of a direct
    Supabase read: `pre_auth_requests` has no RLS read policy, so a browser
    query returns zero rows. Running it here with the service role (and a
    tenant check in code) is consistent with the queue endpoint."""
    profile_res = supabase.table("profiles").select("insurer_id").eq("id", current_user.id).execute()
    if not profile_res.data or not profile_res.data[0].get("insurer_id"):
        raise HTTPException(status_code=403, detail="User is not associated with an insurer.")
    insurer_id = profile_res.data[0]["insurer_id"]

    # Strictly match insurer_id so a reviewer cannot open another company's request.
    req_res = (
        supabase.table("pre_auth_requests")
        .select("*")
        .eq("id", id)
        .eq("insurer_id", insurer_id)
        .maybe_single()
        .execute()
    )
    if not req_res or not getattr(req_res, "data", None):
        raise HTTPException(status_code=404, detail="Pre-authorisation request not found.")

    try:
        docs_res = (
            supabase.table("pre_auth_documents")
            .select("*")
            .eq("pre_auth_id", id)
            .execute()
        )
        documents = docs_res.data or []
    except Exception as e:
        logger.error(f"Failed to fetch documents for pre-auth {id}: {e}")
        documents = []

    return {"request": req_res.data, "documents": documents}


@router.post("/{id}/review")
async def review_pre_auth(id: str, payload: ReviewRequest, current_user = Depends(get_current_user)):
    """Records the insurer reviewer's binding decision on a pre-auth request.

    The decision is binary — approve or deny. Approval activates the
    authorisation (stamps the validity window + approved-procedure scope onto
    the request's existing reference); denial revokes any authorisation that
    was activated earlier. The AI's recommendation is advisory only and never
    decides the request.
    """
    # 1. Verify the caller is linked to an insurer
    profile_res = supabase.table("profiles").select("insurer_id").eq("id", current_user.id).execute()
    if not profile_res.data or not profile_res.data[0].get("insurer_id"):
        raise HTTPException(status_code=403, detail="Unauthorized")

    insurer_id = profile_res.data[0]["insurer_id"]

    # 2. Normalise the decision to approve | deny
    raw = (payload.action or "").strip().lower()
    if raw in {"approve", "approved"}:
        decision, new_status = "approve", "approved"
    elif raw in {"deny", "denied", "reject", "rejected"}:
        decision, new_status = "deny", "denied"
    else:
        raise HTTPException(status_code=400, detail="action must be 'approve' or 'deny'.")

    # 3. Update the request status. We strictly match insurer_id so a reviewer
    #    cannot decide another company's requests.
    update_res = supabase.table("pre_auth_requests").update({
        "status": new_status,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }).eq("id", id).eq("insurer_id", insurer_id).execute()

    if not update_res.data:
        raise HTTPException(status_code=404, detail="Request not found or unauthorized.")

    # 4. Approve → activate the authorisation on the request's existing
    #    reference. Deny → revoke any authorisation activated earlier.
    authorization: dict | None = None
    try:
        from services.authorization import activate_authorization, revoke_authorization
        if decision == "approve":
            authorization = activate_authorization(id)
        else:
            revoke_authorization(id)
    except Exception as e:
        logger.error(f"Authorization handling failed for pre-auth {id}: {e}")

    # 5. Immutable, hash-chained audit event
    audit.record_event(
        action=f"pre_auth_{new_status}",
        category="decision",
        actor_id=current_user.id,
        tenant_type="insurer",
        tenant_id=insurer_id,
        target_type="pre_auth",
        target_id=id,
        summary=f"Pre-auth manually {new_status} by reviewer",
        metadata={
            "decision": decision,
            "reason": payload.reason,
            "authorization_activated": bool(authorization),
        },
    )

    return {
        "status": "success",
        "message": f"Request {new_status}.",
        "authorization": authorization,
    }