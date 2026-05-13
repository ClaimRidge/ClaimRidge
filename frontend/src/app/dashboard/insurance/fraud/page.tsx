"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  ShieldAlert,
  ArrowLeft,
  AlertTriangle,
  FileText,
  Sparkles,
  Eye,
} from "lucide-react";
import Button from "@/components/ui/Button";

interface FlaggedClaim {
  id: string;
  claim_number: string;
  patient_name: string;
  provider_name: string;
  total_billed: number;
  currency: string;
  fraud_score: number | null;
  fraud_risk_level: "low" | "high" | "extreme" | "insufficient_data" | null;
  fraud_flags: any[];
  fraud_case_id: string | null;
  created_at: string;
}

interface FraudCase {
  id: string;
  claim_id: string;
  flag_type: string;
  severity: string;
  confidence: number;
  summary_en: string;
  summary_ar: string;
  key_evidence: { type: string; description: string }[];
  recommended_actions: { description: string; priority: string }[];
  fraud_score: number;
  anomaly_flags: string[];
  created_at: string;
}

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "";

export default function InsurerFraudPage() {
  const supabase = createClient();
  const [insurerId, setInsurerId] = useState<string | null>(null);
  const [claims, setClaims] = useState<FlaggedClaim[]>([]);
  const [casesByClaim, setCasesByClaim] = useState<Record<string, FraudCase>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"flagged" | "all">("flagged");
  const [openCaseId, setOpenCaseId] = useState<string | null>(null);
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  const [authHeader, setAuthHeader] = useState<string>("");

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setAuthHeader(`Bearer ${session.access_token}`);

    const { data: profile } = await supabase
      .from("profiles")
      .select("insurer_id, account_type")
      .eq("id", session.user.id)
      .maybeSingle();
    if (!profile?.insurer_id || profile.account_type !== "insurance") {
      setLoading(false);
      return;
    }
    setInsurerId(profile.insurer_id);

    const { data: claimRows } = await supabase
      .from("claims")
      .select("id, claim_number, patient_name, provider_name, total_billed, currency, fraud_score, fraud_risk_level, fraud_flags, fraud_case_id, created_at")
      .eq("payer_id", profile.insurer_id)
      .eq("routing_status", "routed")
      .order("created_at", { ascending: false })
      .limit(500);

    setClaims((claimRows || []) as FlaggedClaim[]);

    // Load any persisted fraud cases for this insurer
    const { data: caseRows } = await supabase
      .from("fraud_cases")
      .select("*")
      .eq("insurer_id", profile.insurer_id);
    const byClaim: Record<string, FraudCase> = {};
    (caseRows || []).forEach((c: any) => { byClaim[c.claim_id] = c as FraudCase; });
    setCasesByClaim(byClaim);

    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const flagged = useMemo(
    () => claims.filter((c) => c.fraud_risk_level === "high" || c.fraud_risk_level === "extreme"),
    [claims]
  );
  const visible = tab === "flagged" ? flagged : claims;

  const generateCase = async (claim: FlaggedClaim) => {
    setGeneratingFor(claim.id);
    try {
      const res = await fetch(`${BACKEND}/api/fraud/generate-case`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({
          claim_id: claim.id,
          fraud_score: claim.fraud_score ?? 0,
          flags: (claim.fraud_flags || []).map((f: any) => typeof f === "string" ? f : f?.description || String(f)),
        }),
      });
      if (res.ok) await load();
    } finally {
      setGeneratingFor(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="mb-6">
        <Link href="/dashboard/insurance" className="flex items-center gap-2 text-sm text-[#6b7280] hover:text-[#0A1628] font-medium">
          <ArrowLeft className="h-4 w-4" /> Back to Dashboard
        </Link>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <div className="inline-flex items-center justify-center w-10 h-10 bg-red-50 border border-red-200 rounded-lg">
          <ShieldAlert className="h-5 w-5 text-red-600" />
        </div>
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0a0a0a]">Fraud Detection</h1>
          <p className="text-[#9ca3af] text-sm">Claims flagged by the Layer-1 statistical model. Click a row to generate a structured case file.</p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-6">
        <TabButton active={tab === "flagged"} onClick={() => setTab("flagged")} count={flagged.length} label="Flagged" />
        <TabButton active={tab === "all"} onClick={() => setTab("all")} count={claims.length} label="All claims" />
      </div>

      <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-[#9ca3af] text-sm">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="p-12 text-center">
            <ShieldAlert className="h-10 w-10 text-[#d1d5db] mx-auto mb-3" />
            <h3 className="font-bold text-[#0a0a0a]">No flagged claims</h3>
            <p className="text-sm text-[#9ca3af] mt-1">Claims flagged by the statistical model will appear here.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-[#f9fafb] text-left border-b border-[#f3f4f6]">
                <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase">Claim #</th>
                <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase">Patient</th>
                <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase">Provider</th>
                <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase">Risk</th>
                <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase">Case File</th>
                <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f3f4f6]">
              {visible.map((c) => {
                const caseFile = casesByClaim[c.id];
                return (
                  <tr key={c.id} className="hover:bg-[#f9fafb]">
                    <td className="px-6 py-4 font-mono text-sm">{c.claim_number}</td>
                    <td className="px-6 py-4 text-sm text-[#0a0a0a]">{c.patient_name}</td>
                    <td className="px-6 py-4 text-sm text-[#6b7280]">{c.provider_name}</td>
                    <td className="px-6 py-4 text-sm">
                      <RiskBadge level={c.fraud_risk_level} score={c.fraud_score} />
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {caseFile ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-purple-50 text-purple-700">
                          {caseFile.severity}
                        </span>
                      ) : (
                        <span className="text-xs text-[#9ca3af]">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/dashboard/insurance/claims/${c.id}`}
                          className="text-xs font-bold text-[#0A1628] hover:underline flex items-center gap-1"
                        >
                          <Eye className="h-3 w-3" /> View claim
                        </Link>
                        {caseFile ? (
                          <button
                            onClick={() => setOpenCaseId(c.id)}
                            className="text-xs font-bold text-purple-700 hover:underline flex items-center gap-1"
                          >
                            <FileText className="h-3 w-3" /> Open case
                          </button>
                        ) : (
                          (c.fraud_risk_level === "high" || c.fraud_risk_level === "extreme") && (
                            <button
                              onClick={() => generateCase(c)}
                              disabled={generatingFor === c.id}
                              className="text-xs font-bold text-[#16a34a] hover:underline flex items-center gap-1 disabled:opacity-50"
                            >
                              <Sparkles className="h-3 w-3" /> {generatingFor === c.id ? "Generating…" : "Generate case"}
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Case file modal */}
      {openCaseId && casesByClaim[openCaseId] && (
        <CaseModal caseFile={casesByClaim[openCaseId]} onClose={() => setOpenCaseId(null)} />
      )}
    </div>
  );
}

function TabButton({ active, onClick, count, label }: { active: boolean; onClick: () => void; count: number; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-bold transition-all border ${
        active
          ? "bg-[#0A1628] text-white border-[#0A1628]"
          : "bg-white text-[#6b7280] border-[#e5e7eb] hover:border-[#0A1628]"
      }`}
    >
      {label} <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${active ? "bg-white/20" : "bg-[#f3f4f6]"}`}>{count}</span>
    </button>
  );
}

function RiskBadge({ level, score }: { level: FlaggedClaim["fraud_risk_level"]; score: number | null }) {
  if (!level || level === "low") {
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-green-50 text-green-700">
        low{typeof score === "number" ? ` · ${score.toFixed(0)}%` : ""}
      </span>
    );
  }
  if (level === "insufficient_data") {
    return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-600">insufficient data</span>;
  }
  const color = level === "extreme" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700";
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${color}`}>
      {level}{typeof score === "number" ? ` · ${score.toFixed(0)}%` : ""}
    </span>
  );
}

function CaseModal({ caseFile, onClose }: { caseFile: FraudCase; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-[#f3f4f6] flex items-center justify-between sticky top-0 bg-white">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <h3 className="font-display font-bold text-lg text-[#0a0a0a]">Fraud Case File</h3>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-50 text-red-700 uppercase">
              {caseFile.severity}
            </span>
          </div>
          <button onClick={onClose} className="text-[#9ca3af] hover:text-[#0a0a0a]">✕</button>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <h4 className="text-xs font-bold uppercase text-[#9ca3af] mb-2">Flag Type</h4>
            <p className="text-sm text-[#0a0a0a]">{caseFile.flag_type}</p>
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase text-[#9ca3af] mb-2">Summary (English)</h4>
            <p className="text-sm text-[#0a0a0a] leading-relaxed">{caseFile.summary_en}</p>
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase text-[#9ca3af] mb-2">Summary (Arabic)</h4>
            <p className="text-sm text-[#0a0a0a] leading-relaxed text-right" dir="rtl">{caseFile.summary_ar}</p>
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase text-[#9ca3af] mb-2">Key Evidence</h4>
            <ul className="space-y-2">
              {caseFile.key_evidence?.map((e, i) => (
                <li key={i} className="text-sm flex gap-2">
                  <span className="font-bold text-[#0A1628] whitespace-nowrap">[{e.type}]</span>
                  <span className="text-[#374151]">{e.description}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase text-[#9ca3af] mb-2">Recommended Actions</h4>
            <ul className="space-y-2">
              {caseFile.recommended_actions?.map((a, i) => (
                <li key={i} className="text-sm flex gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap ${
                    a.priority === "immediate" ? "bg-red-50 text-red-700" :
                    a.priority === "this_week" ? "bg-amber-50 text-amber-700" :
                    "bg-gray-100 text-gray-600"
                  }`}>{a.priority}</span>
                  <span className="text-[#374151]">{a.description}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="pt-4 border-t border-[#f3f4f6] flex items-center justify-between text-xs text-[#9ca3af]">
            <span>Confidence: {(caseFile.confidence * 100).toFixed(0)}%</span>
            <span>Statistical score: {caseFile.fraud_score}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
