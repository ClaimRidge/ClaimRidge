export type InsurerClaimStatus = "pending" | "under_review" | "approved" | "rejected" | "needs_info";
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

export function getRiskLevel(score: number | null): RiskLevel {
  if (score === null) return "low";
  if (score >= 71) return "high";
  if (score >= 31) return "medium";
  return "low";
}
