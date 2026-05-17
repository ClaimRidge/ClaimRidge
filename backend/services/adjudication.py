"""Claim adjudication — the automatic accept/deny/escalate verdict.

Runs when an insurer first opens a routed claim. Pipeline:

  1. Run the statistical fraud model for the claim. Fraud scoring is an
     insurer-side step — it happens here, during adjudication, NOT at provider
     submission. The model reads the `claims.fraud_signal` captured at
     submission; a high/extreme score also spins up a structured FraudCaseFile.
  2. Pre-auth contradiction hard-gate (no LLM): if the claim's details
     contradict the pre-authorisation it cites (auth_check_status =
     'contradiction') -> deny. Checked first; takes precedence.
  3. Fraud hard-gate (no LLM):
       extreme            -> deny
       high               -> escalate
       insufficient_data  -> escalate
       low                -> continue
  4. Policy check: a low-risk claim whose payer has no policy on file -> escalate.
  5. LLM adjudication (ai_services.run_claim_adjudication_llm) for the remaining
     low-risk, policy-backed claims -> accept | deny | escalate.

The verdict is cached on `claims.adjudication` / `adjudication_decision` /
`adjudicated_at`; `claims.status` mirrors it as accepted | denied | escalated.
Re-adjudication can be forced explicitly.
"""

import datetime
import logging
from typing import Optional

from core.database import supabase
from services.fraud_service import fraud_detector
from services.case_engine import generate_fraud_case_file, persist_fraud_case
from services.ai_services import run_claim_adjudication_llm
from services import audit

logger = logging.getLogger(__name__)

_DECISION_TO_STATUS = {"accept": "accepted", "deny": "denied", "escalate": "escalated"}


class ClaimNotFound(Exception):
    """Raised when no claim matches the id for the requesting insurer."""


def _build_fraud_signal(claim: dict) -> dict:
    """The XGBoost feature signal for a claim. Prefers `claims.fraud_signal` —
    the signal captured from the provider's claim form at submission. Falls
    back to reconstructing it from the stored row for legacy claims that
    predate that column; most clinical fields aren't on the row, so the
    fallback typically yields `insufficient_data` (which escalates) — that is
    the intended floor."""
    stored = claim.get("fraud_signal")
    if isinstance(stored, dict) and stored:
        return stored
    today = datetime.date.today()
    days_since_service: Optional[int] = None
    dos = claim.get("date_of_service")
    if dos:
        try:
            dos_date = datetime.date.fromisoformat(str(dos)[:10])
            days_since_service = max(0, (today - dos_date).days)
        except (ValueError, TypeError):
            days_since_service = None
    now = datetime.datetime.now()
    return {
        "patient_age": claim.get("patient_age"),
        "patient_gender": claim.get("patient_gender"),
        "patient_state": claim.get("patient_state"),
        "diagnosis_code": (claim.get("diagnosis_codes") or [None])[0],
        "procedure_code": (claim.get("procedure_codes") or [None])[0],
        "visit_type": claim.get("visit_type"),
        "length_of_stay": claim.get("length_of_stay"),
        "insurance_type": claim.get("insurance_type"),
        "provider_specialty": claim.get("provider_specialty"),
        "claim_amount": claim.get("total_billed"),
        "days_between_service_and_claim": days_since_service,
        "submission_month": now.month,
        "submission_day_of_week": now.weekday(),
    }


async def _ensure_fraud_case(claim_id: str, insurer_id: str, fraud_result: dict) -> None:
    """Generate + persist a bilingual FraudCaseFile for a flagged claim."""
    try:
        case_file = await generate_fraud_case_file(
            claim_id=claim_id,
            fraud_score=fraud_result.get("fraud_score") or 0.0,
            anomaly_flags=fraud_result.get("flags", []),
        )
        if case_file and "error" not in case_file:
            await persist_fraud_case(
                claim_id=claim_id,
                insurer_id=insurer_id,
                fraud_score=fraud_result.get("fraud_score") or 0.0,
                anomaly_flags=fraud_result.get("flags", []),
                case_file=case_file,
            )
    except Exception as e:
        logger.error(f"Fraud case generation failed for claim {claim_id}: {e}")


async def _ensure_fraud_result(claim: dict, insurer_id: str) -> dict:
    """Run the statistical fraud model for the claim and persist the result.

    Fraud scoring is insurer-side: it runs here, inside adjudication — never at
    provider submission. The model reads `claims.fraud_signal`, the clinical
    signal captured from the claim form when the claim was submitted. A result
    already on the row (e.g. from a prior adjudication) is reused. A high or
    extreme score additionally triggers structured FraudCaseFile generation."""
    if claim.get("fraud_risk_level"):
        return {
            "risk_level": claim.get("fraud_risk_level"),
            "fraud_score": claim.get("fraud_score"),
            "flags": claim.get("fraud_flags") or [],
        }
    try:
        result = await fraud_detector.analyze_claim(_build_fraud_signal(claim))
    except Exception as e:
        logger.error(f"Adjudication fraud scoring failed for {claim.get('id')}: {e}")
        result = {"risk_level": "insufficient_data", "fraud_score": None, "flags": []}
    try:
        supabase.table("claims").update({
            "fraud_risk_level": result.get("risk_level"),
            "fraud_score": result.get("fraud_score"),
            "fraud_flags": result.get("flags", []),
        }).eq("id", claim["id"]).execute()
    except Exception as e:
        logger.warning(f"Could not persist fraud result for {claim.get('id')}: {e}")
    if str(result.get("risk_level") or "").lower() in {"high", "extreme"}:
        await _ensure_fraud_case(claim["id"], insurer_id, result)
    return result


def _has_policy(insurer_id: str) -> bool:
    """True if the insurer has at least one embedded policy chunk on file."""
    try:
        res = (supabase.table("policy_chunks")
               .select("id").eq("insurer_id", insurer_id).limit(1).execute())
        return bool(res.data)
    except Exception as e:
        logger.warning(f"Policy presence check failed for insurer {insurer_id}: {e}")
        return False


def _gate_verdict(decision: str, path: str, rationale: str, evidence: list) -> dict:
    """A verdict produced without the LLM — by the fraud gate or the policy check."""
    return {
        "decision": decision,
        "path": path,
        "rationale": rationale,
        "evidence": evidence or [],
        "policy_basis": [],
    }


async def adjudicate_claim(*, claim_id: str, insurer_id: str,
                           actor_id: str, force: bool = False) -> dict:
    """Adjudicate one claim for the given insurer. Returns
    {cached, status, adjudication}. Raises ClaimNotFound if the claim does not
    belong to this insurer."""
    claim_res = (supabase.table("claims").select("*")
                 .eq("id", claim_id).eq("payer_id", insurer_id)
                 .maybe_single().execute())
    if not claim_res.data:
        raise ClaimNotFound(claim_id)
    claim = claim_res.data

    # Cached — first-open adjudication already ran. `force` re-runs it.
    if claim.get("adjudicated_at") and not force:
        return {
            "cached": True,
            "status": claim.get("status"),
            "adjudication": claim.get("adjudication") or {},
        }

    fraud = await _ensure_fraud_result(claim, insurer_id)
    risk = str(fraud.get("risk_level") or "").lower()
    fraud_score = fraud.get("fraud_score")
    fraud_flags = fraud.get("flags") or []
    auth_status = str(claim.get("auth_check_status") or "").lower()
    llm_verdict = None

    # ── Pre-auth contradiction hard-gate ──────────────────────────────────
    # A claim whose patient identity, coding, or provider contradicts the
    # pre-authorisation it cites is auto-denied — the authorisation does not
    # cover it. Checked first: it takes precedence over every other gate.
    if auth_status == "contradiction":
        auth_detail = claim.get("auth_check_detail") or (
            "The claim's details contradict the pre-authorisation it cites."
        )
        # The verify step writes each mismatch as a "- …" bullet line.
        finding_lines = [
            ln.strip()[2:].strip()
            for ln in auth_detail.splitlines()
            if ln.strip().startswith("- ")
        ]
        verdict = _gate_verdict(
            "deny", "auth_contradiction",
            ("This claim was automatically denied. The information submitted on "
             "the claim contradicts the approved pre-authorisation it cites, so "
             "the authorisation does not cover this claim. "
             + auth_detail.split("\n")[0]),
            [{"step": "authorization", "finding": f} for f in finding_lines]
            or [{"step": "authorization", "finding": auth_detail}],
        )
    # ── Fraud hard-gate ───────────────────────────────────────────────────
    elif risk == "extreme":
        verdict = _gate_verdict(
            "deny", "fraud_gate_extreme",
            (f"This claim was automatically denied. Statistical fraud screening "
             f"returned an extreme anomaly score ({fraud_score}%), which exceeds "
             f"the auto-denial threshold. Recommend routing to fraud case review "
             f"before any payment is released."),
            [{"step": "billing_integrity", "finding": f} for f in fraud_flags],
        )
    elif risk == "high":
        verdict = _gate_verdict(
            "escalate", "fraud_gate_high",
            (f"This claim has been escalated to a human reviewer. Statistical "
             f"fraud screening returned a high anomaly score ({fraud_score}%); "
             f"automatic payment is withheld pending manual review."),
            [{"step": "billing_integrity", "finding": f} for f in fraud_flags],
        )
    elif risk in ("insufficient_data", ""):
        verdict = _gate_verdict(
            "escalate", "fraud_gate_insufficient_data",
            ("This claim has been escalated to a human reviewer. It does not "
             "contain enough structured clinical data to complete an automated "
             "fraud and coding assessment, so a reviewer should verify it manually."),
            [],
        )
    # ── Low risk → policy check, then LLM ─────────────────────────────────
    elif not _has_policy(insurer_id):
        verdict = _gate_verdict(
            "escalate", "no_policy",
            ("This claim has been escalated to a human reviewer. This payer has "
             "no policy document on file, so the claim cannot be automatically "
             "adjudicated against payer-specific rules."),
            [],
        )
    else:
        llm_verdict = await run_claim_adjudication_llm(claim, insurer_id, fraud)
        verdict = {
            "decision": llm_verdict["decision"],
            "path": "llm",
            "rationale": llm_verdict["rationale"],
            "evidence": llm_verdict["evidence"],
            "policy_basis": llm_verdict["policy_basis"],
        }

    decision = verdict["decision"]
    status = _DECISION_TO_STATUS.get(decision, "escalated")
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    adjudication = {
        **verdict,
        "status": status,
        "fraud": {
            "risk_level": risk or None,
            "fraud_score": fraud_score,
            "flags": fraud_flags,
        },
        "adjudicated_by": "ai",
        "adjudicated_at": now_iso,
    }

    try:
        supabase.table("claims").update({
            "status": status,
            "adjudication": adjudication,
            "adjudication_decision": decision,
            "adjudicated_at": now_iso,
        }).eq("id", claim_id).execute()
    except Exception as e:
        logger.error(f"Failed to persist adjudication for {claim_id}: {e}")
        raise

    # ── Immutable audit trail ─────────────────────────────────────────────
    audit.record_event(
        action="claim_adjudicated", category="decision",
        actor_id=actor_id, tenant_type="insurer", tenant_id=insurer_id,
        target_type="claim", target_id=claim_id,
        summary=f"Claim auto-adjudicated: {decision} via {verdict['path']}",
        metadata={
            "decision": decision, "status": status, "path": verdict["path"],
            "fraud_risk_level": risk or None, "fraud_score": fraud_score,
            "forced": force,
        },
    )
    if llm_verdict is not None:
        audit.record_ai_inference(
            event_type="claim_adjudication",
            model_version="groq-llama-3.3",
            prompt_template_name="ADJUDICATION_SYSTEM_PROMPT",
            input_data={
                "diagnosis_codes": claim.get("diagnosis_codes"),
                "procedure_codes": claim.get("procedure_codes"),
                "billed_amount": claim.get("total_billed"),
                "auth_check_status": claim.get("auth_check_status"),
            },
            output_data=adjudication,
            actor_id=actor_id, tenant_type="insurer", tenant_id=insurer_id,
            claim_id=claim_id,
            summary=f"AI claim adjudication — {decision}",
        )

    return {"cached": False, "status": status, "adjudication": adjudication}
