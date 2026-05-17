"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import {
  ShieldCheck,
  ShieldAlert,
  Loader2,
  Download,
  ScrollText,
  Sparkles,
  Eye,
  Trash2,
  Clock,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────
type Portal = "insurance" | "provider" | "doctor";
type Tab = "events" | "ai" | "pii" | "retention";

interface AuditEvent {
  id: string;
  created_at: string;
  category: string | null;
  action: string;
  actor_name: string | null;
  actor_role: string | null;
  actor_id: string | null;
  target_type: string | null;
  target_id: string | null;
  summary: string | null;
  chain_seq: number | null;
  event_hash: string | null;
  metadata: Record<string, unknown> | null;
}

interface Inference {
  id: string;
  created_at: string;
  event_type: string | null;
  model_version: string | null;
  prompt_template_name: string | null;
  confidence_score: number | null;
  latency_ms: number | null;
  actor_name: string | null;
  input_data: unknown;
  output_data: unknown;
}

interface ChainStatus {
  valid: boolean;
  events_verified?: number;
  total_events?: number;
  broken_at_seq?: number;
}

interface RetentionItem {
  id: string;
  label: string;
  patient_name: string | null;
  created_at: string;
  retention_until: string | null;
}
interface RetentionGroup {
  total: number;
  expired: number;
  expiring_soon: number;
  items: RetentionItem[];
}
interface ErasureRequest {
  id: string;
  subject_type: string;
  subject_label: string | null;
  reason: string | null;
  status: string;
  created_at: string;
  executed_at: string | null;
}

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "";

const CATEGORY_META: Record<string, { label: string; cls: string }> = {
  decision: { label: "Decision", cls: "bg-blue-50 text-blue-600 border-blue-200" },
  action: { label: "Action", cls: "bg-[#f9fafb] text-[#6b7280] border-[#e5e7eb]" },
  ai_inference: { label: "AI Inference", cls: "bg-[#eef2ff] text-[#4f46e5] border-[#c7d2fe]" },
  pii_access: { label: "PII Access", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  export: { label: "Export", cls: "bg-[#f0fdf4] text-[#16a34a] border-[#bbf7d0]" },
  erasure: { label: "Erasure", cls: "bg-red-50 text-red-600 border-red-200" },
};
const catMeta = (c: string | null) =>
  CATEGORY_META[c || ""] || { label: c || "Event", cls: "bg-[#f9fafb] text-[#6b7280] border-[#e5e7eb]" };

const FILTERS = ["all", "decision", "action", "ai_inference", "pii_access", "export", "erasure"];

function fmt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

// ─── Component ─────────────────────────────────────────
export default function AuditTrail({ portal }: { portal: Portal }) {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("events");
  const [chain, setChain] = useState<ChainStatus | null>(null);
  const [scopeLabel, setScopeLabel] = useState("");

  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [filter, setFilter] = useState("all");
  const [eventsLoading, setEventsLoading] = useState(true);

  const [inferences, setInferences] = useState<Inference[]>([]);
  const [aiLoaded, setAiLoaded] = useState(false);
  const [expandedAi, setExpandedAi] = useState<string | null>(null);

  const [pii, setPii] = useState<AuditEvent[]>([]);
  const [piiLoaded, setPiiLoaded] = useState(false);

  const [retention, setRetention] = useState<{ claims: RetentionGroup; pre_auths: RetentionGroup; note: string } | null>(null);
  const [erasures, setErasures] = useState<ErasureRequest[]>([]);
  const [retentionLoaded, setRetentionLoaded] = useState(false);

  const [exporting, setExporting] = useState(false);
  const [erasureModal, setErasureModal] = useState<{ type: "claim" | "pre_auth"; id: string; label: string } | null>(null);

  const authed = useCallback(
    async (path: string, init?: RequestInit) => {
      const { data: { session } } = await supabase.auth.getSession();
      return fetch(`${BACKEND}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
          ...(init?.headers || {}),
        },
      });
    },
    [supabase]
  );

  // ── Loaders ──────────────────────────────────────────
  const loadEvents = useCallback(
    async (cat: string) => {
      setEventsLoading(true);
      try {
        const res = await authed(`/api/audit/events?category=${cat}&limit=300`);
        if (res.ok) {
          const data = await res.json();
          setEvents(data.events || []);
          setScopeLabel(data.scope_label || "");
        }
      } catch {
        /* empty state */
      }
      setEventsLoading(false);
    },
    [authed]
  );

  useEffect(() => {
    (async () => {
      try {
        const res = await authed("/api/audit/verify");
        if (res.ok) setChain(await res.json());
      } catch {
        /* badge shows unknown */
      }
    })();
    loadEvents("all");
  }, [authed, loadEvents]);

  useEffect(() => {
    if (tab === "ai" && !aiLoaded) {
      (async () => {
        try {
          const res = await authed("/api/audit/ai-inferences?limit=300");
          if (res.ok) setInferences((await res.json()).inferences || []);
        } catch { /* */ }
        setAiLoaded(true);
      })();
    }
    if (tab === "pii" && !piiLoaded) {
      (async () => {
        try {
          const res = await authed("/api/audit/events?category=pii_access&limit=300");
          if (res.ok) setPii((await res.json()).events || []);
        } catch { /* */ }
        setPiiLoaded(true);
      })();
    }
    if (tab === "retention" && !retentionLoaded) {
      loadRetention();
    }
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadRetention = async () => {
    try {
      const [r1, r2] = await Promise.all([
        authed("/api/audit/retention"),
        authed("/api/audit/erasure"),
      ]);
      if (r1.ok) setRetention(await r1.json());
      if (r2.ok) setErasures((await r2.json()).requests || []);
    } catch { /* */ }
    setRetentionLoaded(true);
  };

  // ── Export ───────────────────────────────────────────
  const runExport = async () => {
    setExporting(true);
    try {
      const res = await authed("/api/audit/export", {
        method: "POST",
        body: JSON.stringify({ category: filter, limit: 5000 }),
      });
      if (!res.ok) throw new Error("Export failed");
      const data = await res.json();
      const rows: AuditEvent[] = data.events || [];
      const head = ["timestamp", "chain_seq", "category", "action", "actor", "actor_role", "target_type", "target_id", "summary", "event_hash"];
      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const csv = [
        `# ClaimRidge Audit Report`,
        `# Scope: ${data.scope}`,
        `# Generated: ${data.generated_at} by ${data.generated_by}`,
        `# Events: ${data.event_count} · Chain integrity: ${data.chain_integrity?.valid ? "VERIFIED" : "FAILED"}`,
        head.join(","),
        ...rows.map((e) =>
          [e.created_at, e.chain_seq, e.category, e.action, e.actor_name, e.actor_role, e.target_type, e.target_id, e.summary, e.event_hash]
            .map(esc)
            .join(",")
        ),
      ].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `claimridge-audit-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Could not generate the audit export. Please try again.");
    }
    setExporting(false);
  };

  // ── Erasure ──────────────────────────────────────────
  const submitErasure = async (reason: string) => {
    if (!erasureModal) return;
    try {
      await authed("/api/audit/erasure", {
        method: "POST",
        body: JSON.stringify({
          subject_type: erasureModal.type,
          subject_id: erasureModal.id,
          subject_label: erasureModal.label,
          reason,
        }),
      });
    } catch { /* */ }
    setErasureModal(null);
    setRetentionLoaded(false);
    loadRetention();
  };

  const executeErasure = async (id: string) => {
    if (!confirm("Permanently anonymise the patient data on this record? This cannot be undone.")) return;
    try {
      await authed(`/api/audit/erasure/${id}/execute`, { method: "POST" });
    } catch { /* */ }
    setRetentionLoaded(false);
    loadRetention();
  };

  // ── Render ───────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center justify-center w-10 h-10 bg-[#f0fdf4] border border-[#bbf7d0] rounded-lg">
            <ScrollText className="h-5 w-5 text-[#16a34a]" />
          </div>
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0a0a0a]">
              Audit Trail &amp; Compliance
            </h1>
            <p className="text-[#9ca3af] text-sm">
              Immutable, hash-chained record of every action — PDPL (Law No. 24 of 2023).
              {scopeLabel && <span className="text-[#16a34a]"> · {scopeLabel}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ChainBadge chain={chain} />
          <Button onClick={runExport} loading={exporting} className="gap-2">
            <Download className="h-4 w-4" /> Export
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-[#e5e7eb] mb-6 overflow-x-auto">
        <TabBtn icon={ScrollText} label="Event Log" active={tab === "events"} onClick={() => setTab("events")} />
        <TabBtn icon={Sparkles} label="AI Inferences" active={tab === "ai"} onClick={() => setTab("ai")} />
        <TabBtn icon={Eye} label="PII Access" active={tab === "pii"} onClick={() => setTab("pii")} />
        <TabBtn icon={Clock} label="Retention &amp; Erasure" active={tab === "retention"} onClick={() => setTab("retention")} />
      </div>

      {/* ── Event Log ──────────────────────────────────── */}
      {tab === "events" && (
        <>
          <div className="flex flex-wrap items-center gap-1.5 mb-4">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => { setFilter(f); loadEvents(f); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  filter === f
                    ? "bg-[#16a34a] text-white"
                    : "bg-white border border-[#e5e7eb] text-[#6b7280] hover:border-[#16a34a]"
                }`}
              >
                {f === "all" ? "All" : catMeta(f).label}
              </button>
            ))}
          </div>
          {eventsLoading ? (
            <LoadingCard />
          ) : events.length === 0 ? (
            <EmptyCard text="No audit events recorded yet." />
          ) : (
            <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm divide-y divide-[#f3f4f6]">
              {events.map((e) => (
                <EventRow key={e.id} event={e} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── AI Inferences ──────────────────────────────── */}
      {tab === "ai" && (
        !aiLoaded ? (
          <LoadingCard />
        ) : inferences.length === 0 ? (
          <EmptyCard text="No AI inferences logged yet." />
        ) : (
          <div className="space-y-2">
            {inferences.map((inf) => (
              <InferenceCard
                key={inf.id}
                inf={inf}
                expanded={expandedAi === inf.id}
                onToggle={() => setExpandedAi(expandedAi === inf.id ? null : inf.id)}
              />
            ))}
          </div>
        )
      )}

      {/* ── PII Access ─────────────────────────────────── */}
      {tab === "pii" && (
        <>
          <p className="text-sm text-[#6b7280] mb-4">
            Every time a user opens a record containing patient-identifying data, it is logged
            here — who, when, which record, and the purpose of access.
          </p>
          {!piiLoaded ? (
            <LoadingCard />
          ) : pii.length === 0 ? (
            <EmptyCard text="No PII-access events recorded yet." />
          ) : (
            <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm divide-y divide-[#f3f4f6]">
              {pii.map((e) => (
                <PiiRow key={e.id} event={e} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Retention & Erasure ────────────────────────── */}
      {tab === "retention" && (
        !retentionLoaded ? (
          <LoadingCard />
        ) : (
          <div className="space-y-6">
            {retention && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <RetentionGroupCard title="Claims" group={retention.claims} kind="claim" onErase={setErasureModal} />
                <RetentionGroupCard title="Pre-Authorisations" group={retention.pre_auths} kind="pre_auth" onErase={setErasureModal} />
              </div>
            )}
            {retention?.note && (
              <p className="text-xs text-[#9ca3af]">{retention.note}</p>
            )}

            <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#f3f4f6] flex items-center gap-2">
                <Trash2 className="h-4 w-4 text-[#16a34a]" />
                <h3 className="font-bold text-[#0a0a0a] text-sm">Right-to-Erasure Requests</h3>
                <span className="ml-1 px-2 py-0.5 rounded-full bg-[#f3f4f6] text-xs font-bold text-[#6b7280]">
                  {erasures.length}
                </span>
              </div>
              {erasures.length === 0 ? (
                <div className="p-8 text-center text-sm text-[#9ca3af]">No erasure requests filed.</div>
              ) : (
                <div className="divide-y divide-[#f3f4f6]">
                  {erasures.map((er) => (
                    <div key={er.id} className="px-5 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#0a0a0a] truncate">
                          {er.subject_label || er.subject_type}
                        </p>
                        <p className="text-xs text-[#9ca3af]">
                          {er.subject_type} · filed {fmt(er.created_at)}
                          {er.reason ? ` · ${er.reason}` : ""}
                        </p>
                      </div>
                      {er.status === "pending" ? (
                        <button
                          onClick={() => executeErasure(er.id)}
                          className="text-xs font-bold text-red-600 hover:text-red-700 border border-red-200 rounded-lg px-3 py-1.5 flex-shrink-0"
                        >
                          Execute erasure
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-[#16a34a] flex-shrink-0">
                          <CheckCircle2 className="h-3.5 w-3.5" /> {er.status}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      )}

      {erasureModal && (
        <ErasureModal target={erasureModal} onClose={() => setErasureModal(null)} onSubmit={submitErasure} />
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────
function ChainBadge({ chain }: { chain: ChainStatus | null }) {
  if (!chain) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#9ca3af] bg-[#f9fafb] border border-[#e5e7eb] rounded-lg px-3 py-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking integrity…
      </span>
    );
  }
  if (chain.valid) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#15803d] bg-[#f0fdf4] border border-[#bbf7d0] rounded-lg px-3 py-2">
        <ShieldCheck className="h-4 w-4" /> Chain verified · {chain.events_verified ?? 0} events
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
      <ShieldAlert className="h-4 w-4" /> Integrity check FAILED
      {chain.broken_at_seq != null ? ` at #${chain.broken_at_seq}` : ""}
    </span>
  );
}

function TabBtn({ icon: Icon, label, active, onClick }: {
  icon: React.ElementType; label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 -mb-px whitespace-nowrap transition-colors ${
        active
          ? "border-[#16a34a] text-[#16a34a]"
          : "border-transparent text-[#9ca3af] hover:text-[#374151]"
      }`}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}

function EventRow({ event }: { event: AuditEvent }) {
  const m = catMeta(event.category);
  return (
    <div className="px-5 py-3 flex items-start gap-3 hover:bg-[#f9fafb]">
      <span className={`mt-0.5 inline-flex items-center text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border ${m.cls} flex-shrink-0`}>
        {m.label}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[#0a0a0a]">
          {event.summary || event.action}
        </p>
        <p className="text-xs text-[#9ca3af] mt-0.5">
          {event.actor_name || event.actor_role || "System"} · {fmt(event.created_at)}
          {event.target_type ? ` · ${event.target_type}` : ""}
          {event.chain_seq != null ? ` · #${event.chain_seq}` : ""}
        </p>
      </div>
      {event.event_hash && (
        <span
          title={`Event hash: ${event.event_hash}`}
          className="font-mono text-[10px] text-[#d1d5db] flex-shrink-0 hidden sm:block"
        >
          {event.event_hash.slice(0, 10)}…
        </span>
      )}
    </div>
  );
}

function PiiRow({ event }: { event: AuditEvent }) {
  const purpose = (event.metadata?.purpose as string) || "unspecified";
  return (
    <div className="px-5 py-3 flex items-start gap-3 hover:bg-[#f9fafb]">
      <Eye className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[#0a0a0a]">{event.summary || event.action}</p>
        <p className="text-xs text-[#9ca3af] mt-0.5">
          {event.actor_name || event.actor_role || "User"} · {fmt(event.created_at)} ·{" "}
          <span className="text-amber-700 font-medium">purpose: {purpose}</span>
        </p>
      </div>
    </div>
  );
}

function InferenceCard({ inf, expanded, onToggle }: {
  inf: Inference; expanded: boolean; onToggle: () => void;
}) {
  return (
    <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm">
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-5 py-3 text-left">
        {expanded ? <ChevronDown className="h-4 w-4 text-[#9ca3af]" /> : <ChevronRight className="h-4 w-4 text-[#9ca3af]" />}
        <Sparkles className="h-4 w-4 text-[#4f46e5] flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[#0a0a0a] truncate">{inf.event_type || "AI inference"}</p>
          <p className="text-xs text-[#9ca3af]">
            {inf.model_version || "model"} · {fmt(inf.created_at)}
            {inf.actor_name ? ` · ${inf.actor_name}` : ""}
          </p>
        </div>
        {typeof inf.confidence_score === "number" && (
          <span className="text-xs font-bold text-[#4f46e5] flex-shrink-0">
            {Math.round(inf.confidence_score)}%
          </span>
        )}
      </button>
      {expanded && (
        <div className="px-5 pb-4 pt-1 border-t border-[#f3f4f6] space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <Meta label="Model" value={inf.model_version} />
            <Meta label="Prompt" value={inf.prompt_template_name} />
            <Meta label="Confidence" value={inf.confidence_score != null ? `${Math.round(inf.confidence_score)}%` : "—"} />
            <Meta label="Latency" value={inf.latency_ms != null ? `${inf.latency_ms} ms` : "—"} />
          </div>
          <JsonBlock label="Input" data={inf.input_data} />
          <JsonBlock label="Output" data={inf.output_data} />
        </div>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-[#9ca3af]">{label}</p>
      <p className="text-[#0a0a0a] truncate">{String(value ?? "—")}</p>
    </div>
  );
}

function JsonBlock({ label, data }: { label: string; data: unknown }) {
  let text = "";
  try {
    text = JSON.stringify(data, null, 2);
  } catch {
    text = String(data);
  }
  if (text && text.length > 2000) text = text.slice(0, 2000) + "\n… (truncated)";
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-[#9ca3af] mb-1">{label}</p>
      <pre className="text-[11px] bg-[#f9fafb] border border-[#e5e7eb] rounded-lg p-3 overflow-x-auto text-[#374151] max-h-56">
        {text || "—"}
      </pre>
    </div>
  );
}

function RetentionGroupCard({ title, group, kind, onErase }: {
  title: string;
  group: RetentionGroup;
  kind: "claim" | "pre_auth";
  onErase: (t: { type: "claim" | "pre_auth"; id: string; label: string }) => void;
}) {
  return (
    <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-[#f3f4f6]">
        <h3 className="font-bold text-[#0a0a0a] text-sm">{title}</h3>
        <p className="text-xs text-[#9ca3af] mt-0.5">
          {group.total} records · <span className="text-red-600 font-medium">{group.expired} past retention</span> ·{" "}
          <span className="text-amber-600 font-medium">{group.expiring_soon} expiring soon</span>
        </p>
      </div>
      <div className="max-h-80 overflow-y-auto divide-y divide-[#f3f4f6]">
        {group.items.length === 0 ? (
          <div className="p-6 text-center text-xs text-[#9ca3af]">No records.</div>
        ) : (
          group.items.map((it) => (
            <div key={it.id} className="px-5 py-2.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm text-[#0a0a0a] truncate">{it.label}</p>
                <p className="text-[11px] text-[#9ca3af]">
                  Retain until {it.retention_until ? new Date(it.retention_until).toLocaleDateString() : "—"}
                </p>
              </div>
              <button
                onClick={() => onErase({ type: kind, id: it.id, label: String(it.label) })}
                className="text-[11px] font-bold text-red-600 hover:text-red-700 flex-shrink-0"
              >
                Request erasure
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ErasureModal({ target, onClose, onSubmit }: {
  target: { type: "claim" | "pre_auth"; id: string; label: string };
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h3 className="font-display font-bold text-[#0a0a0a] mb-1">Request right-to-erasure</h3>
        <p className="text-sm text-[#6b7280] mb-4">
          This files a PDPL erasure request for <strong>{target.label}</strong>. Executing it later
          anonymises the patient PII on the record — the immutable audit log is preserved.
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="Reason (e.g. data-subject erasure request)"
          className="w-full px-3 py-2 border border-[#e5e7eb] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]/20 focus:border-[#16a34a]"
        />
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSubmit(reason.trim() || "Data-subject erasure request")}>
            File request
          </Button>
        </div>
      </div>
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm p-12 text-center">
      <Loader2 className="h-6 w-6 animate-spin text-[#16a34a] mx-auto" />
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm p-12 text-center">
      <ScrollText className="h-10 w-10 text-[#d1d5db] mx-auto mb-3" />
      <p className="text-sm text-[#9ca3af]">{text}</p>
    </div>
  );
}
