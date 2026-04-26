import logging
from fastapi import APIRouter, Depends, HTTPException
from typing import Optional
from core.security import get_current_user
from core.database import supabase
from pydantic import BaseModel
from services.ai_services import generate_medical_recommendation
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/insurer", tags=["insurer"])

class ReviewClaimRequest(BaseModel):
    claim_id: str
    action: str
    reason: Optional[str] = None

@router.get("/dashboard/claims")
async def get_insurer_claims(current_user = Depends(get_current_user)):
    """Fetches all claims routed to the currently logged-in insurance company."""
    
    # 1. Verify this user is actually an insurance company
    profile_res = supabase.table("profiles").select("id, account_type").eq("id", current_user.id).execute()
    
    if not profile_res.data or profile_res.data[0].get("account_type") != "insurance":
        logger.warning(f"User {current_user.id} attempted to access insurer dashboard but is not an insurer.")
        raise HTTPException(status_code=403, detail="Not authorized as an insurer")
    
    insurer_id = profile_res.data[0]["id"]

    # 2. Fetch all claims where payer_id matches this insurer
    # We order by created_at descending so the newest claims appear first
    try:
        claims_res = supabase.table("claims").select("*").eq("payer_id", insurer_id).order("created_at", desc=True).execute()
        return claims_res.data
    except Exception as e:
        logger.error(f"Failed to fetch claims for insurer {insurer_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch dashboard claims")

@router.post("/review-claim")
async def review_claim(payload: ReviewClaimRequest, current_user = Depends(get_current_user)):
    """Handles manual approvals, rejections, and info requests by a human Medical Officer."""
    logger.info(f"Review request from {current_user.id}, claim: {payload.claim_id}, action: {payload.action}")
    
    # 1. Verify user is actually an insurer
    profile_res = supabase.table("profiles").select("id, account_type").eq("id", current_user.id).execute()
    if not profile_res.data or profile_res.data[0].get("account_type") != "insurance":
        raise HTTPException(status_code=403, detail="Not authorized as an insurer")
        
    insurer_id = profile_res.data[0]["id"]

    # 2. Update the Claim
    update_data = {
        "status": payload.action,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    # If they provided a reason (mandatory for rejection, optional for others), save it in notes
    if payload.reason:
        update_data["notes"] = payload.reason
        
    # We add .eq("payer_id", insurer_id) as a strict security measure so they can't edit other payers' claims
    update_res = supabase.table("claims").update(update_data).eq("id", payload.claim_id).eq("payer_id", insurer_id).execute()
    
    if not update_res.data:
        raise HTTPException(status_code=404, detail="Claim not found or you do not have permission to review it.")

    # 3. Create Immutable Audit Log (Module 10 Requirement)
    try:
        import hashlib
        import json
        payload_hash = hashlib.sha256(json.dumps(payload.dict()).encode()).hexdigest()
        
        supabase.table("audit_log").insert({
            "actor_id": current_user.id,
            "action": f"manual_review_{payload.action}",
            "target_id": payload.claim_id,
            "target_type": "claim",
            "payload_hash": payload_hash
        }).execute()
    except Exception as e:
        logger.error(f"Failed to create audit log for claim {payload.claim_id}: {e}")

    return {"status": "success", "claim": update_res.data[0]}

@router.post("/claims/{claim_id}/analyze")
async def analyze_claim_medical_necessity(claim_id: str, current_user = Depends(get_current_user)):
    """Triggers the LLM to generate a clinical medical necessity recommendation."""
    
    # 1. Fetch the claim
    claim_res = supabase.table("claims").select("*").eq("id", claim_id).execute()
    if not claim_res.data:
        raise HTTPException(status_code=404, detail="Claim not found")
        
    claim_data = claim_res.data[0]
    
    # 2. Run the AI Clinical Engine
    recommendation_text = await generate_medical_recommendation(claim_data)
    
    # 3. Save the result to the database
    update_res = supabase.table("claims").update({
        "ai_recommendation": recommendation_text
    }).eq("id", claim_id).execute()
    
    if not update_res.data:
        raise HTTPException(status_code=500, detail="Failed to save AI recommendation")
        
    # Log the AI inference for Compliance (Module 10 Requirement)
    try:
        supabase.table("ai_inference_log").insert({
            "claim_id": claim_id,
            "model_version": "claude-3-haiku-20240307",
            "prompt_template_name": "medical_necessity_review",
            "input_data": {"dx": claim_data.get("diagnosis_codes"), "cpt": claim_data.get("procedure_codes")},
            "output_data": {"recommendation": recommendation_text}
        }).execute()
    except Exception as e:
        logger.error(f"Failed to log AI inference: {e}")
        
    return {"status": "success", "ai_recommendation": recommendation_text}