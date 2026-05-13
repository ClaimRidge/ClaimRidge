"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  Scale,
  Send,
  Sparkles,
  ArrowLeft,
  FileText,
  AlertCircle,
  Loader2,
  Search,
} from "lucide-react";
import Button from "@/components/ui/Button";

interface Source {
  citation: number;
  chunk_id: string;
  content: string;
  similarity: number;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  toolCalls?: number;
  error?: boolean;
}

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "";

const SUGGESTED_QUESTIONS = [
  "What inpatient stays require prior authorization?",
  "Are MRI scans for back pain covered?",
  "What are the exclusions for cosmetic procedures?",
  "Does the policy cover ER visits for chronic conditions?",
];

export default function PolicyChatPage() {
  const supabase = createClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [hasPolicy, setHasPolicy] = useState<boolean | null>(null);
  const [policyName, setPolicyName] = useState<string>("");
  const [activeSourceChunk, setActiveSourceChunk] = useState<Source | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Check if a policy is uploaded — uses the backend (service-role) since
  // the browser client can't read `policy_chunks` directly.
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setHasPolicy(false); return; }
      try {
        const res = await fetch(`${BACKEND}/api/policy-chat/status`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) { setHasPolicy(false); return; }
        const data = await res.json();
        setHasPolicy(!!data.has_policy);
        setPolicyName(data.policy_file_name || "");
      } catch {
        setHasPolicy(false);
      }
    })();
  }, [supabase]);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const sendMessage = async (text: string) => {
    const question = text.trim();
    if (!question || sending) return;

    const userMsg: Message = { role: "user", content: question };
    const history = messages.map(m => ({ role: m.role, content: m.content }));
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setSending(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${BACKEND}/api/policy-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ message: question, history }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setMessages(prev => [...prev, {
          role: "assistant",
          content: body?.detail || "Something went wrong. Please try again.",
          error: true,
        }]);
        return;
      }

      const data = await res.json();
      setMessages(prev => [...prev, {
        role: "assistant",
        content: data.answer || "(no response)",
        sources: data.sources || [],
        toolCalls: data.tool_calls || 0,
      }]);
    } catch (err: any) {
      setMessages(prev => [...prev, { role: "assistant", content: err.message || "Network error", error: true }]);
    } finally {
      setSending(false);
    }
  };

  // ─── Empty / no-policy states ─────────────────────────
  if (hasPolicy === null) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#16a34a]" />
      </div>
    );
  }

  if (!hasPolicy) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#f9fafb]">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="h-8 w-8 text-amber-600" />
          </div>
          <h1 className="text-2xl font-bold text-[#0a0a0a] mb-3 font-display">
            No policy uploaded yet
          </h1>
          <p className="text-[#6b7280] mb-6 leading-relaxed">
            Upload your medical policy handbook from Settings → Policy Guidelines to start asking
            questions about your coverage rules.
          </p>
          <Link href="/dashboard/insurance/settings">
            <Button className="gap-2 px-8">
              <ArrowLeft className="h-4 w-4" /> Go to Settings
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // ─── Chat layout ──────────────────────────────────────
  return (
    <div className="h-full flex flex-col bg-[#fafbfc]">
      {/* Header */}
      <div className="border-b border-[#e5e7eb] bg-white px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl flex items-center justify-center">
              <Scale className="h-5 w-5 text-[#16a34a]" />
            </div>
            <div>
              <h1 className="font-display text-lg font-bold text-[#0a0a0a]">Policy Assistant</h1>
              <p className="text-xs text-[#9ca3af]">
                Ask anything about your medical policy handbook.{" "}
                {policyName && <span className="text-[#16a34a] font-mono">{policyName}</span>}
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
            <EmptyState onPick={sendMessage} />
          ) : (
            messages.map((m, i) => (
              <MessageBubble
                key={i}
                message={m}
                onCitationClick={(n) => {
                  const src = m.sources?.find(s => s.citation === n);
                  if (src) setActiveSourceChunk(src);
                }}
              />
            ))
          )}
          {sending && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-[#f0fdf4] border border-[#bbf7d0] flex items-center justify-center flex-shrink-0">
                <Sparkles className="h-4 w-4 text-[#16a34a]" />
              </div>
              <div className="flex items-center gap-2 bg-white border border-[#e5e7eb] rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                <Loader2 className="h-4 w-4 animate-spin text-[#16a34a]" />
                <span className="text-sm text-[#6b7280]">
                  Searching the policy handbook…
                </span>
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
              placeholder="Ask about coverage, exclusions, prior-auth requirements…"
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
          Answers cite source excerpts from your uploaded policy. Click a citation marker like
          <span className="font-mono mx-1 px-1.5 py-0.5 bg-[#f0fdf4] text-[#16a34a] rounded">[#1]</span>
          to view the original passage.
        </p>
      </div>

      {/* Source preview modal */}
      {activeSourceChunk && (
        <SourceModal source={activeSourceChunk} onClose={() => setActiveSourceChunk(null)} />
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────

function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="text-center pt-12">
      <div className="w-16 h-16 bg-[#f0fdf4] border border-[#bbf7d0] rounded-2xl flex items-center justify-center mx-auto mb-5">
        <Sparkles className="h-8 w-8 text-[#16a34a]" />
      </div>
      <h2 className="font-display text-2xl font-bold text-[#0a0a0a] mb-2">
        Ask the Policy Assistant
      </h2>
      <p className="text-[#6b7280] max-w-md mx-auto mb-8">
        Get instant answers grounded in your insurer&apos;s medical policy. Every claim is cited
        back to the exact passage in your handbook.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl mx-auto">
        {SUGGESTED_QUESTIONS.map((q) => (
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

function MessageBubble({ message, onCitationClick }: {
  message: Message;
  onCitationClick: (n: number) => void;
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

  return (
    <div className="flex gap-3">
      <div className={`w-8 h-8 rounded-full border flex items-center justify-center flex-shrink-0 ${
        message.error ? "bg-red-50 border-red-200" : "bg-[#f0fdf4] border-[#bbf7d0]"
      }`}>
        <Sparkles className={`h-4 w-4 ${message.error ? "text-red-500" : "text-[#16a34a]"}`} />
      </div>
      <div className="flex-1 max-w-[85%] space-y-3">
        <div className={`rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm ${
          message.error ? "bg-red-50 border border-red-200" : "bg-white border border-[#e5e7eb]"
        }`}>
          <AnswerText content={message.content} onCitationClick={onCitationClick} />
          {typeof message.toolCalls === "number" && message.toolCalls > 0 && (
            <p className="text-[10px] text-[#9ca3af] mt-2 pt-2 border-t border-[#f3f4f6]">
              Searched the handbook {message.toolCalls} time{message.toolCalls === 1 ? "" : "s"}.
            </p>
          )}
        </div>

        {message.sources && message.sources.length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest mb-2">
              Sources from your policy
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {message.sources.map((s) => (
                <SourceCard key={s.chunk_id} source={s} onClick={() => onCitationClick(s.citation)} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AnswerText({ content, onCitationClick }: { content: string; onCitationClick: (n: number) => void }) {
  // Split text on [#N] markers and render each as a clickable chip
  const parts = content.split(/(\[#\d+\])/g);
  return (
    <p className="text-sm leading-relaxed text-[#0a0a0a] whitespace-pre-wrap">
      {parts.map((part, i) => {
        const m = part.match(/^\[#(\d+)\]$/);
        if (m) {
          const n = parseInt(m[1], 10);
          return (
            <button
              key={i}
              onClick={() => onCitationClick(n)}
              className="inline-flex items-center px-1.5 py-0.5 mx-0.5 text-[10px] font-bold font-mono bg-[#f0fdf4] text-[#16a34a] border border-[#bbf7d0] rounded hover:bg-[#16a34a] hover:text-white transition-colors align-baseline"
              title={`View source #${n}`}
            >
              #{n}
            </button>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </p>
  );
}

function SourceCard({ source, onClick }: { source: Source; onClick: () => void }) {
  const preview = source.content.length > 140 ? source.content.slice(0, 140) + "…" : source.content;
  return (
    <button
      onClick={onClick}
      className="text-left bg-white border border-[#e5e7eb] rounded-lg p-3 hover:border-[#16a34a] hover:shadow-sm transition-all group"
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-[#16a34a] bg-[#f0fdf4] px-1.5 py-0.5 rounded">
          <FileText className="h-2.5 w-2.5" /> #{source.citation}
        </span>
        <span className="text-[10px] text-[#9ca3af] font-bold">
          {(source.similarity * 100).toFixed(0)}% match
        </span>
      </div>
      <p className="text-xs text-[#374151] leading-relaxed line-clamp-3">{preview}</p>
    </button>
  );
}

function SourceModal({ source, onClose }: { source: Source; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        <div className="sticky top-0 bg-white px-6 py-4 border-b border-[#f3f4f6] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs font-mono font-bold text-[#16a34a] bg-[#f0fdf4] border border-[#bbf7d0] px-2 py-0.5 rounded">
              <FileText className="h-3 w-3" /> Source #{source.citation}
            </span>
            <span className="text-xs text-[#9ca3af]">{(source.similarity * 100).toFixed(1)}% semantic match</span>
          </div>
          <button onClick={onClose} className="text-[#9ca3af] hover:text-[#0a0a0a] text-xl">✕</button>
        </div>
        <div className="p-6">
          <p className="text-sm text-[#0a0a0a] leading-relaxed whitespace-pre-wrap font-serif">
            {source.content}
          </p>
        </div>
      </div>
    </div>
  );
}
