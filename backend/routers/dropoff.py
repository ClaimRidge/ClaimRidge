import logging
import uuid
import time
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from core.database import supabase
from services.ai_services import extract_text_from_file, evaluate_pre_auth, process_pre_auth_case

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/dropoff", tags=["dropoff"])

# --- Pydantic Models ---
class DropoffAttachment(BaseModel):
    file_name: str
    content_type: str
    content: str  # Base64 encoded string

class DropoffRequest(BaseModel):
    insurer_id: str
    attachments: List[DropoffAttachment]
    # Patient/provider info is now extracted from the uploaded documents server-side.
    # Kept optional for backwards compatibility / future API clients that want to
    # pre-populate before extraction overwrites with values from the docs.
    provider_name: Optional[str] = None
    patient_name: Optional[str] = None
    patient_id: Optional[str] = None

def generate_reference():
    return f"PA-{int(time.time())}-{str(uuid.uuid4())[:4].upper()}"

@router.get("/insurers")
async def get_public_insurers():
    """Fetches real, registered insurance companies from the insurers table."""
    try:
        res = supabase.table("insurers").select("id, name, commercial_license_number").execute()
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
    """Handles the form submission from the Drop-Off Portal.
    Patient / provider details are extracted from the uploaded documents in the
    background OCR step (process_pre_auth_case). The placeholders below are
    overwritten once extraction completes."""
    if not payload.attachments:
        raise HTTPException(status_code=400, detail="At least one document is required.")

    logger.info(
        f"Received Drop-Off request: {len(payload.attachments)} document(s) "
        f"for insurer {payload.insurer_id}"
    )

    ref_number = generate_reference()
    sla_deadline = datetime.now(timezone.utc) + timedelta(hours=24)

    # 1. Create the Pre-Auth Record with placeholder identity fields. The
    #    metadata extraction step will overwrite these once OCR is done.
    insert_res = supabase.table("pre_auth_requests").insert({
        "insurer_id": payload.insurer_id,
        "reference_number": ref_number,
        "provider_name": payload.provider_name or "Pending extraction",
        "patient_name": payload.patient_name or "Pending extraction",
        "patient_id": payload.patient_id or "Pending extraction",
        "claim_amount": 0.0,
        "status": "processing",
        "sla_deadline": sla_deadline.isoformat(),
    }).execute()
    
    if not insert_res.data:
        raise HTTPException(status_code=500, detail="Failed to create pre-auth request")
        
    pre_auth_id = insert_res.data[0]["id"]

    # 2. Insert Documents Immediately (for instant viewing)
    doc_payloads = []
    attachments_data = []
    for att in payload.attachments:
        doc_payloads.append({
            "pre_auth_id": pre_auth_id,
            "file_name": att.file_name,
            "file_type": att.content_type,
            "extracted_text": "", # Will be filled by background task
            "file_base64": att.content
        })
        # Save attachment data for background OCR
        attachments_data.append({
            "file_name": att.file_name,
            "content_type": att.content_type,
            "content": att.content
        })

    if doc_payloads:
        try:
            supabase.table("pre_auth_documents").insert(doc_payloads).execute()
        except Exception as e:
            # If the column is missing, try inserting without the base64 content
            if "file_base64" in str(e):
                logger.warning("Database column 'file_base64' is missing. Documents will be stored without previews. Please run the SQL migration.")
                for doc in doc_payloads:
                    doc.pop("file_base64", None)
                supabase.table("pre_auth_documents").insert(doc_payloads).execute()
            else:
                raise e

    # 3. Trigger Background OCR and Analysis
    background_tasks.add_task(process_pre_auth_case, pre_auth_id, payload.insurer_id, attachments_data)
    
    return {"status": "success", "reference_number": ref_number}