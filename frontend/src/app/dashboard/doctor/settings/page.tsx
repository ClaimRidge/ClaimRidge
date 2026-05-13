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
  ArrowLeft,
  Stethoscope,
} from "lucide-react";

export default function DoctorSettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const [providerOrgId, setProviderOrgId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string>("");
  const [joinCode, setJoinCode] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [showDeletePanel, setShowDeletePanel] = useState(false);

  const [formData, setFormData] = useState({
    fullName: "",
    specialty: "",
    licenseNumber: "",
    contactEmail: "",
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
        .select("full_name, contact_email, doctor_specialty, doctor_license_number, provider_org_id")
        .eq("id", user.id)
        .maybeSingle();

      if (profile) {
        setFormData({
          fullName: profile.full_name || "",
          specialty: profile.doctor_specialty || "",
          licenseNumber: profile.doctor_license_number || "",
          contactEmail: profile.contact_email || user.email || "",
        });
        setProviderOrgId(profile.provider_org_id || null);

        if (profile.provider_org_id) {
          const { data: org } = await supabase
            .from("provider_orgs")
            .select("name")
            .eq("id", profile.provider_org_id)
            .maybeSingle();
          if (org?.name) setOrgName(org.name);
        }
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
      const { error: err } = await supabase
        .from("profiles")
        .update({
          full_name: formData.fullName,
          doctor_specialty: formData.specialty,
          doctor_license_number: formData.licenseNumber || null,
          contact_email: formData.contactEmail,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);
      if (err) throw err;
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to update settings");
    } finally {
      setSaving(false);
    }
  };

  const handleJoinOrg = async () => {
    if (!user || !joinCode.trim()) return;
    setSaving(true);
    setError("");
    try {
      const { data: org } = await supabase
        .from("provider_orgs")
        .select("id, name")
        .eq("org_code", joinCode.trim().toUpperCase())
        .maybeSingle();
      if (!org) {
        setError("Invalid Organization Code.");
        setSaving(false);
        return;
      }

      const { error: updateErr } = await supabase
        .from("profiles")
        .update({ provider_org_id: org.id })
        .eq("id", user.id);
      if (updateErr) throw updateErr;

      await supabase
        .from("doctor_org_links")
        .upsert({ doctor_id: user.id, provider_org_id: org.id });

      setProviderOrgId(org.id);
      setOrgName(org.name);
      setJoinCode("");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to join organisation");
    } finally {
      setSaving(false);
    }
  };

  const handleLeaveOrg = async () => {
    if (!user || !providerOrgId) return;
    setSaving(true);
    setError("");
    try {
      await supabase.from("doctor_org_links")
        .delete()
        .eq("doctor_id", user.id)
        .eq("provider_org_id", providerOrgId);

      const { error: updateErr } = await supabase
        .from("profiles")
        .update({ provider_org_id: null })
        .eq("id", user.id);
      if (updateErr) throw updateErr;

      setProviderOrgId(null);
      setOrgName("");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to leave organisation");
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
        <Link href="/dashboard/doctor" className="group flex items-center gap-2 text-sm font-medium text-[#6b7280] hover:text-[#16a34a]">
          <div className="w-8 h-8 flex items-center justify-center rounded-full bg-white border border-[#e5e7eb] group-hover:border-[#16a34a] group-hover:bg-[#f0fdf4]">
            <ArrowLeft className="h-4 w-4" />
          </div>
          Back to Dashboard
        </Link>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0a0a0a]">Doctor Settings</h1>
            <p className="text-[#6b7280] text-sm mt-1">Manage your professional details and hospital affiliation.</p>
          </div>
          <div className="flex items-center gap-4">
            {success && (
              <div className="hidden sm:flex items-center text-sm text-[#16a34a] font-medium">
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
                Updated
              </div>
            )}
            <Button type="submit" disabled={saving} className="min-w-[140px] gap-2">
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
            <h2 className="font-display font-bold text-lg text-[#0a0a0a]">Professional Identity</h2>
            <p className="text-sm text-[#6b7280] mt-1">Your name and clinical credentials.</p>
          </div>
          <div className="lg:col-span-2 space-y-4 bg-white border border-[#e5e7eb] rounded-xl p-6 shadow-sm">
            <Input label="Full Legal Name" value={formData.fullName} onChange={e => setFormData({ ...formData, fullName: e.target.value })} icon={Stethoscope} required />
            <Input label="Medical Specialty" value={formData.specialty} onChange={e => setFormData({ ...formData, specialty: e.target.value })} required />
            <Input label="Medical License Number" value={formData.licenseNumber} onChange={e => setFormData({ ...formData, licenseNumber: e.target.value })} />
            <Input label="Contact Email" type="email" value={formData.contactEmail} onChange={e => setFormData({ ...formData, contactEmail: e.target.value })} icon={Mail} required />
          </div>

          <div className="lg:col-span-1">
            <h2 className="font-display font-bold text-lg text-[#0a0a0a]">Network Affiliation</h2>
            <p className="text-sm text-[#6b7280] mt-1">Hospital / clinic where you practice.</p>
          </div>
          <div className="lg:col-span-2 bg-white border border-[#e5e7eb] rounded-xl p-6 shadow-sm">
            {providerOrgId ? (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircle2 className="h-5 w-5 text-[#16a34a]" />
                  <p className="text-sm text-[#0a0a0a] font-medium">
                    Linked to <span className="font-bold">{orgName || "your organisation"}</span>.
                  </p>
                </div>
                <p className="text-sm text-[#6b7280] mb-4">
                  Claims you submit are accessible to this organisation's administrators.
                </p>
                <Button type="button" variant="danger" onClick={handleLeaveOrg} disabled={saving}>
                  Leave Organisation
                </Button>
              </div>
            ) : (
              <div>
                <p className="text-sm text-[#6b7280] mb-4">
                  You are currently operating as a solo practitioner. Enter an organisation code to join a network.
                </p>
                <div className="flex items-end gap-3 max-w-md">
                  <div className="flex-1">
                    <Input
                      label="Organisation Code"
                      placeholder="e.g., ORG-XXXXXX"
                      value={joinCode}
                      onChange={e => setJoinCode(e.target.value.toUpperCase())}
                    />
                  </div>
                  <Button type="button" onClick={handleJoinOrg} disabled={saving || !joinCode}>
                    Join
                  </Button>
                </div>
              </div>
            )}
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
                  <p className="text-xs text-red-600/70 mt-1">This permanently removes all your data and claims.</p>
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
