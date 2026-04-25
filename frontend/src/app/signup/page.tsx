"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { Shield, Building2, Stethoscope, ArrowRight, ArrowLeft } from "lucide-react";

type Role = "provider" | "insurance" | null;

export default function SignupPage() {
  const [step, setStep] = useState(1);
  const [role, setRole] = useState<Role>(null);
  
  // Step 1: Auth Info
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  // Step 3: Provider Fields
  const [providerDetails, setProviderDetails] = useState({
    legalNameEn: "",
    legalNameAr: "",
    licenseNumber: "",
    address: "",
    primaryEmail: ""
  });

  // Step 3: Insurance Fields
  const [insuranceDetails, setInsuranceDetails] = useState({
    companyNameEn: "",
    companyNameAr: "",
    licenseNumber: "",
    payerCode: "",
    jurisdiction: "",
    policySetup: "",
    tariffSchedules: "",
    autoApproveThreshold: ""
  });

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const supabase = createClient();
  const router = useRouter();

  const handleNextStep1 = (e: React.FormEvent) => {
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
    setStep(2);
  };

  const handleNextStep2 = () => {
    if (!role) {
      setError("Please select an account type to continue.");
      return;
    }
    setError("");
    setStep(3);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      let metadata = {};
      
      if (role === "provider") {
        metadata = {
          account_type: "provider",
          organization_name: providerDetails.legalNameEn,
          license_number: providerDetails.licenseNumber,
          contact_email: providerDetails.primaryEmail,
          config_json: {
            organization_name_ar: providerDetails.legalNameAr,
            address: providerDetails.address
          }
        };
      } else {
        metadata = {
          account_type: "insurance",
          organization_name: insuranceDetails.companyNameEn,
          license_number: insuranceDetails.licenseNumber,
          payer_code: insuranceDetails.payerCode,
          config_json: {
            organization_name_ar: insuranceDetails.companyNameAr,
            jurisdiction: insuranceDetails.jurisdiction,
            policy_setup: insuranceDetails.policySetup,
            tariff_schedules: insuranceDetails.tariffSchedules,
            auto_approve_threshold: insuranceDetails.autoApproveThreshold
          }
        };
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: metadata,
          emailRedirectTo: `${location.origin}/auth/callback`,
        },
      });

      if (error) {
        setError(error.message);
        return;
      }

      // In dev mode with email confirmation disabled, we can redirect immediately
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // The success screen is removed for now as requested

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center px-4 py-12 bg-[#f9fafb]">
      {step > 1 && (
        <button 
          onClick={() => setStep(step - 1)}
          className="mb-6 flex items-center text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors self-start max-w-2xl mx-auto w-full"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </button>
      )}

      <div className={`w-full ${step === 3 ? "max-w-2xl" : "max-w-md"}`}>
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl mb-4">
            <Shield className="h-6 w-6 text-[#16a34a]" />
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#0a0a0a]">
            {step === 1 && "Create your account"}
            {step === 2 && "Choose account type"}
            {step === 3 && role === "provider" && "Provider Details"}
            {step === 3 && role === "insurance" && "Insurance Details"}
          </h1>
          <p className="text-[#6b7280] mt-1">
            {step === 1 && "Join ClaimRidge to streamline your claims"}
            {step === 2 && "Select how you will use the platform"}
            {step === 3 && "Complete your organization profile to continue"}
          </p>
        </div>

        <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm p-5 sm:p-8">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 border border-red-200 mb-6">
              {error}
            </div>
          )}

          {/* STEP 1: AUTH INFO */}
          {step === 1 && (
            <form onSubmit={handleNextStep1} className="space-y-5">
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

              <Button type="submit" className="w-full" size="lg">
                Continue <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </form>
          )}

          {/* STEP 2: CHOOSE ROLE */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4">
                <button
                  type="button"
                  onClick={() => setRole("provider")}
                  className={`flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all ${
                    role === "provider"
                      ? "border-[#16a34a] bg-[#f0fdf4]"
                      : "border-gray-200 hover:border-[#16a34a]/30 hover:bg-gray-50"
                  }`}
                >
                  <div className={`p-3 rounded-lg ${role === "provider" ? "bg-[#16a34a] text-white" : "bg-gray-100 text-gray-500"}`}>
                    <Stethoscope className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className={`font-bold ${role === "provider" ? "text-[#16a34a]" : "text-gray-900"}`}>Provider (Clinic / Hospital)</h3>
                    <p className="text-sm text-gray-500 mt-1">I want to submit medical claims, check validation rules, and track reimbursements.</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setRole("insurance")}
                  className={`flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all ${
                    role === "insurance"
                      ? "border-[#16a34a] bg-[#f0fdf4]"
                      : "border-gray-200 hover:border-[#16a34a]/30 hover:bg-gray-50"
                  }`}
                >
                  <div className={`p-3 rounded-lg ${role === "insurance" ? "bg-[#16a34a] text-white" : "bg-gray-100 text-gray-500"}`}>
                    <Building2 className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className={`font-bold ${role === "insurance" ? "text-[#16a34a]" : "text-gray-900"}`}>Insurance Company (Payer)</h3>
                    <p className="text-sm text-gray-500 mt-1">I want to receive claims, set adjudication rules, and automate reviews.</p>
                  </div>
                </button>
              </div>
              <Button onClick={handleNextStep2} className="w-full" size="lg">
                Continue <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          )}

          {/* STEP 3: PROVIDER DETAILS */}
          {step === 3 && role === "provider" && (
            <form onSubmit={handleSignup} className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-900 border-b pb-2">Practice Identity</h3>
                  <Input id="legalNameEn" label="Legal Name (English)" value={providerDetails.legalNameEn} onChange={e => setProviderDetails({...providerDetails, legalNameEn: e.target.value})} required />
                  <Input id="legalNameAr" label="Legal Name (Arabic)" value={providerDetails.legalNameAr} onChange={e => setProviderDetails({...providerDetails, legalNameAr: e.target.value})} />
                </div>
                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-900 border-b pb-2">Location & Contact</h3>
                  <Input id="address" label="Physical Address" value={providerDetails.address} onChange={e => setProviderDetails({...providerDetails, address: e.target.value})} required />
                  <Input id="primaryEmail" label="Primary Administrative Email" type="email" value={providerDetails.primaryEmail} onChange={e => setProviderDetails({...providerDetails, primaryEmail: e.target.value})} required />
                </div>
              </div>
              
              <div className="max-w-md mx-auto pt-4 border-t border-gray-100">
                <Input 
                  id="licenseNumber" 
                  label="Facility License Number" 
                  value={providerDetails.licenseNumber} 
                  onChange={e => setProviderDetails({...providerDetails, licenseNumber: e.target.value})} 
                  required 
                  className="text-center"
                />
              </div>

              <Button type="submit" loading={loading} className="w-full" size="lg">
                {loading ? "Creating account..." : "Complete Sign Up"}
              </Button>
            </form>
          )}

          {/* STEP 3: INSURANCE DETAILS */}
          {step === 3 && role === "insurance" && (
            <form onSubmit={handleSignup} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-900 border-b pb-2">Corporate Identity</h3>
                  <Input id="companyNameEn" label="Company Name (English)" value={insuranceDetails.companyNameEn} onChange={e => setInsuranceDetails({...insuranceDetails, companyNameEn: e.target.value})} required />
                  <Input id="companyNameAr" label="Company Name (Arabic)" value={insuranceDetails.companyNameAr} onChange={e => setInsuranceDetails({...insuranceDetails, companyNameAr: e.target.value})} />
                  <Input id="licenseNumberIns" label="Insurance License Number" value={insuranceDetails.licenseNumber} onChange={e => setInsuranceDetails({...insuranceDetails, licenseNumber: e.target.value})} required />
                  <Input id="payerCode" label="Unique Payer Code" value={insuranceDetails.payerCode} onChange={e => setInsuranceDetails({...insuranceDetails, payerCode: e.target.value})} required />
                  <Input id="jurisdiction" label="Regulatory Jurisdiction (e.g. Jordan PDPL)" value={insuranceDetails.jurisdiction} onChange={e => setInsuranceDetails({...insuranceDetails, jurisdiction: e.target.value})} required />
                </div>
                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-900 border-b pb-2">Adjudication & Rules Setup</h3>
                  <Input id="policySetup" label="Policy & Member Data rules" placeholder="e.g. Maternity waiting periods" value={insuranceDetails.policySetup} onChange={e => setInsuranceDetails({...insuranceDetails, policySetup: e.target.value})} />
                  <Input id="tariffSchedules" label="Tariff/Contract Schedules setup" placeholder="e.g. Network A rates" value={insuranceDetails.tariffSchedules} onChange={e => setInsuranceDetails({...insuranceDetails, tariffSchedules: e.target.value})} />
                  <Input id="autoApproveThreshold" label="Adjudication Auto-Approve Threshold" placeholder="e.g. Claims under 50 JOD with 0 risk flags" value={insuranceDetails.autoApproveThreshold} onChange={e => setInsuranceDetails({...insuranceDetails, autoApproveThreshold: e.target.value})} required />
                </div>
              </div>
              <Button type="submit" loading={loading} className="w-full" size="lg">
                {loading ? "Creating account..." : "Complete Sign Up"}
              </Button>
            </form>
          )}

        </div>

        {step === 1 && (
          <p className="text-center text-sm text-[#6b7280] mt-6">
            Already have an account?{" "}
            <Link href="/login" className="text-[#16a34a] font-semibold hover:text-[#15803d]">
              Sign in
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
