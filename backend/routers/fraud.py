from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List
from services.case_engine import generate_fraud_case_file
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/fraud", tags=["fraud-engine"])

class CaseFileRequest(BaseModel):
    pre_auth_id: str
    fraud_score: float
    flags: List[str]

@router.post("/generate-case")
async def generate_case_file(req: CaseFileRequest):
    """
    Generates a comprehensive, bilingual Fraud Case File for a flagged Pre-Auth.
    """
    try:
        case_file = await generate_fraud_case_file(
            pre_auth_id=req.pre_auth_id, 
            fraud_score=req.fraud_score, 
            anomaly_flags=req.flags
        )
        
        if "error" in case_file:
            raise HTTPException(status_code=500, detail=case_file["error"])
            
        return {"status": "success", "data": case_file}
    except Exception as e:
        logger.error(f"Failed to generate case file: {e}")
        raise HTTPException(status_code=500, detail=str(e))