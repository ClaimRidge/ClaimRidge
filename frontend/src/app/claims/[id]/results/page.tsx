"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Claim, ScrubIssue } from "@/types/claim";
import Button from "@/components/ui/Button";
import { generateClaimPdf } from "@/lib/pdf/claimPdf";
import { generateCorrectedClaimPdf } from "@/lib/pdf/correctedClaimPdf";
import { generatePayerClaimPdf } from "@/lib/pdf/payerClaimPdf";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  Info,
  ArrowLeft,
  Download,
  FileCheck,
  FileText,
  X,
  ShieldCheck,
} from "lucide-react";

function SeverityIcon({ severity }: { severity: ScrubIssue["severity"] }) {
  switch (severity) {
    case "error":
      return <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />;
    case "warning":
      return <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />;
    case "info":
      return <Info className="h-5 w-5 text-blue-500 flex-shrink-0" />;
  }
}

function ScoreRing({ score }: { score: number }) {
  const color =
    score >= 80 ? "text-[#16a34a]" : score >= 60 ? "text-amber-500" : "text-red-500";
  const bgColor =
    score >= 80 ? "bg-[#f0fdf4]" : score >= 60 ? "bg-amber-50" : "bg-red-50";
  const borderColor =
    score >= 80 ? "border-[#bbf7d0]" : score >= 60 ? "border-amber-200" : "border-red-200";
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div
      className={`inline-flex items-center justify-center w-32 h-32 ${bgColor} ${borderColor} border rounded-full relative`}
    >
      <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="8" className="text-[#e5e7eb]" />
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={color}
        />
      </svg>
      <span className={`font-sans absolute text-4xl font-black tracking-tighter tabular-nums ${color}`}>{score}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles = {
    clean: "bg-[#f0fdf4] text-[#16a34a] border-[#bbf7d0]",
    warnings: "bg-amber-50 text-amber-600 border-amber-200",
    errors: "bg-red-50 text-red-600 border-red-200",
  };
  const icons = {
    clean: <CheckCircle className="h-4 w-4" />,
    warnings: <AlertTriangle className="h-4 w-4" />,
    errors: <XCircle className="h-4 w-4" />,
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border ${
        styles[status as keyof typeof styles] || styles.warnings
      }`}
    >
      {icons[status as keyof typeof icons]}
      {status === "clean" ? "Clean" : status === "warnings" ? "Warnings Found" : "Errors Found"}
    </span>
  );
}

export default function ResultsPage() {
  const params = useParams();
  const [claim, setClaim] = useState<Claim | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [downloadingCorrected, setDownloadingCorrected] = useState(false);
  const [generatingPayerPdf, setGeneratingPayerPdf] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const supabase = createClient();
  const [showScoringGuide, setShowScoringGuide] = useState(false);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  };

  const handleExportPdf = async () => {
    if (!claim) return;
    setExporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      await generateClaimPdf(claim);
      
      await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/claims/${claim.id}/track-export`, { 
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session?.access_token}`
        }
      }).catch((err) => console.error("Export tracking failed:", err));
      
      showToast("Claim saved to your dashboard");
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      setTimeout(() => setExporting(false), 300);
    }
  };

  const handleDownloadCorrected = async () => {
    if (!claim) return;
    setDownloadingCorrected(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      generateCorrectedClaimPdf(claim);
      
      await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/claims/${claim.id}/track-export`, { 
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session?.access_token}`
        }
      }).catch((err) => console.error("Export tracking failed:", err));
      
      showToast("Claim saved to your dashboard");
    } catch (err) {
      console.error("Corrected claim download failed:", err);
    } finally {
      setTimeout(() => setDownloadingCorrected(false), 300);
    }
  };

  const handleDownloadPayerPdf = async () => {
    if (!claim) return;
    setGeneratingPayerPdf(true);
    
    try {
      const PAYER_COLORS: Record<string, string> = {
        "ARAB_ORIENT": "#1B4F72", "GIG_JORDAN": "#1A5276", "ALAI": "#145A32",
        "AL_NISR": "#6E2F0A", "ARAB_ASSURERS": "#2C3E50", "JORDAN_INSURANCE": "#1F618D",
        "MIDDLE_EAST_INS": "#7D6608", "ISLAMIC_INSURANCE": "#1E8449",
        "MEDNET": "#6C3483", "NEXTCARE": "#0E6655"
      };

      const doc = new jsPDF();
      const accentColor = PAYER_COLORS[claim.payer_code || ""] || "#1a1a1a";
      const claimIdShort = claim.claim_number || claim.id.slice(0, 8).toUpperCase();
      
      // Header Section
      doc.setTextColor(accentColor);
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text(claim.payer_name || "Medical Claim Form", 14, 20);

      doc.setTextColor("#6b7280");
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.text(`Claim Number: ${claimIdShort}`, 14, 28);
      
      // Divider Line
      doc.setDrawColor(accentColor);
      doc.setLineWidth(1);
      doc.line(14, 32, 196, 32);

      // Patient Info Section
      doc.setTextColor("#0a0a0a");
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Patient Information", 14, 42);
      
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Name: ${claim.patient_name} | ID: ${claim.patient_id} | DOS: ${claim.date_of_service}`, 14, 48);

      // Diagnosis Codes Table
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Diagnosis Codes", 14, 60);

      autoTable(doc, {
        startY: 64,
        head: [['#', 'Code', 'Type']],
        body: (claim.diagnosis_codes || []).filter(Boolean).map((dx, i) => [
          i + 1, 
          dx, 
          i === 0 ? 'Primary' : 'Secondary'
        ]),
        headStyles: { fillColor: accentColor, textColor: '#ffffff' },
        styles: { fontSize: 10, cellPadding: 3 },
      });

      // Procedure Codes Table
      const nextY = (doc as any).lastAutoTable.finalY + 12;
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Procedure Codes", 14, nextY);

      const amountToBill = claim.billed_amount || claim.total_billed || 0;

      autoTable(doc, {
        startY: nextY + 4,
        head: [['Code', 'Date', 'Amount', 'Type']],
        body: (claim.procedure_codes || []).filter(Boolean).map((cpt, i) => [
          cpt,
          claim.date_of_service,
          i === 0 ? `${amountToBill} JOD` : '-',
          i === 0 ? 'Primary' : 'Additional'
        ]),
        headStyles: { fillColor: accentColor, textColor: '#ffffff' },
        styles: { fontSize: 10, cellPadding: 3 },
      });

      // Total Billed
      const finalY = (doc as any).lastAutoTable.finalY + 15;
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(`Total Billed: ${amountToBill} JOD`, 14, finalY);

      // Save the PDF locally without hitting the backend
      doc.save(`${claimIdShort}_${claim.payer_code || 'GENERIC'}.pdf`);

      showToast("Claim PDF generated successfully!");
    } catch (err) {
      console.error("PDF generation failed:", err);
      showToast("Failed to generate PDF. Please try again.");
    } finally {
      setGeneratingPayerPdf(false);
    }
  };

  useEffect(() => {
    const fetchClaim = async () => {
      // Safely unwrap the param
      const claimId = params?.id as string;
      if (!claimId) return;

      try {
        const { data, error: supabaseError } = await supabase
          .from("claims")
          .select("*")
          .eq("id", claimId)
          .single();

        if (supabaseError) {
          console.error("Supabase error fetching claim:", supabaseError);
          // PGRST116 indicates 0 rows returned (ID does not exist)
          if (supabaseError.code === 'PGRST116') {
             setError("This claim could not be found. It may have been deleted or the link is incorrect.");
          } else {
             setError(`Database error: ${supabaseError.message}`);
          }
          setLoading(false);
          return;
        }

        if (!data) {
          setError("Claim record not found in database.");
          setLoading(false);
          return;
        }

        setClaim(data as Claim);
      } catch (err) {
        console.error("Unexpected error:", err);
        setError("An unexpected error occurred while loading the claim.");
      } finally {
        setLoading(false);
      }
    };

    fetchClaim();
  }, [params.id]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <div className="animate-pulse">
          <div className="h-8 w-64 max-w-full bg-[#f3f4f6] rounded mx-auto mb-4" />
          <div className="h-4 w-full max-w-sm bg-[#f3f4f6] rounded mx-auto" />
        </div>
      </div>
    );
  }

  if (error || !claim) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h1 className="font-display text-xl sm:text-2xl font-extrabold text-[#0a0a0a] mb-2">Claim Not Found</h1>
        <p className="text-[#6b7280] mb-6">{error || "This claim could not be loaded."}</p>
        <Link href="/dashboard">
          <Button variant="secondary">Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  const result = claim.scrub_result;

  if (!result) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <div className="animate-spin h-8 w-8 border-4 border-[#16a34a] border-t-transparent rounded-full mx-auto mb-4" />
        <h1 className="font-display text-xl sm:text-2xl font-extrabold text-[#0a0a0a] mb-2">Scrubbing in Progress</h1>
        <p className="text-[#6b7280]">Your claim is being analyzed by our AI engine...</p>
      </div>
    );
  }

  const issues = result.issues || [];
  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  const infoCount = issues.filter((i) => i.severity === "info").length;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/dashboard"
          className="group flex items-center gap-2 text-sm font-medium text-[#6b7280] hover:text-[#16a34a] transition-colors"
        >
          <div className="w-8 h-8 flex items-center justify-center rounded-full bg-white border border-[#e5e7eb] group-hover:border-[#16a34a] group-hover:bg-[#f0fdf4] transition-all">
            <ArrowLeft className="h-4 w-4" />
          </div>
          Back to Dashboard
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-[#0a0a0a]">Scrub Results</h1>
      </div>

      {/* Summary Card */}
      <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm p-6 md:p-8 mb-6">
        <div className="flex flex-col md:flex-row items-center gap-8">
          <div className="flex flex-col items-center">
            <ScoreRing score={result.overall_score} />
            <button 
              onClick={() => setShowScoringGuide(true)}
              className="mt-3 text-xs font-medium text-[#16a34a] hover:text-[#15803d] flex items-center gap-1 transition-colors"
            >
              <Info className="h-3.5 w-3.5" />
              How is this calculated?
            </button>
          </div>
          <div className="flex-1 text-center md:text-left">
            <div className="mb-3">
              <StatusBadge status={result.status} />
            </div>
            <h2 className="font-sans text-lg sm:text-xl font-bold text-[#0a0a0a] mb-1 break-words tracking-tight">
              {claim.patient_name} — {claim.date_of_service}
            </h2>
            <p className="text-[#6b7280] text-xs sm:text-sm break-words">
              {claim.provider_name} &middot; {claim.payer_name} &middot; {claim.billed_amount} JOD
            </p>
            <div className="flex items-center gap-4 mt-4 justify-center md:justify-start flex-wrap">
              {errorCount > 0 && (
                <span className="flex items-center gap-1 text-sm text-red-600">
                  <XCircle className="h-4 w-4" /> {errorCount} error{errorCount > 1 ? "s" : ""}
                </span>
              )}
              {warningCount > 0 && (
                <span className="flex items-center gap-1 text-sm text-amber-600">
                  <AlertTriangle className="h-4 w-4" /> {warningCount} warning{warningCount > 1 ? "s" : ""}
                </span>
              )}
              {infoCount > 0 && (
                <span className="flex items-center gap-1 text-sm text-blue-600">
                  <Info className="h-4 w-4" /> {infoCount} suggestion{infoCount > 1 ? "s" : ""}
                </span>
              )}
              {issues.length === 0 && (
                <span className="flex items-center gap-1 text-sm text-[#16a34a]">
                  <CheckCircle className="h-4 w-4" /> No issues found
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Issues */}
      {issues.length > 0 && (
        <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm p-6 md:p-8 mb-6">
          <h3 className="font-display text-lg font-bold text-[#0a0a0a] mb-4">Issues Found</h3>
          <div className="space-y-4">
            {issues.map((issue, i) => (
              <div
                key={i}
                className={`flex gap-3 p-4 rounded-lg border ${
                  issue.severity === "error"
                    ? "bg-red-50 border-red-200"
                    : issue.severity === "warning"
                    ? "bg-amber-50 border-amber-200"
                    : "bg-blue-50 border-blue-200"
                }`}
              >
                <SeverityIcon severity={issue.severity} />
                <div>
                  <p className="font-medium text-[#0a0a0a] text-sm">
                    {issue.field}
                  </p>
                  <p className="text-sm text-[#374151] mt-0.5">{issue.message}</p>
                  {issue.suggestion && (
                    <p className="text-sm text-[#6b7280] mt-1">
                      <span className="font-medium text-[#16a34a]">Suggestion:</span> {issue.suggestion}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {result.recommendations && result.recommendations.length > 0 && (
        <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm p-6 md:p-8 mb-6">
          <h3 className="font-display text-lg font-bold text-[#0a0a0a] mb-4">Recommendations</h3>
          <ul className="space-y-2">
            {result.recommendations.map((rec, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-[#374151]">
                <CheckCircle className="h-4 w-4 text-[#16a34a] flex-shrink-0 mt-0.5" />
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Payer Policy References */}
      {result.retrieved_sources && result.retrieved_sources.length > 0 && (
        <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm p-6 md:p-8 mb-6">
          <h3 className="font-display text-lg font-bold text-[#0a0a0a] mb-4">Payer Policy Sources</h3>
          <p className="text-sm text-[#6b7280] mb-4">The AI used the following extracts from the insurer's policy to evaluate this claim:</p>
          
          <div className="space-y-3">
            {result.retrieved_sources.map((source, i) => (
              <div key={i} className="bg-[#f9fafb] border-l-4 border-[#16a34a] p-4 rounded-r-lg">
                <p className="text-xs font-mono text-[#6b7280] mb-1">Source Extract {i + 1}</p>
                <p className="text-sm text-[#374151] italic">"{source}"</p>
              </div>
            ))}
          </div>
          
          {result.applied_policy_rules && result.applied_policy_rules.length > 0 && (
            <div className="mt-4 pt-4 border-t border-[#f3f4f6]">
              <p className="text-xs font-bold uppercase tracking-wider text-[#0a0a0a] mb-2">AI Interpretation:</p>
              <ul className="list-disc list-inside space-y-1 text-sm text-[#374151] ml-2">
                {result.applied_policy_rules.map((rule, i) => (
                  <li key={i}>{rule}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 justify-end flex-wrap">
        <Button
          variant="primary"
          className="gap-2 w-full sm:w-auto"
          onClick={handleDownloadPayerPdf}
          loading={generatingPayerPdf}
        >
          <FileText className="h-4 w-4" />
          {generatingPayerPdf ? "Generating PDF..." : "Download Claim PDF"}
        </Button>
        <Button
          variant="secondary"
          className="gap-2 w-full sm:w-auto"
          onClick={handleDownloadCorrected}
          loading={downloadingCorrected}
        >
          <FileCheck className="h-4 w-4" />
          Download Corrected Claim
        </Button>
        <Button
          variant="outline"
          className="gap-2 w-full sm:w-auto"
          onClick={handleExportPdf}
          loading={exporting}
        >
          <Download className="h-4 w-4" />
          Export Scrub Report
        </Button>
      </div>

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex items-center gap-2 px-4 py-3 bg-[#16a34a] text-white text-sm font-medium rounded-lg shadow-lg">
            <CheckCircle className="h-4 w-4 flex-shrink-0" />
            {toast}
          </div>
        </div>
      )}

      {/* Scoring Guide Modal */}
      {showScoringGuide && (
        <ScoringGuideModal onClose={() => setShowScoringGuide(false)} />
      )}
    </div>
  );
}

function ScoringGuideModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#f3f4f6] flex items-center justify-between bg-[#f9fafb]">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-[#16a34a]" />
            <h3 className="font-display font-bold text-lg text-[#0a0a0a]">AI Scoring Rubric</h3>
          </div>
          <button onClick={onClose} className="text-[#9ca3af] hover:text-[#0a0a0a] transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          <p className="text-sm text-[#374151] mb-5 leading-relaxed">
            Every claim starts with a perfect score of <strong className="text-[#16a34a]">100</strong>. The AI acts as a strict medical auditor and deducts points based on the severity of errors, missing information, or payer rule violations.
          </p>

          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <span className="inline-flex items-center justify-center px-2 py-1 rounded bg-red-100 text-red-700 text-xs font-bold font-mono min-w-[48px]">-15</span>
              <p className="text-sm text-[#374151]"><strong>Critical Errors:</strong> Missing required IDs, diagnosis-procedure mismatches (e.g., knee X-ray for a headache), or violating a strict Payer Policy rule.</p>
            </div>

            <div className="flex items-start gap-3">
              <span className="inline-flex items-center justify-center px-2 py-1 rounded bg-red-100 text-red-700 text-xs font-bold font-mono min-w-[48px]">-12</span>
              <p className="text-sm text-[#374151]"><strong>Invalid Codes:</strong> Using an ICD-10 or CPT code that does not exist in standard medical registries.</p>
            </div>

            <div className="flex items-start gap-3">
              <span className="inline-flex items-center justify-center px-2 py-1 rounded bg-orange-100 text-orange-700 text-xs font-bold font-mono min-w-[48px]">-10</span>
              <p className="text-sm text-[#374151]"><strong>Compliance Risks:</strong> Unbundled procedures, future dates of service, or submitting to an unregistered payer.</p>
            </div>

            <div className="flex items-start gap-3">
              <span className="inline-flex items-center justify-center px-2 py-1 rounded bg-amber-100 text-amber-700 text-xs font-bold font-mono min-w-[48px]">-5</span>
              <p className="text-sm text-[#374151]"><strong>Coding Precision:</strong> Duplicate codes or using non-specific/truncated ICD-10 codes when a more detailed code exists.</p>
            </div>

            <div className="flex items-start gap-3">
              <span className="inline-flex items-center justify-center px-2 py-1 rounded bg-blue-100 text-blue-700 text-xs font-bold font-mono min-w-[48px]">-3</span>
              <p className="text-sm text-[#374151]"><strong>Regional Rules:</strong> Formatting issues with MENA National IDs, or elective procedures billed on a Friday (weekend).</p>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-[#f3f4f6]">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#6b7280] mb-2">Score Thresholds</h4>
            <div className="flex justify-between text-sm">
              <span className="text-[#16a34a] font-medium">90 - 100: Clean</span>
              <span className="text-amber-600 font-medium">70 - 89: Warnings</span>
              <span className="text-red-600 font-medium">0 - 69: High Risk</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-[#f9fafb] border-t border-[#f3f4f6] text-right">
          <Button onClick={onClose} variant="outline" size="sm">Got it</Button>
        </div>
      </div>
    </div>
  );
}
