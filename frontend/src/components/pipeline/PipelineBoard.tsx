"use client";

import { useState, useCallback, useEffect } from "react";
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
import { PipelineClaim, PipelineStage, RiskLevel } from "@/types/pipeline";
import PipelineColumn from "./PipelineColumn";
import PipelineCard from "./PipelineCard";
import ClaimDrawer from "./ClaimDrawer";
import { createClient } from "@/lib/supabase/client";

const STAGES: PipelineStage[] = [
  "draft",
  "submitted",
  "under_review",
  "approved",
  "denied",
  "appealing",
];

export default function PipelineBoard() {
  const [claims, setClaims] = useState<PipelineClaim[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [drawerClaim, setDrawerClaim] = useState<PipelineClaim | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  // Map the database 'status' to our visual pipeline stages
  const mapStatusToStage = (status: string): PipelineStage => {
    switch (status) {
      case "intake_complete":
      case "submitted":
      case "pending":
        return "submitted";
      case "under_review":
      case "needs_info":
        return "under_review";
      case "approved":
        return "approved";
      case "rejected":
      case "denied":
        return "denied";
      case "appealing":
        return "appealing";
      default:
        return "draft";
    }
  };

  const fetchClaims = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    // Fetch all claims belonging to this specific clinic
    const { data, error } = await supabase
      .from("claims")
      .select("*")
      .eq("clinic_id", session.user.id)
      .order("created_at", { ascending: false });

    if (!error && data) {
      const mappedClaims: PipelineClaim[] = data.map((c: any) => {
        // Calculate days in stage (rough estimate from updated_at)
        const updatedDate = new Date(c.updated_at || c.created_at);
        const diffTime = Math.abs(new Date().getTime() - updatedDate.getTime());
        const daysInStage = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        const riskScore = c.ai_risk_score ?? 0;
        let riskLevel: RiskLevel = "low";
        if (riskScore >= 71) riskLevel = "high";
        else if (riskScore >= 31) riskLevel = "medium";

        // Extract AI issues from scrub_result
        const aiChanges = c.scrub_result?.issues?.map((issue: any) => ({
          field: issue.field || "General",
          before: "",
          after: "",
          reason: issue.message || ""
        })) || [];

        return {
          id: c.id,
          claimId: c.claim_number,
          patientName: c.patient_name,
          payerName: c.payer_name || "Unknown Insurance",
          amount: Number(c.total_billed),
          stage: mapStatusToStage(c.status),
          riskLevel,
          riskScore,
          daysInStage,
          hasAIIssues: aiChanges.length > 0,
          dateOfService: c.date_of_service || c.created_at.split('T')[0],
          providerName: c.provider_name || "Unknown Provider",
          diagnosisCodes: c.diagnosis_codes || [],
          procedureCodes: c.procedure_codes || [],
          revenueAtRisk: aiChanges.length > 0 ? Number(c.total_billed) : 0,
          aiChanges,
          aiSummary: c.ai_recommendation || ""
        };
      });
      setClaims(mappedClaims);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchClaims();
    // Refresh the board every minute to catch insurer updates
    const interval = setInterval(fetchClaims, 60000);
    return () => clearInterval(interval);
  }, [fetchClaims]);

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

  const handleDragEnd = async (event: DragEndEvent) => {
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

    // Update the UI immediately
    setClaims((prev) =>
      prev.map((c) => (c.id === activeClaimId ? { ...c, stage: targetStage, daysInStage: 0 } : c))
    );

    // Map the visual PipelineStage back to the database status
    let dbStatus = "pending";
    if (targetStage === "draft") dbStatus = "draft";
    if (targetStage === "submitted") dbStatus = "submitted";
    if (targetStage === "under_review") dbStatus = "under_review";
    if (targetStage === "approved") dbStatus = "approved";
    if (targetStage === "denied") dbStatus = "rejected";
    if (targetStage === "appealing") dbStatus = "appealing";

    // Persist to Supabase
    await supabase.from("claims").update({ status: dbStatus, updated_at: new Date().toISOString() }).eq("id", activeClaimId);
  };

  const handleCardClick = (claim: PipelineClaim) => {
    if (!activeId) {
      setDrawerClaim(claim);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12">
        <div className="animate-spin h-8 w-8 border-4 border-[#16a34a] border-t-transparent rounded-full mb-4" />
        <p className="text-[#9ca3af] text-sm font-medium">Loading claims pipeline...</p>
      </div>
    );
  }

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