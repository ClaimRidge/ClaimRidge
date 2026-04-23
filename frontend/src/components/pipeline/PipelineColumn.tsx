"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { PipelineClaim, PipelineStage, STAGE_META } from "@/types/pipeline";
import PipelineCard from "./PipelineCard";

interface PipelineColumnProps {
  stage: PipelineStage;
  claims: PipelineClaim[];
  onCardClick: (claim: PipelineClaim) => void;
}

export default function PipelineColumn({ stage, claims, onCardClick }: PipelineColumnProps) {
  const meta = STAGE_META[stage];

  const { setNodeRef, isOver } = useDroppable({ id: stage });

  const totalAmount = claims.reduce((sum, c) => sum + c.amount, 0);

  return (
    <div
      className={`flex flex-col min-w-[260px] sm:min-w-[280px] max-w-[320px] rounded-xl transition-colors ${
        isOver ? "bg-[#f0fdf4]" : "bg-[#f9fafb]"
      }`}
    >
      {/* Column header */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: meta.color }}
            />
            <h3 className="text-sm font-semibold text-[#0a0a0a]">{meta.label}</h3>
          </div>
          <span className="text-xs font-medium text-[#6b7280] bg-white border border-[#e5e7eb] px-2 py-0.5 rounded-full">
            {claims.length}
          </span>
        </div>
        <p className="text-[11px] text-[#9ca3af] pl-[18px]">
          ${totalAmount.toLocaleString("en-US", { minimumFractionDigits: 0 })}
        </p>
      </div>

      {/* Cards area */}
      <div
        ref={setNodeRef}
        className="flex-1 px-2 pb-2 space-y-2 min-h-[120px] overflow-y-auto max-h-[calc(100vh-320px)]"
      >
        <SortableContext items={claims.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {claims.map((claim) => (
            <PipelineCard
              key={claim.id}
              claim={claim}
              onClick={() => onCardClick(claim)}
            />
          ))}
        </SortableContext>

        {claims.length === 0 && (
          <div className="flex items-center justify-center h-20 border-2 border-dashed border-[#e5e7eb] rounded-lg">
            <p className="text-xs text-[#9ca3af]">Drop claims here</p>
          </div>
        )}
      </div>
    </div>
  );
}
