"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { Shield, Building2, Stethoscope, ArrowRight, ShieldCheck } from "lucide-react";

type Role = "provider" | "insurance" | "doctor" | null;

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  const [error, setError] = useState("");
  const [user, setUser] = useState<any>(null);

  const supabase = createClient();
  const router = useRouter();

  // Provider Fields
  const [providerDetails, setProviderDetails] = useState({
    legalNameEn: "",
    legalNameAr: "",
    licenseNumber: "",
    address: "",
    primaryEmail: "",
  });

  // Insurance Fields
  const [insuranceDetails, setInsuranceDetails] = useState({
    companyNameEn: "",
    companyNameAr: "",
    cbjLicense: "",
    commercialLicense: "",
    country: "Jordan",
    policyFileBase64: "",
    policyFileName: "",
  });

  // Doctor Fields
  const [doctorDetails, setDoctorDetails] = useState({
    fullName: "",
    specialty: "",
    licenseNumber: "",
    orgCode: "",
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const roleParam = params.get("role");
    const orgParam = params.get("org");

    if (roleParam === "doctor") {
      setRole("doctor");
      setStep(2);
    }
    if (orgParam) {
      setDoctorDetails((prev) => ({ ...prev, orgCode: orgParam.toUpperCase() }));
    }
  }, []);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setUser(user);

      const { data: profile } = await supabase
        .from("profiles")
        .select("account_type, insurer_id")
        .eq("id", user.id)
        .maybeSingle();

      // Already onboarded: route to the correct dashboard
      if (profile?.account_type === "insurance" || profile?.insurer_id) {
        router.push("/dashboard/insurance");
      } else if (profile?.account_type === "provider") {
        router.push("/dashboard/provider");
      } else if (profile?.account_type === "doctor") {
        router.push("/dashboard/doctor");
      }
    };
    checkUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      // Insurance role uses the dedicated insurers tenant model
      if (role === "insurance") {
        if (!insuranceDetails.policyFileBase64) {
          setError("Please upload your Medical Guidelines & Policy Rules document.");
          setLoading(false);
          return;
        }

        setLoadingText("Creating your workspace...");

        const { data: insurer, error: insurerError } = await supabase
          .from("insurers")
          .insert({
            name: insuranceDetails.companyNameEn,
            name_ar: insuranceDetails.companyNameAr || null,
            cbj_operations_license: insuranceDetails.cbjLicense,
            commercial_license_number: insuranceDetails.commercialLicense,
            country: insuranceDetails.country,
            config: {
              policy_file_name: insuranceDetails.policyFileName,
            },
          })
          .select("id")
          .single();

        if (insurerError) {
          if (
            insurerError.message?.includes("insurers_cbj_operations_license_key") ||
            insurerError.message?.includes("insurers_commercial_license_number_key") ||
            insurerError.code === "23505"
          ) {
            throw new Error(
              "One of the license numbers is already registered. Please use unique license numbers."
            );
          }
          throw new Error(insurerError.message || "Failed to create Insurer workspace.");
        }

        setLoadingText("Linking user profile...");
        const { error: profileError } = await supabase.from("profiles").upsert({
          id: user.id,
          account_type: "insurance",
          insurer_id: insurer!.id,
          role: "admin",
          contact_email: user.email,
          full_name: insuranceDetails.companyNameEn,
          approved: false,
        }, { onConflict: "id" });
        if (profileError) throw new Error(profileError.message);

        setLoadingText("Training AI on your medical policy (this may take a minute)...");
        const { data: { session } } = await supabase.auth.getSession();
        const processRes = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/insurer/process-policy`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session?.access_token}`,
            },
            body: JSON.stringify({ policy_file_base64: insuranceDetails.policyFileBase64 }),
          }
        );
        if (!processRes.ok) {
          console.warn("Policy embedding failed, but workspace was created.");
        }

        window.location.assign("/waitlist-pending");
        return;
      }

      // Provider / Doctor: create org rows + profile in the right tables.
      let profileData: any = {
        id: user.id,
        account_type: role,
        contact_email: user.email,
      };

      if (role === "doctor") {
        // Doctor profile is created with NO provider_org_id by default.
        // Affiliation happens after profile creation via:
        //   1. accept-invite (token-based, auto-links)
        //   2. join-by-code (creates a pending join request — admin must approve)
        // The doctor's primary `provider_org_id` is only set once an approval lands.
        profileData = {
          ...profileData,
          full_name: doctorDetails.fullName,
          doctor_specialty: doctorDetails.specialty,
          doctor_license_number: doctorDetails.licenseNumber || null,
          approved: true,
        };
      } else if (role === "provider") {
        // Pre-check the license number — surfacing this as a friendly error
        // beats hitting the unique-constraint violation on insert.
        if (providerDetails.licenseNumber) {
          const { data: existing } = await supabase
            .from("provider_orgs")
            .select("id")
            .eq("license_number", providerDetails.licenseNumber)
            .maybeSingle();
          if (existing) {
            setError(
              "This facility license number is already registered. Please use a different license number, or contact support if you believe this is an error."
            );
            setLoading(false);
            return;
          }
        }

        const generatedOrgCode = "ORG-" + Math.random().toString(36).substring(2, 8).toUpperCase();
        const { data: orgRow, error: orgErr } = await supabase
          .from("provider_orgs")
          .insert({
            name: providerDetails.legalNameEn,
            name_ar: providerDetails.legalNameAr || null,
            org_code: generatedOrgCode,
            license_number: providerDetails.licenseNumber,
            address: providerDetails.address,
            contact_email: providerDetails.primaryEmail || user.email,
          })
          .select("id")
          .single();
        if (orgErr || !orgRow) {
          if (orgErr?.message?.includes("provider_orgs_license_number_key")) {
            setError("This facility license number is already registered. Please use a different one.");
          } else {
            setError(`Could not create provider organisation: ${orgErr?.message || "unknown error"}`);
          }
          setLoading(false);
          return;
        }
        profileData = {
          ...profileData,
          full_name: providerDetails.legalNameEn,
          contact_email: providerDetails.primaryEmail || user.email,
          provider_org_id: orgRow.id,
          approved: false,
        };
      }

      const { error: upsertError } = await supabase
        .from("profiles")
        .upsert(profileData, { onConflict: "id" });
        
      if (upsertError) {
        setError(upsertError.message);
        setLoading(false);
        return;
      }

      // Doctor post-profile affiliation: submit a join request that the admin must approve.
      if (role === "doctor" && doctorDetails.orgCode) {
        const { data: { session } } = await supabase.auth.getSession();
        const auth = session?.access_token ? `Bearer ${session.access_token}` : "";

        setLoadingText("Requesting access to your hospital...");
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/doctors/join-by-code`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: auth },
            body: JSON.stringify({ org_code: doctorDetails.orgCode.toUpperCase() }),
          }
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body?.detail || "Could not submit join request.");
          setLoading(false);
          return;
        }
        // Join request is pending — doctor lands on the dashboard with a "pending approval" banner.
      }

      const target = role === "doctor" ? "/dashboard/doctor" : "/waitlist-pending";
      window.location.assign(target);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred. Please try again.");
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
            {step === 1 ? "Which type of user are you?" : "We need a few more details."}
          </p>
        </div>

        <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm p-5 sm:p-8">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 border border-red-200 mb-6">
              {error}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4">
                <RoleButton
                  selected={role === "provider"}
                  onClick={() => setRole("provider")}
                  icon={<Stethoscope className="h-6 w-6" />}
                  title="Provider (Clinic / Hospital)"
                  desc="Submit claims and track reimbursements."
                />
                <RoleButton
                  selected={role === "insurance"}
                  onClick={() => setRole("insurance")}
                  icon={<Building2 className="h-6 w-6" />}
                  title="Insurance Company (Payer)"
                  desc="Receive claims and manage adjudication rules."
                />
                <RoleButton
                  selected={role === "doctor"}
                  onClick={() => setRole("doctor")}
                  icon={<Stethoscope className="h-6 w-6" />}
                  title="Doctor (Individual)"
                  desc="Link with a hospital or operate as a solo practitioner."
                />
              </div>
              <Button onClick={handleNextStep1} className="w-full" size="lg">
                Next <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          )}

          {step === 2 && role === "provider" && (
            <form onSubmit={handleSubmit} className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-900 border-b pb-2">Practice Identity</h3>
                  <Input id="legalNameEn" label="Legal Name (English)" value={providerDetails.legalNameEn} onChange={(e) => setProviderDetails({ ...providerDetails, legalNameEn: e.target.value })} required />
                  <Input id="legalNameAr" label="Legal Name (Arabic)" value={providerDetails.legalNameAr} onChange={(e) => setProviderDetails({ ...providerDetails, legalNameAr: e.target.value })} />
                </div>
                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-900 border-b pb-2">Location & Contact</h3>
                  <Input id="address" label="Address" value={providerDetails.address} onChange={(e) => setProviderDetails({ ...providerDetails, address: e.target.value })} required />
                  <Input id="primaryEmail" label="Administrative Email" type="email" value={providerDetails.primaryEmail} onChange={(e) => setProviderDetails({ ...providerDetails, primaryEmail: e.target.value })} required />
                </div>
              </div>
              <div className="max-w-md mx-auto pt-4 border-t border-gray-100">
                <Input id="licenseNumber" label="Facility License Number" value={providerDetails.licenseNumber} onChange={(e) => setProviderDetails({ ...providerDetails, licenseNumber: e.target.value })} required className="text-center" />
              </div>
              <div className="flex gap-4">
                <Button type="button" variant="outline" onClick={() => setStep(1)} className="flex-1">Back</Button>
                <Button 
                  type="submit" 
                  loading={loading} 
                  className={`flex-1 transition-all ${
                    error 
                      ? "bg-red-600 hover:bg-red-700 border-red-600 text-white hover:text-white" 
                      : ""
                  }`}
                >
                  {loading ? loadingText || "Processing..." : error ? "Error - Try Again" : "Finish Setup"}
                </Button>
              </div>
            </form>
          )}

          {step === 2 && role === "insurance" && (
            <form onSubmit={handleSubmit} className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-gray-100">
                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-900">Company Identity</h3>
                  <Input id="companyNameEn" label="Company Name (English)" value={insuranceDetails.companyNameEn} onChange={(e) => setInsuranceDetails({ ...insuranceDetails, companyNameEn: e.target.value })} required disabled={loading} />
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
                  <h3 className="font-semibold text-gray-900">Legal Verification</h3>
                  <Input id="cbjLicense" label="CBJ Operations License" value={insuranceDetails.cbjLicense} onChange={(e) => setInsuranceDetails({ ...insuranceDetails, cbjLicense: e.target.value })} required disabled={loading} placeholder="e.g. CBJ-OPS-1234" />
                  <Input id="commercialLicense" label="Commercial License Number" value={insuranceDetails.commercialLicense} onChange={(e) => setInsuranceDetails({ ...insuranceDetails, commercialLicense: e.target.value })} required disabled={loading} placeholder="e.g. COM-5678" />
                </div>
              </div>

              <div className="bg-[#fcfdfc] border border-[#f0fdf4] rounded-2xl p-6 shadow-sm">
                <label className="block text-base font-bold text-[#0a0a0a] mb-1">
                  Medical Guidelines & Policy Rules <span className="text-red-500 font-normal text-sm">*</span>
                </label>
                <p className="text-sm text-[#6b7280] mb-4">Upload your policy guidelines as a PDF or Word doc.</p>
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
                  <div className="mt-3 flex items-center justify-between bg-[#f0fdf4] border border-[#dcfce7] rounded-xl px-4 py-2.5 shadow-sm">
                    <span className="text-sm text-[#16a34a] font-semibold flex items-center gap-1.5">
                      <ShieldCheck className="h-4 w-4" /> {insuranceDetails.policyFileName} ready
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setInsuranceDetails((prev) => ({ ...prev, policyFileBase64: "", policyFileName: "" }));
                        const input = document.getElementById("policyFileInput") as HTMLInputElement;
                        if (input) input.value = "";
                      }}
                      className="text-red-500 hover:text-red-700 text-sm font-semibold flex items-center gap-1 hover:underline ml-2 transition-all"
                      title="Remove file"
                    >
                      ✕ Remove
                    </button>
                  </div>
                )}
              </div>

              <div className="flex gap-4">
                <Button type="button" variant="outline" onClick={() => setStep(1)} className="flex-1" disabled={loading}>Back</Button>
                <Button 
                  type="submit" 
                  loading={loading} 
                  className={`flex-1 transition-all ${
                    error 
                      ? "bg-red-600 hover:bg-red-700 border-red-600 text-white hover:text-white" 
                      : ""
                  }`}
                >
                  {loading ? loadingText || "Processing..." : error ? "Error - Try Again" : "Finish Setup"}
                </Button>
              </div>
            </form>
          )}

          {step === 2 && role === "doctor" && (
            <form onSubmit={handleSubmit} className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input id="fullName" label="Full Legal Name" value={doctorDetails.fullName} onChange={(e) => setDoctorDetails({ ...doctorDetails, fullName: e.target.value })} required placeholder="Dr. John Doe" />
                <Input id="specialty" label="Medical Specialty" value={doctorDetails.specialty} onChange={(e) => setDoctorDetails({ ...doctorDetails, specialty: e.target.value })} required placeholder="e.g. Cardiology" />
                <Input id="licenseNumber" label="Medical License Number" value={doctorDetails.licenseNumber} onChange={(e) => setDoctorDetails({ ...doctorDetails, licenseNumber: e.target.value })} placeholder="e.g. JMC-12345" />
              </div>

              <div className="bg-[#f9fafb] border border-[#e5e7eb] rounded-2xl p-6">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-2">
                  <Building2 className="h-4 w-4 text-[#16a34a]" /> Hospital Affiliation (Optional)
                </h3>
                <p className="text-sm text-[#6b7280] mb-4">
                  Enter your hospital&apos;s organization code. Your request will be sent to the
                  hospital admin for approval before you gain access to patient records.
                </p>
                <Input id="orgCode" label="Organization Code" value={doctorDetails.orgCode} onChange={(e) => setDoctorDetails({ ...doctorDetails, orgCode: e.target.value.toUpperCase() })} placeholder="ORG-XXXXXX" className="max-w-xs font-mono tracking-widest" />
              </div>

              <div className="flex gap-4">
                <Button type="button" variant="outline" onClick={() => setStep(1)} className="flex-1">Back</Button>
                <Button 
                  type="submit" 
                  loading={loading} 
                  className={`flex-1 transition-all ${
                    error 
                      ? "bg-red-600 hover:bg-red-700 border-red-600 text-white hover:text-white" 
                      : ""
                  }`}
                >
                  {loading ? loadingText || "Processing..." : error ? "Error - Try Again" : "Finish Setup"}
                </Button>
              </div>
            </form>
          )}
        </div>
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
