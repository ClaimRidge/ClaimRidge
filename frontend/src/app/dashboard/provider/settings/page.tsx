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
  ArrowLeft,
} from "lucide-react";

export default function ProviderSettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const [providerOrgId, setProviderOrgId] = useState<string | null>(null);
  const [orgCode, setOrgCode] = useState<string>("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [showDeletePanel, setShowDeletePanel] = useState(false);

  const [formData, setFormData] = useState({
    organizationName: "",
    organizationNameAr: "",
    licenseNumber: "",
    contactEmail: "",
    address: "",
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
        .select("account_type, provider_org_id, contact_email")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.provider_org_id) {
        setProviderOrgId(profile.provider_org_id);
        const { data: org } = await supabase
          .from("provider_orgs")
          .select("name, name_ar, license_number, contact_email, address, org_code")
          .eq("id", profile.provider_org_id)
          .maybeSingle();
        if (org) {
          setOrgCode(org.org_code || "");
          setFormData({
            organizationName: org.name || "",
            organizationNameAr: org.name_ar || "",
            licenseNumber: org.license_number || "",
            contactEmail: org.contact_email || profile.contact_email || "",
            address: org.address || "",
          });
        }
      }
      setLoading(false);
    }
    loadProfile();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !providerOrgId) return;

    setSaving(true);
    setSuccess(false);
    setError("");

    try {
      const { error: orgErr } = await supabase
        .from("provider_orgs")
        .update({
          name: formData.organizationName,
          name_ar: formData.organizationNameAr || null,
          license_number: formData.licenseNumber,
          contact_email: formData.contactEmail,
          address: formData.address,
          updated_at: new Date().toISOString(),
        })
        .eq("id", providerOrgId);
      if (orgErr) throw orgErr;

      // Keep contact_email in sync on the profile too.
      await supabase
        .from("profiles")
        .update({ contact_email: formData.contactEmail, updated_at: new Date().toISOString() })
        .eq("id", user.id);

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to update settings");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== "delete") return;
    setSaving(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/account`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || "Failed to delete account");
      }
      await supabase.auth.signOut();
      window.location.href = "/login";
    } catch (err: any) {
      setError(err.message);
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
        <Link href="/dashboard/provider" className="group flex items-center gap-2 text-sm font-medium text-[#6b7280] hover:text-[#16a34a]">
          <div className="w-8 h-8 flex items-center justify-center rounded-full bg-white border border-[#e5e7eb] group-hover:border-[#16a34a] group-hover:bg-[#f0fdf4]">
            <ArrowLeft className="h-4 w-4" />
          </div>
          Back to Dashboard
        </Link>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0a0a0a]">Organisation Settings</h1>
            <p className="text-[#6b7280] text-sm mt-1">Manage your hospital / clinic profile.</p>
          </div>
          <div className="flex items-center gap-4">
            {success && (
              <div className="hidden sm:flex items-center text-sm text-[#16a34a] font-medium">
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
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">{error}</div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <h2 className="font-display font-bold text-lg text-[#0a0a0a]">Organisation Identity</h2>
            <p className="text-sm text-[#6b7280] mt-1">Official names and regulatory identifiers.</p>
          </div>
          <div className="lg:col-span-2 space-y-4 bg-white border border-[#e5e7eb] rounded-xl p-6 shadow-sm">
            <Input label="Legal Name (English)" value={formData.organizationName} onChange={e => setFormData({ ...formData, organizationName: e.target.value })} icon={Building2} required />
            <Input label="Legal Name (Arabic)" value={formData.organizationNameAr} onChange={e => setFormData({ ...formData, organizationNameAr: e.target.value })} icon={Globe} className="text-right" dir="rtl" />
            <Input label="Facility License Number" value={formData.licenseNumber} onChange={e => setFormData({ ...formData, licenseNumber: e.target.value })} icon={FileBadge} required />
          </div>

          <div className="lg:col-span-1">
            <h2 className="font-display font-bold text-lg text-[#0a0a0a]">Organisation Code</h2>
            <p className="text-sm text-[#6b7280] mt-1">Share with doctors to add them to your network.</p>
          </div>
          <div className="lg:col-span-2 bg-white border border-[#e5e7eb] rounded-xl p-6 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-500 font-bold mb-1">Your Unique Code</p>
              {orgCode ? (
                <code className="px-3 py-1.5 bg-[#f0fdf4] text-[#16a34a] border border-[#bbf7d0] rounded-lg text-lg font-bold tracking-widest">
                  {orgCode}
                </code>
              ) : (
                <div className="h-10 w-24 bg-gray-100 animate-pulse rounded-lg border border-gray-200" />
              )}
            </div>
          </div>

          <div className="lg:col-span-1">
            <h2 className="font-display font-bold text-lg text-[#0a0a0a]">Contact Details</h2>
            <p className="text-sm text-[#6b7280] mt-1">Where insurers and ClaimRidge can reach you.</p>
          </div>
          <div className="lg:col-span-2 space-y-4 bg-white border border-[#e5e7eb] rounded-xl p-6 shadow-sm">
            <Input label="Primary Administrative Email" type="email" value={formData.contactEmail} onChange={e => setFormData({ ...formData, contactEmail: e.target.value })} icon={Mail} required />
            <Input label="Physical Address" value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} icon={MapPin} required />
          </div>

          <div className="lg:col-span-1">
            <h2 className="font-display font-bold text-lg text-[#0a0a0a]">Authentication</h2>
            <p className="text-sm text-[#6b7280] mt-1">System login.</p>
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
          </div>

          <div className="lg:col-span-1 mt-12 pt-12 border-t border-gray-100">
            <h2 className="font-display font-bold text-lg text-red-600">Danger Zone</h2>
            <p className="text-sm text-[#6b7280] mt-1">Irreversible account actions.</p>
          </div>
          <div className="lg:col-span-2 mt-12 pt-12 border-t border-gray-100 bg-red-50/30 border-red-100 rounded-xl p-6 mb-8">
            {!showDeletePanel ? (
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-red-700">Delete your account</h3>
                  <p className="text-xs text-red-600/70 mt-1">This permanently removes all your data, claims, and organisation settings.</p>
                </div>
                <Button type="button" variant="danger" size="sm" onClick={() => setShowDeletePanel(true)}>
                  Delete
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-white p-4 rounded-lg border border-red-200">
                  <p className="text-sm text-gray-900 font-medium mb-3">
                    Type <span className="font-bold text-red-600">delete</span> to confirm.
                  </p>
                  <Input
                    placeholder="Type 'delete' to confirm"
                    value={deleteConfirmation}
                    onChange={e => setDeleteConfirmation(e.target.value.toLowerCase())}
                    className="border-red-200 focus:border-red-500 focus:ring-red-500"
                  />
                </div>
                <div className="flex gap-3">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => { setShowDeletePanel(false); setDeleteConfirmation(""); }}>
                    Cancel
                  </Button>
                  <Button type="button" variant="danger" className="flex-1" disabled={deleteConfirmation !== "delete" || saving} loading={saving} onClick={handleDeleteAccount}>
                    Permanently Delete
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
