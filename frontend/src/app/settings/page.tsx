"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { User } from "@supabase/supabase-js";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { 
  Building2, 
  Save, 
  Loader2, 
  CheckCircle2, 
  Mail, 
  MapPin, 
  FileBadge,
  Globe,
  ArrowLeft
} from "lucide-react";

export default function SettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    organizationName: "",
    organizationNameAr: "",
    licenseNumber: "",
    contactEmail: "",
    address: ""
  });

  const supabase = createClient();

  useEffect(() => {
    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      setUser(user);

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();
      
      if (profile) {
        setFormData({
          organizationName: profile.organization_name || "",
          organizationNameAr: profile.config_json?.organization_name_ar || "",
          licenseNumber: profile.license_number || "",
          contactEmail: profile.contact_email || "",
          address: profile.config_json?.address || ""
        });
      }
      setLoading(false);
    }
    loadProfile();
  }, []);

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

      const updatedConfig = {
        ...(existingProfile?.config_json || {}),
        organization_name_ar: formData.organizationNameAr,
        address: formData.address
      };

      const { error } = await supabase
        .from("profiles")
        .update({
          organization_name: formData.organizationName,
          license_number: formData.licenseNumber,
          contact_email: formData.contactEmail,
          config_json: updatedConfig,
          updated_at: new Date().toISOString()
        })
        .eq("id", user.id);

      if (error) throw error;
      
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex flex-col items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-[#16a34a] mb-4" />
        <p className="text-gray-500 animate-pulse">Loading your profile...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 w-full">
      <div className="mb-6">
        <Link
          href="/dashboard"
          className="group flex items-center gap-2 text-sm font-medium text-[#6b7280] hover:text-[#16a34a] transition-colors"
        >
          <div className="w-8 h-8 flex items-center justify-center rounded-full bg-white border border-[#e5e7eb] group-hover:border-[#16a34a] group-hover:bg-[#f0fdf4] transition-all">
            <ArrowLeft className="h-4 w-4" />
          </div>
          Back to Dashboard
        </Link>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0a0a0a]">Account Settings</h1>
            <p className="text-[#6b7280] text-sm mt-1">Manage your organization details and administrative contact information</p>
          </div>
          
          <div className="flex items-center gap-4">
            {success && (
              <div className="hidden sm:flex items-center text-sm text-[#16a34a] font-medium animate-in fade-in slide-in-from-right-4">
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
                Updated
              </div>
            )}
            <Button type="submit" disabled={saving} className="min-w-[140px] gap-2 shadow-lg shadow-[#16a34a]/10">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm animate-in fade-in slide-in-from-top-2">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Section 1: Basic Info */}
          <div className="lg:col-span-1">
            <h2 className="font-display font-bold text-lg text-[#0a0a0a]">Organization Identity</h2>
            <p className="text-sm text-[#6b7280] mt-1">Official names and regulatory identifiers.</p>
          </div>
          <div className="lg:col-span-2 space-y-4 bg-white border border-[#e5e7eb] rounded-xl p-6 shadow-sm">
            <Input
              label="Legal Name (English)"
              value={formData.organizationName}
              onChange={(e) => setFormData({ ...formData, organizationName: e.target.value })}
              icon={Building2}
              required
            />
            <Input
              label="Legal Name (Arabic)"
              value={formData.organizationNameAr}
              onChange={(e) => setFormData({ ...formData, organizationNameAr: e.target.value })}
              icon={Globe}
              className="text-right"
              dir="rtl"
            />
            <Input
              label="Facility License Number"
              value={formData.licenseNumber}
              onChange={(e) => setFormData({ ...formData, licenseNumber: e.target.value })}
              icon={FileBadge}
              required
            />
          </div>

          {/* Section 2: Contact Info */}
          <div className="lg:col-span-1">
            <h2 className="font-display font-bold text-lg text-[#0a0a0a]">Contact Details</h2>
            <p className="text-sm text-[#6b7280] mt-1">Where insurers and ClaimRidge can reach you.</p>
          </div>
          <div className="lg:col-span-2 space-y-4 bg-white border border-[#e5e7eb] rounded-xl p-6 shadow-sm">
            <Input
              label="Primary Administrative Email"
              type="email"
              value={formData.contactEmail}
              onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
              icon={Mail}
              required
            />
            <Input
              label="Physical Address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              icon={MapPin}
              required
            />
          </div>

          {/* Account Auth Info (Read-only) */}
          <div className="lg:col-span-1">
            <h2 className="font-display font-bold text-lg text-[#0a0a0a]">Authentication</h2>
            <p className="text-sm text-[#6b7280] mt-1">System login credentials.</p>
          </div>
          <div className="lg:col-span-2 bg-[#f9fafb] border border-[#e5e7eb] border-dashed rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-500 font-bold mb-1">Login Email</p>
                <p className="text-sm font-medium text-gray-900">{user?.email}</p>
              </div>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200">
                Primary Account
              </span>
            </div>
            <p className="mt-4 text-xs text-[#9ca3af] italic">Contact support to change your primary login email address.</p>
          </div>
        </div>

      </form>
    </div>
  );
}
