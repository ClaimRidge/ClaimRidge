import logging
from fastapi import APIRouter, Depends, HTTPException
from core.security import get_current_user
from core.database import supabase

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
