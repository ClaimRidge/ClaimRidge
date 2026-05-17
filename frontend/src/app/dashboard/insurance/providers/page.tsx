"use client";

import Link from "next/link";
import { LayoutDashboard, Users } from "lucide-react";
import Button from "@/components/ui/Button";

export default function InsurerProvidersComingSoon() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#f9fafb]">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 bg-[#f0faf4] border border-[#dcfce7] rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Users className="h-8 w-8 text-[#16a34a]" />
        </div>
        <h1 className="text-3xl font-bold text-[#0a0a0a] mb-3 font-display">
          Module Under Construction
        </h1>
        <p className="text-[#6b7280] mb-8 leading-relaxed"> 
          Soon you will be able to manage your network and credentialing here.
        </p>
        
        <Link href="/dashboard/insurance">
          <Button className="gap-2 px-8">
            <LayoutDashboard className="h-4 w-4" />
            Back to Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}
