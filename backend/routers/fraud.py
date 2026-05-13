from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List
from core.database import supabase
from core.security import get_current_user
from services.case_engine import generate_fraud_case_file, persist_fraud_case
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/fraud", tags=["fraud-engine"])


class CaseFileRequest(BaseModel):
    claim_id: str
    fraud_score: float
    flags: List[str]


@router.post("/generate-case")
async def generate_case_file(req: CaseFileRequest, current_user=Depends(get_current_user)):
    """
    Generates a comprehensive, bilingual Fraud Case File for a flagged CLAIM.
    Scoped to the caller's insurer via the claim's payer_id.
    """
    try:
        # Resolve the insurer the caller is allowed to investigate for.
        prof_res = (
            supabase.table("profiles")
            .select("insurer_id, account_type")
            .eq("id", current_user.id)
            .maybe_single()
            .execute()
        )
        if not prof_res.data or prof_res.data.get("account_type") != "insurance":
            raise HTTPException(status_code=403, detail="Insurer access required.")
        caller_insurer_id = prof_res.data.get("insurer_id")

        # Verify the claim belongs to this insurer.
        claim_res = (
            supabase.table("claims")
            .select("id, payer_id")
            .eq("id", req.claim_id)
            .maybe_single()
            .execute()
        )
        if not claim_res.data:
            raise HTTPException(status_code=404, detail="Claim not found.")
        if claim_res.data.get("payer_id") != caller_insurer_id:
            raise HTTPException(status_code=403, detail="Claim is not assigned to your insurer.")

        case_file = await generate_fraud_case_file(
            claim_id=req.claim_id,
            fraud_score=req.fraud_score,
            anomaly_flags=req.flags,
        )

        if "error" in case_file:
            raise HTTPException(status_code=500, detail=case_file["error"])

        case_id = await persist_fraud_case(
            claim_id=req.claim_id,
            insurer_id=caller_insurer_id,
            fraud_score=req.fraud_score,
            anomaly_flags=req.flags,
            case_file=case_file,
        )

        return {"status": "success", "case_id": case_id, "data": case_file}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to generate case file: {e}")
        raise HTTPException(status_code=500, detail=str(e))
