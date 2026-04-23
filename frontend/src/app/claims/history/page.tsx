"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ClaimAuditLog } from "@/types/claim";
import Button from "@/components/ui/Button";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Download,
  FileText,
  Filter,
  History,
  Search,
} from "lucide-react";

type StatusFilter = "all" | "clean" | "warnings" | "errors";

function deriveStatus(flags: ClaimAuditLog["ai_flags"]): "clean" | "warnings" | "errors" {
  if (!Array.isArray(flags) || flags.length === 0) return "clean";
  if (flags.some((f) => f.severity === "error")) return "errors";
  if (flags.some((f) => f.severity === "warning")) return "warnings";
  return "clean";
}

function StatusBadge({ status }: { status: "clean" | "warnings" | "errors" }) {
  const config = {
    clean: { label: "Clean", class: "bg-[#f0fdf4] text-[#16a34a] border-[#bbf7d0]", Icon: CheckCircle },
    warnings: { label: "Warnings", class: "bg-amber-50 text-amber-600 border-amber-200", Icon: AlertTriangle },
    errors: { label: "Errors", class: "bg-red-50 text-red-600 border-red-200", Icon: XCircle },
  };
  const c = config[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${c.class}`}>
      <c.Icon className="h-3 w-3" />
      {c.label}
    </span>
  );
}

export default function ClaimsHistoryPage() {
  const [logs, setLogs] = useState<ClaimAuditLog[]>([]);
  const [refToClaimId, setRefToClaimId] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState("");
  const [payer, setPayer] = useState<string>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  const supabase = createClient();

  useEffect(() => {
    const fetchLogs = async () => {
      const [auditRes, claimsRes] = await Promise.all([
        supabase
          .from("claims_audit")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase.from("claims").select("id"),
      ]);

      if (auditRes.error) {
        console.error("[HISTORY] claims_audit fetch failed:", auditRes.error);
      }
      if (claimsRes.error) {
        console.error("[HISTORY] claims fetch failed:", claimsRes.error);
      }

      if (auditRes.data) {
        setLogs(auditRes.data as ClaimAuditLog[]);
      }

      if (claimsRes.data) {
        const map: Record<string, string> = {};
        for (const c of claimsRes.data as { id: string }[]) {
          const ref = `CR-${c.id.slice(0, 8).toUpperCase()}`;
          map[ref] = c.id;
        }
        setRefToClaimId(map);
      }

      setLoading(false);
    };
    fetchLogs();
  }, []);

  const payerOptions = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((l) => {
      if (l.payer_name) set.add(l.payer_name);
    });
    return Array.from(set).sort();
  }, [logs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return logs.filter((l) => {
      if (q) {
        const hay = [
          l.claim_reference_number,
          l.patient_name,
          l.provider_name,
          l.payer_name,
          ...(l.diagnosis_codes ?? []),
          ...(l.procedure_codes ?? []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (payer !== "all" && l.payer_name !== payer) return false;
      if (status !== "all" && deriveStatus(l.ai_flags) !== status) return false;
      if (fromDate && l.date_of_service && l.date_of_service < fromDate) return false;
      if (toDate && l.date_of_service && l.date_of_service > toDate) return false;
      return true;
    });
  }, [logs, query, payer, status, fromDate, toDate]);

  const clearFilters = () => {
    setQuery("");
    setPayer("all");
    setStatus("all");
    setFromDate("");
    setToDate("");
  };

  const totalExports = logs.reduce((sum, l) => sum + (l.export_count || 0), 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="text-[#9ca3af] hover:text-[#16a34a] transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="inline-flex items-center justify-center w-11 h-11 bg-[#f0fdf4] border border-[#bbf7d0] rounded-lg">
            <History className="h-5 w-5 text-[#16a34a]" />
          </div>
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#0a0a0a]">Claims History</h1>
            <p className="text-[#6b7280] text-sm">
              Complete audit trail of every AI-scrubbed claim
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-[#6b7280]">
          <Download className="h-4 w-4 text-[#16a34a]" />
          {totalExports} PDF export{totalExports === 1 ? "" : "s"}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm p-3 sm:p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-4 w-4 text-[#9ca3af]" />
          <span className="text-sm font-medium text-[#0a0a0a]">Filters</span>
          {(query || payer !== "all" || status !== "all" || fromDate || toDate) && (
            <button
              type="button"
              onClick={clearFilters}
              className="ml-auto text-xs text-[#16a34a] hover:text-[#15803d] font-semibold"
            >
              Clear all
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9ca3af]" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search patient, reference, codes..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-[#f9fafb] border border-[#e5e7eb] rounded-lg text-[#0a0a0a] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#16a34a] focus:border-transparent"
            />
          </div>
          <select
            value={payer}
            onChange={(e) => setPayer(e.target.value)}
            className="px-3 py-2 text-sm bg-[#f9fafb] border border-[#e5e7eb] rounded-lg text-[#0a0a0a] focus:outline-none focus:ring-2 focus:ring-[#16a34a] focus:border-transparent"
          >
            <option value="all">All payers</option>
            {payerOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className="px-3 py-2 text-sm bg-[#f9fafb] border border-[#e5e7eb] rounded-lg text-[#0a0a0a] focus:outline-none focus:ring-2 focus:ring-[#16a34a] focus:border-transparent"
          >
            <option value="all">All statuses</option>
            <option value="clean">Clean</option>
            <option value="warnings">Warnings</option>
            <option value="errors">Errors</option>
          </select>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="flex-1 min-w-0 px-2 py-2 text-sm bg-[#f9fafb] border border-[#e5e7eb] rounded-lg text-[#0a0a0a] focus:outline-none focus:ring-2 focus:ring-[#16a34a] focus:border-transparent"
              title="From date (service)"
            />
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="flex-1 min-w-0 px-2 py-2 text-sm bg-[#f9fafb] border border-[#e5e7eb] rounded-lg text-[#0a0a0a] focus:outline-none focus:ring-2 focus:ring-[#16a34a] focus:border-transparent"
              title="To date (service)"
            />
          </div>
        </div>
        <div className="mt-3 text-xs text-[#6b7280]">
          {filtered.length} of {logs.length} record{logs.length === 1 ? "" : "s"}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin h-8 w-8 border-4 border-[#16a34a] border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-[#6b7280] text-sm">Loading history...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="h-12 w-12 text-[#d1d5db] mx-auto mb-4" />
            <h3 className="font-display font-bold text-[#0a0a0a] mb-1">
              {logs.length === 0 ? "No scrubbed claims yet" : "No matching records"}
            </h3>
            <p className="text-[#6b7280] text-sm mb-4">
              {logs.length === 0
                ? "Scrub your first claim to start building your audit trail."
                : "Try adjusting or clearing your filters."}
            </p>
            {logs.length === 0 && (
              <Link href="/claims/new">
                <Button size="sm">Submit a claim</Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[#f9fafb] text-left border-b border-[#f3f4f6]">
                  <th className="px-4 py-3 text-xs font-medium text-[#9ca3af] uppercase tracking-wider">Reference</th>
                  <th className="px-4 py-3 text-xs font-medium text-[#9ca3af] uppercase tracking-wider">Patient</th>
                  <th className="px-4 py-3 text-xs font-medium text-[#9ca3af] uppercase tracking-wider">Service Date</th>
                  <th className="px-4 py-3 text-xs font-medium text-[#9ca3af] uppercase tracking-wider">Provider</th>
                  <th className="px-4 py-3 text-xs font-medium text-[#9ca3af] uppercase tracking-wider">Payer</th>
                  <th className="px-4 py-3 text-xs font-medium text-[#9ca3af] uppercase tracking-wider">Amount</th>
                  <th className="px-4 py-3 text-xs font-medium text-[#9ca3af] uppercase tracking-wider">Flags</th>
                  <th className="px-4 py-3 text-xs font-medium text-[#9ca3af] uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-xs font-medium text-[#9ca3af] uppercase tracking-wider">Exports</th>
                  <th className="px-4 py-3 text-xs font-medium text-[#9ca3af] uppercase tracking-wider">Scrubbed</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f3f4f6]">
                {filtered.map((log) => {
                  const flagCount = Array.isArray(log.ai_flags) ? log.ai_flags.length : 0;
                  const derived = deriveStatus(log.ai_flags);
                  const claimId = refToClaimId[log.claim_reference_number];
                  return (
                    <tr
                      key={log.id}
                      onClick={() => {
                        if (claimId) {
                          window.location.href = `/claims/${claimId}/results`;
                        }
                      }}
                      className={`transition-colors ${
                        claimId
                          ? "hover:bg-[#f9fafb] cursor-pointer"
                          : "opacity-60"
                      }`}
                    >
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs font-semibold text-[#16a34a]">
                          {log.claim_reference_number}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-[#0a0a0a]">
                          {log.patient_name}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-[#6b7280]">
                        {log.date_of_service || "\u2014"}
                      </td>
                      <td className="px-4 py-3 text-sm text-[#6b7280] max-w-[180px] truncate">
                        {log.provider_name || "\u2014"}
                      </td>
                      <td className="px-4 py-3 text-sm text-[#6b7280] max-w-[180px] truncate">
                        {log.payer_name || "\u2014"}
                      </td>
                      <td className="px-4 py-3 text-sm text-[#6b7280] whitespace-nowrap">
                        {Number(log.billed_amount).toFixed(2)} JOD
                      </td>
                      <td className="px-4 py-3 text-sm text-[#6b7280]">
                        {flagCount > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                            <AlertTriangle className="h-3 w-3" />
                            {flagCount}
                          </span>
                        ) : (
                          <span className="text-[#9ca3af] text-xs">None</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={derived} />
                      </td>
                      <td className="px-4 py-3 text-sm text-[#6b7280]">
                        <span className="inline-flex items-center gap-1">
                          <Download className="h-3 w-3 text-[#9ca3af]" />
                          {log.export_count}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-[#9ca3af] whitespace-nowrap">
                        {new Date(log.created_at).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <ArrowRight className="h-4 w-4 text-[#d1d5db]" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
