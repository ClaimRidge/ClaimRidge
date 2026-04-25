"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { User } from "@supabase/supabase-js";
import { 
  Building2, 
  Save, 
  Loader2, 
  CheckCircle2, 
  Inbox, 
  ShieldCheck, 
  Search, 
  Gavel, 
  CreditCard, 
  Clock, 
  Lock,
  Cpu,
  Globe,
  Bell
} from "lucide-react";

export default function InsurerSettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState("general");

  const [settings, setSettings] = useState({
    companyName: "",
    // M1 Intake
    ocrConfidenceThreshold: 0.85,
    autoRoutingEnabled: true,
    // M2/M3 Policies
    policyApiEndpoint: "https://api.internal.com/v1/eligibility",
    strictCoverageChecks: true,
    // M5 Fraud
    fraudSensitivity: "medium",
    mlAnomalyDetection: true,
    // M6 Adjudication
    autoApproveThreshold: 50,
    maxAutoApproveAmount: 200,
    // M7 Payments
    paymentCycle: "weekly",
    bankAccountIban: "",
    // M9/M10 Compliance
    dataRetentionDays: 365,
    pdplAuditLogging: true,
    twoFactorAuth: true
  });

  const supabase = createClient();

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUser(user);
        const { data: prof } = await supabase
          .from("insurer_profiles")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();
        
        if (prof) {
          setSettings(prev => ({
            ...prev,
            companyName: prof.company_name || "",
          }));
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
      .from("insurer_profiles")
      .upsert({
        user_id: user.id,
        company_name: settings.companyName,
        updated_at: new Date().toISOString(),
      });

    setSaving(false);
    if (!error) {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }
  };

  const tabs = [
    { id: "general", label: "Organization", icon: Building2 },
    { id: "intake", label: "Intake (M1)", icon: Inbox },
    { id: "adjudication", label: "Logic (M2-M6)", icon: Gavel },
    { id: "fraud", label: "Fraud (M5)", icon: Search },
    { id: "payments", label: "Financials (M7)", icon: CreditCard },
    { id: "compliance", label: "Audit (M10)", icon: ShieldCheck },
  ];

  if (loading) {
    return (
      <div className="px-4 py-12 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#0A1628]" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-[#0a0a0a]">Platform Engine Settings</h1>
        <p className="text-[#9ca3af] text-sm mt-1">Configure parameters for all 10 core adjudication modules.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar Nav */}
        <aside className="lg:w-64 space-y-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === tab.id 
                  ? "bg-[#0A1628] text-white shadow-lg shadow-[#0A1628]/10" 
                  : "text-[#6b7280] hover:bg-[#f3f4f6]"
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </aside>

        {/* Content */}
        <div className="flex-1 bg-white border border-[#e5e7eb] rounded-[32px] shadow-sm overflow-hidden p-8">
          
          {activeTab === "general" && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-[#0a0a0a] flex items-center gap-2">
                <Globe className="h-5 w-5 text-blue-500" /> Organization Profile
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-[#374151] mb-2">Company Name</label>
                  <input
                    type="text"
                    value={settings.companyName}
                    onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
                    className="w-full px-4 py-2 bg-[#f9fafb] border border-[#e5e7eb] rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#374151] mb-2">Admin Email</label>
                  <input
                    type="text"
                    disabled
                    value={user?.email || ""}
                    className="w-full px-4 py-2 bg-[#f9fafb] border border-[#e5e7eb] rounded-xl opacity-50 cursor-not-allowed"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === "intake" && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-[#0a0a0a] flex items-center gap-2">
                <Inbox className="h-5 w-5 text-indigo-500" /> Intake & Normalization (M1)
              </h2>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-[#374151] mb-2">OCR Confidence Threshold ({Math.round(settings.ocrConfidenceThreshold * 100)}%)</label>
                  <input
                    type="range"
                    min="0.5"
                    max="1.0"
                    step="0.01"
                    value={settings.ocrConfidenceThreshold}
                    onChange={(e) => setSettings({ ...settings, ocrConfidenceThreshold: parseFloat(e.target.value) })}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#0A1628]"
                  />
                  <p className="text-xs text-slate-500 mt-2">Claims below this confidence will be routed for manual verification.</p>
                </div>
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div>
                    <p className="font-bold text-sm">LLM Normalization</p>
                    <p className="text-xs text-slate-500">Enable AI-based mapping of custom provider formats.</p>
                  </div>
                  <input type="checkbox" checked readOnly className="h-5 w-5 accent-emerald-500" />
                </div>
              </div>
            </div>
          )}

          {activeTab === "adjudication" && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-[#0a0a0a] flex items-center gap-2">
                <Gavel className="h-5 w-5 text-purple-500" /> Adjudication Logic (M2-M6)
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-[#374151] mb-2">Auto-Approve Threshold (JOD)</label>
                  <input
                    type="number"
                    value={settings.maxAutoApproveAmount}
                    onChange={(e) => setSettings({ ...settings, maxAutoApproveAmount: parseInt(e.target.value) })}
                    className="w-full px-4 py-2 bg-[#f9fafb] border border-[#e5e7eb] rounded-xl focus:ring-2 focus:ring-purple-500/20 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#374151] mb-2">Internal Policy API</label>
                  <input
                    type="text"
                    value={settings.policyApiEndpoint}
                    onChange={(e) => setSettings({ ...settings, policyApiEndpoint: e.target.value })}
                    className="w-full px-4 py-2 bg-[#f9fafb] border border-[#e5e7eb] rounded-xl focus:ring-2 focus:ring-purple-500/20 outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === "fraud" && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-[#0a0a0a] flex items-center gap-2">
                <Search className="h-5 w-5 text-red-500" /> Fraud & Anomaly Detection (M5)
              </h2>
              <div className="space-y-4">
                <label className="block text-sm font-medium text-[#374151]">ML Model Sensitivity</label>
                <div className="grid grid-cols-3 gap-3">
                  {["Low", "Medium", "High"].map((s) => (
                    <button
                      key={s}
                      onClick={() => setSettings({ ...settings, fraudSensitivity: s.toLowerCase() })}
                      className={`py-3 rounded-xl border text-sm font-bold transition-all ${
                        settings.fraudSensitivity === s.toLowerCase() 
                          ? "bg-red-500 text-white border-red-500 shadow-lg shadow-red-500/20" 
                          : "bg-white border-slate-200 text-slate-500 hover:border-red-200"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === "payments" && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-[#0a0a0a] flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-emerald-500" /> Financials & Payments (M7)
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-[#374151] mb-2">Default Payment Cycle</label>
                  <select 
                    value={settings.paymentCycle}
                    onChange={(e) => setSettings({ ...settings, paymentCycle: e.target.value })}
                    className="w-full px-4 py-2 bg-[#f9fafb] border border-[#e5e7eb] rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#374151] mb-2">Payout IBAN</label>
                  <input
                    type="text"
                    placeholder="JO00..."
                    className="w-full px-4 py-2 bg-[#f9fafb] border border-[#e5e7eb] rounded-xl focus:ring-2 focus:ring-emerald-500/20 outline-none font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === "compliance" && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-[#0a0a0a] flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-slate-700" /> Compliance & Audit (M10)
              </h2>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-[#374151] mb-2">Data Retention (Days)</label>
                  <input
                    type="number"
                    value={settings.dataRetentionDays}
                    onChange={(e) => setSettings({ ...settings, dataRetentionDays: parseInt(e.target.value) })}
                    className="w-full px-4 py-2 bg-[#f9fafb] border border-[#e5e7eb] rounded-xl focus:ring-2 focus:ring-slate-500/20 outline-none"
                  />
                </div>
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div>
                    <p className="font-bold text-sm">PDPL Audit Logging</p>
                    <p className="text-xs text-slate-500">Immutable logging of all PII access (Law No. 24 of 2023).</p>
                  </div>
                  <input type="checkbox" checked readOnly className="h-5 w-5 accent-slate-900" />
                </div>
              </div>
            </div>
          )}

          <div className="mt-10 pt-8 border-t border-[#f3f4f6] flex items-center justify-between">
            <div className="flex items-center gap-4 text-xs text-slate-400">
              <Lock className="h-3 w-3" />
              Settings are encrypted at rest
            </div>
            
            <div className="flex items-center gap-4">
              {success && (
                <span className="flex items-center text-sm text-[#16a34a] font-bold gap-1 animate-in slide-in-from-right-4">
                  <CheckCircle2 className="h-4 w-4" />
                  Configuration Synced
                </span>
              )}
              <button 
                onClick={handleSave} 
                disabled={saving} 
                className="bg-[#0A1628] text-white font-bold text-sm px-8 py-3 rounded-2xl hover:bg-[#112440] transition-all hover:scale-105 active:scale-95 disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? "Syncing..." : "Apply Changes"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
