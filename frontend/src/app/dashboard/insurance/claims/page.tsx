"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { InsurerClaim, InsurerClaimStatus, RiskLevel } from "@/types/insurer";
import { getRiskLevel } from "@/types/insurer";
import ClaimStatusPill from "@/components/insurer/ClaimStatusPill";
import RiskScoreBadge from "@/components/insurer/RiskScoreBadge";
import { formatJod, formatRelativeTime, maskNationalId } from "@/lib/utils/format";
import {
  FileSearch,
  Search,
  FileText,
  CheckCircle,
  XCircle,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import Button from "@/components/ui/Button";

const STATUS_TABS: { key: "all" | InsurerClaimStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "under_review", label: "Under Review" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "needs_info", label: "Needs Info" },
];

const RISK_PILLS: { key: "all" | RiskLevel; label: string }[] = [
  { key: "all", label: "All Risk" },
  { key: "low", label: "Low" },
  { key: "medium", label: "Medium" },
  { key: "high", label: "High" },
];

const DATE_RANGES = [
  { key: "7", label: "Last 7 days" },
  { key: "30", label: "Last 30 days" },
  { key: "90", label: "Last 90 days" },
  { key: "all", label: "All time" },
];

const PAGE_SIZE = 25;

export default function InsurerClaimsPage() {
  const [claims, setClaims] = useState<InsurerClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | InsurerClaimStatus>("all");
  const [riskFilter, setRiskFilter] = useState<"all" | RiskLevel>("all");
  const [clinicFilter, setClinicFilter] = useState("all");
  const [dateRange, setDateRange] = useState("30");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<string | null>(null);
  const [bulkReason, setBulkReason] = useState("");
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const fetchClaims = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

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

  useEffect(() => { fetchClaims(); }, [fetchClaims]);

  const clinics = useMemo(() => {
    const set = new Set<string>();
    claims.forEach((c) => set.add(c.clinic_name));
    return Array.from(set).sort();
  }, [claims]);

  const filtered = useMemo(() => {
    const now = new Date();
    const q = searchQuery.toLowerCase().trim();

    return claims.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (riskFilter !== "all" && getRiskLevel(c.ai_risk_score) !== riskFilter) return false;
      if (clinicFilter !== "all" && c.clinic_name !== clinicFilter) return false;
      if (dateRange !== "all") {
        const days = parseInt(dateRange);
        const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        if (new Date(c.submitted_at) < cutoff) return false;
      }
      if (q) {
        const hay = [c.claim_number, c.patient_name, c.patient_national_id || ""].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [claims, statusFilter, riskFilter, clinicFilter, dateRange, searchQuery]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: claims.length };
    claims.forEach((c) => { counts[c.status] = (counts[c.status] || 0) + 1; });
    return counts;
  }, [claims]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === paged.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(paged.map((c) => c.id)));
    }
  };

  const handleBulkAction = async (action: "approved" | "rejected") => {
    if (action === "rejected") {
      setBulkAction(action);
      return;
    }
    setBulkSubmitting(true);
    for (const id of Array.from(selected)) {
      await supabase
        .from("insurer_claims")
        .update({ status: action, decided_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", id);
    }
    setSelected(new Set());
    setBulkSubmitting(false);
    await fetchClaims();
  };

  const confirmBulkReject = async () => {
    setBulkSubmitting(true);
    for (const id of Array.from(selected)) {
      await supabase
        .from("insurer_claims")
        .update({ status: "rejected", decision_reason: bulkReason, decided_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", id);
    }
    setSelected(new Set());
    setBulkAction(null);
    setBulkReason("");
    setBulkSubmitting(false);
    await fetchClaims();
  };

  const handleQuickAction = async (id: string, action: "approved" | "rejected") => {
    setActionMenuId(null);
    await supabase
      .from("insurer_claims")
      .update({ status: action, decided_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", id);
    await fetchClaims();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[#0A1628]/5 border border-[#0A1628]/10">
          <FileSearch className="h-5 w-5 text-[#0A1628]" />
        </div>
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0a0a0a]">Claims Inbox</h1>
          <p className="text-[#9ca3af] text-sm">{filtered.length} claim{filtered.length !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm p-4 mb-4 space-y-3">
        {/* Status tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setStatusFilter(tab.key); setPage(0); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                statusFilter === tab.key
                  ? "bg-[#0A1628] text-white"
                  : "text-[#6b7280] hover:bg-[#f3f4f6]"
              }`}
            >
              {tab.label}
              <span className={`ml-1.5 text-xs ${statusFilter === tab.key ? "text-white/70" : "text-[#9ca3af]"}`}>
                ({statusCounts[tab.key] || 0})
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Risk pills */}
          <div className="flex items-center gap-1">
            {RISK_PILLS.map((pill) => (
              <button
                key={pill.key}
                onClick={() => { setRiskFilter(pill.key); setPage(0); }}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  riskFilter === pill.key
                    ? pill.key === "high" ? "bg-red-100 text-red-700"
                      : pill.key === "medium" ? "bg-amber-100 text-amber-700"
                      : pill.key === "low" ? "bg-green-100 text-green-700"
                      : "bg-[#0A1628] text-white"
                    : "bg-[#f3f4f6] text-[#6b7280] hover:bg-[#e5e7eb]"
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>

          {/* Clinic dropdown */}
          <select
            value={clinicFilter}
            onChange={(e) => { setClinicFilter(e.target.value); setPage(0); }}
            className="px-3 py-1.5 text-sm border border-[#e5e7eb] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#0A1628]"
          >
            <option value="all">All Clinics</option>
            {clinics.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>

          {/* Date range */}
          <select
            value={dateRange}
            onChange={(e) => { setDateRange(e.target.value); setPage(0); }}
            className="px-3 py-1.5 text-sm border border-[#e5e7eb] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#0A1628]"
          >
            {DATE_RANGES.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>

          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9ca3af]" />
            <input
              type="text"
              placeholder="Claim #, patient name, or national ID..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
              className="w-full pl-9 pr-4 py-1.5 border border-[#e5e7eb] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0A1628]"
            />
          </div>
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="bg-[#0A1628] text-white rounded-lg px-4 py-3 mb-4 flex items-center justify-between">
          <span className="text-sm font-medium">{selected.size} claim{selected.size !== 1 ? "s" : ""} selected</span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="bg-[#16a34a] hover:bg-[#15803d] text-white gap-1"
              onClick={() => handleBulkAction("approved")}
              loading={bulkSubmitting}
            >
              <CheckCircle className="h-3.5 w-3.5" /> Approve selected
            </Button>
            <Button
              size="sm"
              variant="danger"
              className="gap-1"
              onClick={() => handleBulkAction("rejected")}
            >
              <XCircle className="h-3.5 w-3.5" /> Reject selected
            </Button>
            <button onClick={() => setSelected(new Set())} className="text-xs text-white/60 hover:text-white ml-2">Clear</button>
          </div>
        </div>
      )}

      {/* Bulk reject reason modal */}
      {bulkAction === "rejected" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setBulkAction(null)} />
          <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="font-display font-bold text-lg text-red-600 mb-3">Reject {selected.size} claims</h3>
            <textarea
              value={bulkReason}
              onChange={(e) => setBulkReason(e.target.value)}
              rows={3}
              placeholder="Enter rejection reason..."
              className="w-full px-3 py-2 border border-[#e5e7eb] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
            />
            <div className="flex gap-2 mt-4">
              <Button variant="ghost" className="flex-1" onClick={() => { setBulkAction(null); setBulkReason(""); }}>Cancel</Button>
              <Button variant="danger" className="flex-1" onClick={confirmBulkReject} loading={bulkSubmitting}>Confirm Rejection</Button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin h-8 w-8 border-4 border-[#0A1628] border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-[#9ca3af] text-sm">Loading claims...</p>
          </div>
        ) : paged.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="h-12 w-12 text-[#d1d5db] mx-auto mb-4" />
            <h3 className="font-display font-bold text-[#0a0a0a] mb-1">No claims found</h3>
            <p className="text-[#9ca3af] text-sm">Try adjusting your filters.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-[#f9fafb] text-left border-b border-[#f3f4f6]">
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={selected.size === paged.length && paged.length > 0}
                        onChange={toggleSelectAll}
                        className="rounded border-[#d1d5db] text-[#0A1628] focus:ring-[#0A1628]"
                      />
                    </th>
                    <th className="px-4 py-3 text-xs font-medium text-[#9ca3af] uppercase tracking-wider">Claim #</th>
                    <th className="px-4 py-3 text-xs font-medium text-[#9ca3af] uppercase tracking-wider">Clinic</th>
                    <th className="px-4 py-3 text-xs font-medium text-[#9ca3af] uppercase tracking-wider">Patient</th>
                    <th className="px-4 py-3 text-xs font-medium text-[#9ca3af] uppercase tracking-wider">Service</th>
                    <th className="px-4 py-3 text-xs font-medium text-[#9ca3af] uppercase tracking-wider text-right">Amount</th>
                    <th className="px-4 py-3 text-xs font-medium text-[#9ca3af] uppercase tracking-wider">Submitted</th>
                    <th className="px-4 py-3 text-xs font-medium text-[#9ca3af] uppercase tracking-wider">AI Risk</th>
                    <th className="px-4 py-3 text-xs font-medium text-[#9ca3af] uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f3f4f6]">
                  {paged.map((c) => (
                    <tr key={c.id} className="hover:bg-[#f9fafb] transition-colors">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(c.id)}
                          onChange={() => toggleSelect(c.id)}
                          className="rounded border-[#d1d5db] text-[#0A1628] focus:ring-[#0A1628]"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/dashboard/insurance/claims/${c.id}`} className="text-sm font-mono font-medium text-[#16a34a] hover:text-[#15803d]">
                          {c.claim_number}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm text-[#6b7280]">{c.clinic_name}</td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-[#0a0a0a]">{c.patient_name}</div>
                        <div className="text-xs text-[#9ca3af]">{maskNationalId(c.patient_national_id)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs font-mono text-[#6b7280]">{c.procedure_codes.join(", ")}</div>
                        <div className="text-xs text-[#9ca3af] truncate max-w-[150px]">{c.procedure_description}</div>
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-[#0a0a0a] text-right whitespace-nowrap">
                        {formatJod(Number(c.amount_jod))}
                      </td>
                      <td className="px-4 py-3 text-xs text-[#9ca3af] whitespace-nowrap">
                        {formatRelativeTime(c.submitted_at)}
                      </td>
                      <td className="px-4 py-3"><RiskScoreBadge score={c.ai_risk_score} /></td>
                      <td className="px-4 py-3"><ClaimStatusPill status={c.status} /></td>
                      <td className="px-4 py-3 relative">
                        <button
                          onClick={() => setActionMenuId(actionMenuId === c.id ? null : c.id)}
                          className="p-1 hover:bg-[#f3f4f6] rounded"
                        >
                          <MoreVertical className="h-4 w-4 text-[#9ca3af]" />
                        </button>
                        {actionMenuId === c.id && (
                          <div className="absolute right-4 top-10 z-20 bg-white border border-[#e5e7eb] rounded-lg shadow-lg py-1 w-36">
                            <Link
                              href={`/dashboard/insurance/claims/${c.id}`}
                              className="block px-4 py-2 text-sm text-[#374151] hover:bg-[#f9fafb]"
                            >
                              View
                            </Link>
                            {(c.status === "pending" || c.status === "under_review") && (
                              <>
                                <button
                                  onClick={() => handleQuickAction(c.id, "approved")}
                                  className="block w-full text-left px-4 py-2 text-sm text-[#16a34a] hover:bg-[#f9fafb]"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleQuickAction(c.id, "rejected")}
                                  className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-[#f9fafb]"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-6 py-3 border-t border-[#f3f4f6] flex items-center justify-between">
                <p className="text-xs text-[#9ca3af]">
                  Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(Math.max(0, page - 1))}
                    disabled={page === 0}
                    className="p-1.5 rounded hover:bg-[#f3f4f6] disabled:opacity-30"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-xs text-[#6b7280] px-2">{page + 1} / {totalPages}</span>
                  <button
                    onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                    disabled={page >= totalPages - 1}
                    className="p-1.5 rounded hover:bg-[#f3f4f6] disabled:opacity-30"
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
