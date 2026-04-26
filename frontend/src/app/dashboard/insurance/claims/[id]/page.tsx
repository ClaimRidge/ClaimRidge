"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { InsurerClaim, ClaimFlag } from "@/types/insurer";
import AiAnalysisPanel from "@/components/insurer/AiAnalysisPanel";
import ClaimDecisionActions from "@/components/insurer/ClaimDecisionActions";
import ClaimStatusPill from "@/components/insurer/ClaimStatusPill";
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
  Stethoscope,
  Hash,
  Clock,
  Paperclip,
  Brain,
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

function renderFormattedText(text: string) {
  return text.split('\n').map((line, i) => {
    if (!line.trim()) return null;

    // Handle Headings
    if (line.startsWith('### ')) {
      return (
        <h3 key={i} className="font-display font-bold text-[#0a0a0a] text-sm uppercase tracking-wide mt-5 mb-2 border-b border-[#bbf7d0] pb-1">
          {line.replace('### ', '')}
        </h3>
      );
    }
    if (line.startsWith('## ')) {
      return (
        <h2 key={i} className="font-display font-bold text-[#0a0a0a] text-base mt-5 mb-2">
          {line.replace('## ', '')}
        </h2>
      );
    }
    
    // Handle Unordered Lists
    if (line.trim().startsWith('- ')) {
      const parts = line.replace('- ', '').split(/(\*\*.*?\*\*)/g);
      return (
        <div key={i} className="flex gap-2 mb-2 text-sm text-[#4b5563] leading-relaxed pl-2">
          <span className="text-[#9ca3af]">•</span>
          <div>
            {parts.map((part, index) => {
              if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={index} className="font-semibold text-[#0a0a0a]">{part.slice(2, -2)}</strong>;
              }
              return <span key={index}>{part}</span>;
            })}
          </div>
        </div>
      );
    }

    // Process inline bold text
    const parts = line.split(/(\*\*.*?\*\*)/g);
    
    return (
      <p key={i} className="mb-3 text-sm text-[#4b5563] leading-relaxed">
        {parts.map((part, index) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return (
              <strong key={index} className="font-semibold text-[#0a0a0a]">
                {part.slice(2, -2)}
              </strong>
            );
          }
          return <span key={index}>{part}</span>;
        })}
      </p>
    );
  });
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

  const handleGenerateRecommendation = async () => {
    if (!claim) return;
    setGeneratingAi(true);
    try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/insurer/claims/${claim.id}/analyze`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${session?.access_token}` }
        });
        
        if (!res.ok) throw new Error("Failed to generate analysis");
        
        const data = await res.json();
        setClaim({ ...claim, ai_recommendation: data.ai_recommendation });
    } catch (err) {
        console.error(err);
    } finally {
        setGeneratingAi(false);
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
        created_at: claimData.created_at,
        updated_at: claimData.updated_at || claimData.created_at,
      };
      
      setClaim(mappedClaim);

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
          {/* AI Clinical Recommendation Panel — HIGHEST PRIORITY */}
          <div className="bg-gradient-to-br from-[#f0fdf4] to-white border border-[#bbf7d0] rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display font-bold text-[#0a0a0a] flex items-center gap-2 text-lg">
                <Stethoscope className="h-5 w-5 text-[#16a34a]" />
                AI Medical Necessity Review
              </h2>
            </div>
            
            {claim.ai_recommendation ? (
              <div className="max-w-none">
                {renderFormattedText(claim.ai_recommendation)}
              </div>
            ) : (
              <div className="py-4 text-center">
                <p className="text-sm text-[#6b7280] italic mb-4">
                  No clinical review generated yet. Analyze the diagnosis and procedure codes against medical guidelines.
                </p>
                <Button 
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateRecommendation}
                  loading={generatingAi}
                  className="gap-2"
                >
                  <Brain className="h-4 w-4" />
                  Generate Clinical Review
                </Button>
              </div>
            )}
          </div>

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

          {/* Supporting Documents (Mock) — Saved for next time 
          <div className="bg-white border border-[#e5e7eb] rounded-xl p-6 shadow-sm opacity-60">
             ...
          </div>
          */}
        </div>

        {/* Right Column — Decision & Risk Analysis (1/3) */}
        <div className="space-y-6">
          {/* Decision Actions */}
          <ClaimDecisionActions claim={claim} onDecision={handleDecision} />

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
