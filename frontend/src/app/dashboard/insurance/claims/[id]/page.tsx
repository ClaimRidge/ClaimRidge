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

  useEffect(() => {
    const fetchClaim = async () => {
      const { data: claimData, error: claimErr } = await supabase
        .from("insurer_claims")
        .select("*")
        .eq("id", params.id)
        .maybeSingle();

      if (claimErr || !claimData) {
        setError("Claim not found");
        setLoading(false);
        return;
      }

      setClaim(claimData as InsurerClaim);

      const { data: flagData } = await supabase
        .from("claim_flags")
        .select("*")
        .eq("claim_id", params.id)
        .order("severity", { ascending: false });

      setFlags((flagData as ClaimFlag[]) || []);
      setLoading(false);
    };

    fetchClaim();
  }, [params.id]);

const handleDecision = async (action: "approved" | "rejected" | "needs_info", reason: string) => {
    if (!claim) return;
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/insurer/review-claim`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session?.access_token}`
      },
      body: JSON.stringify({
        claim_id: claim.id,
        action,
        reason,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Action failed");
      return;
    }

    const { claim: updated } = await res.json();
    setClaim(updated as InsurerClaim);
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
        <Link href="/dashboard/insurance/claims">
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
            <h1 className="font-display text-xl sm:text-2xl font-bold text-[#0a0a0a]">
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
        {/* Left Column — Claim Details (2/3) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Patient Information */}
          <div className="bg-white border border-[#e5e7eb] rounded-xl p-6 shadow-sm">
            <h2 className="font-display font-bold text-[#0a0a0a] mb-4 flex items-center gap-2">
              <User className="h-4 w-4 text-[#9ca3af]" />
              Patient Information
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
              <DetailRow label="Patient Name" value={claim.patient_name} icon={User} />
              <DetailRow
                label="National ID"
                value={maskNationalId(claim.patient_national_id)}
                icon={Hash}
              />
              {claim.patient_dob && (
                <DetailRow
                  label="Date of Birth"
                  value={`${formatDateJO(claim.patient_dob)}${age !== null ? ` (${age} yrs)` : ""}`}
                  icon={Calendar}
                />
              )}
              {claim.patient_gender && (
                <DetailRow
                  label="Gender"
                  value={claim.patient_gender === "M" ? "Male" : "Female"}
                  icon={User}
                />
              )}
            </div>
          </div>

          {/* Service Information */}
          <div className="bg-white border border-[#e5e7eb] rounded-xl p-6 shadow-sm">
            <h2 className="font-display font-bold text-[#0a0a0a] mb-4 flex items-center gap-2">
              <Stethoscope className="h-4 w-4 text-[#9ca3af]" />
              Service Information
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 mb-4">
              <DetailRow label="Service Date" value={formatDateJO(claim.service_date)} icon={Calendar} />
              <DetailRow label="Submission Date" value={formatDateJO(claim.submitted_at)} icon={Clock} />
              <DetailRow label="Clinic" value={claim.clinic_name} icon={Building2} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-[#f3f4f6]">
              <div>
                <p className="text-xs text-[#9ca3af] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Stethoscope className="h-3.5 w-3.5" /> Diagnosis Codes (ICD-10)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {claim.diagnosis_codes.map((code, i) => (
                    <span key={i} className="px-2 py-1 bg-[#f3f4f6] rounded text-xs font-mono text-[#374151]">
                      {code}
                    </span>
                  ))}
                </div>
                {claim.diagnosis_description && (
                  <p className="text-sm text-[#6b7280] mt-2">{claim.diagnosis_description}</p>
                )}
              </div>
              <div>
                <p className="text-xs text-[#9ca3af] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" /> Procedure Codes (CPT)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {claim.procedure_codes.map((code, i) => (
                    <span key={i} className="px-2 py-1 bg-[#f3f4f6] rounded text-xs font-mono text-[#374151]">
                      {code}
                    </span>
                  ))}
                </div>
                {claim.procedure_description && (
                  <p className="text-sm text-[#6b7280] mt-2">{claim.procedure_description}</p>
                )}
              </div>
            </div>
          </div>

          {/* Financial Summary */}
          <div className="bg-white border border-[#e5e7eb] rounded-xl p-6 shadow-sm">
            <h2 className="font-display font-bold text-[#0a0a0a] mb-4 flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-[#9ca3af]" />
              Financial Summary
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-[#f9fafb] rounded-lg p-4 text-center border border-[#f3f4f6]">
                <p className="text-xs text-[#9ca3af] uppercase tracking-wider mb-1">Claimed Amount</p>
                <p className="text-xl font-bold text-[#0a0a0a]">{formatJod(Number(claim.amount_jod))}</p>
              </div>
              <div className="bg-[#f9fafb] rounded-lg p-4 text-center border border-[#f3f4f6]">
                <p className="text-xs text-[#9ca3af] uppercase tracking-wider mb-1">Status</p>
                <div className="mt-1"><ClaimStatusPill status={claim.status} /></div>
              </div>
              <div className="bg-[#f9fafb] rounded-lg p-4 text-center border border-[#f3f4f6]">
                <p className="text-xs text-[#9ca3af] uppercase tracking-wider mb-1">AI Risk Score</p>
                <p className={`text-xl font-bold ${
                  (claim.ai_risk_score ?? 0) >= 71
                    ? "text-red-600"
                    : (claim.ai_risk_score ?? 0) >= 31
                    ? "text-amber-600"
                    : "text-[#16a34a]"
                }`}>
                  {claim.ai_risk_score ?? "N/A"}
                </p>
              </div>
            </div>
          </div>

          {/* Supporting Documents (Mock) */}
          <div className="bg-white border border-[#e5e7eb] rounded-xl p-6 shadow-sm">
            <h2 className="font-display font-bold text-[#0a0a0a] mb-4 flex items-center gap-2">
              <Paperclip className="h-4 w-4 text-[#9ca3af]" />
              Supporting Documents
            </h2>
            <div className="space-y-2">
              {[
                { name: "Medical Report.pdf", size: "245 KB" },
                { name: "Lab Results.pdf", size: "128 KB" },
                { name: "Prescription.pdf", size: "89 KB" },
              ].map((doc, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 bg-[#f9fafb] rounded-lg border border-[#f3f4f6]"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-[#9ca3af]" />
                    <div>
                      <p className="text-sm font-medium text-[#0a0a0a]">{doc.name}</p>
                      <p className="text-xs text-[#9ca3af]">{doc.size}</p>
                    </div>
                  </div>
                  <button className="text-xs text-[#16a34a] hover:text-[#15803d] font-semibold">
                    View
                  </button>
                </div>
              ))}
            </div>
            <p className="text-xs text-[#9ca3af] mt-3 italic">
              Document uploads will be available in a future update.
            </p>
          </div>
        </div>

        {/* Right Column — AI Analysis + Decision (1/3) */}
        <div className="space-y-6">
          <AiAnalysisPanel claim={claim} flags={flags} />
          <ClaimDecisionActions claim={claim} onDecision={handleDecision} />
        </div>
      </div>
    </div>
  );
}
