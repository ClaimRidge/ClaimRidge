"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Claim, ClaimStatus } from "@/types/claim";
import { generatePayerClaimPdf } from "@/lib/pdf/payerClaimPdf";
import Button from "@/components/ui/Button";
import {
  LayoutDashboard,
  FilePlus,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Clock,
  FileText,
  TrendingUp,
  DollarSign,
  ShieldAlert,
  Send,
  Gavel,
  Download,
  Eye,
} from "lucide-react";
import { useRouter } from "next/navigation";

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  color,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  accent?: boolean;
  color?: "green" | "red" | "amber" | "blue" | "gray";
}) {
  const colorMap = {
    green: { bg: "bg-[#f0fdf4]", border: "border-[#bbf7d0]", icon: "text-[#16a34a]", text: "text-[#16a34a]" },
    red: { bg: "bg-red-50", border: "border-red-200", icon: "text-red-500", text: "text-red-600" },
    amber: { bg: "bg-amber-50", border: "border-amber-200", icon: "text-amber-500", text: "text-amber-600" },
    blue: { bg: "bg-blue-50", border: "border-blue-200", icon: "text-blue-500", text: "text-blue-600" },
    gray: { bg: "bg-[#f9fafb]", border: "border-[#e5e7eb]", icon: "text-[#6b7280]", text: "text-[#374151]" },
  };
  const c = colorMap[color || "green"];

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-xl p-4 sm:p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-[#9ca3af] font-medium">{label}</p>
          <p className={`font-display text-2xl sm:text-3xl font-bold mt-1.5 ${accent ? c.text : "text-[#0a0a0a]"}`}>
            {value}
          </p>
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${c.bg} ${c.border} border`}>
          <Icon className={`h-5 w-5 ${c.icon}`} />
        </div>
      </div>
    </div>
  );
}

// FIX 1: Add the backend statuses (rejected, needs_info, etc.) so they have proper badges
const STATUS_CONFIG: Record<string, { label: string; class: string; icon: React.ElementType }> = {
  draft: { label: "Draft", class: "bg-[#f9fafb] text-[#6b7280] border-[#e5e7eb]", icon: Clock },
  intake_complete: { label: "Submitted", class: "bg-blue-50 text-blue-600 border-blue-200", icon: Send },
  submitted: { label: "Submitted", class: "bg-blue-50 text-blue-600 border-blue-200", icon: Send },
  pending: { label: "Pending", class: "bg-amber-50 text-amber-600 border-amber-200", icon: Clock },
  under_review: { label: "Under Review", class: "bg-amber-50 text-amber-600 border-amber-200", icon: Clock },
  needs_info: { label: "Clarification", class: "bg-amber-50 text-amber-600 border-amber-200", icon: Clock },
  approved: { label: "Approved", class: "bg-[#f0fdf4] text-[#16a34a] border-[#bbf7d0]", icon: CheckCircle },
  denied: { label: "Denied", class: "bg-red-50 text-red-600 border-red-200", icon: XCircle },
  rejected: { label: "Rejected", class: "bg-red-50 text-red-600 border-red-200", icon: XCircle },
  appealing: { label: "Appealing", class: "bg-orange-50 text-orange-600 border-orange-200", icon: Gavel },
};

function ClaimStatusBadge({ status }: { status: string }) {
  const c = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  const IconComponent = c.icon;

  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${c.class}`}>
      <IconComponent className="h-3 w-3" />
      {c.label}
    </span>
  );
}

function ScrubBadge({ passed }: { passed: boolean | undefined }) {
  if (passed === undefined || passed === null) {
    return <span className="text-[#9ca3af] text-sm">--</span>;
  }
  if (passed) {
    return (
      <span className="inline-flex items-center gap-1 text-sm text-[#16a34a] font-medium">
        <CheckCircle className="h-3.5 w-3.5" />
        Passed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-sm text-amber-600 font-medium">
      <AlertTriangle className="h-3.5 w-3.5" />
      Warnings
    </span>
  );
}

function formatDateDMY(dateStr: string): string {
  if (!dateStr) return "--";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

const FILTER_TABS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "submitted", label: "Submitted" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "denied", label: "Denied" },
  { key: "appealing", label: "Appealing" },
];

export default function DashboardPage() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const router = useRouter();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    const checkUserAndFetchClaims = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("account_type")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile?.account_type) {
        router.push("/onboarding");
        return;
      }

      const { data, error } = await supabase
        .from("claims")
        .select("*")
        .order("created_at", { ascending: false });

      if (!error && data) {
        setClaims(data as Claim[]);
      }
      setLoading(false);
    };

    checkUserAndFetchClaims();
  }, []);

  // FIX 2: Group backend statuses into the visual UI tabs
  const checkTabMatch = (claimStatus: string, tab: string) => {
    if (tab === "all") return true;
    if (tab === "submitted") return ["submitted", "intake_complete"].includes(claimStatus);
    if (tab === "pending") return ["pending", "under_review", "needs_info"].includes(claimStatus);
    if (tab === "approved") return claimStatus === "approved";
    if (tab === "denied") return ["denied", "rejected"].includes(claimStatus);
    if (tab === "appealing") return claimStatus === "appealing";
    return false;
  };

  const filteredClaims = claims.filter((c) => checkTabMatch(c.status, activeFilter));

  // FIX 3: Update stat math to include "rejected" as denied
  const totalClaims = claims.length;
  const totalBilled = claims.reduce((sum, c) => sum + (c.billed_amount || 0), 0);
  const approvedClaims = claims.filter((c) => c.status === "approved").length;
  const decidedClaims = claims.filter((c) => ["approved", "denied", "rejected"].includes(c.status)).length;
  const approvalRate = decidedClaims > 0 ? Math.round((approvedClaims / decidedClaims) * 100) : 0;
  const deniedAmount = claims
    .filter((c) => ["denied", "rejected"].includes(c.status))
    .reduce((sum, c) => sum + (c.billed_amount || 0), 0);

  const handleDownloadPdf = async (claim: Claim) => {
    setDownloadingId(claim.id);
    try {
      generatePayerClaimPdf(claim);
    } catch (err) {
      console.error("PDF download failed:", err);
    } finally {
      setTimeout(() => setDownloadingId(null), 300);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center justify-center w-10 h-10 bg-[#f0fdf4] border border-[#bbf7d0] rounded-lg">
            <LayoutDashboard className="h-5 w-5 text-[#16a34a]" />
          </div>
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0a0a0a]">Claims Dashboard</h1>
            <p className="text-[#9ca3af] text-sm">Track and manage your claims pipeline</p>
          </div>
        </div>
        <Link href="/claims/new">
          <Button className="gap-2 w-full sm:w-auto">
            <FilePlus className="h-4 w-4" />
            New Claim
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Claims" value={totalClaims} icon={FileText} color="blue" />
        <StatCard
          label="Total Billed"
          value={`${totalBilled.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} JOD`}
          icon={DollarSign}
          color="gray"
          accent
        />
        <StatCard
          label="Approval Rate"
          value={decidedClaims > 0 ? `${approvalRate}%` : "--"}
          icon={TrendingUp}
          color="green"
          accent
        />
        <StatCard
          label="Revenue at Risk"
          value={deniedAmount > 0 ? `${deniedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} JOD` : "--"}
          icon={ShieldAlert}
          color="red"
          accent
        />
      </div>

      <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-1">
        {FILTER_TABS.map((tab) => {
          const count = claims.filter((c) => checkTabMatch(c.status, tab.key)).length;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveFilter(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${activeFilter === tab.key
                  ? "bg-[#16a34a] text-white"
                  : "text-[#6b7280] hover:bg-[#f3f4f6]"
                }`}
            >
              {tab.label}
              {count > 0 && (
                <span
                  className={`ml-1.5 text-xs ${activeFilter === tab.key ? "text-white/80" : "text-[#9ca3af]"
                    }`}
                >
                  ({count})
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-[#f3f4f6] flex items-center justify-between">
          <h2 className="font-display font-bold text-[#0a0a0a] text-sm sm:text-base">
            {activeFilter === "all" ? "All Claims" : `${STATUS_CONFIG[activeFilter]?.label || activeFilter} Claims`}
          </h2>
          <span className="text-xs text-[#9ca3af]">
            {filteredClaims.length} claim{filteredClaims.length !== 1 ? "s" : ""}
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin h-8 w-8 border-4 border-[#16a34a] border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-[#9ca3af] text-sm">Loading claims...</p>
          </div>
        ) : filteredClaims.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="h-12 w-12 text-[#d1d5db] mx-auto mb-4" />
            <h3 className="font-display font-bold text-[#0a0a0a] mb-1">
              {activeFilter === "all" ? "No claims yet" : `No ${activeFilter} claims`}
            </h3>
            <p className="text-[#9ca3af] text-sm mb-4">
              {activeFilter === "all"
                ? "Submit your first claim to get started with AI scrubbing."
                : "No claims match this filter."}
            </p>
            {activeFilter === "all" && (
              <Link href="/claims/new">
                <Button size="sm" className="gap-2">
                  <FilePlus className="h-4 w-4" />
                  Submit First Claim
                </Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[#f9fafb] text-left border-b border-[#f3f4f6]">
                  <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase tracking-wider">Claim #</th>
                  <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase tracking-wider">Patient</th>
                  <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase tracking-wider">Payer</th>
                  <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase tracking-wider">Date of Service</th>
                  <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase tracking-wider">Scrub</th>
                  <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f3f4f6]">
                {filteredClaims.map((claim) => (
                  <tr key={claim.id} className="hover:bg-[#f9fafb] transition-colors">
                    <td className="px-6 py-4">
                      <span className="text-sm font-mono text-[#0a0a0a] font-medium">
                        {claim.claim_number || `CR-${claim.id.slice(0, 10)}`}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-[#374151]">{claim.patient_name}</td>
                    <td className="px-6 py-4 text-sm text-[#6b7280]">{claim.payer_name}</td>
                    <td className="px-6 py-4 text-sm text-[#6b7280]">{formatDateDMY(claim.date_of_service)}</td>
                    <td className="px-6 py-4 text-sm font-medium text-[#0a0a0a]">
                      {Number(claim.billed_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} JOD
                    </td>
                    <td className="px-6 py-4">
                      <ScrubBadge passed={claim.scrub_passed} />
                    </td>
                    <td className="px-6 py-4">
                      <ClaimStatusBadge status={claim.status} />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/claims/${claim.id}/results`}
                          className="inline-flex items-center gap-1 text-sm text-[#16a34a] hover:text-[#15803d] font-semibold"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View
                        </Link>
                        <button
                          onClick={() => handleDownloadPdf(claim)}
                          disabled={downloadingId === claim.id}
                          className="inline-flex items-center gap-1 text-sm text-[#6b7280] hover:text-[#374151] font-medium disabled:opacity-50"
                        >
                          <Download className="h-3.5 w-3.5" />
                          PDF
                        </button>
                        {/* FIX 4: Add rejected to the condition that shows the Appeal button */}
                        {["denied", "rejected"].includes(claim.status) && (
                          <span className="inline-flex items-center gap-1 text-sm text-orange-600 font-semibold cursor-pointer hover:text-orange-700">
                            <Gavel className="h-3.5 w-3.5" />
                            Appeal
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}