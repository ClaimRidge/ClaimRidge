"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { InsurerClaim } from "@/types/insurer";
import { formatJod, formatDateJO } from "@/lib/utils/format";
import {
  ShieldAlert,
  Copy,
  Layers,
  Repeat,
  DollarSign,
  Zap,
  AlertTriangle,
  Search,
} from "lucide-react";

interface FraudFlag {
  type: string;
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  icon: React.ElementType;
  items: FlaggedItem[];
}

interface FlaggedItem {
  id: string;
  label: string;
  detail: string;
  link: string;
}

function SeverityBadge({ severity }: { severity: string }) {
  const config: Record<string, string> = {
    high: "bg-red-100 text-red-700 border-red-200",
    medium: "bg-amber-100 text-amber-700 border-amber-200",
    low: "bg-yellow-50 text-yellow-700 border-yellow-200",
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${config[severity] || config.medium}`}>
      {severity.charAt(0).toUpperCase() + severity.slice(1)}
    </span>
  );
}

export default function FraudPage() {
  const [claims, setClaims] = useState<InsurerClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("insurer_claims")
        .select("*")
        .order("submitted_at", { ascending: false });
      if (data) setClaims(data as InsurerClaim[]);
      setLoading(false);
    };
    fetch();
  }, []);

  const fraudFlags: FraudFlag[] = useMemo(() => {
    const flags: FraudFlag[] = [];

    // 1. Duplicate Claims
    const dupeMap = new Map<string, InsurerClaim[]>();
    for (const c of claims) {
      const key = `${c.patient_name}|${(c.procedure_codes || []).sort().join(",")}|${c.service_date}`;
      const existing = dupeMap.get(key) || [];
      existing.push(c);
      dupeMap.set(key, existing);
    }
    const duplicates: FlaggedItem[] = [];
    for (const [, group] of Array.from(dupeMap.entries())) {
      if (group.length > 1) {
        for (const c of group) {
          duplicates.push({
            id: c.id,
            label: c.claim_number,
            detail: `${c.patient_name} — ${formatDateJO(c.service_date)} — ${formatJod(Number(c.amount_jod))}`,
            link: `/insurer/claims/${c.id}`,
          });
        }
      }
    }
    if (duplicates.length > 0) {
      flags.push({
        type: "duplicate",
        severity: "high",
        title: "Duplicate Claims",
        description: "Same patient, procedure codes, and date of service submitted more than once.",
        icon: Copy,
        items: duplicates,
      });
    }

    // 2. Unbundling Pattern
    const clinicCptCounts = new Map<string, { total: number; highCode: number }>();
    for (const c of claims) {
      const clinic = c.clinic_name || "Unknown";
      const existing = clinicCptCounts.get(clinic) || { total: 0, highCode: 0 };
      existing.total++;
      if ((c.procedure_codes || []).length >= 4) existing.highCode++;
      clinicCptCounts.set(clinic, existing);
    }
    const unbundling: FlaggedItem[] = [];
    for (const [clinic, stats] of Array.from(clinicCptCounts.entries())) {
      if (stats.total >= 5 && (stats.highCode / stats.total) > 0.3) {
        unbundling.push({
          id: clinic,
          label: clinic,
          detail: `${stats.highCode}/${stats.total} claims have 4+ CPT codes (${Math.round((stats.highCode / stats.total) * 100)}%)`,
          link: "/insurer/providers",
        });
      }
    }
    if (unbundling.length > 0) {
      flags.push({
        type: "unbundling",
        severity: "medium",
        title: "Unbundling Pattern",
        description: "Clinics where >30% of claims have 4+ procedure codes, suggesting potential unbundling.",
        icon: Layers,
        items: unbundling,
      });
    }

    // 3. High Frequency Same Code
    const clinicCodeFreq = new Map<string, Map<string, number>>();
    const clinicTotals = new Map<string, number>();
    for (const c of claims) {
      const clinic = c.clinic_name || "Unknown";
      clinicTotals.set(clinic, (clinicTotals.get(clinic) || 0) + 1);
      if (!clinicCodeFreq.has(clinic)) clinicCodeFreq.set(clinic, new Map());
      const cptMap = clinicCodeFreq.get(clinic)!;
      for (const code of c.procedure_codes || []) {
        cptMap.set(code, (cptMap.get(code) || 0) + 1);
      }
    }
    const sameCode: FlaggedItem[] = [];
    for (const [clinic, cptMap] of Array.from(clinicCodeFreq.entries())) {
      const total = clinicTotals.get(clinic) || 1;
      if (total < 5) continue;
      for (const [code, count] of Array.from(cptMap.entries())) {
        if ((count / total) > 0.9) {
          sameCode.push({
            id: `${clinic}-${code}`,
            label: clinic,
            detail: `CPT ${code} used in ${Math.round((count / total) * 100)}% of claims (${count}/${total})`,
            link: "/insurer/providers",
          });
        }
      }
    }
    if (sameCode.length > 0) {
      flags.push({
        type: "same_code",
        severity: "medium",
        title: "High Frequency Same Code",
        description: "Same CPT code billed for >90% of a clinic's claims. May suggest upcoding or pattern billing.",
        icon: Repeat,
        items: sameCode,
      });
    }

    // 4. Amount Outliers
    const cptAvg = new Map<string, { sum: number; count: number }>();
    for (const c of claims) {
      for (const code of c.procedure_codes || []) {
        const existing = cptAvg.get(code) || { sum: 0, count: 0 };
        existing.sum += Number(c.amount_jod);
        existing.count++;
        cptAvg.set(code, existing);
      }
    }
    const amountOutliers: FlaggedItem[] = [];
    for (const c of claims) {
      for (const code of c.procedure_codes || []) {
        const avg = cptAvg.get(code);
        if (avg && avg.count >= 3) {
          const mean = avg.sum / avg.count;
          if (Number(c.amount_jod) > mean * 3) {
            amountOutliers.push({
              id: c.id,
              label: c.claim_number,
              detail: `${formatJod(Number(c.amount_jod))} for CPT ${code} (avg: ${formatJod(mean)}) — ${c.clinic_name}`,
              link: `/insurer/claims/${c.id}`,
            });
          }
        }
      }
    }
    // Dedupe by claim id
    const uniqueOutliers = Array.from(new Map(amountOutliers.map((x) => [x.id, x])).values());
    if (uniqueOutliers.length > 0) {
      flags.push({
        type: "amount_outlier",
        severity: "high",
        title: "Amount Outliers",
        description: "Claims where billed amount is >3x the average for that CPT code across all providers.",
        icon: DollarSign,
        items: uniqueOutliers.slice(0, 20),
      });
    }

    // 5. Rapid Submission Pattern
    const clinicDayCounts = new Map<string, Map<string, number>>();
    for (const c of claims) {
      const clinic = c.clinic_name || "Unknown";
      const day = c.submitted_at.split("T")[0];
      if (!clinicDayCounts.has(clinic)) clinicDayCounts.set(clinic, new Map());
      const dayMap = clinicDayCounts.get(clinic)!;
      dayMap.set(day, (dayMap.get(day) || 0) + 1);
    }
    const rapidSubmission: FlaggedItem[] = [];
    for (const [clinic, dayMap] of Array.from(clinicDayCounts.entries())) {
      for (const [day, count] of Array.from(dayMap.entries())) {
        if (count > 20) {
          rapidSubmission.push({
            id: `${clinic}-${day}`,
            label: clinic,
            detail: `${count} claims submitted on ${formatDateJO(day)}`,
            link: "/insurer/providers",
          });
        }
      }
    }
    if (rapidSubmission.length > 0) {
      flags.push({
        type: "rapid_submission",
        severity: "medium",
        title: "Rapid Submission Pattern",
        description: "Clinics submitting >20 claims in a single day.",
        icon: Zap,
        items: rapidSubmission,
      });
    }

    return flags;
  }, [claims]);

  const totalFlags = fraudFlags.reduce((s, f) => s + f.items.length, 0);
  const highSeverity = fraudFlags.filter((f) => f.severity === "high").length;

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 text-center">
        <div className="animate-spin h-8 w-8 border-4 border-[#0A1628] border-t-transparent rounded-full mx-auto mb-3" />
        <p className="text-[#9ca3af] text-sm">Scanning for fraud patterns...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0a0a0a]">
          Fraud Detection
        </h1>
        <p className="text-[#9ca3af] text-sm mt-1">
          Pattern analysis and suspicious activity monitoring
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <ShieldAlert className="h-4 w-4 text-red-500" />
            <span className="text-xs text-[#9ca3af] uppercase tracking-wider">
              Total Flags
            </span>
          </div>
          <p className={`font-display text-2xl font-bold ${totalFlags > 0 ? "text-red-600" : "text-[#0a0a0a]"}`}>
            {totalFlags}
          </p>
        </div>
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <span className="text-xs text-[#9ca3af] uppercase tracking-wider">
              High Severity
            </span>
          </div>
          <p className={`font-display text-2xl font-bold ${highSeverity > 0 ? "text-red-600" : "text-[#0a0a0a]"}`}>
            {highSeverity}
          </p>
        </div>
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Search className="h-4 w-4 text-[#6b7280]" />
            <span className="text-xs text-[#9ca3af] uppercase tracking-wider">
              Claims Analyzed
            </span>
          </div>
          <p className="font-display text-2xl font-bold text-[#0a0a0a]">
            {claims.length}
          </p>
        </div>
      </div>

      {/* Fraud Flag Sections */}
      {fraudFlags.length === 0 ? (
        <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm p-12 text-center">
          <ShieldAlert className="h-12 w-12 text-[#d1d5db] mx-auto mb-4" />
          <h3 className="font-display font-bold text-[#0a0a0a] mb-1">
            No suspicious patterns detected
          </h3>
          <p className="text-[#9ca3af] text-sm">
            All claims are within normal parameters. Analysis runs on{" "}
            {claims.length} claims.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {fraudFlags.map((flag) => (
            <div
              key={flag.type}
              className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm overflow-hidden"
            >
              {/* Flag Header */}
              <div className={`px-6 py-4 border-b flex items-center justify-between ${
                flag.severity === "high"
                  ? "bg-red-50 border-red-200"
                  : flag.severity === "medium"
                  ? "bg-amber-50 border-amber-200"
                  : "bg-yellow-50 border-yellow-200"
              }`}>
                <div className="flex items-center gap-3">
                  <flag.icon
                    className={`h-5 w-5 ${
                      flag.severity === "high"
                        ? "text-red-500"
                        : "text-amber-500"
                    }`}
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-display font-bold text-[#0a0a0a]">
                        {flag.title}
                      </h3>
                      <SeverityBadge severity={flag.severity} />
                    </div>
                    <p className="text-sm text-[#6b7280] mt-0.5">
                      {flag.description}
                    </p>
                  </div>
                </div>
                <span className="text-sm font-semibold text-[#374151] bg-white px-3 py-1 rounded-full border border-[#e5e7eb]">
                  {flag.items.length} flagged
                </span>
              </div>

              {/* Flagged Items */}
              <div className="divide-y divide-[#f3f4f6]">
                {flag.items.slice(0, 10).map((item) => (
                  <div
                    key={item.id}
                    className="px-6 py-3 flex items-center justify-between hover:bg-[#f9fafb] transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium text-[#0a0a0a] font-mono">
                        {item.label}
                      </p>
                      <p className="text-xs text-[#6b7280] mt-0.5">
                        {item.detail}
                      </p>
                    </div>
                    <Link
                      href={item.link}
                      className="text-sm text-[#16a34a] hover:text-[#15803d] font-semibold flex-shrink-0"
                    >
                      Investigate
                    </Link>
                  </div>
                ))}
                {flag.items.length > 10 && (
                  <div className="px-6 py-3 text-center">
                    <p className="text-sm text-[#9ca3af]">
                      +{flag.items.length - 10} more items
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
