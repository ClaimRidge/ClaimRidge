"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ClaimFormData } from "@/types/claim";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { Plus, X, Send, Upload, FileText, Sparkles, CheckCircle, Search } from "lucide-react";
import CodePicker from "@/components/CodePicker";
import PayerPicker from "@/components/PayerPicker";
import ProviderPicker from "@/components/ProviderPicker";
import { ICD10_CODES } from "@/data/icd10";
import { CPT_CODES } from "@/data/cpt";
import { Payer } from "@/data/payers";
import { Provider } from "@/data/providers";
import { createClient } from "@/lib/supabase/client";

const INITIAL_FORM: ClaimFormData = {
  patient_name: "",
  patient_id: "",
  date_of_service: "",
  provider_name: "",
  provider_id: "",
  payer_name: "",
  payer_id: "",
  diagnosis_codes: [""],
  procedure_codes: [""],
  billed_amount: 0,
  notes: "",
};

interface ExtractedClaim {
  patientName?: string;
  patientId?: string;
  dateOfService?: string;
  providerName?: string;
  providerId?: string;
  payerName?: string;
  policyMemberId?: string;
  primaryDiagnosis?: string;
  additionalDiagnoses?: string[];
  primaryProcedure?: string;
  additionalProcedures?: string[];
  billedAmount?: number;
  additionalNotes?: string;
}

// Convert a File to base64 (strip the "data:*/*;base64," prefix)
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] || "";
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export default function ClaimForm() {
  const [form, setForm] = useState<ClaimFormData>(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState("");
  const [extractedFileName, setExtractedFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [codePicker, setCodePicker] = useState<
    | { type: "diagnosis_codes" | "procedure_codes"; index: number }
    | null
  >(null);

  const [payerPickerOpen, setPayerPickerOpen] = useState(false);
  const [providerPickerOpen, setProviderPickerOpen] = useState(false);
  const [providerIdHint, setProviderIdHint] = useState<string>("");

  const handleProviderSelect = (provider: Provider) => {
    setForm((prev) => ({
      ...prev,
      provider_name: provider.name,
      provider_id: provider.providerId || prev.provider_id,
    }));
  };

  const handlePayerSelect = (payer: Payer) => {
    setForm((prev) => ({ ...prev, payer_name: payer.name }));
    if (payer.providerIdFormat) {
      setProviderIdHint(payer.providerIdFormat);
      setForm((prev) => ({
        ...prev,
        provider_id: prev.provider_id || payer.providerIdFormat || "",
      }));
    } else {
      setProviderIdHint("");
    }
  };

  const router = useRouter();

  const updateField = (field: keyof ClaimFormData, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const updateArrayField = (field: "diagnosis_codes" | "procedure_codes", index: number, value: string) => {
    setForm((prev) => {
      const arr = [...prev[field]];
      arr[index] = value;
      return { ...prev, [field]: arr };
    });
  };

  const addArrayItem = (field: "diagnosis_codes" | "procedure_codes") => {
    setForm((prev) => ({
      ...prev,
      [field]: [...prev[field], ""],
    }));
  };

  const removeArrayItem = (field: "diagnosis_codes" | "procedure_codes", index: number) => {
    if (form[field].length <= 1) return;
    setForm((prev) => ({
      ...prev,
      [field]: prev[field].filter((_, i) => i !== index),
    }));
  };

  const applyExtractedData = (data: ExtractedClaim) => {
    const diagnosisCodes = [
      data.primaryDiagnosis || "",
      ...(data.additionalDiagnoses || []),
    ].filter((c, i, arr) => c !== "" || (i === 0 && arr.length === 1));

    const procedureCodes = [
      data.primaryProcedure || "",
      ...(data.additionalProcedures || []),
    ].filter((c, i, arr) => c !== "" || (i === 0 && arr.length === 1));

    setForm({
      patient_name: data.patientName || "",
      patient_id: data.patientId || "",
      date_of_service: data.dateOfService || "",
      provider_name: data.providerName || "",
      provider_id: data.providerId || "",
      payer_name: data.payerName || "",
      payer_id: data.policyMemberId || "",
      diagnosis_codes: diagnosisCodes.length > 0 ? diagnosisCodes : [""],
      procedure_codes: procedureCodes.length > 0 ? procedureCodes : [""],
      billed_amount: typeof data.billedAmount === "number" ? data.billedAmount : 0,
      notes: data.additionalNotes || "",
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();

    const file = e.target.files?.[0];
    if (!file) return;
    
    setExtractError("");
    setExtractedFileName("");

    if (file.size > 20 * 1024 * 1024) {
      setExtractError("File too large. Maximum size is 20MB.");
      return;
    }

    setExtracting(true);

    try {
      const base64 = await fileToBase64(file);

      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/claims/extract`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          fileBase64: base64,
          mediaType: file.type,
          fileName: file.name,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to extract data from document");
      }

      applyExtractedData(data.extracted as ExtractedClaim);
      setExtractedFileName(file.name);
    } catch (err) {
      setExtractError(
        err instanceof Error ? err.message : "Failed to process the document"
      );
    } finally {
      setExtracting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/claims/scrub`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`
        },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to scrub claim");
      }

      const data = await res.json();
      router.push(`/claims/${data.id}/results`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {error && (
        <div className="bg-red-50 text-red-600 text-sm rounded-lg p-4 border border-red-200">
          {error}
        </div>
      )}

      {/* Document Upload (AI Auto-Fill) */}
      <section>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <Sparkles className="h-4 w-4 text-[#16a34a]" />
          <h3 className="font-display text-base sm:text-lg font-bold text-[#0a0a0a]">AI Auto-Fill</h3>
          <span className="text-xs bg-[#f0fdf4] text-[#16a34a] border border-[#bbf7d0] px-2 py-0.5 rounded-full font-medium">
            Optional
          </span>
        </div>
        <p className="text-sm text-[#6b7280] mb-4">
          Upload an existing claim document and we&apos;ll extract the details for you.
        </p>

        <div
          className={`relative border-2 border-dashed rounded-xl p-6 transition-colors ${
            extracting
              ? "border-[#16a34a] bg-[#f0fdf4]"
              : extractedFileName
              ? "border-[#16a34a] bg-[#f0fdf4]"
              : "border-[#d1d5db] bg-[#f9fafb] hover:border-[#16a34a] hover:bg-[#f0fdf4]"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/gif,image/webp,.doc,.docx"
            onChange={handleFileUpload}
            disabled={extracting}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
            aria-label="Upload claim document"
          />

          {extracting ? (
            <div className="flex flex-col items-center justify-center text-center py-2 pointer-events-none">
              <div className="animate-spin h-8 w-8 border-4 border-[#16a34a] border-t-transparent rounded-full mb-3" />
              <p className="text-sm font-medium text-[#0a0a0a]">
                Extracting claim data with AI...
              </p>
              <p className="text-xs text-[#6b7280] mt-1">
                This usually takes a few seconds
              </p>
            </div>
          ) : extractedFileName ? (
            <div className="flex items-center gap-3 pointer-events-none">
              <div className="flex-shrink-0 w-10 h-10 bg-[#f0fdf4] border border-[#bbf7d0] rounded-lg flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-[#16a34a]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#0a0a0a] truncate">
                  {extractedFileName}
                </p>
                <p className="text-xs text-[#6b7280]">
                  Fields auto-filled below — review and edit as needed
                </p>
              </div>
              <span className="text-xs text-[#16a34a] font-medium">
                Click to replace
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-3 pointer-events-none">
              <div className="flex-shrink-0 w-10 h-10 bg-white rounded-lg flex items-center justify-center border border-[#e5e7eb]">
                <Upload className="h-5 w-5 text-[#16a34a]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#0a0a0a]">
                  Upload a claim document
                </p>
                <p className="text-xs text-[#6b7280]">
                  PDF or image (JPG, PNG, WebP) &middot; Max 20MB
                </p>
              </div>
              <FileText className="h-5 w-5 text-[#d1d5db] hidden sm:block" />
            </div>
          )}
        </div>

        {extractError && (
          <div className="mt-3 bg-red-50 text-red-600 text-sm rounded-lg p-3 border border-red-200">
            {extractError}
          </div>
        )}
      </section>

      {/* Patient Information */}
      <section>
        <h3 className="font-display text-base sm:text-lg font-bold text-[#0a0a0a] mb-4 pb-2 border-b border-[#e5e7eb]">
          Patient Information
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            id="patient_name"
            label="Patient Name"
            placeholder="Full name"
            value={form.patient_name}
            onChange={(e) => updateField("patient_name", e.target.value)}
            required
          />
          <Input
            id="patient_id"
            label="Patient ID / National ID"
            placeholder="e.g. 9901234567"
            value={form.patient_id}
            onChange={(e) => updateField("patient_id", e.target.value)}
            required
          />
          <Input
            id="date_of_service"
            label="Date of Service"
            type="date"
            value={form.date_of_service}
            onChange={(e) => updateField("date_of_service", e.target.value)}
            required
          />
        </div>
      </section>

      {/* Provider Information */}
      <section>
        <h3 className="font-display text-base sm:text-lg font-bold text-[#0a0a0a] mb-4 pb-2 border-b border-[#e5e7eb]">
          Provider Information
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Input
                id="provider_name"
                label="Provider / Facility Name"
                placeholder="Hospital or clinic name"
                value={form.provider_name}
                onChange={(e) => updateField("provider_name", e.target.value)}
                required
              />
            </div>
            <button
              type="button"
              onClick={() => setProviderPickerOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-[#16a34a] hover:text-white hover:bg-[#16a34a] border border-[#bbf7d0] hover:border-[#16a34a] rounded-lg transition-colors mb-0.5"
              title="Browse hospitals & clinics"
            >
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">Browse</span>
            </button>
          </div>
          <div>
            <Input
              id="provider_id"
              label="Provider ID"
              placeholder={providerIdHint || "License or NPI equivalent"}
              value={form.provider_id}
              onChange={(e) => updateField("provider_id", e.target.value)}
              required
            />
            {providerIdHint && (
              <p className="mt-1 text-xs text-[#6b7280]">
                <span className="font-medium text-[#16a34a]">Expected format:</span>{" "}
                <span className="font-mono">{providerIdHint}</span>
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Payer Information */}
      <section>
        <h3 className="font-display text-base sm:text-lg font-bold text-[#0a0a0a] mb-4 pb-2 border-b border-[#e5e7eb]">
          Payer / Insurance Information
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Input
                id="payer_name"
                label="Payer / Insurance Company"
                placeholder="e.g. Jordan Insurance Company"
                value={form.payer_name}
                onChange={(e) => updateField("payer_name", e.target.value)}
                required
              />
            </div>
            <button
              type="button"
              onClick={() => setPayerPickerOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-[#16a34a] hover:text-white hover:bg-[#16a34a] border border-[#bbf7d0] hover:border-[#16a34a] rounded-lg transition-colors mb-0.5"
              title="Browse insurance companies"
            >
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">Browse</span>
            </button>
          </div>
          <div className="flex items-end">
            <Input
              id="payer_id"
              label="Policy / Member ID"
              placeholder="Insurance policy number"
              value={form.payer_id}
              onChange={(e) => updateField("payer_id", e.target.value)}
              required
            />
          </div>
        </div>
      </section>

      {/* Diagnosis Codes */}
      <section>
        <h3 className="font-display text-base sm:text-lg font-bold text-[#0a0a0a] mb-4 pb-2 border-b border-[#e5e7eb]">
          Diagnosis Codes (ICD-10)
        </h3>
        <div className="space-y-3">
          {form.diagnosis_codes.map((code, i) => (
            <div key={i} className="flex gap-2 items-end">
              <div className="flex-1">
                <Input
                  id={`dx-${i}`}
                  label={i === 0 ? "Primary Diagnosis" : `Diagnosis ${i + 1}`}
                  placeholder="e.g. J06.9"
                  value={code}
                  onChange={(e) => updateArrayField("diagnosis_codes", i, e.target.value)}
                  required={i === 0}
                />
              </div>
              <button
                type="button"
                onClick={() => setCodePicker({ type: "diagnosis_codes", index: i })}
                className="inline-flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-[#16a34a] hover:text-white hover:bg-[#16a34a] border border-[#bbf7d0] hover:border-[#16a34a] rounded-lg transition-colors mb-0.5"
                title="Browse ICD-10 codes"
              >
                <Search className="h-4 w-4" />
                <span className="hidden sm:inline">Browse</span>
              </button>
              {form.diagnosis_codes.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeArrayItem("diagnosis_codes", i)}
                  className="p-2.5 text-[#9ca3af] hover:text-red-500 transition-colors mb-0.5"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => addArrayItem("diagnosis_codes")}
            className="inline-flex items-center gap-1.5 text-sm text-[#16a34a] hover:text-[#15803d] font-semibold"
          >
            <Plus className="h-4 w-4" /> Add Diagnosis
          </button>
        </div>
      </section>

      {/* Procedure Codes */}
      <section>
        <h3 className="font-display text-base sm:text-lg font-bold text-[#0a0a0a] mb-4 pb-2 border-b border-[#e5e7eb]">
          Procedure Codes (CPT/HCPCS)
        </h3>
        <div className="space-y-3">
          {form.procedure_codes.map((code, i) => (
            <div key={i} className="flex gap-2 items-end">
              <div className="flex-1">
                <Input
                  id={`cpt-${i}`}
                  label={i === 0 ? "Primary Procedure" : `Procedure ${i + 1}`}
                  placeholder="e.g. 99213"
                  value={code}
                  onChange={(e) => updateArrayField("procedure_codes", i, e.target.value)}
                  required={i === 0}
                />
              </div>
              <button
                type="button"
                onClick={() => setCodePicker({ type: "procedure_codes", index: i })}
                className="inline-flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-[#16a34a] hover:text-white hover:bg-[#16a34a] border border-[#bbf7d0] hover:border-[#16a34a] rounded-lg transition-colors mb-0.5"
                title="Browse CPT/HCPCS codes"
              >
                <Search className="h-4 w-4" />
                <span className="hidden sm:inline">Browse</span>
              </button>
              {form.procedure_codes.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeArrayItem("procedure_codes", i)}
                  className="p-2.5 text-[#9ca3af] hover:text-red-500 transition-colors mb-0.5"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => addArrayItem("procedure_codes")}
            className="inline-flex items-center gap-1.5 text-sm text-[#16a34a] hover:text-[#15803d] font-semibold"
          >
            <Plus className="h-4 w-4" /> Add Procedure
          </button>
        </div>
      </section>

      {/* Billing */}
      <section>
        <h3 className="font-display text-base sm:text-lg font-bold text-[#0a0a0a] mb-4 pb-2 border-b border-[#e5e7eb]">
          Billing Details
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            id="billed_amount"
            label="Billed Amount (JOD)"
            type="number"
            placeholder="0.00"
            min="0"
            step="0.01"
            value={form.billed_amount || ""}
            onChange={(e) => updateField("billed_amount", parseFloat(e.target.value) || 0)}
            required
          />
        </div>
      </section>

      {/* Notes */}
      <section>
        <h3 className="font-display text-base sm:text-lg font-bold text-[#0a0a0a] mb-4 pb-2 border-b border-[#e5e7eb]">
          Additional Notes
        </h3>
        <textarea
          id="notes"
          rows={3}
          className="w-full px-4 py-2.5 bg-white border border-[#e5e7eb] rounded-lg text-[#0a0a0a] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#16a34a] focus:border-transparent transition-all duration-200 resize-none"
          placeholder="Any additional context for the AI scrubber..."
          value={form.notes}
          onChange={(e) => updateField("notes", e.target.value)}
        />
      </section>

      {/* Submit */}
      <div className="flex justify-end pt-4 border-t border-[#e5e7eb]">
        <Button type="submit" loading={loading} size="lg" className="gap-2 w-full sm:w-auto">
          <Send className="h-4 w-4" />
          Scrub Claim with AI
        </Button>
      </div>

      {/* Provider/Facility Browser Modal */}
      <ProviderPicker
        isOpen={providerPickerOpen}
        onClose={() => setProviderPickerOpen(false)}
        onSelect={handleProviderSelect}
      />

      {/* Payer Browser Modal */}
      <PayerPicker
        isOpen={payerPickerOpen}
        onClose={() => setPayerPickerOpen(false)}
        onSelect={handlePayerSelect}
      />

      {/* Code Browser Modal */}
      <CodePicker
        isOpen={codePicker !== null}
        onClose={() => setCodePicker(null)}
        onSelect={(code) => {
          if (codePicker) {
            updateArrayField(codePicker.type, codePicker.index, code);
          }
        }}
        codes={codePicker?.type === "procedure_codes" ? CPT_CODES : ICD10_CODES}
        title={
          codePicker?.type === "procedure_codes"
            ? "Browse CPT / HCPCS Codes"
            : "Browse ICD-10 Codes"
        }
        subtitle={
          codePicker?.type === "procedure_codes"
            ? "Common procedure codes used in MENA/Jordan clinic billing"
            : "Common diagnosis codes used in MENA/Jordan clinic billing"
        }
      />
    </form>
  );
}
