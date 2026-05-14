"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import {
  ArrowLeft,
  Building2,
  Clock,
  CheckCircle,
  XCircle,
  Plus,
  Send,
  AlertCircle,
} from "lucide-react";

interface Org {
  id: string;
  name: string;
  org_code: string;
  country?: string | null;
  contact_email?: string | null;
}

interface Affiliation {
  org: Org | null;
  linked_at: string;
}

interface JoinRequest {
  id: string;
  provider_org_id: string;
  status: "pending" | "approved" | "rejected";
  message: string | null;
  created_at: string;
  org: Org | null;
}

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "";

export default function DoctorOrganizationsPage() {
  const supabase = createClient();
  const [authHeader, setAuthHeader] = useState<string>("");
  const [affiliations, setAffiliations] = useState<Affiliation[]>([]);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async (auth: string) => {
    const res = await fetch(`${BACKEND}/api/doctors/affiliations`, {
      headers: { Authorization: auth },
    });
    if (!res.ok) return;
    const data = await res.json();
    setAffiliations(data.affiliations || []);
    setRequests(data.requests || []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const auth = `Bearer ${session.access_token}`;
      setAuthHeader(auth);
      await load(auth);
      setLoading(false);
    })();
  }, [supabase, load]);

  const submitJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!code.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${BACKEND}/api/doctors/join-by-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({
          org_code: code.trim().toUpperCase(),
          message: message.trim() || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.detail || "Could not submit join request.");
        return;
      }
      if (body.status === "already_linked") {
        setSuccess(`You are already linked to ${body.org?.name || "this organization"}.`);
      } else if (body.status === "already_pending") {
        setSuccess("A request to this organization is already pending.");
      } else {
        setSuccess(`Request sent to ${body.org?.name || "the organization"}. Waiting for admin approval.`);
      }
      setCode("");
      setMessage("");
      await load(authHeader);
    } finally {
      setSubmitting(false);
    }
  };

  const pending = requests.filter(r => r.status === "pending");
  const rejected = requests.filter(r => r.status === "rejected");

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="mb-6">
        <Link href="/dashboard/doctor" className="flex items-center gap-2 text-sm text-[#6b7280] hover:text-[#16a34a] font-medium">
          <ArrowLeft className="h-4 w-4" /> Back to Dashboard
        </Link>
      </div>

      <div className="flex items-center gap-3 mb-8">
        <div className="inline-flex items-center justify-center w-10 h-10 bg-[#f0fdf4] border border-[#bbf7d0] rounded-lg">
          <Building2 className="h-5 w-5 text-[#16a34a]" />
        </div>
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0a0a0a]">My Hospitals</h1>
          <p className="text-[#9ca3af] text-sm">Manage the provider organisations you&apos;re affiliated with.</p>
        </div>
      </div>

      {/* Join a new org */}
      <div className="bg-white border border-[#e5e7eb] rounded-xl p-6 shadow-sm mb-8">
        <h2 className="font-bold text-[#0a0a0a] flex items-center gap-2 mb-1">
          <Plus className="h-4 w-4 text-[#16a34a]" /> Join a Hospital
        </h2>
        <p className="text-sm text-[#6b7280] mb-4">
          Ask the hospital admin for their organization code (format: <span className="font-mono text-xs">ORG-XXXXXX</span>).
          You&apos;ll be linked once they approve your request.
        </p>

        <form onSubmit={submitJoin} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-1">
              <Input
                id="orgCode"
                label="Organization Code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ORG-XXXXXX"
                className="font-mono tracking-widest"
                required
              />
            </div>
            <div className="md:col-span-2">
              <Input
                id="message"
                label="Note to Admin (optional)"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="e.g. Dr. John from cardiology"
              />
            </div>
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">{error}</div>
          )}
          {success && (
            <div className="bg-[#f0fdf4] border border-[#bbf7d0] text-[#15803d] text-xs rounded-lg px-3 py-2">{success}</div>
          )}
          <div className="flex justify-end">
            <Button type="submit" loading={submitting} className="gap-2">
              <Send className="h-4 w-4" /> Send Join Request
            </Button>
          </div>
        </form>
      </div>

      {/* Affiliations + Requests */}
      {loading ? (
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-12 text-center shadow-sm">
          <div className="animate-spin h-8 w-8 border-4 border-[#16a34a] border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-[#9ca3af] text-sm">Loading affiliations…</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Active affiliations */}
          <Section title="Active Affiliations" icon={<CheckCircle className="h-4 w-4 text-[#16a34a]" />} count={affiliations.length}>
            {affiliations.length === 0 ? (
              <Empty
                icon={Building2}
                title="No active affiliations"
                subtitle="You're currently operating as a solo doctor. Send a join request above to link with a hospital."
              />
            ) : (
              <ul className="divide-y divide-[#f3f4f6]">
                {affiliations.map(a => a.org && (
                  <li key={a.org.id} className="px-6 py-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-[#16a34a] text-white flex items-center justify-center flex-shrink-0">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-[#0a0a0a]">{a.org.name}</p>
                      <p className="text-xs text-[#6b7280] mt-0.5">
                        <span className="font-mono">{a.org.org_code}</span>
                        {a.org.country && <span> · {a.org.country}</span>}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest bg-[#16a34a] text-white px-2 py-0.5 rounded">
                        Active
                      </span>
                      <p className="text-[10px] text-[#9ca3af] mt-1">Linked {new Date(a.linked_at).toLocaleDateString()}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Pending requests */}
          {pending.length > 0 && (
            <Section title="Pending Approval" icon={<Clock className="h-4 w-4 text-amber-500" />} count={pending.length}>
              <ul className="divide-y divide-[#f3f4f6]">
                {pending.map(r => (
                  <li key={r.id} className="px-6 py-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-amber-500 text-white flex items-center justify-center flex-shrink-0">
                      <Clock className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-[#0a0a0a]">{r.org?.name || "(Organization)"}</p>
                      <p className="text-xs text-[#6b7280] mt-0.5">
                        {r.org?.org_code && <span className="font-mono">{r.org.org_code}</span>}
                      </p>
                      {r.message && (
                        <p className="text-xs text-[#9ca3af] mt-1 italic">&ldquo;{r.message}&rdquo;</p>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="inline-flex text-[10px] font-bold uppercase tracking-widest bg-amber-500 text-white px-2 py-0.5 rounded">
                        Pending
                      </span>
                      <p className="text-[10px] text-[#9ca3af] mt-1">Sent {new Date(r.created_at).toLocaleDateString()}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="px-6 py-3 border-t border-[#f3f4f6] bg-amber-50/50">
                <p className="text-xs text-amber-800 flex items-center gap-2">
                  <AlertCircle className="h-3.5 w-3.5" />
                  The hospital admin will review your request. You&apos;ll see the status update here once they decide.
                </p>
              </div>
            </Section>
          )}

          {/* Rejected requests */}
          {rejected.length > 0 && (
            <Section title="Previously Rejected" icon={<XCircle className="h-4 w-4 text-red-500" />} count={rejected.length}>
              <ul className="divide-y divide-[#f3f4f6]">
                {rejected.map(r => (
                  <li key={r.id} className="px-6 py-4 flex items-center gap-4 opacity-70">
                    <div className="w-10 h-10 rounded-lg bg-red-100 text-red-600 flex items-center justify-center flex-shrink-0">
                      <XCircle className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-[#0a0a0a]">{r.org?.name || "(Organization)"}</p>
                      <p className="text-xs text-[#6b7280] mt-0.5">
                        {r.org?.org_code && <span className="font-mono">{r.org.org_code}</span>}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="inline-flex text-[10px] font-bold uppercase tracking-widest bg-red-500 text-white px-2 py-0.5 rounded">
                        Rejected
                      </span>
                      <p className="text-[10px] text-[#9ca3af] mt-1">{new Date(r.created_at).toLocaleDateString()}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, icon, count, children }: { title: string; icon: React.ReactNode; count: number; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm overflow-hidden">
      <div className="px-6 py-3.5 border-b border-[#f3f4f6] flex items-center gap-2">
        {icon}
        <h3 className="font-bold text-[#0a0a0a] text-sm">{title}</h3>
        <span className="ml-1 px-2 py-0.5 rounded-full bg-[#f3f4f6] text-xs font-bold text-[#6b7280]">{count}</span>
      </div>
      {children}
    </div>
  );
}

function Empty({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle: string }) {
  return (
    <div className="p-12 text-center">
      <Icon className="h-10 w-10 text-[#d1d5db] mx-auto mb-3" />
      <h3 className="font-bold text-[#0a0a0a]">{title}</h3>
      <p className="text-sm text-[#9ca3af] mt-1 max-w-sm mx-auto">{subtitle}</p>
    </div>
  );
}
