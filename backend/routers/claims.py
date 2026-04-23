from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import json
import time
import random
import string
from core.security import get_current_user
from core.database import supabase
from services.ai_services import extract_claim_data_via_llm, scrub_claim_via_llm

# --- Pydantic Models ---
class ExtractRequest(BaseModel):
    fileBase64: str
    mediaType: str
    fileName: str

class ClaimFormData(BaseModel):
    patient_name: str
    patient_id: str
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
    if not payload.fileBase64 or not payload.mediaType:
        raise HTTPException(status_code=400, detail="Missing file data or media type")

    try:
        extracted = await extract_claim_data_via_llm(payload.fileBase64, payload.mediaType)
        return {"extracted": extracted, "fileName": payload.fileName}
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not parse the document: {str(e)}")

@router.post("/scrub")
async def scrub_claim(claim_data: ClaimFormData, current_user = Depends(get_current_user)):
    user_id = current_user.id
    
    # 1. Save Initial Draft Claim to DB
    claim_payload = claim_data.model_dump()
    claim_payload.update({
        "user_id": user_id,
        "clinic_id": user_id,
        "status": "draft",
        "claim_number": generate_claim_number()
    })
    
    insert_res = supabase.table("claims").insert(claim_payload).execute()
    if not insert_res.data:
        raise HTTPException(status_code=500, detail="Failed to save claim")
    
    claim_id = insert_res.data[0]["id"]
    
    # 2. Process via AI Service
    try:
        claim_json_str = json.dumps(claim_data.model_dump(), indent=2)
        scrub_result = await scrub_claim_via_llm(claim_json_str)
    except Exception as e:
        scrub_result = {
            "status": "warnings", 
            "overall_score": 70, 
            "issues": [{
                "field": "general", 
                "severity": "warning", 
                "message": f"AI scrubbing completed but response parsing failed. Error: {str(e)}", 
                "suggestion": "Please review the claim manually or try re-scrubbing."
            }],
            "corrected_claim": claim_data.model_dump(),
            "recommendations": ["Manual review recommended due to processing irregularity."]
        }
    
    # 3. Update the Claim with Scrub Results
    supabase.table("claims").update({
        "status": "submitted",
        "scrub_result": scrub_result,
        "scrub_passed": scrub_result.get("status") == "clean",
        "scrub_warnings": len(scrub_result.get("issues", []))
    }).eq("id", claim_id).execute()

    # 4. Trigger Internal Auto-Adjudicate
    from routers.insurer import run_auto_adjudicate
    await run_auto_adjudicate(claim_id, user_id)
    
    # 5. Insert Audit Trail
    claim_reference = f"CR-{claim_id[:8].upper()}"
    audit_payload = {
        "user_id": user_id,
        "claim_reference_number": claim_reference,
        "patient_name": claim_data.patient_name,
        "date_of_service": claim_data.date_of_service or None,
        "provider_name": claim_data.provider_name,
        "payer_name": claim_data.payer_name,
        "diagnosis_codes": [c for c in claim_data.diagnosis_codes if c],
        "procedure_codes": [c for c in claim_data.procedure_codes if c],
        "billed_amount": claim_data.billed_amount,
        "ai_flags": scrub_result.get("issues", []),
        "ai_corrections": scrub_result.get("corrected_claim", {}),
        "export_count": 0,
    }
    
    try:
        supabase.table("claims_audit").insert(audit_payload).execute()
    except Exception as e:
        print(f"[AUDIT] Insert failed: {e}")
    
    return {"id": claim_id, **scrub_result}

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