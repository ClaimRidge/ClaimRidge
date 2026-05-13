import logging
import uuid
import time
import random
import string
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, model_validator
from typing import List, Optional, Dict, Any
from core.security import get_current_user
from core.database import supabase
from services.ai_services import extract_claim_from_document

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/intake", tags=["intake"])

# --- 1. The Normalized Schema ---
class StandardizedClaim(BaseModel):
    provider_id: str
    payer_id: str
    member_id: str
    patient_name: str
    patient_id: str
    service_date: str
    total_billed: float
    diagnosis_codes: List[str]
    procedure_codes: List[str]
    currency: str = "JOD"
    notes: Optional[str] = ""
    # NEW: Accept confidence scores
    confidence_scores: Optional[Dict[str, Any]] = {}

    # 2. Completeness Check Engine
    @model_validator(mode='after')
    def check_completeness(self) -> 'StandardizedClaim':
        if not self.diagnosis_codes or len(self.diagnosis_codes) == 0:
            raise ValueError('Completeness Check Failed: At least one diagnosis code is required.')
        if not self.procedure_codes or len(self.procedure_codes) == 0:
            raise ValueError('Completeness Check Failed: At least one procedure code is required.')
        if self.total_billed <= 0:
            raise ValueError('Completeness Check Failed: Total billed must be greater than 0.')
        return self

class DocumentIntakeRequest(BaseModel):
    fileBase64: str
    mediaType: str
    fileName: str

def generate_claim_number():
    timestamp = str(int(time.time() * 1000))
    rand_str = ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))
    return f"CR-{timestamp}-{rand_str}"

# --- 3. Structured API Intake ---
@router.post("/structured")
async def ingest_structured_claim(claim: StandardizedClaim, current_user = Depends(get_current_user)):
    """Receives clean JSON claims directly from Clinic APIs or EHRs."""
    from routers.claims import is_valid_uuid

    # 1. Resolve payer (registered insurer)
    resolved_payer_id = None
    if is_valid_uuid(claim.payer_id):
        resolved_payer_id = claim.payer_id
        logger.info(f"Received direct registered insurer UUID: {resolved_payer_id}")
    else:
        try:
            payer_search = supabase.table("insurers").select("id").ilike("name", claim.payer_id).execute()
            if payer_search.data:
                resolved_payer_id = payer_search.data[0]["id"]
                logger.info(f"Matched registered insurer by name: {resolved_payer_id}")
        except Exception as e:
            logger.warning(f"Registered payer lookup failed: {e}")

    # Resolve the submitter's primary provider org (clinic).
    resolved_clinic_id = None
    try:
        prof = supabase.table("profiles").select("provider_org_id").eq("id", current_user.id).maybe_single().execute()
        if prof.data and prof.data.get("provider_org_id"):
            resolved_clinic_id = prof.data["provider_org_id"]
    except Exception as e:
        logger.warning(f"Could not resolve provider org for user {current_user.id}: {e}")

    # 2. Deduplication
    existing = supabase.table("claims").select("id, claim_number").eq(
        "patient_id", claim.patient_id
    ).eq(
        "user_id", current_user.id
    ).eq(
        "date_of_service", claim.service_date
    ).eq(
        "total_billed", claim.total_billed
    ).execute()

    if existing.data and len(existing.data) > 0:
        logger.warning(f"Duplicate claim detected for patient {claim.patient_id}")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"message": "Duplicate claim detected", "existing_claim": existing.data[0]["claim_number"]}
        )

    # 3. Payload Assembly
    claim_id = str(uuid.uuid4())
    claim_number = generate_claim_number()

    claim_payload = {
        "id": claim_id,
        "claim_number": claim_number,
        "status": "intake_complete",
        "user_id": current_user.id,
        "clinic_id": resolved_clinic_id,
        "payer_id": resolved_payer_id,
        "member_id": claim.member_id,
        "patient_name": claim.patient_name,
        "patient_id": claim.patient_id,
        "date_of_service": claim.service_date,
        "payer_name": claim.payer_id,
        "provider_name": claim.provider_id,
        "diagnosis_codes": [c for c in claim.diagnosis_codes if c],
        "procedure_codes": [c for c in claim.procedure_codes if c],
        "total_billed": claim.total_billed,
        "currency": claim.currency,
        "notes": claim.notes,
    }

    # 4. Save to Database
    insert_res = supabase.table("claims").insert(claim_payload).execute()
    if not insert_res.data:
        raise HTTPException(status_code=500, detail="Failed to ingest claim into database")

    return {
        "status": "success",
        "message": "Claim successfully ingested and normalized",
        "claim_id": claim_id,
        "claim_number": claim_number,
        "intake_status": "intake_complete"
    }

# --- 4. Unstructured / Document Intake ---
@router.post("/document")
async def ingest_unstructured_claim(payload: DocumentIntakeRequest, current_user = Depends(get_current_user)):
    """Receives raw PDFs/Images from Emails or Portals and uses LLM to normalize them."""
    try:
        extracted = await extract_claim_from_document(payload.fileBase64, payload.mediaType)
        return {
            "status": "needs_review", 
            "extracted_data": extracted, 
            "message": "Document parsed. Please review and submit via structured endpoint."
        }
    except ValueError as ve:
        logger.error(f"AI structured extraction failed: {str(ve)}")
        raise HTTPException(status_code=422, detail="The AI failed to format the document properly. Please re-upload.")
    except Exception as e:
        logger.error(f"Document ingestion failed: {str(e)}")
        raise HTTPException(status_code=500, detail="LLM Normalizer failed to process document.")