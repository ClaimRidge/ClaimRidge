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
import Button from "@/components/ui/Button";

// --- Types ---
interface PreAuthRequest {
  id: string;
  reference_number: string;
  provider_name: string;
  patient_name: string;
  patient_id: string;
  claim_amount: number;
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

function KpiCard({ label, value, icon: Icon, color, description }: { label: string; value: string | number; icon: React.ElementType; color: string; description?: string }) {
  const colors: Record<string, string> = {
    blue: "from-blue-500/10 to-indigo-500/5 text-blue-600 border-blue-100 icon-bg-blue-100",
    amber: "from-amber-500/10 to-orange-500/5 text-amber-600 border-amber-100 icon-bg-amber-100",
    green: "from-[#16a34a]/10 to-[#22c55e]/5 text-[#16a34a] border-green-100 icon-bg-green-100",
    red: "from-red-500/10 to-rose-500/5 text-red-600 border-red-100 icon-bg-red-100"
  };
  const c = colors[color] || colors.blue;

  return (
    <div className={`relative overflow-hidden bg-gradient-to-br ${c.split(' ').slice(0,2).join(' ')} border ${c.split(' ')[3]} rounded-3xl p-6 shadow-sm hover:shadow-md transition-all duration-300 group`}>
      <div className="flex items-start justify-between relative z-10">
        <div>
          <p className="text-[10px] font-black text-[#9ca3af] uppercase tracking-[0.2em] mb-1">{label}</p>
          <p className="font-display text-4xl font-extrabold tracking-tighter text-[#0a0a0a] group-hover:scale-110 origin-left transition-transform duration-500">{value}</p>
          {description && <p className="text-[10px] text-[#6b7280] mt-2 font-medium">{description}</p>}
        </div>
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${c.split(' ')[4].replace('icon-bg-', 'bg-')} shadow-inner`}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
      {/* Decorative background element */}
      <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/10 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700" />
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
    const interval = setInterval(fetchQueue, 60000);
    return () => clearInterval(interval);
  }, [fetchQueue]);

  // Calculate KPIs
  const escalatedCount = queue.filter(q => q.status === "escalated" || q.ai_decision === "escalate").length;
  const processingCount = queue.filter(q => q.status === "processing").length;
  const approvedToday = queue.filter(q => 
    (q.status === "approve" || q.status === "approved") && 
    new Date(q.created_at).toDateString() === new Date().toDateString()
  ).length;

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-8">
        <div className="animate-spin h-8 w-8 border-4 border-[#16a34a] border-t-transparent rounded-full mb-4" />
        <p className="text-[#9ca3af] text-sm animate-pulse">Synchronizing Medical Queue...</p>
      </div>
    );
  }

  const recentQueue = queue.slice(0, 5);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12 bg-[#fcfdfc]">
      {/* Welcome Header */}
      <div className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="font-display text-4xl sm:text-5xl font-extrabold text-[#0a0a0a] tracking-tight">
            Medical <span className="text-[#16a34a]">Intelligence</span> Hub
          </h1>
          <p className="text-[#6b7280] text-sm sm:text-lg mt-3 max-w-2xl font-medium">
            AI-augmented clinical adjudication portal. Your inbox is prioritized by statistical fraud scores and clinical necessity guidelines.
          </p>
        </div>
        <div className="flex gap-3">
           <Link href="/dashboard/insurance/queue">
              <Button variant="outline" className="rounded-2xl px-6 h-12 border-2 hover:bg-gray-50 transition-all font-bold">
                View Full Archive
              </Button>
           </Link>
        </div>
      </div>

      {/* KPI Bar - Enhanced Redesign */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        <KpiCard 
          label="Active Workload" 
          value={queue.length} 
          icon={Inbox} 
          color="blue" 
          description="Total pre-auths in current cycle"
        />
        <KpiCard 
          label="Manual Review" 
          value={escalatedCount} 
          icon={AlertTriangle} 
          color="amber" 
          description="Flagged for physician override"
        />
        <KpiCard 
          label="AI Processing" 
          value={processingCount} 
          icon={Clock} 
          color="blue" 
          description="Documents being transcribed"
        />
        <KpiCard 
          label="Auto-Approved" 
          value={approvedToday} 
          icon={CheckCircle} 
          color="green" 
          description="Successfully adjudicated today"
        />
      </div>

      {/* Main Queue Table - Limited View */}
      <div className="bg-white border border-[#e5e7eb] rounded-[2.5rem] shadow-[0_20px_50px_-20px_rgba(0,0,0,0.05)] overflow-hidden flex flex-col">
        <div className="px-8 py-7 border-b border-[#f3f4f6] flex items-center justify-between bg-white">
          <div>
            <h2 className="font-display font-black text-[#0a0a0a] text-xl flex items-center gap-3 tracking-tight">
              <div className="w-8 h-8 bg-[#f0fdf4] rounded-lg flex items-center justify-center">
                <FileText className="h-4 w-4 text-[#16a34a]" />
              </div> 
              Priority Inbox
            </h2>
            <p className="text-xs text-[#9ca3af] mt-1 font-medium italic">Showing the 5 most urgent cases requiring attention</p>
          </div>
          <Link 
            href="/dashboard/insurance/queue" 
            className="text-xs font-black uppercase tracking-widest text-[#16a34a] hover:text-[#15803d] flex items-center gap-2 group"
          >
            See all requests <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#fafbfc] text-left border-b border-[#f3f4f6]">
                <th className="px-8 py-5 text-[10px] font-black text-[#9ca3af] uppercase tracking-[0.2em]">Patient / ID</th>
                <th className="px-8 py-5 text-[10px] font-black text-[#9ca3af] uppercase tracking-[0.2em]">Time to SLA</th>
                <th className="px-8 py-5 text-[10px] font-black text-[#9ca3af] uppercase tracking-[0.2em]">AI Intelligence</th>
                <th className="px-8 py-5 text-[10px] font-black text-[#9ca3af] uppercase tracking-[0.2em]">State</th>
                <th className="px-8 py-5 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f3f4f6]">
              {recentQueue.map((req) => {
                const sla = getSlaStatus(req.sla_deadline);
                return (
                  <tr key={req.id} className="hover:bg-[#fcfdfc] transition-all group">
                    <td className="px-8 py-6">
                      <div className="text-sm font-extrabold text-[#0a0a0a]">{req.patient_name}</div>
                      <div className="text-[10px] font-mono text-[#9ca3af] mt-1 uppercase tracking-wider">{req.patient_id}</div>
                    </td>
                    <td className="px-8 py-6">
                      <span className={`inline-flex items-center px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest ${sla.bg} ${sla.color} border border-current/10 shadow-sm`}>
                         {sla.text}
                      </span>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-2">
                        {req.ai_decision === "approve" && (
                          <div className="flex items-center gap-2 bg-green-50 text-[#16a34a] px-3 py-1 rounded-lg border border-green-100 text-[10px] font-black uppercase tracking-widest shadow-sm">
                            <CheckCircle className="h-3 w-3"/> Safe
                          </div>
                        )}
                        {req.ai_decision === "deny" && (
                          <div className="flex items-center gap-2 bg-red-50 text-red-600 px-3 py-1 rounded-lg border border-red-100 text-[10px] font-black uppercase tracking-widest shadow-sm">
                            <XCircle className="h-3 w-3"/> Rejection
                          </div>
                        )}
                        {req.ai_decision === "escalate" && (
                          <div className="flex items-center gap-2 bg-amber-50 text-amber-600 px-3 py-1 rounded-lg border border-amber-100 text-[10px] font-black uppercase tracking-widest shadow-sm">
                            <AlertTriangle className="h-3 w-3"/> Anomaly
                          </div>
                        )}
                        {!req.ai_decision && (
                          <div className="flex items-center gap-2 bg-gray-50 text-gray-400 px-3 py-1 rounded-lg border border-gray-100 text-[10px] font-black uppercase tracking-widest">
                            Scanning...
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${req.status === 'escalated' ? 'text-amber-600' : 'text-[#9ca3af]'}`}>
                        {req.status}
                      </span>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <Link 
                        href={`/dashboard/insurance/pre-auth/${req.id}`} 
                        className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] bg-[#0a0a0a] text-white px-5 py-3 rounded-2xl hover:bg-[#16a34a] hover:scale-105 transition-all shadow-xl active:scale-95"
                      >
                        Inspect <ArrowRight className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {queue.length === 0 && (
            <div className="p-20 text-center">
              <div className="w-16 h-16 bg-[#f0fdf4] rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="h-8 w-8 text-[#16a34a]" />
              </div>
              <h3 className="text-2xl font-black text-[#0a0a0a] tracking-tight mb-1">Queue Clear</h3>
              <p className="text-[#6b7280] font-medium">All clinical cases have been adjudicated.</p>
            </div>
          )}
        </div>
        
        {queue.length > 5 && (
          <div className="p-6 bg-[#fafbfc] border-t border-[#f3f4f6] text-center">
            <Link 
              href="/dashboard/insurance/queue" 
              className="text-xs font-black uppercase tracking-widest text-[#6b7280] hover:text-[#0a0a0a] transition-colors"
            >
              + {queue.length - 5} more cases in full queue
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
