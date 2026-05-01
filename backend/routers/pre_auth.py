import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from core.database import supabase
from core.security import get_current_user

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
            "id, reference_number, provider_name, patient_name, patient_id, requested_amount, status, sla_deadline, ai_decision, created_at"
        ).eq("insurer_id", insurer_id).order("sla_deadline", desc=False).execute()
        
        return {"status": "success", "data": queue_res.data}
    except Exception as e:
        logger.error(f"Failed to fetch pre-auth queue for insurer {insurer_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch pre-auth queue.")

@router.post("/{id}/review")
async def review_pre_auth(id: str, payload: ReviewRequest, current_user = Depends(get_current_user)):
    """
    Called by the Medical Officer to finalize a decision on a Pre-Auth request.
    """
    # 1. Verify user is linked to an insurer
    profile_res = supabase.table("profiles").select("insurer_id").eq("id", current_user.id).execute()
    if not profile_res.data or not profile_res.data[0].get("insurer_id"):
        raise HTTPException(status_code=403, detail="Unauthorized")
        
    insurer_id = profile_res.data[0]["insurer_id"]

    # 2. Update the Pre-Auth status
    # We strictly match insurer_id to prevent users from approving other companies' requests
    update_res = supabase.table("pre_auth_requests").update({
        "status": payload.action,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }).eq("id", id).eq("insurer_id", insurer_id).execute()

    if not update_res.data:
        raise HTTPException(status_code=404, detail="Request not found or unauthorized.")

    # 3. Create an Immutable Audit Log
    try:
        import hashlib
        import json
        payload_hash = hashlib.sha256(json.dumps(payload.dict()).encode()).hexdigest()
        
        supabase.table("audit_log").insert({
            "actor_id": current_user.id,
            "action": f"manual_pre_auth_{payload.action}",
            "target_id": id,
            "target_type": "pre_auth_request",
            "payload_hash": payload_hash
        }).execute()
    except Exception as e:
        logger.error(f"Failed to create audit log for pre-auth {id}: {e}")

    return {"status": "success", "message": f"Request {payload.action}d successfully."}