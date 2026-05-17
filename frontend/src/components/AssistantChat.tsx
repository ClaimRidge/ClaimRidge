"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  Sparkles,
  Send,
  Loader2,
  Search,
  FileText,
  ShieldAlert,
  ShieldCheck,
  BarChart3,
  Users,
  ExternalLink,
  X,
} from "lucide-react";
import Button from "@/components/ui/Button";

// ─── Types ─────────────────────────────────────────────
type Portal = "insurance" | "provider" | "doctor";

interface Source {
  citation: number;
  type: string;
  title: string;
  snippet: string;
  similarity?: number | null;
  link?: string | null;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  toolCalls?: number;
  error?: boolean;
}

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "";

// ─── Per-portal copy ───────────────────────────────────
const PORTAL_COPY: Record<Portal, { subtitle: string; questions: string[] }> = {
  insurance: {
    subtitle: "Ask anything about your claims, pre-auths, fraud flags and medical policy.",
    questions: [
      "How are we doing this month?",
      "Show me the high fraud-risk claims",
      "What does the policy say about MRI prior-auth?",
      "Which pre-auths are still pending a decision?",
    ],
  },
  provider: {
    subtitle: "Ask anything about your organisation's claims and pre-authorisations.",
    questions: [
      "How many of our claims were denied?",
      "Which pre-auths are still pending?",
      "Were any of our claims flagged for fraud?",
      "Give me an overview of our activity",
    ],
  },
  doctor: {
    subtitle: "Ask anything about the claims and pre-authorisations you've submitted.",
    questions: [
      "What's the status of my recent claims?",
      "Do I have any pre-auths awaiting a decision?",
      "Were any of my claims flagged?",
      "How many claims have I submitted in total?",
    ],
  },
};

// ─── Source type metadata ──────────────────────────────
const SOURCE_META: Record<string, { icon: React.ElementType; label: string; cls: string }> = {
  policy: { icon: FileText, label: "Policy handbook", cls: "bg-[#f0fdf4] text-[#16a34a] border-[#bbf7d0]" },
  claim: { icon: FileText, label: "Claim", cls: "bg-blue-50 text-blue-600 border-blue-200" },
  flagged_claim: { icon: ShieldAlert, label: "Flagged claim", cls: "bg-red-50 text-red-600 border-red-200" },
  pre_auth: { icon: ShieldCheck, label: "Pre-authorisation", cls: "bg-[#f0fdf4] text-[#16a34a] border-[#bbf7d0]" },
  stats: { icon: BarChart3, label: "Live metrics", cls: "bg-[#eef2ff] text-[#4f46e5] border-[#c7d2fe]" },
  network: { icon: Users, label: "Network", cls: "bg-[#f9fafb] text-[#6b7280] border-[#e5e7eb]" },
};
const metaFor = (t: string) => SOURCE_META[t] || SOURCE_META.claim;

// ─── Component ─────────────────────────────────────────
export default function AssistantChat({ portal }: { portal: Portal }) {
  const supabase = createClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [scopeLabel, setScopeLabel] = useState("");
  const [activeSource, setActiveSource] = useState<Source | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const copy = PORTAL_COPY[portal];

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      try {
        const res = await fetch(`${BACKEND}/api/assistant/status`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setScopeLabel(data.scope_label || "");
        }
      } catch {
        /* non-critical */
      }
    })();
  }, [supabase]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const sendMessage = async (text: string) => {
    const question = text.trim();
    if (!question || sending) return;

    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setInput("");
    setSending(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${BACKEND}/api/assistant`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ message: question, history }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setMessages((prev) => [...prev, {
          role: "assistant",
          content: body?.detail || "Something went wrong. Please try again.",
          error: true,
        }]);
        return;
      }

      const data = await res.json();
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: data.answer || "(no response)",
        sources: data.sources || [],
        toolCalls: data.tool_calls || 0,
      }]);
    } catch (err) {
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: err instanceof Error ? err.message : "Network error",
        error: true,
      }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#fafbfc]">
      {/* Header */}
      <div className="border-b border-[#e5e7eb] bg-white px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-[#16a34a]" />
            </div>
            <div>
              <h1 className="font-display text-lg font-bold text-[#0a0a0a]">Assistant</h1>
              <p className="text-xs text-[#9ca3af]">
                {copy.subtitle}
                {scopeLabel && <span className="text-[#16a34a]"> · {scopeLabel}</span>}
              </p>
            </div>
          </div>
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              className="text-xs font-bold text-[#6b7280] hover:text-[#0a0a0a] uppercase tracking-widest"
            >
              New chat
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
          {messages.length === 0 ? (
            <EmptyState questions={copy.questions} onPick={sendMessage} />
          ) : (
            messages.map((m, i) => (
              <MessageBubble key={i} message={m} onOpenSource={setActiveSource} />
            ))
          )}
          {sending && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-[#f0fdf4] border border-[#bbf7d0] flex items-center justify-center flex-shrink-0">
                <Sparkles className="h-4 w-4 text-[#16a34a]" />
              </div>
              <div className="flex items-center gap-2 bg-white border border-[#e5e7eb] rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                <Loader2 className="h-4 w-4 animate-spin text-[#16a34a]" />
                <span className="text-sm text-[#6b7280]">Looking that up…</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-[#e5e7eb] bg-white px-4 sm:px-6 py-4">
        <form
          onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
          className="max-w-4xl mx-auto flex gap-2"
        >
          <div className="flex-1 relative">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about claims, pre-auths, fraud flags, metrics…"
              disabled={sending}
              className="w-full pl-11 pr-4 py-3 bg-[#fafbfc] border border-[#e5e7eb] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]/20 focus:border-[#16a34a] transition-all disabled:opacity-50"
            />
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9ca3af]" />
          </div>
          <Button type="submit" disabled={sending || !input.trim()} className="gap-2 px-5">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send
          </Button>
        </form>
        <p className="text-[10px] text-[#9ca3af] mt-2 text-center max-w-4xl mx-auto">
          Read-only. The assistant only sees your own data and cites the record or passage
          each answer is drawn from — hover a{" "}
          <sup className="font-mono text-[#16a34a]">[1]</sup> to preview it.
        </p>
      </div>

      {activeSource && (
        <SourceModal source={activeSource} onClose={() => setActiveSource(null)} />
      )}
    </div>
  );
}

// ─── Empty state ───────────────────────────────────────
function EmptyState({ questions, onPick }: { questions: string[]; onPick: (q: string) => void }) {
  return (
    <div className="text-center pt-12">
      <div className="w-16 h-16 bg-[#f0fdf4] border border-[#bbf7d0] rounded-2xl flex items-center justify-center mx-auto mb-5">
        <Sparkles className="h-8 w-8 text-[#16a34a]" />
      </div>
      <h2 className="font-display text-2xl font-bold text-[#0a0a0a] mb-2">
        How can I help?
      </h2>
      <p className="text-[#6b7280] max-w-md mx-auto mb-8">
        Ask about anything happening in your account. Every answer is grounded in your live
        data and cites the exact record or passage it came from.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl mx-auto">
        {questions.map((q) => (
          <button
            key={q}
            onClick={() => onPick(q)}
            className="text-left p-4 bg-white border border-[#e5e7eb] rounded-xl hover:border-[#16a34a] hover:shadow-sm transition-all group"
          >
            <p className="text-sm text-[#0a0a0a] font-medium group-hover:text-[#16a34a] transition-colors">
              {q}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Message bubble ────────────────────────────────────
function MessageBubble({
  message,
  onOpenSource,
}: {
  message: Message;
  onOpenSource: (s: Source) => void;
}) {
  if (message.role === "user") {
    return (
      <div className="flex gap-3 justify-end">
        <div className="max-w-[80%] bg-[#0A1628] text-white rounded-2xl rounded-tr-sm px-4 py-2.5 shadow-sm">
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    );
  }

  const sources = message.sources || [];

  return (
    <div className="flex gap-3">
      <div className={`w-8 h-8 rounded-full border flex items-center justify-center flex-shrink-0 ${
        message.error ? "bg-red-50 border-red-200" : "bg-[#f0fdf4] border-[#bbf7d0]"
      }`}>
        <Sparkles className={`h-4 w-4 ${message.error ? "text-red-500" : "text-[#16a34a]"}`} />
      </div>
      <div className="flex-1 max-w-[88%] space-y-3">
        <div className={`rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm ${
          message.error ? "bg-red-50 border border-red-200" : "bg-white border border-[#e5e7eb]"
        }`}>
          <AnswerText content={message.content} sources={sources} onOpenSource={onOpenSource} />
          {typeof message.toolCalls === "number" && message.toolCalls > 0 && (
            <p className="text-[10px] text-[#9ca3af] mt-2 pt-2 border-t border-[#f3f4f6]">
              Ran {message.toolCalls} lookup{message.toolCalls === 1 ? "" : "s"}.
            </p>
          )}
        </div>

        {sources.length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest mb-2">
              Sources
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {sources.map((s) => (
                <SourceCard key={s.citation} source={s} onClick={() => onOpenSource(s)} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Answer text with inline citations ─────────────────
function AnswerText({
  content,
  sources,
  onOpenSource,
}: {
  content: string;
  sources: Source[];
  onOpenSource: (s: Source) => void;
}) {
  const parts = content.split(/(\[#\d+\])/g);
  return (
    <p className="text-sm leading-relaxed text-[#0a0a0a] whitespace-pre-wrap">
      {parts.map((part, i) => {
        const m = part.match(/^\[#(\d+)\]$/);
        if (m) {
          const n = parseInt(m[1], 10);
          const src = sources.find((s) => s.citation === n);
          return <CitationChip key={i} n={n} source={src} onOpen={onOpenSource} />;
        }
        return <span key={i}>{part}</span>;
      })}
    </p>
  );
}

// A small superscript citation marker. Hovering reveals a preview card of the
// exact source the statement was drawn from; clicking opens it in full.
function CitationChip({
  n,
  source,
  onOpen,
}: {
  n: number;
  source?: Source;
  onOpen: (s: Source) => void;
}) {
  if (!source) {
    return <sup className="text-[10px] font-mono text-[#9ca3af] mx-0.5">[{n}]</sup>;
  }
  const meta = metaFor(source.type);
  const Icon = meta.icon;
  return (
    <span className="relative inline-block group align-super leading-none">
      <button
        type="button"
        onClick={() => onOpen(source)}
        className="mx-0.5 inline-flex items-center justify-center min-w-[15px] h-[15px] px-1 rounded text-[9px] font-bold font-mono bg-[#f0fdf4] text-[#16a34a] border border-[#bbf7d0] hover:bg-[#16a34a] hover:text-white transition-colors"
      >
        {n}
      </button>
      {/* Hover preview */}
      <span className="pointer-events-none invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity absolute z-30 bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-72">
        <span className="block bg-white border border-[#e5e7eb] rounded-xl shadow-xl p-3 text-left">
          <span className="flex items-center gap-1.5 mb-1">
            <span className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${meta.cls}`}>
              <Icon className="h-2.5 w-2.5" /> {meta.label}
            </span>
            {typeof source.similarity === "number" && (
              <span className="text-[9px] text-[#9ca3af] font-bold">
                {(source.similarity * 100).toFixed(0)}% match
              </span>
            )}
          </span>
          <span className="block text-xs font-bold text-[#0a0a0a] mb-0.5">{source.title}</span>
          <span className="block text-[11px] text-[#6b7280] leading-relaxed line-clamp-4">
            {source.snippet}
          </span>
          <span className="block text-[9px] text-[#16a34a] font-bold mt-1.5">Click to open</span>
        </span>
      </span>
    </span>
  );
}

// ─── Source card ───────────────────────────────────────
function SourceCard({ source, onClick }: { source: Source; onClick: () => void }) {
  const meta = metaFor(source.type);
  const Icon = meta.icon;
  const preview = source.snippet.length > 150 ? source.snippet.slice(0, 150) + "…" : source.snippet;
  return (
    <button
      onClick={onClick}
      className="text-left bg-white border border-[#e5e7eb] rounded-lg p-3 hover:border-[#16a34a] hover:shadow-sm transition-all"
    >
      <div className="flex items-center justify-between mb-1.5 gap-2">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded text-[10px] font-mono font-bold bg-[#16a34a] text-white flex-shrink-0">
            {source.citation}
          </span>
          <span className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${meta.cls} flex-shrink-0`}>
            <Icon className="h-2.5 w-2.5" /> {meta.label}
          </span>
        </span>
        {typeof source.similarity === "number" && (
          <span className="text-[10px] text-[#9ca3af] font-bold flex-shrink-0">
            {(source.similarity * 100).toFixed(0)}% match
          </span>
        )}
      </div>
      <p className="text-xs font-bold text-[#0a0a0a] truncate">{source.title}</p>
      <p className="text-[11px] text-[#6b7280] leading-relaxed line-clamp-2 mt-0.5">{preview}</p>
    </button>
  );
}

// ─── Source modal ──────────────────────────────────────
function SourceModal({ source, onClose }: { source: Source; onClose: () => void }) {
  const meta = metaFor(source.type);
  const Icon = meta.icon;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        <div className="sticky top-0 bg-white px-6 py-4 border-b border-[#f3f4f6] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded text-xs font-mono font-bold bg-[#16a34a] text-white">
              {source.citation}
            </span>
            <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border ${meta.cls}`}>
              <Icon className="h-3 w-3" /> {meta.label}
            </span>
            {typeof source.similarity === "number" && (
              <span className="text-xs text-[#9ca3af]">
                {(source.similarity * 100).toFixed(1)}% semantic match
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-[#9ca3af] hover:text-[#0a0a0a]" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6">
          <h3 className="font-display font-bold text-[#0a0a0a] mb-2">{source.title}</h3>
          <p className="text-sm text-[#374151] leading-relaxed whitespace-pre-wrap">
            {source.snippet}
          </p>
          {source.link && (
            <Link
              href={source.link}
              className="inline-flex items-center gap-1.5 mt-4 text-sm font-bold text-[#16a34a] hover:text-[#15803d]"
            >
              Open in ClaimRidge <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
