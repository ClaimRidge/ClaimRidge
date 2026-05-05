import logging
from typing import List, Dict, Any
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
def get_claim_context(pre_auth_id: str) -> dict:
    """Fetches the requested claim details from the database."""
    res = supabase.table("pre_auth_requests").select("*").eq("id", pre_auth_id).execute()
    return res.data[0] if res.data else {}

def get_clinical_documents(pre_auth_id: str) -> str:
    """Fetches the OCR'd text from all attached documents."""
    res = supabase.table("pre_auth_documents").select("file_name, extracted_text").eq("pre_auth_id", pre_auth_id).execute()
    if not res.data:
        return "No documents found."
    
    docs = [f"--- Document: {d['file_name']} ---\n{d['extracted_text']}" for d in res.data]
    return "\n\n".join(docs)

# ==========================================
# 3. THE LLM ENGINE
# ==========================================
async def generate_fraud_case_file(pre_auth_id: str, fraud_score: float, anomaly_flags: List[str]) -> dict:
    """
    Orchestrates the LLM to build a structured Fraud Case File.
    """
    logger.info(f"Generating Fraud Case File for {pre_auth_id}")
    
    # 1. Fetch all context dynamically
    claim_data = get_claim_context(pre_auth_id)
    doc_data = get_clinical_documents(pre_auth_id)
    
    # 2. Initialize the LLM and bind the strict Pydantic Schema
    llm = ChatGroq(
        api_key=Config.GROQ_API_KEY, 
        model_name=Config.LLM_MODEL,
        temperature=0.1 # Low temp for analytical precision
    ).with_structured_output(FraudCaseFile)
    
    # 3. Build the prompt
    prompt = ChatPromptTemplate.from_messages([
        ("system", """You are a medical insurance fraud investigator's analytical assistant for ClaimRidge.
        A flag has been raised by ClaimRidge's statistical anomaly layers. 
        Your task is to construct a structured, evidence-grounded Fraud Case File.
        
        CRITICAL RULES:
        1. Compare the Claim Details against the Clinical Documents. Look for contradictions in age, gender, procedures, or missing data.
        2. Be specific. Cite exactly what is wrong. 
        3. Output MUST strictly conform to the required JSON schema.
        4. Bilingual summaries (English and Arabic) MUST be provided and clinically accurate.
        """),
        ("human", f"""
        ### LAYER 1 ANOMALY SCORE ###
        Risk Score: {fraud_score}%
        Flags: {anomaly_flags}
        
        ### CLAIM DETAILS (From Portal) ###
        Patient: {claim_data.get('patient_name')} | ID: {claim_data.get('patient_id')}
        Age/Gender: {claim_data.get('patient_age')} / {claim_data.get('gender')}
        Procedure Requested: {claim_data.get('procedure')}
        Diagnosis: {claim_data.get('diagnosis')}
        Requested Amount: {claim_data.get('requested_amount')} {claim_data.get('currency')}
        Provider: {claim_data.get('provider_name')}
        
        ### CLINICAL DOCUMENTS (OCR Extraction) ###
        {doc_data}
        
        Analyze the evidence and generate the FraudCaseFile.
        """)
    ])
    
    # 4. Execute the chain
    chain = prompt | llm
    try:
        case_file: FraudCaseFile = await chain.ainvoke({})
        return case_file.model_dump()
    except Exception as e:
        logger.error(f"Case Engine failed: {e}")
        return {"error": str(e)}