"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  Users,
  Building2,
  Trash2,
  ArrowLeft,
  CheckCircle,
  Plus,
  Clock,
  ChevronDown,
  ChevronRight,
  Mail,
  Stethoscope,
  IdCard,
  MessageSquare,
  Calendar,
} from "lucide-react";

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

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "";

export default function StaffManagementPage() {
  const supabase = createClient();
  const [authHeader, setAuthHeader] = useState<string>("");
  const [orgCode, setOrgCode] = useState("");
  const [doctors, setDoctors] = useState<DoctorProfile[]>([]);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null);

  const authedFetch = useCallback(
    async (path: string, init?: RequestInit) => {
      return fetch(`${BACKEND}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
          ...(init?.headers || {}),
        },
      });
    },
    [authHeader]
  );

  const refresh = useCallback(async () => {
    if (!authHeader) return;
    const [docsRes, reqRes] = await Promise.all([
      authedFetch("/api/providers/doctors"),
      authedFetch("/api/providers/join-requests?status=pending"),
    ]);
    if (docsRes.ok) setDoctors(await docsRes.json());
    if (reqRes.ok) setRequests(await reqRes.json());
  }, [authHeader, authedFetch]);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const auth = `Bearer ${session.access_token}`;
      setAuthHeader(auth);

      const orgRes = await fetch(`${BACKEND}/api/providers/me`, {
        headers: { Authorization: auth },
      });
      if (orgRes.ok) {
        const org = await orgRes.json();
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

  const copyOrgLink = () => {
    if (!orgCode) return;
    const link = `${window.location.origin}/signup?role=doctor&org=${orgCode}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
          <p className="text-[#9ca3af] text-sm">Share your code, approve join requests, manage your roster.</p>
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
                <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase w-8"></th>
                <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase">Doctor</th>
                <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase">Specialty</th>
                <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase">Email</th>
                <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase">Requested</th>
                <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f3f4f6]">
              {requests.map((r) => {
                const isOpen = expandedRequestId === r.id;
                return (
                  <Fragment key={r.id}>
                    <tr
                      className={`cursor-pointer transition-colors ${isOpen ? "bg-[#f9fafb]" : "hover:bg-[#f9fafb]"}`}
                      onClick={() => setExpandedRequestId(isOpen ? null : r.id)}
                    >
                      <td className="px-6 py-4 text-[#9ca3af]">
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-[#0a0a0a]">
                        <div className="flex items-center gap-2">
                          {r.doctor?.full_name || "(unknown)"}
                          {r.message && (
                            <MessageSquare className="h-3 w-3 text-[#16a34a]" aria-label="Includes a message" />
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-[#6b7280]">{r.doctor?.doctor_specialty || "—"}</td>
                      <td className="px-6 py-4 text-sm text-[#6b7280]">{r.doctor?.contact_email || "—"}</td>
                      <td className="px-6 py-4 text-sm text-[#6b7280]">{new Date(r.created_at).toLocaleDateString()}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
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
                    {isOpen && (
                      <tr className="bg-[#fafbfc]">
                        <td colSpan={6} className="px-6 py-5">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                            <DetailField icon={Users} label="Full Name" value={r.doctor?.full_name} />
                            <DetailField icon={Stethoscope} label="Specialty" value={r.doctor?.doctor_specialty} />
                            <DetailField icon={Mail} label="Email" value={r.doctor?.contact_email} mono />
                            <DetailField icon={IdCard} label="Medical License" value={r.doctor?.doctor_license_number} mono />
                            <DetailField icon={Calendar} label="Requested On" value={new Date(r.created_at).toLocaleString()} />
                          </div>
                          <div className="mt-5 pt-5 border-t border-[#e5e7eb]">
                            <div className="flex items-start gap-2.5">
                              <MessageSquare className="h-4 w-4 text-[#16a34a] flex-shrink-0 mt-0.5" />
                              <div className="flex-1">
                                <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest mb-1.5">
                                  Message from doctor
                                </p>
                                {r.message ? (
                                  <p className="text-sm text-[#0a0a0a] leading-relaxed bg-white border border-[#e5e7eb] rounded-lg px-4 py-3 whitespace-pre-wrap">
                                    {r.message}
                                  </p>
                                ) : (
                                  <p className="text-sm text-[#9ca3af] italic">No message attached to this request.</p>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>

      {/* Active roster */}
      <Section
        title="Approved Doctors"
        icon={<Users className="h-4 w-4 text-[#16a34a]" />}
        count={doctors.length}
        emptyText="No doctors linked yet. Share your code above to bring them in."
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

function DetailField({
  icon: Icon,
  label,
  value,
  mono = false,
}: {
  icon: React.ElementType;
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="h-4 w-4 text-[#9ca3af] flex-shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest mb-0.5">{label}</p>
        <p className={`text-sm text-[#0a0a0a] ${mono ? "font-mono" : ""} ${value ? "" : "text-[#9ca3af] italic"}`}>
          {value || "—"}
        </p>
      </div>
    </div>
  );
}
