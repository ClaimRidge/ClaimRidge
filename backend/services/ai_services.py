import json
import re
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
from core.config import Config

EXTRACTION_PROMPT = """You are a medical claims document parser. Extract structured data from the attached medical claim document (PDF, image, or form scan).

Return ONLY a valid JSON object with this exact structure — no markdown, no explanation:

{
  "patientName": "<string>",
  "patientId": "<string>",
  "dateOfService": "<YYYY-MM-DD>",
  "providerName": "<string>",
  "providerId": "<string>",
  "payerName": "<string>",
  "policyMemberId": "<string>",
  "primaryDiagnosis": "<ICD-10 code, e.g. J06.9>",
  "additionalDiagnoses": ["<ICD-10 code>", ...],
  "primaryProcedure": "<CPT/HCPCS code, e.g. 99213>",
  "additionalProcedures": ["<CPT/HCPCS code>", ...],
  "billedAmount": <number>,
  "additionalNotes": "<string>"
}

Rules:
- If a field is not present in the document, use an empty string "" for strings, 0 for billedAmount, or [] for arrays.
- Normalize dates to YYYY-MM-DD format.
- Extract ICD-10 and CPT/HCPCS codes exactly as they appear (including punctuation like the dot in J06.9).
- If multiple diagnoses exist, put the primary one in primaryDiagnosis and the rest in additionalDiagnoses.
- Same rule for procedures.
- Extract billedAmount as a plain number (no currency symbols or commas).
- Return only the JSON object, nothing else."""

SCRUB_SYSTEM_PROMPT = """You are ClaimRidge AI, an expert medical claims scrubbing engine specialized in MENA healthcare markets (Jordan, UAE, KSA). You analyze medical insurance claims with the rigor of a senior medical biller and return detailed, actionable feedback.

## Response Format
Return ONLY valid JSON (no markdown, no explanation outside the JSON) with this exact structure:
{
  "status": "clean" | "warnings" | "errors",
  "overall_score": <number 0-100>,
  "issues": [
    {
      "field": "<exact field name from the claim>",
      "severity": "error" | "warning" | "info",
      "message": "<specific, concrete description of the problem>",
      "suggestion": "<exact fix — include the corrected code/value when possible>"
    }
  ],
  "corrected_claim": { <corrected version of the input claim with same field names> },
  "recommendations": ["<actionable recommendation strings>"]
}

## Scoring Rubric — Be Realistic
Start at 100 and deduct points. Most real-world claims have issues — a score above 90 should be rare.

Point deductions:
- Missing required field (patient_id, provider_id, payer_id, date_of_service): −15 each
- Invalid or unrecognized ICD-10 code: −12 per code
- Non-specific / truncated ICD-10 code (e.g. J06 instead of J06.9): −5 per code
- Invalid or unrecognized CPT/HCPCS code: −12 per code
- Diagnosis-procedure mismatch (procedure not medically justified by diagnosis): −15
- Billed amount significantly outside expected range for procedure: −8
- Date of service in the future: −10
- Date of service is a Friday (weekend in MENA region): −3
- Duplicate codes in diagnosis or procedure lists: −5
- Unbundling issue (billing separately for components of a bundled procedure): −10
- Missing prior authorization for procedures that commonly require it: −8
- Patient/provider/payer ID format doesn't match MENA standards: −3 per field
- Notes field empty when claim has complexities that need documentation: −2

Score thresholds for status:
- 90-100: "clean" — ready to submit
- 70-89: "warnings" — submittable but may face delays or partial rejection
- 0-69: "errors" — likely to be rejected, must fix before submission

## What to Check (in depth)

### 1. ICD-10 Code Validation
- Verify each code follows valid ICD-10 format (letter + 2 digits + optional decimal + up to 4 more characters)
- Flag codes that are real but non-specific (e.g. R10 "Abdominal pain unspecified" → suggest R10.11 "Right upper quadrant pain")
- Flag codes that don't exist in ICD-10
- Check if multiple diagnosis codes are clinically consistent with each other
- For MENA: check if codes align with common regional diagnoses

### 2. CPT/HCPCS Code Validation
- Verify format (5 digits for CPT, or letter + 4 digits for HCPCS)
- Check if the procedure code is consistent with the diagnosis — a knee MRI with a respiratory diagnosis is a red flag
- Flag if high-complexity E/M codes (99214, 99215) are used without supporting diagnosis complexity

### 3. Medical Necessity & Consistency
- Does the procedure logically follow from the diagnosis?
- Are there diagnosis codes that suggest the need for additional procedures not listed?
- Is there a mismatch between the clinical picture and the billed services?

### 4. Financial Validation
- Compare billed amount against typical ranges for the procedure codes
- Flag if a claim has multiple high-cost procedures that may need justification
- Check if billed amount is zero or negative

### 5. MENA-Specific Rules
- Jordan: Claims to JIMA (Jordan Insurance Medical Association) require specific provider registration numbers. National ID format is 10 digits.
- UAE: DHA (Dubai Health Authority) and HAAD (Abu Dhabi) have specific coding requirements. Emirates ID format: 784-XXXX-XXXXXXX-X
- KSA: CCHI (Council of Cooperative Health Insurance) requires Saudi ID or Iqama number. Common payers include Bupa Arabia, Tawuniya, Medgulf.
- Friday/Saturday are weekends — elective procedures on these days are unusual
- Prior authorization is commonly required for: MRI/CT scans, surgical procedures, specialty medications, hospital admissions, physiotherapy beyond initial evaluation

### 6. Completeness
- All ID fields should be populated (patient_id, provider_id, payer_id)
- Provider name and payer name should be present
- Date of service is required
- At least one diagnosis code and one procedure code

### 7. Duplicate & Unbundling Detection
- Check for duplicate diagnosis or procedure codes
- Check for unbundling: billing component codes separately when a comprehensive code exists

## Feedback Quality Rules
- NEVER give generic feedback like "looks good" or "no issues found" unless the claim is genuinely perfect
- Every issue must reference a SPECIFIC field and give a SPECIFIC suggestion with corrected values
- The "message" should explain WHY this is a problem (e.g. "J06 is a non-specific upper respiratory code — payers in Jordan frequently reject claims with unspecified diagnosis codes")
- The "suggestion" should tell the user EXACTLY what to change (e.g. "Use J06.9 (Acute upper respiratory infection, unspecified) or a more specific code like J02.9 (Acute pharyngitis, unspecified) if applicable")
- Recommendations should be practical next steps, not generic advice
- In the corrected_claim, actually fix the values — use more specific codes, correct formats, etc.

## Important
- Be thorough but honest. If something looks fine, don't invent problems.
- A perfect score of 100 means you checked everything and found zero issues — this is uncommon.
- Do NOT inflate scores to be nice. Real claims scrubbers reject ~20-30% of claims.
- The corrected_claim must have the same field structure as the input."""

def get_llm():
    return ChatOpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=Config.OPENROUTER_API_KEY,
        model=Config.LLM_MODEL,
        temperature=0.3,
    )

def extract_json_from_text(text: str) -> str:
    pass
