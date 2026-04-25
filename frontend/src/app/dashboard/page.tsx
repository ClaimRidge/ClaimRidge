"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function DashboardRedirect() {
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function checkUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      // 1. Check user_metadata (from signup/auth)
      const userMeta = user.user_metadata;
      const accountType = userMeta?.account_type;

      if (accountType === "insurance") {
        router.push("/dashboard/insurance");
        return;
      } else if (accountType === "provider") {
        router.push("/dashboard/provider");
        return;
      }

      // 2. Fallback: Check profiles table
      const { data: profile } = await supabase
        .from("profiles")
        .select("account_type")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.account_type === "insurance") {
        router.push("/dashboard/insurance");
      } else if (profile?.account_type === "provider") {
        router.push("/dashboard/provider");
      } else {
        // 3. Last resort: check insurer_profiles directly
        const { data: insurerProfile } = await supabase
          .from("insurer_profiles")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();
        
        if (insurerProfile) {
          router.push("/dashboard/insurance");
        } else {
          router.push("/onboarding");
        }
      }
    }
    checkUser();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f9fafb]">
      <div className="animate-spin h-8 w-8 border-4 border-[#16a34a] border-t-transparent rounded-full" />
    </div>
  );
}
