"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { 
  Inbox, 
  ShieldCheck, 
  CheckCircle, 
  TrendingDown, 
  Timer, 
  Clock, 
  ArrowRight, 
  FileText, 
  XCircle, 
  Send, 
  AlertTriangle,
  ShieldAlert
} from "lucide-react";
import { formatJod, formatRelativeTime } from "@/lib/utils/format";
import { InsurerClaimStatus } from "@/types/insurer";

// --- Types ---
interface InsurerClaim {
  id: string;
  claim_number: string;
  clinic_name: string;
  patient_name: string;
  amount_jod: number;
  status: string;
  submitted_at: string;
  decided_at?: string;
  created_at: string;
  ai_risk_score?: number;
}

interface ActivityEvent {
  id: string;
  claim_number: string;
  event: string;
  time: string;
  color: string;
}

// --- Components ---
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
    <div className="bg-white border border-[#e5e7eb] rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.bg} ${c.border} border shadow-sm`}>
          <Icon className={`h-5 w-5 ${c.icon}`} />
        </div>
      </div>
      <p className={`font-display text-2xl font-bold tracking-tight ${c.text}`}>{value}</p>
      <p className="text-xs font-semibold text-[#9ca3af] mt-1 uppercase tracking-wider">{label}</p>
    </div>
  );
}

function RiskScoreBadge({ score }: { score?: number }) {
  if (score === undefined) return null;
  
  let color = "bg-[#f0fdf4] text-[#16a34a] border-[#bbf7d0]";
  if (score >= 70) color = "bg-red-50 text-red-600 border-red-200";
  else if (score >= 30) color = "bg-amber-50 text-amber-600 border-amber-200";

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${color}`}>
      {score}%
    </span>
  );
}

// --- Helper Functions ---
function daysAgo(dateStr: string): number {
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function hoursAgo(start: string, end: string): number {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60));
}

// --- Main Page ---
export default function InsurerDashboardPage() {
  const [claims, setClaims] = useState<InsurerClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const fetchClaims = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    // Fetch from the real 'claims' table for this specific insurer
    const { data } = await supabase
      .from("claims")
      .select("*")
      .eq("payer_id", session.user.id)
      .order("created_at", { ascending: false });

    if (data) {
      const mappedClaims: InsurerClaim[] = data.map((c: any) => ({
        id: c.id,
        claim_number: c.claim_number,
        clinic_id: c.clinic_id || null,
        clinic_name: c.provider_name || 'Unknown Clinic',
        insurer_id: c.payer_id,
        patient_name: c.patient_name,
        patient_national_id: c.patient_id,
        patient_dob: null,
        patient_gender: null,
        diagnosis_codes: c.diagnosis_codes || [],
        diagnosis_description: null,
        procedure_codes: c.procedure_codes || [],
        procedure_description: c.notes || '',
        service_date: c.date_of_service,
        amount_jod: Number(c.total_billed),
        status: (["submitted", "intake_complete"].includes(c.status) ? "pending" : c.status) as InsurerClaimStatus,
        submitted_at: c.created_at,
        decided_at: c.status === 'approved' || c.status === 'rejected' ? c.updated_at : null,
        decided_by: null,
        decision_reason: null,
        ai_risk_score: c.ai_risk_score,
        ai_recommendation: null,
        created_at: c.created_at,
        updated_at: c.updated_at || c.created_at,
      }));
      setClaims(mappedClaims);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchClaims();
    const interval = setInterval(fetchClaims, 60000);
    return () => clearInterval(interval);
  }, [fetchClaims]);

  const stats = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    
    const receivedToday = claims.filter(c => c.created_at.split("T")[0] === todayStr).length;
    const pendingReview = claims.filter(c => c.status === "pending" || c.status === "under_review").length;
    const totalExposure = claims.filter(c => c.status === "pending" || c.status === "under_review").reduce((s, c) => s + Number(c.amount_jod), 0);
    
    const reviewed = claims.filter(c => c.decided_at && c.submitted_at);
    const avgProcessingHrs = reviewed.length > 0 ? Math.round(reviewed.reduce((s, c) => s + hoursAgo(c.submitted_at, c.decided_at!), 0) / reviewed.length) : 0;
    
    return { receivedToday, pendingReview, totalExposure, avgProcessingHrs };
  }, [claims]);

  const actionClaims = useMemo(() => 
    claims.filter(c => c.status === "pending" || c.status === "under_review")
          .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())
          .slice(0, 10), 
  [claims]);

  const activityFeed: ActivityEvent[] = useMemo(() => {
    const events: ActivityEvent[] = [];
    claims.slice(0, 20).forEach(c => {
      events.push({ id: `${c.id}-sub`, claim_number: c.claim_number, event: "Claim submitted", time: c.submitted_at, color: "text-blue-500" });
      if (c.decided_at) {
        events.push({ 
          id: `${c.id}-dec`, 
          claim_number: c.claim_number, 
          event: c.status === "approved" ? "Claim approved" : "Claim rejected", 
          time: c.decided_at, 
          color: c.status === "approved" ? "text-[#16a34a]" : "text-red-500" 
        });
      }
    });
    return events.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 15);
  }, [claims]);

  const EVENT_ICONS: Record<string, React.ElementType> = {
    "Claim submitted": Send,
    "Claim approved": CheckCircle,
    "Claim rejected": XCircle,
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-8">
        <div className="animate-spin h-8 w-8 border-4 border-[#16a34a] border-t-transparent rounded-full mb-4" />
        <p className="text-[#9ca3af] text-sm animate-pulse">Loading operations data...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
      {/* Welcome Header */}
      <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-[#0a0a0a] tracking-tight">
            Payer Command <span className="text-[#16a34a]">Center</span>
          </h1>
          <p className="text-[#6b7280] text-sm sm:text-base mt-2 max-w-lg">
            Monitor incoming medical claims, adjudicate risk profiles, and manage your network efficiency.
          </p>
        </div>
      </div>

      {/* KPI Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
        <KpiCard label="Received Today" value={stats.receivedToday} icon={Inbox} color="blue" />
        <KpiCard label="Pending Review" value={stats.pendingReview} icon={Timer} color="amber" />
        <KpiCard label="Active Exposure" value={`${stats.totalExposure.toLocaleString()} JOD`} icon={ShieldAlert} color="red" />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Claims Table */}
        <div className="lg:col-span-3 bg-white border border-[#e5e7eb] rounded-[32px] shadow-sm overflow-hidden flex flex-col">
          <div className="px-8 py-6 border-b border-[#f3f4f6] flex items-center justify-between">
            <h2 className="font-display font-bold text-[#0a0a0a] text-lg">Incoming Queue</h2>
            <Link href="/dashboard/insurance/claims" className="text-sm text-[#16a34a] hover:text-[#15803d] font-bold inline-flex items-center gap-1 group">
              Full list <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[#f9fafb] text-left border-b border-[#f3f4f6]">
                  <th className="px-6 py-4 text-xs font-bold text-[#9ca3af] uppercase tracking-wider">Claim #</th>
                  <th className="px-6 py-4 text-xs font-bold text-[#9ca3af] uppercase tracking-wider">Provider</th>
                  <th className="px-6 py-4 text-xs font-bold text-[#9ca3af] uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-4 text-xs font-bold text-[#9ca3af] uppercase tracking-wider">Risk</th>
                  <th className="px-6 py-4 text-xs font-bold text-[#9ca3af] uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f3f4f6]">
                {actionClaims.map((c) => (
                  <tr key={c.id} className="hover:bg-[#f9fafb] transition-colors group">
                    <td className="px-6 py-4 font-mono text-sm text-[#0a0a0a] font-medium">{c.claim_number}</td>
                    <td className="px-6 py-4 text-sm text-[#374151]">{c.clinic_name}</td>
                    <td className="px-6 py-4 text-sm font-bold text-[#0a0a0a]">{formatJod(Number(c.amount_jod))}</td>
                    <td className="px-6 py-4"><RiskScoreBadge score={c.ai_risk_score} /></td>
                    <td className="px-6 py-4">
                      <Link href={`/dashboard/insurance/claims/${c.id}`} className="text-xs font-bold bg-[#f9fafb] border border-[#e5e7eb] px-3 py-1.5 rounded-lg hover:bg-[#16a34a] hover:text-white hover:border-[#16a34a] transition-all">
                        Review
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {actionClaims.length === 0 && (
              <div className="p-12 text-center">
                <CheckCircle className="h-12 w-12 text-[#dcfce7] mx-auto mb-4" />
                <p className="text-[#9ca3af] font-medium">All claims processed!</p>
              </div>
            )}
          </div>
        </div>

        {/* Activity Feed */}
        <div className="lg:col-span-2 bg-white border border-[#e5e7eb] rounded-[32px] shadow-sm p-8">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="font-display font-bold text-[#0a0a0a] text-lg">Live Feed</h2>
            <div className="flex gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-[#16a34a] animate-pulse" />
              <div className="w-1.5 h-1.5 rounded-full bg-[#16a34a]/40" />
            </div>
          </div>
          
          <div className="space-y-6">
            {activityFeed.map((event) => {
              const Icon = EVENT_ICONS[event.event] || FileText;
              return (
                <div key={event.id} className="flex gap-4">
                  <div className={`mt-1 w-8 h-8 rounded-full border flex items-center justify-center flex-shrink-0 ${event.color.replace('text-', 'bg-').replace('500', '50')} ${event.color.replace('text-', 'border-').replace('500', '200')}`}>
                    <Icon className={`h-4 w-4 ${event.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <p className="text-sm font-bold text-[#374151] truncate">{event.event}</p>
                      <span className="text-[10px] font-medium text-[#9ca3af] whitespace-nowrap ml-2">{formatRelativeTime(event.time)}</span>
                    </div>
                    <p className="text-xs font-mono text-[#9ca3af] mt-0.5">{event.claim_number}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
