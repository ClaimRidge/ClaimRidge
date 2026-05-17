import logging
from fastapi import APIRouter, Depends, HTTPException
from core.security import get_current_user
from core.database import supabase
from services import audit

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/user", tags=["user"])


@router.delete("/account")
async def delete_account(current_user = Depends(get_current_user)):
    """
    Deletes the current user and any organisation they solely own.

    Cascade behaviour:
      - Provider admin: also deletes their provider_org row (so the license
        number is freed up for re-use). Doctors who were linked to that org
        keep their accounts; their profile.provider_org_id is set to NULL by
        the FK ON DELETE SET NULL, and the doctor_org_links row is removed
        via ON DELETE CASCADE.
      - Insurance admin: keeps the insurers row (it may have other staff or
        pre-auth history). Only the user's profile + auth row are removed.
      - Doctor: just deletes the user; the provider_org and its other staff
        are untouched.
      - auth.users delete cascades to public.profiles via the FK.
    """
    user_id = current_user.id
    logger.info(f"Delete account request for user {user_id}")

    try:
        # Look up what we're about to delete so we can clean dependent rows.
        prof_res = supabase.table("profiles") \
            .select("account_type, provider_org_id, insurer_id") \
            .eq("id", user_id).maybe_single().execute()
        profile = prof_res.data or {}

        provider_org_id = profile.get("provider_org_id")
        account_type = profile.get("account_type")

        # If a provider admin is leaving, drop their org so the license number
        # is free again.
        if account_type == "provider" and provider_org_id:
            try:
                supabase.table("provider_orgs").delete().eq("id", provider_org_id).execute()
                logger.info(f"Deleted provider_org {provider_org_id} owned by user {user_id}")
            except Exception as e:
                logger.warning(f"Could not delete provider_org {provider_org_id}: {e}")

        # Immutable audit event — recorded before the auth row is removed so
        # the profile is still resolvable for scoping.
        audit.record_event(
            action="account_deleted", category="action",
            actor_id=user_id, target_type="account", target_id=user_id,
            summary=f"Account deleted ({account_type or 'unknown'})",
            metadata={"account_type": account_type, "provider_org_id": provider_org_id},
        )

        # Delete the auth user — cascades to public.profiles via FK.
        res = supabase.auth.admin.delete_user(user_id)
        if getattr(res, "error", None):
            raise HTTPException(status_code=500, detail=f"Failed to delete account: {res.error}")
        return {"status": "success", "message": "Account deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete account for user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete account: {str(e)}")


from datetime import datetime, timezone
from pydantic import BaseModel


class WaitlistSubmit(BaseModel):
    email: str
    password: str
    account_type: str
    details: dict


def _require_admin(user_id: str):
    """Resolve the caller's profile and assert they are an admin."""
    prof_res = supabase.table("profiles") \
        .select("account_type") \
        .eq("id", user_id).maybe_single().execute()
    profile = (prof_res.data if prof_res else None) or {}
    if profile.get("account_type") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can manage waitlist requests.")


@router.post("/waitlist")
async def submit_waitlist(payload: WaitlistSubmit):
    """Public endpoint — an organisation applies for access.

    No auth account and no tenant row (insurers / provider_orgs / profiles) is
    created here. The application sits in `waitlist_requests` as `pending`
    until an admin approves it via `/waitlist/{id}/approve`.
    """
    account_type = (payload.account_type or "").strip().lower()
    if account_type not in ("provider", "insurance"):
        raise HTTPException(status_code=400, detail="account_type must be 'provider' or 'insurance'.")

    email = (payload.email or "").strip().lower()
    if not email or not payload.password:
        raise HTTPException(status_code=400, detail="Email and password are required.")

    try:
        # Block a second application from the same email while one is open or
        # already approved (a rejected applicant may re-apply).
        existing = supabase.table("waitlist_requests") \
            .select("id, status").eq("email", email).execute()
        for row in (existing.data or []):
            if row["status"] == "pending":
                raise HTTPException(status_code=400, detail="An application for this email is already under review.")
            if row["status"] == "approved":
                raise HTTPException(status_code=400, detail="This email already has an approved account.")

        # Block emails that already belong to an active account.
        prof = supabase.table("profiles").select("id").ilike("contact_email", email).execute()
        if prof.data:
            raise HTTPException(status_code=400, detail="This email is already registered in the system.")

        supabase.table("waitlist_requests").insert({
            "email": email,
            "password": payload.password,
            "account_type": account_type,
            "details": payload.details or {},
        }).execute()

        return {"status": "success", "message": "Waitlist request submitted successfully."}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error submitting waitlist request: {e}")
        raise HTTPException(status_code=500, detail="Failed to submit waitlist request.")


@router.get("/waitlist")
async def list_waitlist(current_user = Depends(get_current_user)):
    """Admin-only — pending applications awaiting review.

    Deliberately omits `password` from the response so the stored credential
    never reaches the browser.
    """
    _require_admin(current_user.id)
    res = supabase.table("waitlist_requests") \
        .select("id, email, account_type, details, status, created_at") \
        .eq("status", "pending") \
        .order("created_at", desc=True) \
        .execute()
    return {"requests": res.data or []}


@router.post("/waitlist/{request_id}/reject")
async def reject_waitlist(request_id: str, current_user = Depends(get_current_user)):
    """Admin-only — decline an application. No account is created."""
    _require_admin(current_user.id)

    req_res = supabase.table("waitlist_requests").select("*").eq("id", request_id).maybe_single().execute()
    req = req_res.data if req_res else None
    if not req:
        raise HTTPException(status_code=404, detail="Waitlist request not found.")
    if req["status"] != "pending":
        raise HTTPException(status_code=400, detail="Request has already been processed.")

    supabase.table("waitlist_requests").update({
        "status": "rejected",
        "reviewed_by": current_user.id,
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", request_id).execute()

    audit.record_event(
        action="waitlist_rejected", category="action",
        actor_id=current_user.id, target_type="waitlist_request", target_id=request_id,
        summary=f"Waitlist application rejected ({req.get('account_type')})",
        metadata={"email": req.get("email"), "account_type": req.get("account_type")},
    )
    return {"status": "success", "message": "Waitlist request rejected."}


@router.post("/waitlist/{request_id}/approve")
async def approve_waitlist(request_id: str, current_user = Depends(get_current_user)):
    """Admin-only — approve an application and transactionally create the account.

    Creates the auth user, the tenant row (insurers / provider_orgs) and the
    profile. On any failure every partially-created row is rolled back so a
    retry starts clean.
    """
    import random
    import string

    _require_admin(current_user.id)

    req_res = supabase.table("waitlist_requests").select("*").eq("id", request_id).maybe_single().execute()
    req = req_res.data if req_res else None
    if not req:
        raise HTTPException(status_code=404, detail="Waitlist request not found.")
    if req["status"] != "pending":
        raise HTTPException(status_code=400, detail="Request has already been processed.")

    email = req["email"]
    password = req["password"]
    account_type = req["account_type"]
    details = req.get("details") or {}

    new_user_id = None
    created_insurer_id = None
    created_org_id = None
    try:
        # 1. Create the auth user with the service role key.
        auth_res = supabase.auth.admin.create_user({
            "email": email,
            "password": password,
            "email_confirm": True,
        })
        user_data = getattr(auth_res, "user", None)
        if not user_data:
            err_msg = getattr(auth_res, "error", None) or "Failed to create authentication user."
            raise Exception(str(err_msg))
        new_user_id = user_data.id

        # 2. Create the tenant row + profile depending on account type.
        if account_type == "insurance":
            insurer_res = supabase.table("insurers").insert({
                "name": details.get("companyNameEn"),
                "name_ar": details.get("companyNameAr") or None,
                "cbj_operations_license": details.get("cbjLicense"),
                "commercial_license_number": details.get("commercialLicense"),
                "country": details.get("country"),
                "config": {"policy_file_name": details.get("policyFileName")},
            }).execute()
            if not insurer_res.data:
                raise Exception("Failed to insert insurer details.")
            created_insurer_id = insurer_res.data[0]["id"]

            supabase.table("profiles").upsert({
                "id": new_user_id,
                "account_type": "insurance",
                "insurer_id": created_insurer_id,
                "role": "admin",
                "contact_email": email,
                "full_name": details.get("companyNameEn"),
                "approved": True,
            }).execute()

            # Embed the medical policy handbook if one was attached.
            policy_base64 = details.get("policyFileBase64")
            if policy_base64:
                try:
                    from services.ai_services import process_and_embed_policy_file
                    await process_and_embed_policy_file(created_insurer_id, policy_base64)
                    audit.record_event(
                        action="policy_uploaded", category="action",
                        actor_id=new_user_id, tenant_type="insurer", tenant_id=created_insurer_id,
                        target_type="insurer", target_id=created_insurer_id,
                        summary="Medical policy handbook uploaded and embedded",
                    )
                except Exception as policy_err:
                    logger.error(f"Policy embedding failed during waitlist approval for {email}: {policy_err}")
        else:  # provider
            org_code = "ORG-" + "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
            org_res = supabase.table("provider_orgs").insert({
                "name": details.get("legalNameEn"),
                "name_ar": details.get("legalNameAr") or None,
                "org_code": org_code,
                "license_number": details.get("licenseNumber"),
                "address": details.get("address"),
                "contact_email": details.get("primaryEmail") or email,
            }).execute()
            if not org_res.data:
                raise Exception("Failed to insert provider organisation details.")
            created_org_id = org_res.data[0]["id"]

            supabase.table("profiles").upsert({
                "id": new_user_id,
                "account_type": "provider",
                "provider_org_id": created_org_id,
                "contact_email": details.get("primaryEmail") or email,
                "full_name": details.get("legalNameEn"),
                "approved": True,
            }).execute()

        # 3. Mark the waitlist request as approved.
        supabase.table("waitlist_requests").update({
            "status": "approved",
            "reviewed_by": current_user.id,
            "reviewed_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", request_id).execute()

        audit.record_event(
            action="waitlist_approved", category="action",
            actor_id=current_user.id, target_type="account", target_id=new_user_id,
            summary=f"Waitlist application approved — {account_type} account created",
            metadata={"email": email, "account_type": account_type},
        )
        return {"status": "success", "message": f"Account for {email} created and approved successfully."}

    except Exception as e:
        # Roll back every partially-created row so a retry starts clean.
        if created_insurer_id:
            try:
                supabase.table("insurers").delete().eq("id", created_insurer_id).execute()
            except Exception as cleanup_err:
                logger.error(f"Failed to cleanup insurer {created_insurer_id}: {cleanup_err}")
        if created_org_id:
            try:
                supabase.table("provider_orgs").delete().eq("id", created_org_id).execute()
            except Exception as cleanup_err:
                logger.error(f"Failed to cleanup provider_org {created_org_id}: {cleanup_err}")
        if new_user_id:
            try:
                supabase.auth.admin.delete_user(new_user_id)
            except Exception as del_err:
                logger.error(f"Failed to cleanup auth user {new_user_id} after failure: {del_err}")
        logger.error(f"Error approving waitlist request: {e}")
        raise HTTPException(status_code=500, detail=f"Approval failed: {e}")
