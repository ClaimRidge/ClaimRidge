"use client";

import type { InsurerClaimStatus } from "@/types/insurer";

const CONFIG: Record<InsurerClaimStatus, { label: string; class: string }> = {
  pending: { label: "Pending", class: "bg-[#f3f4f6] text-[#6b7280] border-[#e5e7eb]" },
  under_review: { label: "Under Review", class: "bg-blue-50 text-blue-700 border-blue-200" },
  approved: { label: "Approved", class: "bg-[#f0fdf4] text-[#16a34a] border-[#bbf7d0]" },
  rejected: { label: "Rejected", class: "bg-red-50 text-red-700 border-red-200" },
  needs_info: { label: "Needs Info", class: "bg-amber-50 text-amber-700 border-amber-200" },
};

export default function ClaimStatusPill({ status }: { status: InsurerClaimStatus }) {
  const c = CONFIG[status] || CONFIG.pending;
  return (
    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium border ${c.class}`}>
      {c.label}
    </span>
  );
}
