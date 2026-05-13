import ClaimForm from "@/components/ClaimForm";
import { FileCheck, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function NewClaimPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
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
        <div className="flex items-center gap-3 mb-2">
          <div className="inline-flex items-center justify-center w-11 h-11 bg-[#f0fdf4] border border-[#bbf7d0] rounded-lg">
            <FileCheck className="h-5 w-5 text-[#16a34a]" />
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#0a0a0a]">New Claim</h1>
        </div>
        <p className="text-[#6b7280] ml-0 sm:ml-[56px] text-sm sm:text-base">
          Enter the claim details below and our AI will scrub it for errors, coding issues, and payer rule violations.
        </p>
      </div>

      <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm p-6 md:p-8">
        <ClaimForm />
      </div>
    </div>
  );
}
