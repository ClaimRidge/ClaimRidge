"""Activate an authorisation when a pre-auth is approved, and verify it from a claim.

Real-world flow:
  1. Provider submits a pre-auth request. At submission it is stamped with a
     permanent `reference_number` (PA-…) — the single identifier used for the
     entire patient journey.
  2. The request goes to the insurer's manual review queue. An AI
     medical-necessity review attaches an advisory recommendation, but the
     binding decision is made by a human reviewer.
  3. A reviewer approves or denies it. Approval *activates* the authorisation:
     the reference stays unchanged, and a validity window + approved-procedure
     scope are stamped onto the row.
  4. The provider performs the service and files a claim citing the same
     `reference_number`.
  5. `verify_authorization` cross-checks the claim against the pre-auth —
     approved status, validity window, patient identity, procedure codes — and
     persists the verdict on `claims.auth_check_status`.

This module is intentionally side-effect-only (it writes to Supabase) so
callers stay simple.
"""

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

from core.database import supabase

logger = logging.getLogger(__name__)

DEFAULT_VALIDITY_DAYS = 90


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


def activate_authorization(pre_auth_id: str) -> dict:
    """Activates the authorisation on an approved pre-auth.

    The request already carries its permanent `reference_number` (assigned at
    submission) — approval does NOT mint a new identifier. It only stamps the
    validity window, approved-procedure scope, and issue timestamp onto the
    row. Idempotent: re-activating an already-active row returns the existing
    window unchanged.
    """
    res = supabase.table("pre_auth_requests").select(
        "id, insurer_id, reference_number, valid_until, issued_at, "
        "procedure_code, procedure_codes, approved_procedures"
    ).eq("id", pre_auth_id).maybe_single().execute()
    if not res or not getattr(res, "data", None):
        raise ValueError(f"Pre-auth {pre_auth_id} not found.")
    row = res.data

    if row.get("issued_at"):
        return {
            "reference_number": row.get("reference_number"),
            "valid_until": row.get("valid_until"),
            "approved_procedures": row.get("approved_procedures") or [],
            "activated": False,
        }

    validity_days = _insurer_validity_days(row.get("insurer_id"))
    now = datetime.now(timezone.utc)
    valid_until = now + timedelta(days=validity_days)

    # Approved procedures default to whatever the provider submitted. A future
    # PR can expose a reviewer-editable list, partial approval, etc.
    approved_codes = row.get("approved_procedures")
    if not (isinstance(approved_codes, list) and approved_codes):
        approved_codes = [c for c in (row.get("procedure_codes") or []) if c]
    if not approved_codes and row.get("procedure_code"):
        approved_codes = [row["procedure_code"]]

    supabase.table("pre_auth_requests").update({
        "valid_until": valid_until.isoformat(),
        "approved_procedures": approved_codes,
        "issued_at": now.isoformat(),
    }).eq("id", pre_auth_id).execute()

    logger.info(
        f"Pre-auth {pre_auth_id} ({row.get('reference_number')}): authorisation "
        f"activated, valid until {valid_until.date()} ({validity_days}d)"
    )
    return {
        "reference_number": row.get("reference_number"),
        "valid_until": valid_until.isoformat(),
        "approved_procedures": approved_codes,
        "activated": True,
    }


def revoke_authorization(pre_auth_id: str) -> None:
    """Clears the activation fields. Used when an approval is reversed or the
    request is denied. The permanent `reference_number` is left untouched."""
    supabase.table("pre_auth_requests").update({
        "valid_until": None,
        "issued_at": None,
        "approved_procedures": [],
    }).eq("id", pre_auth_id).execute()


# Sentinel the drop-off / claim forms write into a field that has not been
# filled in yet — treat it as "no value", never as a real value to compare.
_PENDING_SENTINEL = "pending extraction"


def _norm_id(value) -> str:
    """Comparison key for identifiers — case-insensitive, spaces/dashes stripped.
    The 'pending extraction' sentinel is treated as no value (returns '')."""
    s = str(value or "").strip().lower()
    if s == _PENDING_SENTINEL:
        return ""
    return re.sub(r"[\s\-]+", "", s)


def _name_tokens(value) -> set:
    """Word tokens of a name, for lenient (overlap-based) name comparison. A
    blank value or the 'pending extraction' sentinel yields an empty set."""
    s = str(value or "").strip().lower()
    if not s or s == _PENDING_SENTINEL:
        return set()
    return {t for t in re.split(r"[^\w]+", s) if len(t) > 1}


def _code_set(value) -> set:
    """Upper-cased set of clinical codes from a list (or a single string)."""
    if isinstance(value, str):
        value = [value]
    return {str(c).strip().upper() for c in (value or []) if c and str(c).strip()}


def _display(value) -> str:
    s = str(value or "").strip()
    return s if s and s.lower() != _PENDING_SENTINEL else "—"


def _compare_claim_to_auth(auth: dict, claim: dict) -> list:
    """Field-by-field cross-check of a claim against the pre-auth it cites.

    Returns a list of contradictions ({field, label, pre_auth, claim}); an empty
    list means everything that could be compared agrees. A field is compared
    only when BOTH sides carry a real value — missing data is never a
    contradiction. Identifiers are matched exactly (after normalisation); names
    are matched leniently (flagged only when they share no word in common) so a
    middle initial or facility-name abbreviation does not trigger a false deny.
    """
    contradictions = []

    def add(field, label, pre_auth_val, claim_val):
        contradictions.append({
            "field": field, "label": label,
            "pre_auth": pre_auth_val, "claim": claim_val,
        })

    # Patient national ID — strong identifier, exact match.
    a, c = _norm_id(auth.get("patient_id")), _norm_id(claim.get("patient_id"))
    if a and c and a != c:
        add("patient_id", "Patient ID", _display(auth.get("patient_id")), _display(claim.get("patient_id")))

    # Patient name — lenient: flagged only when the names share no common word.
    an, cn = _name_tokens(auth.get("patient_name")), _name_tokens(claim.get("patient_name"))
    if an and cn and not (an & cn):
        add("patient_name", "Patient name", _display(auth.get("patient_name")), _display(claim.get("patient_name")))

    # Insurance member ID — strong identifier, exact match.
    a, c = _norm_id(auth.get("insurance_member_id")), _norm_id(claim.get("member_id"))
    if a and c and a != c:
        add("member_id", "Insurance member ID", _display(auth.get("insurance_member_id")), _display(claim.get("member_id")))

    # Diagnosis — flagged when both sides list codes but none overlap.
    ad, cd = _code_set(auth.get("diagnosis_codes")), _code_set(claim.get("diagnosis_codes"))
    if ad and cd and not (ad & cd):
        add("diagnosis_codes", "Diagnosis codes", ", ".join(sorted(ad)), ", ".join(sorted(cd)))

    # Procedure scope — billed codes must overlap the approved procedures.
    approved = _code_set(auth.get("approved_procedures"))
    billed = _code_set(claim.get("procedure_codes"))
    if approved and billed and not (approved & billed):
        add("procedure_codes", "Procedure codes", ", ".join(sorted(approved)), ", ".join(sorted(billed)))

    # Servicing provider — lenient name-token comparison.
    ap = _name_tokens(auth.get("servicing_provider_name") or auth.get("provider_name"))
    cp = _name_tokens(claim.get("provider_name"))
    if ap and cp and not (ap & cp):
        add(
            "provider_name", "Provider",
            _display(auth.get("servicing_provider_name") or auth.get("provider_name")),
            _display(claim.get("provider_name")),
        )

    return contradictions


def verify_authorization(
    *,
    pre_auth_number: Optional[str],
    insurer_id: Optional[str],
    claim: dict,
) -> dict:
    """Verifies a claim against the pre-authorisation it cites.

    `pre_auth_number` is the pre-auth `reference_number` written on the claim;
    `claim` carries the claim's own (document-extracted) fields — patient_id,
    patient_name, member_id, diagnosis_codes, procedure_codes, provider_name —
    so they can be cross-checked against the pre-auth. Returns one of:
      ok             — approved, in window, and every comparable field agrees
      missing        — a reference was supplied, but no pre-auth with it exists
      not_approved   — the pre-auth exists but has not been approved
      expired        — approved, but the validity window has passed
      contradiction  — one or more claim fields disagree with the pre-auth
      not_applicable — no reference supplied, or the payer is out-of-network

    A `contradiction` return additionally carries a `contradictions` list of
    {field, label, pre_auth, claim}. (Legacy claim rows may still hold the
    retired `wrong_patient` / `code_mismatch` verdicts — those cases are now
    reported as `contradiction` entries instead.)
    """
    if not pre_auth_number or not pre_auth_number.strip():
        return {"status": "not_applicable", "detail": "No pre-authorisation reference was supplied with this claim.", "pre_auth_id": None}

    # Out-of-network: the payer isn't in our database, so we have no pre-auth
    # records to verify against. Treat the reference as opaque metadata — store
    # it on the claim, but don't run verification (and therefore don't let the
    # scrubber flag it).
    if not insurer_id:
        return {
            "status": "not_applicable",
            "detail": (
                f"Payer is out-of-network — pre-authorisation {pre_auth_number.strip()} "
                "cannot be verified against our system. Recorded for reference only."
            ),
            "pre_auth_id": None,
        }

    res = supabase.table("pre_auth_requests").select("*").eq(
        "reference_number", pre_auth_number.strip()
    ).eq("insurer_id", insurer_id).maybe_single().execute()

    if res is None or not getattr(res, "data", None):
        return {
            "status": "missing",
            "detail": f"No pre-authorisation found with reference {pre_auth_number}.",
            "pre_auth_id": None,
        }
    auth = res.data

    # The pre-auth must be approved before a claim can rely on it.
    if str(auth.get("status") or "").lower() != "approved":
        return {
            "status": "not_approved",
            "detail": (
                f"Pre-authorisation {pre_auth_number} has not been approved "
                f"(current status: {auth.get('status') or 'unknown'}). A claim cannot "
                "be filed against it until the insurer approves the request."
            ),
            "pre_auth_id": auth["id"],
        }

    # Validity window
    valid_until = auth.get("valid_until")
    if valid_until:
        try:
            vu = datetime.fromisoformat(valid_until.replace("Z", "+00:00"))
            if vu < datetime.now(timezone.utc):
                return {
                    "status": "expired",
                    "detail": f"Pre-authorisation {pre_auth_number} expired on {vu.date()}.",
                    "pre_auth_id": auth["id"],
                }
        except Exception:
            pass

    # Full claim ↔ pre-auth cross-check. ANY field that disagrees is a
    # contradiction: the authorisation does not cover this claim.
    contradictions = _compare_claim_to_auth(auth, claim or {})
    if contradictions:
        lines = "\n".join(
            f'- {c["label"]}: pre-auth "{c["pre_auth"]}" vs claim "{c["claim"]}"'
            for c in contradictions
        )
        return {
            "status": "contradiction",
            "detail": (
                f"The claim contradicts pre-authorisation {pre_auth_number} on "
                f"{len(contradictions)} field(s):\n{lines}"
            ),
            "pre_auth_id": auth["id"],
            "contradictions": contradictions,
        }

    return {
        "status": "ok",
        "detail": (
            f"Verified against pre-authorisation {pre_auth_number}: every checked "
            f"field matches, valid until "
            f"{valid_until[:10] if valid_until else 'no expiry'}."
        ),
        "pre_auth_id": auth["id"],
    }
