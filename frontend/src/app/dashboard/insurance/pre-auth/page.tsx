"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { 
  Inbox, 
  Search, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  ArrowRight,
  Filter,
  Calendar,
  Building2,
  User,
  ChevronLeft,
  ChevronRight,
  MoreVertical
} from "lucide-react";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";

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
  created_at: string;
}

const STATUS_TABS = [
  { key: "all", label: "All Requests" },
  { key: "processing", label: "Processing" },
  { key: "pending", label: "Awaiting Review" },
  { key: "approved", label: "Approved" },
  { key: "denied", label: "Denied" },
];

const SLA_FILTERS = [
  { key: "all", label: "All Timelines" },
  { key: "overdue", label: "Overdue" },
  { key: "urgent", label: "Urgent (<4h)" },
  { key: "upcoming", label: "Upcoming (<12h)" },
];

const PAGE_SIZE = 10;

// --- Helper Functions ---
function getSlaStatus(deadlineIso: string) {
  const deadline = new Date(deadlineIso).getTime();
  const now = new Date().getTime();
  const diffHours = (deadline - now) / (1000 * 60 * 60);

  if (diffHours < 0) return { text: "Overdue", color: "text-red-600 font-bold", bg: "bg-red-50", category: "overdue" };
  if (diffHours < 4) return { text: `${Math.floor(diffHours)}h left`, color: "text-red-600 font-bold", bg: "bg-red-50", category: "urgent" };
  if (diffHours < 12) return { text: `${Math.floor(diffHours)}h left`, color: "text-amber-600 font-semibold", bg: "bg-amber-50", category: "upcoming" };
  return { text: `${Math.floor(diffHours)}h left`, color: "text-[#16a34a]", bg: "bg-[#f0fdf4]", category: "normal" };
}

export default function PreAuthInboxPage() {
  const [requests, setRequests] = useState<PreAuthRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [slaFilter, setSlaFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(0);
  
  const supabase = createClient();
  const router = useRouter();

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/pre-auth/queue`, {
        headers: { "Authorization": `Bearer ${session.access_token}` }
      });
      
      if (res.ok) {
        const json = await res.json();
        // Backend now returns them sorted by created_at desc
        setRequests(json.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch pre-auth inbox:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchRequests();
    const interval = setInterval(fetchRequests, 60_000);
    return () => clearInterval(interval);
  }, [fetchRequests]);

  const filtered = useMemo(() => {
    let result = requests;
    
    if (statusFilter !== "all") {
      result = result.filter(r => r.status === statusFilter);
    }
    
    if (slaFilter !== "all") {
      result = result.filter(r => {
        const sla = getSlaStatus(r.sla_deadline);
        return sla.category === slaFilter;
      });
    }
    
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter(r => 
        r.reference_number.toLowerCase().includes(q) ||
        r.patient_name.toLowerCase().includes(q) ||
        r.provider_name.toLowerCase().includes(q)
      );
    }
    
    return result;
  }, [requests, statusFilter, slaFilter, searchTerm]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const stats = useMemo(() => {
    const counts: Record<string, number> = { all: requests.length };
    requests.forEach(r => {
      counts[r.status] = (counts[r.status] || 0) + 1;
    });
    return counts;
  }, [requests]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#16a34a]/10 flex items-center justify-center border border-[#16a34a]/20">
            <Inbox className="h-6 w-6 text-[#16a34a]" />
          </div>
          <div>
            <h1 className="font-display text-3xl font-extrabold text-[#0a0a0a] tracking-tight">
              Pre-Auth <span className="text-[#16a34a]">Inbox</span>
            </h1>
            <p className="text-[#6b7280] font-medium mt-0.5">
              Medical-necessity review queue. Every request is reviewed and decided by you.
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            onClick={fetchRequests} 
            className="gap-2 bg-white"
            loading={loading && requests.length > 0}
          >
            Refresh Queue
          </Button>
        </div>
      </div>

      {/* Filters & Tabs */}
      <div className="bg-white border border-[#e5e7eb] rounded-[1.5rem] shadow-sm p-4 mb-6">
        <div className="flex items-center gap-1 overflow-x-auto pb-4 border-b border-[#f3f4f6] mb-4 scrollbar-hide">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setStatusFilter(tab.key); setPage(0); }}
              className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all flex items-center gap-2 ${
                statusFilter === tab.key
                  ? "bg-[#0A1628] text-white shadow-lg shadow-[#0A1628]/20"
                  : "text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#0a0a0a]"
              }`}
            >
              {tab.label}
              <span className={`px-2 py-0.5 rounded-lg text-[10px] ${statusFilter === tab.key ? "bg-white/20 text-white" : "bg-gray-100 text-[#9ca3af]"}`}>
                {stats[tab.key] || 0}
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[#9ca3af] group-focus-within:text-[#16a34a] transition-colors" />
            <input 
              type="text" 
              placeholder="Search by reference, patient, or provider..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(0); }}
              className="w-full pl-12 pr-4 py-3 bg-[#f9fafb] border border-[#e5e7eb] rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#16a34a]/20 focus:border-[#16a34a] transition-all"
            />
          </div>
          
          <div className="flex gap-2">
            <Select
              value={slaFilter}
              onChange={(v) => { setSlaFilter(v); setPage(0); }}
              fullWidth={false}
              className="min-w-[160px] font-bold h-[46px]"
              options={SLA_FILTERS.map(f => ({ value: f.key, label: f.label }))}
            />
            <Button 
              variant="outline" 
              onClick={() => { setSearchTerm(""); setStatusFilter("all"); setSlaFilter("all"); setPage(0); }}
              className="rounded-xl px-5 h-[46px] bg-white"
            >
              Reset
            </Button>
          </div>
        </div>
      </div>

      {/* Main List */}
      <div className="bg-white border border-[#e5e7eb] rounded-[2rem] shadow-xl overflow-hidden min-h-[400px]">
        {loading && requests.length === 0 ? (
          <div className="py-32 flex flex-col items-center justify-center">
            <div className="animate-spin h-10 w-10 border-4 border-[#16a34a] border-t-transparent rounded-full mb-4" />
            <p className="text-[#9ca3af] font-medium animate-pulse">Syncing clinical records...</p>
          </div>
        ) : paged.length === 0 ? (
          <div className="py-32 flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 bg-[#f9fafb] rounded-full flex items-center justify-center mb-6">
              <Inbox className="h-10 w-10 text-[#d1d5db]" />
            </div>
            <h3 className="text-xl font-bold text-[#0a0a0a] mb-2">No requests found</h3>
            <p className="text-[#6b7280] max-w-sm mx-auto">Try adjusting your filters or search terms to find what you&apos;re looking for.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-[#fafbfc] text-left border-b border-[#f3f4f6]">
                    <th className="px-8 py-5 text-[10px] font-black text-[#9ca3af] uppercase tracking-[0.2em]">Case Reference</th>
                    <th className="px-8 py-5 text-[10px] font-black text-[#9ca3af] uppercase tracking-[0.2em]">Patient / ID</th>
                    <th className="px-8 py-5 text-[10px] font-black text-[#9ca3af] uppercase tracking-[0.2em]">SLA Deadline</th>
                    <th className="px-8 py-5 text-[10px] font-black text-[#9ca3af] uppercase tracking-[0.2em]">Current State</th>
                    <th className="px-8 py-5 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f3f4f6]">
                  {paged.map((req) => {
                    const sla = getSlaStatus(req.sla_deadline);
                    return (
                      <tr key={req.id} className="hover:bg-[#fcfdfc] transition-all group">
                        <td className="px-8 py-6">
                          <div className="font-mono text-sm font-black text-[#0a0a0a] tracking-tight group-hover:text-[#16a34a] transition-colors">
                            {req.reference_number}
                          </div>
                          <div className="text-[10px] font-bold text-[#9ca3af] mt-1 uppercase tracking-widest flex items-center gap-1.5">
                            <Calendar className="h-3 w-3" />
                            {new Date(req.created_at).toLocaleDateString()}
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <div className="text-sm font-extrabold text-[#0a0a0a] flex items-center gap-2">
                            <User className="h-3 w-3 text-[#9ca3af]" />
                            {req.patient_name}
                          </div>
                          <div className="text-[10px] font-medium text-[#6b7280] mt-1 flex items-center gap-2">
                            <Building2 className="h-3 w-3 text-[#9ca3af]" />
                            {req.provider_name}
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <span className={`inline-flex items-center px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider border ${sla.bg} ${sla.color} border-current/10 shadow-sm`}>
                            <Clock className="h-3 w-3 mr-2" /> {sla.text}
                          </span>
                        </td>
                        <td className="px-8 py-6">
                          <StatusPill status={req.status} />
                        </td>
                        <td className="px-8 py-6 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Link 
                              href={`/dashboard/insurance/pre-auth/${req.id}`}
                              className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest bg-[#0a0a0a] text-white px-5 py-2.5 rounded-xl hover:bg-[#16a34a] hover:scale-105 transition-all shadow-lg active:scale-95"
                            >
                              Open Case <ArrowRight className="h-3 w-3" />
                            </Link>
                            <button className="p-2 text-[#9ca3af] hover:text-[#0a0a0a] rounded-lg hover:bg-[#f3f4f6]">
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-8 py-5 border-t border-[#f3f4f6] flex items-center justify-between bg-[#fafbfc]">
                <p className="text-xs font-bold text-[#9ca3af] uppercase tracking-widest">
                  Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(Math.max(0, page - 1))}
                    disabled={page === 0}
                    className="p-2 rounded-xl border border-[#e5e7eb] hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <div className="flex gap-1">
                    {[...Array(totalPages)].map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setPage(i)}
                        className={`w-8 h-8 rounded-xl text-xs font-bold transition-all ${
                          page === i ? "bg-[#0A1628] text-white" : "text-[#9ca3af] hover:bg-[#f3f4f6]"
                        }`}
                      >
                        {i + 1}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                    disabled={page >= totalPages - 1}
                    className="p-2 rounded-xl border border-[#e5e7eb] hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// --- Sub-components ---

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    approved: "bg-green-50 text-green-700 border-green-200",
    denied: "bg-red-50 text-red-700 border-red-200",
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    processing: "bg-blue-50 text-blue-700 border-blue-200",
  };

  return (
    <span className={`inline-flex px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${styles[status] || "bg-gray-50 text-gray-500 border-gray-200"}`}>
      {status === "pending" ? "Awaiting Review" : status}
    </span>
  );
}
