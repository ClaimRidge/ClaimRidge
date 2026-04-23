"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { Shield, Building2, Stethoscope } from "lucide-react";

type Role = "clinic" | "insurer";

// TODO: For production, insurer signup should be invite-only (signed token → prefilled signup).
// Public insurer self-registration is fine for demo/pilot phase.

export default function SignupPage() {
  const [role, setRole] = useState<Role>("clinic");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const supabase = createClient();

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

    if (!companyName.trim()) {
      setError(role === "clinic" ? "Clinic name is required." : "Company name is required.");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            role,
            company_name: companyName,
          },
          emailRedirectTo: `${location.origin}/auth/callback`,
        },
      });

      if (error) {
        setError(error.message);
        return;
      }

      setSuccess(true);
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12 bg-[#f9fafb]">
        <div className="w-full max-w-md text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl mb-4">
            <Shield className="h-6 w-6 text-[#16a34a]" />
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#0a0a0a] mb-2">Check your email</h1>
          <p className="text-[#6b7280]">
            We&apos;ve sent a confirmation link to <strong className="text-[#0a0a0a]">{email}</strong>.
            Click the link to activate your account.
          </p>
          <Link
            href="/login"
            className="inline-block mt-6 text-[#16a34a] font-semibold hover:text-[#15803d]"
          >
            Back to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12 bg-[#f9fafb]">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl mb-4">
            <Shield className="h-6 w-6 text-[#16a34a]" />
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#0a0a0a]">Create your account</h1>
          <p className="text-[#6b7280] mt-1">Join ClaimRidge as a provider or insurer</p>
        </div>

        <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm p-5 sm:p-8">
          <form onSubmit={handleSignup} className="space-y-5">
            {error && (
              <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 border border-red-200">
                {error}
              </div>
            )}

            {/* Role Toggle */}
            <div>
              <label className="block text-sm font-medium text-[#374151] mb-2">I am a</label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-[#f3f4f6] rounded-lg">
                <button
                  type="button"
                  onClick={() => setRole("clinic")}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-all ${
                    role === "clinic"
                      ? "bg-white shadow-sm text-[#0a0a0a] ring-1 ring-[#e5e7eb]"
                      : "text-[#6b7280] hover:text-[#374151]"
                  }`}
                >
                  <Stethoscope className="h-4 w-4" />
                  Clinic / Hospital
                </button>
                <button
                  type="button"
                  onClick={() => setRole("insurer")}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-all ${
                    role === "insurer"
                      ? "bg-white shadow-sm text-[#0a0a0a] ring-1 ring-[#e5e7eb]"
                      : "text-[#6b7280] hover:text-[#374151]"
                  }`}
                >
                  <Building2 className="h-4 w-4" />
                  Insurance Company
                </button>
              </div>
            </div>

            <Input
              id="fullName"
              label="Full Name"
              type="text"
              placeholder="Dr. Ahmad Khalil"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />

            <Input
              id="companyName"
              label={role === "clinic" ? "Clinic / Hospital Name" : "Company Name"}
              type="text"
              placeholder={role === "clinic" ? "Al-Khalidi Medical Center" : "Jordan Insurance Company"}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
            />

            <Input
              id="email"
              label="Email"
              type="email"
              placeholder="you@company.com"
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
              {loading ? "Creating account..." : "Create Account"}
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
