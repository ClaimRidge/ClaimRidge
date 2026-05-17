export type InsurerClaimStatus =
  | "pending"
  | "under_review"
  | "approved"
  | "rejected"
  | "needs_info"
  // Automatic adjudication verdicts (see AdjudicationPanel / services/adjudication.py)
  | "accepted"
  | "denied"
  | "escalated";
export type AiRecommendation = "auto_approve" | "review" | "likely_reject";
export type FlagType =
  | "code_mismatch"
  | "amount_anomaly"
  | "duplicate_service"
  | "missing_documentation"
  | "provider_pattern"
  | "pre_auth_missing"
  | "coverage_limit";
export type FlagSeverity = "low" | "medium" | "high";
export type RiskLevel = "low" | "medium" | "high";

// --- AI Medical Necessity Review (advisory) --------------------------------
// Structured verdict from services/ai_services.generate_medical_recommendation,
// stored on claims.medical_necessity. Advisory clinical input only — it never
// decides accept/deny (claim adjudication owns the binding verdict).
export type MedicalNecessityAssessment =
  | "supported"
  | "partially_supported"
  | "insufficient_documentation"
  | "not_supported";
export type CriterionStatus = "met" | "partial" | "not_met" | "unknown";

export interface MedicalNecessityCriterion {
  name: string;
  status: CriterionStatus;
  finding: string;
}

export interface MedicalNecessityPolicyBasis {
  snippet: string;
  note: string;
}

export interface MedicalNecessity {
  assessment: MedicalNecessityAssessment;
  headline: string;
  summary: string;
  criteria: MedicalNecessityCriterion[];
  policy_basis: MedicalNecessityPolicyBasis[];
  recommended_actions: string[];
  policy_available?: boolean;
  generated_at?: string;
}

export interface InsurerClaim {
  id: string;
  claim_number: string;
  clinic_id: string | null;
  clinic_name: string;
  insurer_id: string;
  patient_name: string;
  patient_national_id: string | null;
  patient_dob: string | null;
  patient_gender: "M" | "F" | null;
  diagnosis_codes: string[];
  diagnosis_description: string | null;
  procedure_codes: string[];
  procedure_description: string | null;
  service_date: string;
  submitted_at: string;
  amount_jod: number;
  status: InsurerClaimStatus;
  ai_risk_score: number | null;
  ai_recommendation: string | null;
  medical_necessity: MedicalNecessity | null;
  decision_reason: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClaimFlag {
  id: string;
  claim_id: string;
  flag_type: FlagType;
  severity: FlagSeverity;
  title: string;
  explanation: string;
  evidence: Record<string, unknown> | null;
  created_at: string;
}

// `ai_risk_score` holds the scrubber's claim *cleanliness* score (0-100, where
// 100 = a perfectly clean claim — see ai_services.py `overall_score`). A HIGH
// score therefore means LOW risk; a low score means the claim has problems.
export function getRiskLevel(score: number | null): RiskLevel {
  if (score === null) return "low";
  if (score >= 71) return "low";
  if (score >= 31) return "medium";
  return "high";
}
