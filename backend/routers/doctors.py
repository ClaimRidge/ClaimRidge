"""Doctor-side endpoints for joining a provider organisation by code or invite.

These endpoints are called by authenticated doctor accounts (created via the
normal Supabase auth flow with `profiles.account_type = 'doctor'`).
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core.database import supabase
from core.security import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/doctors", tags=["doctors"])


class JoinByCodeRequest(BaseModel):
    org_code: str
    message: Optional[str] = None


class AcceptInviteRequest(BaseModel):
    token: str


def _require_doctor(user_id: str) -> dict:
    res = (
        supabase.table("profiles")
        .select("id, account_type, contact_email")
        .eq("id", user_id)
        .maybe_single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=403, detail="Profile not found.")
    if res.data.get("account_type") != "doctor":
        raise HTTPException(status_code=403, detail="Doctor account required.")
    return res.data


@router.get("/affiliations")
async def list_my_affiliations(current_user=Depends(get_current_user)):
    """Returns the orgs this doctor is linked to + their pending join requests."""
    _require_doctor(current_user.id)

    links = (
        supabase.table("doctor_org_links")
        .select("provider_org_id, created_at")
        .eq("doctor_id", current_user.id)
        .execute()
    )
    pending = (
        supabase.table("doctor_join_requests")
        .select("id, provider_org_id, status, created_at, message")
        .eq("doctor_id", current_user.id)
        .order("created_at", desc=True)
        .execute()
    )

    org_ids = list({l["provider_org_id"] for l in (links.data or [])} |
                   {p["provider_org_id"] for p in (pending.data or [])})
    orgs_by_id = {}
    if org_ids:
        orgs = supabase.table("provider_orgs").select(
            "id, name, org_code, country, contact_email"
        ).in_("id", org_ids).execute()
        orgs_by_id = {o["id"]: o for o in (orgs.data or [])}

    return {
        "affiliations": [
            {"org": orgs_by_id.get(l["provider_org_id"]), "linked_at": l["created_at"]}
            for l in (links.data or [])
        ],
        "requests": [
            {**p, "org": orgs_by_id.get(p["provider_org_id"])}
            for p in (pending.data or [])
        ],
    }


@router.post("/join-by-code")
async def join_by_code(payload: JoinByCodeRequest, current_user=Depends(get_current_user)):
    """Creates a pending join request against the org identified by `org_code`."""
    _require_doctor(current_user.id)

    code = (payload.org_code or "").strip()
    if not code:
        raise HTTPException(status_code=400, detail="org_code is required.")

    org_res = (
        supabase.table("provider_orgs")
        .select("id, name, org_code")
        .eq("org_code", code)
        .maybe_single()
        .execute()
    )
    if not org_res.data:
        raise HTTPException(status_code=404, detail="No organisation matches that code.")
    org_id = org_res.data["id"]

    # If already linked, nothing to do.
    existing_link = (
        supabase.table("doctor_org_links")
        .select("doctor_id")
        .eq("doctor_id", current_user.id)
        .eq("provider_org_id", org_id)
        .execute()
    )
    if existing_link.data:
        return {"status": "already_linked", "org": org_res.data}

    # If a pending request already exists, return it.
    existing_req = (
        supabase.table("doctor_join_requests")
        .select("id, status")
        .eq("doctor_id", current_user.id)
        .eq("provider_org_id", org_id)
        .eq("status", "pending")
        .execute()
    )
    if existing_req.data:
        return {"status": "already_pending", "request_id": existing_req.data[0]["id"]}

    insert_res = supabase.table("doctor_join_requests").insert({
        "doctor_id": current_user.id,
        "provider_org_id": org_id,
        "message": payload.message,
    }).execute()
    if not insert_res.data:
        raise HTTPException(status_code=500, detail="Failed to create join request.")

    return {"status": "pending", "request": insert_res.data[0], "org": org_res.data}


@router.post("/accept-invite")
async def accept_invite(payload: AcceptInviteRequest, current_user=Depends(get_current_user)):
    """Accepts an email invitation token. Invited doctors are auto-linked
    (no admin approval needed — the admin already vetted them when issuing
    the invite)."""
    doctor = _require_doctor(current_user.id)

    inv_res = (
        supabase.table("doctor_invitations")
        .select("*")
        .eq("token", payload.token)
        .maybe_single()
        .execute()
    )
    if not inv_res.data:
        raise HTTPException(status_code=404, detail="Invitation not found.")
    inv = inv_res.data

    if inv["status"] != "pending":
        raise HTTPException(status_code=409, detail=f"Invitation is {inv['status']}.")
    expires_at = inv.get("expires_at")
    if expires_at and datetime.fromisoformat(expires_at.replace("Z", "+00:00")) < datetime.now(timezone.utc):
        supabase.table("doctor_invitations").update({"status": "expired"}).eq("id", inv["id"]).execute()
        raise HTTPException(status_code=410, detail="Invitation has expired.")

    invited_email = (inv.get("invited_email") or "").lower()
    caller_email = (doctor.get("contact_email") or "").lower()
    if invited_email and caller_email and invited_email != caller_email:
        raise HTTPException(
            status_code=403,
            detail="This invitation was issued to a different email address.",
        )

    org_id = inv["provider_org_id"]
    # Auto-link
    try:
        supabase.table("doctor_org_links").insert({
            "doctor_id": current_user.id,
            "provider_org_id": org_id,
        }).execute()
    except Exception as e:
        logger.info(f"doctor_org_links insert skipped (already linked): {e}")

    supabase.table("doctor_invitations").update({
        "status": "accepted",
        "accepted_by": current_user.id,
        "accepted_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", inv["id"]).execute()

    org_res = supabase.table("provider_orgs").select(
        "id, name, org_code"
    ).eq("id", org_id).maybe_single().execute()

    return {"status": "linked", "org": org_res.data}


@router.get("/invitation-preview/{token}")
async def invitation_preview(token: str):
    """Public endpoint — used by the signup page to show *which* org an
    invitation belongs to before the doctor creates their account. Returns
    minimal info; the heavier `accept-invite` requires auth."""
    inv_res = (
        supabase.table("doctor_invitations")
        .select("provider_org_id, invited_email, status, expires_at")
        .eq("token", token)
        .maybe_single()
        .execute()
    )
    if not inv_res.data:
        raise HTTPException(status_code=404, detail="Invitation not found.")
    inv = inv_res.data
    if inv["status"] != "pending":
        return {"valid": False, "reason": inv["status"]}

    expires_at = inv.get("expires_at")
    if expires_at and datetime.fromisoformat(expires_at.replace("Z", "+00:00")) < datetime.now(timezone.utc):
        return {"valid": False, "reason": "expired"}

    org_res = (
        supabase.table("provider_orgs")
        .select("id, name, org_code, country")
        .eq("id", inv["provider_org_id"])
        .maybe_single()
        .execute()
    )
    return {
        "valid": True,
        "invited_email": inv["invited_email"],
        "org": org_res.data,
    }
