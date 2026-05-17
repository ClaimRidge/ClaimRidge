"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import { Clock, Mail, LogOut, CheckCircle2 } from "lucide-react";
import ClaimRidgeLogo from "@/components/ClaimRidgeLogo";

export default function WaitlistPendingPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setEmail(user.email || "");
        // If they are approved, push them to dashboard
        const { data: profile } = await supabase
          .from("profiles")
          .select("approved")
          .eq("id", user.id)
          .maybeSingle();
        if (profile?.approved) {
          router.push("/dashboard");
        }
      } else {
        router.push("/login");
      }
    };
    checkUser();
  }, [router, supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center px-4 py-8 bg-[#f9fafb]">
      <div className="w-full max-w-md bg-white border border-[#e5e7eb] rounded-xl shadow-sm p-8 text-center">
        <div className="flex justify-center mb-6">
          <ClaimRidgeLogo size={36} />
        </div>

        <div className="inline-flex items-center justify-center w-16 h-16 bg-[#fef3c7] rounded-full mb-6 text-amber-500">
          <Clock className="h-8 w-8" />
        </div>

        <h1 className="font-display text-2xl font-extrabold text-[#0a0a0a] mb-3">
          Request Sent Successfully!
        </h1>
        
        <p className="text-[#6b7280] text-sm leading-relaxed mb-6">
          Your request has been successfully sent to our administration team. We will review your details and contact you as soon as possible.
        </p>

        <div className="bg-gray-50 border border-gray-100 rounded-lg p-4 mb-8 text-left text-xs text-gray-600 space-y-2">
          <div className="font-bold text-gray-900 mb-1">Registered Details:</div>
          <div><span className="font-medium text-gray-500">Account Email:</span> {email}</div>
          <div><span className="font-medium text-gray-500">Status:</span> Request Sent</div>
        </div>

        <p className="text-xs text-[#9ca3af] mb-8">
          We will contact you shortly at <span className="font-medium">{email}</span>.
        </p>

        <div className="space-y-3">
          <Button
            onClick={handleLogout}
            variant="outline"
            className="w-full flex items-center justify-center gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
          >
            <LogOut className="h-4 w-4" /> Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}
