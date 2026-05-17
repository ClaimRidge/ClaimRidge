"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import { formatRelativeTime } from "@/lib/utils/format";
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  AlertTriangle,
  FileText,
  User,
  Building2,
  Clock,
  BrainCircuit,
  Stethoscope,
  Zap,
  X,
} from "lucide-react";

interface PreAuthRequest {
  id: string;
  reference_number: string;
  provider_name: string;
  patient_name: string;
  patient_id: string;
  claim_amount: number;
  status: string;
  priority?: string | null;
  sla_deadline: string;
  created_at: string;
  diagnosis_codes?: string[] | null;
  procedure_codes?: string[] | null;
  diagnosis_code?: string | null;
  procedure_code?: string | null;
  // Authorisation window stamped onto the reference on approval
  valid_until?: string | null;
  approved_procedures?: string[] | null;
  issued_at?: string | null;
}

interface PreAuthDocument {
  id: string;
  file_name: string;
  file_type: string;
  extracted_text: string;
  file_base64?: string;
}

const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  processing: { label: "Processing", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  pending: { label: "Awaiting Review", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  approved: { label: "Approved", cls: "bg-green-100 text-green-700 border-green-200" },
  denied: { label: "Denied", cls: "bg-red-100 text-red-700 border-red-200" },
};

function slaInfo(deadlineIso: string | null | undefined) {
  if (!deadlineIso) return null;
  const diffH = (new Date(deadlineIso).getTime() - Date.now()) / 3_600_000;
  if (diffH < 0) return { text: "SLA overdue", cls: "bg-red-50 text-red-600 border-red-200" };
  if (diffH < 24) return { text: `${Math.floor(diffH)}h to SLA`, cls: "bg-red-50 text-red-600 border-red-200" };
  if (diffH < 72) return { text: `${Math.floor(diffH / 24)}d ${Math.floor(diffH % 24)}h to SLA`, cls: "bg-amber-50 text-amber-600 border-amber-200" };
  return { text: `${Math.floor(diffH / 24)}d to SLA`, cls: "bg-[#f0fdf4] text-[#16a34a] border-[#bbf7d0]" };
}

export default function PreAuthReviewPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();

  const [request, setRequest] = useState<PreAuthRequest | null>(null);
  const [documents, setDocuments] = useState<PreAuthDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [activeDoc, setActiveDoc] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"visual" | "text">("visual");
  const [modal, setModal] = useState<"approve" | "deny" | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [activeBlobUrl, setActiveBlobUrl] = useState<string | null>(null);

  // Generate a robust Blob URL for PDF documents to prevent browser data-URI security blocks.
  useEffect(() => {
    if (!activeDoc) {
      setActiveBlobUrl(null);
      return;
    }
    const doc = documents.find(d => d.id === activeDoc);
    if (!doc || !doc.file_base64 || doc.file_type !== "application/pdf") {
      setActiveBlobUrl(null);
      return;
    }

    try {
      const byteCharacters = atob(doc.file_base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      setActiveBlobUrl(url);

      return () => {
        URL.revokeObjectURL(url);
      };
    } catch (e) {
      console.error("Failed to generate PDF blob URL:", e);
      setActiveBlobUrl(null);
    }
  }, [activeDoc, documents]);

  // `pre_auth_requests` has no RLS read policy, so a direct browser query
  // returns zero rows (406). Go through the backend, which runs with the
  // service role and tenant-checks the request against the caller's insurer.
  const fetchDetail = useCallback(async (): Promise<
    { request: PreAuthRequest; documents: PreAuthDocument[] } | null
  > => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/pre-auth/${params.id}`,
      { headers: { Authorization: `Bearer ${session.access_token}` } },
    );
    if (!res.ok) return null;
    return res.json();
  }, [params.id, supabase]);

  useEffect(() => {
    (async () => {
      const data = await fetchDetail();
      if (!data?.request) {
        setError("Pre-Authorisation request not found.");
        setLoading(false);
        return;
      }
      setRequest(data.request);
      setDocuments(data.documents || []);
      if (data.documents && data.documents.length > 0) setActiveDoc(data.documents[0].id);
      setLoading(false);
    })();
  }, [fetchDetail]);

  const handleDecision = async () => {
    if (!modal || !request) return;
    setSubmitting(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      // Backend records the decision, activates/revokes the authorisation,
      // and writes the immutable audit event.
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/pre-auth/${request.id}/review`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ action: modal, reason }),
      });

      if (!res.ok) throw new Error("Failed to submit decision");

      // Re-fetch so the activated authorisation (validity window, approved
      // scope) is reflected in the panel.
      const refreshed = await fetchDetail();
      if (refreshed?.request) setRequest(refreshed.request);
      setModal(null);
      setReason("");
    } catch (err) {
      console.error(err);
      alert("An error occurred while submitting your decision.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh]">
        <div className="animate-spin h-8 w-8 border-4 border-[#16a34a] border-t-transparent rounded-full mb-4" />
        <p className="text-[#9ca3af] text-sm animate-pulse">Loading clinical case file...</p>
      </div>
    );
  }

  if (error || !request) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-bold text-red-600 mb-2">Error</h2>
        <p className="text-gray-600 mb-4">{error}</p>
        <Button onClick={() => router.back()}>Go Back</Button>
      </div>
    );
  }

  const isDecided = request.status === "approved" || request.status === "denied";
  const statusPill = STATUS_PILL[request.status] || { label: request.status, cls: "bg-gray-100 text-gray-600 border-gray-200" };
  const sla = isDecided ? null : slaInfo(request.sla_deadline);
  const expedited = (request.priority || "").toLowerCase().startsWith("exp");

  // Clinical codes — prefer the structured arrays, fall back to the singular columns.
  const dxCodes = ((request.diagnosis_codes && request.diagnosis_codes.length
    ? request.diagnosis_codes
    : request.diagnosis_code ? [request.diagnosis_code] : []
  ).filter(Boolean)) as string[];
  const pxCodes = ((request.procedure_codes && request.procedure_codes.length
    ? request.procedure_codes
    : request.procedure_code ? [request.procedure_code] : []
  ).filter(Boolean)) as string[];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-[#9ca3af] hover:text-[#0A1628] transition-all hover:scale-110">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-sans text-xl sm:text-3xl font-bold text-[#0a0a0a] tracking-tight font-mono">
              {request.reference_number}
            </h1>
            <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest border ${statusPill.cls}`}>
              {statusPill.label}
            </span>
            {expedited && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-orange-50 text-orange-600 border border-orange-200">
                <Zap className="h-3 w-3" /> Expedited
              </span>
            )}
            {sla && (
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${sla.cls}`}>
                <Clock className="h-3 w-3" /> {sla.text}
              </span>
            )}
          </div>
          <p className="text-sm text-[#9ca3af] mt-1 font-medium">
            Received {formatRelativeTime(request.created_at)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* LEFT COLUMN: Clinical Evidence */}
        <div className="lg:col-span-2 flex flex-col gap-6">

          {/* Patient / Provider / Clinical codes */}
          <div className="bg-white border border-[#e5e7eb] rounded-xl p-5 shadow-sm grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div>
              <p className="text-[10px] text-[#9ca3af] uppercase tracking-[0.2em] font-black mb-1.5 flex items-center gap-1.5"><User className="h-3 w-3" /> Patient</p>
              <p className="text-sm font-bold text-[#0a0a0a] font-sans">{request.patient_name}</p>
              <p className="text-[10px] text-[#6b7280] font-mono mt-1 bg-gray-50 px-1.5 py-0.5 rounded w-fit">ID: {request.patient_id}</p>
            </div>
            <div>
              <p className="text-[10px] text-[#9ca3af] uppercase tracking-[0.2em] font-black mb-1.5 flex items-center gap-1.5"><Building2 className="h-3 w-3" /> Provider</p>
              <p className="text-sm font-bold text-[#0a0a0a] font-sans">{request.provider_name}</p>
            </div>
            <div>
              <p className="text-[10px] text-[#9ca3af] uppercase tracking-[0.2em] font-black mb-1.5 flex items-center gap-1.5"><Stethoscope className="h-3 w-3" /> Clinical Codes</p>
              {dxCodes.length === 0 && pxCodes.length === 0 ? (
                <p className="text-xs text-[#9ca3af]">None supplied</p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {dxCodes.map((c) => (
                    <span key={`dx-${c}`} title="Diagnosis" className="font-mono text-[10px] bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded">{c}</span>
                  ))}
                  {pxCodes.map((c) => (
                    <span key={`px-${c}`} title="Procedure" className="font-mono text-[10px] bg-purple-50 text-purple-700 border border-purple-100 px-1.5 py-0.5 rounded">{c}</span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Document Viewer */}
          <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm flex flex-col min-h-[500px]">
            <div className="px-5 py-3 border-b border-[#f3f4f6] flex items-center justify-between overflow-x-auto gap-4">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-[#9ca3af]" />
                <span className="text-sm font-bold text-[#0a0a0a] mr-4 font-sans">Clinical Documents</span>
                <div className="flex gap-1">
                  {documents.map(doc => (
                    <button
                      key={doc.id}
                      onClick={() => setActiveDoc(doc.id)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all whitespace-nowrap ${
                        activeDoc === doc.id ? "bg-[#0A1628] text-white shadow-md" : "bg-[#f3f4f6] text-[#6b7280] hover:bg-[#e5e7eb]"
                      }`}
                    >
                      {doc.file_name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex bg-[#f3f4f6] p-1 rounded-lg border border-[#e5e7eb]">
                <button
                  onClick={() => setViewMode("visual")}
                  className={`px-3 py-1 text-[10px] font-black uppercase tracking-wider rounded-md transition-all ${viewMode === "visual" ? "bg-white text-[#0A1628] shadow-sm" : "text-[#9ca3af] hover:text-[#6b7280]"}`}
                >
                  Visual
                </button>
                <button
                  onClick={() => setViewMode("text")}
                  className={`px-3 py-1 text-[10px] font-black uppercase tracking-wider rounded-md transition-all ${viewMode === "text" ? "bg-white text-[#0A1628] shadow-sm" : "text-[#9ca3af] hover:text-[#6b7280]"}`}
                >
                  Context (Text)
                </button>
              </div>
            </div>
            <div className="p-0 flex-1 overflow-hidden bg-[#fafafa] flex flex-col min-h-[700px]">
              {activeDoc ? (
                (() => {
                  const doc = documents.find(d => d.id === activeDoc);
                  if (!doc) return <div className="p-10 text-center text-gray-500">Document not found.</div>;

                  if (viewMode === "text") {
                    return (
                      <div className="p-8 h-full overflow-y-auto bg-white font-sans">
                        <div className="max-w-3xl mx-auto">
                          <h4 className="text-[10px] uppercase tracking-[0.2em] text-[#9ca3af] mb-6 font-black flex items-center gap-2">
                            <BrainCircuit className="h-3 w-3" /> Extracted Clinical Context
                          </h4>
                          <div className="prose prose-sm prose-slate max-w-none">
                            <div className="whitespace-pre-wrap text-sm leading-relaxed text-[#374151] font-medium bg-gray-50/50 p-6 rounded-xl border border-gray-100">
                              {doc.extracted_text || "No text could be extracted from this document."}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  if (doc.file_base64) {
                    if (doc.file_type === "application/pdf") {
                      if (!activeBlobUrl) {
                        return (
                          <div className="flex flex-col items-center justify-center h-full p-12 text-center flex-1">
                            <div className="animate-spin h-8 w-8 border-4 border-[#0A1628] border-t-transparent rounded-full mb-3 mx-auto" />
                            <p className="text-sm text-gray-500 font-sans">Preparing secure PDF viewer...</p>
                          </div>
                        );
                      }
                      return (
                        <iframe
                          src={`${activeBlobUrl}#toolbar=0&navpanes=0&scrollbar=1`}
                          className="w-full h-full border-0 flex-1"
                          title={doc.file_name}
                        />
                      );
                    } else if (doc.file_type.startsWith("image/")) {
                      return (
                        <div className="w-full h-full flex items-center justify-center p-4 bg-gray-50 overflow-auto">
                          <img
                            src={`data:${doc.file_type};base64,${doc.file_base64}`}
                            alt={doc.file_name}
                            className="max-w-full max-h-full object-contain shadow-xl rounded-lg border border-gray-200"
                          />
                        </div>
                      );
                    }
                  }

                  return (
                    <div className="flex flex-col items-center justify-center h-full p-12 text-center">
                      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                        <FileText className="h-8 w-8 text-gray-400" />
                      </div>
                      <h3 className="text-lg font-bold text-gray-900">Preview Unavailable</h3>
                      <p className="text-sm text-gray-500 mt-2 max-w-sm">
                        The real document ({doc.file_name}) cannot be previewed.
                        Only PDF and Image files are supported for inline viewing.
                      </p>
                    </div>
                  );
                })()
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-[#9ca3af]">
                  <FileText className="h-12 w-12 mb-3 opacity-20" />
                  <p className="text-sm font-medium tracking-wide">Select a document to preview</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Reviewer Decision */}
        <div className="flex flex-col gap-6">

          {/* Reviewer Decision */}
          <div className="bg-white border border-[#e5e7eb] rounded-xl p-5 shadow-sm">
            <h3 className="font-display font-bold text-[#0a0a0a] mb-4">Reviewer Decision</h3>

            {isDecided ? (
              <div className="text-center py-4 space-y-4">
                <div>
                  <div className={`inline-flex items-center justify-center w-12 h-12 rounded-full mb-3 ${request.status === "approved" ? "bg-green-100" : "bg-red-100"}`}>
                    {request.status === "approved" ? <CheckCircle className="h-6 w-6 text-[#16a34a]" /> : <XCircle className="h-6 w-6 text-red-600" />}
                  </div>
                  <p className="font-bold text-[#0a0a0a]">
                    This request was {request.status === "approved" ? "approved" : "denied"}.
                  </p>
                </div>

                {/* Active-authorisation block — visible only on approvals */}
                {request.status === "approved" && (
                  <div className="text-left bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl p-4">
                    <p className="text-[10px] uppercase tracking-widest font-bold text-[#15803d] mb-1">
                      Active Authorisation — Pre-Auth Reference
                    </p>
                    <p className="font-mono text-lg font-bold text-[#0a0a0a] tracking-wider break-all">
                      {request.reference_number}
                    </p>
                    <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-[#15803d] font-bold">Valid Until</p>
                        <p className="font-bold text-[#0a0a0a] mt-0.5">
                          {request.valid_until ? new Date(request.valid_until).toLocaleDateString() : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-[#15803d] font-bold">Issued</p>
                        <p className="font-bold text-[#0a0a0a] mt-0.5">
                          {request.issued_at ? new Date(request.issued_at).toLocaleDateString() : "—"}
                        </p>
                      </div>
                    </div>
                    {request.approved_procedures && request.approved_procedures.length > 0 && (
                      <div className="mt-3">
                        <p className="text-[10px] uppercase tracking-widest text-[#15803d] font-bold mb-1">
                          Approved Scope
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {request.approved_procedures.map((c) => (
                            <span key={c} className="font-mono text-xs bg-white border border-[#bbf7d0] px-2 py-0.5 rounded text-[#15803d]">
                              {c}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <p className="text-[10px] text-[#15803d] mt-3 leading-relaxed">
                      Share this reference with the provider. They must cite it on the claim
                      they file after service to avoid auth-mismatch denials.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-[#6b7280] leading-relaxed">
                  Approve to issue the authorisation, or deny the request. This decision is final and is recorded in the audit trail.
                </p>
                <Button className="w-full gap-2 bg-[#16a34a] hover:bg-[#15803d]" onClick={() => setModal("approve")}>
                  <CheckCircle className="h-4 w-4" /> Approve Request
                </Button>
                <Button className="w-full gap-2 bg-red-600 hover:bg-red-700 text-white" onClick={() => setModal("deny")}>
                  <XCircle className="h-4 w-4" /> Deny Request
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Decision Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setModal(null); setReason(""); }} />
          <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4 animate-in fade-in zoom-in duration-200">
            <button onClick={() => { setModal(null); setReason(""); }} className="absolute top-4 right-4 text-[#9ca3af] hover:text-[#0a0a0a]">
              <X className="h-5 w-5" />
            </button>
            <h3 className={`font-display font-bold text-xl mb-2 ${modal === "approve" ? "text-[#16a34a]" : "text-red-600"}`}>
              {modal === "approve" ? "Approve Pre-Authorisation" : "Deny Pre-Authorisation"}
            </h3>
            <p className="text-sm text-[#6b7280] mb-4">
              You are about to {modal} request <span className="font-mono font-bold text-[#0a0a0a]">{request.reference_number}</span>.
              {modal === "approve" && " This activates the authorisation on the reference above."}
            </p>

            <label className="block text-sm font-medium text-[#374151] mb-1.5">
              Reasoning / Internal Notes {modal === "deny" && <span className="text-red-500">*</span>}
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              placeholder="Enter clinical rationale..."
              className="w-full px-3 py-2 border border-[#e5e7eb] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0A1628] resize-none"
            />

            <div className="flex gap-3 mt-6">
              <Button variant="outline" className="flex-1" onClick={() => { setModal(null); setReason(""); }}>
                Cancel
              </Button>
              <Button
                className={`flex-1 ${modal === "deny" ? "bg-red-600 hover:bg-red-700" : ""}`}
                onClick={handleDecision}
                loading={submitting}
                disabled={modal === "deny" && !reason.trim()}
              >
                Confirm {modal === "approve" ? "Approval" : "Denial"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}