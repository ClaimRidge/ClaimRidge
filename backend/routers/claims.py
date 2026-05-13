import logging
import uuid
import datetime
import time
import random
import string
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from core.security import get_current_user
from core.database import supabase

from services.ai_services import extract_claim_from_document, scrub_claim
from services.fraud_service import fraud_detector
from services.case_engine import generate_fraud_case_file, persist_fraud_case
from services.authorization import verify_authorization

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
    # payer_id is the registered insurer UUID. Empty/null => out-of-network
    # (claim is stored as routing_status='unrouted', payer_id stays NULL).
    payer_id: Optional[str] = None
    diagnosis_codes: List[str]
    procedure_codes: List[str]
    billed_amount: float
    notes: Optional[str] = ""
    confidence_scores: Optional[Dict[str, Any]] = {}
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

async def _run_fraud_layer(claim_id: str, claim_data: ClaimFormData, resolved_payer_id: Optional[str]) -> dict:
    """Layer-1 (XGBoost) fraud screening for a claim. Persists score + flags on
    the claim row. If the score crosses the threshold AND we have a registered
    insurer, also generates a structured FraudCaseFile and back-links it."""
    signal = {
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
    }
    try:
        fraud_result = await fraud_detector.analyze_claim(signal)
    except Exception as e:
        logger.error(f"Fraud detector failed for claim {claim_id}: {e}")
        fraud_result = {"risk_level": "low", "fraud_score": 0.0, "flags": []}

    updates = {
        "fraud_risk_level": fraud_result.get("risk_level"),
        "fraud_score": fraud_result.get("fraud_score"),
        "fraud_flags": fraud_result.get("flags", []),
    }
    supabase.table("claims").update(updates).eq("id", claim_id).execute()

    risk = fraud_result.get("risk_level")
    if risk in {"high", "extreme"} and resolved_payer_id:
        try:
            case_file = await generate_fraud_case_file(
                claim_id=claim_id,
                fraud_score=fraud_result.get("fraud_score") or 0.0,
                anomaly_flags=fraud_result.get("flags", []),
            )
            if case_file and "error" not in case_file:
                await persist_fraud_case(
                    claim_id=claim_id,
                    insurer_id=resolved_payer_id,
                    fraud_score=fraud_result.get("fraud_score") or 0.0,
                    anomaly_flags=fraud_result.get("flags", []),
                    case_file=case_file,
                )
        except Exception as e:
            logger.error(f"Auto-generation of fraud case failed for {claim_id}: {e}")

    return fraud_result


@router.post("/scrub")
async def scrub_claim_endpoint(
    claim_data: ClaimFormData,
    background_tasks: BackgroundTasks,
    current_user=Depends(get_current_user),
):
    user_id = current_user.id
    claim_number = generate_claim_number()

    # 1. Resolve payer (registered insurer). Empty payer => out-of-network.
    resolved_payer_id: Optional[str] = None
    if claim_data.payer_id and is_valid_uuid(claim_data.payer_id):
        resolved_payer_id = claim_data.payer_id
    elif claim_data.payer_name:
        try:
            payer_search = supabase.table("insurers").select("id").ilike("name", claim_data.payer_name).execute()
            if payer_search.data:
                resolved_payer_id = payer_search.data[0]["id"]
        except Exception as e:
            logger.warning(f"Registered payer lookup failed: {e}")

    routing_status = "routed" if resolved_payer_id else "unrouted"

    # 2. Resolve clinic (provider_org).
    resolved_clinic_id: Optional[str] = None
    if claim_data.clinic_id and is_valid_uuid(claim_data.clinic_id):
        try:
            link = (
                supabase.table("doctor_org_links")
                .select("provider_org_id")
                .eq("doctor_id", user_id)
                .eq("provider_org_id", claim_data.clinic_id)
                .execute()
            )
            if link.data:
                resolved_clinic_id = claim_data.clinic_id
        except Exception as e:
            logger.error(f"Error verifying doctor_org_links: {e}")

    if not resolved_clinic_id:
        try:
            prof = (
                supabase.table("profiles")
                .select("provider_org_id")
                .eq("id", user_id)
                .maybe_single()
                .execute()
            )
            if prof.data and prof.data.get("provider_org_id"):
                resolved_clinic_id = prof.data["provider_org_id"]
        except Exception as e:
            logger.warning(f"Could not resolve provider org for user {user_id}: {e}")

    # 3. Verify the supplied pre-authorization (if any). This runs *before*
    # the row is inserted so the verdict is part of the initial claim record.
    auth_check = verify_authorization(
        pre_auth_number=claim_data.pre_auth_number,
        procedure_codes=claim_data.procedure_codes,
        patient_id=claim_data.patient_id,
        insurer_id=resolved_payer_id,
    )

    # 4. Build claim record
    claim_payload = {
        "id": str(uuid.uuid4()),
        "claim_number": claim_number,
        "status": "pending",
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
        "scrub_result": {"extraction_confidence": claim_data.confidence_scores},
        # Authorization linkage
        "pre_auth_number": (claim_data.pre_auth_number or "").strip() or None,
        "pre_auth_id": auth_check.get("pre_auth_id"),
        "auth_check_status": auth_check.get("status"),
        "auth_check_detail": auth_check.get("detail"),
    }

    insert_res = supabase.table("claims").insert(claim_payload).execute()
    if not insert_res.data:
        raise HTTPException(status_code=500, detail="Failed to save claim to database")
    db_generated_id = insert_res.data[0]["id"]

    # 5. AI scrub (runs for both routed and unrouted; uses payer policy when available).
    # We pass the auth check verdict so the scrubber can factor it into its issues list.
    try:
        scrub_dict = claim_data.model_dump(exclude={"confidence_scores"})
        scrub_dict["auth_check"] = auth_check
        scrub_result = await scrub_claim(scrub_dict, registered_payer_id=resolved_payer_id)
    except Exception as e:
        logger.error(f"AI scrub failed: {e}")
        scrub_result = {"status": "error", "issues": [{"message": str(e)}], "overall_score": 0}

    final_result = {**scrub_result, "extraction_confidence": claim_data.confidence_scores}

    supabase.table("claims").update({
        "status": "submitted" if routing_status == "routed" else "unrouted",
        "scrub_result": final_result,
        "ai_risk_score": scrub_result.get("overall_score", 0),
    }).eq("id", db_generated_id).execute()

    # 5. Fraud layer — fire-and-forget in the background for routed claims so
    #    the provider doesn't wait. Unrouted claims skip it (no insurer = nothing to flag for).
    if routing_status == "routed":
        background_tasks.add_task(_run_fraud_layer, db_generated_id, claim_data, resolved_payer_id)

    # 6. Audit trail
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
        "claim_number": claim_number,
        "routing_status": routing_status,
        "auth_check": auth_check,
    }


@router.get("/pre-auth-lookup/{auth_number}")
async def pre_auth_lookup(auth_number: str, current_user=Depends(get_current_user)):
    """Provider-facing lookup: given an authorization number, return the
    summary so the claim form can preview it (patient, valid_until, approved
    codes) before the provider submits. We deliberately do NOT scope by
    insurer here — providers may file claims into payers whose pre-auths they
    obtained, and they only ever see the result for the exact number they
    typed."""
    if not auth_number or not auth_number.strip():
        raise HTTPException(status_code=400, detail="authorization number is required")

    res = (
        supabase.table("pre_auth_requests")
        .select("id, authorization_number, valid_until, approved_procedures, "
                "patient_name, patient_id, status, insurer_id, procedure_code")
        .eq("authorization_number", auth_number.strip())
        .maybe_single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="No authorization with that number.")
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
        "authorization_number": auth["authorization_number"],
        "patient_name": auth.get("patient_name"),
        "patient_id": auth.get("patient_id"),
        "valid_until": auth.get("valid_until"),
        "expired": expired,
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