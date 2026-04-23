"use client";

import { getRiskLevel } from "@/types/insurer";

const RISK_STYLES = {
  low: "text-green-700 bg-green-50 border-green-200",
  medium: "text-amber-700 bg-amber-50 border-amber-200",
  high: "text-red-700 bg-red-50 border-red-200",
};

export default function RiskScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-[#9ca3af] text-xs">--</span>;
  const level = getRiskLevel(score);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${RISK_STYLES[level]}`}>
      {score}
    </span>
  );
}
