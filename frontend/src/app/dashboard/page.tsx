"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function DashboardRedirect() {
  const router = useRouter();

  useEffect(() => {
    const routeUser = async () => {
      const supabase = createClient();
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

      if (profile.account_type === "insurance") {
        router.push("/dashboard/insurance");
      } else if (profile.account_type === "provider") {
        router.push("/dashboard/provider");
      } else if (profile.account_type === "doctor") {
        router.push("/dashboard/doctor");
      } else {
        router.push("/dashboard/provider");
      }
    };

    routeUser();
  }, [router]);

  return (
    <div className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center">
      <div className="relative">
        {/* Outer Glow */}
        <div className="absolute inset-0 bg-[#16a34a] blur-[60px] opacity-10 animate-pulse" />
        
        <div className="relative flex flex-col items-center">
          {/* Pulsing Spinner */}
          <div className="relative w-20 h-20 mb-8">
            <div className="absolute inset-0 border-4 border-[#f0fdf4] rounded-full" />
            <div className="absolute inset-0 border-4 border-[#16a34a] border-t-transparent rounded-full animate-spin" />
            <div className="absolute inset-2 bg-[#f0fdf4]/50 rounded-full animate-pulse" />
          </div>

          <div className="text-center">
            <h2 className="font-display text-2xl font-extrabold text-[#0a0a0a] tracking-tight">
              Preparing Workspace
            </h2>
            <div className="mt-2 flex items-center justify-center gap-2">
              <span className="w-1.5 h-1.5 bg-[#16a34a] rounded-full animate-bounce [animation-delay:-0.3s]" />
              <span className="w-1.5 h-1.5 bg-[#16a34a] rounded-full animate-bounce [animation-delay:-0.15s]" />
              <span className="w-1.5 h-1.5 bg-[#16a34a] rounded-full animate-bounce" />
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-12 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#9ca3af]">
          ClaimRidge
        </p>
        <p className="text-[10px] text-[#d1d5db] mt-1">
          Authorized access only
        </p>
      </div>
    </div>
  );
}
