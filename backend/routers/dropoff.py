import logging
import uuid
import time
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from core.database import supabase
from core.security import get_current_user
from services.ai_services import process_pre_auth_case, extract_pre_auth_from_documents
from services import audit

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


class ProviderPreAuthRequest(BaseModel):
    """Authenticated provider/doctor submission. The submitter is taken from the
    JWT, not the payload. `insurer_id` is optional — if NULL, the request is
    created as `unrouted` and is not processed by AI.

    The structured fields below carry the pre-auth packet the submitter typed
    into the form. Anything left blank is filled later by the document extractor
    (see services/ai_services.process_pre_auth_case)."""
    insurer_id: Optional[str] = None
    payer_name_raw: Optional[str] = None  # free-text name when payer is out-of-network
    clinic_id: Optional[str] = None       # provider org submitting (for doctors with multi-org)
    attachments: List[DropoffAttachment]

    # Patient demographics
    patient_name: Optional[str] = None
    patient_id: Optional[str] = None
    patient_dob: Optional[str] = None
    patient_age: Optional[int] = None
    patient_gender: Optional[str] = None
    insurance_member_id: Optional[str] = None
    insurance_group_number: Optional[str] = None
    patient_phone: Optional[str] = None
    patient_address: Optional[str] = None

    # Provider information (ordering MD vs servicing facility)
    provider_name: Optional[str] = None
    ordering_provider_name: Optional[str] = None
    ordering_provider_npi: Optional[str] = None
    ordering_provider_tax_id: Optional[str] = None
    servicing_provider_name: Optional[str] = None
    servicing_provider_npi: Optional[str] = None
    servicing_provider_tax_id: Optional[str] = None

    # Clinical coding
    diagnosis_codes: Optional[List[str]] = None
    procedure_codes: Optional[List[str]] = None
    modifiers: Optional[str] = None
    ndc_code: Optional[str] = None

    # Service details
    place_of_service: Optional[str] = None
    anticipated_date_of_service: Optional[str] = None
    priority: Optional[str] = "Standard"  # 'Standard' | 'Expedited'


class ExtractDoc(BaseModel):
    fileBase64: str
    mediaType: str
    fileName: Optional[str] = "document"


class PreAuthExtractRequest(BaseModel):
    """Documents the provider/doctor drops off so the AI can auto-fill the form."""
    documents: List[ExtractDoc]


def generate_reference():
    return f"PA-{int(time.time())}-{str(uuid.uuid4())[:4].upper()}"


def _resolve_clinic_for_user(user_id: str, requested_clinic_id: Optional[str]) -> Optional[str]:
    """Resolves which provider_org the caller is submitting for. Validates that
    the doctor is actually linked to the requested org; falls back to their
    primary affiliation if not specified."""
    if requested_clinic_id:
        link = (
            supabase.table("doctor_org_links")
            .select("provider_org_id")
            .eq("doctor_id", user_id)
            .eq("provider_org_id", requested_clinic_id)
            .execute()
        )
        if link.data:
            return requested_clinic_id
        # Provider admins own their org via profiles.provider_org_id — allow that too.
        prof = (
            supabase.table("profiles")
            .select("provider_org_id, account_type")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        if prof.data and prof.data.get("provider_org_id") == requested_clinic_id:
            return requested_clinic_id
        # Otherwise the caller is trying to submit on behalf of an org they don't belong to.
        return None

    prof = (
        supabase.table("profiles")
        .select("provider_org_id")
        .eq("id", user_id)
        .maybe_single()
        .execute()
    )
    if prof.data and prof.data.get("provider_org_id"):
        return prof.data["provider_org_id"]
    return None


def _insert_documents(pre_auth_id: str, attachments: List[DropoffAttachment]) -> list:
    doc_payloads = []
    attachments_data = []
    for att in attachments:
        doc_payloads.append({
            "pre_auth_id": pre_auth_id,
            "file_name": att.file_name,
            "file_type": att.content_type,
            "extracted_text": "",
            "file_base64": att.content,
        })
        attachments_data.append({
            "file_name": att.file_name,
            "content_type": att.content_type,
            "content": att.content,
        })
    if doc_payloads:
        try:
            supabase.table("pre_auth_documents").insert(doc_payloads).execute()
        except Exception as e:
            if "file_base64" in str(e):
                logger.warning(
                    "Database column 'file_base64' is missing. Documents will be stored without previews."
                )
                for doc in doc_payloads:
                    doc.pop("file_base64", None)
                supabase.table("pre_auth_documents").insert(doc_payloads).execute()
            else:
                raise e
    return attachments_data


@router.get("/insurers")
async def get_public_insurers():
    """Fetches real, registered insurance companies from the insurers table."""
    try:
        res = supabase.table("insurers").select("id, name, commercial_license_number, country").execute()
        return res.data or []
    except Exception as e:
        logger.error(f"Failed to fetch insurers: {e}")
        return []


@router.post("/")
async def submit_dropoff(payload: DropoffRequest, background_tasks: BackgroundTasks):
    """Anonymous drop-off portal submission. Always routed (insurer_id required)."""
    if not payload.attachments:
        raise HTTPException(status_code=400, detail="At least one document is required.")

    logger.info(
        f"Received anonymous Drop-Off request: {len(payload.attachments)} document(s) "
        f"for insurer {payload.insurer_id}"
    )

    ref_number = generate_reference()
    sla_deadline = datetime.now(timezone.utc) + timedelta(hours=24)

    insert_res = supabase.table("pre_auth_requests").insert({
        "insurer_id": payload.insurer_id,
        "reference_number": ref_number,
        "provider_name": payload.provider_name or "Pending extraction",
        "patient_name": payload.patient_name or "Pending extraction",
        "patient_id": payload.patient_id or "Pending extraction",
        "claim_amount": 0.0,
        "status": "pending",
        "routing_status": "routed",
        "sla_deadline": sla_deadline.isoformat(),
    }).execute()

    if not insert_res.data:
        raise HTTPException(status_code=500, detail="Failed to create pre-auth request")

    pre_auth_id = insert_res.data[0]["id"]
    attachments_data = _insert_documents(pre_auth_id, payload.attachments)

    background_tasks.add_task(process_pre_auth_case, pre_auth_id, payload.insurer_id, attachments_data)

    return {"status": "success", "reference_number": ref_number}


@router.post("/provider")
async def submit_pre_auth_as_provider(
    payload: ProviderPreAuthRequest,
    background_tasks: BackgroundTasks,
    current_user=Depends(get_current_user),
):
    """Authenticated provider/doctor submission. Routes to the insurer if the
    payer is in our network; otherwise stores the request as `unrouted` and
    skips AI processing (no insurer = no policy to apply)."""
    if not payload.attachments:
        raise HTTPException(status_code=400, detail="At least one document is required.")

    user_id = current_user.id
    clinic_id = _resolve_clinic_for_user(user_id, payload.clinic_id)

    routing_status = "routed" if payload.insurer_id else "unrouted"
    if routing_status == "unrouted" and not payload.payer_name_raw:
        raise HTTPException(
            status_code=400,
            detail="Either insurer_id (in-network) or payer_name_raw (out-of-network) is required.",
        )

    # Resolve the submitter's role so a provider admin can later distinguish
    # their own submissions from their doctors'.
    submitted_role = None
    try:
        prof = (
            supabase.table("profiles")
            .select("account_type")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        acct = (prof.data or {}).get("account_type")
        if acct in ("doctor", "provider"):
            submitted_role = acct
    except Exception as e:
        logger.warning(f"Could not resolve account_type for {user_id}: {e}")

    ref_number = generate_reference()
    # Triage SLA: expedited/urgent cases get a tighter window than standard ones.
    priority = "Expedited" if (payload.priority or "").lower().startswith("exp") else "Standard"
    sla_hours = 72 if priority == "Expedited" else 168  # 3 days vs 7 days
    sla_deadline = datetime.now(timezone.utc) + timedelta(hours=sla_hours)

    # The servicing facility is what the rest of the system shows as "provider".
    provider_name = (
        payload.servicing_provider_name
        or payload.provider_name
        or payload.ordering_provider_name
        or "Pending extraction"
    )
    diagnosis_codes = [c for c in (payload.diagnosis_codes or []) if c and c.strip()]
    procedure_codes = [c for c in (payload.procedure_codes or []) if c and c.strip()]

    record = {
        "insurer_id": payload.insurer_id,
        "reference_number": ref_number,
        "provider_name": provider_name,
        "patient_name": payload.patient_name or "Pending extraction",
        "patient_id": payload.patient_id or "Pending extraction",
        "claim_amount": 0.0,
        "status": "pending" if routing_status == "routed" else "unrouted",
        "routing_status": routing_status,
        "priority": priority,
        "sla_deadline": sla_deadline.isoformat(),
        "submitted_by": user_id,
        "submitter_org": clinic_id,
        "submitted_role": submitted_role,
        "payer_name_raw": payload.payer_name_raw,
        # Structured packet — the submitter-entered fields are authoritative.
        "patient_dob": payload.patient_dob or None,
        "patient_age": payload.patient_age,
        "patient_gender": payload.patient_gender or None,
        "insurance_member_id": payload.insurance_member_id or None,
        "insurance_group_number": payload.insurance_group_number or None,
        "patient_phone": payload.patient_phone or None,
        "patient_address": payload.patient_address or None,
        "ordering_provider_name": payload.ordering_provider_name or None,
        "ordering_provider_npi": payload.ordering_provider_npi or None,
        "ordering_provider_tax_id": payload.ordering_provider_tax_id or None,
        "servicing_provider_name": payload.servicing_provider_name or None,
        "servicing_provider_npi": payload.servicing_provider_npi or None,
        "servicing_provider_tax_id": payload.servicing_provider_tax_id or None,
        "diagnosis_codes": diagnosis_codes,
        "procedure_codes": procedure_codes,
        # Keep the singular columns in sync so AI/insurer code that reads them works.
        "diagnosis_code": diagnosis_codes[0] if diagnosis_codes else None,
        "procedure_code": procedure_codes[0] if procedure_codes else None,
        "modifiers": payload.modifiers or None,
        "ndc_code": payload.ndc_code or None,
        "place_of_service": payload.place_of_service or None,
        "anticipated_date_of_service": payload.anticipated_date_of_service or None,
    }
    # Drop keys with no value so we never overwrite a column with NULL by accident
    # and stay tolerant of partially-applied migrations.
    record = {k: v for k, v in record.items() if v is not None}

    insert_res = supabase.table("pre_auth_requests").insert(record).execute()
    if not insert_res.data:
        raise HTTPException(status_code=500, detail="Failed to create pre-auth request")
    pre_auth_id = insert_res.data[0]["id"]

    attachments_data = _insert_documents(pre_auth_id, payload.attachments)

    if routing_status == "routed":
        background_tasks.add_task(process_pre_auth_case, pre_auth_id, payload.insurer_id, attachments_data)
        logger.info(f"Provider pre-auth {ref_number}: routed to insurer {payload.insurer_id}")
    else:
        logger.info(
            f"Provider pre-auth {ref_number}: UNROUTED — payer '{payload.payer_name_raw}' is not in our network. "
            "AI processing skipped; manual follow-up required."
        )

    audit.record_event(
        action="pre_auth_submitted", category="action",
        actor_id=user_id, target_type="pre_auth", target_id=pre_auth_id,
        summary=f"Pre-authorisation {ref_number} submitted ({routing_status})",
        metadata={"reference_number": ref_number, "routing_status": routing_status},
    )

    return {
        "status": "success",
        "reference_number": ref_number,
        "routing_status": routing_status,
        "pre_auth_id": pre_auth_id,
    }


@router.post("/extract")
async def extract_pre_auth_docs(
    payload: PreAuthExtractRequest,
    current_user=Depends(get_current_user),
):
    """Reads the dropped-off clinical documents and returns a structured pre-auth
    packet with per-field confidence scores, so the form can be auto-filled
    before the provider/doctor reviews and submits it."""
    docs = [d.model_dump() for d in (payload.documents or [])]
    if not docs:
        raise HTTPException(status_code=400, detail="At least one document is required.")

    file_names = [d.get("fileName") or "document" for d in docs]
    logger.info(f"Pre-auth extract request from {current_user.id}: {file_names}")
    try:
        extracted = await extract_pre_auth_from_documents(docs)
        audit.record_ai_inference(
            event_type="pre_auth_document_extraction",
            model_version="gemini-vision",
            prompt_template_name="PRE_AUTH_EXTRACTION_PROMPT",
            input_data={"file_names": file_names},
            output_data=extracted,
            actor_id=current_user.id,
            summary=f"Extracted pre-auth data from {len(docs)} document(s)",
        )
        return {"extracted": extracted, "fileNames": file_names}
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail="The AI couldn't read the document(s) clearly. You can fill the form in manually.",
        )
    except Exception as e:
        logger.error(f"Pre-auth extraction failed: {e}")
        raise HTTPException(status_code=500, detail="Internal error during document extraction.")


@router.get("/my-submissions")
async def list_my_pre_auths(current_user=Depends(get_current_user)):
    """Returns pre-auths this provider/doctor has submitted, with routing status."""
    res = (
        supabase.table("pre_auth_requests")
        .select("id, reference_number, patient_name, provider_name, status, routing_status, insurer_id, payer_name_raw, valid_until, approved_procedures, created_at, sla_deadline")
        .eq("submitted_by", current_user.id)
        .order("created_at", desc=True)
        .limit(200)
        .execute()
    )
    rows = res.data or []
    # Hydrate insurer names for routed rows
    insurer_ids = list({r["insurer_id"] for r in rows if r.get("insurer_id")})
    insurers = {}
    if insurer_ids:
        ires = supabase.table("insurers").select("id, name").in_("id", insurer_ids).execute()
        insurers = {i["id"]: i["name"] for i in (ires.data or [])}
    for r in rows:
        r["insurer_name"] = insurers.get(r.get("insurer_id")) if r.get("insurer_id") else r.get("payer_name_raw")
    return rows
