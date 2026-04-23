export type PipelineStage =
  | "draft"
  | "submitted"
  | "under_review"
  | "approved"
  | "denied"
  | "appealing";

export type RiskLevel = "low" | "medium" | "high";

export interface AIScrubChange {
  field: string;
  before: string;
  after: string;
  reason: string;
}

export interface PipelineClaim {
  id: string;
  claimId: string; // e.g. CLM-2024-001
  patientName: string;
  payerName: string;
  amount: number;
  stage: PipelineStage;
  riskLevel: RiskLevel;
  riskScore: number; // 0–100
  daysInStage: number;
  hasAIIssues: boolean;
  dateOfService: string;
  providerName: string;
  diagnosisCodes: string[];
  procedureCodes: string[];
  revenueAtRisk: number;
  aiChanges: AIScrubChange[];
  aiSummary: string;
}

export const STAGE_META: Record<
  PipelineStage,
  { label: string; color: string; bgColor: string; borderColor: string }
> = {
  draft: {
    label: "Draft",
    color: "#6b7280",
    bgColor: "#f9fafb",
    borderColor: "#e5e7eb",
  },
  submitted: {
    label: "Submitted",
    color: "#2563eb",
    bgColor: "#eff6ff",
    borderColor: "#bfdbfe",
  },
  under_review: {
    label: "Under Review",
    color: "#d97706",
    bgColor: "#fffbeb",
    borderColor: "#fde68a",
  },
  approved: {
    label: "Approved",
    color: "#16a34a",
    bgColor: "#f0fdf4",
    borderColor: "#bbf7d0",
  },
  denied: {
    label: "Denied",
    color: "#dc2626",
    bgColor: "#fef2f2",
    borderColor: "#fecaca",
  },
  appealing: {
    label: "Appealing",
    color: "#7c3aed",
    bgColor: "#f5f3ff",
    borderColor: "#ddd6fe",
  },
};
