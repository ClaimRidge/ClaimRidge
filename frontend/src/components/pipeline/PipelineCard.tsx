"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlertTriangle, Flag } from "lucide-react";
import { PipelineClaim, RiskLevel } from "@/types/pipeline";

const RISK_CONFIG: Record<RiskLevel, { label: string; bg: string; text: string; dot: string }> = {
  low: { label: "Low", bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  medium: { label: "Med", bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  high: { label: "High", bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
};

interface PipelineCardProps {
  claim: PipelineClaim;
  onClick: () => void;
  isDragging?: boolean;
}

export default function PipelineCard({ claim, onClick, isDragging }: PipelineCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: claim.id });

  const dragging = isDragging || isSortableDragging;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const risk = RISK_CONFIG[claim.riskLevel];

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={`group bg-white border border-[#e5e7eb] rounded-lg p-3 sm:p-3.5 cursor-grab active:cursor-grabbing transition-shadow select-none ${
        dragging
          ? "shadow-lg shadow-black/10 opacity-90 ring-2 ring-[#16a34a]/30"
          : "shadow-sm hover:shadow-md hover:border-[#d1d5db]"
      }`}
    >
      {/* Top row: Claim ID + AI flag */}
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-[11px] font-semibold text-[#16a34a]">
          {claim.claimId}
        </span>
        {claim.hasAIIssues && (
          <span title="AI found issues">
            <Flag className="h-3.5 w-3.5 text-amber-500" />
          </span>
        )}
      </div>

      {/* Patient name */}
      <p className="text-sm font-medium text-[#0a0a0a] mb-1 truncate">
        {claim.patientName}
      </p>

      {/* Payer */}
      <p className="text-xs text-[#6b7280] mb-2.5 truncate">{claim.payerName}</p>

      {/* Bottom row: Amount + Risk badge + Days */}
      <div className="flex items-center justify-between gap-1.5">
        <span className="text-sm font-semibold text-[#0a0a0a]">
          ${claim.amount.toLocaleString("en-US", { minimumFractionDigits: 0 })}
        </span>

        <div className="flex items-center gap-1.5">
          {/* Risk badge */}
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${risk.bg} ${risk.text}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${risk.dot}`} />
            {risk.label}
          </span>

          {/* Days in stage */}
          <span className="text-[10px] text-[#9ca3af] whitespace-nowrap">
            {claim.daysInStage}d
          </span>
        </div>
      </div>

      {/* AI issue indicator bar */}
      {claim.hasAIIssues && (
        <div className="mt-2 pt-2 border-t border-[#f3f4f6] flex items-center gap-1.5">
          <AlertTriangle className="h-3 w-3 text-amber-500 flex-shrink-0" />
          <span className="text-[10px] text-amber-600 truncate">
            {claim.aiChanges.length} AI correction{claim.aiChanges.length !== 1 ? "s" : ""}
          </span>
        </div>
      )}
    </div>
  );
}
