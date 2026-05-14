"""Provider-admin endpoints: manage staff roster, invitations, and join requests.

All endpoints in this router require the caller to be a provider admin
(`profiles.account_type = 'provider'` with a non-null `provider_org_id`). The
admin can only act on their own organisation.
"""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core.database import supabase
from core.security import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/providers", tags=["providers"])


# --- Pydantic models -------------------------------------------------------
class JoinDecision(BaseModel):
    decision: str  # 'approve' | 'reject'


# --- Helpers ---------------------------------------------------------------
def _require_provider_admin(user_id: str) -> dict:
    """Returns the caller's profile row if they are a provider admin tied to an
    org. Raises HTTP 403 otherwise."""
    res = (
        supabase.table("profiles")
        .select("id, account_type, provider_org_id, full_name, contact_email")
        .eq("id", user_id)
        .maybe_single()
        .execute()
    )
    profile = res.data
    if not profile:
        raise HTTPException(status_code=403, detail="Profile not found.")
    if profile.get("account_type") != "provider":
        raise HTTPException(status_code=403, detail="Provider admin access required.")
    if not profile.get("provider_org_id"):
        raise HTTPException(status_code=403, detail="Your account is not linked to a provider organisation.")
    return profile


# --- Org info --------------------------------------------------------------
@router.get("/me")
async def my_provider_org(current_user=Depends(get_current_user)):
    """Returns the provider org info for the caller, including the shareable code."""
    profile = _require_provider_admin(current_user.id)
    org_res = (
        supabase.table("provider_orgs")
        .select("id, name, name_ar, org_code, license_number, country, contact_email")
        .eq("id", profile["provider_org_id"])
        .maybe_single()
        .execute()
    )
    if not org_res.data:
        raise HTTPException(status_code=404, detail="Provider org not found.")
    return org_res.data


# --- Doctor roster ---------------------------------------------------------
@router.get("/doctors")
async def list_org_doctors(current_user=Depends(get_current_user)):
    """Lists the approved doctors affiliated with the caller's org."""
    profile = _require_provider_admin(current_user.id)
    org_id = profile["provider_org_id"]

    links = (
        supabase.table("doctor_org_links")
        .select("doctor_id, created_at")
        .eq("provider_org_id", org_id)
        .execute()
    )
    doctor_ids = [l["doctor_id"] for l in (links.data or [])]
    if not doctor_ids:
        return []

    docs = (
        supabase.table("profiles")
        .select("id, full_name, contact_email, doctor_specialty, doctor_license_number")
        .in_("id", doctor_ids)
        .execute()
    )
    by_id = {d["id"]: d for d in (docs.data or [])}
    out = []
    for link in links.data or []:
        d = by_id.get(link["doctor_id"])
        if d:
            out.append({**d, "linked_at": link["created_at"]})
    return out


@router.delete("/doctors/{doctor_id}")
async def remove_doctor(doctor_id: str, current_user=Depends(get_current_user)):
    """Removes a doctor's affiliation with the caller's org."""
    profile = _require_provider_admin(current_user.id)
    supabase.table("doctor_org_links").delete().eq(
        "doctor_id", doctor_id
    ).eq("provider_org_id", profile["provider_org_id"]).execute()
    return {"status": "removed"}


# --- Join requests ---------------------------------------------------------
@router.get("/join-requests")
async def list_join_requests(
    status: str = "pending",
    current_user=Depends(get_current_user),
):
    """Lists join requests for the caller's org, optionally filtered by status."""
    profile = _require_provider_admin(current_user.id)
    org_id = profile["provider_org_id"]

    q = supabase.table("doctor_join_requests").select("*").eq("provider_org_id", org_id)
    if status and status != "all":
        q = q.eq("status", status)
    requests_res = q.order("created_at", desc=True).execute()
    rows = requests_res.data or []
    if not rows:
        return []

    doctor_ids = list({r["doctor_id"] for r in rows})
    docs = (
        supabase.table("profiles")
        .select("id, full_name, contact_email, doctor_specialty, doctor_license_number")
        .in_("id", doctor_ids)
        .execute()
    )
    by_id = {d["id"]: d for d in (docs.data or [])}
    return [{**r, "doctor": by_id.get(r["doctor_id"])} for r in rows]


@router.post("/join-requests/{request_id}/decision")
async def decide_join_request(
    request_id: str,
    payload: JoinDecision,
    current_user=Depends(get_current_user),
):
    """Approve or reject a doctor's join request."""
    profile = _require_provider_admin(current_user.id)
    org_id = profile["provider_org_id"]

    decision = payload.decision.lower().strip()
    if decision not in {"approve", "reject"}:
        raise HTTPException(status_code=400, detail="decision must be 'approve' or 'reject'.")

    req_res = (
        supabase.table("doctor_join_requests")
        .select("id, doctor_id, provider_org_id, status")
        .eq("id", request_id)
        .maybe_single()
        .execute()
    )
    if not req_res.data:
        raise HTTPException(status_code=404, detail="Join request not found.")
    req = req_res.data
    if req["provider_org_id"] != org_id:
        raise HTTPException(status_code=403, detail="Request is not for your organisation.")
    if req["status"] != "pending":
        raise HTTPException(status_code=409, detail=f"Request already {req['status']}.")

    new_status = "approved" if decision == "approve" else "rejected"
    supabase.table("doctor_join_requests").update({
        "status": new_status,
        "decided_by": current_user.id,
        "decided_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", request_id).execute()

    if new_status == "approved":
        # Idempotent insert into doctor_org_links
        try:
            supabase.table("doctor_org_links").insert({
                "doctor_id": req["doctor_id"],
                "provider_org_id": org_id,
            }).execute()
        except Exception as e:
            # Treat duplicate as success
            logger.info(f"doctor_org_links insert skipped (likely already linked): {e}")

    return {"status": new_status}


