"""Audit Trail & Compliance service.

The single write path for the append-only, hash-chained `audit_log`. Every
meaningful action in the platform flows through `record_event`; AI calls also
go through `record_ai_inference`; patient-record views through `log_pii_access`.

This module is intentionally PURE — it performs no AI/LLM calls. It only hashes
and writes. Logging must never break the operation it is recording, so every
public function swallows its own errors.
"""

import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Optional

from core.database import supabase

logger = logging.getLogger(__name__)

GENESIS = "GENESIS"


# ── helpers ────────────────────────────────────────────────────────────────
def _canonical(obj) -> str:
    """Deterministic JSON — stable key order — so a hash is reproducible."""
    return json.dumps(obj, sort_keys=True, default=str, separators=(",", ":"))


def resolve_scope(user_id: str):
    """(role, tenant_type, tenant_id) for a user — used to scope audit events."""
    try:
        r = (supabase.table("profiles")
             .select("account_type, insurer_id, provider_org_id")
             .eq("id", user_id).maybe_single().execute())
        p = r.data or {}
    except Exception:
        p = {}
    acct = p.get("account_type")
    if acct == "insurance":
        return ("insurer", "insurer", p.get("insurer_id"))
    if acct == "provider":
        return ("provider", "provider_org", p.get("provider_org_id"))
    if acct == "doctor":
        return ("doctor", "doctor", user_id)
    return ("unknown", "unknown", None)


def _chain_core(seq, prev, actor_id, actor_role, action, category,
                tenant_type, tenant_id, target_type, target_id, summary, metadata):
    """The fields covered by the tamper-evidence hash. `created_at` is left out
    on purpose: the append-only trigger already makes timestamps un-forgeable,
    and timestamptz round-trips are not byte-stable."""
    return {
        "chain_seq": seq,
        "prev_hash": prev,
        "actor_id": str(actor_id) if actor_id else None,
        "actor_role": actor_role,
        "action": action,
        "category": category,
        "tenant_type": tenant_type,
        "tenant_id": str(tenant_id) if tenant_id else None,
        "target_type": target_type,
        "target_id": str(target_id) if target_id else None,
        "summary": summary,
        "metadata": metadata or {},
    }


# ── the write path ─────────────────────────────────────────────────────────
def record_event(action: str, category: str, *,
                  actor_id: Optional[str] = None,
                  actor_role: Optional[str] = None,
                  tenant_type: Optional[str] = None,
                  tenant_id: Optional[str] = None,
                  target_type: Optional[str] = None,
                  target_id: Optional[str] = None,
                  summary: Optional[str] = None,
                  metadata: Optional[dict] = None) -> Optional[str]:
    """Append one immutable, hash-chained event. Returns the event hash, or
    None if logging failed (never raises — auditing must not break the action).

    `category` is one of: action | decision | ai_inference | pii_access |
    export | erasure | retention.
    """
    try:
        if actor_id and not (tenant_type and tenant_id):
            role, ttype, tid = resolve_scope(actor_id)
            actor_role = actor_role or role
            tenant_type = tenant_type or ttype
            tenant_id = tenant_id or tid

        metadata = metadata or {}
        created_at = datetime.now(timezone.utc).isoformat()

        # Link to the previous event. chain_seq >= 0 skips any legacy pre-chain
        # rows (which sort first under DESC because of NULLS FIRST).
        last = (supabase.table("audit_log")
                .select("chain_seq, event_hash")
                .gte("chain_seq", 0)
                .order("chain_seq", desc=True)
                .limit(1).execute())
        if last.data:
            seq = (last.data[0].get("chain_seq") or 0) + 1
            prev = last.data[0].get("event_hash") or GENESIS
        else:
            seq, prev = 1, GENESIS

        core = _chain_core(seq, prev, actor_id, actor_role, action, category,
                           tenant_type, tenant_id, target_type, target_id,
                           summary, metadata)
        event_hash = hashlib.sha256((prev + "|" + _canonical(core)).encode()).hexdigest()
        payload_hash = hashlib.sha256(_canonical(metadata).encode()).hexdigest()

        supabase.table("audit_log").insert({
            **core,
            "created_at": created_at,
            "event_hash": event_hash,
            "payload_hash": payload_hash,
        }).execute()
        return event_hash
    except Exception as e:
        logger.error(f"audit.record_event failed (action={action}): {e}")
        return None


def record_ai_inference(*, event_type: str, model_version: str,
                        prompt_template_name: Optional[str] = None,
                        prompt_text: Optional[str] = None,
                        input_data: Optional[dict] = None,
                        output_data: Optional[dict] = None,
                        confidence_score: Optional[float] = None,
                        latency_ms: Optional[int] = None,
                        actor_id: Optional[str] = None,
                        tenant_type: Optional[str] = None,
                        tenant_id: Optional[str] = None,
                        claim_id: Optional[str] = None,
                        pre_auth_id: Optional[str] = None,
                        summary: Optional[str] = None) -> None:
    """Record one AI call: full model/prompt/input/output in `ai_inference_log`,
    plus a spine event in `audit_log` so it appears in the immutable trail."""
    try:
        if actor_id and not (tenant_type and tenant_id):
            _, tenant_type, tenant_id = resolve_scope(actor_id)

        ins = supabase.table("ai_inference_log").insert({
            "event_type": event_type,
            "model_version": model_version,
            "prompt_template_name": prompt_template_name,
            "prompt_text": (prompt_text or "")[:8000] or None,
            "input_data": input_data or {},
            "output_data": output_data or {},
            "confidence_score": confidence_score,
            "latency_ms": latency_ms,
            "actor_id": actor_id,
            "tenant_type": tenant_type,
            "tenant_id": tenant_id,
            "claim_id": claim_id,
            "pre_auth_id": pre_auth_id,
        }).execute()
        inference_id = ins.data[0]["id"] if ins.data else None
    except Exception as e:
        logger.error(f"audit.record_ai_inference insert failed ({event_type}): {e}")
        inference_id = None

    record_event(
        action=event_type,
        category="ai_inference",
        actor_id=actor_id,
        tenant_type=tenant_type,
        tenant_id=tenant_id,
        target_type="claim" if claim_id else ("pre_auth" if pre_auth_id else None),
        target_id=claim_id or pre_auth_id,
        summary=summary or f"AI inference: {event_type}",
        metadata={
            "inference_id": inference_id,
            "model_version": model_version,
            "prompt_template": prompt_template_name,
            "confidence_score": confidence_score,
            "latency_ms": latency_ms,
        },
    )


def log_pii_access(*, actor_id: str, subject_type: str, subject_id: str,
                   subject_label: Optional[str] = None,
                   purpose: Optional[str] = None,
                   fields: Optional[list] = None) -> Optional[str]:
    """Record that a user viewed patient-identifying data — who / when / what /
    why. `purpose` is the auto-captured context (e.g. 'claim adjudication')."""
    return record_event(
        action=f"view_{subject_type}",
        category="pii_access",
        actor_id=actor_id,
        target_type=subject_type,
        target_id=subject_id,
        summary=f"Viewed patient data on {subject_label or subject_type}",
        metadata={
            "purpose": purpose or "unspecified",
            "fields_accessed": fields or ["patient_identifying_data"],
            "subject_label": subject_label,
        },
    )


# ── tamper-evidence verification ───────────────────────────────────────────
def verify_chain() -> dict:
    """Walk the whole hash chain and confirm no event was altered, removed or
    re-ordered. Returns {valid, events_verified, broken_at_seq?, last_hash}."""
    try:
        rows = (supabase.table("audit_log")
                .select("*")
                .gte("chain_seq", 0)
                .order("chain_seq", desc=False)
                .limit(10000).execute().data) or []
    except Exception as e:
        logger.error(f"audit.verify_chain read failed: {e}")
        return {"valid": False, "error": "Could not read the audit log.",
                "events_verified": 0}

    prev = GENESIS
    for r in rows:
        core = _chain_core(
            r.get("chain_seq"), prev, r.get("actor_id"), r.get("actor_role"),
            r.get("action"), r.get("category"), r.get("tenant_type"),
            r.get("tenant_id"), r.get("target_type"), r.get("target_id"),
            r.get("summary"), r.get("metadata") or {},
        )
        expected = hashlib.sha256((prev + "|" + _canonical(core)).encode()).hexdigest()
        if r.get("prev_hash") != prev or r.get("event_hash") != expected:
            return {
                "valid": False,
                "broken_at_seq": r.get("chain_seq"),
                "events_verified": rows.index(r),
                "total_events": len(rows),
            }
        prev = r["event_hash"]

    return {
        "valid": True,
        "events_verified": len(rows),
        "total_events": len(rows),
        "last_hash": prev,
    }
