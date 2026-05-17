"""ClaimRidge Assistant — a read-only, tool-using agent for all three portals.

POST /api/assistant — a general assistant that answers questions about whatever
the caller can already see in their own portal. It is strictly READ-ONLY and
strictly tenant-scoped:

  - insurer staff  → their insurer's claims, pre-auths, flagged activity, policy
  - provider admin → their organisation's + all affiliated doctors' submissions
  - doctor         → only their own submissions

The LLM is given a set of tools; every tool hard-filters by the caller's scope.
The model cites each fact with `[#N]` markers that map to the `sources` list, so
the UI can show exactly which record/passage a statement was drawn from.
"""

import json
import logging
import re
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from pydantic import BaseModel

from core.database import supabase
from core.security import get_current_user
from services.ai_services import get_embeddings, get_llm
from services import audit

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/assistant", tags=["assistant"])

MAX_TOOL_HOPS = 6
MAX_HISTORY = 12
_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I
)


# ============================================================================
# Caller scope
# ============================================================================
class Caller:
    """Resolved identity + tenant scope of the person using the assistant."""

    def __init__(self, role, user_id, insurer_id=None, provider_org_id=None,
                 member_ids=None, label=""):
        self.role = role  # 'insurer' | 'provider' | 'doctor'
        self.user_id = user_id
        self.insurer_id = insurer_id
        self.provider_org_id = provider_org_id
        self.member_ids = member_ids or []  # provider: org member user ids
        self.label = label

    @property
    def portal(self) -> str:
        return {"insurer": "insurance", "provider": "provider", "doctor": "doctor"}[self.role]


def _resolve_caller(user_id: str) -> Caller:
    res = (
        supabase.table("profiles")
        .select("account_type, insurer_id, provider_org_id, full_name")
        .eq("id", user_id)
        .maybe_single()
        .execute()
    )
    prof = res.data
    if not prof:
        raise HTTPException(status_code=403, detail="Profile not found.")
    acct = prof.get("account_type")

    if acct == "insurance":
        insurer_id = prof.get("insurer_id")
        if not insurer_id:
            raise HTTPException(status_code=403, detail="No insurer linked to your profile.")
        name = ""
        try:
            ins = supabase.table("insurers").select("name").eq("id", insurer_id).maybe_single().execute()
            name = (ins.data or {}).get("name") or ""
        except Exception:
            pass
        return Caller("insurer", user_id, insurer_id=insurer_id, label=name or "your insurer")

    if acct == "provider":
        org_id = prof.get("provider_org_id")
        if not org_id:
            raise HTTPException(
                status_code=403,
                detail="Your account is not linked to a provider organisation.",
            )
        # Claims/pre-auths are scoped by submitter; gather every org member's id
        # (the admin + affiliated doctors) so the admin governs the whole org.
        members = {user_id}
        try:
            links = (
                supabase.table("doctor_org_links")
                .select("doctor_id")
                .eq("provider_org_id", org_id)
                .execute()
            )
            for l in links.data or []:
                if l.get("doctor_id"):
                    members.add(l["doctor_id"])
        except Exception as e:
            logger.warning(f"Assistant: could not load org members: {e}")
        name = ""
        try:
            org = supabase.table("provider_orgs").select("name").eq("id", org_id).maybe_single().execute()
            name = (org.data or {}).get("name") or ""
        except Exception:
            pass
        return Caller("provider", user_id, provider_org_id=org_id,
                      member_ids=list(members), label=name or "your organisation")

    if acct == "doctor":
        return Caller("doctor", user_id, label=prof.get("full_name") or "you")

    raise HTTPException(status_code=403, detail="Your account type cannot use the assistant.")


# --- Scope filters (applied inside every data tool) ------------------------
def _scope_claims(q, caller: Caller):
    if caller.role == "insurer":
        return q.eq("payer_id", caller.insurer_id)
    if caller.role == "provider":
        return q.in_("user_id", caller.member_ids or ["__none__"])
    return q.eq("user_id", caller.user_id)


def _scope_preauths(q, caller: Caller):
    if caller.role == "insurer":
        return q.eq("insurer_id", caller.insurer_id)
    if caller.role == "provider":
        return q.in_("submitted_by", caller.member_ids or ["__none__"])
    return q.eq("submitted_by", caller.user_id)


# ============================================================================
# RAG helper (policy handbook)
# ============================================================================
def _run_policy_search(insurer_id: str, query: str, top_k: int) -> List[dict]:
    top_k = max(1, min(int(top_k or 5), 8))
    try:
        vec = get_embeddings().embed_query(query)
    except Exception as e:
        logger.error(f"Assistant: embedding failed: {e}")
        return []
    try:
        rpc = supabase.rpc("match_policy_rules", {
            "query_embedding": vec,
            "match_threshold": 0.25,
            "match_count": top_k,
            "p_insurer_id": insurer_id,
        }).execute()
        return rpc.data or []
    except Exception as e:
        logger.error(f"Assistant: match_policy_rules failed: {e}")
        return []


# ============================================================================
# Tools — each returns a list of "evidence items":
#   {key, type, title, snippet, detail, link?, similarity?}
# `detail` is what the LLM reasons over; `snippet` is the human-facing preview.
# ============================================================================
def _claim_amount(c: dict) -> float:
    try:
        return float(c.get("total_billed") or c.get("billed_amount") or 0)
    except (TypeError, ValueError):
        return 0.0


def tool_search_policy(caller: Caller, args: dict) -> List[dict]:
    if caller.role != "insurer" or not caller.insurer_id:
        return []
    query = str(args.get("query") or "").strip()
    if not query:
        return []
    rows = _run_policy_search(caller.insurer_id, query, args.get("top_k", 5))
    return [{
        "key": f"policy:{r['id']}",
        "type": "policy",
        "title": "Policy handbook excerpt",
        "snippet": r["content"],
        "detail": r["content"],
        "similarity": float(r.get("similarity") or 0.0),
        "link": None,
    } for r in rows]


def _claim_item(caller: Caller, r: dict, kind: str = "claim") -> dict:
    cnum = r.get("claim_number") or str(r.get("id"))
    amt = _claim_amount(r)
    detail = {
        "claim_number": cnum,
        "patient_name": r.get("patient_name"),
        "payer": r.get("payer_name") or r.get("payer_name_raw"),
        "provider": r.get("provider_name"),
        "status": r.get("status"),
        "billed_amount": amt,
        "currency": r.get("currency") or "JOD",
        "date_of_service": r.get("date_of_service"),
        "diagnosis_codes": r.get("diagnosis_codes"),
        "procedure_codes": r.get("procedure_codes"),
        "scrub_passed": r.get("scrub_passed"),
        "fraud_score": r.get("fraud_score"),
        "fraud_risk_level": r.get("fraud_risk_level"),
        "fraud_flags": r.get("fraud_flags"),
        "ai_recommendation": r.get("ai_recommendation"),
        "auth_check_status": r.get("auth_check_status"),
        "pre_auth_number": r.get("pre_auth_number"),
        "created_at": r.get("created_at"),
    }
    return {
        "key": f"claim:{r['id']}",
        "type": kind,
        "title": f"Claim {cnum}",
        "snippet": (
            f"{r.get('patient_name') or 'Unknown patient'} · "
            f"{r.get('status') or 'no status'} · {amt:,.2f} {r.get('currency') or 'JOD'}"
            + (f" · fraud risk {r.get('fraud_risk_level')}" if r.get("fraud_risk_level") else "")
        ),
        "detail": detail,
        "link": (f"/dashboard/{caller.portal}/claims/{r['id']}/results"
                 if caller.role in ("provider", "doctor") else None),
    }


def tool_query_claims(caller: Caller, args: dict) -> List[dict]:
    status = (args.get("status") or "").strip().lower()
    search = (args.get("search") or "").strip()
    limit = max(1, min(int(args.get("limit") or 20), 50))
    q = _scope_claims(supabase.table("claims").select("*"), caller)
    if status:
        q = q.eq("status", status)
    if search:
        safe = search.replace(",", " ").replace("%", "")
        q = q.or_(f"patient_name.ilike.%{safe}%,claim_number.ilike.%{safe}%")
    rows = (q.order("created_at", desc=True).limit(limit).execute().data) or []
    return [_claim_item(caller, r) for r in rows]


def tool_query_flagged_claims(caller: Caller, args: dict) -> List[dict]:
    limit = max(1, min(int(args.get("limit") or 20), 50))
    q = _scope_claims(supabase.table("claims").select("*"), caller)
    q = q.in_("fraud_risk_level", ["high", "extreme", "High", "Extreme"])
    rows = (q.order("fraud_score", desc=True).limit(limit).execute().data) or []
    return [_claim_item(caller, r, kind="flagged_claim") for r in rows]


def tool_query_preauths(caller: Caller, args: dict) -> List[dict]:
    status = (args.get("status") or "").strip().lower()
    search = (args.get("search") or "").strip()
    limit = max(1, min(int(args.get("limit") or 20), 50))
    q = _scope_preauths(supabase.table("pre_auth_requests").select("*"), caller)
    if status:
        q = q.eq("status", status)
    if search:
        safe = search.replace(",", " ").replace("%", "")
        q = q.or_(f"patient_name.ilike.%{safe}%,reference_number.ilike.%{safe}%")
    rows = (q.order("created_at", desc=True).limit(limit).execute().data) or []
    items = []
    for r in rows:
        ref = r.get("reference_number") or str(r.get("id"))
        detail = {
            "reference_number": ref,
            "patient_name": r.get("patient_name"),
            "provider": r.get("provider_name"),
            "status": r.get("status"),
            "routing_status": r.get("routing_status"),
            "priority": r.get("priority"),
            "valid_until": r.get("valid_until"),
            "diagnosis_codes": r.get("diagnosis_codes") or r.get("diagnosis_code"),
            "procedure_codes": r.get("procedure_codes") or r.get("procedure_code"),
            "sla_deadline": r.get("sla_deadline"),
            "created_at": r.get("created_at"),
        }
        items.append({
            "key": f"preauth:{r['id']}",
            "type": "pre_auth",
            "title": f"Pre-Auth {ref}",
            "snippet": (
                f"{r.get('patient_name') or 'Unknown patient'} · "
                f"{r.get('status') or 'no status'}"
            ),
            "detail": detail,
            "link": None,
        })
    return items


def tool_get_stats(caller: Caller, args: dict) -> List[dict]:
    claims = (_scope_claims(supabase.table("claims").select("*"), caller)
              .limit(500).execute().data) or []
    preauths = (_scope_preauths(supabase.table("pre_auth_requests").select("*"), caller)
                .limit(500).execute().data) or []

    claim_status: dict = {}
    for c in claims:
        s = (c.get("status") or "unknown").lower()
        claim_status[s] = claim_status.get(s, 0) + 1
    approved = sum(1 for c in claims if (c.get("status") or "").lower() in ("approved", "approve"))
    denied = sum(1 for c in claims if (c.get("status") or "").lower() in ("denied", "rejected", "deny"))
    decided = approved + denied
    flagged = sum(1 for c in claims if (c.get("fraud_risk_level") or "").lower() in ("high", "extreme"))

    pa = {"approved": 0, "pending": 0, "escalated": 0, "denied": 0, "unrouted": 0}
    for p in preauths:
        if (p.get("routing_status") or "").lower() == "unrouted":
            pa["unrouted"] += 1
            continue
        s = (p.get("status") or "").lower()
        if s in ("approve", "approved"):
            pa["approved"] += 1
        elif s in ("escalate", "escalated"):
            pa["escalated"] += 1
        elif s in ("deny", "denied", "rejected"):
            pa["denied"] += 1
        else:
            pa["pending"] += 1

    detail = {
        "scope": caller.label,
        "claims": {
            "total": len(claims),
            "by_status": claim_status,
            "total_billed": round(sum(_claim_amount(c) for c in claims), 2),
            "approved": approved,
            "denied": denied,
            "approval_rate_pct": round(approved / decided * 100) if decided else None,
            "flagged_high_or_extreme_risk": flagged,
            "coverage_note": "Based on the 500 most recent claims."
            if len(claims) >= 500 else "All claims in scope.",
        },
        "pre_auths": {
            "total": len(preauths),
            "by_decision": pa,
            "coverage_note": "Based on the 500 most recent pre-auths."
            if len(preauths) >= 500 else "All pre-auths in scope.",
        },
    }
    return [{
        "key": "stats:summary",
        "type": "stats",
        "title": "Live system metrics",
        "snippet": f"{len(claims)} claims · {len(preauths)} pre-auths in {caller.label}",
        "detail": detail,
        "link": None,
    }]


def tool_query_network(caller: Caller, args: dict) -> List[dict]:
    items: List[dict] = []
    if caller.role == "insurer":
        rows = (_scope_claims(supabase.table("claims").select("provider_name"), caller)
                .limit(500).execute().data) or []
        prows = (_scope_preauths(supabase.table("pre_auth_requests").select("provider_name"), caller)
                 .limit(500).execute().data) or []
        counts: dict = {}
        for r in rows + prows:
            n = (r.get("provider_name") or "").strip()
            if n and n.lower() != "pending extraction":
                counts[n] = counts.get(n, 0) + 1
        for n, c in sorted(counts.items(), key=lambda x: -x[1])[:25]:
            items.append({
                "key": f"provider:{n}", "type": "network", "title": n,
                "snippet": f"{c} submission(s) to {caller.label}",
                "detail": {"provider_name": n, "submission_count": c}, "link": None,
            })
    elif caller.role == "provider":
        links = (supabase.table("doctor_org_links").select("doctor_id")
                 .eq("provider_org_id", caller.provider_org_id).execute().data) or []
        ids = [l["doctor_id"] for l in links if l.get("doctor_id")]
        docs = []
        if ids:
            docs = (supabase.table("profiles")
                    .select("id, full_name, doctor_specialty, contact_email")
                    .in_("id", ids).execute().data) or []
        for d in docs:
            items.append({
                "key": f"doctor:{d['id']}", "type": "network",
                "title": d.get("full_name") or "Doctor",
                "snippet": d.get("doctor_specialty") or "Affiliated doctor",
                "detail": d, "link": None,
            })
    else:  # doctor
        links = (supabase.table("doctor_org_links").select("provider_org_id, created_at")
                 .eq("doctor_id", caller.user_id).execute().data) or []
        oids = [l["provider_org_id"] for l in links if l.get("provider_org_id")]
        orgs = []
        if oids:
            orgs = (supabase.table("provider_orgs").select("id, name, org_code")
                    .in_("id", oids).execute().data) or []
        for o in orgs:
            items.append({
                "key": f"org:{o['id']}", "type": "network",
                "title": o.get("name") or "Hospital",
                "snippet": f"Affiliated hospital · {o.get('org_code') or ''}",
                "detail": o, "link": None,
            })
    return items


def tool_get_record_detail(caller: Caller, args: dict) -> List[dict]:
    kind = (args.get("kind") or "").strip().lower()
    ident = (args.get("identifier") or "").strip()
    if not ident:
        return []

    if kind in ("claim", "claims"):
        rows = (_scope_claims(supabase.table("claims").select("*"), caller)
                .eq("claim_number", ident).limit(1).execute().data) or []
        if not rows and _UUID_RE.match(ident):
            rows = (_scope_claims(supabase.table("claims").select("*"), caller)
                    .eq("id", ident).limit(1).execute().data) or []
        return [_claim_item(caller, rows[0])] if rows else []

    if kind in ("pre_auth", "preauth", "pre-auth", "pre_auths"):
        rows = (_scope_preauths(supabase.table("pre_auth_requests").select("*"), caller)
                .eq("reference_number", ident).limit(1).execute().data) or []
        if not rows and _UUID_RE.match(ident):
            rows = (_scope_preauths(supabase.table("pre_auth_requests").select("*"), caller)
                    .eq("id", ident).limit(1).execute().data) or []
        if not rows:
            return []
        return tool_query_preauths(caller, {"search": rows[0].get("reference_number") or "", "limit": 1})

    return []


# ============================================================================
# Tool schemas (OpenAI-style for ChatGroq.bind_tools)
# ----------------------------------------------------------------------------
# Numeric arguments (limit, top_k) are declared as `string`, not `integer`:
# the Groq llama model emits tool-call args as quoted strings and Groq strictly
# validates the generated call against this schema, so an `integer` type 400s.
# The tool functions coerce with int() defensively.
# ============================================================================
def _fn(name, description, properties, required):
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": {"type": "object", "properties": properties, "required": required},
        },
    }


TOOL_SCHEMAS = {
    "search_policy_handbook": _fn(
        "search_policy_handbook",
        "Search the insurer's uploaded medical policy handbook by semantic similarity. "
        "Use for any question about coverage, exclusions, prior-auth requirements or clinical criteria.",
        {
            "query": {"type": "string", "description": "A focused topic, condition or procedure name."},
            "top_k": {"type": "string", "description": "Number of excerpts to return, 1-8, passed as a string. Default 5."},
        },
        ["query"],
    ),
    "query_claims": _fn(
        "query_claims",
        "List recent claims in the user's scope. Use for questions about claims — counts, "
        "statuses, amounts, a specific patient's claims, etc.",
        {
            "status": {"type": "string", "description": "Optional exact status filter (e.g. approved, denied, submitted)."},
            "search": {"type": "string", "description": "Optional patient name or claim number to search for."},
            "limit": {"type": "string", "description": "Max rows, 1-50, passed as a string. Default 20."},
        },
        [],
    ),
    "query_flagged_claims": _fn(
        "query_flagged_claims",
        "List claims flagged as high or extreme fraud risk in the user's scope, highest score first.",
        {"limit": {"type": "string", "description": "Max rows, 1-50, passed as a string. Default 20."}},
        [],
    ),
    "query_pre_auths": _fn(
        "query_pre_auths",
        "List recent pre-authorisation requests in the user's scope.",
        {
            "status": {"type": "string", "description": "Optional exact status filter."},
            "search": {"type": "string", "description": "Optional patient name or reference number."},
            "limit": {"type": "string", "description": "Max rows, 1-50, passed as a string. Default 20."},
        },
        [],
    ),
    "get_stats": _fn(
        "get_stats",
        "Get aggregate metrics for the user's scope — claim counts by status, total billed, "
        "approval rate, fraud-flagged count, and the pre-auth decision mix. Use for "
        "'how are we doing', overviews and any counting/rate question.",
        {},
        [],
    ),
    "query_network": _fn(
        "query_network",
        "List the people/organisations connected to this account: for an insurer, the "
        "providers submitting to them; for a provider, their affiliated doctors; for a "
        "doctor, their hospital affiliations.",
        {},
        [],
    ),
    "get_record_detail": _fn(
        "get_record_detail",
        "Fetch the full detail of one specific claim or pre-authorisation by its number.",
        {
            "kind": {"type": "string", "description": "'claim' or 'pre_auth'."},
            "identifier": {"type": "string", "description": "The claim number or pre-auth reference number."},
        },
        ["kind", "identifier"],
    ),
}

TOOL_FUNCS = {
    "search_policy_handbook": tool_search_policy,
    "query_claims": tool_query_claims,
    "query_flagged_claims": tool_query_flagged_claims,
    "query_pre_auths": tool_query_preauths,
    "get_stats": tool_get_stats,
    "query_network": tool_query_network,
    "get_record_detail": tool_get_record_detail,
}

ALLOWED_TOOLS = {
    "insurer": ["search_policy_handbook", "query_claims", "query_flagged_claims",
                "query_pre_auths", "get_stats", "query_network", "get_record_detail"],
    "provider": ["query_claims", "query_flagged_claims", "query_pre_auths",
                 "get_stats", "query_network", "get_record_detail"],
    "doctor": ["query_claims", "query_flagged_claims", "query_pre_auths",
               "get_stats", "query_network", "get_record_detail"],
}


def _system_prompt(caller: Caller) -> str:
    who = {
        "insurer": f"the health insurer **{caller.label}**",
        "provider": f"the healthcare provider organisation **{caller.label}**",
        "doctor": f"Dr. {caller.label}",
    }[caller.role]
    scope = {
        "insurer": "claims submitted to this insurer, pre-authorisation requests in its "
                   "queue, fraud-flagged activity, and its uploaded medical policy handbook",
        "provider": "claims and pre-authorisation requests submitted by this organisation "
                    "and all of its affiliated doctors",
        "doctor": "the claims and pre-authorisation requests this doctor has submitted",
    }[caller.role]
    return f"""You are the ClaimRidge Assistant, a read-only AI helper for {who}.

You answer questions about what is happening inside ClaimRidge for this account: {scope}.

## Hard rules
1. You are READ-ONLY. You can look things up — you can never change, approve, deny or
   submit anything. If asked to act, explain that you can only provide information.
2. Use the tools for EVERY factual question — never answer operational questions from
   memory. The tools already return only data this user is permitted to see.
3. Ground every answer in tool results. If the tools return nothing relevant, say so
   plainly — never invent claims, numbers, codes, statuses or policy rules.
4. Cite your sources: after any fact drawn from a tool result, append `[#N]` where N is
   that result's `citation` number. A sentence may cite several, e.g. `[#1][#3]`.
5. Do not write your own "Sources" list — the interface renders source cards from your
   `[#N]` citations.

## Style
- Concise and professional, plain English for a healthcare-operations user.
- Short paragraphs or bullet points. Quote concrete numbers, statuses, codes and dates.
- For broad questions ("how are we doing?") call `get_stats` and summarise.
- Politely decline anything unrelated to this account's ClaimRidge data.
"""


# ============================================================================
# Wire models
# ============================================================================
class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage] = []


class Source(BaseModel):
    citation: int
    type: str
    title: str
    snippet: str
    similarity: Optional[float] = None
    link: Optional[str] = None


class ChatResponse(BaseModel):
    answer: str
    sources: List[Source]
    tool_calls: int


@router.get("/status")
async def assistant_status(current_user=Depends(get_current_user)):
    """Tells the chat UI who the caller is and (for insurers) whether a policy
    handbook has been uploaded."""
    caller = _resolve_caller(current_user.id)
    has_policy = False
    if caller.role == "insurer":
        try:
            c = (supabase.table("policy_chunks").select("id", count="exact")
                 .eq("insurer_id", caller.insurer_id).limit(1).execute())
            has_policy = bool(c.count and c.count > 0)
        except Exception:
            pass
    return {"role": caller.role, "scope_label": caller.label, "has_policy": has_policy}


@router.post("", response_model=ChatResponse)
async def assistant_chat(payload: ChatRequest, current_user=Depends(get_current_user)):
    """Read-only, tool-using assistant scoped to the caller's portal."""
    caller = _resolve_caller(current_user.id)
    allowed = ALLOWED_TOOLS[caller.role]
    schemas = [TOOL_SCHEMAS[n] for n in allowed]

    messages = [SystemMessage(content=_system_prompt(caller))]
    for m in payload.history[-MAX_HISTORY:]:
        if m.role == "user":
            messages.append(HumanMessage(content=m.content))
        elif m.role == "assistant":
            messages.append(AIMessage(content=m.content))
    messages.append(HumanMessage(content=payload.message))

    llm = get_llm().bind_tools(schemas)

    # Every evidence item surfaced across the conversation, deduped by key and
    # numbered 1-based in first-seen order so the model can cite [#N].
    seen: dict = {}
    tool_calls_used = 0

    for _ in range(MAX_TOOL_HOPS):
        response = await llm.ainvoke(messages)
        tcs = getattr(response, "tool_calls", None) or []
        messages.append(response)
        if not tcs:
            break

        for call in tcs:
            tool_calls_used += 1
            name = call.get("name") or (call.get("function") or {}).get("name")
            raw = call.get("args") or (call.get("function") or {}).get("arguments") or {}
            try:
                args = json.loads(raw) if isinstance(raw, str) else dict(raw)
            except Exception:
                args = {}
            tcid = call.get("id") or call.get("tool_call_id") or ""

            if name not in allowed or name not in TOOL_FUNCS:
                messages.append(ToolMessage(
                    content=json.dumps({"error": f"Tool '{name}' is not available to you."}),
                    tool_call_id=tcid,
                ))
                continue

            try:
                items = TOOL_FUNCS[name](caller, args)
            except Exception as e:
                logger.error(f"Assistant tool '{name}' failed: {e}")
                messages.append(ToolMessage(
                    content=json.dumps({"error": "That lookup failed to run."}),
                    tool_call_id=tcid,
                ))
                continue

            results = []
            for it in items:
                k = it["key"]
                if k not in seen:
                    seen[k] = {"citation": len(seen) + 1, **it}
                entry = seen[k]
                row = {
                    "citation": entry["citation"],
                    "type": entry["type"],
                    "title": entry["title"],
                    "detail": entry["detail"],
                }
                if entry.get("similarity") is not None:
                    row["similarity"] = round(entry["similarity"], 3)
                results.append(row)

            messages.append(ToolMessage(
                content=json.dumps({
                    "tool": name,
                    "result_count": len(results),
                    "results": results,
                    "instructions": (
                        "Cite every fact you use from these results with [#N] markers, "
                        "where N is the `citation` number. If results are empty, tell the "
                        "user you found nothing rather than guessing."
                    ),
                }, default=str),
                tool_call_id=tcid,
            ))
    else:
        # Hit the hop ceiling — force a final answer with no more tool calls.
        final = await get_llm().ainvoke(messages + [HumanMessage(
            content="Write your final answer now using only what the tools already "
                    "returned. Cite with [#N] markers."
        )])
        messages.append(final)

    answer = ""
    for m in reversed(messages):
        if isinstance(m, AIMessage):
            content = m.content if isinstance(m.content, str) else str(m.content)
            if content and content.strip():
                answer = content
                break

    sources = [
        Source(
            citation=e["citation"],
            type=e["type"],
            title=e["title"],
            snippet=(e.get("snippet") or "")[:600],
            similarity=e.get("similarity"),
            link=e.get("link"),
        )
        for e in sorted(seen.values(), key=lambda x: x["citation"])
    ]
    audit.record_ai_inference(
        event_type="assistant_query",
        model_version="groq-llama-3.3",
        prompt_template_name="assistant",
        prompt_text=payload.message,
        input_data={"message": payload.message},
        output_data={
            "answer": answer,
            "tool_calls": tool_calls_used,
            "source_count": len(sources),
        },
        actor_id=current_user.id,
        summary="Assistant query answered",
    )

    return ChatResponse(
        answer=answer or "(no answer produced)",
        sources=sources,
        tool_calls=tool_calls_used,
    )
