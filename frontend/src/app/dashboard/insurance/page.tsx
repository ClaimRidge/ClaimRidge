"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { 
  Inbox, 
  Clock, 
  ArrowRight, 
  AlertTriangle,
  CheckCircle,
  XCircle,
  FileText
} from "lucide-react";

// --- Types ---
interface PreAuthRequest {
  id: string;
  reference_number: string;
  provider_name: string;
  patient_name: string;
  patient_id: string;
  requested_amount: number;
  status: string;
  sla_deadline: string;
  ai_decision: string | null;
  created_at: string;
}

// --- Helper Functions ---
function getSlaStatus(deadlineIso: string) {
  const deadline = new Date(deadlineIso).getTime();
  const now = new Date().getTime();
  const diffHours = (deadline - now) / (1000 * 60 * 60);

  if (diffHours < 0) return { text: "Overdue", color: "text-red-600 font-bold", bg: "bg-red-50" };
  if (diffHours < 4) return { text: `${Math.floor(diffHours)}h remaining`, color: "text-red-600 font-bold", bg: "bg-red-50" };
  if (diffHours < 12) return { text: `${Math.floor(diffHours)}h remaining`, color: "text-amber-600 font-semibold", bg: "bg-amber-50" };
  return { text: `${Math.floor(diffHours)}h remaining`, color: "text-[#16a34a]", bg: "bg-[#f0fdf4]" };
}

function KpiCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: React.ElementType; color: string }) {
  const colors: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600 border-blue-200",
    amber: "bg-amber-50 text-amber-600 border-amber-200",
    green: "bg-[#f0fdf4] text-[#16a34a] border-[#bbf7d0]",
    red: "bg-red-50 text-red-600 border-red-200"
  };
  const c = colors[color] || colors.blue;

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${c}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="font-display text-3xl font-bold tracking-tight text-[#0a0a0a]">{value}</p>
      <p className="text-xs font-semibold text-[#9ca3af] mt-1 uppercase tracking-wider">{label}</p>
    </div>
  );
}

export default function InsurerDashboardPage() {
  const [queue, setQueue] = useState<PreAuthRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const fetchQueue = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/pre-auth/queue`, {
        headers: { "Authorization": `Bearer ${session.access_token}` }
      });
      
      if (res.ok) {
        const json = await res.json();
        const sortedData = (json.data || []).sort((a: PreAuthRequest, b: PreAuthRequest) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        setQueue(sortedData);
      }
    } catch (err) {
      console.error("Failed to fetch queue:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchQueue();
    // Refresh the queue every minute
    const interval = setInterval(fetchQueue, 60000);
    return () => clearInterval(interval);
  }, [fetchQueue]);

  // Calculate KPIs
  const escalatedCount = queue.filter(q => q.status === "escalated" || q.ai_decision === "escalate").length;
  const processingCount = queue.filter(q => q.status === "processing").length;
  const approvedCount = queue.filter(q => q.status === "approve" || q.status === "approved").length;

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-8">
        <div className="animate-spin h-8 w-8 border-4 border-[#16a34a] border-t-transparent rounded-full mb-4" />
        <p className="text-[#9ca3af] text-sm animate-pulse">Loading Medical Officer Queue...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
      {/* Welcome Header */}
      <div className="mb-8">
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-[#0a0a0a] tracking-tight">
          Medical Officer <span className="text-[#16a34a]">Inbox</span>
        </h1>
        <p className="text-[#6b7280] text-sm sm:text-base mt-2 max-w-2xl">
          Triage incoming pre-authorisation requests. AI has prioritized cases based on clinical complexity and SLA deadlines.
        </p>
      </div>

      {/* KPI Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <KpiCard label="Total in Queue" value={queue.length} icon={Inbox} color="blue" />
        <KpiCard label="Needs Review" value={escalatedCount} icon={AlertTriangle} color="amber" />
        <KpiCard label="Auto-Processing" value={processingCount} icon={Clock} color="blue" />
        <KpiCard label="Auto-Approved Today" value={approvedCount} icon={CheckCircle} color="green" />
      </div>

      {/* Main Queue Table */}
      <div className="bg-white border border-[#e5e7eb] rounded-[24px] shadow-sm overflow-hidden flex flex-col">
        <div className="px-6 py-5 border-b border-[#f3f4f6] flex items-center justify-between bg-[#fcfdfc]">
          <h2 className="font-display font-bold text-[#0a0a0a] text-lg flex items-center gap-2">
            <FileText className="h-5 w-5 text-[#16a34a]" /> Priority Triage Queue
          </h2>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#f9fafb] text-left border-b border-[#f3f4f6]">
                <th className="px-6 py-4 text-xs font-bold text-[#9ca3af] uppercase tracking-wider">Ref #</th>
                <th className="px-6 py-4 text-xs font-bold text-[#9ca3af] uppercase tracking-wider">Provider / Patient</th>
                <th className="px-6 py-4 text-xs font-bold text-[#9ca3af] uppercase tracking-wider">SLA Deadline</th>
                <th className="px-6 py-4 text-xs font-bold text-[#9ca3af] uppercase tracking-wider">AI Decision</th>
                <th className="px-6 py-4 text-xs font-bold text-[#9ca3af] uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-[#9ca3af] uppercase tracking-wider text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f3f4f6]">
              {queue.map((req) => {
                const sla = getSlaStatus(req.sla_deadline);
                return (
                  <tr key={req.id} className="hover:bg-[#f9fafb] transition-colors group">
                    <td className="px-6 py-4 font-mono text-sm text-[#0a0a0a] font-medium">{req.reference_number}</td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-bold text-[#0a0a0a]">{req.patient_name}</div>
                      <div className="text-xs text-[#6b7280] mt-0.5 truncate max-w-[200px]">{req.provider_name}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs border border-transparent ${sla.bg} ${sla.color}`}>
                        <Clock className="h-3 w-3 mr-1.5" /> {sla.text}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {req.ai_decision === "approve" && <span className="text-[#16a34a] text-sm font-bold flex items-center gap-1"><CheckCircle className="h-4 w-4"/> Approve</span>}
                      {req.ai_decision === "deny" && <span className="text-red-600 text-sm font-bold flex items-center gap-1"><XCircle className="h-4 w-4"/> Deny</span>}
                      {req.ai_decision === "escalate" && <span className="text-amber-600 text-sm font-bold flex items-center gap-1"><AlertTriangle className="h-4 w-4"/> Escalate</span>}
                      {!req.ai_decision && <span className="text-[#9ca3af] text-sm italic">Analyzing...</span>}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs font-bold uppercase tracking-wider ${req.status === 'escalated' ? 'text-amber-600' : 'text-[#6b7280]'}`}>
                        {req.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link 
                        href={`/dashboard/insurance/pre-auth/${req.id}`} 
                        className="inline-flex items-center gap-1 text-xs font-bold bg-white border border-[#e5e7eb] px-3 py-1.5 rounded-lg hover:bg-[#16a34a] hover:text-white hover:border-[#16a34a] transition-all shadow-sm"
                      >
                        Review <ArrowRight className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {queue.length === 0 && (
            <div className="p-16 text-center">
              <CheckCircle className="h-12 w-12 text-[#dcfce7] mx-auto mb-4" />
              <h3 className="text-lg font-bold text-[#0a0a0a] mb-1">Inbox Zero</h3>
              <p className="text-[#6b7280] text-sm">All pre-authorisation requests have been processed.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}