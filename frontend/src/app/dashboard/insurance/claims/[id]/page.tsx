"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { InsurerClaim, ClaimFlag, MedicalNecessity } from "@/types/insurer";
import AiAnalysisPanel from "@/components/insurer/AiAnalysisPanel";
import ClaimDecisionActions from "@/components/insurer/ClaimDecisionActions";
import ClaimStatusPill from "@/components/insurer/ClaimStatusPill";
import AdjudicationPanel, { type Adjudication } from "@/components/insurer/AdjudicationPanel";
import MedicalNecessityPanel from "@/components/insurer/MedicalNecessityPanel";
import Button from "@/components/ui/Button";
import { formatJod, formatDateJO, maskNationalId, computeAge } from "@/lib/utils/format";
import {
  ArrowLeft,
  XCircle,
  User,
  FileText,
  Calendar,
  DollarSign,
  Building2,
  Hash,
  Clock,
  Paperclip,
  BrainCircuit,
} from "lucide-react";

function DetailRow({ label, value, icon: Icon }: { label: string; value: string; icon: React.ElementType }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon className="h-4 w-4 text-[#9ca3af] mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-xs text-[#9ca3af] uppercase tracking-wider">{label}</p>
        <p className="text-sm font-medium text-[#0a0a0a]">{value}</p>
      </div>
    </div>
  );
}

export default function InsurerClaimDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [claim, setClaim] = useState<InsurerClaim | null>(null);
  const [flags, setFlags] = useState<ClaimFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const supabase = createClient();
  const [generatingAi, setGeneratingAi] = useState(false);
  const [adjudication, setAdjudication] = useState<Adjudication | null>(null);
  const [adjudicating, setAdjudicating] = useState(false);

  // Authorization linkage state (lives outside InsurerClaim so we don't need to
  // expand the shared type for this page only).
  const [authMeta, setAuthMeta] = useState<{
    pre_auth_number: string | null;
    auth_check_status: string | null;
    auth_check_detail: string | null;
    pre_auth_id: string | null;
  }>({ pre_auth_number: null, auth_check_status: null, auth_check_detail: null, pre_auth_id: null });

  // Document Viewer states for claim's linked pre-auth supporting documents
  const [documents, setDocuments] = useState<any[]>([]);
  const [activeDoc, setActiveDoc] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"visual" | "text">("visual");
  const [activeBlobUrl, setActiveBlobUrl] = useState<string | null>(null);

  // Fetch the pre-authorization documents if this claim is linked to one
  useEffect(() => {
    if (!authMeta.pre_auth_id) {
      setDocuments([]);
      setActiveDoc(null);
      return;
    }
    const fetchPreAuthDocs = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/pre-auth/${authMeta.pre_auth_id}`,
          { headers: { Authorization: `Bearer ${session.access_token}` } }
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data.documents) {
          setDocuments(data.documents);
          if (data.documents.length > 0) {
            setActiveDoc(data.documents[0].id);
          }
        }
      } catch (err) {
        console.error("Failed to fetch pre-auth documents for claim:", err);
      }
    };
    fetchPreAuthDocs();
  }, [authMeta.pre_auth_id, supabase]);

  // Generate a robust Blob URL for PDF documents to prevent browser data-URI security blocks.
  useEffect(() => {
    if (!activeDoc) {
      setActiveBlobUrl(null);
      return;
    }
    const doc = documents.find((d: any) => d.id === activeDoc);
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

  // Generates the advisory AI Medical Necessity Review. The backend assembles
  // the clinical context (code descriptions, notes, linked pre-auth documents,
  // payer-policy RAG) and returns the structured verdict.
  const handleGenerateRecommendation = async () => {
    if (!claim) return;
    setGeneratingAi(true);
    try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/insurer/claims/${claim.id}/analyze`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${session?.access_token}` }
        });

        if (!res.ok) throw new Error("Failed to generate the clinical review");

        const data = await res.json();
        if (data.medical_necessity) {
            setClaim({ ...claim, medical_necessity: data.medical_necessity as MedicalNecessity });
        }
    } catch (err) {
        console.error(err);
    } finally {
        setGeneratingAi(false);
    }
  };

  // Calls the backend adjudicator. `force` re-runs even if a verdict is cached.
  const runAdjudication = async (force: boolean) => {
    setAdjudicating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/insurer/claims/${params.id}/adjudicate${force ? "?force=true" : ""}`,
        { method: "POST", headers: { Authorization: `Bearer ${session?.access_token}` } }
      );
      if (!res.ok) throw new Error("Adjudication request failed");
      const data = await res.json();
      if (data.adjudication && Object.keys(data.adjudication).length > 0) {
        setAdjudication(data.adjudication as Adjudication);
        if (data.status) {
          setClaim((prev) => (prev ? { ...prev, status: data.status } : prev));
        }
      }
    } catch (err) {
      console.error("Adjudication error:", err);
    } finally {
      setAdjudicating(false);
    }
  };

  useEffect(() => {
    const fetchClaim = async () => {
      const { data: claimData, error: claimErr } = await supabase
        .from("claims")
        .select("*")
        .eq("id", params.id)
        .maybeSingle();

      if (claimErr || !claimData) {
        setError("Claim not found");
        setLoading(false);
        return;
      }

      const mappedClaim: InsurerClaim = {
        id: claimData.id,
        claim_number: claimData.claim_number,
        clinic_id: claimData.clinic_id || null,
        clinic_name: claimData.provider_name || 'Unknown Clinic',
        insurer_id: claimData.payer_id,
        patient_name: claimData.patient_name,
        patient_national_id: claimData.patient_id,
        patient_dob: null, 
        patient_gender: null,
        diagnosis_codes: claimData.diagnosis_codes || [],
        diagnosis_description: null,
        procedure_codes: claimData.procedure_codes || [],
        procedure_description: claimData.notes || '',
        service_date: claimData.date_of_service,
        amount_jod: Number(claimData.total_billed),
        status: (["submitted", "intake_complete"].includes(claimData.status) ? "pending" : claimData.status) as any,
        submitted_at: claimData.created_at,
        decided_at: claimData.status === 'approved' || claimData.status === 'rejected' ? claimData.updated_at : undefined,
        decided_by: null,
        decision_reason: claimData.notes || null,
        ai_risk_score: claimData.ai_risk_score,
        ai_recommendation: claimData.ai_recommendation || null,
        medical_necessity: (claimData.medical_necessity as MedicalNecessity) || null,
        created_at: claimData.created_at,
        updated_at: claimData.updated_at || claimData.created_at,
      };
      
      setClaim(mappedClaim);
      setAuthMeta({
        pre_auth_number: claimData.pre_auth_number || null,
        auth_check_status: claimData.auth_check_status || null,
        auth_check_detail: claimData.auth_check_detail || null,
        pre_auth_id: claimData.pre_auth_id || null,
      });

      // 3. Extract the AI flags directly from the JSON column!
      let extractedFlags: ClaimFlag[] = [];
      if (claimData.scrub_result && claimData.scrub_result.issues) {
          extractedFlags = claimData.scrub_result.issues.map((issue: any, index: number) => {
              // Map backend severity ("error", "warning", "info") to frontend ("high", "medium", "low")
              let mappedSeverity: "high" | "medium" | "low" = "low";
              if (issue.severity === "error") mappedSeverity = "high";
              if (issue.severity === "warning") mappedSeverity = "medium";

              return {
                  id: `flag-${index}`,
                  claim_id: claimData.id,
                  flag_type: "code_mismatch",
                  severity: mappedSeverity,
                  title: issue.field ? `Issue detected in: ${issue.field}` : "Claim Data Issue",
                  explanation: issue.message || "Unknown issue detected.",
                  evidence: issue.suggestion ? { suggested_fix: issue.suggestion } : null,
                  created_at: claimData.created_at
              };
          });
      }

      setFlags(extractedFlags);

      // Automatic adjudication: show the cached verdict if one exists, otherwise
      // run it now — first open of a routed claim that has not been decided yet.
      if (claimData.adjudication) {
        setAdjudication(claimData.adjudication as Adjudication);
      } else if (
        claimData.payer_id &&
        !claimData.adjudicated_at &&
        ["submitted", "intake_complete", "pending", "under_review"].includes(claimData.status)
      ) {
        runAdjudication(false);
      }

      setLoading(false);
    };

    fetchClaim();
  }, [params.id]);

const handleDecision = async (action: "approved" | "rejected" | "needs_info", reason: string) => {
    if (!claim) return;
    
    try {
        const { data: { session } } = await supabase.auth.getSession();
        
        // 1. Call our secure Python backend API
        const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/insurer/review-claim`, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${session?.access_token}`
            },
            body: JSON.stringify({
                claim_id: claim.id,
                action: action,
                reason: reason || claim.procedure_description
            })
        });

        if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.detail || "Failed to update claim status");
        }

        // 2. Optimistically update the UI so the user sees the change instantly
        setClaim({
            ...claim,
            status: action,
            decision_reason: reason,
            decided_at: new Date().toISOString()
        });

    } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update claim status");
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 text-center">
        <div className="animate-spin h-8 w-8 border-4 border-[#0A1628] border-t-transparent rounded-full mx-auto mb-3" />
        <p className="text-[#9ca3af] text-sm">Loading claim...</p>
      </div>
    );
  }

  if (error && !claim) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 text-center">
        <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h1 className="font-display text-xl font-bold text-[#0a0a0a] mb-2">Claim Not Found</h1>
        <p className="text-[#6b7280] mb-6">{error}</p>
        <Link href="/insurer/claims">
          <Button variant="outline">Back to Claims</Button>
        </Link>
      </div>
    );
  }

  if (!claim) return null;

  const age = computeAge(claim.patient_dob);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.back()}
          className="text-[#9ca3af] hover:text-[#0A1628] transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-xl sm:text-2xl font-bold text-[#0a0a0a] tracking-tight">
              {claim.claim_number}
            </h1>
            <ClaimStatusPill status={claim.status} />
          </div>
          <p className="text-sm text-[#9ca3af] mt-0.5">
            {claim.clinic_name} &middot; Submitted {formatDateJO(claim.submitted_at)}
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 border border-red-200 mb-6">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column — Evidence & Details (2/3) */}
        <div className="lg:col-span-2 space-y-6">
          {/* AI Medical Necessity Review — advisory clinical input */}
          <MedicalNecessityPanel
            review={claim.medical_necessity}
            loading={generatingAi}
            onGenerate={handleGenerateRecommendation}
          />

          {/* Claim & Patient Overview */}
          <div className="bg-white border border-[#e5e7eb] rounded-xl p-6 shadow-sm">
            <h2 className="font-display font-bold text-[#0a0a0a] mb-4 flex items-center gap-2">
              <User className="h-4 w-4 text-[#9ca3af]" />
              Claim Overview
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-4">
              <div>
                <DetailRow label="Patient Name" value={claim.patient_name} icon={User} />
                <DetailRow
                  label="National ID"
                  value={maskNationalId(claim.patient_national_id)}
                  icon={Hash}
                />
              </div>
              <div>
                <DetailRow label="Clinic / Provider" value={claim.clinic_name} icon={Building2} />
                <DetailRow label="Service Date" value={formatDateJO(claim.service_date)} icon={Calendar} />
              </div>
            </div>
          </div>

          {/* Clinical Details (Codes) */}
          <div className="bg-white border border-[#e5e7eb] rounded-xl p-6 shadow-sm">
            <h2 className="font-display font-bold text-[#0a0a0a] mb-6 flex items-center gap-2">
              <FileText className="h-4 w-4 text-[#9ca3af]" />
              Diagnosis & Procedures
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <p className="text-xs text-[#9ca3af] uppercase tracking-wider mb-3 font-semibold">
                  Diagnosis Codes (ICD-10)
                </p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {claim.diagnosis_codes.map((code, i) => (
                    <span key={i} className="px-2.5 py-1 bg-blue-50 border border-blue-100 rounded text-xs font-mono text-blue-700">
                      {code}
                    </span>
                  ))}
                </div>
                {claim.diagnosis_description && (
                  <p className="text-sm text-[#4b5563] leading-relaxed">{claim.diagnosis_description}</p>
                )}
              </div>
              <div>
                <p className="text-xs text-[#9ca3af] uppercase tracking-wider mb-3 font-semibold">
                  Procedure Codes (CPT)
                </p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {claim.procedure_codes.map((code, i) => (
                    <span key={i} className="px-2.5 py-1 bg-emerald-50 border border-emerald-100 rounded text-xs font-mono text-emerald-700">
                      {code}
                    </span>
                  ))}
                </div>
                {claim.procedure_description && (
                  <p className="text-sm text-[#4b5563] leading-relaxed">{claim.procedure_description}</p>
                )}
              </div>
            </div>
          </div>

          {/* Supporting Documents */}
          <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm flex flex-col min-h-[500px]">
            <div className="px-5 py-3 border-b border-[#f3f4f6] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2 overflow-x-auto py-1">
                <FileText className="h-4 w-4 text-[#9ca3af]" />
                <span className="text-sm font-bold text-[#0a0a0a] mr-4 font-sans whitespace-nowrap">Supporting Documents</span>
                <div className="flex gap-1 flex-wrap">
                  {documents.map((doc) => (
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

              {documents.length > 0 && (
                <div className="flex bg-[#f3f4f6] p-1 rounded-lg border border-[#e5e7eb] self-end sm:self-auto">
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
              )}
            </div>

            <div className="p-0 flex-1 overflow-hidden bg-[#fafafa] flex flex-col min-h-[500px] rounded-b-xl justify-center">
              {documents.length === 0 ? (
                <div className="p-12 text-center max-w-md mx-auto">
                  <div className="w-12 h-12 bg-gray-50 border border-gray-100 rounded-xl flex items-center justify-center mb-4 mx-auto shadow-sm">
                    <FileText className="h-6 w-6 text-gray-400" />
                  </div>
                  <h3 className="text-sm font-bold text-[#0a0a0a] mb-1 font-sans">No Supporting Documents</h3>
                  <p className="text-xs text-gray-500 leading-relaxed font-sans">
                    {authMeta.pre_auth_number ? (
                      `This claim is linked to Pre-Authorization ${authMeta.pre_auth_number}, but no clinical evidence documents were attached to the request.`
                    ) : (
                      "No prospective pre-authorization is linked to this claim, so no clinical evidence documents are automatically attached."
                    )}
                  </p>
                </div>
              ) : activeDoc ? (
                (() => {
                  const doc = documents.find((d: any) => d.id === activeDoc);
                  if (!doc) return <div className="p-10 text-center text-gray-500 font-sans text-xs">Document not found.</div>;

                  if (viewMode === "text") {
                    return (
                      <div className="p-8 h-full overflow-y-auto bg-white font-sans flex-1">
                        <div className="max-w-3xl mx-auto">
                          <h4 className="text-[10px] uppercase tracking-[0.2em] text-[#9ca3af] mb-6 font-black flex items-center gap-2">
                            <BrainCircuit className="h-3 w-3" /> Extracted Clinical Context
                          </h4>
                          <div className="prose prose-sm prose-slate max-w-none flex-1">
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
                          className="w-full h-full border-0 flex-1 min-h-[500px]"
                          title={doc.file_name}
                        />
                      );
                    } else if (doc.file_type.startsWith("image/")) {
                      return (
                        <div className="w-full h-full flex items-center justify-center p-4 bg-gray-50 overflow-auto flex-1">
                          <img
                            src={`data:${doc.file_type};base64,${doc.file_base64}`}
                            alt={doc.file_name}
                            className="max-w-full max-h-[600px] object-contain shadow-xl rounded-lg border border-gray-200"
                          />
                        </div>
                      );
                    }
                  }

                  return (
                    <div className="flex flex-col items-center justify-center h-full p-12 text-center flex-1">
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
              ) : null}
            </div>
          </div>
        </div>

        {/* Right Column — Decision & Risk Analysis (1/3) */}
        <div className="space-y-6">
          {/* AI Adjudication verdict — auto-runs on first open */}
          <AdjudicationPanel
            adjudication={adjudication}
            loading={adjudicating}
            onRerun={() => runAdjudication(true)}
          />

          {/* Decision Actions */}
          <ClaimDecisionActions claim={claim} onDecision={handleDecision} />

          {/* Authorization Check */}
          <AuthCheckPanel authMeta={authMeta} />

          {/* Risk Analysis Card */}
          <AiAnalysisPanel claim={claim} flags={flags} />

          {/* Financial Widget */}
          <div className="bg-white border border-[#e5e7eb] rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-[#0a0a0a] mb-4 flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-[#9ca3af]" />
              Financial Summary
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-[#6b7280]">Total Billed</span>
                <span className="text-lg font-bold text-[#0a0a0a]">{formatJod(Number(claim.amount_jod))}</span>
              </div>
              <div className="pt-3 border-t border-[#f3f4f6] flex justify-between items-center">
                <span className="text-xs text-[#9ca3af] uppercase tracking-widest font-medium">Claim ID</span>
                <span className="text-xs font-mono text-[#6b7280]">{claim.id.slice(0, 8).toUpperCase()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Authorization Check Panel ─────────────────────────
function AuthCheckPanel({ authMeta }: {
  authMeta: {
    pre_auth_number: string | null;
    auth_check_status: string | null;
    auth_check_detail: string | null;
    pre_auth_id: string | null;
  };
}) {
  const status = authMeta.auth_check_status || "not_applicable";

  const config: Record<string, { label: string; bg: string; border: string; text: string; iconBg: string; tone: "ok" | "warn" | "bad" | "info" }> = {
    ok: { label: "Verified", bg: "bg-[#f0fdf4]", border: "border-[#bbf7d0]", text: "text-[#15803d]", iconBg: "bg-[#16a34a]", tone: "ok" },
    contradiction: { label: "Contradiction", bg: "bg-red-50", border: "border-red-200", text: "text-red-700", iconBg: "bg-red-500", tone: "bad" },
    missing: { label: "Missing", bg: "bg-red-50", border: "border-red-200", text: "text-red-700", iconBg: "bg-red-500", tone: "bad" },
    not_approved: { label: "Not Approved", bg: "bg-red-50", border: "border-red-200", text: "text-red-700", iconBg: "bg-red-500", tone: "bad" },
    expired: { label: "Expired", bg: "bg-red-50", border: "border-red-200", text: "text-red-700", iconBg: "bg-red-500", tone: "bad" },
    wrong_patient: { label: "Wrong Patient", bg: "bg-red-50", border: "border-red-200", text: "text-red-700", iconBg: "bg-red-500", tone: "bad" },
    code_mismatch: { label: "Code Mismatch", bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-800", iconBg: "bg-amber-500", tone: "warn" },
    not_applicable: { label: "None Provided", bg: "bg-gray-50", border: "border-gray-200", text: "text-gray-600", iconBg: "bg-gray-400", tone: "info" },
  };
  const c = config[status] || config.not_applicable;

  return (
    <div className={`border rounded-xl p-5 ${c.bg} ${c.border}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-[#0a0a0a] flex items-center gap-2">
          <ShieldIcon className={`h-4 w-4 ${c.text}`} /> Authorization Check
        </h3>
        <span className={`text-[10px] font-black uppercase tracking-widest text-white px-2 py-0.5 rounded ${c.iconBg}`}>
          {c.label}
        </span>
      </div>
      {authMeta.pre_auth_number ? (
        <p className="text-xs font-mono font-bold text-[#0a0a0a] mb-2 break-all">{authMeta.pre_auth_number}</p>
      ) : (
        <p className="text-xs text-[#6b7280] italic mb-2">No authorization number was referenced on this claim.</p>
      )}
      <p className={`text-xs leading-relaxed whitespace-pre-line ${c.text}`}>{authMeta.auth_check_detail || "—"}</p>
      {c.tone === "bad" && (
        <p className="text-[10px] text-red-600 mt-3 font-bold uppercase tracking-widest">
          Recommended: deny for missing/invalid authorization.
        </p>
      )}
    </div>
  );
}

function ShieldIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}
