"use client";

import { CheckCircle, XCircle, AlertTriangle, Gavel, RefreshCw, ShieldAlert } from "lucide-react";
import Button from "@/components/ui/Button";

/** The verdict written by the backend adjudicator (services/adjudication.py). */
export interface Adjudication {
  decision: "accept" | "deny" | "escalate";
  status: string;
  path: string;
  rationale: string;
  evidence: { step: string; finding: string }[];
  policy_basis: string[];
  fraud: {
    risk_level: string | null;
    fraud_score: number | null;
    flags: string[];
  };
  adjudicated_by: string;
  adjudicated_at: string;
}

const DECISION_CONFIG: Record<
  Adjudication["decision"],
  { label: string; icon: React.ElementType; bg: string; border: string; text: string; chip: string }
> = {
  accept: {
    label: "Accepted",
    icon: CheckCircle,
    bg: "bg-[#f0fdf4]",
    border: "border-[#bbf7d0]",
    text: "text-[#15803d]",
    chip: "bg-[#16a34a]",
  },
  deny: {
    label: "Denied",
    icon: XCircle,
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-700",
    chip: "bg-red-500",
  },
  escalate: {
    label: "Escalated to Reviewer",
    icon: AlertTriangle,
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-800",
    chip: "bg-amber-500",
  },
};

const PATH_LABELS: Record<string, string> = {
  auth_contradiction: "Automatic denial — claim contradicts its pre-authorisation",
  fraud_gate_extreme: "Automatic denial — extreme fraud risk",
  fraud_gate_high: "Escalated — high fraud risk",
  fraud_gate_insufficient_data: "Escalated — insufficient claim data",
  no_policy: "Escalated — no payer policy on file",
  llm: "AI policy & coding review",
};

const STEP_LABELS: Record<string, string> = {
  coding_review: "Coding review",
  authorization: "Authorization linkage",
  policy_compliance: "Policy compliance",
  billing_integrity: "Billing integrity",
};

interface Props {
  adjudication: Adjudication | null;
  loading: boolean;
  onRerun: () => void;
}

export default function AdjudicationPanel({ adjudication, loading, onRerun }: Props) {
  // First-open, in-flight adjudication.
  if (loading && !adjudication) {
    return (
      <div className="bg-white border border-[#e5e7eb] rounded-xl p-6 shadow-sm">
        <h3 className="font-display font-bold text-[#0a0a0a] flex items-center gap-2 mb-4">
          <Gavel className="h-4 w-4 text-[#00B4A6]" />
          AI Adjudication
        </h3>
        <div className="flex items-center gap-3 py-2">
          <div className="animate-spin h-5 w-5 border-2 border-[#0A1628] border-t-transparent rounded-full" />
          <p className="text-sm text-[#6b7280]">Adjudicating claim…</p>
        </div>
      </div>
    );
  }

  if (!adjudication) {
    return (
      <div className="bg-white border border-[#e5e7eb] rounded-xl p-6 shadow-sm">
        <h3 className="font-display font-bold text-[#0a0a0a] flex items-center gap-2 mb-3">
          <Gavel className="h-4 w-4 text-[#00B4A6]" />
          AI Adjudication
        </h3>
        <p className="text-sm text-[#6b7280] italic mb-4">
          This claim has not been adjudicated yet.
        </p>
        <Button variant="outline" size="sm" onClick={onRerun} loading={loading} className="gap-2">
          <Gavel className="h-4 w-4" />
          Run Adjudication
        </Button>
      </div>
    );
  }

  const c = DECISION_CONFIG[adjudication.decision] ?? DECISION_CONFIG.escalate;
  const Icon = c.icon;
  const fraud = adjudication.fraud || { risk_level: null, fraud_score: null, flags: [] };

  return (
    <div className={`border rounded-xl p-6 shadow-sm ${c.bg} ${c.border}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-bold text-[#0a0a0a] flex items-center gap-2">
          <Gavel className="h-4 w-4 text-[#00B4A6]" />
          AI Adjudication
        </h3>
        <span
          className={`text-[10px] font-black uppercase tracking-widest text-white px-2 py-0.5 rounded ${c.chip}`}
        >
          {c.label}
        </span>
      </div>

      {/* Verdict */}
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`h-5 w-5 ${c.text}`} />
        <span className={`font-display font-bold text-lg ${c.text}`}>{c.label}</span>
      </div>

      {/* How it was decided */}
      <p className="text-[11px] uppercase tracking-wider text-[#6b7280] font-semibold mb-3">
        {PATH_LABELS[adjudication.path] || adjudication.path}
      </p>

      {/* Rationale */}
      <p className="text-sm text-[#374151] leading-relaxed mb-4">{adjudication.rationale}</p>

      {/* Evidence */}
      {adjudication.evidence?.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-[#0a0a0a] uppercase tracking-wider mb-2">
            Supporting Findings
          </p>
          <ul className="space-y-2">
            {adjudication.evidence.map((e, i) => (
              <li key={i} className="text-sm text-[#374151] flex gap-2">
                <span className="text-[#9ca3af] mt-0.5">•</span>
                <span>
                  <span className="font-semibold text-[#0a0a0a]">
                    {STEP_LABELS[e.step] || e.step}:
                  </span>{" "}
                  {e.finding}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Policy basis */}
      {adjudication.policy_basis?.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-[#0a0a0a] uppercase tracking-wider mb-2">
            Policy Basis
          </p>
          <ul className="space-y-1">
            {adjudication.policy_basis.map((p, i) => (
              <li key={i} className="text-xs text-[#4b5563] italic border-l-2 border-[#e5e7eb] pl-2">
                {p}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Fraud snapshot */}
      <div className="flex items-center gap-2 py-3 border-t border-black/5">
        <ShieldAlert className="h-3.5 w-3.5 text-[#9ca3af]" />
        <span className="text-xs text-[#6b7280]">
          Fraud screening:{" "}
          <span className="font-semibold text-[#0a0a0a] capitalize">
            {fraud.risk_level ? fraud.risk_level.replace(/_/g, " ") : "unavailable"}
          </span>
          {fraud.fraud_score != null && (
            <span className="font-mono text-[#0a0a0a]"> ({fraud.fraud_score}%)</span>
          )}
        </span>
      </div>

      {/* Re-adjudicate */}
      <Button variant="outline" size="sm" onClick={onRerun} loading={loading} className="gap-2 w-full mt-2">
        <RefreshCw className="h-3.5 w-3.5" />
        Re-adjudicate
      </Button>
    </div>
  );
}
