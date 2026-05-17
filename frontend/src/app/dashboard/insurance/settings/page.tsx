"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { User } from "@supabase/supabase-js";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import {
  Building2,
  Save,
  Loader2,
  CheckCircle2,
  FileBadge,
  Globe,
  ArrowLeft,
  Trash2,
} from "lucide-react";

const MENA_COUNTRIES = [
  "Algeria", "Bahrain", "Egypt", "Iraq", "Jordan", "Kuwait",
  "Lebanon", "Libya", "Morocco", "Oman", "Palestine", "Qatar",
  "Saudi Arabia", "Syria", "Tunisia", "United Arab Emirates", "Yemen",
];

export default function InsuranceSettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const [insurerId, setInsurerId] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [showDeletePanel, setShowDeletePanel] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    nameAr: "",
    cbjLicense: "",
    commercialLicense: "",
    country: "Jordan",
    policyFileBase64: "",
    policyFileName: "",
  });

  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUser(user);

      const { data: profile } = await supabase
        .from("profiles")
        .select("account_type, insurer_id")
        .eq("id", user.id)
        .maybeSingle();
      if (!profile || profile.account_type !== "insurance" || !profile.insurer_id) {
        setLoading(false);
        return;
      }
      setInsurerId(profile.insurer_id);

      const { data: ins } = await supabase
        .from("insurers")
        .select("name, name_ar, cbj_operations_license, commercial_license_number, country, config")
        .eq("id", profile.insurer_id)
        .maybeSingle();
      const i = ins || ({} as any);
      setFormData({
        name: i.name || "",
        nameAr: i.name_ar || i.config?.company_name_ar || "",
        cbjLicense: i.cbj_operations_license || "",
        commercialLicense: i.commercial_license_number || "",
        country: i.country || "Jordan",
        policyFileBase64: "",
        policyFileName: i.config?.policy_file_name || "",
      });
      setLoading(false);
    }
    load();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !insurerId) return;
    setSaving(true);
    setSuccess(false);
    setError("");
    try {
      const { error: insErr } = await supabase
        .from("insurers")
        .update({
          name: formData.name,
          name_ar: formData.nameAr || null,
          cbj_operations_license: formData.cbjLicense,
          commercial_license_number: formData.commercialLicense,
          country: formData.country,
          config: { policy_file_name: formData.policyFileName },
          updated_at: new Date().toISOString(),
        })
        .eq("id", insurerId);
      if (insErr) throw insErr;

      if (formData.policyFileBase64) {
        const { data: { session } } = await supabase.auth.getSession();
        fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/insurer/process-policy`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ policy_file_base64: formData.policyFileBase64 }),
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

  const handleDeletePolicy = async () => {
    if (!window.confirm("Remove the current policy document? The AI will lose access to these rules until a new one is uploaded.")) return;
    setSaving(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/insurer/policy`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail || "Failed to remove policy.");
      }
      setFormData(prev => ({ ...prev, policyFileBase64: "", policyFileName: "" }));
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message);
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
        <p className="text-gray-500 animate-pulse">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 w-full">
      <div className="mb-6">
        <Link href="/dashboard/insurance" className="group flex items-center gap-2 text-sm font-medium text-[#6b7280] hover:text-[#16a34a]">
          <div className="w-8 h-8 flex items-center justify-center rounded-full bg-white border border-[#e5e7eb] group-hover:border-[#16a34a] group-hover:bg-[#f0fdf4]">
            <ArrowLeft className="h-4 w-4" />
          </div>
          Back to Dashboard
        </Link>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0a0a0a]">Insurer Workspace Settings</h1>
            <p className="text-[#6b7280] text-sm mt-1">Manage your insurance company profile and policy rules.</p>
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
            <h2 className="font-display font-bold text-lg text-[#0a0a0a]">Company Identity</h2>
            <p className="text-sm text-[#6b7280] mt-1">Names and country of operation.</p>
          </div>
          <div className="lg:col-span-2 space-y-4 bg-white border border-[#e5e7eb] rounded-xl p-6 shadow-sm">
            <Input label="Legal Name (English)" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} icon={Building2} required />
            <Input label="Legal Name (Arabic)" value={formData.nameAr} onChange={e => setFormData({ ...formData, nameAr: e.target.value })} icon={Globe} className="text-right" dir="rtl" />
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">Country (MENA)</label>
              <Select
                value={formData.country}
                onChange={(country) => setFormData({ ...formData, country })}
                options={MENA_COUNTRIES.map((c) => ({ value: c, label: c }))}
              />
            </div>
          </div>

          <div className="lg:col-span-1">
            <h2 className="font-display font-bold text-lg text-[#0a0a0a]">Legal Verification</h2>
            <p className="text-sm text-[#6b7280] mt-1">Regulatory license numbers.</p>
          </div>
          <div className="lg:col-span-2 space-y-4 bg-white border border-[#e5e7eb] rounded-xl p-6 shadow-sm">
            <Input label="CBJ Operations License" value={formData.cbjLicense} onChange={e => setFormData({ ...formData, cbjLicense: e.target.value })} icon={FileBadge} required />
            <Input label="Commercial License Number" value={formData.commercialLicense} onChange={e => setFormData({ ...formData, commercialLicense: e.target.value })} icon={FileBadge} required />
          </div>

          <div className="lg:col-span-1">
            <h2 className="font-display font-bold text-lg text-[#0a0a0a]">Policy Guidelines</h2>
            <p className="text-sm text-[#6b7280] mt-1">Upload a new PDF to retrain the AI on your medical rules.</p>
          </div>
          <div className="lg:col-span-2 bg-white border border-[#e5e7eb] rounded-xl px-6 py-4 shadow-sm">
            <input
              type="file"
              accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = () => {
                    const base64 = (reader.result as string).split(",")[1];
                    setFormData(prev => ({ ...prev, policyFileBase64: base64, policyFileName: file.name }));
                  };
                  reader.readAsDataURL(file);
                }
              }}
              className="w-full px-4 py-3 bg-white border-2 border-dashed border-[#e5e7eb] hover:border-[#16a34a] rounded-xl text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[#f0fdf4] file:text-[#16a34a] hover:file:bg-[#dcfce7] cursor-pointer"
            />
            {formData.policyFileName && (
              <div className="mt-3 flex items-center justify-between gap-2 text-sm text-[#16a34a] font-semibold bg-[#f0fdf4] p-2 rounded-lg border border-[#bbf7d0]">
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{formData.policyFileName}</span>
                </div>
                <button
                  type="button"
                  onClick={handleDeletePolicy}
                  disabled={saving}
                  title="Remove policy document"
                  className="p-1.5 rounded-md text-red-500 hover:text-white hover:bg-red-500 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}
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
                Admin Account
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
                  <p className="text-xs text-red-600/70 mt-1">Permanently removes your access. The insurer workspace stays for the remaining staff.</p>
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
                  <Input placeholder="Type 'delete' to confirm" value={deleteConfirmation} onChange={e => setDeleteConfirmation(e.target.value.toLowerCase())} />
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
