"use client";

import { useState } from "react";
import { CheckCircle, XCircle, MessageSquare, X } from "lucide-react";
import Button from "@/components/ui/Button";
import type { InsurerClaim } from "@/types/insurer";
import { formatDateJO } from "@/lib/utils/format";

interface Props {
  claim: InsurerClaim;
  onDecision: (action: "approved" | "rejected" | "needs_info", reason: string) => Promise<void>;
}

export default function ClaimDecisionActions({ claim, onDecision }: Props) {
  const [modal, setModal] = useState<"approved" | "rejected" | "needs_info" | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isDecided = claim.status === "approved" || claim.status === "rejected";
  const canDecide = claim.status === "pending" || claim.status === "under_review" || claim.status === "needs_info";

  const handleSubmit = async () => {
    if (!modal) return;
    if (modal === "rejected" && !reason.trim()) return;
    setSubmitting(true);
    await onDecision(modal, reason);
    setSubmitting(false);
    setModal(null);
    setReason("");
  };

  if (isDecided) {
    return (
      <div className="bg-white border border-[#e5e7eb] rounded-xl p-6 shadow-sm">
        <h3 className="font-display font-bold text-[#0a0a0a] mb-3">Decision</h3>
        <div className={`p-4 rounded-lg border ${
          claim.status === "approved"
            ? "bg-[#f0fdf4] border-[#bbf7d0]"
            : "bg-red-50 border-red-200"
        }`}>
          <div className="flex items-center gap-2 mb-1">
            {claim.status === "approved" ? (
              <CheckCircle className="h-4 w-4 text-[#16a34a]" />
            ) : (
              <XCircle className="h-4 w-4 text-red-500" />
            )}
            <span className="font-medium text-sm">
              {claim.status === "approved" ? "Approved" : "Rejected"}
            </span>
          </div>
          {claim.decided_at && (
            <p className="text-xs text-[#9ca3af]">{formatDateJO(claim.decided_at)}</p>
          )}
          {claim.decision_reason && (
            <p className="text-sm text-[#374151] mt-2">{claim.decision_reason}</p>
          )}
        </div>
      </div>
    );
  }

  if (!canDecide) return null;

  const MODAL_CONFIG = {
    approved: { title: "Approve Claim", label: "Reason (optional)", required: false, color: "text-[#16a34a]" },
    rejected: { title: "Reject Claim", label: "Reason (required)", required: true, color: "text-red-600" },
    needs_info: { title: "Request More Information", label: "What information is needed?", required: false, color: "text-amber-600" },
  };

  return (
    <>
      <div className="bg-white border border-[#e5e7eb] rounded-xl p-6 shadow-sm">
        <h3 className="font-display font-bold text-[#0a0a0a] mb-4">Review Decision</h3>
        <div className="space-y-2">
          <Button className="w-full gap-2" onClick={() => setModal("approved")}>
            <CheckCircle className="h-4 w-4" />
            Approve
          </Button>
          <Button variant="outline" className="w-full gap-2" onClick={() => setModal("needs_info")}>
            <MessageSquare className="h-4 w-4" />
            Request Info
          </Button>
          <Button variant="danger" className="w-full gap-2" onClick={() => setModal("rejected")}>
            <XCircle className="h-4 w-4" />
            Reject
          </Button>
        </div>
      </div>

      {/* Decision Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setModal(null); setReason(""); }} />
          <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <button
              onClick={() => { setModal(null); setReason(""); }}
              className="absolute top-4 right-4 text-[#9ca3af] hover:text-[#0a0a0a]"
            >
              <X className="h-5 w-5" />
            </button>
            <h3 className={`font-display font-bold text-lg mb-4 ${MODAL_CONFIG[modal].color}`}>
              {MODAL_CONFIG[modal].title}
            </h3>
            <p className="text-sm text-[#6b7280] mb-1">
              Claim <span className="font-mono">{claim.claim_number}</span> — {claim.patient_name}
            </p>
            <label className="block text-sm font-medium text-[#374151] mt-4 mb-1.5">
              {MODAL_CONFIG[modal].label}
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Enter reason..."
              className="w-full px-3 py-2 border border-[#e5e7eb] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0A1628] focus:border-transparent resize-none"
            />
            <div className="flex gap-2 mt-4">
              <Button
                variant="ghost"
                className="flex-1"
                onClick={() => { setModal(null); setReason(""); }}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleSubmit}
                loading={submitting}
                disabled={MODAL_CONFIG[modal].required && !reason.trim()}
              >
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
