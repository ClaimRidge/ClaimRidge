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

      // Check if they have an insurer linked. If not, they need to onboard.
      const { data: profile } = await supabase
        .from("profiles")
        .select("insurer_id")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile?.insurer_id) {
        router.push("/onboarding");
      } else {
        router.push("/dashboard/insurance");
      }
    };
    
    routeUser();
  }, [router]);

  return (
    <div className="fixed inset-0 z-[100] bg-white flex items-center justify-center">
      <div className="animate-spin h-8 w-8 border-4 border-[#16a34a] border-t-transparent rounded-full" />
    </div>
  );
}