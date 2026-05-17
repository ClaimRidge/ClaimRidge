"use client";

import {
  Stethoscope,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Brain,
  RefreshCw,
  ClipboardList,
  ScrollText,
} from "lucide-react";
import Button from "@/components/ui/Button";
import { formatRelativeTime } from "@/lib/utils/format";
import type {
  MedicalNecessity,
  MedicalNecessityAssessment,
  CriterionStatus,
} from "@/types/insurer";

/**
 * Advisory AI Medical Necessity Review panel. Renders the structured verdict
 * from claims.medical_necessity. This is advisory clinical input only — the
 * binding accept/deny verdict belongs to the Adjudication panel.
 */

const ASSESSMENT_CONFIG: Record<
  MedicalNecessityAssessment,
  { label: string; icon: React.ElementType; bg: string; border: string; text: string; chip: string }
> = {
  supported: {
    label: "Necessity Supported",
    icon: CheckCircle2,
    bg: "bg-[#f0fdf4]",
    border: "border-[#bbf7d0]",
    text: "text-[#15803d]",
    chip: "bg-[#16a34a]",
  },
  partially_supported: {
    label: "Partially Supported",
    icon: AlertTriangle,
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-800",
    chip: "bg-amber-500",
  },
  insufficient_documentation: {
    label: "Insufficient Documentation",
    icon: HelpCircle,
    bg: "bg-slate-50",
    border: "border-slate-200",
    text: "text-slate-700",
    chip: "bg-slate-500",
  },
  not_supported: {
    label: "Necessity Not Supported",
    icon: XCircle,
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-700",
    chip: "bg-red-500",
  },
};

const CRITERION_CONFIG: Record<
  CriterionStatus,
  { label: string; icon: React.ElementType; text: string }
> = {
  met: { label: "Met", icon: CheckCircle2, text: "text-[#15803d]" },
  partial: { label: "Partial", icon: AlertTriangle, text: "text-amber-700" },
  not_met: { label: "Not met", icon: XCircle, text: "text-red-700" },
  unknown: { label: "Unclear", icon: HelpCircle, text: "text-slate-500" },
};

interface Props {
  review: MedicalNecessity | null;
  loading: boolean;
  onGenerate: () => void;
}

export default function MedicalNecessityPanel({ review, loading, onGenerate }: Props) {
  // Empty state — no review generated yet.
  if (!review) {
    return (
      <div className="bg-gradient-to-br from-[#f0fdf4] to-white border border-[#bbf7d0] rounded-xl p-6 shadow-sm">
        <h2 className="font-display font-bold text-[#0a0a0a] flex items-center gap-2 text-lg mb-4">
          <Stethoscope className="h-5 w-5 text-[#16a34a]" />
          AI Medical Necessity Review
        </h2>
        <div className="py-4 text-center">
          <p className="text-sm text-[#6b7280] italic mb-4">
            No clinical review generated yet. Assess the billed diagnosis and procedures
            against the clinical documentation and the payer&apos;s policy.
          </p>
          <Button variant="outline" size="sm" onClick={onGenerate} loading={loading} className="gap-2">
            <Brain className="h-4 w-4" />
            Generate Clinical Review
          </Button>
        </div>
      </div>
    );
  }

  const c = ASSESSMENT_CONFIG[review.assessment] ?? ASSESSMENT_CONFIG.insufficient_documentation;
  const Icon = c.icon;

  return (
    <div className={`border rounded-xl p-6 shadow-sm ${c.bg} ${c.border}`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="font-display font-bold text-[#0a0a0a] flex items-center gap-2 text-lg">
          <Stethoscope className="h-5 w-5 text-[#16a34a]" />
          AI Medical Necessity Review
        </h2>
        <span
          className={`text-[10px] font-black uppercase tracking-widest text-white px-2 py-0.5 rounded whitespace-nowrap ${c.chip}`}
        >
          {c.label}
        </span>
      </div>

      {/* Advisory note — distinguishes this from the binding Adjudication verdict */}
      <p className="text-[11px] uppercase tracking-wider text-[#6b7280] font-semibold mb-3">
        Advisory clinical opinion — not a coverage decision
      </p>

      {/* Headline verdict */}
      <div className="flex items-start gap-2 mb-3">
        <Icon className={`h-5 w-5 mt-0.5 flex-shrink-0 ${c.text}`} />
        <span className={`font-display font-bold ${c.text}`}>{review.headline}</span>
      </div>

      {/* Summary */}
      {review.summary && (
        <p className="text-sm text-[#374151] leading-relaxed mb-5">{review.summary}</p>
      )}

      {/* Per-criterion findings */}
      {review.criteria.length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-semibold text-[#0a0a0a] uppercase tracking-wider mb-2">
            Necessity Criteria
          </p>
          <ul className="space-y-2.5">
            {review.criteria.map((cr, i) => {
              const cc = CRITERION_CONFIG[cr.status] ?? CRITERION_CONFIG.unknown;
              const CIcon = cc.icon;
              return (
                <li key={i} className="bg-white/70 border border-black/5 rounded-lg p-3">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-sm font-semibold text-[#0a0a0a]">{cr.name}</span>
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${cc.text}`}
                    >
                      <CIcon className="h-3.5 w-3.5" /> {cc.label}
                    </span>
                  </div>
                  <p className="text-sm text-[#4b5563] leading-relaxed">{cr.finding}</p>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Cited payer policy */}
      {review.policy_basis.length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-semibold text-[#0a0a0a] uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <ScrollText className="h-3.5 w-3.5 text-[#9ca3af]" /> Payer Policy Basis
          </p>
          <ul className="space-y-2">
            {review.policy_basis.map((p, i) => (
              <li key={i} className="border-l-2 border-[#bbf7d0] pl-3">
                <p className="text-xs text-[#4b5563] italic">&ldquo;{p.snippet}&rdquo;</p>
                {p.note && <p className="text-xs text-[#6b7280] mt-0.5">{p.note}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {review.policy_available === false && (
        <p className="text-xs text-[#9ca3af] italic mb-5">
          No payer policy is on file — assessed against standard clinical guidance.
        </p>
      )}

      {/* Advisory next steps for the reviewer */}
      {review.recommended_actions.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-[#0a0a0a] uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <ClipboardList className="h-3.5 w-3.5 text-[#9ca3af]" /> Recommended Next Steps
          </p>
          <ul className="space-y-1.5">
            {review.recommended_actions.map((a, i) => (
              <li key={i} className="text-sm text-[#374151] flex gap-2">
                <span className="text-[#9ca3af] mt-0.5">•</span>
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 pt-3 border-t border-black/5">
        {review.generated_at ? (
          <span className="text-[11px] text-[#9ca3af]">
            Generated {formatRelativeTime(review.generated_at)}
          </span>
        ) : (
          <span />
        )}
        <Button variant="outline" size="sm" onClick={onGenerate} loading={loading} className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" />
          Regenerate
        </Button>
      </div>
    </div>
  );
}
