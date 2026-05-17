"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft,
  Plus,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Users,
  Stethoscope,
} from "lucide-react";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";

// ─── Types ─────────────────────────────────────────────
interface PreAuthRow {
  id: string;
  reference_number: string;
  patient_name: string;
  provider_name: string;
  status: string;
  routing_status: "routed" | "unrouted";
  insurer_id: string | null;
  insurer_name: string | null;
  payer_name_raw: string | null;
  valid_until: string | null;
  priority: string | null;
  created_at: string;
  submitted_by: string | null;
  submitted_by_name: string;
  submitted_by_role: string | null;
}

interface DoctorStat {
  doctor_id: string | null;
  doctor_name: string;
  role: string | null;
  specialty: string | null;
  total: number;
  approved: number;
  escalated: number;
  denied: number;
  pending: number;
  unrouted: number;
}

type Tab = "routed" | "unrouted";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "";

export default function ProviderPreAuthGovernancePage() {
  const supabase = createClient();
  const params = useSearchParams();
  const submitted = params.get("submitted");
  const routing = params.get("routing");

  const [rows, setRows] = useState<PreAuthRow[]>([]);
  const [doctors, setDoctors] = useState<DoctorStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("routed");
  const [doctorFilter, setDoctorFilter] = useState<string>("all"); // "all" | doctor_id

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`${BACKEND}/api/providers/pre-auths`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setRows(data.submissions || []);
          setDoctors(data.doctors || []);
        }
      } catch {
        /* surfaced via empty state */
      }
      setLoading(false);
    })();
  }, [supabase]);

  // ─── Org-wide roll-up ────────────────────────────────
  const orgTotals = useMemo(() => {
    return doctors.reduce(
      (acc, d) => ({
        total: acc.total + d.total,
        approved: acc.approved + d.approved,
        pending: acc.pending + d.pending,
        escalated: acc.escalated + d.escalated,
        denied: acc.denied + d.denied,
        unrouted: acc.unrouted + d.unrouted,
      }),
      { total: 0, approved: 0, pending: 0, escalated: 0, denied: 0, unrouted: 0 }
    );
  }, [doctors]);

  // ─── Filtered submission list ────────────────────────
  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (r.routing_status !== tab) return false;
      if (doctorFilter !== "all" && (r.submitted_by || "unknown") !== doctorFilter) return false;
      return true;
    });
  }, [rows, tab, doctorFilter]);

  const routedCount = useMemo(() => rows.filter((r) => r.routing_status === "routed").length, [rows]);
  const unroutedCount = useMemo(
    () => rows.filter((r) => r.routing_status === "unrouted").length,
    [rows]
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="mb-6">
        <Link
          href="/dashboard/provider"
          className="flex items-center gap-2 text-sm text-[#6b7280] hover:text-[#16a34a] font-medium w-fit"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Dashboard
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center justify-center w-10 h-10 bg-[#f0fdf4] border border-[#bbf7d0] rounded-lg">
            <ShieldCheck className="h-5 w-5 text-[#16a34a]" />
          </div>
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0a0a0a]">
              Pre-Authorisations
            </h1>
            <p className="text-[#9ca3af] text-sm">
              Every pre-auth submitted by you and your affiliated doctors.
            </p>
          </div>
        </div>
        <Link href="/dashboard/provider/pre-auth/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" /> New Pre-Auth
          </Button>
        </Link>
      </div>

      {submitted && (
        <div
          className={`mb-6 px-4 py-3 rounded-lg border text-sm ${
            routing === "routed"
              ? "bg-[#f0fdf4] border-[#bbf7d0] text-[#15803d]"
              : "bg-amber-50 border-amber-200 text-amber-800"
          }`}
        >
          {routing === "routed" ? (
            <>
              <CheckCircle2 className="h-4 w-4 inline mr-2" />
              <strong>{submitted}</strong> submitted and routed to the insurer.
            </>
          ) : (
            <>
              <AlertTriangle className="h-4 w-4 inline mr-2" />
              <strong>{submitted}</strong> saved as out-of-network — manual follow-up is required.
            </>
          )}
        </div>
      )}

      {/* ─── Org KPI tiles ────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <Kpi label="Total" value={orgTotals.total} tone="neutral" />
        <Kpi label="Approved" value={orgTotals.approved} tone="green" />
        <Kpi label="Pending" value={orgTotals.pending} tone="amber" />
        <Kpi label="Escalated" value={orgTotals.escalated} tone="blue" />
        <Kpi label="Denied" value={orgTotals.denied} tone="red" />
      </div>

      {/* ─── By team member ──────────────────────────── */}
      <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm overflow-hidden mb-8">
        <div className="px-6 py-3.5 border-b border-[#f3f4f6] flex items-center gap-2">
          <Users className="h-4 w-4 text-[#16a34a]" />
          <h3 className="font-bold text-[#0a0a0a] text-sm">Pre-Auth Activity by Team Member</h3>
          <span className="ml-1 px-2 py-0.5 rounded-full bg-[#f3f4f6] text-xs font-bold text-[#6b7280]">
            {doctors.length}
          </span>
        </div>
        {loading ? (
          <div className="animate-pulse p-6 space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-4 bg-[#f3f4f6] rounded w-full" />
            ))}
          </div>
        ) : doctors.length === 0 ? (
          <div className="p-10 text-center text-sm text-[#9ca3af]">
            No pre-auths have been submitted under your organisation yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[#f9fafb] text-left border-b border-[#f3f4f6]">
                  <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase">Team member</th>
                  <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase">Submitted</th>
                  <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase">Approved</th>
                  <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase">Pending</th>
                  <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase">Escalated</th>
                  <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase">Denied</th>
                  <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase">Out-of-net</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f3f4f6]">
                {doctors.map((d) => {
                  const key = d.doctor_id || "unknown";
                  return (
                    <tr key={key} className="hover:bg-[#f9fafb]">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-[#f0fdf4] border border-[#bbf7d0] flex items-center justify-center flex-shrink-0">
                            <Stethoscope className="h-4 w-4 text-[#16a34a]" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-[#0a0a0a] truncate">
                              {d.doctor_name}
                            </p>
                            <p className="text-[11px] text-[#9ca3af]">
                              {d.role === "provider" ? "Provider admin" : "Doctor"}
                              {d.specialty ? ` · ${d.specialty}` : ""}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-[#0a0a0a]">{d.total}</td>
                      <td className="px-6 py-4 text-sm text-green-700">{d.approved}</td>
                      <td className="px-6 py-4 text-sm text-amber-700">{d.pending}</td>
                      <td className="px-6 py-4 text-sm text-blue-700">{d.escalated}</td>
                      <td className="px-6 py-4 text-sm text-red-700">{d.denied}</td>
                      <td className="px-6 py-4 text-sm text-[#6b7280]">{d.unrouted}</td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => {
                            setDoctorFilter(key);
                            setTab("routed");
                          }}
                          className="text-xs font-bold text-[#16a34a] hover:text-[#15803d]"
                        >
                          View →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Submission list ─────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <TabButton active={tab === "routed"} onClick={() => setTab("routed")} count={routedCount} label="In-network" />
          <TabButton
            active={tab === "unrouted"}
            onClick={() => setTab("unrouted")}
            count={unroutedCount}
            label="Out-of-network"
          />
        </div>
        <div className="sm:ml-auto">
          <Select
            value={doctorFilter}
            onChange={setDoctorFilter}
            size="sm"
            fullWidth={false}
            className="font-medium min-w-[190px]"
            options={[
              { value: "all", label: "All team members" },
              ...doctors.map((d) => ({
                value: d.doctor_id || "unknown",
                label: `${d.doctor_name} (${d.total})`,
              })),
            ]}
          />
        </div>
      </div>

      <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="animate-pulse p-6 space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-4 bg-[#f3f4f6] rounded w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-[#9ca3af]">
            {tab === "routed" ? "No in-network submissions." : "No out-of-network submissions."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[#f9fafb] text-left border-b border-[#f3f4f6]">
                  <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase">Reference</th>
                  <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase">Doctor</th>
                  <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase">Patient</th>
                  <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase">Insurer</th>
                  <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase">Status</th>
                  <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase">Authorisation</th>
                  <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f3f4f6]">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-[#f9fafb]">
                    <td className="px-6 py-4 text-sm font-mono text-[#0a0a0a]">{r.reference_number}</td>
                    <td className="px-6 py-4 text-sm text-[#0a0a0a]">
                      <span className="font-medium">{r.submitted_by_name}</span>
                      {r.submitted_by_role === "provider" && (
                        <span className="ml-1.5 text-[10px] font-bold uppercase text-[#16a34a]">
                          admin
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-[#6b7280]">{r.patient_name}</td>
                    <td className="px-6 py-4 text-sm text-[#6b7280]">
                      {r.insurer_name || r.payer_name_raw || "—"}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <StatusChip status={r.status} routing={r.routing_status} />
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {r.status === "approved" ? (
                        <button
                          onClick={() => navigator.clipboard.writeText(r.reference_number)}
                          title={`Valid until ${
                            r.valid_until ? new Date(r.valid_until).toLocaleDateString() : "—"
                          }. Click to copy.`}
                          className="font-mono text-xs bg-[#f0fdf4] text-[#15803d] border border-[#bbf7d0] px-2 py-1 rounded hover:bg-[#16a34a] hover:text-white transition-colors"
                        >
                          {r.reference_number}
                        </button>
                      ) : (
                        <span className="text-xs text-[#9ca3af]">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-[#6b7280]">
                      {new Date(r.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────
function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "green" | "amber" | "blue" | "red";
}) {
  const toneCls =
    tone === "green"
      ? "text-green-700"
      : tone === "amber"
      ? "text-amber-700"
      : tone === "blue"
      ? "text-blue-700"
      : tone === "red"
      ? "text-red-700"
      : "text-[#0a0a0a]";
  return (
    <div className="bg-white border border-[#e5e7eb] rounded-xl p-4 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-wide text-[#9ca3af]">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold ${toneCls}`}>{value}</p>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  count,
  label,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-bold transition-all border ${
        active
          ? "bg-[#16a34a] text-white border-[#16a34a]"
          : "bg-white text-[#6b7280] border-[#e5e7eb] hover:border-[#16a34a]"
      }`}
    >
      {label}{" "}
      <span
        className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${
          active ? "bg-white/20" : "bg-[#f3f4f6]"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function StatusChip({ status, routing }: { status: string; routing: string }) {
  if (routing === "unrouted") {
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700">
        unrouted
      </span>
    );
  }
  const s = (status || "").toLowerCase();
  const color =
    s === "approve" || s === "approved"
      ? "bg-green-50 text-green-700"
      : s === "escalate" || s === "escalated"
      ? "bg-blue-50 text-blue-700"
      : s === "deny" || s === "denied"
      ? "bg-red-50 text-red-700"
      : "bg-gray-100 text-gray-600";
  return <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${color}`}>{status || "—"}</span>;
}
