"use client";

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

// Mock aggregated stats for the header bar
const STATS = {
  totalClaims: 47,
  totalSubmitted: 284_600,
  revenueSaved: 42_350,
  denialRate: 8.2,
};

export default function PipelinePage() {
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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatPill
              icon={FileText}
              label="Claims This Month"
              value={STATS.totalClaims.toString()}
            />
            <StatPill
              icon={DollarSign}
              label="Total Submitted"
              value={`$${STATS.totalSubmitted.toLocaleString()}`}
            />
            <StatPill
              icon={Sparkles}
              label="Revenue Saved by AI"
              value={`$${STATS.revenueSaved.toLocaleString()}`}
              highlight
            />
            <StatPill
              icon={TrendingDown}
              label="Denial Rate"
              value={`${STATS.denialRate}%`}
            />
          </div>
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
