"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Claim } from "@/types/claim";
import Button from "@/components/ui/Button";
import {
  Stethoscope,
  FilePlus,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Clock,
  FileText,
  TrendingUp,
  DollarSign,
  Eye,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { formatDateJO } from "@/lib/utils/format";

// Status Badges Configuration
const STATUS_CONFIG: Record<string, { label: string; class: string; icon: React.ElementType }> = {
  draft: { label: "Draft", class: "bg-[#f9fafb] text-[#6b7280] border-[#e5e7eb]", icon: Clock },
  intake_complete: { label: "Submitted", class: "bg-blue-50 text-blue-600 border-blue-200", icon: Clock },
  submitted: { label: "Submitted", class: "bg-blue-50 text-blue-600 border-blue-200", icon: Clock },
  pending: { label: "Pending", class: "bg-amber-50 text-amber-600 border-amber-200", icon: Clock },
  under_review: { label: "Under Review", class: "bg-amber-50 text-amber-600 border-amber-200", icon: Clock },
  needs_info: { label: "Clarification", class: "bg-amber-50 text-amber-600 border-amber-200", icon: Clock },
  approved: { label: "Approved", class: "bg-[#f0fdf4] text-[#16a34a] border-[#bbf7d0]", icon: CheckCircle },
  denied: { label: "Denied", class: "bg-red-50 text-red-600 border-red-200", icon: XCircle },
  rejected: { label: "Rejected", class: "bg-red-50 text-red-600 border-red-200", icon: XCircle },
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

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: React.ElementType; color: "green" | "blue" | "gray" }) {
  const colorMap = {
    green: { bg: "bg-[#f0fdf4]", border: "border-[#bbf7d0]", icon: "text-[#16a34a]", text: "text-[#16a34a]" },
    blue: { bg: "bg-blue-50", border: "border-blue-200", icon: "text-blue-500", text: "text-[#0a0a0a]" },
    gray: { bg: "bg-[#f9fafb]", border: "border-[#e5e7eb]", icon: "text-[#6b7280]", text: "text-[#0a0a0a]" },
  };
  const c = colorMap[color];

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-xl p-4 sm:p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-[#9ca3af] font-medium">{label}</p>
          <p className={`font-display text-2xl sm:text-3xl font-bold mt-1.5 ${c.text}`}>{value}</p>
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${c.bg} ${c.border} border`}>
          <Icon className={`h-5 w-5 ${c.icon}`} />
        </div>
      </div>
    </div>
  );
}

export default function DoctorDashboard() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const fetchMyClaims = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.push("/login");

      // CRITICAL: Doctors only see claims where user_id matches their own ID
      const { data, error } = await supabase
        .from("claims")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (!error && data) {
        setClaims(data as Claim[]);
      }
      setLoading(false);
    };

    fetchMyClaims();
  }, [router, supabase]);

  const totalClaims = claims.length;
  const totalBilled = claims.reduce((sum, c) => sum + (c.billed_amount || 0), 0);
  const approvedClaims = claims.filter((c) => c.status === "approved").length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center justify-center w-10 h-10 bg-[#f0fdf4] border border-[#bbf7d0] rounded-lg">
            <Stethoscope className="h-5 w-5 text-[#16a34a]" />
          </div>
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0a0a0a]">My Practices & Claims</h1>
            <p className="text-[#9ca3af] text-sm">Track your personal patient submissions</p>
          </div>
        </div>
        <Link href="/dashboard/doctor/claims/new">
          <Button className="gap-2 w-full sm:w-auto">
            <FilePlus className="h-4 w-4" />
            New Claim
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard label="My Total Claims" value={totalClaims} icon={FileText} color="blue" />
        <StatCard label="Total Billed" value={`${totalBilled.toLocaleString()} JOD`} icon={DollarSign} color="gray" />
        <StatCard label="Approved Claims" value={approvedClaims} icon={TrendingUp} color="green" />
      </div>

      {/* Claims List */}
      <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-[#f3f4f6]">
          <h2 className="font-display font-bold text-[#0a0a0a] text-sm sm:text-base">Recent Submissions</h2>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin h-8 w-8 border-4 border-[#16a34a] border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-[#9ca3af] text-sm">Loading your claims...</p>
          </div>
        ) : claims.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="h-12 w-12 text-[#d1d5db] mx-auto mb-4" />
            <h3 className="font-display font-bold text-[#0a0a0a] mb-1">No claims submitted yet</h3>
            <p className="text-[#9ca3af] text-sm mb-4">Click "New Claim" to scrub and submit your first claim.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[#f9fafb] text-left border-b border-[#f3f4f6]">
                  <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase">Patient</th>
                  <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase">Date of Service</th>
                  <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase">Payer</th>
                  <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase">Amount</th>
                  <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase">Status</th>
                  <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f3f4f6]">
                {claims.map((claim) => (
                  <tr key={claim.id} className="hover:bg-[#f9fafb] transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-[#0a0a0a]">{claim.patient_name}</td>
                    <td className="px-6 py-4 text-sm text-[#6b7280]">{formatDateJO(claim.date_of_service)}</td>
                    <td className="px-6 py-4 text-sm text-[#6b7280]">{claim.payer_name}</td>
                    <td className="px-6 py-4 text-sm font-bold text-[#0a0a0a]">{claim.billed_amount} JOD</td>
                    <td className="px-6 py-4"><ClaimStatusBadge status={claim.status} /></td>
                    <td className="px-6 py-4">
                      <Link href={`/dashboard/doctor/claims/${claim.id}/results`} className="inline-flex items-center gap-1 text-sm text-[#16a34a] hover:text-[#15803d] font-semibold">
                        <Eye className="h-4 w-4" /> View
                      </Link>
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