"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { Shield, ShieldCheck } from "lucide-react";

export default function OnboardingPage() {
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  const [error, setError] = useState("");
  const [user, setUser] = useState<any>(null);
  
  const supabase = createClient();
  const router = useRouter();

  // Insurer Workspace Details
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

      // Check if profile already exists and is linked to an insurer
      const { data: profile } = await supabase
        .from("profiles")
        .select("insurer_id")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.insurer_id) {
        router.push("/dashboard/insurance");
      }
    };
    checkUser();
  }, [router, supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      setLoadingText("Creating your workspace...");

      // 1. Create the Insurer Tenant Workspace (Notice we removed policyFileBase64 from config_json!)
      const { data: insurer, error: insurerError } = await supabase
        .from("insurers")
        .insert({
          name: insuranceDetails.companyNameEn,
          license_number: insuranceDetails.licenseNumber,
          config_json: {
            company_name_ar: insuranceDetails.companyNameAr,
            policy_file_name: insuranceDetails.policyFileName
          }
        })
        .select("id")
        .single();

      if (insurerError) {
        if (insurerError.message.includes("insurers_license_number_key") || insurerError.code === '23505') {
          throw new Error("This License Number is already registered. Please use a unique license number.");
        }
        throw new Error(insurerError.message || "Failed to create Insurer workspace.");
      }

      if (!insurer) {
        throw new Error("Failed to create Insurer workspace.");
      }

      // 2. Link the current user to this new Insurer workspace as an admin
      setLoadingText("Linking user profile...");
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert({
          id: user.id,
          insurer_id: insurer.id,
          role: "admin",
          contact_email: user.email
        });

      if (profileError) {
        throw new Error(profileError.message);
      }

      // 3. Send the Base64 directly to the backend for processing!
      if (insuranceDetails.policyFileBase64) {
        setLoadingText("Training AI on your medical policy (this may take a minute)...");
        
        const { data: { session } } = await supabase.auth.getSession();
        
        const processRes = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/insurer/process-policy`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session?.access_token}` 
          },
          body: JSON.stringify({
            policy_file_base64: insuranceDetails.policyFileBase64
          })
        });

        if (!processRes.ok) {
           console.warn("Policy embedding failed, but workspace was created.");
        }
      }

      // 4. Send them straight to the Medical Officer Queue
      setLoadingText("Redirecting to your Dashboard...");
      router.push("/dashboard/insurance");
      router.refresh();
      
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 bg-[#f9fafb]">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-[#0A1628] border border-[#0A1628]/10 rounded-xl mb-4">
            <Shield className="h-6 w-6 text-white" />
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#0a0a0a]">
            Set up your Workspace
          </h1>
          <p className="text-[#6b7280] mt-1">
            Enter your insurance company details to configure your AI Pre-Auth Engine.
          </p>
        </div>

        <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm p-5 sm:p-8">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 border border-red-200 mb-6">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-gray-100">
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-900">Company Identity</h3>
                <Input 
                  id="companyNameEn" 
                  label="Company Name (English)" 
                  value={insuranceDetails.companyNameEn} 
                  onChange={e => setInsuranceDetails({...insuranceDetails, companyNameEn: e.target.value})} 
                  required 
                  placeholder="e.g. GIG Jordan"
                  disabled={loading}
                />
                <Input 
                  id="companyNameAr" 
                  label="Company Name (Arabic)" 
                  value={insuranceDetails.companyNameAr} 
                  onChange={e => setInsuranceDetails({...insuranceDetails, companyNameAr: e.target.value})} 
                  placeholder="e.g. شركة التأمين"
                />
              </div>
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-900">Legal Verification</h3>
                <Input 
                  id="licenseNumberIns" 
                  label="License Number" 
                  value={insuranceDetails.licenseNumber} 
                  onChange={e => setInsuranceDetails({...insuranceDetails, licenseNumber: e.target.value})} 
                  required 
                  placeholder="e.g. INS-1004"
                  disabled={loading}
                />
                <p className="text-xs text-gray-500 mt-2">
                  Enter your official regulatory license number to verify your organization. This must be unique.
                </p>
              </div>
            </div>

            <div className="bg-[#fcfdfc] border border-[#f0fdf4] rounded-2xl p-6 shadow-sm">
              <label className="block text-base font-bold text-[#0a0a0a] mb-1">
                Medical Guidelines & Policy Rules <span className="text-gray-400 font-normal text-sm">(Optional)</span>
              </label>
              <p className="text-sm text-[#6b7280] mb-4">
                Upload your policy guidelines as a PDF or Word document. ClaimRidge will use this to automatically evaluate incoming pre-auths.
              </p>
              
              <div className="relative">
                <input 
                  type="file" 
                  accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  disabled={loading}
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
                  className="w-full px-4 py-3 bg-white border-2 border-dashed border-[#e5e7eb] hover:border-[#16a34a] rounded-xl text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[#f0fdf4] file:text-[#16a34a] hover:file:bg-[#dcfce7] cursor-pointer transition-all disabled:opacity-50"
                />
                {insuranceDetails.policyFileName && (
                  <p className="mt-3 text-sm text-[#16a34a] font-semibold flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4" />
                    {insuranceDetails.policyFileName} ready
                  </p>
                )}
              </div>
            </div>
            
            <Button type="submit" loading={loading} className="w-full" size="lg">
              {loading ? (loadingText || "Processing...") : "Finish Setup"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}