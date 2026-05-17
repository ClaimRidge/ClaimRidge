"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  Inbox,
  Clock,
  ArrowRight,
  AlertTriangle,
  CheckCircle,
  XCircle,
  FileText,
  FileSearch,
  DollarSign,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import Button from "@/components/ui/Button";

// ─── Types ─────────────────────────────────────────────
interface PreAuthRequest {
  id: string;
  reference_number: string;
  provider_name: string;
  patient_name: string;
  patient_id: string;
  claim_amount: number;
  status: string;
  sla_deadline: string;
  created_at: string;
}

interface ClaimRow {
  id: string;
  claim_number: string;
  patient_name: string;
  provider_name: string;
  total_billed: number;
  currency: string;
  status: string;
  ai_risk_score: number | null;
  fraud_score: number | null;
  fraud_risk_level: "low" | "high" | "extreme" | "insufficient_data" | null;
  created_at: string;
}

// ─── Helpers ───────────────────────────────────────────
function getSlaStatus(deadlineIso: string) {
  const deadline = new Date(deadlineIso).getTime();
  const now = Date.now();
  const diffHours = (deadline - now) / (1000 * 60 * 60);
  if (diffHours < 0) return { text: "Overdue", color: "text-red-600 font-bold", bg: "bg-red-50" };
  if (diffHours < 4) return { text: `${Math.floor(diffHours)}h left`, color: "text-red-600 font-bold", bg: "bg-red-50" };
  if (diffHours < 12) return { text: `${Math.floor(diffHours)}h left`, color: "text-amber-600 font-semibold", bg: "bg-amber-50" };
  return { text: `${Math.floor(diffHours)}h left`, color: "text-[#16a34a]", bg: "bg-[#f0fdf4]" };
}

function isSameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

// ─── KPI Card ──────────────────────────────────────────
function KpiCard({ label, value, icon: Icon, color, description }: {
  label: string; value: string | number; icon: React.ElementType; color: string; description?: string;
}) {
  const palettes: Record<string, { grad: string; ring: string; iconBg: string; iconText: string }> = {
    blue:   { grad: "from-blue-500/10 to-indigo-500/5",  ring: "border-blue-100",  iconBg: "bg-blue-100",  iconText: "text-blue-600" },
    amber:  { grad: "from-amber-500/10 to-orange-500/5", ring: "border-amber-100", iconBg: "bg-amber-100", iconText: "text-amber-600" },
    green:  { grad: "from-[#16a34a]/10 to-[#22c55e]/5",  ring: "border-green-100", iconBg: "bg-green-100", iconText: "text-[#16a34a]" },
    red:    { grad: "from-red-500/10 to-rose-500/5",     ring: "border-red-100",   iconBg: "bg-red-100",   iconText: "text-red-600" },
    purple: { grad: "from-purple-500/10 to-fuchsia-500/5", ring: "border-purple-100", iconBg: "bg-purple-100", iconText: "text-purple-600" },
  };
  const c = palettes[color] || palettes.blue;
  return (
    <div className={`relative overflow-hidden bg-gradient-to-br ${c.grad} border ${c.ring} rounded-2xl p-5 shadow-sm hover:shadow-md transition-all`}>
      <div className="flex items-start justify-between relative z-10">
        <div className="min-w-0">
          <p className="text-[10px] font-black text-[#9ca3af] uppercase tracking-[0.18em] mb-1 truncate">{label}</p>
          <p className="font-display text-3xl font-extrabold tracking-tighter text-[#0a0a0a]">{value}</p>
          {description && <p className="text-[10px] text-[#6b7280] mt-1.5 font-medium">{description}</p>}
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.iconBg} ${c.iconText} flex-shrink-0`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

// ─── Sparkline (real data, no library) ─────────────────
function Sparkline({ values, color = "#16a34a" }: { values: number[]; color?: string }) {
  if (!values.length) return null;
  const max = Math.max(...values, 1);
  const w = 100, h = 28;
  const step = w / Math.max(values.length - 1, 1);
  const points = values.map((v, i) => `${i * step},${h - (v / max) * (h - 2) - 1}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-7 overflow-visible">
      <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={points} />
      <polyline
        fill={color} fillOpacity="0.08"
        stroke="none"
        points={`0,${h} ${points} ${w},${h}`}
      />
    </svg>
  );
}

// ─── Main page ─────────────────────────────────────────
export default function InsurerDashboardPage() {
  const supabase = createClient();
  const [preAuths, setPreAuths] = useState<PreAuthRequest[]>([]);
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    // Resolve insurer_id once
    const { data: profile } = await supabase
      .from("profiles")
      .select("insurer_id, account_type")
      .eq("id", session.user.id)
      .maybeSingle();
    if (!profile?.insurer_id || profile.account_type !== "insurance") {
      setLoading(false);
      return;
    }

    const [paRes, claimsRes] = await Promise.all([
      fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/pre-auth/queue`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      }),
      // Use select("*") — explicit column lists 400 the whole query if any one
      // field is missing (e.g. when migration 005's fraud columns aren't applied
      // yet). Unrouted claims have payer_id = NULL so the .eq() already excludes
      // them — no routing_status filter needed.
      supabase
        .from("claims")
        .select("*")
        .eq("payer_id", profile.insurer_id)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

    if (paRes.ok) {
      const j = await paRes.json();
      const sorted = (j.data || []).sort(
        (a: PreAuthRequest, b: PreAuthRequest) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setPreAuths(sorted);
    } else {
      console.error("Pre-auth queue fetch failed:", paRes.status, await paRes.text().catch(() => ""));
    }
    if (claimsRes.error) {
      console.error("Claims fetch failed:", claimsRes.error);
    } else if (claimsRes.data) {
      setClaims(claimsRes.data as ClaimRow[]);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadAll();
    const t = setInterval(loadAll, 60_000);
    return () => clearInterval(t);
  }, [loadAll]);

  // ─── Pre-auth KPIs ────────────────────────────────────
  const paKpis = useMemo(() => {
    const today = new Date();
    const awaitingReview = preAuths.filter(p => p.status === "pending").length;
    const denied = preAuths.filter(p => p.status === "denied").length;
    const approvedToday = preAuths.filter(p =>
      (p.status === "approve" || p.status === "approved") &&
      isSameDay(new Date(p.created_at), today)
    ).length;
    return { total: preAuths.length, awaitingReview, denied, approvedToday };
  }, [preAuths]);

  // ─── Claims KPIs ──────────────────────────────────────
  const claimKpis = useMemo(() => {
    const totalBilled = claims.reduce((s, c) => s + (Number(c.total_billed) || 0), 0);
    const flagged = claims.filter(c => c.fraud_risk_level === "high" || c.fraud_risk_level === "extreme").length;
    const pending = claims.filter(c => ["submitted", "pending", "intake_complete"].includes(c.status)).length;
    const avgRisk = claims.length
      ? Math.round(claims.reduce((s, c) => s + (Number(c.ai_risk_score) || 0), 0) / claims.length)
      : 0;
    return { total: claims.length, totalBilled, flagged, pending, avgRisk };
  }, [claims]);

  // ─── Submissions over last 7 days (real sparkline) ────
  const sparklines = useMemo(() => {
    const days: { day: string; pa: number; claim: number }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
      const next = new Date(d.getTime() + 24 * 60 * 60 * 1000);
      const pa = preAuths.filter(p => {
        const t = new Date(p.created_at);
        return t >= d && t < next;
      }).length;
      const claim = claims.filter(c => {
        const t = new Date(c.created_at);
        return t >= d && t < next;
      }).length;
      days.push({ day: d.toLocaleDateString(undefined, { weekday: "short" }), pa, claim });
    }
    return days;
  }, [preAuths, claims]);

  // ─── Decision breakdown for pre-auth (real %) ─────────
  const decisionMix = useMemo(() => {
    const total = preAuths.length || 1;
    const isApproved = (s: string) => s === "approve" || s === "approved";
    const approve = preAuths.filter(p => isApproved(p.status)).length;
    const deny = preAuths.filter(p => p.status === "denied").length;
    const pending = preAuths.filter(p => !isApproved(p.status) && p.status !== "denied").length;
    return {
      approve: { count: approve, pct: Math.round((approve / total) * 100) },
      deny: { count: deny, pct: Math.round((deny / total) * 100) },
      pending: { count: pending, pct: Math.round((pending / total) * 100) },
    };
  }, [preAuths]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-8">
        <div className="animate-spin h-8 w-8 border-4 border-[#16a34a] border-t-transparent rounded-full mb-4" />
        <p className="text-[#9ca3af] text-sm animate-pulse">Loading dashboard...</p>
      </div>
    );
  }

  const recentPreAuths = preAuths.slice(0, 5);
  const recentClaims = claims.slice(0, 5);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12 bg-[#fcfdfc]">
      {/* Header */}
      <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-[#0a0a0a] tracking-tight">
            Medical <span className="text-[#16a34a]">Intelligence</span> Hub
          </h1>
          <p className="text-[#6b7280] text-sm sm:text-base mt-2 max-w-2xl font-medium">
            Live view of your pre-authorisation queue, incoming claims, and fraud signals.
          </p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <Link href="/dashboard/insurance/pre-auth">
            <Button variant="outline" className="gap-2 font-bold">
              <Inbox className="h-4 w-4" /> Pre-Auth Inbox
            </Button>
          </Link>
          <Link href="/dashboard/insurance/claims">
            <Button variant="outline" className="gap-2 font-bold">
              <FileSearch className="h-4 w-4" /> Claims Inbox
            </Button>
          </Link>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* PRE-AUTH SECTION                                             */}
      {/* ════════════════════════════════════════════════════════════ */}
      <SectionHeader
        title="Pre-Authorisations"
        subtitle="Clinical review queue — every request is reviewed and decided by your medical team."
        icon={Inbox}
        accent="green"
      />

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Active Workload" value={paKpis.total} icon={Inbox} color="blue" description="Total pre-auths in queue" />
        <KpiCard label="Needs Review" value={paKpis.awaitingReview} icon={AlertTriangle} color="amber" description="Awaiting manual review" />
        <KpiCard label="Denied" value={paKpis.denied} icon={XCircle} color="red" description="Declined requests" />
        <KpiCard label="Approved Today" value={paKpis.approvedToday} icon={CheckCircle} color="green" description="Approved in last 24h" />
      </div>

      {/* Decision mix bar */}
      {preAuths.length > 0 && (
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-5 mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-[#0a0a0a]">Decision Mix</h3>
            <span className="text-xs text-[#9ca3af]">{preAuths.length} total</span>
          </div>
          <div className="flex h-2.5 rounded-full overflow-hidden bg-[#f3f4f6]">
            <div className="bg-[#16a34a]" style={{ width: `${decisionMix.approve.pct}%` }} />
            <div className="bg-red-500" style={{ width: `${decisionMix.deny.pct}%` }} />
            <div className="bg-gray-300" style={{ width: `${decisionMix.pending.pct}%` }} />
          </div>
          <div className="grid grid-cols-3 gap-3 mt-3 text-xs">
            <DecisionLegend color="bg-[#16a34a]" label="Approved" count={decisionMix.approve.count} pct={decisionMix.approve.pct} />
            <DecisionLegend color="bg-red-500" label="Denied" count={decisionMix.deny.count} pct={decisionMix.deny.pct} />
            <DecisionLegend color="bg-gray-300" label="Pending" count={decisionMix.pending.count} pct={decisionMix.pending.pct} />
          </div>
        </div>
      )}

      {/* Pre-auth recent table */}
      <Card title="Priority Pre-Auth Inbox" subtitle="5 latest submissions" linkHref="/dashboard/insurance/pre-auth" linkLabel="See all">
        {recentPreAuths.length === 0 ? (
          <Empty icon={CheckCircle} title="Queue clear" subtitle="No active pre-authorisation requests." />
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-[#fafbfc] text-left border-b border-[#f3f4f6]">
                <Th>Patient / ID</Th>
                <Th>Submitted</Th>
                <Th>SLA</Th>
                <Th>Status</Th>
                <th className="px-6 py-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f3f4f6]">
              {recentPreAuths.map(req => {
                const sla = getSlaStatus(req.sla_deadline);
                return (
                  <tr key={req.id} className="hover:bg-[#fcfdfc] group transition-colors">
                    <td className="px-6 py-4">
                      <div className="text-sm font-extrabold text-[#0a0a0a]">{req.patient_name}</div>
                      <div className="text-[10px] font-mono text-[#9ca3af] mt-0.5 uppercase">{req.patient_id}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-[10px] font-black uppercase tracking-widest text-[#6b7280]">
                        {new Date(req.created_at).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${sla.bg} ${sla.color}`}>
                        {sla.text}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-[10px] font-black uppercase tracking-[0.15em] ${
                        req.status === "pending" ? "text-amber-600" :
                        req.status === "approved" || req.status === "approve" ? "text-[#16a34a]" :
                        req.status === "denied" ? "text-red-600" :
                        "text-[#9ca3af]"
                      }`}>
                        {req.status === "pending" ? "Awaiting Review" : req.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/dashboard/insurance/pre-auth/${req.id}`}
                        className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest bg-[#0a0a0a] text-white px-3.5 py-2 rounded-lg hover:bg-[#16a34a] transition-all"
                      >
                        Review <ArrowRight className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* CLAIMS SECTION                                               */}
      {/* ════════════════════════════════════════════════════════════ */}
      <SectionHeader
        title="Claims"
        subtitle="Provider-submitted claims routed to your network. Layer-1 fraud scoring runs on submission."
        icon={FileSearch}
        accent="navy"
      />

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Total Claims" value={claimKpis.total} icon={FileSearch} color="blue" description="All-time routed to you" />
        <KpiCard label="Awaiting Review" value={claimKpis.pending} icon={Clock} color="amber" description="Pending decision" />
        <KpiCard label="Flagged for Fraud" value={claimKpis.flagged} icon={ShieldAlert} color="red" description="High/extreme statistical risk" />
        <KpiCard
          label="Total Billed"
          value={`${(claimKpis.totalBilled / 1000).toFixed(1)}k`}
          icon={DollarSign}
          color="green"
          description="JOD across all claims"
        />
      </div>

      {/* Submissions trend (real sparkline) */}
      <div className="bg-white border border-[#e5e7eb] rounded-xl p-5 mb-6 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold text-[#0a0a0a] flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-[#16a34a]" /> Submissions — last 7 days
            </h3>
            <p className="text-xs text-[#9ca3af] mt-0.5">Daily counts from your network.</p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#16a34a]" /> Pre-Auth</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500" /> Claims</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-2xl font-extrabold text-[#0a0a0a]">{sparklines.reduce((s, d) => s + d.pa, 0)}</span>
              <span className="text-[10px] uppercase font-bold text-[#9ca3af] tracking-widest">Pre-Auth · 7d</span>
            </div>
            <Sparkline values={sparklines.map(d => d.pa)} color="#16a34a" />
            <div className="flex justify-between text-[10px] text-[#9ca3af] mt-1">
              {sparklines.map((d, i) => <span key={i}>{d.day[0]}</span>)}
            </div>
          </div>
          <div>
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-2xl font-extrabold text-[#0a0a0a]">{sparklines.reduce((s, d) => s + d.claim, 0)}</span>
              <span className="text-[10px] uppercase font-bold text-[#9ca3af] tracking-widest">Claims · 7d</span>
            </div>
            <Sparkline values={sparklines.map(d => d.claim)} color="#3b82f6" />
            <div className="flex justify-between text-[10px] text-[#9ca3af] mt-1">
              {sparklines.map((d, i) => <span key={i}>{d.day[0]}</span>)}
            </div>
          </div>
        </div>
      </div>

      {/* Claims recent table */}
      <Card title="Recent Claims" subtitle="5 latest submissions" linkHref="/dashboard/insurance/claims" linkLabel="See all">
        {recentClaims.length === 0 ? (
          <Empty icon={FileSearch} title="No claims yet" subtitle="Claims submitted by your in-network providers will appear here." />
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-[#fafbfc] text-left border-b border-[#f3f4f6]">
                <Th>Claim #</Th>
                <Th>Patient / Provider</Th>
                <Th>Amount</Th>
                <Th>Fraud Signal</Th>
                <Th>Status</Th>
                <th className="px-6 py-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f3f4f6]">
              {recentClaims.map(c => (
                <tr key={c.id} className="hover:bg-[#fcfdfc] group transition-colors">
                  <td className="px-6 py-4">
                    <Link href={`/dashboard/insurance/claims/${c.id}`} className="text-sm font-mono font-bold text-[#16a34a] hover:text-[#15803d]">
                      {c.claim_number}
                    </Link>
                    <div className="text-[10px] text-[#9ca3af] mt-0.5">{new Date(c.created_at).toLocaleDateString()}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-extrabold text-[#0a0a0a]">{c.patient_name}</div>
                    <div className="text-[10px] text-[#6b7280] mt-0.5">{c.provider_name}</div>
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-[#0a0a0a]">
                    {Number(c.total_billed).toLocaleString()} <span className="text-[10px] text-[#9ca3af]">{c.currency}</span>
                  </td>
                  <td className="px-6 py-4">
                    <FraudBadge level={c.fraud_risk_level} score={c.fraud_score} />
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-[10px] font-black uppercase tracking-[0.15em] text-[#9ca3af]">{c.status}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/dashboard/insurance/claims/${c.id}`}
                      className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest bg-[#0A1628] text-white px-3.5 py-2 rounded-lg hover:bg-[#16a34a] transition-all"
                    >
                      Open <ArrowRight className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────
function SectionHeader({ title, subtitle, icon: Icon, accent }: {
  title: string; subtitle: string; icon: React.ElementType; accent: "green" | "navy";
}) {
  const accentColor = accent === "green" ? "bg-[#f0fdf4] text-[#16a34a] border-[#bbf7d0]" : "bg-[#0A1628]/5 text-[#0A1628] border-[#0A1628]/10";
  return (
    <div className="flex items-center gap-3 mb-5 mt-2">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${accentColor}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <h2 className="font-display text-xl font-extrabold text-[#0a0a0a] tracking-tight">{title}</h2>
        <p className="text-xs text-[#6b7280] font-medium mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}

function Card({ title, subtitle, linkHref, linkLabel, children }: {
  title: string; subtitle: string; linkHref: string; linkLabel: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-[#e5e7eb] rounded-2xl shadow-sm overflow-hidden mb-10">
      <div className="px-6 py-4 border-b border-[#f3f4f6] flex items-center justify-between">
        <div>
          <h3 className="font-display font-bold text-[#0a0a0a] flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-[#16a34a]" /> {title}
          </h3>
          <p className="text-[10px] text-[#9ca3af] mt-0.5 font-medium uppercase tracking-widest">{subtitle}</p>
        </div>
        <Link href={linkHref} className="text-[10px] font-black uppercase tracking-widest text-[#16a34a] hover:text-[#15803d] flex items-center gap-1.5 group">
          {linkLabel} <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-6 py-4 text-[10px] font-black text-[#9ca3af] uppercase tracking-[0.15em]">{children}</th>;
}

function FraudBadge({ level, score }: { level: ClaimRow["fraud_risk_level"]; score: number | null }) {
  if (!level || level === "low") {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-50 text-green-700">low{typeof score === "number" ? ` · ${score.toFixed(0)}%` : ""}</span>;
  }
  if (level === "insufficient_data") {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-600">insufficient</span>;
  }
  const color = level === "extreme" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700";
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${color}`}>{level}{typeof score === "number" ? ` · ${score.toFixed(0)}%` : ""}</span>;
}

function DecisionLegend({ color, label, count, pct }: { color: string; label: string; count: number; pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
      <span className="font-bold text-[#0a0a0a]">{label}</span>
      <span className="text-[#6b7280]">{count}</span>
      <span className="text-[#9ca3af]">({pct}%)</span>
    </div>
  );
}

function Empty({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle: string }) {
  return (
    <div className="p-16 text-center">
      <div className="w-14 h-14 bg-[#f9fafb] rounded-full flex items-center justify-center mx-auto mb-4">
        <Icon className="h-7 w-7 text-[#d1d5db]" />
      </div>
      <h3 className="font-bold text-[#0a0a0a]">{title}</h3>
      <p className="text-sm text-[#9ca3af] mt-1">{subtitle}</p>
    </div>
  );
}
