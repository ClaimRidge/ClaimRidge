"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  FileText,
  DollarSign,
  Sparkles,
  TrendingDown,
  Columns3,
} from "lucide-react";
import PipelineBoard from "@/components/pipeline/PipelineBoard";
import { createClient } from "@/lib/supabase/client";

export default function PipelinePage() {
  const [claims, setClaims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const fetchStats = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from("claims")
        .select("*")
        .eq("clinic_id", session.user.id);

      if (!error && data) {
        setClaims(data);
      }
      setLoading(false);
    };

    fetchStats();
  }, [supabase]);

  // Calculate real stats
  const totalClaims = claims.length;
  const totalBilled = claims.reduce((sum, c) => sum + (Number(c.total_billed) || 0), 0);
  
  // Logic for revenue saved (approximation: 10% of total billed if we don't have a direct field)
  // Or just use 0 if we don't want to guess. The user said "lack data".
  // Actually, let's just show Total Claims, Total Billed, and Denial Rate.
  
  const approvedCount = claims.filter(c => c.status === "approved").length;
  const deniedCount = claims.filter(c => ["denied", "rejected"].includes(c.status)).length;
  const decidedCount = approvedCount + deniedCount;
  const denialRate = decidedCount > 0 ? Math.round((deniedCount / decidedCount) * 100) : 0;

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col">
      {/* Page header */}
      <div className="border-b border-[#f3f4f6] bg-white">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
          {/* Breadcrumb + title */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-5">
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard"
                className="text-[#9ca3af] hover:text-[#16a34a] transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-[#f0fdf4] border border-[#bbf7d0] rounded-lg flex items-center justify-center">
                  <Columns3 className="h-4.5 w-4.5 text-[#16a34a]" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-semibold text-[#0a0a0a]">
                    Claims Pipeline
                  </h1>
                  <p className="text-xs text-[#9ca3af] hidden sm:block">
                    Drag claims between stages to update their status
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Stats bar */}
          {!loading && claims.length > 0 && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatPill
                icon={FileText}
                label="Total Claims"
                value={totalClaims.toString()}
              />
              <StatPill
                icon={DollarSign}
                label="Total Billed"
                value={`${totalBilled.toLocaleString()} JOD`}
              />
              <StatPill
                icon={Sparkles}
                label="Approved"
                value={approvedCount.toString()}
                highlight
              />
              <StatPill
                icon={TrendingDown}
                label="Denial Rate"
                value={`${denialRate}%`}
              />
            </div>
          )}
        </div>
      </div>

      {/* Pipeline board */}
      <div className="flex-1 bg-[#fafafa]">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <PipelineBoard />
        </div>
      </div>
    </div>
  );
}

function StatPill({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg border ${
        highlight
          ? "bg-[#f0fdf4] border-[#bbf7d0]"
          : "bg-white border-[#e5e7eb]"
      }`}
    >
      <Icon
        className={`h-4 w-4 flex-shrink-0 ${
          highlight ? "text-[#16a34a]" : "text-[#9ca3af]"
        }`}
      />
      <div className="min-w-0">
        <p className="text-[10px] sm:text-[11px] text-[#9ca3af] uppercase tracking-wide font-medium truncate">
          {label}
        </p>
        <p
          className={`text-sm sm:text-base font-bold ${
            highlight ? "text-[#16a34a]" : "text-[#0a0a0a]"
          }`}
        >
          {value}
        </p>
      </div>
    </div>
  );
}
