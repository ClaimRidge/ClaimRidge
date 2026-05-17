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

from services.ai_services import extract_claim_from_document, extract_claim_from_documents, scrub_claim
from services.authorization import verify_authorization
from services import audit

logger = logging.getLogger(__name__)

# --- Pydantic Models ---
class ExtractDocument(BaseModel):
    fileBase64: str
    mediaType: str
    fileName: str

class ExtractRequest(BaseModel):
    # New multi-doc field. Each entry is one uploaded document; the AI fuses
    # them into a single consolidated record.
    documents: Optional[List[ExtractDocument]] = None
    # Legacy single-doc fields kept for any older callers (e.g. /api/intake).
    fileBase64: Optional[str] = None
    mediaType: Optional[str] = None
    fileName: Optional[str] = None

class ClaimFormData(BaseModel):
    patient_name: str
    patient_id: str
    member_id: Optional[str] = None
    date_of_service: str
    provider_name: str
    provider_id: str
    payer_name: str
    # payer_id is the registered insurer UUID. Empty/null => out-of-network
    # (claim is stored as routing_status='unrouted', payer_id stays NULL).
    payer_id: Optional[str] = None
    diagnosis_codes: List[str]
    procedure_codes: List[str]
    billed_amount: float
    notes: Optional[str] = ""
    confidence_scores: Optional[Dict[str, Any]] = {}
    # The scrub verdict produced by POST /api/claims/scrub (the preview step).
    # Sent back on POST /api/claims/submit so the reviewed result is persisted
    # as-is. Ignored by the preview endpoint.
    scrub_result: Optional[Dict[str, Any]] = None
    clinic_id: Optional[str] = None
    # Pre-authorization linkage. If the provider obtained a pre-auth before
    # service, they reference its number here. The backend verifies that the
    # number exists, is unexpired, covers the billed procedures, and was
    # issued for the same patient.
    pre_auth_number: Optional[str] = None
    # Optional clinical signals used by the Layer-1 fraud model. Most come from
    # the documents/form; if missing the fraud detector marks them as insufficient.
    patient_age: Optional[int] = None
    patient_gender: Optional[str] = None
    patient_state: Optional[str] = None
    visit_type: Optional[str] = None
    length_of_stay: Optional[int] = None
    insurance_type: Optional[str] = None
    provider_specialty: Optional[str] = None

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
    # Normalise: accept either a list of documents or a single legacy doc.
    docs: List[dict] = []
    if payload.documents:
        docs = [d.model_dump() for d in payload.documents]
    elif payload.fileBase64 and payload.mediaType:
        docs = [{
            "fileBase64": payload.fileBase64,
            "mediaType": payload.mediaType,
            "fileName": payload.fileName or "document",
        }]

    if not docs:
        raise HTTPException(status_code=400, detail="No documents provided")

    file_names = [d.get("fileName") or "document" for d in docs]
    logger.info(f"Extract claim request from user {current_user.id}, files: {file_names}")

    try:
        extracted = await extract_claim_from_documents(docs)
        audit.record_ai_inference(
            event_type="claim_document_extraction",
            model_version="gemini-vision",
            prompt_template_name="CLAIM_EXTRACTION_PROMPT",
            input_data={"file_names": file_names},
            output_data=extracted,
            actor_id=current_user.id,
            summary=f"Extracted claim data from {len(docs)} document(s)",
        )
        return {"extracted": extracted, "fileNames": file_names}
    except ValueError as ve:
        logger.error(f"AI structured extraction failed: {str(ve)}")
        raise HTTPException(status_code=422, detail="The AI failed to read the document(s) clearly. Please enter manually.")
    except Exception as e:
        logger.error(f"Document extraction failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal processing error: {str(e)}")

def _build_fraud_signal(claim_data: ClaimFormData) -> dict:
    """Builds the XGBoost fraud-model signal from the submitted claim form and
    returns it for persistence on the claim (`claims.fraud_signal`).

    The fraud model is NOT run here. Fraud scoring is an insurer-side step that
    happens later, inside adjudication (`services/adjudication.py`), which reads
    this stored signal. We only capture it at submission because the clinical
    fields (age, gender, visit type, length of stay, specialty…) come from the
    provider's form and are otherwise not persisted on the claim row.

    Submission-time features (days_between_service_and_claim, submission_month,
    submission_day_of_week) are derived here from `date_of_service` / `now()`
    so they reflect the moment of submission, not the moment of adjudication."""
    today = datetime.date.today()
    days_since_service: Optional[int] = None
    if claim_data.date_of_service:
        try:
            dos_date = datetime.date.fromisoformat(str(claim_data.date_of_service))
            days_since_service = max(0, (today - dos_date).days)
        except (ValueError, TypeError):
            days_since_service = None

    now = datetime.datetime.now()

    return {
        "patient_age": claim_data.patient_age,
        "patient_gender": claim_data.patient_gender,
        "patient_state": claim_data.patient_state,
        "diagnosis_code": (claim_data.diagnosis_codes or [None])[0],
        "procedure_code": (claim_data.procedure_codes or [None])[0],
        "visit_type": claim_data.visit_type,
        "length_of_stay": claim_data.length_of_stay,
        "insurance_type": claim_data.insurance_type,
        "provider_specialty": claim_data.provider_specialty,
        "claim_amount": claim_data.billed_amount,
        # Derived submission-time features for the XGBoost model
        "days_between_service_and_claim": days_since_service,
        "submission_month": now.month,
        "submission_day_of_week": now.weekday(),
    }


def _resolve_payer(claim_data: ClaimFormData) -> Optional[str]:
    """Resolves the registered insurer UUID for a claim. Returns None for an
    out-of-network payer (the claim is then stored unrouted)."""
    if claim_data.payer_id and is_valid_uuid(claim_data.payer_id):
        return claim_data.payer_id
    if claim_data.payer_name:
        try:
            res = supabase.table("insurers").select("id").ilike("name", claim_data.payer_name).execute()
            if res.data:
                return res.data[0]["id"]
        except Exception as e:
            logger.warning(f"Registered payer lookup failed: {e}")
    return None


def _resolve_clinic(user_id: str, requested_clinic_id: Optional[str]) -> Optional[str]:
    """Resolves the provider_org a claim is submitted under — the requested
    clinic if the caller is linked to it, else the caller's own org."""
    if requested_clinic_id and is_valid_uuid(requested_clinic_id):
        try:
            link = (
                supabase.table("doctor_org_links")
                .select("provider_org_id")
                .eq("doctor_id", user_id)
                .eq("provider_org_id", requested_clinic_id)
                .execute()
            )
            if link.data:
                return requested_clinic_id
        except Exception as e:
            logger.error(f"Error verifying doctor_org_links: {e}")
    try:
        prof = (
            supabase.table("profiles")
            .select("provider_org_id")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        if prof.data and prof.data.get("provider_org_id"):
            return prof.data["provider_org_id"]
    except Exception as e:
        logger.warning(f"Could not resolve provider org for user {user_id}: {e}")
    return None


def _run_auth_check(claim_data: ClaimFormData, resolved_payer_id: Optional[str]) -> dict:
    """Cross-checks the claim's own fields against any pre-authorisation it
    cites — any disagreement yields a `contradiction` verdict."""
    return verify_authorization(
        pre_auth_number=claim_data.pre_auth_number,
        insurer_id=resolved_payer_id,
        claim={
            "patient_id": claim_data.patient_id,
            "patient_name": claim_data.patient_name,
            "member_id": claim_data.member_id,
            "diagnosis_codes": claim_data.diagnosis_codes,
            "procedure_codes": claim_data.procedure_codes,
            "provider_name": claim_data.provider_name,
        },
    )


async def _scrub(claim_data: ClaimFormData, auth_check: dict, resolved_payer_id: Optional[str]) -> dict:
    """Runs the coding/billing scrubber. Tolerates LLM failure by returning an
    error-shaped result so the caller can still proceed."""
    try:
        scrub_dict = claim_data.model_dump(exclude={"confidence_scores", "scrub_result"})
        scrub_dict["auth_check"] = auth_check
        return await scrub_claim(scrub_dict, registered_payer_id=resolved_payer_id)
    except Exception as e:
        logger.error(f"AI scrub failed: {e}")
        return {"status": "error", "issues": [{"message": str(e)}], "overall_score": 0}


@router.post("/scrub")
async def preview_claim_endpoint(
    claim_data: ClaimFormData,
    current_user=Depends(get_current_user),
):
    """PREVIEW step. Runs the AI coding scrubber + the pre-authorisation check
    and returns the suggestions WITHOUT persisting anything — no claim row, no
    audit event is created. The provider reviews the result, then either edits
    the claim or confirms it via POST /api/claims/submit."""
    resolved_payer_id = _resolve_payer(claim_data)
    auth_check = _run_auth_check(claim_data, resolved_payer_id)
    scrub_result = await _scrub(claim_data, auth_check, resolved_payer_id)
    return {
        **scrub_result,
        "auth_check": auth_check,
        "routing_status": "routed" if resolved_payer_id else "unrouted",
    }


@router.post("/submit")
async def submit_claim_endpoint(
    claim_data: ClaimFormData,
    current_user=Depends(get_current_user),
):
    """COMMIT step. Persists the claim, routes it to the insurer, and writes the
    audit trail. Expects `scrub_result` (the verdict from POST /api/claims/scrub)
    so the reviewed result is stored as-is; if absent, the scrubber is re-run.
    The authorisation check is always recomputed here server-side."""
    user_id = current_user.id
    claim_number = generate_claim_number()

    resolved_payer_id = _resolve_payer(claim_data)
    routing_status = "routed" if resolved_payer_id else "unrouted"
    resolved_clinic_id = _resolve_clinic(user_id, claim_data.clinic_id)
    auth_check = _run_auth_check(claim_data, resolved_payer_id)

    # Persist the scrub verdict the provider reviewed in the preview step.
    # Re-run only if the client didn't send one back (e.g. a direct API caller).
    scrub_result = claim_data.scrub_result or await _scrub(claim_data, auth_check, resolved_payer_id)

    claim_payload = {
        "id": str(uuid.uuid4()),
        "claim_number": claim_number,
        "status": "submitted" if routing_status == "routed" else "unrouted",
        "routing_status": routing_status,
        "user_id": user_id,
        "clinic_id": resolved_clinic_id,
        "payer_id": resolved_payer_id,
        "payer_name_raw": claim_data.payer_name if not resolved_payer_id else None,
        "patient_name": claim_data.patient_name,
        "patient_id": claim_data.patient_id,
        "member_id": claim_data.member_id,
        "date_of_service": claim_data.date_of_service or str(datetime.date.today()),
        "payer_name": claim_data.payer_name,
        "provider_name": claim_data.provider_name,
        "diagnosis_codes": claim_data.diagnosis_codes,
        "procedure_codes": claim_data.procedure_codes,
        "total_billed": claim_data.billed_amount or 0,
        "currency": "JOD",
        "notes": claim_data.notes or "",
        "scrub_result": {**scrub_result, "extraction_confidence": claim_data.confidence_scores},
        "ai_risk_score": scrub_result.get("overall_score", 0),
        # Authorization linkage
        "pre_auth_number": (claim_data.pre_auth_number or "").strip() or None,
        "pre_auth_id": auth_check.get("pre_auth_id"),
        "auth_check_status": auth_check.get("status"),
        "auth_check_detail": auth_check.get("detail"),
        # Fraud-model signal captured for insurer-side scoring. The model is NOT
        # run here — it runs during adjudication (services/adjudication.py).
        "fraud_signal": _build_fraud_signal(claim_data),
    }

    insert_res = supabase.table("claims").insert(claim_payload).execute()
    if not insert_res.data:
        raise HTTPException(status_code=500, detail="Failed to save claim to database")
    db_generated_id = insert_res.data[0]["id"]

    # Audit trail
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

    # Immutable audit events — the submission action + the AI scrub inference
    audit.record_event(
        action="claim_submitted", category="action",
        actor_id=user_id, target_type="claim", target_id=db_generated_id,
        summary=f"Claim {claim_number} submitted ({routing_status})",
        metadata={
            "claim_number": claim_number,
            "routing_status": routing_status,
            "billed_amount": claim_data.billed_amount or 0,
            "payer": claim_data.payer_name,
        },
    )
    audit.record_ai_inference(
        event_type="claim_scrub",
        model_version="groq-llama-3.3",
        prompt_template_name="SCRUB_SYSTEM_PROMPT",
        input_data={
            "diagnosis_codes": claim_data.diagnosis_codes,
            "procedure_codes": claim_data.procedure_codes,
            "billed_amount": claim_data.billed_amount,
        },
        output_data=scrub_result,
        confidence_score=scrub_result.get("overall_score"),
        actor_id=user_id,
        claim_id=db_generated_id,
        summary=f"AI scrub completed — score {scrub_result.get('overall_score', 0)}",
    )

    return {
        **scrub_result,
        "id": db_generated_id,
        "claim_number": claim_number,
        "routing_status": routing_status,
        "auth_check": auth_check,
    }


@router.get("/pre-auth-lookup/{reference}")
async def pre_auth_lookup(reference: str, current_user=Depends(get_current_user)):
    """Provider-facing lookup: given a pre-auth reference number, return the
    summary so the claim form can preview it (patient, status, validity,
    approved codes) before the provider submits. We deliberately do NOT scope
    by insurer here — providers only ever see the result for the exact
    reference they typed."""
    if not reference or not reference.strip():
        raise HTTPException(status_code=400, detail="pre-auth reference is required")

    res = (
        supabase.table("pre_auth_requests")
        .select("id, reference_number, valid_until, approved_procedures, "
                "patient_name, patient_id, status, insurer_id, procedure_code")
        .eq("reference_number", reference.strip())
        .maybe_single()
        .execute()
    )
    if not res or not getattr(res, "data", None):
        raise HTTPException(status_code=404, detail="No pre-authorisation with that reference.")
    auth = res.data

    insurer_name = None
    if auth.get("insurer_id"):
        ins = supabase.table("insurers").select("name").eq("id", auth["insurer_id"]).maybe_single().execute()
        insurer_name = (ins.data or {}).get("name")

    # Expiry hint
    expired = False
    valid_until = auth.get("valid_until")
    if valid_until:
        try:
            vu = datetime.datetime.fromisoformat(valid_until.replace("Z", "+00:00"))
            expired = vu < datetime.datetime.now(datetime.timezone.utc)
        except Exception:
            pass

    return {
        "reference_number": auth["reference_number"],
        "patient_name": auth.get("patient_name"),
        "patient_id": auth.get("patient_id"),
        "valid_until": auth.get("valid_until"),
        "expired": expired,
        "approved": str(auth.get("status") or "").lower() == "approved",
        "approved_procedures": auth.get("approved_procedures") or [],
        "status": auth.get("status"),
        "insurer_id": auth.get("insurer_id"),
        "insurer_name": insurer_name,
    }


@router.get("/my-submissions")
async def list_my_claims(current_user=Depends(get_current_user)):
    """Returns claims this provider/doctor has submitted (both routed and unrouted)."""
    res = (
        supabase.table("claims")
        .select("id, claim_number, patient_name, payer_name, payer_id, payer_name_raw, status, routing_status, total_billed, ai_risk_score, fraud_score, fraud_risk_level, date_of_service, created_at")
        .eq("user_id", current_user.id)
        .order("created_at", desc=True)
        .limit(200)
        .execute()
    )
    return res.data or []

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