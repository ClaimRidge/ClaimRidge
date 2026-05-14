"""Issue an authorization on pre-auth approval, and verify it from a claim.

Real-world flow:
  1. Provider submits pre-auth → AI or human reviewer approves.
  2. Approval issues a unique `authorization_number` and `valid_until`
     (default 90 days, configurable per insurer in `insurers.config`).
  3. The provider receives the number, performs the service.
  4. Provider files a claim that references the number.
  5. Insurer-side: `verify_authorization` cross-checks the claim against the
     auth — window, patient identity, procedure codes — and persists the
     verdict on `claims.auth_check_status`.

This module is intentionally side-effect-only (it writes to Supabase) so
callers stay simple.
"""

import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from core.database import supabase

logger = logging.getLogger(__name__)

DEFAULT_VALIDITY_DAYS = 90


def _generate_auth_number() -> str:
    """Format: AUTH-YYYYMMDD-XXXXXXXX (cryptographically random 8 chars)."""
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    suffix = secrets.token_urlsafe(6)[:8].upper().replace("_", "X").replace("-", "X")
    return f"AUTH-{today}-{suffix}"


def _insurer_validity_days(insurer_id: Optional[str]) -> int:
    if not insurer_id:
        return DEFAULT_VALIDITY_DAYS
    try:
        res = supabase.table("insurers").select("config").eq("id", insurer_id).maybe_single().execute()
        cfg = (res.data or {}).get("config") or {}
        days = cfg.get("pre_auth_validity_days")
        return int(days) if days else DEFAULT_VALIDITY_DAYS
    except Exception:
        return DEFAULT_VALIDITY_DAYS


def issue_authorization(pre_auth_id: str) -> dict:
    """Stamps the pre_auth_requests row with an authorization_number and
    valid_until. Approved procedure codes come from the request itself; future
    iterations may let the reviewer override them. Idempotent — re-issuing on
    an already-authorised row returns the existing number unchanged."""
    res = supabase.table("pre_auth_requests").select(
        "id, insurer_id, authorization_number, valid_until, "
        "procedure_code, approved_procedures"
    ).eq("id", pre_auth_id).maybe_single().execute()
    if not res.data:
        raise ValueError(f"Pre-auth {pre_auth_id} not found.")
    row = res.data

    if row.get("authorization_number"):
        return {
            "authorization_number": row["authorization_number"],
            "valid_until": row.get("valid_until"),
            "reissued": False,
        }

    validity_days = _insurer_validity_days(row.get("insurer_id"))
    now = datetime.now(timezone.utc)
    valid_until = now + timedelta(days=validity_days)
    auth_number = _generate_auth_number()

    # Approved procedures default to whatever the provider submitted. A future
    # PR can expose a reviewer-editable list, partial approval, etc.
    submitted_codes: list = []
    if row.get("procedure_code"):
        submitted_codes = [row["procedure_code"]]
    if row.get("approved_procedures") and isinstance(row["approved_procedures"], list):
        approved_codes = row["approved_procedures"] or submitted_codes
    else:
        approved_codes = submitted_codes

    supabase.table("pre_auth_requests").update({
        "authorization_number": auth_number,
        "valid_until": valid_until.isoformat(),
        "approved_procedures": approved_codes,
        "issued_at": now.isoformat(),
    }).eq("id", pre_auth_id).execute()

    logger.info(
        f"Pre-auth {pre_auth_id}: issued {auth_number} valid until "
        f"{valid_until.date()} ({validity_days}d)"
    )
    return {
        "authorization_number": auth_number,
        "valid_until": valid_until.isoformat(),
        "approved_procedures": approved_codes,
        "reissued": True,
    }


def revoke_authorization(pre_auth_id: str) -> None:
    """Clears the authorization fields. Used when an approval is reversed."""
    supabase.table("pre_auth_requests").update({
        "authorization_number": None,
        "valid_until": None,
        "issued_at": None,
    }).eq("id", pre_auth_id).execute()


def verify_authorization(
    pre_auth_number: Optional[str],
    procedure_codes: list,
    patient_id: Optional[str],
    insurer_id: Optional[str],
) -> dict:
    """Verifies a claim against the authorising pre-auth.

    Returns one of:
      ok             — auth exists, in window, patient matches, codes covered
      missing        — caller supplied a number, but no auth with that number exists for this insurer
      expired        — auth exists but valid_until is in the past
      wrong_patient  — auth's patient_id does not match the claim's
      code_mismatch  — none of the claim's procedure codes are in approved_procedures
      not_applicable — no number supplied (some claims don't require auth)

    Each return includes a human-readable `detail` and the matched `pre_auth_id` if any.
    """
    if not pre_auth_number or not pre_auth_number.strip():
        return {"status": "not_applicable", "detail": "No pre-authorisation number was supplied with this claim.", "pre_auth_id": None}

    # Out-of-network: the payer isn't in our database, so we have no
    # authorisation records to verify against. Treat the number as opaque
    # metadata — store it on the claim, but don't run verification (and
    # therefore don't let the scrubber flag it).
    if not insurer_id:
        return {
            "status": "not_applicable",
            "detail": (
                f"Payer is out-of-network — authorization {pre_auth_number.strip()} "
                "cannot be verified against our system. Recorded for reference only."
            ),
            "pre_auth_id": None,
        }

    q = supabase.table("pre_auth_requests").select(
        "id, authorization_number, valid_until, approved_procedures, patient_id, insurer_id, status"
    ).eq("authorization_number", pre_auth_number.strip()).eq("insurer_id", insurer_id)
    res = q.maybe_single().execute()

    if not res.data:
        return {
            "status": "missing",
            "detail": f"No authorization found with number {pre_auth_number}.",
            "pre_auth_id": None,
        }
    auth = res.data

    # Validity window
    valid_until = auth.get("valid_until")
    if valid_until:
        try:
            vu = datetime.fromisoformat(valid_until.replace("Z", "+00:00"))
            if vu < datetime.now(timezone.utc):
                return {
                    "status": "expired",
                    "detail": f"Authorization {pre_auth_number} expired on {vu.date()}.",
                    "pre_auth_id": auth["id"],
                }
        except Exception:
            pass

    # Patient identity
    auth_patient = (auth.get("patient_id") or "").strip().lower()
    claim_patient = (patient_id or "").strip().lower()
    if auth_patient and claim_patient and auth_patient != claim_patient:
        return {
            "status": "wrong_patient",
            "detail": (
                f"Authorization {pre_auth_number} was issued for a different patient "
                f"(auth: {auth.get('patient_id')}, claim: {patient_id})."
            ),
            "pre_auth_id": auth["id"],
        }

    # Approved procedure codes
    approved = auth.get("approved_procedures") or []
    approved_set = {str(c).strip().upper() for c in approved if c}
    claim_set = {str(c).strip().upper() for c in (procedure_codes or []) if c}
    if approved_set and claim_set:
        if not (approved_set & claim_set):
            return {
                "status": "code_mismatch",
                "detail": (
                    f"None of the billed procedure codes ({sorted(claim_set)}) match "
                    f"the approved scope on authorization {pre_auth_number} "
                    f"({sorted(approved_set)})."
                ),
                "pre_auth_id": auth["id"],
            }

    return {
        "status": "ok",
        "detail": (
            f"Verified against authorization {pre_auth_number}, valid until "
            f"{valid_until[:10] if valid_until else 'no expiry'}."
        ),
        "pre_auth_id": auth["id"],
    }
