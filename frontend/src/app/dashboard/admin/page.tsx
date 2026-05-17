"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Building2, Stethoscope, Calendar, ShieldCheck, Mail, CheckCircle2, XCircle, Clock } from "lucide-react";

export default function AdminWaitlistPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    fetchWaitlist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchWaitlist = async () => {
    setLoading(true);
    setError("");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Admin session not found. Please log in again.");
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/waitlist`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to load waitlist requests.");
      }
      setRequests(data.requests || []);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred while loading the waitlist.");
    } finally {
      setLoading(false);
    }
  };

  const decideRequest = async (id: string, decision: "approve" | "reject") => {
    if (decision === "reject" && !window.confirm("Reject this application? No account will be created.")) {
      return;
    }
    setError("");
    setActionLoadingId(id);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Admin session not found. Please log in again.");
      }

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/waitlist/${id}/${decision}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.detail || `Failed to ${decision} request.`);
      }

      await fetchWaitlist();
    } catch (err: any) {
      setError(err.message || `An unexpected error occurred during ${decision}.`);
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* 
        Removed the custom <header> here to prevent the duplicate Navbar issue,
        as the global <Navbar /> already handles routing, logo, and sign-out beautifully.
      */}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Access Management</h1>
            <p className="text-gray-500 mt-2 text-sm max-w-2xl leading-relaxed">
              Review and verify pending organizations applying for ClaimRidge enterprise access. 
              Only approved facilities will have active accounts and routing profiles created.
            </p>
          </div>
          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl border border-gray-200 shadow-sm">
            <Clock className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-semibold text-gray-700">{requests.length} Pending</span>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl mb-8 border border-red-200 text-sm font-medium flex items-center gap-2">
            <XCircle className="h-5 w-5" />
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-gray-200 border-t-[#16a34a] rounded-full animate-spin mb-4"></div>
            <p className="text-gray-500 font-medium animate-pulse">Syncing active applications...</p>
          </div>
        ) : requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 bg-white rounded-2xl border border-gray-200 shadow-sm">
            <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">All Caught Up!</h3>
            <p className="text-gray-500 text-sm">There are no pending waitlist applications to review.</p>
          </div>
        ) : (
          <div className="bg-white shadow-sm rounded-2xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead>
                  <tr className="bg-gray-50/50">
                    <th className="px-6 py-5 text-left text-[11px] font-bold text-gray-400 uppercase tracking-widest">Organization Identity</th>
                    <th className="px-6 py-5 text-left text-[11px] font-bold text-gray-400 uppercase tracking-widest">Credentials</th>
                    <th className="px-6 py-5 text-left text-[11px] font-bold text-gray-400 uppercase tracking-widest">Type</th>
                    <th className="px-6 py-5 text-left text-[11px] font-bold text-gray-400 uppercase tracking-widest">Submitted Date</th>
                    <th className="px-6 py-5 text-right text-[11px] font-bold text-gray-400 uppercase tracking-widest">Decision</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {requests.map((req) => {
                    const isIns = req.account_type === "insurance";
                    const orgName = isIns
                      ? req.details?.companyNameEn || "Unknown Insurer"
                      : req.details?.legalNameEn || "Unknown Provider";

                    const license = isIns
                      ? `CBJ License: ${req.details?.cbjLicense || "N/A"}`
                      : `Facility License: ${req.details?.licenseNumber || "N/A"}`;

                    const busy = actionLoadingId !== null;
                    const isRowBusy = actionLoadingId === req.id;

                    return (
                      <tr 
                        key={req.id} 
                        className={`transition-colors duration-200 hover:bg-gray-50/80 ${isRowBusy ? 'opacity-50' : ''}`}
                      >
                        <td className="px-6 py-5 whitespace-nowrap">
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                              isIns ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'
                            }`}>
                              {isIns ? <Building2 className="h-5 w-5" /> : <Stethoscope className="h-5 w-5" />}
                            </div>
                            <div>
                              <div className="font-bold text-gray-900 text-sm">{orgName}</div>
                              <div className="text-xs text-gray-500 mt-1 flex items-center gap-1.5 font-medium">
                                <ShieldCheck className="h-3.5 w-3.5 text-gray-400" />
                                {license}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5 whitespace-nowrap">
                          <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                            <Mail className="h-4 w-4 text-gray-400" />
                            {req.email}
                          </div>
                          <div className="text-[11px] text-gray-400 flex items-center gap-1 mt-1.5 font-mono bg-gray-100 w-max px-2 py-0.5 rounded-full">
                            Password secured &middot; Hash hidden
                          </div>
                        </td>
                        <td className="px-6 py-5 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold tracking-wide ${
                            isIns ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'
                          }`}>
                            {req.account_type.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-6 py-5 whitespace-nowrap text-sm text-gray-500 font-medium">
                          {new Date(req.created_at).toLocaleDateString(undefined, { 
                            year: 'numeric', 
                            month: 'short', 
                            day: 'numeric' 
                          })}
                        </td>
                        <td className="px-6 py-5 whitespace-nowrap text-right text-sm">
                          <div className="flex items-center justify-end gap-3">
                            <button
                              onClick={() => decideRequest(req.id, "reject")}
                              disabled={busy}
                              className="text-gray-500 hover:text-red-600 font-semibold text-xs px-2 py-1.5 transition-colors disabled:opacity-50"
                            >
                              Reject
                            </button>
                            <button
                              onClick={() => decideRequest(req.id, "approve")}
                              disabled={busy}
                              className="text-white hover:bg-emerald-700 bg-emerald-600 px-5 py-2 rounded-xl transition-all shadow-sm shadow-emerald-600/20 font-bold text-xs disabled:opacity-50 flex items-center gap-2"
                            >
                              {isRowBusy ? (
                                <>
                                  <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                  Processing...
                                </>
                              ) : (
                                "Approve & Open Account"
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
