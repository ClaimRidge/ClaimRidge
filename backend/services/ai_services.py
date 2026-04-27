import json
import logging
import re
import base64
import pypdfium2 as pdfium
from typing import List, Optional
from pydantic import BaseModel, Field
from langchain_groq import ChatGroq
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.output_parsers import PydanticOutputParser
from core.config import Config
from core.database import supabase
from langchain_text_splitters import RecursiveCharacterTextSplitter

logger = logging.getLogger(__name__)

# --- 1. PYDANTIC SCHEMAS ---
class FieldString(BaseModel):
    value: str = Field(default="", description="The extracted text. Empty string if not found.")
    confidence: int = Field(default=0, description="Confidence score 0-100. 0 if not found.")

class FieldFloat(BaseModel):
    value: float = Field(default=0.0, description="The extracted numeric value. 0.0 if not found.")
    confidence: int = Field(default=0, description="Confidence score 0-100. 0 if not found.")

class FieldStringList(BaseModel):
    value: List[str] = Field(default_factory=list, description="List of strings. Empty list if not found.")
    confidence: int = Field(default=0, description="Confidence score 0-100. 0 if not found.")

class ClaimExtractionResult(BaseModel):
    patient_name: FieldString
    patient_id: FieldString
    date_of_service: FieldString = Field(description="Format YYYY-MM-DD")
    provider_name: FieldString
    provider_id: FieldString
    payer_name: FieldString
    member_id: FieldString
    primary_diagnosis: FieldString = Field(description="Primary ICD-10 code")
    additional_diagnoses: FieldStringList = Field(description="Additional ICD-10 codes")
    primary_procedure: FieldString = Field(description="Primary CPT/HCPCS code")
    additional_procedures: FieldStringList = Field(description="Additional CPT/HCPCS codes")
    billed_amount: FieldFloat
    additional_notes: FieldString = Field(description="Any extra notes. Empty string if none.")

parser = PydanticOutputParser(pydantic_object=ClaimExtractionResult)

# --- 2. PROMPTS ---
EXTRACTION_PROMPT = """You are an expert medical claims parser. 
Extract the data directly from the provided image.

CRITICAL RULES:
1. NO HALLUCINATIONS: If a field is NOT clearly present in the image, set its value to "" (or 0) and its confidence to 0. Do not invent notes or IDs.
2. CONFIDENCE SCORES: Rate your confidence from 0 to 100 based on how clearly you can read the text.
3. Normalize dates to YYYY-MM-DD.

{format_instructions}
"""

SCRUB_SYSTEM_PROMPT = """You are ClaimRidge AI, an expert medical claims scrubbing engine. You analyze medical insurance claims with the rigor of a senior medical biller and return detailed, actionable feedback.

{unregistered_warning}

## Payer-Specific Policy Rules (CRITICAL)
Here are the specific policy rules retrieved from this Payer's handbook. You MUST apply these rules to this claim. 
<payer_rules>
{policy_context}
</payer_rules>

## Response Format
Return ONLY valid JSON with this exact structure:
{{
  "status": "clean" | "warnings" | "errors",
  "overall_score": <number 0-100>,
  "issues": [
    {{
      "field": "<exact field name>",
      "severity": "error" | "warning" | "info",
      "message": "<specific problem>",
      "suggestion": "<exact fix>"
    }}
  ],
  "corrected_claim": {{ <corrected version of the input> }},
  "recommendations": ["<actionable recommendation strings>"],
  "applied_policy_rules": ["<Quote the exact rules from the payer_rules section that you used to evaluate this claim>"]
}}
"""

MEDICAL_REVIEW_PROMPT = """You are ClaimRidge AI, acting as a Chief Medical Officer and Claims Adjudicator for a health insurance company in the MENA region.
Your task is to review a medical claim specifically for 'Medical Necessity' and 'Clinical Appropriateness' based on standard global clinical guidelines (WHO, NICE, AHA) and local GCC/Levant practices.

## Your Goal
Read the diagnosis codes (ICD-10) and procedure codes (CPT). Determine if the requested procedures are a logical, medically necessary, and standard-of-care treatment or diagnostic step for the given diagnoses.

## Red Flags to Watch For
1. Upcoding: Using a highly complex/expensive procedure code when a simpler one is standard (e.g., billing a Level 5 ER visit for a common cold).
2. Unbundling: Billing separately for procedures that should be grouped together.
3. Diagnostic Mismatch: Ordering procedures entirely unrelated to the diagnosis (e.g., a knee MRI for a sinus infection).
4. Step-Therapy Violations: Jumping straight to surgery or expensive imaging (MRI) without evidence of prior conservative treatment (X-ray, physical therapy, medication) where guidelines require it.

## Output Format
You MUST output a brief, highly professional medical report in Markdown format.
Use EXACTLY this structure:

### Clinical Decision Recommendation
**[ APPROVE ]** OR **[ DENY ]** OR **[ INVESTIGATE FURTHER ]**

### Clinical Reasoning
[Provide 1-2 concise paragraphs explaining your medical rationale. Why is this medically necessary or unnecessary? Point out specific mismatches between the ICD-10 and CPT codes if they exist.]

### Guideline Context
[Briefly mention standard medical protocols that support your reasoning. e.g., "According to standard radiological guidelines, an MRI of the lumbar spine is not indicated as a first-line diagnostic tool for acute lower back pain without neurological deficits..."]
"""

# --- 3. HELPER FUNCTIONS & LLM INITIALIZATION ---

def get_vision_llm():
    """Initializes the native Google Gemini VLM for extraction."""
    return ChatGoogleGenerativeAI(
        model=Config.OCR_MODEL,
        google_api_key=Config.GEMINI_API_KEY,
        temperature=0.0
    )

def get_llm(model_name: str = Config.LLM_MODEL):
    """Initializes Groq for standard text tasks (Scrubbing, Recommendations)."""
    return ChatGroq(
        api_key=Config.GROQ_API_KEY,
        model_name=model_name,
        temperature=0.3,
    )

def get_embeddings():
    """Initializes Google's fast text embedding model."""
    return GoogleGenerativeAIEmbeddings(
        model="models/gemini-embedding-001", 
        google_api_key=Config.GEMINI_API_KEY
    )

def extract_json_from_text(text: str) -> str:
    text = re.sub(r'```[\w]*\s*\n?', '', text)
    start_idx = text.find('{')
    end_idx = text.rfind('}')
    if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
        return text[start_idx:end_idx + 1]
    return text.strip()

async def process_and_embed_policy_pdf(insurer_id: str, base64_pdf: str):
    """Called once when an insurer uploads their policy. Chunks the PDF and saves to Supabase."""
    logger.info(f"Starting PDF processing for insurer {insurer_id}")
    
    # 1. Decode and read PDF
    pdf_bytes = base64.b64decode(base64_pdf)
    pdf = pdfium.PdfDocument(pdf_bytes)
    
    full_text = ""
    for page in pdf:
        text_page = page.get_textpage()
        full_text += text_page.get_text_range() + "\n\n"
        
    if not full_text.strip():
        raise ValueError("The uploaded PDF contains no readable text. If it is a scanned image, please upload a text-searchable PDF.")

    logger.info(f"Extracted {len(full_text)} characters from PDF.")

    # 2. Safely chunk the text using LangChain
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=800,
        chunk_overlap=150,
        length_function=len,
    )
    chunks = text_splitter.split_text(full_text)
    logger.info(f"Split PDF into {len(chunks)} chunks. Beginning embedding...")

    embeddings_model = get_embeddings()
    
    # 3. Clear old policy chunks for this insurer
    supabase.table("policy_chunks").delete().eq("insurer_id", insurer_id).execute()
    
    # 4. Embed and insert in safe batches (Avoids Google Rate Limits & Supabase Payload limits)
    batch_size = 20 
    for i in range(0, len(chunks), batch_size):
        batch_chunks = chunks[i:i+batch_size]
        
        # Get embeddings for the batch
        vectors = embeddings_model.embed_documents(batch_chunks)
        
        payload = []
        for chunk, vector in zip(batch_chunks, vectors):
            payload.append({
                "insurer_id": insurer_id,
                "content": chunk,
                "embedding": vector
            })
            
        # Insert into Supabase
        res = supabase.table("policy_chunks").insert(payload).execute()
        if not res.data:
            logger.warning(f"Batch {i//batch_size + 1} insert may have failed.")
        else:
            logger.info(f"Inserted batch {i//batch_size + 1} into database.")
        
    logger.info(f"Successfully embedded all {len(chunks)} policy chunks for insurer {insurer_id}")

async def extract_claim_from_document(file_base64: str, media_type: str) -> dict:
    """Single-step extraction: Passes image directly to Gemini, getting strict JSON back instantly."""
    vision_llm = get_vision_llm()
    
    # Format the prompt with the Pydantic JSON instructions
    prompt_text = EXTRACTION_PROMPT.format(format_instructions=parser.get_format_instructions())
    image_data_url = f"data:{media_type};base64,{file_base64}"
    
    messages = [
        HumanMessage(content=[
            {"type": "text", "text": prompt_text},
            {"type": "image_url", "image_url": {"url": image_data_url}}
        ])
    ]
    
    logger.info(f"Calling Fast Vision Model ({Config.OCR_MODEL}) for 1-step extraction...")
    
    try:
        response = await vision_llm.ainvoke(messages)
        # Parse the raw string response into our strict Pydantic model
        result = parser.parse(response.content)
        return result.model_dump()
        
    except Exception as e:
        logger.error(f"Single-step extraction failed: {str(e)}")
        raise ValueError("The AI failed to format the document properly. Please re-upload.") from e

async def scrub_claim(claim_data: dict, registered_payer_id: str = None) -> dict:
    llm = get_llm()
    claim_json_str = json.dumps(claim_data, indent=2)
    
    unregistered_warning = ""
    policy_context = "No specific payer rules found. Use standard medical billing guidelines."
    retrieved_chunks = []

    if registered_payer_id:
        try:
            search_query = f"Rules for Diagnoses: {', '.join(claim_data.get('diagnosis_codes', []))} and Procedures: {', '.join(claim_data.get('procedure_codes', []))}"
            embeddings_model = get_embeddings()
            query_vector = embeddings_model.embed_query(search_query)
            
            res = supabase.rpc("match_policy_rules", {
                "query_embedding": query_vector,
                "match_threshold": 0.4,
                "match_count": 4,
                "p_insurer_id": registered_payer_id
            }).execute()
            
            if res.data and len(res.data) > 0:
                retrieved_chunks = [match["content"] for match in res.data]
                policy_context = "\n---\n".join(retrieved_chunks)
        except Exception as e:
            logger.error(f"RAG retrieval failed: {e}")
    else:
        unregistered_warning = """... (keep your existing warning) ..."""

    formatted_system_prompt = SCRUB_SYSTEM_PROMPT.format(
        unregistered_warning=unregistered_warning,
        policy_context=policy_context
    )
    
    messages = [
        SystemMessage(content=formatted_system_prompt),
        HumanMessage(content=f"Analyze and scrub the following medical claim:\n\n{claim_json_str}")
    ]
    
    response = await llm.ainvoke(messages)
    json_str = extract_json_from_text(response.content)
    
    try:
        result = json.loads(json_str)
        result["retrieved_sources"] = retrieved_chunks
        return result
    except Exception as e:
        logger.error(f"Failed to parse scrub JSON: {str(e)}")
        raise ValueError("AI returned invalid JSON during scrubbing.") from e

async def generate_medical_recommendation(claim_data: dict) -> str:
    """
    Analyzes claim codes against clinical guidelines to generate a medical necessity recommendation.
    """
    diagnoses = ", ".join(claim_data.get("diagnosis_codes", []))
    procedures = ", ".join(claim_data.get("procedure_codes", []))
    patient_name = claim_data.get('patient_name', 'Unknown')
    amount = claim_data.get('billed_amount', claim_data.get('total_billed', '0'))
    
    logger.info(f"Starting medical review for patient: {patient_name}")

    if isinstance(diagnoses, list):
        diagnoses = ", ".join([str(d) for d in diagnoses if d])
    if isinstance(procedures, list):
        procedures = ", ".join([str(p) for p in procedures if p])

    prompt = f"""
    You are an expert Chief Medical Officer and Claims Adjudicator for a health insurance company.
    Your task is to review the following medical claim for 'Medical Necessity' based on standard clinical guidelines (WHO, NICE, AHA, etc.).
    
    CLAIM DETAILS:
    - Patient Name: {patient_name}
    - Diagnosis Codes (ICD-10): {diagnoses}
    - Procedure Codes (CPT): {procedures}
    - Billed Amount: {amount}
    
    Please provide a concise, structured recommendation for the human Medical Officer reviewing this claim. 
    Format your response EXACTLY like this:

    **RECOMMENDATION:** [Approve / Deny / Investigate Further]
    
    **CLINICAL REASONING:** [1-2 paragraphs explaining if the procedures are clinically appropriate and medically necessary for the given diagnoses. Highlight any red flags, such as upcoding or unbundling.]
    
    **GUIDELINE CONTEXT:** [Mention any standard medical guidelines or protocols that support this reasoning.]
    """
    
    llm = get_llm()
    messages = [
        SystemMessage(content=MEDICAL_REVIEW_PROMPT),
        HumanMessage(content=prompt)
    ]
    try:
        response = await llm.ainvoke(messages)
        return str(response.content)
    except Exception as e:
        logger.error(f"Failed to generate medical necessity recommendation for patient {patient_name}: {str(e)}")
        raise ValueError(f"Failed to generate medical necessity recommendation for patient {patient_name}") from e