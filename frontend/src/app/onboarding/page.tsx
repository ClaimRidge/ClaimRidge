"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { Shield, Building2, Stethoscope, ArrowRight, ArrowLeft, ShieldCheck } from "lucide-react";

type Role = "provider" | "insurance" | null;

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [user, setUser] = useState<any>(null);
  
  const supabase = createClient();
  const router = useRouter();

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
    policyFileBase64: "",
    policyFileName: ""
  });

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setUser(user);

      // Check if profile already exists and has account_type
      const { data: profile } = await supabase
        .from("profiles")
        .select("account_type")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.account_type) {
        if (profile.account_type === "insurance") {
          router.push("/dashboard/insurance");
        } else {
          router.push("/dashboard/provider");
        }
      }
    };
    checkUser();
  }, []);

  const handleNextStep1 = () => {
    if (!role) {
      setError("Please select an account type to continue.");
      return;
    }
    setError("");
    setStep(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      let profileData: any = {
        id: user.id,
        account_type: role,
      };

      if (role === "provider") {
        profileData = {
          ...profileData,
          organization_name: providerDetails.legalNameEn,
          license_number: providerDetails.licenseNumber,
          contact_email: providerDetails.primaryEmail,
          config_json: {
            organization_name_ar: providerDetails.legalNameAr,
            address: providerDetails.address
          }
        };
      } else {
        profileData = {
          ...profileData,
          organization_name: insuranceDetails.companyNameEn,
          license_number: insuranceDetails.licenseNumber,
          config_json: {
            organization_name_ar: insuranceDetails.companyNameAr,
            policy_file_base64: insuranceDetails.policyFileBase64,
            policy_file_name: insuranceDetails.policyFileName
          }
        };
      }

      const { error: profileError } = await supabase
        .from("profiles")
        .upsert(profileData);

      if (profileError) {
        setError(profileError.message);
        return;
      }

      // If insurance, also populate insurer_profiles
      if (role === "insurance") {
        const { error: insurerError } = await supabase
          .from("insurer_profiles")
          .upsert({
            user_id: user.id,
            company_name: insuranceDetails.companyNameEn,
            updated_at: new Date().toISOString(),
          });
        
        if (insurerError) {
          setError(insurerError.message);
          return;
        }
      }

      if (role === "insurance") {
        router.push("/dashboard/insurance");
      } else {
        router.push("/dashboard/provider");
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 bg-[#f9fafb]">
      <div className={`w-full ${step === 2 ? "max-w-2xl" : "max-w-md"}`}>
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl mb-4">
            <Shield className="h-6 w-6 text-[#16a34a]" />
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#0a0a0a]">
            {step === 1 ? "Complete your profile" : "Tell us more"}
          </h1>
          <p className="text-[#6b7280] mt-1">
            {step === 1 ? "Which type of user are you?" : "We need a few more details to set up your account."}
          </p>
        </div>

        <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm p-5 sm:p-8">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 border border-red-200 mb-6">
              {error}
            </div>
          )}

          {/* STEP 1: CHOOSE ROLE */}
          {step === 1 && (
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
                    <p className="text-sm text-gray-500 mt-1">Submit claims and track reimbursements.</p>
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
                    <p className="text-sm text-gray-500 mt-1">Receive claims and manage adjudication rules.</p>
                  </div>
                </button>
              </div>
              <Button onClick={handleNextStep1} className="w-full" size="lg">
                Next <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          )}

          {/* STEP 2: DETAILS */}
          {step === 2 && role === "provider" && (
            <form onSubmit={handleSubmit} className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-900 border-b pb-2">Practice Identity</h3>
                  <Input id="legalNameEn" label="Legal Name (English)" value={providerDetails.legalNameEn} onChange={e => setProviderDetails({...providerDetails, legalNameEn: e.target.value})} required />
                  <Input id="legalNameAr" label="Legal Name (Arabic)" value={providerDetails.legalNameAr} onChange={e => setProviderDetails({...providerDetails, legalNameAr: e.target.value})} />
                </div>
                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-900 border-b pb-2">Location & Contact</h3>
                  <Input id="address" label="Address" value={providerDetails.address} onChange={e => setProviderDetails({...providerDetails, address: e.target.value})} required />
                  <Input id="primaryEmail" label="Administrative Email" type="email" value={providerDetails.primaryEmail} onChange={e => setProviderDetails({...providerDetails, primaryEmail: e.target.value})} required />
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

              <div className="flex gap-4">
                <Button type="button" variant="outline" onClick={() => setStep(1)} className="flex-1">Back</Button>
                <Button type="submit" loading={loading} className="flex-1">Finish Setup</Button>
              </div>
            </form>
          )}

          {step === 2 && role === "insurance" && (
            <form onSubmit={handleSubmit} className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-gray-100">
                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-900">Company Identity</h3>
                  <Input id="companyNameEn" label="Company Name (English)" value={insuranceDetails.companyNameEn} onChange={e => setInsuranceDetails({...insuranceDetails, companyNameEn: e.target.value})} required />
                  <Input id="companyNameAr" label="Company Name (Arabic)" value={insuranceDetails.companyNameAr} onChange={e => setInsuranceDetails({...insuranceDetails, companyNameAr: e.target.value})} />
                </div>
                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-900">Legal Verification</h3>
                  <Input id="licenseNumberIns" label="License Number" value={insuranceDetails.licenseNumber} onChange={e => setInsuranceDetails({...insuranceDetails, licenseNumber: e.target.value})} required />
                  <p className="text-xs text-gray-500 mt-2">Enter your official regulatory license number to verify your organization.</p>
                </div>
              </div>

              <div className="bg-[#fcfdfc] border border-[#f0fdf4] rounded-2xl p-6 shadow-sm">
                <label className="block text-base font-bold text-[#0a0a0a] mb-1">
                  Policy & Member Data Rules <span className="text-gray-400 font-normal text-sm">(Optional)</span>
                </label>
                <p className="text-sm text-[#6b7280] mb-4">Upload your policy guidelines as a PDF. This helps our AI automate your claim reviews.</p>
                
                <div className="relative">
                  <input 
                    type="file" 
                    accept="application/pdf"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = () => {
                          const base64 = (reader.result as string).split(',')[1];
                          setInsuranceDetails(prev => ({ 
                            ...prev, 
                            policyFileBase64: base64,
                            policyFileName: file.name
                          }));
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                    className="w-full px-4 py-3 bg-white border-2 border-dashed border-[#e5e7eb] hover:border-[#16a34a] rounded-xl text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[#f0fdf4] file:text-[#16a34a] hover:file:bg-[#dcfce7] cursor-pointer transition-all"
                  />
                  {insuranceDetails.policyFileName && (
                    <p className="mt-3 text-sm text-[#16a34a] font-semibold flex items-center gap-1.5">
                      <ShieldCheck className="h-4 w-4" />
                      {insuranceDetails.policyFileName} ready
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-4">
                <Button type="button" variant="outline" onClick={() => setStep(1)} className="flex-1">Back</Button>
                <Button type="submit" loading={loading} className="flex-1">Finish Setup</Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
