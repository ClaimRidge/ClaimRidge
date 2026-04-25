"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { User } from "@supabase/supabase-js";
import Button from "@/components/ui/Button";
import { UserCircle, Bell, Shield, Building2, Save, Loader2, CheckCircle2 } from "lucide-react";

export default function ClinicSettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    clinicName: "",
  });

  const supabase = createClient();

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUser(user);
        const { data: prof } = await supabase
          .from("clinic_profiles")
          .select("*")
          .eq("user_id", user.id)
          .single();
        
        if (prof) {
          setProfile(prof);
          setFormData({
            clinicName: prof.clinic_name || "",
          });
        }
      }
      setLoading(false);
    }
    loadData();
  }, []);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setSuccess(false);

    const { error } = await supabase
      .from("clinic_profiles")
      .update({
        clinic_name: formData.clinicName,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    setSaving(false);
    if (!error) {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } else {
      console.error("Failed to save profile", error);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#16a34a]" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 w-full">
      <div className="mb-8">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0a0a0a]">Settings</h1>
        <p className="text-[#9ca3af] text-sm mt-1">Manage your clinic profile and preferences</p>
      </div>

      <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm overflow-hidden transition-all duration-300">
        <div className="px-6 py-5 border-b border-[#f3f4f6]">
          <h2 className="font-display font-bold text-lg text-[#0a0a0a]">Clinic Information</h2>
          <p className="text-sm text-[#6b7280]">Update your clinic's basic details.</p>
        </div>
        <div className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-[#374151] mb-1">Email Address</label>
            <input
              type="email"
              disabled
              value={user?.email || ""}
              className="w-full px-4 py-2 bg-[#f9fafb] border border-[#e5e7eb] rounded-lg text-[#6b7280] sm:text-sm cursor-not-allowed"
            />
            <p className="mt-1.5 text-xs text-[#9ca3af]">Your email address cannot be changed from here.</p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-[#374151] mb-1">Clinic Name</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Building2 className="h-4 w-4 text-[#9ca3af]" />
              </div>
              <input
                type="text"
                value={formData.clinicName}
                onChange={(e) => setFormData({ ...formData, clinicName: e.target.value })}
                className="w-full pl-10 pr-4 py-2 bg-white border border-[#d1d5db] rounded-lg text-[#0a0a0a] focus:ring-2 focus:ring-[#16a34a]/20 focus:border-[#16a34a] outline-none transition-shadow sm:text-sm"
                placeholder="e.g. City Hospital"
              />
            </div>
          </div>

          <div className="pt-4 flex items-center justify-end border-t border-[#f3f4f6] gap-3">
            {success && (
              <span className="flex items-center text-sm text-[#16a34a] gap-1 animate-in fade-in slide-in-from-right-4">
                <CheckCircle2 className="h-4 w-4" />
                Saved successfully
              </span>
            )}
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
