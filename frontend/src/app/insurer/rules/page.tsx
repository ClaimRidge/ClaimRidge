"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Scale,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  ShieldOff,
} from "lucide-react";

interface AdjudicationRule {
  id: string;
  rule_name: string;
  rule_type: string;
  rule_params: Record<string, unknown>;
  action: string;
  denial_code: string | null;
  denial_reason: string | null;
  is_active: boolean;
  created_at: string;
}

const RULE_TYPES = [
  { value: "cpt_requires_modifier", label: "CPT Requires Modifier" },
  { value: "cpt_not_covered", label: "CPT Not Covered" },
  { value: "dx_not_covered", label: "Diagnosis Not Covered" },
  { value: "dx_cpt_mismatch", label: "Dx-CPT Mismatch" },
  { value: "amount_threshold", label: "Amount Threshold" },
  { value: "requires_preauth", label: "Requires Pre-auth" },
  { value: "duplicate_claim", label: "Duplicate Claim" },
  { value: "frequency_limit", label: "Frequency Limit" },
];

const ACTIONS = [
  { value: "auto_deny", label: "Auto Deny", color: "bg-red-100 text-red-700" },
  { value: "flag_for_review", label: "Flag for Review", color: "bg-amber-100 text-amber-700" },
  { value: "require_auth", label: "Require Auth", color: "bg-orange-100 text-orange-700" },
  { value: "auto_approve", label: "Auto Approve", color: "bg-[#dcfce7] text-[#16a34a]" },
];

function getActionBadge(action: string) {
  const a = ACTIONS.find((x) => x.value === action);
  if (!a) return null;
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${a.color}`}>
      {a.label}
    </span>
  );
}

function getRuleTypeLabel(type: string) {
  return RULE_TYPES.find((t) => t.value === type)?.label || type;
}

function summarizeParams(type: string, params: Record<string, unknown>): string {
  switch (type) {
    case "cpt_requires_modifier":
      return `CPT ${params.cpt} requires modifier ${params.required_modifier}`;
    case "cpt_not_covered":
      return `CPT ${params.cpt} is not covered`;
    case "dx_not_covered":
      return `ICD-10 ${params.icd10} is not covered`;
    case "dx_cpt_mismatch":
      return `Dx ${params.icd10} does not support CPT ${params.cpt}`;
    case "amount_threshold":
      return `Claims over ${params.threshold_jod} JOD`;
    case "requires_preauth":
      return `Pre-auth required for: ${(params.cpt_list as string[])?.join(", ") || "N/A"}`;
    case "duplicate_claim":
      return "Detect duplicate submissions";
    case "frequency_limit":
      return `CPT ${params.cpt} max ${params.max_per_month}/month`;
    default:
      return JSON.stringify(params);
  }
}

const EMPTY_FORM = {
  rule_name: "",
  rule_type: "cpt_not_covered",
  action: "flag_for_review",
  denial_code: "",
  denial_reason: "",
  // Dynamic params
  cpt: "",
  icd10: "",
  required_modifier: "",
  threshold_jod: "",
  cpt_list: "",
  max_per_month: "",
};

export default function RulesPage() {
  const [rules, setRules] = useState<AdjudicationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  const fetchRules = useCallback(async () => {
    const { data } = await supabase
      .from("adjudication_rules")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setRules(data as AdjudicationRule[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowModal(true);
  };

  const openEdit = (rule: AdjudicationRule) => {
    const p = rule.rule_params;
    setForm({
      rule_name: rule.rule_name,
      rule_type: rule.rule_type,
      action: rule.action,
      denial_code: rule.denial_code || "",
      denial_reason: rule.denial_reason || "",
      cpt: (p.cpt as string) || "",
      icd10: (p.icd10 as string) || "",
      required_modifier: (p.required_modifier as string) || "",
      threshold_jod: p.threshold_jod ? String(p.threshold_jod) : "",
      cpt_list: (p.cpt_list as string[])?.join(", ") || "",
      max_per_month: p.max_per_month ? String(p.max_per_month) : "",
    });
    setEditingId(rule.id);
    setShowModal(true);
  };

  const buildParams = (): Record<string, unknown> => {
    switch (form.rule_type) {
      case "cpt_requires_modifier":
        return { cpt: form.cpt, required_modifier: form.required_modifier };
      case "cpt_not_covered":
        return { cpt: form.cpt };
      case "dx_not_covered":
        return { icd10: form.icd10 };
      case "dx_cpt_mismatch":
        return { icd10: form.icd10, cpt: form.cpt };
      case "amount_threshold":
        return { threshold_jod: Number(form.threshold_jod) };
      case "requires_preauth":
        return {
          cpt_list: form.cpt_list
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        };
      case "duplicate_claim":
        return {};
      case "frequency_limit":
        return { cpt: form.cpt, max_per_month: Number(form.max_per_month) };
      default:
        return {};
    }
  };

  const handleSave = async () => {
    if (!form.rule_name.trim()) return;
    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const payload = {
      insurer_id: user!.id,
      rule_name: form.rule_name,
      rule_type: form.rule_type,
      rule_params: buildParams(),
      action: form.action,
      denial_code: form.action === "auto_deny" ? form.denial_code || null : null,
      denial_reason: form.action === "auto_deny" ? form.denial_reason || null : null,
    };

    if (editingId) {
      await supabase
        .from("adjudication_rules")
        .update(payload)
        .eq("id", editingId);
    } else {
      await supabase.from("adjudication_rules").insert(payload);
    }

    setSaving(false);
    setShowModal(false);
    fetchRules();
  };

  const toggleActive = async (id: string, current: boolean) => {
    await supabase
      .from("adjudication_rules")
      .update({ is_active: !current })
      .eq("id", id);
    fetchRules();
  };

  const deleteRule = async (id: string) => {
    await supabase.from("adjudication_rules").delete().eq("id", id);
    fetchRules();
  };

  const updateForm = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0a0a0a]">
            Adjudication Rules
          </h1>
          <p className="text-[#9ca3af] text-sm mt-1">
            Configure automated claim processing rules
          </p>
        </div>
        <Button className="gap-2" onClick={openAdd}>
          <Plus className="h-4 w-4" />
          Add Rule
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-4 shadow-sm text-center">
          <Scale className="h-5 w-5 text-[#6b7280] mx-auto mb-1" />
          <p className="font-display text-xl font-bold text-[#0a0a0a]">{rules.length}</p>
          <p className="text-xs text-[#9ca3af]">Total Rules</p>
        </div>
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-4 shadow-sm text-center">
          <ShieldCheck className="h-5 w-5 text-[#16a34a] mx-auto mb-1" />
          <p className="font-display text-xl font-bold text-[#16a34a]">
            {rules.filter((r) => r.is_active).length}
          </p>
          <p className="text-xs text-[#9ca3af]">Active</p>
        </div>
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-4 shadow-sm text-center">
          <ShieldAlert className="h-5 w-5 text-red-500 mx-auto mb-1" />
          <p className="font-display text-xl font-bold text-red-600">
            {rules.filter((r) => r.action === "auto_deny").length}
          </p>
          <p className="text-xs text-[#9ca3af]">Auto-Deny</p>
        </div>
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-4 shadow-sm text-center">
          <ShieldOff className="h-5 w-5 text-[#6b7280] mx-auto mb-1" />
          <p className="font-display text-xl font-bold text-[#6b7280]">
            {rules.filter((r) => !r.is_active).length}
          </p>
          <p className="text-xs text-[#9ca3af]">Inactive</p>
        </div>
      </div>

      {/* Rules Table */}
      <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin h-8 w-8 border-4 border-[#0A1628] border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-[#9ca3af] text-sm">Loading rules...</p>
          </div>
        ) : rules.length === 0 ? (
          <div className="p-12 text-center">
            <Scale className="h-12 w-12 text-[#d1d5db] mx-auto mb-4" />
            <h3 className="font-display font-bold text-[#0a0a0a] mb-1">
              No rules configured
            </h3>
            <p className="text-[#9ca3af] text-sm mb-4">
              Create your first adjudication rule to automate claim processing.
            </p>
            <Button size="sm" className="gap-2" onClick={openAdd}>
              <Plus className="h-4 w-4" />
              Add First Rule
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-10">
                <tr className="bg-[#f9fafb] text-left border-b border-[#f3f4f6]">
                  <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase tracking-wider">
                    Rule Name
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase tracking-wider">
                    Parameters
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase tracking-wider">
                    Action
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase tracking-wider">
                    Active
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-[#9ca3af] uppercase tracking-wider"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f3f4f6]">
                {rules.map((rule) => (
                  <tr
                    key={rule.id}
                    className="hover:bg-[#f9fafb] transition-colors"
                  >
                    <td className="px-6 py-4 text-sm font-medium text-[#0a0a0a]">
                      {rule.rule_name}
                    </td>
                    <td className="px-6 py-4 text-sm text-[#6b7280]">
                      {getRuleTypeLabel(rule.rule_type)}
                    </td>
                    <td className="px-6 py-4 text-sm text-[#6b7280] max-w-xs truncate">
                      {summarizeParams(rule.rule_type, rule.rule_params)}
                    </td>
                    <td className="px-6 py-4">{getActionBadge(rule.action)}</td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => toggleActive(rule.id, rule.is_active)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          rule.is_active ? "bg-[#16a34a]" : "bg-[#d1d5db]"
                        }`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                            rule.is_active ? "translate-x-4" : "translate-x-1"
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEdit(rule)}
                          className="text-[#6b7280] hover:text-[#0a0a0a] transition-colors"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => deleteRule(rule.id)}
                          className="text-[#6b7280] hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowModal(false)}
          />
          <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-[#9ca3af] hover:text-[#0a0a0a]"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="font-display font-bold text-lg text-[#0a0a0a] mb-5">
              {editingId ? "Edit Rule" : "Add Adjudication Rule"}
            </h3>

            <div className="space-y-4">
              {/* Rule Name */}
              <div>
                <label className="block text-sm font-medium text-[#374151] mb-1">
                  Rule Name
                </label>
                <input
                  value={form.rule_name}
                  onChange={(e) => updateForm("rule_name", e.target.value)}
                  placeholder="e.g. Block Cosmetic Procedures"
                  className="w-full px-3 py-2 border border-[#e5e7eb] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0A1628] focus:border-transparent"
                />
              </div>

              {/* Rule Type */}
              <div>
                <label className="block text-sm font-medium text-[#374151] mb-1">
                  Rule Type
                </label>
                <select
                  value={form.rule_type}
                  onChange={(e) => updateForm("rule_type", e.target.value)}
                  className="w-full px-3 py-2 border border-[#e5e7eb] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0A1628] focus:border-transparent bg-white"
                >
                  {RULE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Dynamic Parameter Fields */}
              {(form.rule_type === "cpt_not_covered" ||
                form.rule_type === "cpt_requires_modifier" ||
                form.rule_type === "dx_cpt_mismatch" ||
                form.rule_type === "frequency_limit") && (
                <div>
                  <label className="block text-sm font-medium text-[#374151] mb-1">
                    CPT Code
                  </label>
                  <input
                    value={form.cpt}
                    onChange={(e) => updateForm("cpt", e.target.value)}
                    placeholder="e.g. 99213"
                    className="w-full px-3 py-2 border border-[#e5e7eb] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0A1628] focus:border-transparent"
                  />
                </div>
              )}

              {form.rule_type === "cpt_requires_modifier" && (
                <div>
                  <label className="block text-sm font-medium text-[#374151] mb-1">
                    Required Modifier
                  </label>
                  <input
                    value={form.required_modifier}
                    onChange={(e) =>
                      updateForm("required_modifier", e.target.value)
                    }
                    placeholder="e.g. 25"
                    className="w-full px-3 py-2 border border-[#e5e7eb] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0A1628] focus:border-transparent"
                  />
                </div>
              )}

              {(form.rule_type === "dx_not_covered" ||
                form.rule_type === "dx_cpt_mismatch") && (
                <div>
                  <label className="block text-sm font-medium text-[#374151] mb-1">
                    ICD-10 Code
                  </label>
                  <input
                    value={form.icd10}
                    onChange={(e) => updateForm("icd10", e.target.value)}
                    placeholder="e.g. Z41.1"
                    className="w-full px-3 py-2 border border-[#e5e7eb] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0A1628] focus:border-transparent"
                  />
                </div>
              )}

              {form.rule_type === "amount_threshold" && (
                <div>
                  <label className="block text-sm font-medium text-[#374151] mb-1">
                    Threshold Amount (JOD)
                  </label>
                  <input
                    type="number"
                    value={form.threshold_jod}
                    onChange={(e) => updateForm("threshold_jod", e.target.value)}
                    placeholder="e.g. 500"
                    className="w-full px-3 py-2 border border-[#e5e7eb] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0A1628] focus:border-transparent"
                  />
                </div>
              )}

              {form.rule_type === "requires_preauth" && (
                <div>
                  <label className="block text-sm font-medium text-[#374151] mb-1">
                    CPT Code List (comma separated)
                  </label>
                  <input
                    value={form.cpt_list}
                    onChange={(e) => updateForm("cpt_list", e.target.value)}
                    placeholder="e.g. 70553, 72148, 27447"
                    className="w-full px-3 py-2 border border-[#e5e7eb] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0A1628] focus:border-transparent"
                  />
                </div>
              )}

              {form.rule_type === "frequency_limit" && (
                <div>
                  <label className="block text-sm font-medium text-[#374151] mb-1">
                    Max Per Month
                  </label>
                  <input
                    type="number"
                    value={form.max_per_month}
                    onChange={(e) =>
                      updateForm("max_per_month", e.target.value)
                    }
                    placeholder="e.g. 12"
                    className="w-full px-3 py-2 border border-[#e5e7eb] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0A1628] focus:border-transparent"
                  />
                </div>
              )}

              {/* Action */}
              <div>
                <label className="block text-sm font-medium text-[#374151] mb-1">
                  Action When Triggered
                </label>
                <select
                  value={form.action}
                  onChange={(e) => updateForm("action", e.target.value)}
                  className="w-full px-3 py-2 border border-[#e5e7eb] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0A1628] focus:border-transparent bg-white"
                >
                  {ACTIONS.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Denial fields */}
              {form.action === "auto_deny" && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-[#374151] mb-1">
                      Denial Code
                    </label>
                    <input
                      value={form.denial_code}
                      onChange={(e) =>
                        updateForm("denial_code", e.target.value)
                      }
                      placeholder="e.g. CO-4"
                      className="w-full px-3 py-2 border border-[#e5e7eb] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0A1628] focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#374151] mb-1">
                      Denial Reason
                    </label>
                    <input
                      value={form.denial_reason}
                      onChange={(e) =>
                        updateForm("denial_reason", e.target.value)
                      }
                      placeholder="e.g. Procedure not covered under plan"
                      className="w-full px-3 py-2 border border-[#e5e7eb] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0A1628] focus:border-transparent"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-2 mt-6">
              <Button
                variant="ghost"
                className="flex-1"
                onClick={() => setShowModal(false)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleSave}
                loading={saving}
                disabled={!form.rule_name.trim()}
              >
                {editingId ? "Update Rule" : "Save Rule"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
