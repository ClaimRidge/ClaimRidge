"""Audit Trail & Compliance API — available to all three portals.

Read endpoints are tenant-scoped: insurer staff see their insurer's events,
a provider admin sees their organisation's (incl. all affiliated doctors'),
a doctor sees their own. The write side goes through `services/audit.py`.
"""

import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core.database import supabase
from core.security import get_current_user
from services import audit

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/audit", tags=["audit"])

_NIL = "00000000-0000-0000-0000-000000000000"


# ── caller scope ───────────────────────────────────────────────────────────
def _resolve_caller(user_id: str) -> dict:
    res = (supabase.table("profiles")
           .select("account_type, insurer_id, provider_org_id, full_name")
           .eq("id", user_id).maybe_single().execute())
    prof = res.data
    if not prof:
        raise HTTPException(status_code=403, detail="Profile not found.")
    acct = prof.get("account_type")

    if acct == "insurance":
        if not prof.get("insurer_id"):
            raise HTTPException(status_code=403, detail="No insurer linked to your profile.")
        label = ""
        try:
            ins = supabase.table("insurers").select("name").eq("id", prof["insurer_id"]).maybe_single().execute()
            label = (ins.data or {}).get("name") or ""
        except Exception:
            pass
        return {"role": "insurer", "user_id": user_id, "tenant_id": prof["insurer_id"],
                "member_ids": [], "label": label or "Insurer"}

    if acct == "provider":
        org_id = prof.get("provider_org_id")
        if not org_id:
            raise HTTPException(status_code=403, detail="Your account is not linked to an organisation.")
        members = {user_id}
        try:
            links = supabase.table("doctor_org_links").select("doctor_id").eq("provider_org_id", org_id).execute()
            for l in links.data or []:
                if l.get("doctor_id"):
                    members.add(l["doctor_id"])
        except Exception:
            pass
        label = ""
        try:
            org = supabase.table("provider_orgs").select("name").eq("id", org_id).maybe_single().execute()
            label = (org.data or {}).get("name") or ""
        except Exception:
            pass
        return {"role": "provider", "user_id": user_id, "tenant_id": org_id,
                "member_ids": list(members), "label": label or "Provider"}

    if acct == "doctor":
        return {"role": "doctor", "user_id": user_id, "tenant_id": user_id,
                "member_ids": [user_id], "label": prof.get("full_name") or "Doctor"}

    raise HTTPException(status_code=403, detail="Your account type cannot access the audit trail.")


def _apply_scope(q, caller: dict):
    """Scope a query on a table that has `tenant_id` + `actor_id` columns."""
    if caller["role"] == "insurer":
        return q.eq("tenant_id", caller["tenant_id"])
    if caller["role"] == "provider":
        ids = ",".join(caller["member_ids"]) if caller["member_ids"] else _NIL
        return q.or_(f"tenant_id.eq.{caller['tenant_id']},actor_id.in.({ids})")
    return q.eq("actor_id", caller["user_id"])


def _hydrate_actors(rows: list) -> list:
    """Attach a human-readable `actor_name` to each row (the log stores ids)."""
    ids = list({r.get("actor_id") for r in rows if r.get("actor_id")})
    names: dict = {}
    if ids:
        try:
            res = supabase.table("profiles").select("id, full_name").in_("id", ids).execute()
            names = {p["id"]: p.get("full_name") for p in (res.data or [])}
        except Exception:
            pass
    for r in rows:
        r["actor_name"] = names.get(r.get("actor_id"))
    return rows


# ── event log ──────────────────────────────────────────────────────────────
@router.get("/events")
async def list_events(
    category: Optional[str] = None,
    limit: int = 200,
    current_user=Depends(get_current_user),
):
    caller = _resolve_caller(current_user.id)
    limit = max(1, min(limit, 500))
    q = _apply_scope(supabase.table("audit_log").select("*"), caller)
    if category and category != "all":
        q = q.eq("category", category)
    rows = (q.order("created_at", desc=True).limit(limit).execute().data) or []
    return {"scope_label": caller["label"], "role": caller["role"],
            "events": _hydrate_actors(rows)}


@router.get("/ai-inferences")
async def list_ai_inferences(limit: int = 200, current_user=Depends(get_current_user)):
    caller = _resolve_caller(current_user.id)
    limit = max(1, min(limit, 500))
    q = _apply_scope(supabase.table("ai_inference_log").select("*"), caller)
    rows = (q.order("created_at", desc=True).limit(limit).execute().data) or []
    return {"inferences": _hydrate_actors(rows)}


@router.get("/verify")
async def verify(current_user=Depends(get_current_user)):
    """Re-hash the whole chain and report whether it is intact."""
    _resolve_caller(current_user.id)  # auth gate only — the chain is global
    return audit.verify_chain()


# ── PII access ─────────────────────────────────────────────────────────────
class PiiAccessBody(BaseModel):
    subject_type: str           # 'claim' | 'pre_auth'
    subject_id: str
    subject_label: Optional[str] = None
    purpose: Optional[str] = None       # auto-captured context from the page
    fields: Optional[List[str]] = None


@router.post("/pii-access")
async def log_pii(body: PiiAccessBody, current_user=Depends(get_current_user)):
    """Called by record-detail pages when a user opens patient-identifying data."""
    _resolve_caller(current_user.id)
    audit.log_pii_access(
        actor_id=current_user.id,
        subject_type=body.subject_type,
        subject_id=body.subject_id,
        subject_label=body.subject_label,
        purpose=body.purpose,
        fields=body.fields,
    )
    return {"status": "logged"}


# ── data retention ─────────────────────────────────────────────────────────
def _scope_records(table: str, caller: dict):
    q = supabase.table(table).select("*")
    if table == "claims":
        if caller["role"] == "insurer":
            return q.eq("payer_id", caller["tenant_id"])
        if caller["role"] == "provider":
            return q.in_("user_id", caller["member_ids"] or [_NIL])
        return q.eq("user_id", caller["user_id"])
    # pre_auth_requests
    if caller["role"] == "insurer":
        return q.eq("insurer_id", caller["tenant_id"])
    if caller["role"] == "provider":
        return q.in_("submitted_by", caller["member_ids"] or [_NIL])
    return q.eq("submitted_by", caller["user_id"])


@router.get("/retention")
async def retention(current_user=Depends(get_current_user)):
    """Per-record retention horizons for the caller's claims and pre-auths."""
    caller = _resolve_caller(current_user.id)
    now = datetime.now(timezone.utc)

    def summarise(table: str, label_field: str):
        rows = (_scope_records(table, caller)
                .order("created_at", desc=True).limit(500).execute().data) or []
        items, expired, soon = [], 0, 0
        for r in rows:
            ru = r.get("retention_until")
            if ru:
                try:
                    dt = datetime.fromisoformat(str(ru).replace("Z", "+00:00"))
                    days = (dt - now).days
                    if days < 0:
                        expired += 1
                    elif days <= 90:
                        soon += 1
                except Exception:
                    days = None
            else:
                days = None
            items.append({
                "id": r.get("id"),
                "label": r.get(label_field) or r.get("id"),
                "patient_name": r.get("patient_name"),
                "created_at": r.get("created_at"),
                "retention_until": ru,
            })
        return {"total": len(items), "expired": expired, "expiring_soon": soon, "items": items[:100]}

    return {
        "claims": summarise("claims", "claim_number"),
        "pre_auths": summarise("pre_auth_requests", "reference_number"),
        "note": "Retention horizons use a placeholder 7-year default — confirm against the final legal schedule.",
    }


# ── right-to-erasure ───────────────────────────────────────────────────────
class ErasureBody(BaseModel):
    subject_type: str           # 'claim' | 'pre_auth'
    subject_id: str
    subject_label: Optional[str] = None
    reason: Optional[str] = None


@router.get("/erasure")
async def list_erasure(current_user=Depends(get_current_user)):
    caller = _resolve_caller(current_user.id)
    q = supabase.table("erasure_requests").select("*")
    if caller["role"] == "insurer":
        q = q.eq("tenant_id", caller["tenant_id"])
    elif caller["role"] == "provider":
        ids = ",".join(caller["member_ids"]) if caller["member_ids"] else _NIL
        q = q.or_(f"tenant_id.eq.{caller['tenant_id']},requested_by.in.({ids})")
    else:
        q = q.eq("requested_by", caller["user_id"])
    rows = (q.order("created_at", desc=True).limit(200).execute().data) or []
    return {"requests": rows}


@router.post("/erasure")
async def create_erasure(body: ErasureBody, current_user=Depends(get_current_user)):
    caller = _resolve_caller(current_user.id)
    if body.subject_type not in ("claim", "pre_auth"):
        raise HTTPException(status_code=400, detail="subject_type must be 'claim' or 'pre_auth'.")
    ins = supabase.table("erasure_requests").insert({
        "requested_by": caller["user_id"],
        "requester_role": caller["role"],
        "tenant_type": caller["role"],
        "tenant_id": caller["tenant_id"],
        "subject_type": body.subject_type,
        "subject_id": body.subject_id,
        "subject_label": body.subject_label,
        "reason": body.reason,
        "status": "pending",
    }).execute()
    req = ins.data[0] if ins.data else {}
    audit.record_event(
        action="erasure_requested", category="erasure",
        actor_id=caller["user_id"], target_type=body.subject_type,
        target_id=body.subject_id,
        summary=f"Right-to-erasure requested for {body.subject_label or body.subject_type}",
        metadata={"reason": body.reason, "request_id": req.get("id")},
    )
    return {"status": "pending", "request": req}


# PII columns nulled / redacted when an erasure is executed.
_ERASE_CLAIM = {"patient_name": "[ERASED]", "patient_id": "[ERASED]", "member_id": "[ERASED]"}
_ERASE_PREAUTH = {
    "patient_name": "[ERASED]", "patient_id": "[ERASED]", "patient_phone": "[ERASED]",
    "patient_address": "[ERASED]", "insurance_member_id": "[ERASED]",
    "insurance_group_number": "[ERASED]", "patient_dob": None,
}


@router.post("/erasure/{request_id}/execute")
async def execute_erasure(request_id: str, current_user=Depends(get_current_user)):
    """Anonymise the patient PII on the underlying record. The immutable audit
    log is never erased — only the operational record is redacted."""
    caller = _resolve_caller(current_user.id)
    res = supabase.table("erasure_requests").select("*").eq("id", request_id).maybe_single().execute()
    req = res.data
    if not req:
        raise HTTPException(status_code=404, detail="Erasure request not found.")
    if req.get("tenant_id") != caller["tenant_id"] and req.get("requested_by") not in caller["member_ids"]:
        raise HTTPException(status_code=403, detail="That request is not in your scope.")
    if req.get("status") != "pending":
        raise HTTPException(status_code=409, detail=f"Request already {req.get('status')}.")

    try:
        if req["subject_type"] == "claim":
            supabase.table("claims").update(_ERASE_CLAIM).eq("id", req["subject_id"]).execute()
        else:
            supabase.table("pre_auth_requests").update(_ERASE_PREAUTH).eq("id", req["subject_id"]).execute()
            supabase.table("pre_auth_documents").update(
                {"extracted_text": "[ERASED]", "file_base64": None}
            ).eq("pre_auth_id", req["subject_id"]).execute()
    except Exception as e:
        logger.error(f"Erasure execution failed for {request_id}: {e}")
        raise HTTPException(status_code=500, detail="Could not redact the record.")

    supabase.table("erasure_requests").update({
        "status": "completed",
        "executed_at": datetime.now(timezone.utc).isoformat(),
        "executed_by": caller["user_id"],
    }).eq("id", request_id).execute()

    audit.record_event(
        action="erasure_executed", category="erasure",
        actor_id=caller["user_id"], target_type=req["subject_type"],
        target_id=req["subject_id"],
        summary=f"Patient PII anonymised on {req.get('subject_label') or req['subject_type']}",
        metadata={"request_id": request_id},
    )
    return {"status": "completed"}


# ── regulator export ───────────────────────────────────────────────────────
class ExportBody(BaseModel):
    category: Optional[str] = None
    limit: int = 2000


@router.post("/export")
async def export_audit(body: ExportBody, current_user=Depends(get_current_user)):
    """Build a regulator-facing audit dataset (for HCAC / CCHI inspections) and
    log the export itself as an audit event."""
    caller = _resolve_caller(current_user.id)
    limit = max(1, min(body.limit, 5000))

    q = _apply_scope(supabase.table("audit_log").select("*"), caller)
    if body.category and body.category != "all":
        q = q.eq("category", body.category)
    events = (q.order("created_at", desc=True).limit(limit).execute().data) or []

    by_category: dict = {}
    for e in events:
        c = e.get("category") or "uncategorised"
        by_category[c] = by_category.get(c, 0) + 1

    chain = audit.verify_chain()
    generated_at = datetime.now(timezone.utc).isoformat()

    audit.record_event(
        action="audit_export_generated", category="export",
        actor_id=caller["user_id"],
        summary=f"Audit report exported ({len(events)} events)",
        metadata={"event_count": len(events), "category_filter": body.category or "all"},
    )

    return {
        "generated_at": generated_at,
        "generated_by": caller["label"],
        "scope": caller["label"],
        "event_count": len(events),
        "by_category": by_category,
        "chain_integrity": chain,
        "events": events,
    }
