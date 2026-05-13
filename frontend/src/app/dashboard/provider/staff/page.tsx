"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  Users,
  Building2,
  Trash2,
  ArrowLeft,
  CheckCircle,
  Plus,
  Mail,
  Clock,
  XCircle,
  Send,
} from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

interface DoctorProfile {
  id: string;
  full_name: string | null;
  contact_email: string | null;
  doctor_specialty: string | null;
  doctor_license_number?: string | null;
}

interface JoinRequest {
  id: string;
  doctor_id: string;
  status: "pending" | "approved" | "rejected";
  message: string | null;
  created_at: string;
  doctor: DoctorProfile | null;
}

interface Invitation {
  id: string;
  invited_email: string;
  token: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  expires_at: string;
  created_at: string;
}

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "";

export default function StaffManagementPage() {
  const supabase = createClient();
  const [authHeader, setAuthHeader] = useState<string>("");
  const [orgCode, setOrgCode] = useState("");
  const [providerOrgId, setProviderOrgId] = useState<string | null>(null);
  const [doctors, setDoctors] = useState<DoctorProfile[]>([]);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);
  const [lastInviteLinkCopied, setLastInviteLinkCopied] = useState(false);

  const authedFetch = useCallback(
    async (path: string, init?: RequestInit) => {
      const res = await fetch(`${BACKEND}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
          ...(init?.headers || {}),
        },
      });
      return res;
    },
    [authHeader]
  );

  const refresh = useCallback(async () => {
    if (!authHeader) return;
    const [docsRes, reqRes, invRes] = await Promise.all([
      authedFetch("/api/providers/doctors"),
      authedFetch("/api/providers/join-requests?status=pending"),
      authedFetch("/api/providers/invitations"),
    ]);
    if (docsRes.ok) setDoctors(await docsRes.json());
    if (reqRes.ok) setRequests(await reqRes.json());
    if (invRes.ok) setInvitations(await invRes.json());
  }, [authHeader, authedFetch]);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const auth = `Bearer ${session.access_token}`;
      setAuthHeader(auth);

      // Pull org info via the backend (single source of truth, respects RLS).
      const orgRes = await fetch(`${BACKEND}/api/providers/me`, {
        headers: { Authorization: auth },
      });
      if (orgRes.ok) {
        const org = await orgRes.json();
        setProviderOrgId(org.id);
        setOrgCode(org.org_code || "");
      }
    })();
  }, [supabase]);

  useEffect(() => {
    if (!authHeader) return;
    (async () => {
      setLoading(true);
      await refresh();
      setLoading(false);
    })();
  }, [authHeader, refresh]);

  const decideRequest = async (requestId: string, decision: "approve" | "reject") => {
    const res = await authedFetch(`/api/providers/join-requests/${requestId}/decision`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    });
    if (res.ok) await refresh();
  };

  const removeDoctor = async (doctorId: string) => {
    if (!window.confirm("Remove this doctor from your organization? Their historical claims remain, but future claims will not be linked.")) return;
    const res = await authedFetch(`/api/providers/doctors/${doctorId}`, { method: "DELETE" });
    if (res.ok) setDoctors((prev) => prev.filter((d) => d.id !== doctorId));
  };

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError("");
    setInviteSending(true);
    setLastInviteLink(null);
    try {
      const res = await authedFetch("/api/providers/invitations", {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail, expires_in_days: 14 }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setInviteError(body?.detail || "Could not create invitation.");
        return;
      }
      const inv: Invitation = await res.json();
      const link = `${window.location.origin}/signup?invite=${inv.token}`;
      setLastInviteLink(link);
      setInviteEmail("");
      await refresh();
    } finally {
      setInviteSending(false);
    }
  };

  const revokeInvite = async (id: string) => {
    const res = await authedFetch(`/api/providers/invitations/${id}`, { method: "DELETE" });
    if (res.ok) await refresh();
  };

  const copyOrgLink = () => {
    if (!orgCode) return;
    const link = `${window.location.origin}/signup?role=doctor&org=${orgCode}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyInviteLink = (link: string) => {
    navigator.clipboard.writeText(link);
    setLastInviteLinkCopied(true);
    setTimeout(() => setLastInviteLinkCopied(false), 2000);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="mb-6">
        <Link href="/dashboard/provider" className="flex items-center gap-2 text-sm text-[#6b7280] hover:text-[#16a34a] font-medium">
          <ArrowLeft className="h-4 w-4" /> Back to Dashboard
        </Link>
      </div>

      <div className="flex items-center gap-3 mb-8">
        <div className="inline-flex items-center justify-center w-10 h-10 bg-[#f0fdf4] border border-[#bbf7d0] rounded-lg">
          <Users className="h-5 w-5 text-[#16a34a]" />
        </div>
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0a0a0a]">Manage Medical Staff</h1>
          <p className="text-[#9ca3af] text-sm">Invite doctors, review join requests, and manage your roster.</p>
        </div>
      </div>

      {/* Organisation Code Panel */}
      <div className="bg-white border border-[#e5e7eb] rounded-xl p-6 shadow-sm mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-[#0a0a0a] flex items-center gap-2">
            <Building2 className="h-4 w-4 text-[#16a34a]" /> Organization Code
          </h3>
          <p className="text-sm text-[#6b7280] mt-1">
            Share this link with doctors. They&apos;ll submit a join request that you approve below.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="bg-[#f0fdf4] border border-[#bbf7d0] px-4 py-2 rounded-xl min-w-[120px] flex items-center justify-center shadow-sm">
            {orgCode ? (
              <span className="font-mono text-xl font-bold text-[#16a34a] tracking-[0.15em]">{orgCode}</span>
            ) : (
              <div className="h-6 w-20 bg-[#dcfce7] animate-pulse rounded" />
            )}
          </div>
          {orgCode && (
            <button
              onClick={copyOrgLink}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all ${
                copied
                  ? "bg-[#16a34a] text-white shadow-lg shadow-[#16a34a]/20"
                  : "bg-[#f0fdf4] text-[#16a34a] hover:bg-[#16a34a] hover:text-white border border-[#bbf7d0] hover:border-[#16a34a]"
              }`}
            >
              {copied ? <><CheckCircle className="h-4 w-4" /> Link Copied</> : <><Plus className="h-4 w-4" /> Copy Invite Link</>}
            </button>
          )}
        </div>
      </div>

      {/* Email invitation panel */}
      <div className="bg-white border border-[#e5e7eb] rounded-xl p-6 shadow-sm mb-8">
        <h3 className="font-bold text-[#0a0a0a] flex items-center gap-2 mb-1">
          <Mail className="h-4 w-4 text-[#16a34a]" /> Invite a Doctor by Email
        </h3>
        <p className="text-sm text-[#6b7280] mb-4">
          Email invitations auto-link the doctor on signup (no approval needed) — only send them to people you&apos;ve already vetted.
        </p>
        <form onSubmit={sendInvite} className="flex flex-col sm:flex-row gap-3">
          <Input
            id="inviteEmail"
            type="email"
            placeholder="doctor@example.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            required
            className="flex-1"
          />
          <Button type="submit" loading={inviteSending} className="whitespace-nowrap">
            <Send className="h-4 w-4 mr-2" /> Send Invitation
          </Button>
        </form>
        {inviteError && <p className="text-sm text-red-600 mt-2">{inviteError}</p>}
        {lastInviteLink && (
          <div className="mt-4 p-3 bg-[#f0fdf4] border border-[#bbf7d0] rounded-lg flex items-center justify-between gap-3">
            <code className="text-xs text-[#15803d] truncate flex-1">{lastInviteLink}</code>
            <button
              onClick={() => copyInviteLink(lastInviteLink)}
              className="text-xs font-bold text-[#16a34a] hover:underline whitespace-nowrap"
            >
              {lastInviteLinkCopied ? "Copied!" : "Copy link"}
            </button>
          </div>
        )}
      </div>

      {/* Pending join requests */}
      <Section
        title="Pending Join Requests"
        icon={<Clock className="h-4 w-4 text-[#f59e0b]" />}
        count={requests.length}
        emptyText="No doctors are waiting for approval."
      >
        {requests.length > 0 && (
          <table className="w-full">
            <thead>
              <tr className="bg-[#f9fafb] text-left border-b border-[#f3f4f6]">
                <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase">Doctor</th>
                <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase">Specialty</th>
                <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase">Email</th>
                <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase">Requested</th>
                <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f3f4f6]">
              {requests.map((r) => (
                <tr key={r.id} className="hover:bg-[#f9fafb]">
                  <td className="px-6 py-4 text-sm font-bold text-[#0a0a0a]">{r.doctor?.full_name || "(unknown)"}</td>
                  <td className="px-6 py-4 text-sm text-[#6b7280]">{r.doctor?.doctor_specialty || "—"}</td>
                  <td className="px-6 py-4 text-sm text-[#6b7280]">{r.doctor?.contact_email || "—"}</td>
                  <td className="px-6 py-4 text-sm text-[#6b7280]">{new Date(r.created_at).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => decideRequest(r.id, "approve")}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#f0fdf4] text-[#16a34a] hover:bg-[#16a34a] hover:text-white border border-[#bbf7d0] transition-all"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => decideRequest(r.id, "reject")}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-50 text-red-600 hover:bg-red-600 hover:text-white border border-red-200 transition-all"
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Active invitations */}
      <Section
        title="Outstanding Invitations"
        icon={<Mail className="h-4 w-4 text-[#6b7280]" />}
        count={invitations.filter((i) => i.status === "pending").length}
        emptyText="No outstanding invitations."
      >
        {invitations.length > 0 && (
          <table className="w-full">
            <thead>
              <tr className="bg-[#f9fafb] text-left border-b border-[#f3f4f6]">
                <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase">Email</th>
                <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase">Status</th>
                <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase">Expires</th>
                <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f3f4f6]">
              {invitations.map((inv) => (
                <tr key={inv.id} className="hover:bg-[#f9fafb]">
                  <td className="px-6 py-4 text-sm font-bold text-[#0a0a0a]">{inv.invited_email}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                      inv.status === "pending" ? "bg-amber-50 text-amber-700" :
                      inv.status === "accepted" ? "bg-green-50 text-green-700" :
                      "bg-gray-100 text-gray-500"
                    }`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-[#6b7280]">{new Date(inv.expires_at).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-right">
                    {inv.status === "pending" ? (
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => copyInviteLink(`${window.location.origin}/signup?invite=${inv.token}`)}
                          className="text-xs font-bold text-[#16a34a] hover:underline"
                        >
                          Copy link
                        </button>
                        <button
                          onClick={() => revokeInvite(inv.id)}
                          className="text-xs font-bold text-red-500 hover:underline flex items-center gap-1"
                        >
                          <XCircle className="h-3 w-3" /> Revoke
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-[#9ca3af]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Active roster */}
      <Section
        title="Approved Doctors"
        icon={<Users className="h-4 w-4 text-[#16a34a]" />}
        count={doctors.length}
        emptyText="No doctors linked yet. Send an invite or share your code above."
      >
        {loading ? (
          <div className="animate-pulse p-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-4 bg-[#f3f4f6] rounded w-full mb-3"></div>
            ))}
          </div>
        ) : doctors.length > 0 ? (
          <table className="w-full">
            <thead>
              <tr className="bg-[#f9fafb] text-left border-b border-[#f3f4f6]">
                <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase">Doctor Name</th>
                <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase">Specialty</th>
                <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase">Email</th>
                <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f3f4f6]">
              {doctors.map((doctor) => (
                <tr key={doctor.id} className="hover:bg-[#f9fafb]">
                  <td className="px-6 py-4 text-sm font-bold text-[#0a0a0a]">{doctor.full_name}</td>
                  <td className="px-6 py-4 text-sm text-[#6b7280]">{doctor.doctor_specialty || "General"}</td>
                  <td className="px-6 py-4 text-sm text-[#6b7280]">{doctor.contact_email || "N/A"}</td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => removeDoctor(doctor.id)}
                      className="text-red-500 hover:text-red-700 text-sm font-medium flex items-center justify-end gap-1 ml-auto"
                    >
                      <Trash2 className="h-4 w-4" /> Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </Section>
    </div>
  );
}

function Section({
  title,
  icon,
  count,
  emptyText,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  emptyText: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm overflow-hidden mb-8">
      <div className="px-6 py-4 border-b border-[#f3f4f6] flex items-center gap-2">
        {icon}
        <h2 className="font-bold text-[#0a0a0a]">{title}</h2>
        <span className="ml-2 px-2 py-0.5 rounded-full bg-[#f3f4f6] text-xs font-bold text-[#6b7280]">{count}</span>
      </div>
      {count === 0 ? (
        <div className="p-10 text-center text-sm text-[#9ca3af]">{emptyText}</div>
      ) : (
        children
      )}
    </div>
  );
}
