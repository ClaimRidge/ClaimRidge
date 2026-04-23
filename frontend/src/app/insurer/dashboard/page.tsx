"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { InsurerClaim } from "@/types/insurer";
import ClaimStatusPill from "@/components/insurer/ClaimStatusPill";
import RiskScoreBadge from "@/components/insurer/RiskScoreBadge";
import { formatJod, formatRelativeTime } from "@/lib/utils/format";
import {
  Clock,
  ShieldAlert,
  CheckCircle,
  TrendingDown,
  Timer,
  Inbox,
  ArrowRight,
  FileText,
  XCircle,
  Send,
  AlertTriangle,
} from "lucide-react";

interface ActivityEvent {
  id: string;
  claim_number: string;
  event: string;
  time: string;
  color: string;
}

function KpiCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: "green" | "amber" | "red" | "blue" | "navy" | "gray";
}) {
  const colorMap = {
    green: { bg: "bg-[#f0fdf4]", border: "border-[#bbf7d0]", icon: "text-[#16a34a]", text: "text-[#16a34a]" },
    amber: { bg: "bg-amber-50", border: "border-amber-200", icon: "text-amber-500", text: "text-amber-600" },
    red: { bg: "bg-red-50", border: "border-red-200", icon: "text-red-500", text: "text-red-600" },
    blue: { bg: "bg-blue-50", border: "border-blue-200", icon: "text-blue-500", text: "text-blue-600" },
    navy: { bg: "bg-slate-50", border: "border-slate-200", icon: "text-[#0A1628]", text: "text-[#0A1628]" },
    gray: { bg: "bg-[#f9fafb]", border: "border-[#e5e7eb]", icon: "text-[#6b7280]", text: "text-[#374151]" },
  };
  const c = colorMap[color];

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${c.bg} ${c.border} border`}>
          <Icon className={`h-4 w-4 ${c.icon}`} />
        </div>
      </div>
      <p className={`font-display text-2xl font-bold ${c.text}`}>{value}</p>
      <p className="text-xs text-[#9ca3af] mt-0.5">{label}</p>
    </div>
  );
}

function daysAgo(dateStr: string): number {
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function hoursAgo(start: string, end: string): number {
  return Math.round(
    (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60)
  );
}

export default function InsurerDashboardPage() {
  const [claims, setClaims] = useState<InsurerClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const fetchClaims = useCallback(async () => {
    const { data } = await supabase
      .from("insurer_claims")
      .select("*")
      .order("submitted_at", { ascending: false });

    if (data) setClaims(data as InsurerClaim[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchClaims();

    // Realtime subscription for live activity feed
    const channel = supabase
      .channel("insurer_claims_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "insurer_claims" },
        () => {
          fetchClaims();
        }
      )
      .subscribe();

    // Auto-refresh every 60 seconds
    const interval = setInterval(fetchClaims, 60000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [fetchClaims]);

  const stats = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const receivedToday = claims.filter(
      (c) => c.created_at.split("T")[0] === todayStr
    ).length;

    const pendingReview = claims.filter(
      (c) => c.status === "pending" || c.status === "under_review"
    ).length;

    const autoApprovedToday = claims.filter(
      (c) =>
        c.status === "approved" &&
        c.decided_at &&
        c.decided_at.split("T")[0] === todayStr
    ).length;

    const totalExposure = claims
      .filter((c) => c.status === "pending" || c.status === "under_review")
      .reduce((s, c) => s + Number(c.amount_jod), 0);

    // Avg processing time in hours
    const reviewed = claims.filter((c) => c.decided_at && c.submitted_at);
    const avgProcessingHrs =
      reviewed.length > 0
        ? Math.round(
            reviewed.reduce(
              (s, c) => s + hoursAgo(c.submitted_at, c.decided_at!),
              0
            ) / reviewed.length
          )
        : 0;

    // Denial rate this month
    const thisMonthClaims = claims.filter(
      (c) => new Date(c.created_at) >= monthStart
    );
    const deniedThisMonth = thisMonthClaims.filter(
      (c) => c.status === "rejected"
    ).length;
    const denialRate =
      thisMonthClaims.length > 0
        ? Math.round((deniedThisMonth / thisMonthClaims.length) * 100)
        : 0;

    return {
      receivedToday,
      pendingReview,
      autoApprovedToday,
      totalExposure,
      avgProcessingHrs,
      denialRate,
    };
  }, [claims]);

  // Claims requiring action — pending, oldest first
  const actionClaims = useMemo(
    () =>
      claims
        .filter((c) => c.status === "pending" || c.status === "under_review")
        .sort(
          (a, b) =>
            new Date(a.submitted_at).getTime() -
            new Date(b.submitted_at).getTime()
        )
        .slice(0, 20),
    [claims]
  );

  // Activity feed — last 15 events
  const activityFeed: ActivityEvent[] = useMemo(() => {
    const events: ActivityEvent[] = [];

    for (const c of claims.slice(0, 50)) {
      // Submitted event
      events.push({
        id: `${c.id}-submit`,
        claim_number: c.claim_number,
        event: "Claim submitted",
        time: c.submitted_at,
        color: "text-blue-500",
      });

      // Decision event
      if (c.decided_at) {
        events.push({
          id: `${c.id}-decision`,
          claim_number: c.claim_number,
          event:
            c.status === "approved"
              ? "Claim approved"
              : c.status === "rejected"
              ? "Claim denied"
              : "Info requested",
          time: c.decided_at,
          color:
            c.status === "approved"
              ? "text-[#16a34a]"
              : c.status === "rejected"
              ? "text-red-500"
              : "text-amber-500",
        });
      }

      // High risk flag event
      if ((c.ai_risk_score ?? 0) >= 71) {
        events.push({
          id: `${c.id}-flag`,
          claim_number: c.claim_number,
          event: "High risk flagged",
          time: c.created_at,
          color: "text-red-500",
        });
      }
    }

    return events
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 15);
  }, [claims]);

  const EVENT_ICONS: Record<string, React.ElementType> = {
    "Claim submitted": Send,
    "Claim approved": CheckCircle,
    "Claim denied": XCircle,
    "Info requested": AlertTriangle,
    "High risk flagged": ShieldAlert,
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0a0a0a]">
          Operations Dashboard
        </h1>
        <p className="text-[#9ca3af] text-sm mt-1">
          Real-time claims operations and risk monitoring
        </p>
      </div>

      {/* KPI Bar — 6 cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        <KpiCard
          label="Claims Received Today"
          value={stats.receivedToday}
          icon={Inbox}
          color="blue"
        />
        <KpiCard
          label="Pending Review"
          value={stats.pendingReview}
          icon={Clock}
          color="amber"
        />
        <KpiCard
          label="Auto-Approved Today"
          value={stats.autoApprovedToday}
          icon={CheckCircle}
          color="green"
        />
        <KpiCard
          label="Total Exposure (JOD)"
          value={formatJod(stats.totalExposure)}
          icon={ShieldAlert}
          color="red"
        />
        <KpiCard
          label="Avg Processing Time"
          value={`${stats.avgProcessingHrs}h`}
          icon={Timer}
          color="navy"
        />
        <KpiCard
          label="Denial Rate This Month"
          value={`${stats.denialRate}%`}
          icon={TrendingDown}
          color={stats.denialRate > 30 ? "red" : "gray"}
        />
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left — Claims Requiring Action (3/5) */}
        <div className="lg:col-span-3 bg-white border border-[#e5e7eb] rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-[#f3f4f6] flex items-center justify-between">
            <h2 className="font-display font-bold text-[#0a0a0a]">
              Claims Requiring Action
            </h2>
            <Link
              href="/insurer/claims"
              className="text-sm text-[#16a34a] hover:text-[#15803d] font-semibold inline-flex items-center gap-1"
            >
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {loading ? (
            <div className="p-12 text-center">
              <div className="animate-spin h-8 w-8 border-4 border-[#0A1628] border-t-transparent rounded-full mx-auto mb-3" />
              <p className="text-[#9ca3af] text-sm">Loading claims...</p>
            </div>
          ) : actionClaims.length === 0 ? (
            <div className="p-12 text-center">
              <CheckCircle className="h-12 w-12 text-[#d1d5db] mx-auto mb-4" />
              <h3 className="font-display font-bold text-[#0a0a0a] mb-1">
                All caught up
              </h3>
              <p className="text-[#9ca3af] text-sm">
                No claims require immediate action.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-[#f9fafb] text-left border-b border-[#f3f4f6]">
                    <th className="px-4 py-3 text-xs font-medium text-[#9ca3af] uppercase tracking-wider">
                      Claim #
                    </th>
                    <th className="px-4 py-3 text-xs font-medium text-[#9ca3af] uppercase tracking-wider">
                      Provider
                    </th>
                    <th className="px-4 py-3 text-xs font-medium text-[#9ca3af] uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-4 py-3 text-xs font-medium text-[#9ca3af] uppercase tracking-wider">
                      Risk
                    </th>
                    <th className="px-4 py-3 text-xs font-medium text-[#9ca3af] uppercase tracking-wider">
                      Waiting
                    </th>
                    <th className="px-4 py-3 text-xs font-medium text-[#9ca3af] uppercase tracking-wider"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f3f4f6]">
                  {actionClaims.map((c) => {
                    const days = daysAgo(c.submitted_at);
                    return (
                      <tr
                        key={c.id}
                        className="hover:bg-[#f9fafb] transition-colors"
                      >
                        <td className="px-4 py-3 text-sm font-mono text-[#0a0a0a] font-medium">
                          {c.claim_number}
                        </td>
                        <td className="px-4 py-3 text-sm text-[#6b7280]">
                          {c.clinic_name}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-[#0a0a0a]">
                          {formatJod(Number(c.amount_jod))}
                        </td>
                        <td className="px-4 py-3">
                          <RiskScoreBadge score={c.ai_risk_score} />
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-sm font-medium ${
                              days > 5
                                ? "text-red-600"
                                : days > 2
                                ? "text-amber-600"
                                : "text-[#6b7280]"
                            }`}
                          >
                            {days}d
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/insurer/claims/${c.id}`}
                            className="text-sm text-[#16a34a] hover:text-[#15803d] font-semibold"
                          >
                            Review
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right — Activity Feed (2/5) */}
        <div className="lg:col-span-2 bg-white border border-[#e5e7eb] rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-[#f3f4f6]">
            <h2 className="font-display font-bold text-[#0a0a0a]">
              Live Activity Feed
            </h2>
            <p className="text-xs text-[#9ca3af] mt-0.5">
              Auto-refreshes every 60s
            </p>
          </div>

          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin h-6 w-6 border-3 border-[#0A1628] border-t-transparent rounded-full mx-auto" />
            </div>
          ) : activityFeed.length === 0 ? (
            <div className="p-8 text-center">
              <FileText className="h-8 w-8 text-[#d1d5db] mx-auto mb-2" />
              <p className="text-sm text-[#9ca3af]">No recent activity</p>
            </div>
          ) : (
            <div className="divide-y divide-[#f3f4f6] max-h-[500px] overflow-y-auto">
              {activityFeed.map((event) => {
                const EventIcon = EVENT_ICONS[event.event] || FileText;
                return (
                  <div
                    key={event.id}
                    className="px-6 py-3 flex items-start gap-3 hover:bg-[#f9fafb] transition-colors"
                  >
                    <div
                      className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${event.color.replace(
                        "text-",
                        "bg-"
                      )}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <EventIcon
                          className={`h-3.5 w-3.5 flex-shrink-0 ${event.color}`}
                        />
                        <span className="text-sm text-[#374151] truncate">
                          {event.event}
                        </span>
                      </div>
                      <p className="text-xs font-mono text-[#9ca3af] mt-0.5">
                        {event.claim_number}
                      </p>
                    </div>
                    <span className="text-xs text-[#9ca3af] flex-shrink-0 whitespace-nowrap">
                      {formatRelativeTime(event.time)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
