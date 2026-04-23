"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { ClaimFlag } from "@/types/insurer";

const SEVERITY_DOT = {
  low: "bg-green-500",
  medium: "bg-amber-500",
  high: "bg-red-500",
};

const SEVERITY_BG = {
  low: "bg-green-50 border-green-200",
  medium: "bg-amber-50 border-amber-200",
  high: "bg-red-50 border-red-200",
};

function formatEvidenceKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

function formatEvidenceValue(value: unknown): string {
  if (typeof value === "number") {
    if (Number.isInteger(value)) return value.toLocaleString();
    return value.toFixed(2);
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export default function FlagCard({ flag }: { flag: ClaimFlag }) {
  const [expanded, setExpanded] = useState(false);
  const evidence = flag.evidence as Record<string, unknown> | null;

  return (
    <div className={`rounded-lg border p-4 ${SEVERITY_BG[flag.severity]}`}>
      <div className="flex items-start gap-3">
        <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${SEVERITY_DOT[flag.severity]}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#0a0a0a]">{flag.title}</p>
          <p className="text-sm text-[#374151] mt-1 leading-relaxed">{flag.explanation}</p>

          {evidence && Object.keys(evidence).length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 text-xs font-medium text-[#6b7280] hover:text-[#374151] transition-colors"
              >
                Evidence
                {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
              {expanded && (
                <div className="mt-2 bg-white/60 rounded-md border border-black/5 overflow-hidden">
                  <table className="w-full text-xs">
                    <tbody>
                      {Object.entries(evidence).map(([key, val]) => (
                        <tr key={key} className="border-b border-black/5 last:border-0">
                          <td className="px-3 py-1.5 font-medium text-[#6b7280] whitespace-nowrap">
                            {formatEvidenceKey(key)}
                          </td>
                          <td className="px-3 py-1.5 text-[#0a0a0a] font-mono">
                            {formatEvidenceValue(val)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
