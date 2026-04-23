"use client";

import { useState, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import { PipelineClaim, PipelineStage } from "@/types/pipeline";
import { PIPELINE_CLAIMS } from "@/data/pipeline-claims";
import PipelineColumn from "./PipelineColumn";
import PipelineCard from "./PipelineCard";
import ClaimDrawer from "./ClaimDrawer";

const STAGES: PipelineStage[] = [
  "draft",
  "submitted",
  "under_review",
  "approved",
  "denied",
  "appealing",
];

export default function PipelineBoard() {
  // TODO: Replace local state with Supabase query when pipeline_stage column is added to claims table.
  // e.g. const { data } = await supabase.from("claims").select("*").order("created_at");
  // Then map each claim to the correct stage column based on claim.pipeline_stage.
  const [claims, setClaims] = useState<PipelineClaim[]>(PIPELINE_CLAIMS);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [drawerClaim, setDrawerClaim] = useState<PipelineClaim | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const claimsByStage = useCallback(
    (stage: PipelineStage) => claims.filter((c) => c.stage === stage),
    [claims]
  );

  const activeClaim = activeId ? claims.find((c) => c.id === activeId) ?? null : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeClaimId = active.id as string;
    const overId = over.id as string;

    // Determine the target stage: either the column itself, or the stage of the card we're over
    let targetStage: PipelineStage | null = null;

    if (STAGES.includes(overId as PipelineStage)) {
      targetStage = overId as PipelineStage;
    } else {
      const overClaim = claims.find((c) => c.id === overId);
      if (overClaim) targetStage = overClaim.stage;
    }

    if (!targetStage) return;

    const activeClaim = claims.find((c) => c.id === activeClaimId);
    if (!activeClaim || activeClaim.stage === targetStage) return;

    setClaims((prev) =>
      prev.map((c) => (c.id === activeClaimId ? { ...c, stage: targetStage } : c))
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeClaimId = active.id as string;
    const overId = over.id as string;

    let targetStage: PipelineStage | null = null;

    if (STAGES.includes(overId as PipelineStage)) {
      targetStage = overId as PipelineStage;
    } else {
      const overClaim = claims.find((c) => c.id === overId);
      if (overClaim) targetStage = overClaim.stage;
    }

    if (!targetStage) return;

    // TODO: Persist stage change to Supabase
    // e.g. await supabase.from("claims").update({ pipeline_stage: targetStage }).eq("id", activeClaimId);
    setClaims((prev) =>
      prev.map((c) => (c.id === activeClaimId ? { ...c, stage: targetStage, daysInStage: 0 } : c))
    );
  };

  const handleCardClick = (claim: PipelineClaim) => {
    // Only open drawer if not currently dragging
    if (!activeId) {
      setDrawerClaim(claim);
    }
  };

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-4 px-1 -mx-1 snap-x">
          {STAGES.map((stage) => (
            <PipelineColumn
              key={stage}
              stage={stage}
              claims={claimsByStage(stage)}
              onCardClick={handleCardClick}
            />
          ))}
        </div>

        <DragOverlay>
          {activeClaim ? (
            <div className="rotate-[2deg]">
              <PipelineCard
                claim={activeClaim}
                onClick={() => {}}
                isDragging
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <ClaimDrawer claim={drawerClaim} onClose={() => setDrawerClaim(null)} />
    </>
  );
}
