"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import {
  Stethoscope,
  FilePlus,
  ShieldCheck,
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  DollarSign,
  Building2,
  AlertCircle,
  TrendingUp,
  ArrowRight,
} from "lucide-react";

interface ClaimRow {
  id: string;
  claim_number: string | null;
  patient_name: string;
  payer_name: string | null;
  payer_id: string | null;
  payer_name_raw: string | null;
  routing_status: "routed" | "unrouted" | null;
  total_billed: number;
  ai_risk_score: number | null;
  fraud_score: number | null;
  fraud_risk_level: string | null;
  status: string;
  date_of_service: string | null;
  created_at: string;
}

interface PreAuthRow {
  id: string;
  reference_number: string;
  patient_name: string;
  status: string;
  routing_status: "routed" | "unrouted";
  insurer_name: string | null;
  payer_name_raw: string | null;
  insurer_id: string | null;
  created_at: string;
  sla_deadline: string;
}

interface Affiliation {
  org: { id: string; name: string; org_code: string } | null;
  linked_at: string;
}

interface JoinRequest {
  id: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  org: { id: string; name: string; org_code: string } | null;
}

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "";

// ─── Helpers ───────────────────────────────────────────
function isSameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

function StatusChip({ status, routing }: { status: string; routing?: string | null }) {
  if (routing === "unrouted") {
    return <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-50 text-amber-700">unrouted</span>;
  }
  const s = (status || "").toLowerCase();
  const cls =
    s === "approve" || s === "approved" ? "bg-green-50 text-green-700" :
    s === "escalate" || s === "escalated" ? "bg-blue-50 text-blue-700" :
    s === "deny" || s === "denied" || s === "rejected" ? "bg-red-50 text-red-700" :
    s === "submitted" || s === "pending" || s === "processing" ? "bg-amber-50 text-amber-700" :
    "bg-gray-100 text-gray-600";
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${cls}`}>{status || "—"}</span>;
}

// ─── Main page ─────────────────────────────────────────
export default function DoctorDashboard() {
  const supabase = createClient();
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [preAuths, setPreAuths] = useState<PreAuthRow[]>([]);
  const [affiliations, setAffiliations] = useState<Affiliation[]>([]);
  const [pendingRequests, setPendingRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setUserId(session.user.id);
    const auth = `Bearer ${session.access_token}`;

    const [claimsRes, paRes, affRes] = await Promise.all([
      supabase
        .from("claims")
        .select("*")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(500),
      fetch(`${BACKEND}/api/dropoff/my-submissions`, { headers: { Authorization: auth } }),
      fetch(`${BACKEND}/api/doctors/affiliations`, { headers: { Authorization: auth } }),
    ]);

    if (claimsRes.error) console.error("Claims fetch failed:", claimsRes.error);
    else setClaims((claimsRes.data || []) as ClaimRow[]);

    if (paRes.ok) setPreAuths(await paRes.json());
    if (affRes.ok) {
      const data = await affRes.json();
      setAffiliations(data.affiliations || []);
      setPendingRequests((data.requests || []).filter((r: JoinRequest) => r.status === "pending"));
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  // ─── KPIs ────────────────────────────────────────────
  const claimKpis = useMemo(() => {
    const today = new Date();
    const totalBilled = claims.reduce((s, c) => s + (Number(c.total_billed) || 0), 0);
    const approved = claims.filter(c => ["approve", "approved"].includes((c.status || "").toLowerCase())).length;
    const todayCount = claims.filter(c => isSameDay(new Date(c.created_at), today)).length;
    const unrouted = claims.filter(c => c.routing_status === "unrouted" || !c.payer_id).length;
    return { total: claims.length, totalBilled, approved, todayCount, unrouted };
  }, [claims]);

  const paKpis = useMemo(() => {
    const today = new Date();
    const approved = preAuths.filter(p => ["approve", "approved"].includes((p.status || "").toLowerCase())).length;
    const pending = preAuths.filter(p =>
      p.routing_status === "routed" &&
      !["approve", "approved", "deny", "denied", "rejected"].includes((p.status || "").toLowerCase())
    ).length;
    const todayCount = preAuths.filter(p => isSameDay(new Date(p.created_at), today)).length;
    const unrouted = preAuths.filter(p => p.routing_status === "unrouted").length;
    return { total: preAuths.length, approved, pending, todayCount, unrouted };
  }, [preAuths]);

  // ─── 7-day submissions sparkline data ─────────────────
  const sparklines = useMemo(() => {
    const days: { day: string; c: number; p: number }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400000);
      const next = new Date(d.getTime() + 86400000);
      const c = claims.filter(x => { const t = new Date(x.created_at); return t >= d && t < next; }).length;
      const p = preAuths.filter(x => { const t = new Date(x.created_at); return t >= d && t < next; }).length;
      days.push({ day: d.toLocaleDateString(undefined, { weekday: "short" })[0], c, p });
    }
    return days;
  }, [claims, preAuths]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-[#16a34a] border-t-transparent rounded-full mb-3" />
        <p className="text-[#9ca3af] text-sm">Loading your dashboard…</p>
      </div>
    );
  }

  const recentClaims = claims.slice(0, 5);
  const recentPreAuths = preAuths.slice(0, 5);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12 bg-[#fcfdfc]">
      {/* Header */}
      <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center justify-center w-11 h-11 bg-[#f0fdf4] border border-[#bbf7d0] rounded-lg">
            <Stethoscope className="h-5 w-5 text-[#16a34a]" />
          </div>
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0a0a0a]">My Practice</h1>
            <p className="text-[#9ca3af] text-sm">Your submissions, affiliations, and clinical workload.</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href="/dashboard/doctor/pre-auth/new">
            <Button variant="outline" className="gap-2"><ShieldCheck className="h-4 w-4" /> New Pre-Auth</Button>
          </Link>
          <Link href="/dashboard/doctor/claims/new">
            <Button className="gap-2"><FilePlus className="h-4 w-4" /> New Claim</Button>
          </Link>
        </div>
      </div>

      {/* ── Affiliation banner ── */}
      <AffiliationBanner affiliations={affiliations} pending={pendingRequests} />

      {/* ── Pre-auth section ── */}
      <SectionHeader title="My Pre-Authorisations" subtitle="Clinical submissions awaiting insurer review." icon={ShieldCheck} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Kpi label="Total Submitted" value={paKpis.total} icon={ShieldCheck} color="blue" />
        <Kpi label="Approved" value={paKpis.approved} icon={CheckCircle} color="green" />
        <Kpi label="Awaiting Review" value={paKpis.pending} icon={Clock} color="amber" description="Pending insurer decision" />
        <Kpi label="Out-of-Network" value={paKpis.unrouted} icon={AlertCircle} color="red" description="Manual follow-up" />
      </div>

      <Card
        title="Recent Pre-Auths"
        linkHref="/dashboard/doctor/pre-auth"
        linkLabel="See all"
      >
        {recentPreAuths.length === 0 ? (
          <Empty icon={ShieldCheck} title="No pre-auths yet" subtitle="Submit one from the sidebar to start the clinical review." />
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-[#fafbfc] text-left border-b border-[#f3f4f6]">
                <Th>Reference</Th><Th>Patient</Th><Th>Insurer</Th><Th>Status</Th><th />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f3f4f6]">
              {recentPreAuths.map(p => (
                <tr key={p.id} className="hover:bg-[#fcfdfc] transition-colors">
                  <td className="px-6 py-3.5 text-sm font-mono text-[#0a0a0a]">{p.reference_number}</td>
                  <td className="px-6 py-3.5 text-sm font-bold text-[#0a0a0a]">{p.patient_name}</td>
                  <td className="px-6 py-3.5 text-sm text-[#6b7280]">{p.insurer_name || p.payer_name_raw || "—"}</td>
                  <td className="px-6 py-3.5"><StatusChip status={p.status} routing={p.routing_status} /></td>
                  <td className="px-6 py-3.5 text-right">
                    <span className="text-[10px] text-[#9ca3af]">{new Date(p.created_at).toLocaleDateString()}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* ── Claims section ── */}
      <SectionHeader title="My Claims" subtitle="Provider-billed claims you've submitted." icon={FileText} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Kpi label="Total Submitted" value={claimKpis.total} icon={FileText} color="blue" />
        <Kpi label="Approved" value={claimKpis.approved} icon={CheckCircle} color="green" />
        <Kpi label="Total Billed" value={`${(claimKpis.totalBilled / 1000).toFixed(1)}k`} description="JOD" icon={DollarSign} color="amber" />
        <Kpi label="Out-of-Network" value={claimKpis.unrouted} icon={AlertCircle} color="red" description="Manual follow-up" />
      </div>

      <Card
        title="Recent Claims"
        linkHref="/dashboard/doctor/claims/history"
        linkLabel="See all"
      >
        {recentClaims.length === 0 ? (
          <Empty icon={FileText} title="No claims yet" subtitle="Click 'New Claim' to scrub and submit your first claim." />
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-[#fafbfc] text-left border-b border-[#f3f4f6]">
                <Th>Claim #</Th><Th>Patient</Th><Th>Payer</Th><Th>Amount</Th><Th>Status</Th><th />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f3f4f6]">
              {recentClaims.map(c => (
                <tr key={c.id} className="hover:bg-[#fcfdfc] transition-colors">
                  <td className="px-6 py-3.5 text-sm font-mono text-[#0a0a0a]">{c.claim_number || "—"}</td>
                  <td className="px-6 py-3.5 text-sm font-bold text-[#0a0a0a]">{c.patient_name}</td>
                  <td className="px-6 py-3.5 text-sm text-[#6b7280]">{c.payer_name || c.payer_name_raw || "—"}</td>
                  <td className="px-6 py-3.5 text-sm font-bold text-[#0a0a0a]">
                    {Number(c.total_billed).toLocaleString()} <span className="text-[10px] text-[#9ca3af]">JOD</span>
                  </td>
                  <td className="px-6 py-3.5"><StatusChip status={c.status} routing={c.routing_status} /></td>
                  <td className="px-6 py-3.5 text-right">
                    <Link href={`/dashboard/doctor/claims/${c.id}/results`} className="text-xs font-bold text-[#16a34a] hover:underline">View</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* ── Activity sparkline ── */}
      <div className="bg-white border border-[#e5e7eb] rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-[#16a34a]" />
            <h3 className="font-bold text-sm text-[#0a0a0a]">Activity — last 7 days</h3>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500" /> Claims</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#16a34a]" /> Pre-Auth</span>
          </div>
        </div>
        <div className="flex items-end gap-2 h-24">
          {sparklines.map((d, i) => {
            const max = Math.max(...sparklines.flatMap(x => [x.c, x.p]), 1);
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
                <div className="w-full flex justify-center items-end gap-0.5 flex-1">
                  <div
                    className="w-1/2 bg-blue-500 rounded-t opacity-80 group-hover:opacity-100 transition-opacity min-h-[2px]"
                    style={{ height: `${(d.c / max) * 100}%` }}
                    title={`${d.c} claims`}
                  />
                  <div
                    className="w-1/2 bg-[#16a34a] rounded-t opacity-80 group-hover:opacity-100 transition-opacity min-h-[2px]"
                    style={{ height: `${(d.p / max) * 100}%` }}
                    title={`${d.p} pre-auths`}
                  />
                </div>
                <span className="text-[10px] text-[#9ca3af] font-bold">{d.day}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────
function AffiliationBanner({ affiliations, pending }: { affiliations: Affiliation[]; pending: JoinRequest[] }) {
  if (affiliations.length === 0 && pending.length === 0) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 mb-8 flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-bold text-amber-900">No hospital affiliation</p>
          <p className="text-xs text-amber-800 mt-0.5">
            You&apos;re currently operating as a solo doctor. To access a hospital&apos;s patient
            database, ask their admin for an invite link or organization code.
          </p>
        </div>
        <Link href="/dashboard/doctor/organization">
          <Button variant="outline" size="sm">Join a Hospital</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
      {affiliations.map(a => a.org && (
        <div key={a.org.id} className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#16a34a] text-white flex items-center justify-center flex-shrink-0">
            <Building2 className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-[#0a0a0a] truncate">{a.org.name}</p>
            <p className="text-[11px] text-[#15803d] font-mono">Linked · {new Date(a.linked_at).toLocaleDateString()}</p>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest bg-[#16a34a] text-white px-2 py-0.5 rounded">Active</span>
        </div>
      ))}
      {pending.map(r => r.org && (
        <div key={r.id} className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-500 text-white flex items-center justify-center flex-shrink-0">
            <Clock className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-[#0a0a0a] truncate">{r.org.name}</p>
            <p className="text-[11px] text-amber-700 font-mono">Awaiting admin approval</p>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest bg-amber-500 text-white px-2 py-0.5 rounded">Pending</span>
        </div>
      ))}
    </div>
  );
}

function SectionHeader({ title, subtitle, icon: Icon }: { title: string; subtitle: string; icon: React.ElementType }) {
  return (
    <div className="flex items-center gap-3 mb-5 mt-2">
      <div className="w-9 h-9 rounded-lg bg-[#f0fdf4] border border-[#bbf7d0] text-[#16a34a] flex items-center justify-center">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <h2 className="font-display text-lg font-extrabold text-[#0a0a0a]">{title}</h2>
        <p className="text-xs text-[#6b7280] mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}

function Kpi({ label, value, icon: Icon, color, description }: {
  label: string; value: string | number; icon: React.ElementType; color: string; description?: string;
}) {
  const palettes: Record<string, { grad: string; ring: string; iconBg: string; iconText: string }> = {
    blue:   { grad: "from-blue-500/10 to-indigo-500/5",  ring: "border-blue-100",  iconBg: "bg-blue-100",  iconText: "text-blue-600" },
    amber:  { grad: "from-amber-500/10 to-orange-500/5", ring: "border-amber-100", iconBg: "bg-amber-100", iconText: "text-amber-600" },
    green:  { grad: "from-[#16a34a]/10 to-[#22c55e]/5",  ring: "border-green-100", iconBg: "bg-green-100", iconText: "text-[#16a34a]" },
    red:    { grad: "from-red-500/10 to-rose-500/5",     ring: "border-red-100",   iconBg: "bg-red-100",   iconText: "text-red-600" },
  };
  const c = palettes[color] || palettes.blue;
  return (
    <div className={`relative overflow-hidden bg-gradient-to-br ${c.grad} border ${c.ring} rounded-2xl p-4 shadow-sm hover:shadow-md transition-all`}>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-black text-[#9ca3af] uppercase tracking-[0.18em] mb-1 truncate">{label}</p>
          <p className="font-display text-2xl font-extrabold tracking-tighter text-[#0a0a0a]">{value}</p>
          {description && <p className="text-[10px] text-[#6b7280] mt-1 font-medium">{description}</p>}
        </div>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${c.iconBg} ${c.iconText} flex-shrink-0`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function Card({ title, linkHref, linkLabel, children }: {
  title: string; linkHref: string; linkLabel: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-[#e5e7eb] rounded-2xl shadow-sm overflow-hidden mb-10">
      <div className="px-6 py-3.5 border-b border-[#f3f4f6] flex items-center justify-between">
        <h3 className="font-bold text-[#0a0a0a] text-sm">{title}</h3>
        <Link href={linkHref} className="text-[10px] font-black uppercase tracking-widest text-[#16a34a] hover:text-[#15803d] flex items-center gap-1">
          {linkLabel} <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-6 py-3 text-[10px] font-black text-[#9ca3af] uppercase tracking-[0.15em]">{children}</th>;
}

function Empty({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle: string }) {
  return (
    <div className="p-12 text-center">
      <Icon className="h-10 w-10 text-[#d1d5db] mx-auto mb-3" />
      <h3 className="font-bold text-[#0a0a0a]">{title}</h3>
      <p className="text-sm text-[#9ca3af] mt-1">{subtitle}</p>
    </div>
  );
}
