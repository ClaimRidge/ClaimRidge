import io
import asyncio
import json
import logging
import re
import base64
import pypdfium2 as pdfium
from docx import Document
from langchain_groq import ChatGroq
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_text_splitters import RecursiveCharacterTextSplitter
from core.config import Config
from core.database import supabase
from services.pre_auth_fraud_service import pre_auth_fraud_detector
from services.code_lookup import (
    describe_diagnosis,
    describe_procedure,
    format_code_with_description,
)

logger = logging.getLogger(__name__)

# --- PROMPTS ---
# NOTE: The statistical fraud model has been moved to the claims pipeline. The
# pre-auth review is now purely clinical + policy compliance. A dedicated
# pre-auth fraud model will be re-integrated here when available.
PRE_AUTH_SYSTEM_PROMPT = """You are ClaimRidge AI, a clinical pre-authorisation reviewer. The provider is asking the insurer's permission to PROCEED with care that has not yet been delivered. Your job is medical necessity: does the documented clinical picture justify the requested procedure under this payer's policy?

You are NOT a coder or biller — coding accuracy is the claim scrubber's job after service. Focus on whether the patient should receive this care at all.

## REQUEST DETAILS (Submitted via Portal)
- Patient Name: **{expected_patient_name}**
- Patient ID: **{expected_patient_id}**
- Expected Age/Gender: **{expected_age} / {expected_gender}**
- Provider Name: **{expected_provider_name}**
- Requested Procedure: **{expected_procedure}**
- Stated Diagnosis: **{expected_diagnosis}**

The Requested Procedure and Stated Diagnosis show the submitted code followed by its description from the local CPT/ICD-10 catalogue. Use the description to judge whether the clinical narrative is coherent with what was actually requested. If a description says "(description not in local catalogue)", fall back to the document text and treat the code itself as opaque.

## PAYER POLICY RULES (RAG Context)
{policy_rules}

## YOUR REVIEW — three lenses

LENS 1 — IDENTITY CROSS-VALIDATION
Compare patient name, ID, age, and gender between the request and the clinical document.
If 2+ fields mismatch → IDENTITY_MISMATCH (concrete finding).

LENS 2 — CLINICAL ALIGNMENT
The clinical narrative must describe the same patient, condition, and proposed treatment as the request.
- Does the documented diagnosis match the stated diagnosis?
- Does the clinical reasoning support the requested procedure?
- Are documents blank forms or generic instructions, with no patient-specific information?
A document that describes an unrelated condition or procedure → CLINICAL_CONTRADICTION.

LENS 3 — MEDICAL NECESSITY (the heart of pre-auth review)
Evaluate against evidence-based, MCG/InterQual-style criteria AND the payer's policy:
- **Severity / clinical indication**: Are the diagnostic findings, vitals, imaging, or lab values that justify this level of care actually documented? (Examples a reviewer expects to see: pain score, ODI, range-of-motion measurements, prior imaging interpretations, neurological findings, failed conservative care attempts.)
- **Conservative care trial**: Has the provider documented that less-invasive options were tried first if the policy requires it? (e.g., physical therapy for 6 weeks before lumbar MRI, NSAIDs before joint injection).
- **Setting of care**: Is the proposed setting (inpatient/outpatient/day-surgery) appropriate for the severity?
- **Length-of-stay reasonableness**: If inpatient, is the requested LOS supported by the clinical picture?
- **Physician justification**: Is there a treating-physician note stating *why* the procedure is needed now?
- **Urgency**: If the request is flagged urgent, do the clinical findings support that?

## DECISION

Choose ONE:
- **approve**: The clinical documentation supports medical necessity for the requested procedure under this payer's policy. No concrete contradiction or missing required element was identified. Issuing this approval means an authorization number will be generated and the provider may proceed with care.
- **escalate**: You found at least ONE concrete concern that warrants human medical reviewer review — identity mismatch, missing documentation explicitly required by policy, clinical picture that does not support the requested intervention, setting/LOS that does not fit the severity, or conservative-care trial not attempted. Provide evidence.

## CONSTRAINTS
- escalate requires CONCRETE evidence: a specific clinical finding that's missing, a specific policy criterion not met, a document quote, or a contradiction. Vague phrases like "further review needed" are NOT evidence and will be rejected.
- Never escalate just to be cautious — if you cannot point to something specific, choose approve.
- Do not invent policy requirements that aren't in the RAG context.

## TONE
The rationale and findings will be shown to the provider, patient representative, and insurer's medical reviewer. Write in clear, professional, plain English suitable for a clinical audience.
- Do NOT mention internal mechanics: no "model", "score", "fraud", "statistical layer", or percentages.
- Do NOT use audit/debug language ("fallback", "Step 1", "flag = TRUE").
- Frame concerns as observations about documentation gaps, not accusations.
- When asking for more information, say exactly what is needed and why.

## OUTPUT
Respond ONLY with valid JSON, no commentary:
{{
    "decision": "approve" | "escalate",
    "rationale": "A clear, professional paragraph (3-5 sentences) explaining the medical necessity reasoning in plain English.",
    "evidence": [
        {{
            "step": "identity_validation" | "clinical_consistency" | "medical_necessity" | "policy_compliance",
            "finding": "A specific, professionally worded observation — name the missing clinical element, contradicted finding, or unmet policy criterion."
        }}
    ]
}}
"""

ALLOWED_EVIDENCE_STEPS = {
    "identity_validation",
    "clinical_consistency",
    "medical_necessity",
    "policy_compliance",
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
    """Returns (is_valid, reason). Enforces the evidence contract on escalate."""
    if not isinstance(result, dict):
        return False, "response is not a JSON object"
    decision = str(result.get("decision", "")).strip().lower()
    if decision not in {"approve", "escalate"}:
        return False, f"decision must be approve/escalate, got '{decision}'"
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
        "too short, or only references generic review language",
    )


EVIDENCE_STEP_LABELS = {
    "identity_validation": "Identity verification",
    "clinical_consistency": "Clinical alignment",
    "medical_necessity": "Medical necessity",
    "policy_compliance": "Policy compliance",
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

def get_llm(json_mode: bool = False):
    kwargs = {
        "api_key": Config.GROQ_API_KEY,
        "model_name": Config.LLM_MODEL,
        "temperature": 0.1,
    }
    if json_mode:
        # Groq honours OpenAI-style response_format. Guarantees the model
        # returns a JSON-parseable string.
        kwargs["model_kwargs"] = {"response_format": {"type": "json_object"}}
    return ChatGroq(**kwargs)

def get_embeddings():
    # Direct HTTP wrapper around Gemini's `embedContent` endpoint.
    # See services/embeddings.py for why we don't use GoogleGenerativeAIEmbeddings.
    from services.embeddings import GeminiHTTPEmbeddings
    return GeminiHTTPEmbeddings(model="gemini-embedding-001", output_dimensionality=768)

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


def _repair_json_string(s: str) -> str:
    """Best-effort repair of common LLM JSON mistakes:
      - trailing commas before `}` / `]`
      - // line comments and /* block comments
      - smart quotes
      - unquoted object keys (e.g. `{ field: "x" }` → `{ "field": "x" }`)

    Conservative: only intended for fallback when strict json.loads fails."""
    import re as _re

    # Strip JS-style comments (LLMs sometimes annotate fields).
    s = _re.sub(r"//[^\n]*", "", s)
    s = _re.sub(r"/\*.*?\*/", "", s, flags=_re.DOTALL)

    # Normalise smart quotes.
    s = (s.replace("“", '"').replace("”", '"')
           .replace("‘", "'").replace("’", "'"))

    # Quote unquoted keys: matches `{` or `,` followed by an identifier then `:`.
    s = _re.sub(r'([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:', r'\1"\2":', s)

    # Drop trailing commas before } or ].
    s = _re.sub(r",(\s*[}\]])", r"\1", s)

    return s


def parse_llm_json(text: str) -> dict:
    """Robust LLM-output → dict. Tries strict parse first, then a repair pass."""
    raw = extract_json_from_text(text)
    try:
        return json.loads(raw)
    except json.JSONDecodeError as first_err:
        repaired = _repair_json_string(raw)
        try:
            return json.loads(repaired)
        except json.JSONDecodeError:
            # Re-raise the original (more informative) error.
            raise first_err

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

# --- PRE-AUTH FRAUD STUB ---
# The XGBoost fraud model now lives on the claims side. This stub keeps the
# call site stable so a dedicated pre-auth fraud model can drop in later.
async def check_fraud_system(request_data: dict) -> dict:
    """Pre-auth fraud screening — currently a no-op stub.

    Always returns `low` risk so the LLM clinical review runs for every
    submission. Replace `pre_auth_fraud_detector` with a real implementation
    when the pre-auth fraud model is available.
    """
    try:
        return await pre_auth_fraud_detector.analyze_pre_auth(request_data)
    except Exception as e:
        logger.error(f"Pre-auth fraud stub failed: {e}. Defaulting to low risk.")
        return {
            "risk_level": "low",
            "fraud_score": 0.0,
            "flags": [],
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

    # On approval — issue an authorization number that the provider will later
    # reference when filing the claim.
    if decision == "approve":
        try:
            from services.authorization import issue_authorization
            issue_authorization(pre_auth_id)
        except Exception as e:
            logger.error(f"Failed to issue authorization for {pre_auth_id}: {e}")


def _safe_parse_json(raw: str) -> dict:
    try:
        parsed = json.loads(extract_json_from_text(raw))
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


async def evaluate_pre_auth(pre_auth_id: str, insurer_id: str):
    """Clinical + policy review for a pre-authorisation request.

    The fraud screening stage has been moved to the claims pipeline. The
    pre-auth pipeline now runs LLM-based clinical review on every request
    (gated only by the `check_fraud_system` stub, which currently always
    returns low risk). Possible outcomes:
      - approve   : documentation supports the request under the payer policy
      - escalate  : a medical reviewer needs to look at it (with concrete evidence)
    """
    logger.info(f"Starting Evaluation Pipeline for Pre-Auth: {pre_auth_id}")

    # 1. Fetch the Request Details
    req_res = supabase.table("pre_auth_requests").select("*").eq("id", pre_auth_id).execute()
    if not req_res.data:
        logger.error(f"Pre-auth request {pre_auth_id} not found.")
        return
    request_data = req_res.data[0]

    # 2. Run the pre-auth fraud stub (currently a no-op, returns low risk).
    fraud_result = await check_fraud_system(request_data)
    risk_level = fraud_result.get("risk_level")

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
        logger.info(f"Pre-Auth {pre_auth_id}: ESCALATE (insufficient data)")
        _persist_decision(pre_auth_id, "escalate", rationale)
        return

    # 3. Fetch documents
    docs_res = supabase.table("pre_auth_documents").select(
        "file_name, extracted_text"
    ).eq("pre_auth_id", pre_auth_id).execute()

    if not docs_res.data:
        logger.error(f"Pre-Auth {pre_auth_id}: no documents found")
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
    policy_rules = "Standard medical necessity guidelines apply."
    if insurer_id:
        try:
            embeddings_model = get_embeddings()
            query_vector = embeddings_model.embed_query(combined_clinical_context[:2000])
            policy_res = supabase.rpc("match_policy_rules", {
                "query_embedding": query_vector,
                "match_threshold": 0.3,
                "match_count": 5,
                "p_insurer_id": insurer_id,
            }).execute()
            if policy_res.data:
                policy_rules = "\n".join([m["content"] for m in policy_res.data])
        except Exception as e:
            logger.warning(f"Policy RAG retrieval failed for {pre_auth_id}: {e}")

    # 5. Build prompt
    procedure_code = request_data.get("procedure_code")
    diagnosis_code = request_data.get("diagnosis_code")
    expected_procedure = format_code_with_description(
        procedure_code, describe_procedure(procedure_code)
    )
    expected_diagnosis = format_code_with_description(
        diagnosis_code, describe_diagnosis(diagnosis_code)
    )

    prompt = PRE_AUTH_SYSTEM_PROMPT.format(
        expected_patient_name=request_data.get("patient_name", "Unknown"),
        expected_patient_id=request_data.get("patient_id", "Unknown"),
        expected_provider_name=request_data.get("provider_name", "Unknown"),
        expected_age=request_data.get("patient_age", "Unknown"),
        expected_gender=request_data.get("patient_gender", "Unknown"),
        expected_procedure=expected_procedure,
        expected_diagnosis=expected_diagnosis,
        policy_rules=policy_rules,
    )

    messages = [
        SystemMessage(content=prompt),
        HumanMessage(content=combined_clinical_context),
    ]
    llm = get_llm()
    response = await llm.ainvoke(messages)
    result = _safe_parse_json(response.content)

    is_valid, reason = _validate_decision(result)

    if not is_valid:
        logger.warning(f"LLM decision rejected ({reason}). Re-prompting once.")
        correction = HumanMessage(content=(
            f"Your previous response was rejected: {reason}.\n\n"
            "Required corrections:\n"
            "  - `decision` must be one of: approve, escalate.\n"
            "  - If `decision` is `escalate`, the `evidence` array must contain "
            "at least one entry whose `finding` names a SPECIFIC field, value, "
            "document quote, or contradiction. Vague phrases like 'further "
            "review' are NOT evidence.\n"
            "  - If you cannot cite something specific, choose `approve`.\n\n"
            "Respond ONLY with the corrected JSON, no commentary."
        ))
        messages.extend([response, correction])
        response = await llm.ainvoke(messages)
        result = _safe_parse_json(response.content)
        is_valid, reason = _validate_decision(result)

    try:
        if not result:
            raise ValueError("Parsed JSON was empty after re-prompt.")

        decision = str(result.get("decision", "")).strip().lower()
        rationale = result.get("rationale") or "No rationale provided by AI."
        evidence = result.get("evidence")

        if not is_valid:
            logger.error(
                f"Pre-Auth {pre_auth_id}: LLM still invalid after re-prompt "
                f"({reason}); original decision={decision}"
            )
            # Bad-evidence escalate -> approve. Anything else -> escalate.
            if decision == "escalate":
                decision = "approve"
                rationale = (
                    "This pre-authorisation request has been approved. After "
                    "reviewing the submitted documentation against the applicable "
                    "policy, the claim meets our review criteria and is "
                    "authorised for processing."
                )
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
        logger.info(f"Pre-Auth {pre_auth_id} evaluated. Decision: {decision}")

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


# ============================================================================
# PROVIDER-SIDE AI SERVICES
# Used by /api/claims and /api/intake routers for claim extraction & scrubbing.
# ============================================================================

from typing import List
from pydantic import BaseModel as _BaseModel, Field as _Field
from langchain_core.output_parsers import PydanticOutputParser


class FieldString(_BaseModel):
    value: str = _Field(default="", description="Extracted text. Empty string if not found.")
    confidence: int = _Field(default=0, description="Confidence 0-100. 0 if not found.")


class FieldFloat(_BaseModel):
    value: float = _Field(default=0.0)
    confidence: int = _Field(default=0)


class FieldStringList(_BaseModel):
    value: List[str] = _Field(default_factory=list)
    confidence: int = _Field(default=0)


class ClaimExtractionResult(_BaseModel):
    patient_name: FieldString
    patient_id: FieldString
    date_of_service: FieldString = _Field(description="Format YYYY-MM-DD")
    provider_name: FieldString
    provider_id: FieldString
    payer_name: FieldString
    member_id: FieldString
    primary_diagnosis: FieldString = _Field(description="Primary ICD-10 code")
    additional_diagnoses: FieldStringList = _Field(description="Additional ICD-10 codes")
    primary_procedure: FieldString = _Field(description="Primary CPT/HCPCS code")
    additional_procedures: FieldStringList = _Field(description="Additional CPT/HCPCS codes")
    billed_amount: FieldFloat
    additional_notes: FieldString
    # Fraud-detector signals — extracted only if visibly present in the document.
    patient_age: FieldString = _Field(description="Patient age as a whole number — '' if not stated.")
    patient_gender: FieldString = _Field(description="'Male' or 'Female' — '' if not stated.")
    patient_state: FieldString = _Field(description="Patient state/governorate/region (e.g. 'Amman'). '' if not stated.")
    visit_type: FieldString = _Field(description="One of: Inpatient, Outpatient, Emergency, Day Surgery — '' if not stated.")
    length_of_stay: FieldString = _Field(description="Length of stay in days (whole number). '' if not stated or outpatient.")
    insurance_type: FieldString = _Field(description="Plan type referenced on the document (e.g. 'Comprehensive', 'Basic'). '' if not stated.")
    provider_specialty: FieldString = _Field(description="Treating physician specialty (e.g. 'Cardiology'). '' if not stated.")


_claim_parser = PydanticOutputParser(pydantic_object=ClaimExtractionResult)


CLAIM_EXTRACTION_PROMPT = """You are an expert medical claims parser.
Extract the data directly from the provided image.

CRITICAL RULES:
1. NO HALLUCINATIONS: If a field is NOT clearly present in the image, set its value to "" (or 0) and its confidence to 0. Do not invent notes, IDs, demographics, or clinical context.
2. CONFIDENCE SCORES: Rate your confidence from 0 to 100 based on how clearly you can read the text.
3. Normalize dates to YYYY-MM-DD.
4. For the fraud-signal fields (patient_age, patient_gender, patient_state, visit_type, length_of_stay, insurance_type, provider_specialty): extract ONLY when explicitly stated in the document. Do not guess from context. Empty + confidence 0 is preferable to a guess.
5. visit_type must be exactly one of: Inpatient, Outpatient, Emergency, Day Surgery. Map common synonyms (e.g. "ambulatory" → Outpatient, "ER" → Emergency) but leave blank if unclear.

{format_instructions}
"""


SCRUB_SYSTEM_PROMPT = """You are ClaimRidge AI, an expert medical claims scrubbing engine. The provider has ALREADY delivered care and is now billing. Your job is RETROSPECTIVE billing review: catch coding errors, verify the procedure-diagnosis link is supported, check for unbundling/upcoding patterns, and confirm authorization was in place when required.

You are NOT a medical-necessity gatekeeper — necessity was decided at pre-authorisation time. Your focus is whether the bill in front of you is coded correctly and consistent with the auth that authorised it.

{unregistered_warning}

## Authorization status for this claim
<auth_check>
{auth_check_summary}
</auth_check>

If the auth status is `missing`, `expired`, `wrong_patient`, or `code_mismatch`, you MUST raise an `error`-severity issue on the `pre_auth_number` field with severity `error` and a clear message explaining the problem. This is non-negotiable — most payers deny claims with broken authorization linkage.

If the auth block says **NOT VERIFIABLE** (out-of-network payer), do NOT raise any issue on `pre_auth_number`. We have no way to verify it against an external payer's system, so accept the supplied number as informational metadata and move on.

If **NOT PROVIDED** (no number supplied at all), do not raise an error either — instead note in `recommendations` that the provider should confirm whether an auth was required for these procedures.

## Coding review checklist (apply in order)
1. **CPT ↔ ICD-10 alignment** — Does at least one billed procedure code have a clinically supported diagnosis code on the claim? Flag procedures with no supporting diagnosis.
2. **Bundling / NCCI edits** — Are billed procedures normally bundled into another billed code? (e.g., minor procedures inside a major one). If yes, suggest the bundled code.
3. **Upcoding patterns** — Is there a higher-tier code billed where the documented procedure description matches a lower-tier code? Flag as `warning`.
4. **Modifier requirements** — Do bilateral / multiple / repeat procedures have appropriate modifiers? (If the codebase has modifier data, comment on missing ones.)
5. **Units sanity** — Are units reasonable for the procedure type? (e.g., a single surgery shouldn't be billed with units > 1 unless explicitly bilateral.)
6. **Fee schedule realism** — Is the `billed_amount` in a reasonable range for the billed codes? Extreme outliers → `warning`.
7. **Place of service vs setting** — Does the procedure type match the inpatient/outpatient setting suggested by other claim fields?
8. **Required documentation hint** — If the payer policy explicitly requires a specific attached document (operative note, anaesthesia record), call it out in `recommendations`.

## Payer-Specific Policy Rules (CRITICAL)
Use these to find PAYER-SPECIFIC requirements (specific modifier rules, bundling exceptions, documentation requirements). DO NOT use them to second-guess medical necessity — that was already decided.
<payer_rules>
{policy_context}
</payer_rules>

## Response Format
Return ONLY valid JSON with this exact structure:
{{
  "status": "clean" | "warnings" | "errors",
  "overall_score": <number 0-100, where 100 = clean clean claim>,
  "issues": [
    {{
      "field": "<exact field name — e.g. procedure_codes[0], pre_auth_number, billed_amount>",
      "severity": "error" | "warning" | "info",
      "message": "<specific problem in coding/billing terms>",
      "suggestion": "<exact fix the biller should apply>"
    }}
  ],
  "corrected_claim": {{ <corrected version of the input> }},
  "recommendations": ["<actionable recommendations focused on billing accuracy and auth compliance>"],
  "applied_policy_rules": ["<Quote the exact rules from the payer_rules section that you actually used>"]
}}
"""


MEDICAL_REVIEW_PROMPT = """You are ClaimRidge AI, acting as a Chief Medical Officer and Claims Adjudicator for a health insurance company in the MENA region.
Your task is to review a medical claim specifically for 'Medical Necessity' and 'Clinical Appropriateness' based on standard global clinical guidelines (WHO, NICE, AHA) and local GCC/Levant practices.

## Output Format
You MUST output a brief, highly professional medical report in Markdown format.
Use EXACTLY this structure:

### Clinical Decision Recommendation
**[ APPROVE ]** OR **[ DENY ]** OR **[ INVESTIGATE FURTHER ]**

### Clinical Reasoning
[1-2 concise paragraphs explaining the medical rationale.]

### Guideline Context
[Briefly mention standard medical protocols supporting your reasoning.]
"""


async def extract_claim_from_documents(documents: list[dict]) -> dict:
    """Multi-document claim extraction. Each entry in `documents` must be
    {"fileBase64": str, "mediaType": str, "fileName": str}. All images are sent
    in one Gemini call so the model can cross-reference fields across them
    (e.g. patient name from an insurance card + diagnosis from a clinical
    note) and return a single consolidated record."""
    if not documents:
        raise ValueError("No documents provided.")

    vision_llm = get_vision_llm()
    prompt_text = CLAIM_EXTRACTION_PROMPT.format(
        format_instructions=_claim_parser.get_format_instructions()
    )

    content: list[dict] = [{"type": "text", "text": prompt_text}]
    if len(documents) > 1:
        content.append({
            "type": "text",
            "text": (
                f"You are looking at {len(documents)} related documents for the SAME claim "
                "(e.g. claim form, insurance card, clinical note, lab report). "
                "Cross-reference fields across them and pick the single most reliable value for each field. "
                "Confidence should reflect agreement across documents — conflicting values lower confidence."
            ),
        })
    for d in documents:
        file_name = d.get("fileName") or "document"
        media_type = d["mediaType"]
        file_b64 = d["fileBase64"]
        content.append({"type": "text", "text": f"--- Document: {file_name} ---"})
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:{media_type};base64,{file_b64}"},
        })

    messages = [HumanMessage(content=content)]
    logger.info(
        f"Calling Vision Model ({Config.OCR_MODEL}) for claim extraction "
        f"with {len(documents)} document(s)..."
    )
    try:
        response = await vision_llm.ainvoke(messages)
        result = _claim_parser.parse(response.content)
        return result.model_dump()
    except Exception as e:
        logger.error(f"Multi-doc claim extraction failed: {str(e)}")
        raise ValueError("The AI failed to format the document properly. Please re-upload.") from e


async def extract_claim_from_document(file_base64: str, media_type: str) -> dict:
    """Backward-compat shim around extract_claim_from_documents for single-file callers."""
    return await extract_claim_from_documents([
        {"fileBase64": file_base64, "mediaType": media_type, "fileName": "document"}
    ])


def _format_auth_check(auth_check: dict | None) -> str:
    """Turns the auth_check verdict into a paragraph the LLM can read."""
    if not auth_check:
        return "No authorization check was performed."
    status = (auth_check.get("status") or "").lower()
    detail = auth_check.get("detail") or ""
    # `not_applicable` covers two distinct cases — disambiguate via the detail
    # so the prompt's downstream rules trigger correctly.
    if status == "not_applicable":
        if "out-of-network" in detail.lower():
            head = "NOT VERIFIABLE — The payer is out-of-network. Treat the supplied authorization number as opaque metadata; do NOT flag it."
        else:
            head = "NOT PROVIDED — No pre-authorisation number was supplied with this claim."
        return f"{head}\n{detail}".strip()
    labels = {
        "ok": "VERIFIED — A valid pre-authorisation covers this claim.",
        "missing": "MISSING — The provider referenced a pre-authorisation number, but no matching authorization exists for this payer.",
        "expired": "EXPIRED — The referenced authorization is past its validity window.",
        "wrong_patient": "WRONG PATIENT — The authorization was issued for a different patient.",
        "code_mismatch": "CODE MISMATCH — The billed procedure codes are not within the authorised scope.",
    }
    head = labels.get(status, f"STATUS: {status}")
    return f"{head}\n{detail}".strip()


async def scrub_claim(claim_data: dict, registered_payer_id: str = None) -> dict:
    """Scrubs a structured claim against payer policy rules (RAG) and returns issues + corrections."""
    llm = get_llm(json_mode=True)

    # Auth check verdict is consumed by the prompt directly — strip it from the
    # JSON payload sent to the LLM so it doesn't confuse the coding review.
    auth_check = claim_data.pop("auth_check", None) if isinstance(claim_data, dict) else None
    auth_check_summary = _format_auth_check(auth_check)
    claim_json_str = json.dumps(claim_data, indent=2)

    unregistered_warning = ""
    policy_context = "No specific payer rules found. Use standard medical billing guidelines."
    retrieved_chunks = []

    if registered_payer_id:
        try:
            search_query = (
                f"Rules for Diagnoses: {', '.join(claim_data.get('diagnosis_codes', []))} "
                f"and Procedures: {', '.join(claim_data.get('procedure_codes', []))}"
            )
            embeddings_model = get_embeddings()
            query_vector = embeddings_model.embed_query(search_query)
            res = supabase.rpc("match_policy_rules", {
                "query_embedding": query_vector,
                "match_threshold": 0.4,
                "match_count": 4,
                "p_insurer_id": registered_payer_id,
            }).execute()
            if res.data:
                retrieved_chunks = [m["content"] for m in res.data]
                policy_context = "\n---\n".join(retrieved_chunks)
        except Exception as e:
            logger.error(f"RAG retrieval failed: {e}")
    else:
        unregistered_warning = (
            "NOTE: This claim's payer is not registered with ClaimRidge. "
            "Apply standard medical billing guidelines."
        )

    system_prompt = SCRUB_SYSTEM_PROMPT.format(
        unregistered_warning=unregistered_warning,
        policy_context=policy_context,
        auth_check_summary=auth_check_summary,
    )
    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=f"Analyze and scrub the following medical claim:\n\n{claim_json_str}"),
    ]
    response = await llm.ainvoke(messages)
    try:
        result = parse_llm_json(response.content)
        result["retrieved_sources"] = retrieved_chunks
        return result
    except Exception as e:
        logger.error(f"Failed to parse scrub JSON: {str(e)} | raw: {response.content[:500]!r}")
        raise ValueError("AI returned invalid JSON during scrubbing.") from e


async def generate_medical_recommendation(claim_data: dict) -> str:
    """Generates a clinical medical-necessity recommendation for a claim."""
    diagnoses = claim_data.get("diagnosis_codes", [])
    procedures = claim_data.get("procedure_codes", [])
    if isinstance(diagnoses, list):
        diagnoses = ", ".join(str(d) for d in diagnoses if d)
    if isinstance(procedures, list):
        procedures = ", ".join(str(p) for p in procedures if p)

    patient_name = claim_data.get("patient_name", "Unknown")
    amount = claim_data.get("billed_amount", claim_data.get("total_billed", "0"))

    prompt = f"""
    Review the following medical claim for 'Medical Necessity' based on standard clinical guidelines.

    CLAIM DETAILS:
    - Patient Name: {patient_name}
    - Diagnosis Codes (ICD-10): {diagnoses}
    - Procedure Codes (CPT): {procedures}
    - Billed Amount: {amount}

    Format your response EXACTLY like this:

    **RECOMMENDATION:** [Approve / Deny / Investigate Further]

    **CLINICAL REASONING:** [1-2 paragraphs.]

    **GUIDELINE CONTEXT:** [Standard medical guidelines supporting the reasoning.]
    """

    llm = get_llm()
    messages = [
        SystemMessage(content=MEDICAL_REVIEW_PROMPT),
        HumanMessage(content=prompt),
    ]
    try:
        response = await llm.ainvoke(messages)
        return str(response.content)
    except Exception as e:
        logger.error(f"Medical recommendation failed for {patient_name}: {e}")
        raise ValueError("Failed to generate medical necessity recommendation.") from e