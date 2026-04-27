import logging
import uuid
import datetime
import time
import random
import string
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from core.security import get_current_user
from core.database import supabase

from services.ai_services import extract_claim_from_document, scrub_claim

logger = logging.getLogger(__name__)

# --- Pydantic Models ---
class ExtractRequest(BaseModel):
    fileBase64: str
    mediaType: str
    fileName: str

class ClaimFormData(BaseModel):
    patient_name: str
    patient_id: str
    member_id: Optional[str] = None
    date_of_service: str
    provider_name: str
    provider_id: str
    payer_name: str
    payer_id: str
    diagnosis_codes: List[str]
    procedure_codes: List[str]
    billed_amount: float
    notes: Optional[str] = ""
    # NEW: Accept confidence scores from frontend to track AI performance
    confidence_scores: Optional[Dict[str, Any]] = {}

# --- Router ---
router = APIRouter(prefix="/api/claims", tags=["claims"])

def generate_claim_number():
    timestamp = str(int(time.time() * 1000))
    rand_str = ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))
    return f"CLM-{timestamp}-{rand_str}"

def is_valid_uuid(val):
    try:
        uuid.UUID(str(val))
        return True
    except:
        return False

@router.post("/extract")
async def extract_claim(payload: ExtractRequest, current_user = Depends(get_current_user)):
    logger.info(f"Extract claim request from user {current_user.id}, file: {payload.fileName}")
    if not payload.fileBase64 or not payload.mediaType:
        raise HTTPException(status_code=400, detail="Missing file data or media type")

    try:
        # This now returns the nested structure: {"patient_name": {"value": "X", "confidence": 90}}
        extracted = await extract_claim_from_document(payload.fileBase64, payload.mediaType)
        return {"extracted": extracted, "fileName": payload.fileName}
    except ValueError as ve:
        # Catches strict LangChain Pydantic parsing failures
        logger.error(f"AI structured extraction failed: {str(ve)}")
        raise HTTPException(status_code=422, detail="The AI failed to read the document clearly. Please enter manually.")
    except Exception as e:
        logger.error(f"Document extraction failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal processing error: {str(e)}")

@router.post("/scrub")
async def scrub_claim_endpoint(claim_data: ClaimFormData, current_user = Depends(get_current_user)):
    user_id = current_user.id
    claim_number = generate_claim_number()
    
    # 1. Resolve Entities dynamically against the 'profiles' table
    resolved_payer_id = None
    
    if is_valid_uuid(claim_data.payer_id):
        resolved_payer_id = claim_data.payer_id
    else:
        try:
            payer_search = supabase.table("profiles").select("id").eq("account_type", "insurance").ilike("organization_name", claim_data.payer_name).execute()
            if payer_search.data:
                resolved_payer_id = payer_search.data[0]["id"]
        except Exception as e:
            logger.warning(f"Registered payer lookup failed: {e}")

    resolved_provider_id = current_user.id

    # 2. Build the Payload
    claim_payload = {
        "id": str(uuid.uuid4()), 
        "claim_number": claim_number,
        "status": "pending",
        "user_id": user_id,
        "clinic_id": user_id,       
        "provider_id": resolved_provider_id, 
        "payer_id": resolved_payer_id,       
        "patient_name": claim_data.patient_name,
        "patient_id": claim_data.patient_id,
        "member_id": claim_data.member_id or claim_data.payer_id, 
        "date_of_service": claim_data.date_of_service or str(datetime.date.today()),
        "payer_name": claim_data.payer_name,
        "provider_name": claim_data.provider_name,
        "diagnosis_codes": claim_data.diagnosis_codes,
        "procedure_codes": claim_data.procedure_codes,
        "billed_amount": claim_data.billed_amount or 0,
        "total_billed": claim_data.billed_amount or 0,
        "currency": "JOD",
        "notes": claim_data.notes or "",
        "scrub_result": {
            "extraction_confidence": claim_data.confidence_scores
        }
    }
    
    insert_res = supabase.table("claims").insert(claim_payload).execute()
    if not insert_res.data:
        raise HTTPException(status_code=500, detail="Failed to save claim to database")

    db_generated_id = insert_res.data[0]["id"]

    # 3. Process via AI Service
    try:
        scrub_dict = claim_data.model_dump(exclude={"confidence_scores"})
        scrub_result = await scrub_claim(scrub_dict, registered_payer_id=resolved_payer_id)
    except Exception as e:
        logger.error(f"AI scrub failed: {e}")
        scrub_result = {"status": "error", "issues": [{"message": str(e)}], "overall_score": 0}
    
    # 4. Update with Results using the exact Database ID
    final_result = {
        **scrub_result,
        "extraction_confidence": claim_data.confidence_scores
    }
    
    supabase.table("claims").update({
        "status": "submitted",
        "scrub_result": final_result,
        "ai_risk_score": scrub_result.get("overall_score", 0)
    }).eq("id", db_generated_id).execute()

    # 5. Insert Audit Trail
    try:
        claim_reference = f"CR-{db_generated_id[:8].upper()}"
        audit_payload = {
            "user_id": user_id,
            "claim_reference_number": claim_reference,
            "patient_name": claim_data.patient_name,
            "date_of_service": claim_data.date_of_service or None,
            "provider_name": claim_data.provider_name,
            "payer_name": claim_data.payer_name,
            "diagnosis_codes": [c for c in claim_data.diagnosis_codes if c],
            "procedure_codes": [c for c in claim_data.procedure_codes if c],
            "billed_amount": claim_data.billed_amount or 0,
            "ai_flags": scrub_result.get("issues", []),
            "ai_corrections": scrub_result.get("corrected_claim", {}),
            "export_count": 0,
        }
        supabase.table("claims_audit").insert(audit_payload).execute()
    except Exception as e:
        logger.error(f"[AUDIT] Insert failed: {e}")

    return {
        **scrub_result,
        "id": db_generated_id, 
        "claim_number": claim_number
    }

@router.post("/{id}/track-export")
async def track_export(id: str, current_user = Depends(get_current_user)):
    reference = f"CR-{id[:8].upper()}"
    res = supabase.table("claims_audit").select("id, export_count").eq("claim_reference_number", reference).eq("user_id", current_user.id).execute()
    
    if not res.data:
        raise HTTPException(status_code=404, detail="Audit row not found")
        
    row = res.data[0]
    new_count = (row.get("export_count") or 0) + 1
    
    supabase.table("claims_audit").update({"export_count": new_count}).eq("id", row["id"]).execute()
    return {"export_count": new_count}