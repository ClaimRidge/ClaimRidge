"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { ArrowRight, ArrowLeft } from "lucide-react";
import ClaimRidgeLogo from "@/components/ClaimRidgeLogo";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  
  const supabase = createClient();
  const router = useRouter();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${location.origin}/auth/callback`,
        },
      });

      if (error) {
        setError(error.message);
        return;
      }

      // Automatically push them to the workspace setup page
      router.push("/onboarding");
      router.refresh();
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center px-4 py-8 bg-[#f9fafb]">
      <button 
        onClick={() => router.push("/")}
        className="mb-6 flex items-center text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors self-start max-w-md mx-auto w-full"
      >
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to Home
      </button>

      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="flex justify-center mb-4">
            <ClaimRidgeLogo size={36} />
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#0a0a0a]">
            Create your account
          </h1>
          <p className="text-[#6b7280] mt-1">
            Set up your AI Pre-Authorisation Engine workspace
          </p>
        </div>

        <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm p-5 sm:p-6">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 border border-red-200 mb-6">
              {error}
            </div>
          )}

          <form onSubmit={handleSignup} className="space-y-5">
            <Input
              id="email"
              label="Work Email"
              type="email"
              placeholder="you@insurancecompany.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              id="password"
              label="Password"
              type="password"
              placeholder="Min. 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Input
              id="confirmPassword"
              label="Confirm Password"
              type="password"
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />

            <Button type="submit" loading={loading} className="w-full" size="lg">
              Continue <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </form>
        </div>

        <p className="text-center text-sm text-[#6b7280] mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-[#16a34a] font-semibold hover:text-[#15803d]">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}