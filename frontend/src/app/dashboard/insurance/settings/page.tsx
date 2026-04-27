"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { User } from "@supabase/supabase-js";
import { Building2, Save, Loader2, CheckCircle2, Globe, FileBadge, Mail, MapPin, ShieldCheck } from "lucide-react";
import Button from "@/components/ui/Button";

export default function InsurerSettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    companyName: "",
    companyNameAr: "",
    licenseNumber: "",
    contactEmail: "",
    address: "",
    policyFileBase64: "",
    policyFileName: ""
  });

  const supabase = createClient();

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUser(user);
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();
        
        if (profile) {
          setFormData({
            companyName: profile.organization_name || "",
            companyNameAr: profile.config_json?.organization_name_ar || "",
            licenseNumber: profile.license_number || "",
            contactEmail: profile.contact_email || "",
            address: profile.config_json?.address || "",
            policyFileBase64: "",
            policyFileName: profile.policy_file_name || profile.config_json?.policy_file_name || ""
          });
        }
      }
      setLoading(false);
    }
    loadData();
  }, [supabase]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setSaving(true);
    setSuccess(false);
    setError("");

    try {
      // Get current profile for config_json merge
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("config_json")
        .eq("id", user.id)
        .maybeSingle();

      const updatedConfig: any = {
        ...(existingProfile?.config_json || {}),
        organization_name_ar: formData.companyNameAr,
        address: formData.address
      };

      if (formData.policyFileBase64) {
        updatedConfig.policy_file_base64 = formData.policyFileBase64;
        updatedConfig.policy_file_name = formData.policyFileName;
      }

      const updateData: any = {
        organization_name: formData.companyName,
        license_number: formData.licenseNumber,
        contact_email: formData.contactEmail,
        config_json: updatedConfig,
        updated_at: new Date().toISOString()
      };

      if (formData.policyFileName) {
        updateData.policy_file_name = formData.policyFileName;
      }

      const { error } = await supabase
        .from("profiles")
        .update(updateData)
        .eq("id", user.id);

      if (error) throw error;

      // If policy changed, trigger backend processing
      if (formData.policyFileBase64) {
        const { data: { session } } = await supabase.auth.getSession();
        fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/insurer/process-policy`, {
          method: "POST",
          headers: { 
            "Authorization": `Bearer ${session?.access_token}` 
          }
        }).catch(err => console.error("Failed to trigger policy embedding:", err));
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to update settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="px-4 py-12 flex flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#16a34a] mb-4" />
        <p className="text-sm text-gray-500">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 w-full">
      <div className="mb-8">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0a0a0a]">Account Settings</h1>
        <p className="text-[#6b7280] text-sm mt-1">Manage your organization's profile and adjudication rules</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm animate-in fade-in slide-in-from-top-2">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Identity Section */}
          <div className="md:col-span-2 bg-white border border-[#e5e7eb] rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-[#f3f4f6] bg-[#f9fafb]">
              <h2 className="font-display font-bold text-lg text-[#0a0a0a]">Organization Identity</h2>
              <p className="text-sm text-[#6b7280]">Official company names and registration.</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#374151] mb-1.5">Company Name (English)</label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9ca3af]" />
                    <input
                      type="text"
                      required
                      value={formData.companyName}
                      onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                      className="w-full pl-10 pr-4 py-2 bg-white border border-[#d1d5db] rounded-lg text-[#0a0a0a] focus:ring-2 focus:ring-[#16a34a]/20 focus:border-[#16a34a] outline-none transition-shadow sm:text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#374151] mb-1.5">Company Name (Arabic)</label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9ca3af]" />
                    <input
                      type="text"
                      dir="rtl"
                      value={formData.companyNameAr}
                      onChange={(e) => setFormData({ ...formData, companyNameAr: e.target.value })}
                      className="w-full pl-10 pr-4 py-2 bg-white border border-[#d1d5db] rounded-lg text-[#0a0a0a] focus:ring-2 focus:ring-[#16a34a]/20 focus:border-[#16a34a] outline-none transition-shadow sm:text-sm"
                    />
                  </div>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-[#374151] mb-1.5">Regulatory License Number</label>
                <div className="relative">
                  <FileBadge className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9ca3af]" />
                  <input
                    type="text"
                    required
                    value={formData.licenseNumber}
                    onChange={(e) => setFormData({ ...formData, licenseNumber: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 bg-white border border-[#d1d5db] rounded-lg text-[#0a0a0a] focus:ring-2 focus:ring-[#16a34a]/20 focus:border-[#16a34a] outline-none transition-shadow sm:text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Policy Section */}
          <div className="md:col-span-2 bg-white border border-[#e5e7eb] rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 pt-5 pb-2">
              <h2 className="font-display font-bold text-lg text-[#0a0a0a]">Policy Guidelines</h2>
              <p className="text-sm text-[#6b7280]">Upload PDF rules for AI claim adjudication.</p>
            </div>
            <div className="px-6 pb-6">
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
                        setFormData(prev => ({ 
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
                {formData.policyFileName && (
                  <div className="mt-3 flex items-center gap-2 text-sm text-[#16a34a] font-semibold bg-[#f0fdf4] p-2 rounded-lg border border-[#bbf7d0]">
                    <ShieldCheck className="h-4 w-4" />
                    <span>{formData.policyFileName}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Contact Section */}
          <div className="md:col-span-2 bg-white border border-[#e5e7eb] rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-[#f3f4f6] bg-[#f9fafb]">
              <h2 className="font-display font-bold text-lg text-[#0a0a0a]">Contact Details</h2>
              <p className="text-sm text-[#6b7280]">Administrative contact and address.</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#374151] mb-1.5">Administrative Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9ca3af]" />
                  <input
                    type="email"
                    value={formData.contactEmail}
                    onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 bg-white border border-[#d1d5db] rounded-lg text-[#0a0a0a] focus:ring-2 focus:ring-[#16a34a]/20 focus:border-[#16a34a] outline-none transition-shadow sm:text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#374151] mb-1.5">Physical Address</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9ca3af]" />
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 bg-white border border-[#d1d5db] rounded-lg text-[#0a0a0a] focus:ring-2 focus:ring-[#16a34a]/20 focus:border-[#16a34a] outline-none transition-shadow sm:text-sm"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4">
          {success && (
            <span className="flex items-center text-sm text-[#16a34a] font-medium animate-in fade-in slide-in-from-right-4">
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              Settings updated
            </span>
          )}
          <Button type="submit" disabled={saving} className="min-w-[140px]">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
