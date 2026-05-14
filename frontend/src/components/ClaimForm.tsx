"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ClaimFormData } from "@/types/claim";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { Plus, X, Send, Upload, FileText, Sparkles, CheckCircle, Search, AlertTriangle, Building2, Trash2 } from "lucide-react";
import CodePicker from "@/components/CodePicker";
import PayerPicker from "@/components/PayerPicker";
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
  // Clinical context (fraud detector signals — all optional)
  patient_age: undefined,
  patient_gender: "",
  patient_state: "",
  visit_type: "",
  length_of_stay: undefined,
  insurance_type: "",
  provider_specialty: "",
};

const VISIT_TYPES = ["Inpatient", "Outpatient", "Emergency", "Day Surgery"] as const;
const INSURANCE_TYPES = ["Comprehensive", "Basic", "Government", "Corporate", "Cash"] as const;

// NEW: Updated to match Pydantic Backend output
interface FieldData {
  value: any;
  confidence: number;
}

interface ExtractedClaim {
  patient_name?: FieldData;
  patient_id?: FieldData;
  date_of_service?: FieldData;
  provider_name?: FieldData;
  provider_id?: FieldData;
  payer_name?: FieldData;
  member_id?: FieldData;
  primary_diagnosis?: FieldData;
  additional_diagnoses?: FieldData;
  primary_procedure?: FieldData;
  additional_procedures?: FieldData;
  billed_amount?: FieldData;
  additional_notes?: FieldData;
  patient_age?: FieldData;
  patient_gender?: FieldData;
  patient_state?: FieldData;
  visit_type?: FieldData;
  length_of_stay?: FieldData;
  insurance_type?: FieldData;
  provider_specialty?: FieldData;
}

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
  // NEW: State to track AI confidence for UI highlighting
  const [extractedScores, setExtractedScores] = useState<Record<string, number | undefined>>({});
  
  // NEW: State for multi-org billing selection
  const [userId, setUserId] = useState<string>("");
  const [accountType, setAccountType] = useState<string | null>(null);
  const [linkedOrgs, setLinkedOrgs] = useState<{id: string, name: string}[]>([]);
  const [selectedClinicId, setSelectedClinicId] = useState<string>("");

  // Fetch user role and linked organizations on mount
  useEffect(() => {
    const fetchUserAndOrgs = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      setUserId(user.id);
      setSelectedClinicId(user.id); // Default to solo/self

      const { data: profile } = await supabase
        .from("profiles")
        .select("account_type")
        .eq("id", user.id)
        .single();
        
      if (profile) setAccountType(profile.account_type);

      // If they are a doctor, fetch all hospitals they belong to (two-step
      // to avoid PostgREST FK-auto-detection issues right after a migration).
      if (profile?.account_type === "doctor") {
        const { data: links } = await supabase
          .from("doctor_org_links")
          .select("provider_org_id")
          .eq("doctor_id", user.id);
        const orgIds = (links || []).map((l: any) => l.provider_org_id);
        if (orgIds.length > 0) {
          const { data: orgs } = await supabase
            .from("provider_orgs")
            .select("id, name")
            .in("id", orgIds);
          if (orgs) {
            setLinkedOrgs(orgs.map((o: any) => ({ id: o.id, name: o.name })));
          }
        }
      }
    };
    fetchUserAndOrgs();
  }, []);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState("");
  // Files queued by the user, waiting for the "Extract" button.
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  // Filenames of the docs that successfully filled the form (post-extraction).
  const [extractedFileNames, setExtractedFileNames] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB per file
  const MAX_FILES = 8;

  const [codePicker, setCodePicker] = useState<
    | { type: "diagnosis_codes" | "procedure_codes"; index: number }
    | null
  >(null);

  const [payerPickerOpen, setPayerPickerOpen] = useState(false);
  const [providerIdHint, setProviderIdHint] = useState<string>("");
  const [registeredPayerUuid, setRegisteredPayerUuid] = useState<string | null>(null);

  // Pre-auth linkage state
  const [preAuthNumber, setPreAuthNumber] = useState<string>("");
  const [preAuthLookup, setPreAuthLookup] = useState<{
    state: "idle" | "loading" | "found" | "not_found" | "expired";
    detail?: string;
    patient_name?: string | null;
    patient_id?: string | null;
    valid_until?: string | null;
    approved_procedures?: string[] | null;
    insurer_name?: string | null;
  }>({ state: "idle" });

  const router = useRouter();
  const pathname = usePathname();

  // Debounced lookup whenever the user types an auth number
  useEffect(() => {
    const n = preAuthNumber.trim();
    if (!n) { setPreAuthLookup({ state: "idle" }); return; }
    if (n.length < 10) { setPreAuthLookup({ state: "idle" }); return; }
    setPreAuthLookup({ state: "loading" });
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/claims/pre-auth-lookup/${encodeURIComponent(n)}`,
          { headers: { Authorization: `Bearer ${session?.access_token}` }, signal: ctl.signal }
        );
        if (res.status === 404) {
          setPreAuthLookup({ state: "not_found", detail: "No authorization found with that number." });
          return;
        }
        if (!res.ok) {
          setPreAuthLookup({ state: "not_found", detail: "Lookup failed." });
          return;
        }
        const data = await res.json();
        setPreAuthLookup({
          state: data.expired ? "expired" : "found",
          detail: data.expired
            ? `Expired on ${new Date(data.valid_until).toLocaleDateString()}.`
            : `Valid until ${data.valid_until ? new Date(data.valid_until).toLocaleDateString() : "—"}.`,
          patient_name: data.patient_name,
          patient_id: data.patient_id,
          valid_until: data.valid_until,
          approved_procedures: data.approved_procedures,
          insurer_name: data.insurer_name,
        });
      } catch (e: any) {
        if (e?.name !== "AbortError") setPreAuthLookup({ state: "not_found", detail: "Network error." });
      }
    }, 400);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [preAuthNumber]);

  const handleProviderSelect = (provider: Provider) => {
    setForm((prev) => ({
      ...prev,
      provider_name: provider.name,
      provider_id: provider.providerId || prev.provider_id,
    }));
  };

  const handlePayerSelect = (payer: any) => {
    setForm((prev) => ({ ...prev, payer_name: payer.name }));
    setRegisteredPayerUuid(payer.id || null);
    
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

  const updateField = (field: keyof ClaimFormData, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (field === "payer_name") {
      setRegisteredPayerUuid(null);
    }
    // If user manually edits an AI field, we clear the warning score
    if (extractedScores[field] !== undefined) {
      setExtractedScores(prev => ({ ...prev, [field]: 100 }));
    }
  };

  const updateArrayField = (field: "diagnosis_codes" | "procedure_codes", index: number, value: string) => {
    setForm((prev) => {
      const arr = [...prev[field]];
      arr[index] = value;
      return { ...prev, [field]: arr };
    });
  };

  const addArrayItem = (field: "diagnosis_codes" | "procedure_codes") => {
    setForm((prev) => ({ ...prev, [field]: [...prev[field], ""] }));
  };

  const removeArrayItem = (field: "diagnosis_codes" | "procedure_codes", index: number) => {
    if (form[field].length <= 1) return;
    setForm((prev) => ({ ...prev, [field]: prev[field].filter((_, i) => i !== index) }));
  };

  // NEW: Updated to map nested AI values and extract confidence scores
  const applyExtractedData = (data: ExtractedClaim) => {
    const diagnosisCodes = [
      data.primary_diagnosis?.value || "",
      ...(data.additional_diagnoses?.value || []),
    ].filter((c, i, arr) => c !== "" || (i === 0 && arr.length === 1));

    const procedureCodes = [
      data.primary_procedure?.value || "",
      ...(data.additional_procedures?.value || []),
    ].filter((c, i, arr) => c !== "" || (i === 0 && arr.length === 1));

    const parseIntOrUndef = (v: any): number | undefined => {
      if (v === "" || v === undefined || v === null) return undefined;
      const n = parseInt(String(v), 10);
      return Number.isFinite(n) ? n : undefined;
    };
    const normalizeVisit = (v: any): ClaimFormData["visit_type"] => {
      const s = String(v ?? "").trim().toLowerCase();
      if (!s) return "";
      if (s.startsWith("inpatient") || s.includes("admitted")) return "Inpatient";
      if (s.startsWith("emergency") || s === "er" || s === "a&e") return "Emergency";
      if (s.includes("day surgery") || s.includes("day case")) return "Day Surgery";
      if (s.startsWith("outpatient") || s.includes("ambulatory") || s === "opd") return "Outpatient";
      return "";
    };
    const normalizeGender = (v: any): ClaimFormData["patient_gender"] => {
      const s = String(v ?? "").trim().toLowerCase();
      if (s.startsWith("m")) return "Male";
      if (s.startsWith("f")) return "Female";
      return "";
    };

    setForm({
      patient_name: data.patient_name?.value || "",
      patient_id: data.patient_id?.value || "",
      date_of_service: data.date_of_service?.value || "",
      provider_name: data.provider_name?.value || "",
      provider_id: data.provider_id?.value || "",
      payer_name: data.payer_name?.value || "",
      payer_id: data.member_id?.value || "",
      diagnosis_codes: diagnosisCodes.length > 0 ? diagnosisCodes : [""],
      procedure_codes: procedureCodes.length > 0 ? procedureCodes : [""],
      billed_amount: typeof data.billed_amount?.value === "number" ? data.billed_amount.value : 0,
      notes: data.additional_notes?.value || "",
      patient_age: parseIntOrUndef(data.patient_age?.value),
      patient_gender: normalizeGender(data.patient_gender?.value),
      patient_state: data.patient_state?.value || "",
      visit_type: normalizeVisit(data.visit_type?.value),
      length_of_stay: parseIntOrUndef(data.length_of_stay?.value),
      insurance_type: data.insurance_type?.value || "",
      provider_specialty: data.provider_specialty?.value || "",
    });

    // NOTE: Backend returns 0-100. We round and cap at 100 for safety.
    const getConf = (field?: FieldData) => 
      field?.confidence !== undefined ? Math.min(100, Math.round(field.confidence)) : undefined;

    setExtractedScores({
      patient_name: getConf(data.patient_name),
      patient_id: getConf(data.patient_id),
      date_of_service: getConf(data.date_of_service),
      provider_name: getConf(data.provider_name),
      provider_id: getConf(data.provider_id),
      payer_name: getConf(data.payer_name),
      payer_id: getConf(data.member_id),
      billed_amount: getConf(data.billed_amount),
      notes: getConf(data.additional_notes),
      primary_diagnosis: getConf(data.primary_diagnosis),
      primary_procedure: getConf(data.primary_procedure),
    });
  };

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(e.target.files || []);
    if (incoming.length === 0) return;

    setExtractError("");

    const tooLarge = incoming.filter((f) => f.size > MAX_FILE_BYTES);
    const valid = incoming.filter((f) => f.size <= MAX_FILE_BYTES);

    setQueuedFiles((prev) => {
      // Dedupe by name+size so the same file doesn't enter the queue twice.
      const key = (f: File) => `${f.name}::${f.size}`;
      const existing = new Set(prev.map(key));
      const merged = [...prev, ...valid.filter((f) => !existing.has(key(f)))];
      return merged.slice(0, MAX_FILES);
    });

    const overflow = valid.length + queuedFiles.length > MAX_FILES;
    const messages: string[] = [];
    if (tooLarge.length > 0) {
      messages.push(`Skipped ${tooLarge.length} file(s) over 20MB.`);
    }
    if (overflow) {
      messages.push(`Only the first ${MAX_FILES} documents are kept.`);
    }
    if (messages.length > 0) setExtractError(messages.join(" "));

    // Reset the input so the same file can be re-picked after removal.
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeQueuedFile = (idx: number) => {
    setQueuedFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const clearQueue = () => {
    setQueuedFiles([]);
    setExtractError("");
  };

  const handleExtractAll = async () => {
    if (queuedFiles.length === 0 || extracting) return;
    setExtractError("");
    setExtracting(true);

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      const documents = await Promise.all(
        queuedFiles.map(async (f) => ({
          fileBase64: await fileToBase64(f),
          mediaType: f.type,
          fileName: f.name,
        }))
      );

      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/claims/extract`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ documents }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || data.error || "Failed to extract data from documents");
      }

      applyExtractedData(data.extracted as ExtractedClaim);
      setExtractedFileNames(queuedFiles.map((f) => f.name));
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : "Failed to process the documents");
    } finally {
      setExtracting(false);
    }
  };

  const formatBytes = (b: number) => {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();

    try {
      // Fraud-signal fields can be empty strings in the form state; backend
      // expects nulls / numbers, not blanks.
      const optNum = (v: unknown) => (v === "" || v === undefined || v === null ? null : Number(v));
      const optStr = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

      const payload = {
        ...form,
        payer_name: form.payer_name,
        // payer_id must be a registered insurer UUID OR empty (= out-of-network,
        // claim is stored as unrouted).
        payer_id: registeredPayerUuid || null,
        member_id: form.payer_id,
        confidence_scores: extractedScores,
        clinic_id: selectedClinicId,
        pre_auth_number: preAuthNumber.trim() || null,
        // Fraud-detector signals — normalised
        patient_age: optNum(form.patient_age),
        patient_gender: optStr(form.patient_gender),
        patient_state: optStr(form.patient_state),
        visit_type: optStr(form.visit_type),
        length_of_stay: optNum(form.length_of_stay),
        insurance_type: optStr(form.insurance_type),
        provider_specialty: optStr(form.provider_specialty),
      };

      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/claims/scrub`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail?.message || data.error || "Failed to scrub claim");
      }

      const data = await res.json();
      const basePath = pathname.replace('/new', '');
      router.push(`${basePath}/${data.id}/results`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  // Determine textarea warning classes based on confidence
  const notesConfidence = extractedScores.notes;
  let notesClasses = "bg-white border-[#e5e7eb] focus:ring-[#16a34a] focus:border-transparent text-[#0a0a0a]";
  let notesWarning = null;
  
  if (notesConfidence !== undefined && form.notes !== "") {
    if (notesConfidence > 0 && notesConfidence < 50) {
      notesClasses = "bg-red-50 border-red-400 focus:ring-red-500 text-red-900";
      notesWarning = "Low AI confidence. Please verify.";
    } else if (notesConfidence >= 50 && notesConfidence < 80) {
      notesClasses = "bg-amber-50 border-amber-400 focus:ring-amber-500 text-amber-900";
      notesWarning = "AI is unsure. Please verify.";
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {error && (
        <div className="bg-red-50 text-red-600 text-sm rounded-lg p-4 border border-red-200">
          {error}
        </div>
      )}

      {/* Billing Organization Dropdown (Only shows if Doctor has joined networks) */}
      {accountType === "doctor" && linkedOrgs.length > 0 && (
        <section className="bg-[#f9fafb] p-5 rounded-xl border border-[#e5e7eb] mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Building2 className="h-5 w-5 text-[#16a34a]" />
            <h3 className="font-display text-base font-bold text-[#0a0a0a]">
              Billing Organization
            </h3>
          </div>
          <div className="max-w-md">
            <label className="block text-sm font-medium text-[#374151] mb-1.5">
              Submitting claim on behalf of:
            </label>
            <div className="relative">
              <select
                value={selectedClinicId}
                onChange={(e) => setSelectedClinicId(e.target.value)}
                className="w-full pl-4 pr-10 py-2.5 rounded-xl border border-[#e5e7eb] bg-white text-sm text-[#0a0a0a] focus:outline-none focus:ring-4 focus:ring-[#16a34a]/10 focus:border-[#16a34a] transition-all appearance-none cursor-pointer"
              >
                <option value={userId}>Solo Practice (Myself)</option>
                {linkedOrgs.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
            <p className="text-xs text-[#6b7280] mt-2">
              If you select a hospital network, this claim will be visible to their administrative staff.
            </p>
          </div>
        </section>
      )}

      {/* Document Upload (AI Auto-Fill — multi-document) */}
      <section>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <Sparkles className="h-4 w-4 text-[#16a34a]" />
          <h3 className="font-display text-base sm:text-lg font-bold text-[#0a0a0a]">AI Auto-Fill</h3>
          <span className="text-xs bg-[#f0fdf4] text-[#16a34a] border border-[#bbf7d0] px-2 py-0.5 rounded-full font-medium">
            Optional
          </span>
        </div>
        <p className="text-sm text-[#6b7280] mb-4">
          Upload one or more related documents (claim form, insurance card, clinical note, lab report…).
          Once you&apos;ve added everything, click <span className="font-semibold text-[#16a34a]">Extract &amp; Auto-Fill</span> —
          the AI reads them all together and consolidates the fields below.
        </p>

        {/* Drop / browse zone */}
        <div
          className={`relative border-2 border-dashed rounded-xl p-6 transition-colors ${
            extracting
              ? "border-[#16a34a] bg-[#f0fdf4]"
              : queuedFiles.length > 0
              ? "border-[#16a34a] bg-[#f0fdf4]"
              : "border-[#d1d5db] bg-[#f9fafb] hover:border-[#16a34a] hover:bg-[#f0fdf4]"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={handleFilesSelected}
            disabled={extracting || queuedFiles.length >= MAX_FILES}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          />

          <div className="flex items-center gap-3 pointer-events-none">
            <div className="flex-shrink-0 w-10 h-10 bg-white rounded-lg flex items-center justify-center border border-[#e5e7eb]">
              <Upload className="h-5 w-5 text-[#16a34a]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[#0a0a0a]">
                {queuedFiles.length === 0
                  ? "Drop documents here, or click to browse"
                  : `${queuedFiles.length} document${queuedFiles.length === 1 ? "" : "s"} ready — add more or extract below`}
              </p>
              <p className="text-xs text-[#6b7280]">
                PDF or Image (Max 20MB each, up to {MAX_FILES} files)
              </p>
            </div>
            <FileText className="h-5 w-5 text-[#d1d5db] hidden sm:block" />
          </div>
        </div>

        {/* Queue list */}
        {queuedFiles.length > 0 && (
          <div className="mt-3 border border-[#e5e7eb] rounded-xl divide-y divide-[#f3f4f6] bg-white overflow-hidden">
            {queuedFiles.map((f, i) => (
              <div key={`${f.name}-${f.size}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
                <FileText className="h-4 w-4 text-[#16a34a] flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#0a0a0a] truncate">{f.name}</p>
                  <p className="text-xs text-[#9ca3af]">{formatBytes(f.size)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeQueuedFile(i)}
                  disabled={extracting}
                  className="p-1.5 text-[#9ca3af] hover:text-red-500 transition-colors disabled:opacity-50"
                  aria-label={`Remove ${f.name}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Extract / clear actions */}
        {queuedFiles.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={handleExtractAll}
              loading={extracting}
              className="gap-2"
            >
              <Sparkles className="h-4 w-4" />
              {extracting
                ? "Extracting…"
                : `Extract & Auto-Fill (${queuedFiles.length})`}
            </Button>
            <button
              type="button"
              onClick={clearQueue}
              disabled={extracting}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-[#6b7280] hover:text-red-500 border border-[#e5e7eb] hover:border-red-200 rounded-lg transition-colors disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              Clear queue
            </button>
          </div>
        )}

        {/* Success banner once extraction has applied */}
        {extractedFileNames.length > 0 && !extracting && (
          <div className="mt-3 flex items-start gap-3 bg-[#f0fdf4] border border-[#bbf7d0] rounded-lg p-3">
            <CheckCircle className="h-5 w-5 text-[#16a34a] flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0 text-xs text-[#15803d]">
              <p className="font-medium">
                Auto-filled from {extractedFileNames.length} document{extractedFileNames.length === 1 ? "" : "s"}.
                Unsure AI fields are highlighted in yellow — please verify before submitting.
              </p>
              <p className="mt-1 truncate text-[#16a34a]">{extractedFileNames.join(" · ")}</p>
            </div>
          </div>
        )}

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
            confidence={extractedScores.patient_name}
            required
          />
          <Input
            id="patient_id"
            label="Patient ID / National ID"
            placeholder="e.g. 9901234567"
            value={form.patient_id}
            onChange={(e) => updateField("patient_id", e.target.value)}
            confidence={extractedScores.patient_id}
            required
          />
          <Input
            id="date_of_service"
            label="Date of Service"
            type="date"
            value={form.date_of_service}
            onChange={(e) => updateField("date_of_service", e.target.value)}
            confidence={extractedScores.date_of_service}
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
          <Input
            id="provider_name"
            label="Provider / Facility Name"
            placeholder="Hospital or clinic name"
            value={form.provider_name}
            onChange={(e) => updateField("provider_name", e.target.value)}
            confidence={extractedScores.provider_name}
            required
          />
          <div>
            <Input
              id="provider_id"
              label="Provider ID"
              placeholder={providerIdHint || "License or NPI equivalent"}
              value={form.provider_id}
              onChange={(e) => updateField("provider_id", e.target.value)}
              confidence={extractedScores.provider_id}
              required
            />
            {providerIdHint && (
              <p className="mt-1 text-xs text-[#6b7280]">
                <span className="font-medium text-[#16a34a]">Expected format:</span> <span className="font-mono">{providerIdHint}</span>
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
        {form.payer_name && (
          registeredPayerUuid ? (
            <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-[#f0fdf4] border border-[#bbf7d0] text-xs text-[#15803d]">
              <span className="font-bold">In-network</span>
              <span>— this claim will be routed directly to the insurer&apos;s queue.</span>
            </div>
          ) : (
            <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
              <span className="font-bold">Out-of-network</span>
              <span>— this payer isn&apos;t in our network. The claim will be saved for your records but follow-up must be done manually.</span>
            </div>
          )
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex gap-2 items-start">
            <div className="flex-1">
              <Input
                id="payer_name"
                label="Payer / Insurance Company"
                placeholder="e.g. Jordan Insurance Company"
                value={form.payer_name}
                onChange={(e) => updateField("payer_name", e.target.value)}
                confidence={extractedScores.payer_name}
                required
              />
            </div>
            <button
              type="button"
              onClick={() => setPayerPickerOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2.5 mt-7 text-sm font-medium text-[#16a34a] hover:text-white hover:bg-[#16a34a] border border-[#bbf7d0] hover:border-[#16a34a] rounded-lg transition-colors"
            >
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">Browse</span>
            </button>
          </div>
          <Input
            id="payer_id"
            label="Policy / Member ID"
            placeholder="Insurance policy number"
            value={form.payer_id}
            onChange={(e) => updateField("payer_id", e.target.value)}
            confidence={extractedScores.payer_id}
            required
          />
        </div>
      </section>

      {/* Pre-Authorization Linkage */}
      <section>
        <h3 className="font-display text-base sm:text-lg font-bold text-[#0a0a0a] mb-1 pb-2 border-b border-[#e5e7eb]">
          Pre-Authorization
        </h3>
        <p className="text-xs text-[#6b7280] mb-4 mt-2">
          If you obtained a pre-authorization for this service, paste the number below.
          We&apos;ll verify the patient, validity window, and approved procedure codes — but only when the payer is in our network. Out-of-network payers can&apos;t be verified, so the field is informational in that case.
        </p>
        <div className="space-y-3">
          <Input
            id="pre_auth_number"
            label="Authorization Number (optional)"
            placeholder="AUTH-YYYYMMDD-XXXXXXXX"
            value={preAuthNumber}
            onChange={(e) => setPreAuthNumber(e.target.value.toUpperCase())}
            className="font-mono"
          />

          {preAuthLookup.state === "loading" && (
            <div className="text-xs text-[#9ca3af] flex items-center gap-2">
              <div className="w-3 h-3 border-2 border-[#16a34a] border-t-transparent rounded-full animate-spin" />
              Looking up authorization…
            </div>
          )}

          {preAuthLookup.state === "found" && (
            <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-lg p-3 text-xs">
              <div className="flex items-center gap-2 font-bold text-[#15803d] mb-2">
                <CheckCircle className="h-4 w-4" /> Authorization found
              </div>
              <div className="grid grid-cols-2 gap-2 text-[#15803d]">
                <div><span className="font-bold">Patient:</span> {preAuthLookup.patient_name || "—"}</div>
                <div><span className="font-bold">Insurer:</span> {preAuthLookup.insurer_name || "—"}</div>
                <div className="col-span-2"><span className="font-bold">Validity:</span> {preAuthLookup.detail}</div>
                {preAuthLookup.approved_procedures && preAuthLookup.approved_procedures.length > 0 && (
                  <div className="col-span-2">
                    <span className="font-bold">Approved codes:</span>{" "}
                    {preAuthLookup.approved_procedures.map((c) => (
                      <span key={c} className="font-mono ml-1 bg-white border border-[#bbf7d0] px-1.5 py-0.5 rounded">{c}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {(preAuthLookup.state === "expired" || preAuthLookup.state === "not_found") && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs flex items-start gap-2 text-amber-800">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">
                  {preAuthLookup.state === "expired" ? "Authorization expired" : "Authorization not found"}
                </p>
                <p>{preAuthLookup.detail}</p>
                <p className="mt-1">You can still submit, but the insurer will likely deny this claim for missing or invalid authorization.</p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Clinical Context — feeds the fraud detector */}
      <section>
        <h3 className="font-display text-base sm:text-lg font-bold text-[#0a0a0a] mb-1 pb-2 border-b border-[#e5e7eb]">
          Clinical Context
        </h3>
        <p className="text-xs text-[#6b7280] mb-4 mt-2">
          Optional but recommended. These signals feed our fraud detection model — the more we know
          about the visit, the more accurate the risk score. Leaving 5+ blank disables fraud scoring
          for this claim.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Patient demographics */}
          <Input
            id="patient_age"
            label="Patient Age"
            type="number"
            min={0}
            max={130}
            placeholder="e.g. 45"
            value={form.patient_age ?? ""}
            onChange={(e) => updateField("patient_age", e.target.value === "" ? "" : Number(e.target.value))}
          />
          <div className="space-y-1.5">
            <label htmlFor="patient_gender" className="block text-sm font-medium text-gray-700">Patient Gender</label>
            <select
              id="patient_gender"
              value={form.patient_gender || ""}
              onChange={(e) => updateField("patient_gender", e.target.value)}
              className="w-full h-[42px] px-3.5 py-2 bg-white border border-[#e5e7eb] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]/10 focus:border-[#16a34a]"
            >
              <option value="">— Select —</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>
          <Input
            id="patient_state"
            label="Patient State / Region"
            placeholder="e.g. Amman"
            value={form.patient_state || ""}
            onChange={(e) => updateField("patient_state", e.target.value)}
          />

          {/* Visit context */}
          <div className="space-y-1.5">
            <label htmlFor="visit_type" className="block text-sm font-medium text-gray-700">Visit Type</label>
            <select
              id="visit_type"
              value={form.visit_type || ""}
              onChange={(e) => updateField("visit_type", e.target.value)}
              className="w-full h-[42px] px-3.5 py-2 bg-white border border-[#e5e7eb] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]/10 focus:border-[#16a34a]"
            >
              <option value="">— Select —</option>
              {VISIT_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          {(form.visit_type === "Inpatient" || form.visit_type === "Day Surgery") && (
            <Input
              id="length_of_stay"
              label="Length of Stay (days)"
              type="number"
              min={0}
              max={365}
              placeholder="e.g. 3"
              value={form.length_of_stay ?? ""}
              onChange={(e) => updateField("length_of_stay", e.target.value === "" ? "" : Number(e.target.value))}
            />
          )}
          <div className="space-y-1.5">
            <label htmlFor="insurance_type" className="block text-sm font-medium text-gray-700">Insurance Plan Type</label>
            <select
              id="insurance_type"
              value={form.insurance_type || ""}
              onChange={(e) => updateField("insurance_type", e.target.value)}
              className="w-full h-[42px] px-3.5 py-2 bg-white border border-[#e5e7eb] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]/10 focus:border-[#16a34a]"
            >
              <option value="">— Select —</option>
              {INSURANCE_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>

          {/* Provider context */}
          <Input
            id="provider_specialty"
            label="Provider Specialty"
            placeholder="e.g. Cardiology"
            value={form.provider_specialty || ""}
            onChange={(e) => updateField("provider_specialty", e.target.value)}
          />
        </div>
      </section>

      {/* Diagnosis Codes */}
      <section>
        <h3 className="font-display text-base sm:text-lg font-bold text-[#0a0a0a] mb-4 pb-2 border-b border-[#e5e7eb]">
          Diagnosis Codes (ICD-10)
        </h3>
        <div className="space-y-3">
          {form.diagnosis_codes.map((code, i) => (
            <div key={i} className="flex gap-2 items-start">
              <div className="flex-1">
                <Input
                  id={`dx-${i}`}
                  label={i === 0 ? "Primary Diagnosis" : `Diagnosis ${i + 1}`}
                  placeholder="e.g. J06.9"
                  value={code}
                  onChange={(e) => updateArrayField("diagnosis_codes", i, e.target.value)}
                  confidence={i === 0 ? extractedScores.primary_diagnosis : undefined}
                  required={i === 0}
                />
              </div>
              <button
                type="button"
                onClick={() => setCodePicker({ type: "diagnosis_codes", index: i })}
                className="inline-flex items-center gap-1.5 px-3 py-2.5 mt-7 text-sm font-medium text-[#16a34a] hover:text-white hover:bg-[#16a34a] border border-[#bbf7d0] hover:border-[#16a34a] rounded-lg transition-colors"
              >
                <Search className="h-4 w-4" />
                <span className="hidden sm:inline">Browse</span>
              </button>
              {form.diagnosis_codes.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeArrayItem("diagnosis_codes", i)}
                  className="p-2.5 mt-7 text-[#9ca3af] hover:text-red-500 transition-colors"
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
            <div key={i} className="flex gap-2 items-start">
              <div className="flex-1">
                <Input
                  id={`cpt-${i}`}
                  label={i === 0 ? "Primary Procedure" : `Procedure ${i + 1}`}
                  placeholder="e.g. 99213"
                  value={code}
                  onChange={(e) => updateArrayField("procedure_codes", i, e.target.value)}
                  confidence={i === 0 ? extractedScores.primary_procedure : undefined}
                  required={i === 0}
                />
              </div>
              <button
                type="button"
                onClick={() => setCodePicker({ type: "procedure_codes", index: i })}
                className="inline-flex items-center gap-1.5 px-3 py-2.5 mt-7 text-sm font-medium text-[#16a34a] hover:text-white hover:bg-[#16a34a] border border-[#bbf7d0] hover:border-[#16a34a] rounded-lg transition-colors"
              >
                <Search className="h-4 w-4" />
                <span className="hidden sm:inline">Browse</span>
              </button>
              {form.procedure_codes.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeArrayItem("procedure_codes", i)}
                  className="p-2.5 mt-7 text-[#9ca3af] hover:text-red-500 transition-colors"
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
            confidence={extractedScores.billed_amount}
            required
          />
        </div>
      </section>

      {/* Notes (with manual confidence styling) */}
      <section>
        <h3 className="font-display text-base sm:text-lg font-bold text-[#0a0a0a] mb-4 pb-2 border-b border-[#e5e7eb] flex justify-between items-center">
          Additional Notes
          {notesWarning && (
            <span className={`text-xs flex items-center gap-1 font-medium ${notesClasses.includes("red") ? "text-red-500" : "text-amber-600"}`}>
              <AlertTriangle className="h-3 w-3" /> {notesWarning}
            </span>
          )}
        </h3>
        <textarea
          id="notes"
          rows={3}
          className={`w-full px-4 py-2.5 border rounded-xl placeholder:text-[#9ca3af] focus:outline-none focus:ring-4 transition-all duration-200 resize-none ${notesClasses}`}
          placeholder="Any additional context for the AI scrubber..."
          value={form.notes}
          onChange={(e) => updateField("notes", e.target.value)}
        />
      </section>

      {/* Submit */}
      <div className="flex justify-end pt-4 border-t border-[#e5e7eb]">
        <Button type="submit" loading={loading} size="lg" className="gap-2 w-full sm:w-auto">
          <Send className="h-4 w-4" />
          Submit Claim to Insurer
        </Button>
      </div>

      <PayerPicker
        isOpen={payerPickerOpen}
        onClose={() => setPayerPickerOpen(false)}
        onSelect={handlePayerSelect}
      />

      <CodePicker
        isOpen={codePicker !== null}
        onClose={() => setCodePicker(null)}
        onSelect={(code) => {
          if (codePicker) {
            updateArrayField(codePicker.type, codePicker.index, code);
          }
        }}
        codes={codePicker?.type === "procedure_codes" ? CPT_CODES : ICD10_CODES}
        title={codePicker?.type === "procedure_codes" ? "Browse CPT / HCPCS Codes" : "Browse ICD-10 Codes"}
        subtitle={codePicker?.type === "procedure_codes" ? "Common procedure codes used in MENA/Jordan clinic billing" : "Common diagnosis codes used in MENA/Jordan clinic billing"}
      />
    </form>
  );
}