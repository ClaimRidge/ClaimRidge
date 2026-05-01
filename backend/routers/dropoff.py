import logging
import uuid
import time
from datetime import datetime, timedelta, timezone
from typing import List
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from core.database import supabase
from services.ai_services import extract_text_from_file, evaluate_pre_auth

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/dropoff", tags=["dropoff"])

# --- Pydantic Models ---
class DropoffAttachment(BaseModel):
    file_name: str
    content_type: str
    content: str  # Base64 encoded string

class DropoffRequest(BaseModel):
    insurer_id: str
    provider_name: str
    patient_name: str
    patient_id: str
    attachments: List[DropoffAttachment]

def generate_reference():
    return f"PA-{int(time.time())}-{str(uuid.uuid4())[:4].upper()}"

@router.get("/insurers")
async def get_public_insurers():
    """Fetches real, registered insurance companies from the insurers table."""
    try:
        res = supabase.table("insurers").select("id, name, license_number").execute()
        if not res.data:
            return []
        
        return res.data
    except Exception as e:
        logger.error(f"Failed to fetch insurers: {e}")
        return []
    except Exception as e:
        logger.error(f"Failed to fetch insurers: {e}")
        return []

@router.post("/")
async def submit_dropoff(payload: DropoffRequest, background_tasks: BackgroundTasks):
    """Handles the form submission from the Drop-Off Portal."""
    logger.info(f"Received Drop-Off request for patient {payload.patient_name} to insurer {payload.insurer_id}")
    
    ref_number = generate_reference()
    sla_deadline = datetime.now(timezone.utc) + timedelta(hours=24)
    
    # 1. Create the Pre-Auth Record
    insert_res = supabase.table("pre_auth_requests").insert({
        "insurer_id": payload.insurer_id,
        "reference_number": ref_number,
        "provider_name": payload.provider_name,
        "patient_name": payload.patient_name,
        "patient_id": payload.patient_id,
        "requested_amount": 0.0,
        "status": "processing",
        "sla_deadline": sla_deadline.isoformat(),
    }).execute()
    
    if not insert_res.data:
        raise HTTPException(status_code=500, detail="Failed to create pre-auth request")
        
    pre_auth_id = insert_res.data[0]["id"]

    # 2. Process Attachments Synchronously
    for att in payload.attachments:
        try:
            extracted_text = await extract_text_from_file(att.content, att.content_type)
            supabase.table("pre_auth_documents").insert({
                "pre_auth_id": pre_auth_id,
                "file_name": att.file_name,
                "file_type": att.content_type,
                "extracted_text": extracted_text
            }).execute()
        except Exception as e:
            logger.error(f"Failed to process attachment {att.file_name}: {e}")

    # 3. Trigger AI Triage Reasoning in background
    background_tasks.add_task(evaluate_pre_auth, pre_auth_id, payload.insurer_id)
    
    return {"status": "success", "reference_number": ref_number}