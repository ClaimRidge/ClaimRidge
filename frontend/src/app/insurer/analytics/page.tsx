"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { InsurerClaim } from "@/types/insurer";
import { formatJod } from "@/lib/utils/format";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  BarChart3,
} from "lucide-react";

export default function AnalyticsPage() {
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

  // Financial stats for this month
  const monthStats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonth = claims.filter(
      (c) => new Date(c.submitted_at) >= monthStart
    );

    const totalBilled = thisMonth.reduce(
      (s, c) => s + Number(c.amount_jod),
      0
    );
    const approvedClaims = thisMonth.filter((c) => c.status === "approved");
    const totalApproved = approvedClaims.reduce(
      (s, c) => s + Number(c.amount_jod),
      0
    );
    const deniedClaims = thisMonth.filter((c) => c.status === "rejected");
    const totalDenied = deniedClaims.reduce(
      (s, c) => s + Number(c.amount_jod),
      0
    );

    return { totalBilled, totalApproved, totalDenied, savings: totalDenied };
  }, [claims]);

  // Claims volume per day (last 30 days)
  const volumeData = useMemo(() => {
    const now = new Date();
    const days: { date: string; received: number; resolved: number }[] = [];

    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const label = `${d.getMonth() + 1}/${d.getDate()}`;

      const received = claims.filter(
        (c) => c.submitted_at.split("T")[0] === dateStr
      ).length;
      const resolved = claims.filter(
        (c) =>
          c.decided_at &&
          c.decided_at.split("T")[0] === dateStr
      ).length;

      days.push({ date: label, received, resolved });
    }

    return days;
  }, [claims]);

  // Top denial reasons
  const denialReasons = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const denied = claims.filter(
      (c) =>
        c.status === "rejected" &&
        c.decision_reason &&
        new Date(c.submitted_at) >= monthStart
    );

    const counts = new Map<string, number>();
    for (const c of denied) {
      const reason = c.decision_reason || "Unspecified";
      counts.set(reason, (counts.get(reason) || 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([reason, count]) => ({ reason: reason.length > 40 ? reason.slice(0, 40) + "..." : reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [claims]);

  // Top CPT codes
  const cptAnalysis = useMemo(() => {
    const cptMap = new Map<
      string,
      { code: string; count: number; totalJod: number; approved: number; total: number }
    >();

    for (const c of claims) {
      for (const code of c.procedure_codes || []) {
        const existing = cptMap.get(code) || {
          code,
          count: 0,
          totalJod: 0,
          approved: 0,
          total: 0,
        };
        existing.count++;
        existing.totalJod += Number(c.amount_jod);
        existing.total++;
        if (c.status === "approved") existing.approved++;
        cptMap.set(code, existing);
      }
    }

    return Array.from(cptMap.values())
      .map((x) => ({
        ...x,
        approvalRate:
          x.total > 0 ? Math.round((x.approved / x.total) * 100) : 0,
        avgAmount: x.count > 0 ? x.totalJod / x.count : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }, [claims]);

  // Top ICD-10 codes
  const icdAnalysis = useMemo(() => {
    const icdMap = new Map<
      string,
      { code: string; count: number; approved: number; total: number }
    >();

    for (const c of claims) {
      for (const code of c.diagnosis_codes || []) {
        const existing = icdMap.get(code) || {
          code,
          count: 0,
          approved: 0,
          total: 0,
        };
        existing.count++;
        existing.total++;
        if (c.status === "approved") existing.approved++;
        icdMap.set(code, existing);
      }
    }

    return Array.from(icdMap.values())
      .map((x) => ({
        ...x,
        approvalRate:
          x.total > 0 ? Math.round((x.approved / x.total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);
  }, [claims]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 text-center">
        <div className="animate-spin h-8 w-8 border-4 border-[#0A1628] border-t-transparent rounded-full mx-auto mb-3" />
        <p className="text-[#9ca3af] text-sm">Loading analytics...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0a0a0a]">
          Analytics
        </h1>
        <p className="text-[#9ca3af] text-sm mt-1">
          Claims trends, financial insights, and code analysis
        </p>
      </div>

      {/* Section 1 — Claims Volume Chart */}
      <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm p-6 mb-6">
        <h2 className="font-display font-bold text-[#0a0a0a] mb-4 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-[#9ca3af]" />
          Claims Volume (Last 30 Days)
        </h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={volumeData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                interval="preserveStartEnd"
              />
              <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} />
              <Tooltip
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid #e5e7eb",
                  fontSize: "12px",
                }}
              />
              <Line
                type="monotone"
                dataKey="received"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                name="Received"
              />
              <Line
                type="monotone"
                dataKey="resolved"
                stroke="#16a34a"
                strokeWidth={2}
                dot={false}
                name="Resolved"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Section 2 — Financial Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-4 w-4 text-[#6b7280]" />
            <span className="text-xs text-[#9ca3af] uppercase tracking-wider">
              Total Billed
            </span>
          </div>
          <p className="font-display text-xl font-bold text-[#0a0a0a]">
            {formatJod(monthStats.totalBilled)}
          </p>
        </div>
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-[#16a34a]" />
            <span className="text-xs text-[#9ca3af] uppercase tracking-wider">
              Total Approved
            </span>
          </div>
          <p className="font-display text-xl font-bold text-[#16a34a]">
            {formatJod(monthStats.totalApproved)}
          </p>
        </div>
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="h-4 w-4 text-red-500" />
            <span className="text-xs text-[#9ca3af] uppercase tracking-wider">
              Total Denied
            </span>
          </div>
          <p className="font-display text-xl font-bold text-red-600">
            {formatJod(monthStats.totalDenied)}
          </p>
        </div>
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <ShieldAlert className="h-4 w-4 text-amber-500" />
            <span className="text-xs text-[#9ca3af] uppercase tracking-wider">
              Savings from Denials
            </span>
          </div>
          <p className="font-display text-xl font-bold text-amber-600">
            {formatJod(monthStats.savings)}
          </p>
        </div>
      </div>

      {/* Section 3 — Top Denial Reasons */}
      <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm p-6 mb-6">
        <h2 className="font-display font-bold text-[#0a0a0a] mb-4">
          Top Denial Reasons This Month
        </h2>
        {denialReasons.length === 0 ? (
          <p className="text-sm text-[#9ca3af] text-center py-4">
            No denials this month
          </p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={denialReasons} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#9ca3af" }} />
                <YAxis
                  dataKey="reason"
                  type="category"
                  width={200}
                  tick={{ fontSize: 10, fill: "#6b7280" }}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "8px",
                    border: "1px solid #e5e7eb",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="count" name="Count" radius={[0, 4, 4, 0]}>
                  {denialReasons.map((_, i) => (
                    <Cell key={i} fill={i < 3 ? "#ef4444" : "#f97316"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Section 4 — CPT Code Analysis */}
      <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-[#f3f4f6]">
          <h2 className="font-display font-bold text-[#0a0a0a]">
            CPT Code Analysis — Top 20
          </h2>
        </div>
        {cptAnalysis.length === 0 ? (
          <p className="text-sm text-[#9ca3af] text-center py-8">
            No procedure data available
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-10">
                <tr className="bg-[#f9fafb] text-left border-b border-[#f3f4f6]">
                  <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase tracking-wider">
                    CPT Code
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase tracking-wider">
                    Times Billed
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase tracking-wider">
                    Total Amount
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase tracking-wider">
                    Approval Rate
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase tracking-wider">
                    Avg Amount
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f3f4f6]">
                {cptAnalysis.map((cpt) => (
                  <tr
                    key={cpt.code}
                    className="hover:bg-[#f9fafb] transition-colors"
                  >
                    <td className="px-6 py-3 text-sm font-mono font-medium text-[#0a0a0a]">
                      {cpt.code}
                    </td>
                    <td className="px-6 py-3 text-sm text-[#6b7280]">
                      {cpt.count}
                    </td>
                    <td className="px-6 py-3 text-sm text-[#6b7280]">
                      {formatJod(cpt.totalJod)}
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={`text-sm font-medium ${
                          cpt.approvalRate >= 70
                            ? "text-[#16a34a]"
                            : cpt.approvalRate >= 50
                            ? "text-amber-600"
                            : "text-red-600"
                        }`}
                      >
                        {cpt.approvalRate}%
                      </span>
                    </td>
                    <td className="px-6 py-3 text-sm text-[#6b7280]">
                      {formatJod(cpt.avgAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section 5 — ICD-10 Distribution */}
      <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-[#f3f4f6]">
          <h2 className="font-display font-bold text-[#0a0a0a]">
            ICD-10 Distribution — Top 15
          </h2>
        </div>
        {icdAnalysis.length === 0 ? (
          <p className="text-sm text-[#9ca3af] text-center py-8">
            No diagnosis data available
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-10">
                <tr className="bg-[#f9fafb] text-left border-b border-[#f3f4f6]">
                  <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase tracking-wider">
                    ICD-10 Code
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase tracking-wider">
                    Frequency
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase tracking-wider">
                    Approval Rate
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f3f4f6]">
                {icdAnalysis.map((icd) => (
                  <tr
                    key={icd.code}
                    className="hover:bg-[#f9fafb] transition-colors"
                  >
                    <td className="px-6 py-3 text-sm font-mono font-medium text-[#0a0a0a]">
                      {icd.code}
                    </td>
                    <td className="px-6 py-3 text-sm text-[#6b7280]">
                      {icd.count}
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={`text-sm font-medium ${
                          icd.approvalRate >= 70
                            ? "text-[#16a34a]"
                            : icd.approvalRate >= 50
                            ? "text-amber-600"
                            : "text-red-600"
                        }`}
                      >
                        {icd.approvalRate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
