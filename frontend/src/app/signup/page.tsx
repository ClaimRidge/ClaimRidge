"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { ArrowRight, ArrowLeft, Stethoscope, Building2, ShieldCheck, Mail, Lock, Sparkles, AlertCircle } from "lucide-react";
import ClaimRidgeLogo from "@/components/ClaimRidgeLogo";

type SignupRole = "doctor" | "organization" | null;
type OrgType = "provider" | "insurance" | null;

export default function SignupPage() {
  const [step, setStep] = useState(1);
  const [role, setRole] = useState<SignupRole>(null);
  
  // Credentials
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Organization Specifics
  const [orgType, setOrgType] = useState<OrgType>(null);
  const [providerDetails, setProviderDetails] = useState({
    legalNameEn: "",
    legalNameAr: "",
    address: "",
    primaryEmail: "",
    licenseNumber: "",
  });

  const [insuranceDetails, setInsuranceDetails] = useState({
    companyNameEn: "",
    companyNameAr: "",
    cbjLicense: "",
    commercialLicense: "",
    country: "Jordan",
    policyFileBase64: "",
    policyFileName: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const supabase = createClient();
  const router = useRouter();

  const handleNextStep1 = () => {
    if (!role) {
      setError("Please select a registration pathway to continue.");
      return;
    }
    setError("");
    setStep(2);
  };

  const handleNextStep2 = () => {
    setError("");
    if (!email || !password || !confirmPassword) {
      setError("Please complete all credentials fields.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (role === "organization" && !orgType) {
      setError("Please select your organization type.");
      return;
    }
    setStep(3);
  };

  // Direct Doctor Registration (registers in Supabase Auth & sends to onboarding)
  const handleDoctorSignup = async (e?: React.FormEvent) => {
    e?.preventDefault();
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
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${location.origin}/auth/callback`,
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
      }

      if (!data.session) {
        router.push("/login?signup=pending");
        return;
      }

      // Direct Doctor goes to doctor-only onboarding
      router.push("/onboarding?role=doctor");
    } catch (err: any) {
      setError(err?.message || "An unexpected error occurred.");
      setLoading(false);
    }
  };

  // Waitlist Application Submission
  const handleWaitlistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Validate details
    if (orgType === "insurance" && !insuranceDetails.policyFileBase64) {
      setError("Please upload your Medical Guidelines & Policy Rules handbook.");
      setLoading(false);
      return;
    }

    const details = orgType === "insurance" ? insuranceDetails : providerDetails;

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/waitlist`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
          account_type: orgType,
          details,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to submit waitlist application.");
      }

      // Show step 4: Success confirmation screen
      setStep(4);
    } catch (err: any) {
      setError(err?.message || "An unexpected error occurred during submission.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center px-4 py-8 bg-[#f9fafb]">
      {step < 4 && (
        <button
          onClick={() => {
            if (step > 1) {
              setStep(step - 1);
              setError("");
            } else {
              router.push("/");
            }
          }}
          className="mb-6 flex items-center text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors self-start max-w-lg mx-auto w-full"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> {step > 1 ? "Back" : "Back to Home"}
        </button>
      )}

      <div className={`w-full ${step === 3 && orgType === "insurance" ? "max-w-2xl" : "max-w-md"}`}>
        {step < 4 && (
          <div className="text-center mb-6">
            <div className="flex justify-center mb-4">
              <ClaimRidgeLogo size={36} />
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#0a0a0a]">
              {role === "organization" ? "Join the Waitlist" : "Create your account"}
            </h1>
            <p className="text-[#6b7280] mt-1.5 text-sm">
              {role === "organization" 
                ? "Apply for exclusive access to the ClaimRidge Enterprise Platform." 
                : "Join ClaimRidge to manage and streamline your claims."}
            </p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 border border-red-200 mb-6 flex items-start gap-2 max-w-md mx-auto w-full">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* STEP 1: Pathways selector */}
        {step === 1 && (
          <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm p-6 space-y-6">
            <div className="space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Select registration path</h2>
              <RoleButton
                selected={role === "doctor"}
                onClick={() => setRole("doctor")}
                icon={<Stethoscope className="h-6 w-6" />}
                title="Individual Doctor"
                desc="Link with hospitals or sign up for direct, active clinical workflow."
              />
              <RoleButton
                selected={role === "organization"}
                onClick={() => setRole("organization")}
                icon={<Building2 className="h-6 w-6" />}
                title="Organization (Hospital / Clinic / Insurer)"
                desc="Exclusive enterprise operations. Access claims, billing, and AI rules."
              />
            </div>
            <Button onClick={handleNextStep1} className="w-full" size="lg">
              Continue <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        )}

        {/* STEP 2: Credentials and Role */}
        {step === 2 && (
          <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm p-6 space-y-5">
            <h3 className="font-semibold text-gray-900 border-b pb-2">Credentials Setup</h3>
            <Input
              id="email"
              label="Account Email"
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

            {role === "organization" && (
              <div className="space-y-3 pt-3 border-t border-gray-100">
                <h3 className="font-semibold text-gray-900">Organization Type</h3>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setOrgType("provider")}
                    className={`flex flex-col items-center gap-2 p-3 rounded-lg border text-sm transition-all ${
                      orgType === "provider" 
                        ? "border-[#16a34a] bg-[#f0fdf4] font-semibold text-[#16a34a]" 
                        : "border-gray-200 hover:border-gray-300 text-gray-600"
                    }`}
                  >
                    <Stethoscope className="h-5 w-5" />
                    Provider
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrgType("insurance")}
                    className={`flex flex-col items-center gap-2 p-3 rounded-lg border text-sm transition-all ${
                      orgType === "insurance" 
                        ? "border-[#16a34a] bg-[#f0fdf4] font-semibold text-[#16a34a]" 
                        : "border-gray-200 hover:border-gray-300 text-gray-600"
                    }`}
                  >
                    <Building2 className="h-5 w-5" />
                    Insurer
                  </button>
                </div>
              </div>
            )}

            <Button
              onClick={() => (role === "doctor" ? handleDoctorSignup() : handleNextStep2())}
              type="button"
              className="w-full"
              size="lg"
              loading={loading}
            >
              {role === "doctor" ? "Create Doctor Account" : "Next Step"} <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        )}

        {/* STEP 3: Waitlist Details Form */}
        {step === 3 && role === "organization" && (
          <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm p-6 space-y-6">
            <h3 className="font-bold text-gray-900 border-b pb-3 text-lg">
              {orgType === "provider" ? "Provider Facility Information" : "Insurer Company Details"}
            </h3>

            {orgType === "provider" && (
              <form onSubmit={handleWaitlistSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input id="legalNameEn" label="Legal Name (English)" value={providerDetails.legalNameEn} onChange={(e) => setProviderDetails({ ...providerDetails, legalNameEn: e.target.value })} required />
                  <Input id="legalNameAr" label="Legal Name (Arabic)" value={providerDetails.legalNameAr} onChange={(e) => setProviderDetails({ ...providerDetails, legalNameAr: e.target.value })} />
                  <Input id="primaryEmail" label="Administrative Email" type="email" value={providerDetails.primaryEmail} onChange={(e) => setProviderDetails({ ...providerDetails, primaryEmail: e.target.value })} required />
                  <Input id="address" label="Facility Address" value={providerDetails.address} onChange={(e) => setProviderDetails({ ...providerDetails, address: e.target.value })} required />
                </div>
                <Input id="licenseNumber" label="Facility License Number" value={providerDetails.licenseNumber} onChange={(e) => setProviderDetails({ ...providerDetails, licenseNumber: e.target.value })} required className="text-center max-w-sm mx-auto" />
                
                <Button 
                  type="submit" 
                  loading={loading} 
                  className={`w-full transition-all ${error ? "bg-red-600 border-red-600 hover:bg-red-700 hover:border-red-700" : ""}`}
                >
                  {loading ? "Submitting Request..." : error ? "Error - Try Again" : "Submit Waitlist Request"}
                </Button>
              </form>
            )}

            {orgType === "insurance" && (
              <form onSubmit={handleWaitlistSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-4">
                    <h4 className="font-semibold text-gray-800 text-xs uppercase tracking-wider">Company Identity</h4>
                    <Input id="companyNameEn" label="Company Name (English)" value={insuranceDetails.companyNameEn} onChange={(e) => setInsuranceDetails({ ...insuranceDetails, companyNameEn: e.target.value })} required />
                    <Input id="companyNameAr" label="Company Name (Arabic)" value={insuranceDetails.companyNameAr} onChange={(e) => setInsuranceDetails({ ...insuranceDetails, companyNameAr: e.target.value })} />
                    <div className="space-y-1.5">
                      <label htmlFor="country" className="block text-sm font-medium text-gray-700">Country (MENA)</label>
                      <Select
                        id="country"
                        value={insuranceDetails.country}
                        onChange={(country) => setInsuranceDetails({ ...insuranceDetails, country })}
                        options={["Algeria","Bahrain","Egypt","Iraq","Jordan","Kuwait","Lebanon","Libya","Morocco","Oman","Palestine","Qatar","Saudi Arabia","Syria","Tunisia","United Arab Emirates","Yemen"].map((c) => ({ value: c, label: c }))}
                      />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h4 className="font-semibold text-gray-800 text-xs uppercase tracking-wider">Legal Verification</h4>
                    <Input id="cbjLicense" label="CBJ Operations License" value={insuranceDetails.cbjLicense} onChange={(e) => setInsuranceDetails({ ...insuranceDetails, cbjLicense: e.target.value })} required placeholder="e.g. CBJ-OPS-1234" />
                    <Input id="commercialLicense" label="Commercial License Number" value={insuranceDetails.commercialLicense} onChange={(e) => setInsuranceDetails({ ...insuranceDetails, commercialLicense: e.target.value })} required placeholder="e.g. COM-5678" />
                  </div>
                </div>

                <div className="bg-[#fcfdfc] border border-[#f0fdf4] rounded-2xl p-5 shadow-sm">
                  <label className="block text-sm font-bold text-[#0a0a0a] mb-1">
                    Medical Guidelines & Policy Rules <span className="text-red-500 font-normal">*</span>
                  </label>
                  <p className="text-xs text-[#6b7280] mb-4">Upload your company guidelines as a PDF or Word document.</p>
                  <input
                    id="policyFileInput"
                    type="file"
                    accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    required={!insuranceDetails.policyFileBase64}
                    disabled={loading}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = () => {
                          const base64 = (reader.result as string).split(",")[1];
                          setInsuranceDetails((prev) => ({ ...prev, policyFileBase64: base64, policyFileName: file.name }));
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                    className="w-full px-4 py-3 bg-white border-2 border-dashed border-[#e5e7eb] hover:border-[#16a34a] rounded-xl text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[#f0fdf4] file:text-[#16a34a] hover:file:bg-[#dcfce7] cursor-pointer transition-all disabled:opacity-50"
                  />
                  {insuranceDetails.policyFileName && (
                    <div className="mt-3 flex items-center justify-between bg-[#f0fdf4] border border-[#dcfce7] rounded-xl px-4 py-2 shadow-sm">
                      <span className="text-xs text-[#16a34a] font-semibold flex items-center gap-1.5">
                        <ShieldCheck className="h-4 w-4" /> {insuranceDetails.policyFileName} ready
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setInsuranceDetails((prev) => ({ ...prev, policyFileBase64: "", policyFileName: "" }));
                          const input = document.getElementById("policyFileInput") as HTMLInputElement;
                          if (input) input.value = "";
                        }}
                        className="text-red-500 hover:text-red-700 text-xs font-semibold flex items-center gap-1 hover:underline ml-2 transition-all"
                      >
                        ✕ Remove
                      </button>
                    </div>
                  )}
                </div>

                <Button 
                  type="submit" 
                  loading={loading} 
                  className={`w-full transition-all ${error ? "bg-red-600 border-red-600 hover:bg-red-700 hover:border-red-700 text-white" : ""}`}
                >
                  {loading ? "Submitting Application..." : error ? "Error - Try Again" : "Submit Waitlist Application"}
                </Button>
              </form>
            )}
          </div>
        )}

        {/* STEP 4: Success confirmation screen */}
        {step === 4 && (
          <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm p-8 text-center max-w-md mx-auto w-full">
            <div className="flex justify-center mb-6">
              <ClaimRidgeLogo size={36} />
            </div>

            <div className="inline-flex items-center justify-center w-16 h-16 bg-[#ecfdf5] rounded-full mb-6 text-[#16a34a]">
              <Sparkles className="h-8 w-8 animate-pulse" />
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
              <div><span className="font-medium text-gray-500">Status:</span> Pending Admin Review</div>
            </div>

            <Button
              onClick={() => router.push("/")}
              variant="outline"
              className="w-full flex items-center justify-center gap-2"
            >
              Back to Home
            </Button>
          </div>
        )}

        {step < 4 && (
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

function RoleButton({ selected, onClick, icon, title, desc }: { selected: boolean; onClick: () => void; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all ${
        selected ? "border-[#16a34a] bg-[#f0fdf4]" : "border-gray-200 hover:border-[#16a34a]/30 hover:bg-gray-50"
      }`}
    >
      <div className={`p-3 rounded-lg ${selected ? "bg-[#16a34a] text-white" : "bg-gray-100 text-gray-500"}`}>{icon}</div>
      <div>
        <h3 className={`font-bold ${selected ? "text-[#16a34a]" : "text-gray-900"}`}>{title}</h3>
        <p className="text-sm text-gray-500 mt-1">{desc}</p>
      </div>
    </button>
  );
}
