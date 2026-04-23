"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { InsurerClaim } from "@/types/insurer";
import { formatJod } from "@/lib/utils/format";
import {
  Users,
  ShieldCheck,
  AlertTriangle,
  FileText,
  TrendingUp,
  TrendingDown,
  Activity,
  Zap,
  Clock,
} from "lucide-react";

interface ProviderStats {
  clinicName: string;
  clinicId: string | null;
  totalClaims: number;
  approved: number;
  rejected: number;
  pending: number;
  avgClaimValue: number;
  totalBilled: number;
  approvalRate: number;
  denialRate: number;
  scrubPassRate: number;
  timelinessScore: number;
  complianceScore: number;
  topCpt: string;
  flags: string[];
}

function ComplianceBadge({ score }: { score: number }) {
  let label: string;
  let color: string;
  if (score >= 90) {
    label = "Excellent";
    color = "bg-[#dcfce7] text-[#16a34a] border-[#bbf7d0]";
  } else if (score >= 75) {
    label = "Good";
    color = "bg-blue-50 text-blue-700 border-blue-200";
  } else if (score >= 60) {
    label = "Fair";
    color = "bg-amber-50 text-amber-700 border-amber-200";
  } else {
    label = "Needs Improvement";
    color = "bg-red-50 text-red-700 border-red-200";
  }
  return (
    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${color}`}>
      {score}% — {label}
    </span>
  );
}

export default function ProvidersPage() {
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

  const networkAvgClaim = useMemo(() => {
    if (claims.length === 0) return 0;
    return claims.reduce((s, c) => s + Number(c.amount_jod), 0) / claims.length;
  }, [claims]);

  const providers = useMemo(() => {
    const map = new Map<string, ProviderStats>();

    for (const c of claims) {
      const key = c.clinic_name || c.clinic_id || "Unknown";
      const existing = map.get(key) || {
        clinicName: c.clinic_name,
        clinicId: c.clinic_id,
        totalClaims: 0,
        approved: 0,
        rejected: 0,
        pending: 0,
        avgClaimValue: 0,
        totalBilled: 0,
        approvalRate: 0,
        denialRate: 0,
        scrubPassRate: 0,
        timelinessScore: 0,
        complianceScore: 0,
        topCpt: "",
        flags: [],
      };

      existing.totalClaims++;
      existing.totalBilled += Number(c.amount_jod);

      if (c.status === "approved") existing.approved++;
      if (c.status === "rejected") existing.rejected++;
      if (c.status === "pending" || c.status === "under_review") existing.pending++;

      map.set(key, existing);
    }

    // Calculate rates and scores
    const now = new Date();
    const result: ProviderStats[] = [];

    for (const [key, p] of Array.from(map.entries())) {
      const decided = p.approved + p.rejected;
      p.approvalRate = decided > 0 ? Math.round((p.approved / decided) * 100) : 100;
      p.denialRate = decided > 0 ? Math.round((p.rejected / decided) * 100) : 0;
      p.avgClaimValue = p.totalClaims > 0 ? p.totalBilled / p.totalClaims : 0;

      // Scrub pass rate — based on AI risk score (score < 31 = pass)
      const providerClaims = claims.filter(
        (c) => (c.clinic_name || c.clinic_id) === key
      );
      const scrubPassed = providerClaims.filter(
        (c) => (c.ai_risk_score ?? 0) < 31
      ).length;
      p.scrubPassRate =
        providerClaims.length > 0
          ? Math.round((scrubPassed / providerClaims.length) * 100)
          : 100;

      // Timeliness — % submitted within 60 days of service date
      const timely = providerClaims.filter((c) => {
        const service = new Date(c.service_date);
        const submitted = new Date(c.submitted_at);
        const diffDays =
          (submitted.getTime() - service.getTime()) / (1000 * 60 * 60 * 24);
        return diffDays <= 60;
      }).length;
      p.timelinessScore =
        providerClaims.length > 0
          ? Math.round((timely / providerClaims.length) * 100)
          : 100;

      // Compliance score
      p.complianceScore = Math.round(
        p.approvalRate * 0.5 + p.scrubPassRate * 0.3 + p.timelinessScore * 0.2
      );

      // Top CPT
      const cptCount = new Map<string, number>();
      for (const cl of providerClaims) {
        for (const code of cl.procedure_codes || []) {
          cptCount.set(code, (cptCount.get(code) || 0) + 1);
        }
      }
      let topCpt = "";
      let topCount = 0;
      for (const [code, count] of Array.from(cptCount.entries())) {
        if (count > topCount) {
          topCpt = code;
          topCount = count;
        }
      }
      p.topCpt = topCpt;

      // Fraud flags
      p.flags = [];

      // High volume flag
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const thisMonthClaims = providerClaims.filter(
        (c) => new Date(c.submitted_at) >= monthStart
      ).length;
      if (thisMonthClaims > 100) {
        p.flags.push("High Volume");
      }

      // High value outlier
      if (networkAvgClaim > 0 && p.avgClaimValue > networkAvgClaim * 2) {
        p.flags.push("High Value Outlier");
      }

      // Low scrub rate
      if (p.scrubPassRate < 40) {
        p.flags.push("Low Scrub Rate");
      }

      // Same code pattern — >80% identical procedure codes
      if (topCount > 0 && p.totalClaims > 3) {
        const sameCodePct = (topCount / p.totalClaims) * 100;
        if (sameCodePct > 80) {
          p.flags.push("Same Code Pattern");
        }
      }

      result.push(p);
    }

    return result.sort((a, b) => b.totalClaims - a.totalClaims);
  }, [claims, networkAvgClaim]);

  // Summary stats
  const totalProviders = providers.length;
  const avgCompliance =
    providers.length > 0
      ? Math.round(
          providers.reduce((s, p) => s + p.complianceScore, 0) / providers.length
        )
      : 0;
  const flaggedCount = providers.filter((p) => p.complianceScore < 60).length;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const claimsThisMonth = claims.filter(
    (c) => new Date(c.submitted_at) >= monthStart
  ).length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0a0a0a]">
          Provider Network Intelligence
        </h1>
        <p className="text-[#9ca3af] text-sm mt-1">
          Compliance monitoring and fraud flag detection across your provider
          network
        </p>
      </div>

      {/* Summary Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-blue-500" />
            <span className="text-xs text-[#9ca3af] uppercase tracking-wider">
              Total Providers
            </span>
          </div>
          <p className="font-display text-2xl font-bold text-[#0a0a0a]">
            {totalProviders}
          </p>
        </div>
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="h-4 w-4 text-[#16a34a]" />
            <span className="text-xs text-[#9ca3af] uppercase tracking-wider">
              Avg Compliance
            </span>
          </div>
          <p className="font-display text-2xl font-bold text-[#16a34a]">
            {avgCompliance}%
          </p>
        </div>
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <span className="text-xs text-[#9ca3af] uppercase tracking-wider">
              Providers Flagged
            </span>
          </div>
          <p className={`font-display text-2xl font-bold ${flaggedCount > 0 ? "text-red-600" : "text-[#0a0a0a]"}`}>
            {flaggedCount}
          </p>
        </div>
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-4 w-4 text-[#6b7280]" />
            <span className="text-xs text-[#9ca3af] uppercase tracking-wider">
              Claims This Month
            </span>
          </div>
          <p className="font-display text-2xl font-bold text-[#0a0a0a]">
            {claimsThisMonth}
          </p>
        </div>
      </div>

      {/* Provider Cards Grid */}
      {loading ? (
        <div className="p-12 text-center">
          <div className="animate-spin h-8 w-8 border-4 border-[#0A1628] border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-[#9ca3af] text-sm">Loading providers...</p>
        </div>
      ) : providers.length === 0 ? (
        <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm p-12 text-center">
          <Users className="h-12 w-12 text-[#d1d5db] mx-auto mb-4" />
          <h3 className="font-display font-bold text-[#0a0a0a] mb-1">
            No providers in network
          </h3>
          <p className="text-[#9ca3af] text-sm">
            Provider data will appear as claims are submitted.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {providers.map((p) => (
            <div
              key={p.clinicName}
              className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm overflow-hidden hover:shadow-md transition-shadow"
            >
              {/* Card Header */}
              <div className="px-5 py-4 border-b border-[#f3f4f6] flex items-center justify-between">
                <div>
                  <h3 className="font-display font-bold text-[#0a0a0a] text-sm">
                    {p.clinicName}
                  </h3>
                  {p.clinicId && (
                    <p className="text-xs font-mono text-[#9ca3af]">
                      {p.clinicId.slice(0, 8)}...
                    </p>
                  )}
                </div>
                <ComplianceBadge score={p.complianceScore} />
              </div>

              {/* Stats Grid */}
              <div className="px-5 py-4 grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-lg font-bold text-[#0a0a0a]">{p.totalClaims}</p>
                  <p className="text-xs text-[#9ca3af]">Claims</p>
                </div>
                <div>
                  <p className={`text-lg font-bold ${p.approvalRate >= 70 ? "text-[#16a34a]" : p.approvalRate >= 50 ? "text-amber-600" : "text-red-600"}`}>
                    {p.approvalRate}%
                  </p>
                  <p className="text-xs text-[#9ca3af]">Approval</p>
                </div>
                <div>
                  <p className={`text-lg font-bold ${p.scrubPassRate >= 70 ? "text-[#16a34a]" : p.scrubPassRate >= 40 ? "text-amber-600" : "text-red-600"}`}>
                    {p.scrubPassRate}%
                  </p>
                  <p className="text-xs text-[#9ca3af]">Scrub Pass</p>
                </div>
              </div>

              {/* Details */}
              <div className="px-5 pb-4 space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[#6b7280] flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5" /> Avg Claim
                  </span>
                  <span className="font-medium text-[#0a0a0a]">
                    {formatJod(p.avgClaimValue)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[#6b7280] flex items-center gap-1.5">
                    <TrendingDown className="h-3.5 w-3.5" /> Denial Rate
                  </span>
                  <span className={`font-medium ${p.denialRate > 30 ? "text-red-600" : "text-[#0a0a0a]"}`}>
                    {p.denialRate}%
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[#6b7280] flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5" /> Top CPT
                  </span>
                  <span className="font-mono text-xs text-[#0a0a0a]">
                    {p.topCpt || "--"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[#6b7280] flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" /> Timeliness
                  </span>
                  <span className="font-medium text-[#0a0a0a]">
                    {p.timelinessScore}%
                  </span>
                </div>
              </div>

              {/* Fraud Flags */}
              {p.flags.length > 0 && (
                <div className="px-5 py-3 bg-red-50 border-t border-red-200">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                    <span className="text-xs font-semibold text-red-700 uppercase tracking-wider">
                      Fraud Flags
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {p.flags.map((flag) => (
                      <span
                        key={flag}
                        className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700"
                      >
                        {flag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
