import logging
from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from core.security import get_current_user
from core.database import supabase
from pydantic import BaseModel
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

# --- We will rebuild the Adjudication logic in Phase 3/Module 6! ---
@router.post("/review-claim")
async def review_claim(payload: ReviewClaimRequest, current_user = Depends(get_current_user)):
    # Placeholder for Module 4 (Human Workbench)
    return {"status": "Not Implemented Yet. Building in Module 4."}