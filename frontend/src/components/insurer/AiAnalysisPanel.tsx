"use client";

import { Bot } from "lucide-react";
import type { InsurerClaim, ClaimFlag } from "@/types/insurer";
import { getRiskLevel } from "@/types/insurer";
import FlagCard from "./FlagCard";

const RISK_RING_COLORS = {
  low: { stroke: "text-green-500", text: "text-green-700", bg: "bg-green-50", border: "border-green-200" },
  medium: { stroke: "text-amber-500", text: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" },
  high: { stroke: "text-red-500", text: "text-red-700", bg: "bg-red-50", border: "border-red-200" },
};

export default function AiAnalysisPanel({ claim, flags }: { claim: InsurerClaim; flags: ClaimFlag[] }) {
  const score = claim.ai_risk_score ?? 0;
  const level = getRiskLevel(claim.ai_risk_score);
  const colors = RISK_RING_COLORS[level];
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm p-6">
      <div className="flex items-center gap-2 mb-5">
        <Bot className="h-5 w-5 text-[#0A1628]" />
        <h3 className="font-display font-bold text-[#0a0a0a]">AI Risk Analysis</h3>
      </div>

      {/* Risk Score Ring */}
      <div className="flex flex-col items-center mb-5">
        <div className={`relative inline-flex items-center justify-center w-28 h-28 ${colors.bg} ${colors.border} border rounded-full`}>
          <svg className="w-20 h-20 -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="8" className="text-[#e5e7eb]" />
            <circle
              cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="8"
              strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
              className={colors.stroke}
            />
          </svg>
          <span className={`absolute text-2xl font-extrabold ${colors.text}`}>{score}</span>
        </div>
        <p className={`text-xs font-medium mt-2 ${colors.text}`}>
          {level === "high" ? "High Risk" : level === "medium" ? "Medium Risk" : "Low Risk"}
        </p>
      </div>

      {/* Flags */}
      {flags.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-wider text-[#9ca3af] font-medium">
            {flags.length} flag{flags.length !== 1 ? "s" : ""} detected
          </p>
          {flags.map((flag) => (
            <FlagCard key={flag.id} flag={flag} />
          ))}
        </div>
      ) : (
        <div className="text-center py-4">
          <p className="text-sm text-[#6b7280]">No flags detected</p>
        </div>
      )}
    </div>
  );
}
