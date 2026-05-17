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
} from "lucide-react";
import Button from "@/components/ui/Button";

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
  approved_procedures: string[] | null;
  created_at: string;
  sla_deadline: string;
}

type Tab = "routed" | "unrouted";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "";

export default function DoctorPreAuthListPage() {
  const supabase = createClient();
  const params = useSearchParams();
  const submitted = params.get("submitted");
  const routing = params.get("routing");

  const [rows, setRows] = useState<PreAuthRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("routed");

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
        const res = await fetch(`${BACKEND}/api/dropoff/my-submissions`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) setRows(await res.json());
      } catch {
        /* surfaced via empty state */
      }
      setLoading(false);
    })();
  }, [supabase]);

  const routed = useMemo(() => rows.filter((r) => r.routing_status === "routed"), [rows]);
  const unrouted = useMemo(() => rows.filter((r) => r.routing_status === "unrouted"), [rows]);
  const active = tab === "routed" ? routed : unrouted;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="mb-6">
        <Link
          href="/dashboard/doctor"
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
              My Pre-Authorisations
            </h1>
            <p className="text-[#9ca3af] text-sm">Procedures you&apos;ve sent for insurer approval.</p>
          </div>
        </div>
        <Link href="/dashboard/doctor/pre-auth/new">
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
              <strong>{submitted}</strong> submitted and routed to the insurer for review.
            </>
          ) : (
            <>
              <AlertTriangle className="h-4 w-4 inline mr-2" />
              <strong>{submitted}</strong> saved as out-of-network — the payer isn&apos;t in our
              network, so you&apos;ll need to follow up with them manually.
            </>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 mb-6">
        <TabButton active={tab === "routed"} onClick={() => setTab("routed")} count={routed.length} label="In-network" />
        <TabButton active={tab === "unrouted"} onClick={() => setTab("unrouted")} count={unrouted.length} label="Out-of-network" />
      </div>

      <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="animate-pulse p-6 space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-4 bg-[#f3f4f6] rounded w-full" />
            ))}
          </div>
        ) : active.length === 0 ? (
          <div className="p-12 text-center text-sm text-[#9ca3af]">
            {tab === "routed"
              ? "No in-network pre-auths yet."
              : "No out-of-network pre-auths yet."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[#f9fafb] text-left border-b border-[#f3f4f6]">
                  <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase">Reference</th>
                  <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase">Patient</th>
                  <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase">Insurer</th>
                  <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase">Status</th>
                  <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase">Authorisation</th>
                  <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f3f4f6]">
                {active.map((r) => (
                  <tr key={r.id} className="hover:bg-[#f9fafb]">
                    <td className="px-6 py-4 text-sm font-mono text-[#0a0a0a]">{r.reference_number}</td>
                    <td className="px-6 py-4 text-sm text-[#0a0a0a]">{r.patient_name}</td>
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
