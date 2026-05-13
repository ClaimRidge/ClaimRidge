import logging
from typing import List
from pydantic import BaseModel, Field
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from core.config import Config
from core.database import supabase

logger = logging.getLogger(__name__)

# ==========================================
# 1. PYDANTIC SCHEMAS (Strict Output Enforcement)
# ==========================================
class Evidence(BaseModel):
    type: str = Field(description="Type of evidence (e.g., 'claim_reference', 'document_reference', 'signal')")
    description: str = Field(description="Clear description of the contradiction or anomaly found.")

class Action(BaseModel):
    description: str = Field(description="Human-readable recommended next step for the investigator.")
    priority: str = Field(description="Must be one of: 'immediate', 'this_week', 'contextual'")

class FraudCaseFile(BaseModel):
    flag_type: str = Field(description="E.g., 'upcoding', 'identity_mismatch', 'phantom_billing'")
    severity: str = Field(description="Must be one of: 'low', 'medium', 'high', 'critical'")
    confidence: float = Field(description="AI confidence score between 0.0 and 1.0")
    summary_en: str = Field(description="1-paragraph English narrative summarizing the fraud case and contradictions.")
    summary_ar: str = Field(description="1-paragraph Arabic narrative summarizing the fraud case and contradictions. Must be highly professional Arabic.")
    key_evidence: List[Evidence] = Field(description="Top 3-5 pieces of supporting evidence proving the fraud/anomaly.")
    recommended_actions: List[Action] = Field(description="Prioritized list of actions for the investigator.")

# ==========================================
# 2. DATA FETCHING TOOLS
# ==========================================
def get_claim_context(claim_id: str) -> dict:
    """Fetches the submitted claim details from the database."""
    res = supabase.table("claims").select("*").eq("id", claim_id).execute()
    return res.data[0] if res.data else {}


# ==========================================
# 3. THE LLM ENGINE
# ==========================================
async def generate_fraud_case_file(claim_id: str, fraud_score: float, anomaly_flags: List[str]) -> dict:
    """
    Orchestrates the LLM to build a structured Fraud Case File for a CLAIM.
    """
    logger.info(f"Generating Fraud Case File for claim {claim_id}")

    claim_data = get_claim_context(claim_id)
    if not claim_data:
        return {"error": f"Claim {claim_id} not found."}

    llm = ChatGroq(
        api_key=Config.GROQ_API_KEY,
        model_name=Config.LLM_MODEL,
        temperature=0.1,
    ).with_structured_output(FraudCaseFile)

    diagnosis_codes = claim_data.get("diagnosis_codes") or []
    procedure_codes = claim_data.get("procedure_codes") or []
    scrub_notes = claim_data.get("scrub_result") or {}

    prompt = ChatPromptTemplate.from_messages([
        ("system", """You are a medical insurance fraud investigator's analytical assistant for ClaimRidge.
        A statistical anomaly has been raised on a submitted CLAIM. Your task is to construct a
        structured, evidence-grounded Fraud Case File.

        CRITICAL RULES:
        1. Compare the claim's coding, billing, and stated provider/patient details against the
           anomaly flags. Look for contradictions, unbundling, upcoding, identity mismatch, or
           statistically improbable combinations.
        2. Be specific. Cite exactly what is wrong.
        3. Output MUST strictly conform to the required JSON schema.
        4. Bilingual summaries (English and Arabic) MUST be provided and clinically accurate.
        """),
        ("human", f"""
        ### LAYER 1 STATISTICAL ANOMALY ###
        Risk Score: {fraud_score}%
        Flags: {anomaly_flags}

        ### CLAIM DETAILS ###
        Claim Number: {claim_data.get('claim_number')}
        Patient: {claim_data.get('patient_name')} | ID: {claim_data.get('patient_id')}
        Member ID: {claim_data.get('member_id')}
        Date of Service: {claim_data.get('date_of_service')}
        Diagnosis Codes: {diagnosis_codes}
        Procedure Codes: {procedure_codes}
        Total Billed: {claim_data.get('total_billed')} {claim_data.get('currency')}
        Provider: {claim_data.get('provider_name')}
        Payer: {claim_data.get('payer_name')}
        AI Risk Score (scrubber): {claim_data.get('ai_risk_score')}
        Scrubber Notes: {scrub_notes}

        Analyze the evidence and generate the FraudCaseFile.
        """)
    ])

    chain = prompt | llm
    try:
        case_file: FraudCaseFile = await chain.ainvoke({})
        return case_file.model_dump()
    except Exception as e:
        logger.error(f"Case Engine failed: {e}")
        return {"error": str(e)}


async def persist_fraud_case(
    claim_id: str,
    insurer_id: str | None,
    fraud_score: float,
    anomaly_flags: list,
    case_file: dict,
) -> str | None:
    """Persists a generated FraudCaseFile to `fraud_cases` and back-links it to
    the claim via `claims.fraud_case_id`. Returns the new fraud_cases.id, or
    None if the case file contained an error."""
    if not case_file or "error" in case_file:
        return None

    payload = {
        "claim_id": claim_id,
        "insurer_id": insurer_id,
        "flag_type": case_file.get("flag_type"),
        "severity": case_file.get("severity"),
        "confidence": case_file.get("confidence"),
        "summary_en": case_file.get("summary_en"),
        "summary_ar": case_file.get("summary_ar"),
        "key_evidence": case_file.get("key_evidence", []),
        "recommended_actions": case_file.get("recommended_actions", []),
        "fraud_score": fraud_score,
        "anomaly_flags": anomaly_flags,
    }
    try:
        res = supabase.table("fraud_cases").insert(payload).execute()
        if not res.data:
            return None
        case_id = res.data[0]["id"]
        supabase.table("claims").update({"fraud_case_id": case_id}).eq("id", claim_id).execute()
        return case_id
    except Exception as e:
        logger.error(f"Failed to persist fraud case for claim {claim_id}: {e}")
        return None
