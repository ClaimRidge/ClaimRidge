import io
import asyncio
import json
import logging
import re
import base64
import pypdfium2 as pdfium
from docx import Document
from langchain_groq import ChatGroq
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_text_splitters import RecursiveCharacterTextSplitter
from core.config import Config
from core.database import supabase
from services.fraud_service import fraud_detector
from services.code_lookup import (
    describe_diagnosis,
    describe_procedure,
    format_code_with_description,
)

logger = logging.getLogger(__name__)

# --- PROMPTS ---
PRE_AUTH_SYSTEM_PROMPT = """You are ClaimRidge AI, a clinical triage investigator. The trained statistical fraud model has FLAGGED this pre-auth as {tier_name}-RISK ({fraud_score}%). Your job is NOT to second-guess the score — your job is to investigate WHY by examining the clinical document and the payer policy, and to either confirm the concern with concrete evidence or clear it.

## EXPECTED CLAIM DETAILS (Submitted via Portal)
- Patient Name: **{expected_patient_name}**
- Patient ID: **{expected_patient_id}**
- Expected Age/Gender: **{expected_age} / {expected_gender}**
- Provider Name: **{expected_provider_name}**
- Requested Procedure: **{expected_procedure}**
- Stated Diagnosis: **{expected_diagnosis}**

The Requested Procedure and Stated Diagnosis above show the submitted code followed by its description from the local CPT/ICD-10 catalogue. Use the description to judge whether the clinical narrative in the documents is coherent with what was actually requested. If a description says "(description not in local catalogue)", fall back to the document text and treat the code itself as opaque.

## PAYER POLICY RULES (RAG Context)
{policy_rules}

## STATISTICAL FRAUD MODEL OUTPUT
The trained XGBoost fraud model scored this claim {fraud_score}% (tier: {tier_name}).
Flags: {fraud_flags}

## YOUR INVESTIGATION

STEP 1 — IDENTITY CROSS-VALIDATION
Compare patient name, ID, age, and gender between the Expected Claim Details and the clinical document.
If 2+ fields mismatch or contradict the document → IDENTITY_MISMATCH (concrete finding).

STEP 2 — PROCEDURE & DIAGNOSIS ALIGNMENT
Compare expected procedure / diagnosis / provider name vs. what the clinical document actually describes.
If any do not align, or the document describes an unrelated procedure/patient → CLINICAL_CONTRADICTION (concrete finding).

STEP 3 — CLINICAL NECESSITY & DOCUMENT QUALITY
Evaluate the clinical document against the PAYER POLICY RULES:
- Are documents blank forms or generic instructions? (concrete finding)
- Are standard conservative treatments documented and attempted as the policy requires? (concrete finding if missing)
- Is physician justification present? (concrete finding if missing)

## DECISION

Choose ONE:
- **approve**: After thorough investigation you found NO concrete contradiction or missing requirement. The model may have reacted to a structural pattern that the document evidence rules out. You are explicitly allowed to overturn the model's flag — you have document context the model does not.
- **escalate**: You found at least ONE concrete concern that warrants human review. Provide evidence.{deny_option}

## CONSTRAINTS
- Approve is allowed even though the model flagged this — your document-level investigation is authoritative when it contradicts the score.
- escalate{or_deny} requires concrete evidence: a specific named field, value, document quote, or contradiction. Generic phrases like "fraud system flagged this", "further review", or "thorough examination" are NOT evidence and will be rejected.
- Never escalate or deny just to defer to the model — if you cannot point to something specific, choose approve.{deny_constraint}

## TONE OF THE RATIONALE AND EVIDENCE
The `rationale` and each `finding` will be shown to the provider, the patient's representative, and the insurer's medical reviewer. Write in clear, professional, plain English suitable for a healthcare audience.
- Do NOT mention internal mechanics: no "model", "score", "tier", "fraud system", "XGBoost", "anti-fraud", "statistical layer", or percentages.
- Do NOT use audit/debug language: no "auto-downgrade", "fallback", "flag = TRUE", "Step 1/2/3".
- Speak about the claim itself: what the documents show, which clinical or policy criteria are met or unmet, what specific information is missing.
- Be respectful and constructive. When asking for more information, say what is needed and why.
- Avoid sounding accusatory. Phrase concerns as observations about the documentation, not allegations against the provider.

## OUTPUT
Respond ONLY with valid JSON, no commentary:
{{
    "decision": "approve" | "escalate"{or_deny_schema},
    "rationale": "A clear, professional paragraph (3-5 sentences) explaining the decision in language a provider or patient representative would understand.",
    "evidence": [
        {{
            "step": "identity_validation" | "fraud_prescreen" | "policy_compliance" | "clinical_consistency",
            "finding": "A specific, professionally worded observation — name the field, value, or clinical detail at issue without using debug terminology."
        }}
    ]
}}
"""

DENY_OPTION_TEXT = (
    "\n- **deny**: ONLY available because the model scored EXTREME RISK. Use ONLY when "
    "you have found undeniable, concrete contradictions (identity mismatch, blank/forged documents, "
    "wholly unrelated procedure, etc.) that justify outright refusal. Provide evidence."
)
DENY_CONSTRAINT_TEXT = (
    "\n- deny is reserved for EXTREME-tier claims with irrefutable evidence. If you are "
    "unsure, choose escalate instead — a human reviewer will make the final call."
)

ALLOWED_EVIDENCE_STEPS = {
    "identity_validation",
    "fraud_prescreen",
    "policy_compliance",
    "clinical_consistency",
}

# Tokens that indicate a finding refers to something concrete in the claim or document
# (a field, a value, a contradiction, a quoted phrase) rather than meta-language about
# the review process itself.
CONCRETE_INDICATORS = {
    "name", "id", "age", "gender", "diagnosis", "procedure", "physician", "doctor",
    "patient", "provider", "policy rule", "amount", "date", "code", "field",
    "document", "form", "mismatch", "contradict", "missing", "absent", "blank",
    "quote", "states", "reads", "shows", "reports",
}

GENERIC_PHRASES = (
    "fraud system", "anti-fraud", "high-risk flag", "high risk flag",
    "further review", "further investigation", "necessitates review",
    "thorough examination", "due diligence",
)


def _is_concrete_finding(finding: str) -> bool:
    if not finding or len(finding.strip()) < 30:
        return False
    f_lower = finding.lower()
    if any(ind in f_lower for ind in CONCRETE_INDICATORS):
        # Reject if it's *only* generic boilerplate even though it contains a keyword.
        non_generic = f_lower
        for phrase in GENERIC_PHRASES:
            non_generic = non_generic.replace(phrase, "")
        return len(non_generic.strip()) >= 30
    return False


def _validate_decision(result: dict) -> tuple[bool, str]:
    """Returns (is_valid, reason). Enforces the evidence contract on escalate/deny."""
    if not isinstance(result, dict):
        return False, "response is not a JSON object"
    decision = str(result.get("decision", "")).strip().lower()
    if decision not in {"approve", "deny", "escalate"}:
        return False, f"decision must be approve/deny/escalate, got '{decision}'"
    if decision == "approve":
        return True, ""
    evidence = result.get("evidence")
    if not isinstance(evidence, list) or not evidence:
        return False, f"{decision} decision requires a non-empty evidence array"
    for item in evidence:
        if not isinstance(item, dict):
            continue
        step = str(item.get("step", "")).strip().lower()
        finding = str(item.get("finding", "")).strip()
        if step in ALLOWED_EVIDENCE_STEPS and _is_concrete_finding(finding):
            return True, ""
    return (
        False,
        f"{decision} decision has no concrete evidence: every finding is empty, "
        "too short, or only references the fraud score / generic review language",
    )


EVIDENCE_STEP_LABELS = {
    "identity_validation": "Identity verification",
    "fraud_prescreen": "Risk assessment",
    "policy_compliance": "Policy compliance",
    "clinical_consistency": "Clinical review",
}


def _format_rationale_with_evidence(rationale: str, evidence) -> str:
    if not isinstance(evidence, list) or not evidence:
        return rationale
    items = []
    for item in evidence:
        if not isinstance(item, dict):
            continue
        finding = str(item.get("finding", "")).strip()
        if not finding:
            continue
        step_key = str(item.get("step", "")).strip().lower()
        label = EVIDENCE_STEP_LABELS.get(step_key, "Review note")
        items.append(f"- **{label}:** {finding}")
    if not items:
        return rationale
    return (rationale or "").rstrip() + "\n\n**Supporting observations:**\n\n" + "\n".join(items)

# --- LLM INITIALIZATION ---
def get_vision_llm():
    return ChatGoogleGenerativeAI(
        model=Config.OCR_MODEL, 
        google_api_key=Config.GEMINI_API_KEY, 
        temperature=0.1
    )

def get_llm():
    return ChatGroq(
        api_key=Config.GROQ_API_KEY, 
        model_name=Config.LLM_MODEL, 
        temperature=0.1
    )

def get_embeddings():
    return GoogleGenerativeAIEmbeddings(
        model="models/gemini-embedding-001", 
        google_api_key=Config.GEMINI_API_KEY
    )

# --- UTILITIES ---
def extract_json_from_text(text: str) -> str:
    """Extracts JSON from an LLM response, stripping out markdown formatting."""
    if not text:
        return "{}"
        
    # Clean up standard markdown JSON code blocks
    text = text.replace('```json', '').replace('```', '').strip()
    
    start_idx = text.find('{')
    end_idx = text.rfind('}')
    
    if start_idx != -1 and end_idx != -1 and end_idx >= start_idx:
        return text[start_idx:end_idx + 1]
        
    return "{}" # Return empty JSON object if nothing found

async def extract_text_from_file(base64_data: str, media_type: str) -> str:
    """Extracts text from PDF, Images, or Word documents with high-fidelity formatting."""
    
    # 1. Handle Word Documents (.docx)
    if "word" in media_type or "officedocument" in media_type:
        try:
            doc_bytes = base64.b64decode(base64_data)
            doc = Document(io.BytesIO(doc_bytes))
            full_text = []
            for para in doc.paragraphs:
                if para.text.strip():
                    full_text.append(para.text)
            return "\n".join(full_text)
        except Exception as e:
            logger.error(f"Failed to extract text from Word document: {e}")
            return "Error: Could not read Word document."

    # 2. Handle PDFs and Images via Gemini Vision OCR
    vision_llm = get_vision_llm()
    
    # ENHANCED EXTRACTION PROMPT
    vision_prompt = """
    You are a world-class medical document transcriptionist. 
    Your goal is to extract clinical data from the provided image/document and format it for EXTREME READABILITY.

    ### FORMATTING RULES (STRICT):
    1. MAIN TITLES: Put category names in bold followed by a colon (e.g., **Patient Identification:**).
    2. DATA FIELDS: List sub-titles (labels) followed by their info on separate lines under the main title.
    3. LINE BREAKS: Use a double line break between categories and a single line break between every data field.
       Example:
       **Patient Identification:**
       Medicare Coverage: Yes
       Patient Name: XX YY.

       **Insured Information:**
       Insured's I.D. Number: 987 65 4321A
    
    4. CLEAN UP: IGNORE all boilerplate instructions, footer codes, and "Leave Blank" fields.
    5. NO BOILERPLATE: Do not include text like "DO NOT WRITE IN THIS SPACE" or generic form titles.

    If the document is a blank form with no handwritten or typed data, output exactly: "[NO CLINICAL DATA FOUND - BLANK FORM]"
    """
    
    messages = [
        HumanMessage(content=[
            {"type": "text", "text": vision_prompt},
            {"type": "image_url", "image_url": {"url": f"data:{media_type};base64,{base64_data}"}}
        ])
    ]
    response = await vision_llm.ainvoke(messages)
    return response.content

# --- DEDICATED FRAUD MODEL (NATIVE INTEGRATION) ---
async def check_fraud_system(request_data: dict) -> dict:
    """
    Calls the native XGBoost Fraud Service directly in memory.
    """
    try:
        # Native Python call. Executes in microseconds.
        return await fraud_detector.analyze_claim(request_data)
    except Exception as e:
        logger.error(f"Native Fraud Module failed: {e}. Bypassing statistical check.")
        return {
            "risk_level": "low",
            "fraud_score": 0.0,
            "flags": []
        }


METADATA_EXTRACTION_PROMPT = """You are a medical claim metadata extractor. Read the clinical documents below and extract the following fields. If a field is not clearly present in the documents, return null for that field — do NOT guess.

Fields to extract:
- patient_name: The patient's full name as it appears in the documents.
- patient_id: The patient's national ID, insurance ID, or medical record number.
- patient_age: Integer age in years.
- patient_gender: "Male", "Female", or null.
- patient_state: The patient's state, governorate, or region of residence (e.g. "Amman", "Dubai", "Riyadh"). Null if not stated.
- provider_name: The hospital, clinic, or provider organisation name.
- provider_specialty: The treating physician's specialty or the department issuing the request (e.g. "Cardiology", "Orthopedics", "General Surgery"). Null if not stated.
- diagnosis_code: ICD-10 code if present (e.g. "M54.5"), otherwise null.
- procedure_code: CPT or local procedure code if present, otherwise null.
- visit_type: "Inpatient", "Outpatient", "Emergency", "Day Surgery", or similar — whichever the document indicates. Null if unclear.
- length_of_stay: Numeric expected or actual length of stay in days. For purely outpatient visits, return 1. Null if not stated and not inferable.
- insurance_type: The plan, scheme, or coverage type referenced in the documents (e.g. "Comprehensive", "Basic", "Government", "Corporate"). Null if not stated.
- claim_amount: Numeric requested/billed amount (no currency), otherwise null.

If multiple documents disagree (e.g. two different patient names), pick the value that appears in the most documents and add a note in `extraction_notes`.

Respond ONLY with valid JSON in this exact shape:
{
    "patient_name": string | null,
    "patient_id": string | null,
    "patient_age": integer | null,
    "patient_gender": "Male" | "Female" | null,
    "patient_state": string | null,
    "provider_name": string | null,
    "provider_specialty": string | null,
    "diagnosis_code": string | null,
    "procedure_code": string | null,
    "visit_type": string | null,
    "length_of_stay": number | null,
    "insurance_type": string | null,
    "claim_amount": number | null,
    "extraction_notes": string | null
}
"""


async def extract_metadata_from_docs(combined_text: str) -> dict:
    """Extracts structured claim metadata from OCR'd document text. Returns a dict
    with whichever fields could be confidently identified; missing fields are absent."""
    if not combined_text or not combined_text.strip():
        return {}
    llm = get_llm()
    messages = [
        SystemMessage(content=METADATA_EXTRACTION_PROMPT),
        HumanMessage(content=combined_text[:12000]),
    ]
    try:
        response = await llm.ainvoke(messages)
        parsed = _safe_parse_json(response.content)
    except Exception as e:
        logger.error(f"Metadata extraction failed: {e}")
        return {}

    out = {}
    for key in (
        "patient_name", "patient_id",
        "patient_age", "patient_gender", "patient_state",
        "provider_name", "provider_specialty",
        "diagnosis_code", "procedure_code",
        "visit_type", "length_of_stay", "insurance_type",
        "claim_amount",
    ):
        val = parsed.get(key)
        if val is None:
            continue
        if isinstance(val, str) and not val.strip():
            continue
        out[key] = val
    if parsed.get("extraction_notes"):
        out["extraction_notes"] = parsed["extraction_notes"]
    return out


async def process_pre_auth_case(pre_auth_id: str, insurer_id: str, attachments: list):
    """Background task to handle OCR extraction and AI evaluation."""
    logger.info(f"Starting background processing for Pre-Auth: {pre_auth_id}")

    # 1. Perform OCR on all documents
    for att in attachments:
        try:
            # att is a dict with file_name, content_type, content (base64)
            extracted_text = await extract_text_from_file(att["content"], att["content_type"])

            # Update the existing document record with extracted text
            supabase.table("pre_auth_documents").update({
                "extracted_text": extracted_text
            }).eq("pre_auth_id", pre_auth_id).eq("file_name", att["file_name"]).execute()

        except Exception as e:
            logger.error(f"Background OCR failed for {att['file_name']}: {e}")

    # 2. Pull all OCR'd text back and extract structured metadata from the docs.
    #    This replaces the patient/provider fields the provider used to type into
    #    the dropoff form — we now derive them from the documents themselves.
    docs_res = supabase.table("pre_auth_documents").select(
        "file_name, extracted_text"
    ).eq("pre_auth_id", pre_auth_id).execute()

    if docs_res.data:
        combined = "\n\n".join(
            f"--- {d['file_name']} ---\n{d.get('extracted_text') or ''}"
            for d in docs_res.data
        )
        metadata = await extract_metadata_from_docs(combined)
        if metadata:
            updates = {k: v for k, v in metadata.items() if k != "extraction_notes"}
            if updates:
                logger.info(
                    f"Pre-Auth {pre_auth_id}: extracted metadata fields "
                    f"{list(updates.keys())}"
                )
                try:
                    supabase.table("pre_auth_requests").update(updates).eq(
                        "id", pre_auth_id
                    ).execute()
                except Exception as e:
                    logger.error(f"Failed to persist extracted metadata: {e}")

    # 3. Run the actual clinical evaluation
    await evaluate_pre_auth(pre_auth_id, insurer_id)

# --- CORE SERVICES ---
def _persist_decision(pre_auth_id: str, decision: str, rationale: str):
    new_status = "escalated" if decision == "escalate" else decision
    supabase.table("pre_auth_requests").update({
        "status": new_status,
        "ai_decision": decision,
        "ai_rationale": rationale,
    }).eq("id", pre_auth_id).execute()


def _safe_parse_json(raw: str) -> dict:
    try:
        parsed = json.loads(extract_json_from_text(raw))
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


async def evaluate_pre_auth(pre_auth_id: str, insurer_id: str):
    """Trained model is the gatekeeper. LLM is invoked only on flagged claims to
    investigate the WHY. Outcome tiers:
      - low                      -> auto-approve (skip LLM)
      - insufficient_data        -> escalate to human reviewer for a data-quality
                                    follow-up. NOT a denial — the score is
                                    unreliable, so there is no clinical or policy
                                    basis on which to refuse the claim.
      - high  (>70, <90)         -> LLM may approve or escalate (with evidence)
      - extreme (>=90)           -> LLM may approve, escalate, or deny (with evidence)
    """
    logger.info(f"Starting Evaluation Pipeline for Pre-Auth: {pre_auth_id}")

    # 1. Fetch the Request Details
    req_res = supabase.table("pre_auth_requests").select("*").eq("id", pre_auth_id).execute()
    if not req_res.data:
        logger.error(f"Pre-auth request {pre_auth_id} not found.")
        return
    request_data = req_res.data[0]

    # 2. Run trained statistical model first.
    fraud_result = await check_fraud_system(request_data)
    risk_level = fraud_result.get("risk_level")
    fraud_score = fraud_result.get("fraud_score")
    flags = fraud_result.get("flags", [])

    # 2a. Auto-approve clean claims — skip LLM entirely.
    if risk_level == "low":
        rationale = (
            "This pre-authorisation request has been approved. The submitted "
            "documentation aligns with our standard review criteria, and no "
            "concerns were identified during our automated assessment. The claim "
            "is authorised for processing."
        )
        logger.info(f"Pre-Auth {pre_auth_id}: AUTO-APPROVE (low risk, score={fraud_score}%)")
        _persist_decision(pre_auth_id, "approve", rationale)
        return

    if risk_level == "insufficient_data":
        rationale = (
            "This pre-authorisation request has been forwarded to a medical "
            "reviewer because the supporting documentation does not contain "
            "enough clinical detail to complete an automated review. This is "
            "not a determination on the merits of the request.\n\n"
            "To help the reviewer proceed, please provide complete clinical "
            "records that include:\n"
            "- A clear statement of the diagnosis\n"
            "- The proposed procedure or treatment\n"
            "- Patient demographics (age and gender)\n"
            "- Expected length of stay, where applicable\n"
            "- Supporting clinical justification from the treating physician\n\n"
            "Once the additional information is received, the reviewer will "
            "conduct a full assessment."
        )
        logger.info(
            f"Pre-Auth {pre_auth_id}: ESCALATE (insufficient data — score "
            f"unreliable, routed to human reviewer); flags={flags}"
        )
        _persist_decision(pre_auth_id, "escalate", rationale)
        return

    # 2b. Flagged: high or extreme. Continue to LLM investigation.
    is_extreme = risk_level == "extreme"
    tier_name = "EXTREME" if is_extreme else "HIGH"
    logger.info(
        f"Pre-Auth {pre_auth_id}: flagged {tier_name} (score={fraud_score}%) — "
        "invoking LLM clinical triage."
    )

    # 3. Fetch documents
    docs_res = supabase.table("pre_auth_documents").select(
        "file_name, extracted_text"
    ).eq("pre_auth_id", pre_auth_id).execute()

    if not docs_res.data:
        logger.error(
            f"Pre-Auth {pre_auth_id}: no documents found "
            f"(tier {tier_name}, score={fraud_score}%)"
        )
        _persist_decision(
            pre_auth_id,
            "escalate",
            "This pre-authorisation request has been forwarded to a medical "
            "reviewer for further evaluation. The supporting clinical "
            "documentation was not received with the submission, so we are "
            "unable to complete an automated review. A reviewer will be in "
            "touch to request the necessary records.",
        )
        return

    combined_clinical_context = "=== CLINICAL DOCUMENTS ===\n\n"
    for doc in docs_res.data:
        combined_clinical_context += (
            f"--- Document: {doc['file_name']} ---\n{doc['extracted_text']}\n\n"
        )

    # 4. RAG: Fetch relevant policy rules
    embeddings_model = get_embeddings()
    query_vector = embeddings_model.embed_query(combined_clinical_context[:2000])
    policy_res = supabase.rpc("match_policy_rules", {
        "query_embedding": query_vector,
        "match_threshold": 0.3,
        "match_count": 5,
        "p_insurer_id": insurer_id,
    }).execute()
    policy_rules = "Standard medical necessity guidelines apply."
    if policy_res.data:
        policy_rules = "\n".join([m["content"] for m in policy_res.data])

    # 5. Build tier-aware prompt
    deny_option = DENY_OPTION_TEXT if is_extreme else ""
    deny_constraint = DENY_CONSTRAINT_TEXT if is_extreme else ""
    or_deny_text = " or deny" if is_extreme else ""
    or_deny_schema = ' | "deny"' if is_extreme else ""
    fraud_flags_str = "; ".join(flags) if flags else "(no specific flags)"

    procedure_code = request_data.get("procedure_code")
    diagnosis_code = request_data.get("diagnosis_code")
    expected_procedure = format_code_with_description(
        procedure_code, describe_procedure(procedure_code)
    )
    expected_diagnosis = format_code_with_description(
        diagnosis_code, describe_diagnosis(diagnosis_code)
    )

    prompt = PRE_AUTH_SYSTEM_PROMPT.format(
        tier_name=tier_name,
        fraud_score=fraud_score,
        fraud_flags=fraud_flags_str,
        expected_patient_name=request_data.get("patient_name", "Unknown"),
        expected_patient_id=request_data.get("patient_id", "Unknown"),
        expected_provider_name=request_data.get("provider_name", "Unknown"),
        expected_age=request_data.get("patient_age", "Unknown"),
        expected_gender=request_data.get("patient_gender", "Unknown"),
        expected_procedure=expected_procedure,
        expected_diagnosis=expected_diagnosis,
        policy_rules=policy_rules,
        deny_option=deny_option,
        deny_constraint=deny_constraint,
        or_deny=or_deny_text,
        or_deny_schema=or_deny_schema,
    )

    messages = [
        SystemMessage(content=prompt),
        HumanMessage(content=combined_clinical_context),
    ]
    llm = get_llm()
    response = await llm.ainvoke(messages)
    result = _safe_parse_json(response.content)

    # 6. Tier-aware validation: deny only allowed for extreme tier.
    def _validate_with_tier(parsed: dict) -> tuple[bool, str]:
        ok, why = _validate_decision(parsed)
        if not ok:
            return ok, why
        decision = str(parsed.get("decision", "")).strip().lower()
        if decision == "deny" and not is_extreme:
            return False, "deny is only allowed when the fraud tier is EXTREME (>=90%)"
        return True, ""

    is_valid, reason = _validate_with_tier(result)

    if not is_valid:
        logger.warning(f"LLM decision rejected ({reason}). Re-prompting once.")
        allowed_decisions = "approve, escalate" + (", or deny" if is_extreme else "")
        correction = HumanMessage(content=(
            f"Your previous response was rejected: {reason}.\n\n"
            "Required corrections:\n"
            f"  - `decision` must be one of: {allowed_decisions}.\n"
            "  - If `decision` is anything other than `approve`, the `evidence` "
            "array must contain at least one entry whose `finding` names a "
            "SPECIFIC field, value, document quote, or contradiction. Generic "
            "references to the fraud score, the review process, or vague phrases "
            "like 'further review' are NOT evidence.\n"
            "  - If you cannot cite something specific, choose `approve` — your "
            "document-level investigation is authoritative.\n\n"
            "Respond ONLY with the corrected JSON, no commentary."
        ))
        messages.extend([response, correction])
        response = await llm.ainvoke(messages)
        result = _safe_parse_json(response.content)
        is_valid, reason = _validate_with_tier(result)

    try:
        if not result:
            raise ValueError("Parsed JSON was empty after re-prompt.")

        decision = str(result.get("decision", "")).strip().lower()
        rationale = result.get("rationale") or "No rationale provided by AI."
        evidence = result.get("evidence")

        if not is_valid:
            logger.error(
                f"Pre-Auth {pre_auth_id}: LLM still invalid after re-prompt "
                f"({reason}); original decision={decision}, "
                f"tier={tier_name}, score={fraud_score}%"
            )
            # Bad-evidence escalate -> approve. Bad-evidence deny -> escalate.
            # The technical reason is logged above; user-facing rationale stays clean.
            if decision == "deny":
                decision = "escalate"
                rationale = (
                    "This pre-authorisation request has been forwarded to a "
                    "medical reviewer for further evaluation. Some aspects of "
                    "the submitted documentation warrant a closer look before "
                    "a final determination can be made."
                )
                evidence = None
            elif decision == "escalate":
                decision = "approve"
                rationale = (
                    "This pre-authorisation request has been approved. After "
                    "reviewing the submitted documentation against the applicable "
                    "policy, the claim meets our review criteria and is "
                    "authorised for processing."
                )
                evidence = None
            else:
                decision = "escalate"
                rationale = (
                    "This pre-authorisation request has been forwarded to a "
                    "medical reviewer for further evaluation. A clinician will "
                    "review the submitted documentation in detail before a "
                    "final decision is issued."
                )
                evidence = None

        rationale = _format_rationale_with_evidence(rationale, evidence)
        _persist_decision(pre_auth_id, decision, rationale)
        logger.info(
            f"Pre-Auth {pre_auth_id} evaluated. Tier: {tier_name} ({fraud_score}%). "
            f"Decision: {decision}"
        )

    except Exception as e:
        logger.error(
            f"Pre-Auth {pre_auth_id}: failed to parse AI decision: {e}; "
            f"raw output: {response.content!r}"
        )
        _persist_decision(
            pre_auth_id,
            "escalate",
            "This pre-authorisation request has been forwarded to a medical "
            "reviewer for further evaluation. A clinician will review the "
            "submitted documentation in detail before a final decision is issued.",
        )

async def process_and_embed_policy_file(insurer_id: str, base64_data: str, file_name: str = ""):
    """Called once when an insurer uploads their policy. Chunks the PDF/Word and saves to Supabase."""
    logger.info(f"Starting policy file processing for insurer {insurer_id}")
    
    full_text = ""
    is_word = file_name.lower().endswith(".docx") or "officedocument" in base64_data[:50] 

    try:
        if is_word:
            # Handle Word
            doc_bytes = base64.b64decode(base64_data)
            doc = Document(io.BytesIO(doc_bytes))
            full_text = "\n".join([p.text for p in doc.paragraphs if p.text.strip()])
        else:
            # Handle PDF (Default)
            pdf_bytes = base64.b64decode(base64_data)
            pdf = pdfium.PdfDocument(pdf_bytes)
            for page in pdf:
                text_page = page.get_textpage()
                full_text += text_page.get_text_range() + "\n\n"
    except Exception as e:
        logger.error(f"Failed to parse policy file: {e}")
        raise ValueError(f"Could not read the uploaded file. Please ensure it is a valid PDF or .docx file. Error: {str(e)}")
        
    if not full_text.strip():
        logger.warning(f"Insurer {insurer_id} uploaded a file with no readable text.")
        raise ValueError("The uploaded file contains no readable text.")

    # 2. Chunk text
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=2000,
        chunk_overlap=200,
        length_function=len,
    )
    chunks = text_splitter.split_text(full_text)
    logger.info(f"Split PDF into {len(chunks)} chunks. Beginning embedding...")

    embeddings_model = get_embeddings()
    
    # 3. Clear old policy chunks for this insurer
    supabase.table("policy_chunks").delete().eq("insurer_id", insurer_id).execute()
    
    # 4. Embed and insert in safe batches to respect rate limits
    batch_size = 50 
    for i in range(0, len(chunks), batch_size):
        batch_chunks = chunks[i:i+batch_size]
        
        try:
            vectors = embeddings_model.embed_documents(batch_chunks)
        except Exception as e:
            if "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e):
                logger.warning("Rate limit hit during embedding. Retrying in 10 seconds...")
                await asyncio.sleep(10) 
                vectors = embeddings_model.embed_documents(batch_chunks)
            else:
                raise e
        
        payload = []
        for chunk, vector in zip(batch_chunks, vectors):
            payload.append({
                "insurer_id": insurer_id,
                "content": chunk,
                "embedding": vector
            })
            
        supabase.table("policy_chunks").insert(payload).execute()
        logger.info(f"Inserted batch {i//batch_size + 1} into database.")
        
        await asyncio.sleep(3)
        
    logger.info(f"Finished processing policy for insurer {insurer_id}. Total {len(chunks)} chunks saved.")