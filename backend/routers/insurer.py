from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from core.security import get_current_user
from core.database import supabase
from datetime import datetime, timezone

# --- Pydantic Models ---
class ReviewClaimRequest(BaseModel):
    claim_id: str
    action: str
    reason: Optional[str] = None

class AutoAdjudicateRequest(BaseModel):
    claimId: str

# --- Router ---
router = APIRouter(prefix="/api/insurer", tags=["insurer"])

@router.post("/review-claim")
async def review_claim(payload: ReviewClaimRequest, current_user = Depends(get_current_user)):
    profile_res = supabase.table("insurer_profiles").select("id").eq("user_id", current_user.id).execute()
    if not profile_res.data:
        raise HTTPException(status_code=403, detail="Not authorized as insurer")
    
    if payload.action not in ["approved", "rejected", "needs_info"]:
        raise HTTPException(status_code=400, detail="Invalid action")
        
    if payload.action == "rejected" and not (payload.reason and payload.reason.strip()):
        raise HTTPException(status_code=400, detail="Rejection reason is required")

    update_data = {
        "status": payload.action,
        "decided_by": current_user.id,
        "decided_at": datetime.now(timezone.utc).isoformat(),
        "decision_reason": payload.reason or None,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    update_res = supabase.table("insurer_claims").update(update_data).eq("id", payload.claim_id).execute()
    if not update_res.data:
        raise HTTPException(status_code=500, detail="Failed to update claim")
        
    return {"claim": update_res.data[0]}


async def run_auto_adjudicate(claim_id: str, user_id: str):
    claim_res = supabase.table("insurer_claims").select("*").eq("id", claim_id).execute()
    if not claim_res.data:
        return None
    claim = claim_res.data[0]

    rules_res = supabase.table("adjudication_rules").select("*").eq("insurer_id", user_id).eq("is_active", True).execute()
    rules = rules_res.data or []

    triggered_rules = []
    final_action = "auto_approve"
    denial_code = ""
    denial_reason = ""

    procedure_codes = claim.get("procedure_codes") or []
    diagnosis_codes = claim.get("diagnosis_codes") or []
    amount_jod = float(claim.get("amount_jod") or 0)

    for rule in rules:
        triggered = False
        params = rule.get("rule_params", {})
        r_type = rule.get("rule_type")

        if r_type == "cpt_not_covered" and params.get("cpt") in procedure_codes:
            triggered = True
        elif r_type == "dx_not_covered" and params.get("icd10") in diagnosis_codes:
            triggered = True
        elif r_type == "cpt_requires_modifier" and params.get("cpt") in procedure_codes:
            triggered = True
        elif r_type == "amount_threshold" and amount_jod > float(params.get("threshold_jod", 0)):
            triggered = True
        elif r_type == "requires_preauth":
            cpt_list = params.get("cpt_list", [])
            if any(c in cpt_list for c in procedure_codes):
                triggered = True
        elif r_type == "duplicate_claim":
            dup_res = supabase.table("insurer_claims").select("id", count="exact")\
                .eq("patient_name", claim.get("patient_name"))\
                .eq("service_date", claim.get("service_date"))\
                .neq("id", claim.get("id")).execute()
            if dup_res.count and dup_res.count > 0:
                triggered = True

        if triggered:
            triggered_rules.append(rule["rule_name"])
            
            if rule["action"] == "auto_deny":
                final_action = "auto_deny"
                denial_code = rule.get("denial_code", "")
                denial_reason = rule.get("denial_reason", "")
            elif rule["action"] == "require_auth" and final_action != "auto_deny":
                final_action = "require_auth"
            elif rule["action"] == "flag_for_review" and final_action == "auto_approve":
                final_action = "flag_for_review"

    update_data = {
        "adjudication_result": {"action": final_action, "triggered_rules": triggered_rules},
        "triggered_rules": triggered_rules,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    if final_action == "auto_deny":
        update_data.update({
            "status": "rejected", 
            "denial_code": denial_code,
            "decision_reason": f"Auto-adjudicated: {denial_reason}",
            "decided_at": datetime.now(timezone.utc).isoformat()
        })
    elif final_action == "auto_approve" and not triggered_rules:
        update_data.update({
            "status": "approved", 
            "decision_reason": "Auto-approved: passed all adjudication rules",
            "decided_at": datetime.now(timezone.utc).isoformat()
        })

    supabase.table("insurer_claims").update(update_data).eq("id", claim_id).execute()
    return {"action": final_action, "triggered_rules": triggered_rules}


@router.post("/auto-adjudicate")
async def auto_adjudicate_endpoint(payload: AutoAdjudicateRequest, current_user = Depends(get_current_user)):
    result = await run_auto_adjudicate(payload.claimId, current_user.id)
    return result