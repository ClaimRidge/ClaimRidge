import logging
import uuid
import datetime
import json
import time
import random
import string
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from core.security import get_current_user
from core.database import supabase

# Updated imports matching the new ai_services.py
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

# --- Router ---
router = APIRouter(prefix="/api/claims", tags=["claims"])

def generate_claim_number():
    timestamp = str(int(time.time() * 1000))
    rand_str = ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))
    return f"CLM-{timestamp}-{rand_str}"

@router.post("/extract")
async def extract_claim(payload: ExtractRequest, current_user = Depends(get_current_user)):
    logger.info(f"Extract claim request from user {current_user.id}, file: {payload.fileName}")
    if not payload.fileBase64 or not payload.mediaType:
        logger.warning("Extract claim request missing file data or media type")
        raise HTTPException(status_code=400, detail="Missing file data or media type")

    try:
        logger.debug(f"Processing document extraction with media type: {payload.mediaType}")
        # Calls the updated function with base64 and mediaType
        extracted = await extract_claim_from_document(payload.fileBase64, payload.mediaType)
        logger.info(f"Successfully extracted claim data from {payload.fileName}")
        return {"extracted": extracted, "fileName": payload.fileName}
    except Exception as e:
        logger.error(f"Document extraction failed: {str(e)}")
        raise HTTPException(status_code=422, detail=f"Could not parse the document: {str(e)}")

@router.post("/scrub")
async def scrub_claim_endpoint(claim_data: ClaimFormData, current_user = Depends(get_current_user)):
    user_id = current_user.id
    logger.info(f"Scrub claim request from user {user_id}, patient: {claim_data.patient_name}")
    
    # 1. Resolve Entities (Payer/Provider)
    payer_id = None
    provider_id = None

    try:
        # Search for existing insurer
        payer_search = supabase.table("directory_entities") \
            .select("id") \
            .eq("entity_type", "insurer") \
            .ilike("name_en", claim_data.payer_name) \
            .execute()
        if payer_search.data:
            payer_id = payer_search.data[0]["id"]
            
        # Search for existing provider
        provider_search = supabase.table("directory_entities") \
            .select("id") \
            .eq("entity_type", "clinic") \
            .ilike("name_en", claim_data.provider_name) \
            .execute()
        if provider_search.data:
            provider_id = provider_search.data[0]["id"]
    except Exception as e:
        logger.warning(f"Lookup failed, proceeding with raw names: {e}")

    # 2. Build the Payload
    # We manually map fields to ensure they match your SQL schema exactly
    claim_number = generate_claim_number()
    claim_payload = {
        "id": str(uuid.uuid4()), # Explicitly generate ID to use for updates later
        "claim_number": claim_number,
        "status": "intake_complete",
        "user_id": user_id,
        "clinic_id": user_id,
        "provider_id": provider_id, # Now allowed to be None by SQL update
        "payer_id": payer_id,       # Now allowed to be None by SQL update
        
        # Patient & Member Info
        "patient_name": claim_data.patient_name,
        "member_id": claim_data.member_id or claim_data.patient_id, 
        "date_of_service": claim_data.date_of_service or str(datetime.date.today()),
        
        # Raw Data (for non-directory entities)
        "payer_name": claim_data.payer_name,
        "provider_name": claim_data.provider_name,
        
        # Medical Info
        "diagnosis_codes": claim_data.diagnosis_codes,
        "procedure_codes": claim_data.procedure_codes,
        "total_billed": claim_data.billed_amount or 0,
        "currency": "JOD"
    }
    
    logger.debug(f"Inserting claim {claim_number} into Supabase")
    insert_res = supabase.table("claims").insert(claim_payload).execute()
    
    if not insert_res.data:
        raise HTTPException(status_code=500, detail="Failed to save claim to database")
    
    claim_id = insert_res.data[0]["id"]

    # 3. Process via AI Service
    try:
        scrub_result = await scrub_claim(claim_data.model_dump())
    except Exception as e:
        logger.error(f"AI scrub failed: {e}")
        scrub_result = {"status": "error", "issues": [{"message": str(e)}]}
    
    # 4. Update with Results
    supabase.table("claims").update({
        "status": "submitted",
        "scrub_result": scrub_result,
        "ai_risk_score": scrub_result.get("overall_score", 0)
    }).eq("id", claim_id).execute()

    # 5. Audit Log (Simplified for stability)
    try:
        audit_payload = {
            "user_id": user_id,
            "claim_reference_number": f"CR-{claim_number}",
            "patient_name": claim_data.patient_name,
            "payer_name": claim_data.payer_name,
            "billed_amount": claim_data.billed_amount
        }
        supabase.table("claims_audit").insert(audit_payload).execute()
    except Exception as e:
        logger.error(f"Audit failed: {e}")
    
    return {"id": claim_id, "claim_number": claim_number, **scrub_result}

@router.post("/{id}/track-export")
async def track_export(id: str, current_user = Depends(get_current_user)):
    logger.info(f"Track export request from user {current_user.id} for claim {id}")
    reference = f"CR-{id[:8].upper()}"
    res = supabase.table("claims_audit").select("id, export_count").eq("claim_reference_number", reference).eq("user_id", current_user.id).execute()
    
    if not res.data:
        logger.warning(f"Audit row not found for claim {reference}")
        raise HTTPException(status_code=404, detail="Audit row not found")
        
    row = res.data[0]
    new_count = (row.get("export_count") or 0) + 1
    
    logger.debug(f"Updating export count to {new_count} for claim {reference}")
    supabase.table("claims_audit").update({"export_count": new_count}).eq("id", row["id"]).execute()
    logger.info(f"Export tracked for claim {reference}, count: {new_count}")
    return {"export_count": new_count}