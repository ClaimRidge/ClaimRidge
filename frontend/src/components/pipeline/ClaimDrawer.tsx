"use client";

import { useEffect } from "react";
import {
  X,
  ArrowRight,
  AlertTriangle,
  CheckCircle,
  DollarSign,
  Calendar,
  Building2,
  FileText,
  Edit3,
  RotateCcw,
  Scale,
  Flag,
} from "lucide-react";
import { PipelineClaim, STAGE_META, RiskLevel } from "@/types/pipeline";

const RISK_CONFIG: Record<RiskLevel, { label: string; bg: string; text: string; dot: string; ring: string }> = {
  low: { label: "Low Risk", bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500", ring: "ring-emerald-200" },
  medium: { label: "Medium Risk", bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500", ring: "ring-amber-200" },
  high: { label: "High Risk", bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500", ring: "ring-red-200" },
};

interface ClaimDrawerProps {
  claim: PipelineClaim | null;
  onClose: () => void;
}

export default function ClaimDrawer({ claim, onClose }: ClaimDrawerProps) {
  // Close on Escape
  useEffect(() => {
    if (!claim) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [claim, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (claim) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [claim]);

  if (!claim) return null;

  const risk = RISK_CONFIG[claim.riskLevel];
  const stageMeta = STAGE_META[claim.stage];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[480px] md:w-[520px] bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 sm:px-6 pt-5 pb-4 border-b border-[#f3f4f6]">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs font-semibold text-[#16a34a]">
                {claim.claimId}
              </span>
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border"
                style={{
                  color: stageMeta.color,
                  backgroundColor: stageMeta.bgColor,
                  borderColor: stageMeta.borderColor,
                }}
              >
                {stageMeta.label}
              </span>
            </div>
            <h2 className="text-lg font-semibold text-[#0a0a0a] truncate">
              {claim.patientName}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 p-1.5 rounded-lg hover:bg-[#f3f4f6] text-[#6b7280] hover:text-[#0a0a0a] transition-colors"
            aria-label="Close drawer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-6">
          {/* Key metrics row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#f9fafb] rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <DollarSign className="h-3.5 w-3.5 text-[#6b7280]" />
                <span className="text-[11px] text-[#6b7280] uppercase tracking-wide font-medium">Amount</span>
              </div>
              <p className="text-lg font-bold text-[#0a0a0a]">
                ${claim.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="bg-[#f9fafb] rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <span className={`w-2 h-2 rounded-full ${risk.dot}`} />
                <span className="text-[11px] text-[#6b7280] uppercase tracking-wide font-medium">Risk Score</span>
              </div>
              <div className="flex items-baseline gap-2">
                <p className="text-lg font-bold text-[#0a0a0a]">{claim.riskScore}</p>
                <span className={`text-xs font-semibold ${risk.text}`}>{risk.label}</span>
              </div>
            </div>
          </div>

          {/* Revenue at Risk */}
          {claim.revenueAtRisk > 0 && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-lg p-3">
              <div className="flex-shrink-0 w-9 h-9 bg-red-100 rounded-lg flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 text-red-600" />
              </div>
              <div>
                <p className="text-xs text-red-600 font-medium uppercase tracking-wide">Revenue at Risk</p>
                <p className="text-lg font-bold text-red-700">
                  ${claim.revenueAtRisk.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          )}

          {/* Claim details */}
          <div>
            <h3 className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-3">
              Claim Details
            </h3>
            <div className="space-y-2.5">
              <DetailRow icon={Calendar} label="Date of Service" value={claim.dateOfService} />
              <DetailRow icon={Building2} label="Provider" value={claim.providerName} />
              <DetailRow icon={FileText} label="Payer" value={claim.payerName} />
              <DetailRow
                icon={FileText}
                label="Diagnosis"
                value={claim.diagnosisCodes.join(", ")}
              />
              <DetailRow
                icon={FileText}
                label="Procedures"
                value={claim.procedureCodes.join(", ")}
              />
              <DetailRow
                icon={Calendar}
                label="Days in Stage"
                value={`${claim.daysInStage} day${claim.daysInStage !== 1 ? "s" : ""}`}
              />
            </div>
          </div>

          {/* AI Scrubbing Result */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide">
                AI Scrubbing Result
              </h3>
              {claim.hasAIIssues && (
                <Flag className="h-3.5 w-3.5 text-amber-500" />
              )}
            </div>

            {/* AI Summary */}
            <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-lg p-3 mb-3">
              <div className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-[#16a34a] flex-shrink-0 mt-0.5" />
                <p className="text-sm text-[#374151] leading-relaxed">{claim.aiSummary}</p>
              </div>
            </div>

            {/* Before / After changes */}
            {claim.aiChanges.length > 0 && (
              <div className="space-y-3">
                {claim.aiChanges.map((change, i) => (
                  <div key={i} className="border border-[#e5e7eb] rounded-lg overflow-hidden">
                    <div className="px-3 py-2 bg-[#f9fafb] border-b border-[#f3f4f6]">
                      <span className="text-xs font-semibold text-[#0a0a0a]">{change.field}</span>
                    </div>
                    <div className="px-3 py-2.5 space-y-2">
                      {/* Before */}
                      <div className="flex items-start gap-2">
                        <span className="flex-shrink-0 mt-0.5 w-4 h-4 rounded bg-red-50 flex items-center justify-center">
                          <X className="h-2.5 w-2.5 text-red-500" />
                        </span>
                        <div>
                          <p className="text-[10px] text-[#9ca3af] uppercase tracking-wide font-medium">Before</p>
                          <p className="text-sm text-[#374151] line-through decoration-red-300">
                            {change.before}
                          </p>
                        </div>
                      </div>
                      {/* Arrow */}
                      <div className="pl-1">
                        <ArrowRight className="h-3 w-3 text-[#d1d5db] rotate-90" />
                      </div>
                      {/* After */}
                      <div className="flex items-start gap-2">
                        <span className="flex-shrink-0 mt-0.5 w-4 h-4 rounded bg-emerald-50 flex items-center justify-center">
                          <CheckCircle className="h-2.5 w-2.5 text-emerald-500" />
                        </span>
                        <div>
                          <p className="text-[10px] text-[#9ca3af] uppercase tracking-wide font-medium">After</p>
                          <p className="text-sm text-[#0a0a0a] font-medium">{change.after}</p>
                        </div>
                      </div>
                      {/* Reason */}
                      <div className="mt-2 pt-2 border-t border-[#f3f4f6]">
                        <p className="text-xs text-[#6b7280] leading-relaxed">
                          <span className="font-semibold text-[#374151]">Why: </span>
                          {change.reason}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {claim.aiChanges.length === 0 && !claim.hasAIIssues && (
              <div className="flex items-center gap-2 text-sm text-[#6b7280]">
                <CheckCircle className="h-4 w-4 text-[#16a34a]" />
                No corrections needed — claim is clean.
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="px-5 sm:px-6 py-4 border-t border-[#f3f4f6] bg-[#fafafa]">
          <div className="flex flex-col sm:flex-row gap-2">
            <button className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg bg-[#16a34a] text-white hover:bg-[#15803d] transition-colors">
              <Edit3 className="h-4 w-4" />
              Edit Claim
            </button>
            <button className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg border border-[#16a34a] text-[#16a34a] hover:bg-[#f0fdf4] transition-colors">
              <RotateCcw className="h-4 w-4" />
              Resubmit
            </button>
            <button className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg border border-[#e5e7eb] text-[#374151] hover:bg-[#f9fafb] transition-colors">
              <Scale className="h-4 w-4" />
              Appeal
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="h-4 w-4 text-[#9ca3af] flex-shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-[11px] text-[#9ca3af] uppercase tracking-wide font-medium">{label}</p>
        <p className="text-sm text-[#0a0a0a] break-words">{value}</p>
      </div>
    </div>
  );
}
