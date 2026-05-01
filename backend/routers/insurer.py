import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from core.security import get_current_user
from core.database import supabase

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/insurer", tags=["insurer"])

class PolicyUploadRequest(BaseModel):
    policy_file_base64: str

@router.post("/process-policy")
async def process_policy(payload: PolicyUploadRequest, current_user = Depends(get_current_user)):
    """Receives the PDF directly in the request body, chunks it, and embeds it."""
    
    # 1. Verify user is linked to an insurer and get their insurer_id
    profile_res = supabase.table("profiles").select("insurer_id").eq("id", current_user.id).execute()
    if not profile_res.data or not profile_res.data[0].get("insurer_id"):
        raise HTTPException(status_code=403, detail="Not authorized. No insurer linked to profile.")
        
    insurer_id = profile_res.data[0]["insurer_id"]

    if not payload.policy_file_base64:
        raise HTTPException(status_code=400, detail="No policy document provided in request.")

    # 2. Process and Embed (Directly passing the payload string)
    try:
        from services.ai_services import process_and_embed_policy_file
        await process_and_embed_policy_file(insurer_id, payload.policy_file_base64)
        return {"status": "success", "message": "Policy successfully embedded for AI Adjudication."}
    except Exception as e:
        logger.error(f"Failed to process policy for {insurer_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to process policy document.")