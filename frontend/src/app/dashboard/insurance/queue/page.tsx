"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
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
  Search,
  Filter,
  ArrowLeft
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

export default function FullQueuePage() {
  const [queue, setQueue] = useState<PreAuthRequest[]>([]);
  const [filteredQueue, setFilteredQueue] = useState<PreAuthRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  
  const supabase = createClient();
  const router = useRouter();

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
          new Date(a.sla_deadline).getTime() - new Date(b.sla_deadline).getTime()
        );
        setQueue(sortedData);
        setFilteredQueue(sortedData);
      }
    } catch (err) {
      console.error("Failed to fetch queue:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  useEffect(() => {
    let result = queue;
    
    if (searchTerm) {
      result = result.filter(item => 
        item.reference_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.patient_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.provider_name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    if (statusFilter !== "all") {
      result = result.filter(item => item.status === statusFilter);
    }
    
    setFilteredQueue(result);
  }, [searchTerm, statusFilter, queue]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-[#f9fafb]">
        <div className="animate-spin h-10 w-10 border-4 border-[#16a34a] border-t-transparent rounded-full mb-4" />
        <p className="text-[#9ca3af] font-medium animate-pulse text-lg tracking-tight">Loading Medical Inbox...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f9fafb] py-8 lg:py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header Section */}
        <div className="mb-10">
          <div className="flex items-center gap-4 mb-4">
            <button 
              onClick={() => router.push('/dashboard/insurance')}
              className="p-2 bg-white border border-[#e5e7eb] rounded-xl text-[#6b7280] hover:text-[#0a0a0a] hover:border-[#0a0a0a] transition-all shadow-sm group"
            >
              <ArrowLeft className="h-5 w-5 group-hover:-translate-x-1 transition-transform" />
            </button>
            <div>
              <h1 className="font-display text-4xl font-extrabold text-[#0a0a0a] tracking-tight">
                Full Triage <span className="text-[#16a34a]">Queue</span>
              </h1>
              <p className="text-[#6b7280] font-medium mt-1">Complete list of all active and historical pre-authorisation requests.</p>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="bg-white border border-[#e5e7eb] rounded-2xl p-4 shadow-sm flex flex-col md:flex-row gap-4 mt-8">
            <div className="flex-1 relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[#9ca3af] group-focus-within:text-[#16a34a] transition-colors" />
              <input 
                type="text" 
                placeholder="Search by patient, provider, or reference..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-[#f9fafb] border border-[#e5e7eb] rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#16a34a]/20 focus:border-[#16a34a] transition-all"
              />
            </div>
            
            <div className="flex gap-2">
              <div className="relative min-w-[160px]">
                <Filter className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9ca3af]" />
                <select 
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-[#f9fafb] border border-[#e5e7eb] rounded-xl text-sm font-bold text-[#0a0a0a] appearance-none focus:outline-none focus:ring-2 focus:ring-[#16a34a]/20 transition-all cursor-pointer"
                >
                  <option value="all">All Status</option>
                  <option value="processing">Processing</option>
                  <option value="escalated">Needs Review</option>
                  <option value="approve">Approved</option>
                  <option value="deny">Denied</option>
                </select>
              </div>
              
              <Button 
                variant="outline" 
                onClick={() => { setSearchTerm(""); setStatusFilter("all"); }}
                className="rounded-xl px-6"
              >
                Reset
              </Button>
            </div>
          </div>
        </div>

        {/* Results Info */}
        <div className="mb-4 px-2 flex justify-between items-end">
          <p className="text-xs font-black uppercase tracking-widest text-[#9ca3af]">
            Showing {filteredQueue.length} {filteredQueue.length === 1 ? 'record' : 'records'}
          </p>
        </div>

        {/* Main Table */}
        <div className="bg-white border border-[#e5e7eb] rounded-[2rem] shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[#fafbfc] text-left border-b border-[#f3f4f6]">
                  <th className="px-8 py-5 text-[10px] font-black text-[#9ca3af] uppercase tracking-[0.2em]">Reference</th>
                  <th className="px-8 py-5 text-[10px] font-black text-[#9ca3af] uppercase tracking-[0.2em]">Patient / Provider</th>
                  <th className="px-8 py-5 text-[10px] font-black text-[#9ca3af] uppercase tracking-[0.2em]">Deadline</th>
                  <th className="px-8 py-5 text-[10px] font-black text-[#9ca3af] uppercase tracking-[0.2em]">AI Intelligence</th>
                  <th className="px-8 py-5 text-[10px] font-black text-[#9ca3af] uppercase tracking-[0.2em]">Current State</th>
                  <th className="px-8 py-5 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f3f4f6]">
                {filteredQueue.map((req) => {
                  const sla = getSlaStatus(req.sla_deadline);
                  return (
                    <tr key={req.id} className="hover:bg-[#f9fafb] transition-all group border-l-4 border-l-transparent hover:border-l-[#16a34a]">
                      <td className="px-8 py-6 font-mono text-sm text-[#0a0a0a] font-black tracking-tighter">
                        {req.reference_number}
                        <div className="text-[10px] font-medium text-[#9ca3af] mt-1 font-sans">
                          Submitted {new Date(req.created_at).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="text-sm font-extrabold text-[#0a0a0a] font-sans">{req.patient_name}</div>
                        <div className="text-xs text-[#6b7280] mt-1 font-medium flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-gray-200" />
                          {req.provider_name}
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <span className={`inline-flex items-center px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider border ${sla.bg} ${sla.color} border-current/10 shadow-sm`}>
                          <Clock className="h-3 w-3 mr-2" /> {sla.text}
                        </span>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex flex-col gap-1.5">
                          {req.ai_decision === "approve" && (
                            <span className="text-[#16a34a] text-xs font-black uppercase tracking-widest flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-[#16a34a] animate-pulse" />
                              Approve
                            </span>
                          )}
                          {req.ai_decision === "deny" && (
                            <span className="text-red-600 text-xs font-black uppercase tracking-widest flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-red-600" />
                              Deny
                            </span>
                          )}
                          {req.ai_decision === "escalate" && (
                            <span className="text-amber-600 text-xs font-black uppercase tracking-widest flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-amber-600" />
                              Escalate
                            </span>
                          )}
                          {!req.ai_decision && (
                            <span className="text-[#9ca3af] text-xs font-black uppercase tracking-widest flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-gray-300 animate-bounce" />
                              Analyzing
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <span className={`inline-flex px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                          req.status === 'escalated' ? 'bg-amber-50 text-amber-600 border-amber-200' : 
                          req.status === 'approve' ? 'bg-green-50 text-green-600 border-green-200' :
                          req.status === 'deny' ? 'bg-red-50 text-red-600 border-red-200' :
                          'bg-gray-50 text-gray-500 border-gray-200'
                        }`}>
                          {req.status}
                        </span>
                      </td>
                      <td className="px-8 py-6 text-right">
                        <Link 
                          href={`/dashboard/insurance/pre-auth/${req.id}`} 
                          className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest bg-[#0a0a0a] text-white px-5 py-2.5 rounded-xl hover:bg-[#16a34a] hover:scale-105 transition-all shadow-lg active:scale-95"
                        >
                          Review <ArrowRight className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredQueue.length === 0 && (
              <div className="p-24 text-center">
                <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6 border border-gray-100">
                  <Search className="h-10 w-10 text-gray-200" />
                </div>
                <h3 className="text-2xl font-black text-[#0a0a0a] mb-2 tracking-tight">No results found</h3>
                <p className="text-[#6b7280] font-medium max-w-sm mx-auto">We couldn&apos;t find any requests matching your current filters. Try adjusting your search criteria.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
