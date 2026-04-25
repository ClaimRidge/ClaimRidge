"use client";

import { Construction, Sparkles } from "lucide-react";
import Link from "next/link";

interface UnderConstructionProps {
  moduleName: string;
  description: string;
}

export default function UnderConstruction({ moduleName, description }: UnderConstructionProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 text-center">
      <div className="relative mb-8">
        <div className="absolute -inset-4 bg-gradient-to-r from-[#16a34a]/20 to-[#0A1628]/20 rounded-full blur-2xl animate-pulse" />
        <div className="relative bg-white border border-[#e5e7eb] p-6 rounded-3xl shadow-xl">
          <Construction className="h-16 w-16 text-[#0A1628]" />
        </div>
        <Sparkles className="absolute -top-2 -right-2 h-6 w-6 text-yellow-400 animate-bounce" />
      </div>

      <h1 className="font-display text-4xl font-bold text-[#0a0a0a] mb-4">
        {moduleName} <span className="text-[#16a34a]">Under Construction</span>
      </h1>
      
      <p className="max-w-md text-[#6b7280] text-lg mb-8">
        {description} We're building a state-of-the-art engine for this module. 
        It will be available in the next major update.
      </p>

      <div className="flex gap-4">
        <Link 
          href="/insurer/dashboard"
          className="bg-[#0A1628] text-white px-6 py-3 rounded-xl font-medium hover:bg-[#112440] transition-all shadow-lg shadow-[#0A1628]/10"
        >
          Back to Dashboard
        </Link>
        <Link 
          href="/insurer/settings"
          className="bg-white text-[#0A1628] border border-[#e5e7eb] px-6 py-3 rounded-xl font-medium hover:bg-[#f9fafb] transition-all"
        >
          Configure Module
        </Link>
      </div>

      <div className="mt-12 grid grid-cols-3 gap-8 opacity-40">
        <div className="h-1 w-24 bg-[#0A1628] rounded-full" />
        <div className="h-1 w-24 bg-[#16a34a] rounded-full" />
        <div className="h-1 w-24 bg-[#0A1628] rounded-full" />
      </div>
    </div>
  );
}
