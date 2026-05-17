"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import CodePicker from "@/components/CodePicker";
import { ICD10_CODES, MedicalCode } from "@/data/icd10";
import { CPT_CODES } from "@/data/cpt";
import {
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  FileUp,
  Trash2,
  User,
  Stethoscope,
  ClipboardList,
  CalendarClock,
  Building2,
  Plus,
  X,
  Sparkles,
  Paperclip,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────
interface Insurer {
  id: string;
  name: string;
  country?: string;
}

interface Attachment {
  file_name: string;
  content_type: string;
  content: string; // base64
}

interface Affiliation {
  org: { id: string; name: string; org_code: string } | null;
  linked_at: string;
}

/** One field returned by the AI extractor: a value plus a 0-100 confidence. */
interface ExtractedField<T = string> {
  value: T;
  confidence: number;
}

/** A clinical code plus whatever description the document printed for it. */
interface ExtractedCode {
  code: string;
  description: string;
}

interface PreAuthExtraction {
  patient_name?: ExtractedField;
  patient_dob?: ExtractedField;
  patient_gender?: ExtractedField;
  patient_id?: ExtractedField;
  insurance_member_id?: ExtractedField;
  insurance_group_number?: ExtractedField;
  patient_phone?: ExtractedField;
  patient_address?: ExtractedField;
  ordering_provider_name?: ExtractedField;
  ordering_provider_npi?: ExtractedField;
  ordering_provider_tax_id?: ExtractedField;
  servicing_provider_name?: ExtractedField;
  servicing_provider_npi?: ExtractedField;
  servicing_provider_tax_id?: ExtractedField;
  diagnosis_codes?: ExtractedField<ExtractedCode[]>;
  procedure_codes?: ExtractedField<ExtractedCode[]>;
  modifiers?: ExtractedField;
  ndc_code?: ExtractedField;
  place_of_service?: ExtractedField;
  anticipated_date_of_service?: ExtractedField;
  payer_name?: ExtractedField;
}

type Mode = "doctor" | "provider";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "";

// Place of service — the cost-control field insurers care about (pre-auth.md §4).
const PLACE_OF_SERVICE = [
  "Inpatient Hospital",
  "Outpatient Hospital",
  "Outpatient Surgery Center",
  "Doctor's Office",
  "Patient's Home",
  "Emergency Room",
  "Telehealth",
  "Other",
];

// ─── Helpers ───────────────────────────────────────────
function ageFromDob(dob: string): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

const clampConf = (n: number) => Math.min(100, Math.max(0, Math.round(n || 0)));

// ─── Component ─────────────────────────────────────────
export default function PreAuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const supabase = createClient();

  const dashboardPath = `/dashboard/${mode}`;
  const listPath = `/dashboard/${mode}/pre-auth`;

  // Flow: step 1 = drop off documents, step 2 = review & submit the form.
  const [step, setStep] = useState<1 | 2>(1);

  // Reference data
  const [insurers, setInsurers] = useState<Insurer[]>([]);
  const [affiliations, setAffiliations] = useState<Affiliation[]>([]);

  // Routing
  const [insurerId, setInsurerId] = useState(""); // "" = out-of-network
  const [payerNameRaw, setPayerNameRaw] = useState("");
  const [clinicId, setClinicId] = useState(""); // doctor mode: which hospital

  // Patient demographics
  const [patientName, setPatientName] = useState("");
  const [patientDob, setPatientDob] = useState("");
  const [patientGender, setPatientGender] = useState("");
  const [patientId, setPatientId] = useState("");
  const [insuranceMemberId, setInsuranceMemberId] = useState("");
  const [insuranceGroupNumber, setInsuranceGroupNumber] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [patientAddress, setPatientAddress] = useState("");

  // Provider information
  const [orderingName, setOrderingName] = useState("");
  const [orderingNpi, setOrderingNpi] = useState("");
  const [orderingTaxId, setOrderingTaxId] = useState("");
  const [servicingName, setServicingName] = useState("");
  const [servicingNpi, setServicingNpi] = useState("");
  const [servicingTaxId, setServicingTaxId] = useState("");

  // Clinical coding
  const [diagnosisCodes, setDiagnosisCodes] = useState<string[]>([]);
  const [procedureCodes, setProcedureCodes] = useState<string[]>([]);
  const [modifiers, setModifiers] = useState("");
  const [ndcCode, setNdcCode] = useState("");
  const [icdPickerOpen, setIcdPickerOpen] = useState(false);
  const [cptPickerOpen, setCptPickerOpen] = useState(false);

  // Service details
  const [placeOfService, setPlaceOfService] = useState("");
  const [anticipatedDate, setAnticipatedDate] = useState("");
  const [priority, setPriority] = useState<"Standard" | "Expedited">("Standard");

  // Documents (dropped off in step 1, sent to the insurer on submit)
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  // Extraction / confidence
  const [confidence, setConfidence] = useState<Record<string, number>>({});
  // Descriptions the AI read off the document for codes not in our catalogue.
  const [codeDescriptions, setCodeDescriptions] = useState<Record<string, string>>({});
  const [autoFilled, setAutoFilled] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Submit
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const icdMap = useMemo(
    () => new Map(ICD10_CODES.map((c: MedicalCode) => [c.code, c.description])),
    []
  );
  const cptMap = useMemo(
    () => new Map(CPT_CODES.map((c: MedicalCode) => [c.code, c.description])),
    []
  );

  // Code-chip description lookup. Diagnosis and procedure codes are not 100%
  // standardised worldwide, so for any code not in our curated catalogue we
  // fall back to the description the AI read off the document, and only label
  // it a "Custom code" when neither source has a description.
  const describeIcd = (code: string) =>
    icdMap.get(code) || codeDescriptions[code] || "Custom code";
  const describeCpt = (code: string) =>
    cptMap.get(code) || codeDescriptions[code] || "Custom code";

  const avgConfidence = useMemo(() => {
    const vals = Object.values(confidence);
    if (!vals.length) return null;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }, [confidence]);

  // ─── Load reference data ─────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${BACKEND}/api/dropoff/insurers`);
        if (res.ok) setInsurers(await res.json());
      } catch {
        /* non-critical — out-of-network entry still works */
      }
    })();
  }, []);

  useEffect(() => {
    if (mode !== "doctor") return;
    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) return;
        const res = await fetch(`${BACKEND}/api/doctors/affiliations`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        const affs: Affiliation[] = data.affiliations || [];
        setAffiliations(affs);
        // Auto-select when the doctor belongs to exactly one hospital.
        if (affs.length === 1 && affs[0].org) setClinicId(affs[0].org.id);
      } catch {
        /* non-critical */
      }
    })();
  }, [mode, supabase]);

  const isUnrouted = !insurerId;

  // ─── Document handling ───────────────────────────────
  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    setExtractError("");
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1];
        setAttachments((prev) => [
          ...prev,
          {
            file_name: file.name,
            content_type: file.type || "application/octet-stream",
            content: base64,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeAttachment = (idx: number) =>
    setAttachments((prev) => prev.filter((_, i) => i !== idx));

  // ─── Extraction → auto-fill ──────────────────────────
  const applyExtracted = (ex: PreAuthExtraction) => {
    const conf: Record<string, number> = {};
    const txt = (
      f: ExtractedField | undefined,
      setter: (v: string) => void,
      key: string
    ) => {
      if (!f) return;
      if (typeof f.value === "string" && f.value.trim()) {
        setter(f.value.trim());
        conf[key] = clampConf(f.confidence);
      }
    };

    txt(ex.patient_name, setPatientName, "patient_name");
    txt(ex.patient_dob, setPatientDob, "patient_dob");
    txt(ex.patient_id, setPatientId, "patient_id");
    txt(ex.insurance_member_id, setInsuranceMemberId, "insurance_member_id");
    txt(ex.insurance_group_number, setInsuranceGroupNumber, "insurance_group_number");
    txt(ex.patient_phone, setPatientPhone, "patient_phone");
    txt(ex.patient_address, setPatientAddress, "patient_address");
    txt(ex.ordering_provider_name, setOrderingName, "ordering_name");
    txt(ex.ordering_provider_npi, setOrderingNpi, "ordering_npi");
    txt(ex.ordering_provider_tax_id, setOrderingTaxId, "ordering_tax_id");
    txt(ex.servicing_provider_name, setServicingName, "servicing_name");
    txt(ex.servicing_provider_npi, setServicingNpi, "servicing_npi");
    txt(ex.servicing_provider_tax_id, setServicingTaxId, "servicing_tax_id");
    txt(ex.modifiers, setModifiers, "modifiers");
    txt(ex.ndc_code, setNdcCode, "ndc_code");
    txt(ex.anticipated_date_of_service, setAnticipatedDate, "anticipated_date");

    // Gender — only the two valid options.
    const g = ex.patient_gender?.value?.trim();
    if (g === "Male" || g === "Female") {
      setPatientGender(g);
      conf.patient_gender = clampConf(ex.patient_gender!.confidence);
    }

    // Place of service — only if it matches a known option.
    const pos = ex.place_of_service?.value?.trim();
    if (pos && PLACE_OF_SERVICE.includes(pos)) {
      setPlaceOfService(pos);
      conf.place_of_service = clampConf(ex.place_of_service!.confidence);
    }

    // Clinical codes — keep the code exactly as written; remember any
    // description the document supplied so codes outside our catalogue still
    // show a meaningful label.
    const descMap: Record<string, string> = {};
    const collectCodes = (list: ExtractedCode[] | undefined) =>
      (list || [])
        .filter((c) => c.code && c.code.trim())
        .map((c) => {
          const code = c.code.trim();
          if (c.description && c.description.trim()) descMap[code] = c.description.trim();
          return code;
        });

    const dx = collectCodes(ex.diagnosis_codes?.value);
    if (dx.length) {
      setDiagnosisCodes(dx);
      conf.diagnosis_codes = clampConf(ex.diagnosis_codes!.confidence);
    }
    const px = collectCodes(ex.procedure_codes?.value);
    if (px.length) {
      setProcedureCodes(px);
      conf.procedure_codes = clampConf(ex.procedure_codes!.confidence);
    }
    if (Object.keys(descMap).length) setCodeDescriptions(descMap);

    // Payer — match a registered insurer, else prefill the out-of-network name.
    const payer = ex.payer_name?.value?.trim();
    if (payer) {
      const match = insurers.find(
        (i) => i.name.toLowerCase() === payer.toLowerCase()
      );
      if (match) setInsurerId(match.id);
      else setPayerNameRaw(payer);
      conf.payer_name = clampConf(ex.payer_name!.confidence);
    }

    setConfidence(conf);
  };

  const extractAndContinue = async () => {
    if (attachments.length === 0) {
      setExtractError("Upload at least one document first.");
      return;
    }
    setExtractError("");
    setExtracting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Your session expired — please sign in again.");

      const res = await fetch(`${BACKEND}/api/dropoff/extract`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          documents: attachments.map((a) => ({
            fileBase64: a.content,
            mediaType: a.content_type,
            fileName: a.file_name,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || "Extraction failed.");

      applyExtracted(data.extracted as PreAuthExtraction);
      setAutoFilled(true);
      setStep(2);
    } catch (err) {
      setExtractError(
        `${err instanceof Error ? err.message : "Extraction failed."} ` +
          "You can still continue and fill the form in manually."
      );
    } finally {
      setExtracting(false);
    }
  };

  const skipToForm = () => {
    if (attachments.length === 0) {
      setExtractError("Upload at least one document first.");
      return;
    }
    setExtractError("");
    setStep(2);
  };

  // ─── Code chips ──────────────────────────────────────
  const addCode = (list: string[], setter: (v: string[]) => void, code: string) => {
    if (!list.includes(code)) setter([...list, code]);
  };
  const removeCode = (list: string[], setter: (v: string[]) => void, code: string) => {
    setter(list.filter((c) => c !== code));
  };

  // ─── Submit ──────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!patientName.trim() || !patientDob || !patientGender) {
      setError("Patient name, date of birth and gender are required.");
      return;
    }
    if (isUnrouted && !payerNameRaw.trim()) {
      setError("Select a registered insurer, or type the payer's name for an out-of-network request.");
      return;
    }
    if (diagnosisCodes.length === 0) {
      setError("Add at least one diagnosis (ICD-10) code — it defines the medical scenario.");
      return;
    }
    if (procedureCodes.length === 0) {
      setError("Add at least one procedure (CPT) code for the requested service.");
      return;
    }
    if (!placeOfService) {
      setError("Select the place of service.");
      return;
    }
    if (mode === "doctor" && affiliations.length > 0 && !clinicId) {
      setError("Choose which hospital this pre-auth is submitted under.");
      return;
    }
    if (attachments.length === 0) {
      setError("At least one clinical document is required. Go back to the documents step to add one.");
      return;
    }

    setSubmitting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Your session expired — please sign in again.");

      const res = await fetch(`${BACKEND}/api/dropoff/provider`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          insurer_id: insurerId || null,
          payer_name_raw: isUnrouted ? payerNameRaw.trim() : null,
          clinic_id: clinicId || null,
          patient_name: patientName.trim(),
          patient_id: patientId.trim() || null,
          patient_dob: patientDob || null,
          patient_age: ageFromDob(patientDob),
          patient_gender: patientGender || null,
          insurance_member_id: insuranceMemberId.trim() || null,
          insurance_group_number: insuranceGroupNumber.trim() || null,
          patient_phone: patientPhone.trim() || null,
          patient_address: patientAddress.trim() || null,
          ordering_provider_name: orderingName.trim() || null,
          ordering_provider_npi: orderingNpi.trim() || null,
          ordering_provider_tax_id: orderingTaxId.trim() || null,
          servicing_provider_name: servicingName.trim() || null,
          servicing_provider_npi: servicingNpi.trim() || null,
          servicing_provider_tax_id: servicingTaxId.trim() || null,
          diagnosis_codes: diagnosisCodes,
          procedure_codes: procedureCodes,
          modifiers: modifiers.trim() || null,
          ndc_code: ndcCode.trim() || null,
          place_of_service: placeOfService || null,
          anticipated_date_of_service: anticipatedDate || null,
          priority,
          attachments,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail || "Failed to submit pre-authorisation.");
      }
      const data = await res.json();
      router.push(
        `${listPath}?submitted=${encodeURIComponent(data.reference_number)}&routing=${data.routing_status}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
      setSubmitting(false);
    }
  };

  // ─── Render ──────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Back link */}
      <div className="mb-6">
        <Link
          href={dashboardPath}
          className="group flex items-center gap-2 text-sm font-medium text-[#6b7280] hover:text-[#16a34a] w-fit"
        >
          <div className="w-8 h-8 flex items-center justify-center rounded-full bg-white border border-[#e5e7eb] group-hover:border-[#16a34a] group-hover:bg-[#f0fdf4] transition-all">
            <ArrowLeft className="h-4 w-4" />
          </div>
          Back to Dashboard
        </Link>
      </div>

      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="inline-flex items-center justify-center w-11 h-11 bg-[#f0fdf4] border border-[#bbf7d0] rounded-lg">
          <ShieldCheck className="h-5 w-5 text-[#16a34a]" />
        </div>
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#0a0a0a]">
            New Pre-Authorisation
          </h1>
          <p className="text-[#6b7280] text-sm">
            {step === 1
              ? "Drop off the clinical documents — we'll read them and fill the request for you."
              : "Review the auto-filled request and submit it for the insurer to greenlight."}
          </p>
        </div>
      </div>

      <Stepper step={step} />

      {/* ─── STEP 1 — Document drop-off ─────────────────── */}
      {step === 1 && (
        <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm p-6 md:p-8">
          <h3 className="font-display text-base sm:text-lg font-bold text-[#0a0a0a] mb-1.5 flex items-center gap-2">
            <FileUp className="h-4 w-4 text-[#16a34a]" />
            Drop off clinical documents
          </h3>
          <p className="text-sm text-[#6b7280] mb-5">
            Add the patient&apos;s clinical notes, test results, referral and step-therapy /
            conservative-treatment proof. Our AI reads them to auto-fill the request, and the same
            files are attached to the submission sent to the insurer.
          </p>

          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onDragOver={(e) => e.preventDefault()}
            onDragEnter={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={(e) => {
              // Ignore drag-leave events fired while moving over child elements.
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleFiles(e.dataTransfer.files);
            }}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all focus:outline-none focus:ring-4 focus:ring-[#16a34a]/10 ${
              dragOver
                ? "border-[#16a34a] bg-[#f0fdf4]"
                : "border-[#e5e7eb] bg-[#fcfdfc] hover:border-[#16a34a]"
            }`}
          >
            <FileUp
              className={`h-9 w-9 mx-auto mb-2 transition-colors ${
                dragOver ? "text-[#15803d]" : "text-[#16a34a]"
              }`}
            />
            <p className="text-sm font-medium text-[#0a0a0a]">
              {dragOver
                ? "Drop the files to upload"
                : "Drag & drop files here, or click to upload"}
            </p>
            <p className="text-xs text-[#6b7280] mt-1">
              PDFs, images or documents — you can attach multiple files.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="application/pdf,image/*,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>

          {attachments.length > 0 && (
            <ul className="mt-4 space-y-2">
              {attachments.map((att, i) => (
                <li
                  key={`${att.file_name}-${i}`}
                  className="flex items-center justify-between px-3 py-2 bg-[#f9fafb] border border-[#e5e7eb] rounded-lg"
                >
                  <span className="flex items-center gap-2 text-sm text-[#0a0a0a] truncate">
                    <Paperclip className="h-3.5 w-3.5 text-[#9ca3af] flex-shrink-0" />
                    <span className="truncate">{att.file_name}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(i)}
                    className="text-red-500 hover:text-red-700 flex-shrink-0"
                    aria-label="Remove file"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {extractError && (
            <div className="mt-4 bg-red-50 text-red-600 text-sm rounded-lg p-3 border border-red-200">
              {extractError}
            </div>
          )}

          {extracting && (
            <div className="mt-4 flex items-center gap-2 text-sm text-[#15803d] bg-[#f0fdf4] border border-[#bbf7d0] rounded-lg p-3">
              <Sparkles className="h-4 w-4 animate-pulse" />
              Reading your documents and filling the request — this takes a few seconds…
            </div>
          )}

          <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3">
            <button
              type="button"
              onClick={skipToForm}
              disabled={extracting || attachments.length === 0}
              className="text-sm font-medium text-[#6b7280] hover:text-[#16a34a] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continue without auto-fill →
            </button>
            <Button
              type="button"
              onClick={extractAndContinue}
              loading={extracting}
              disabled={attachments.length === 0}
            >
              <Sparkles className="h-4 w-4 mr-2" /> Extract &amp; continue
            </Button>
          </div>
        </div>
      )}

      {/* ─── STEP 2 — Review & submit ───────────────────── */}
      {step === 2 && (
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm p-6 md:p-8 space-y-8"
        >
          {error && (
            <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 border border-red-200">
              {error}
            </div>
          )}

          {/* Auto-fill summary */}
          {autoFilled && (
            <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-[#f0fdf4] border border-[#bbf7d0] text-sm text-[#15803d]">
              <Sparkles className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>
                Auto-filled from <strong>{attachments.length}</strong>{" "}
                document{attachments.length === 1 ? "" : "s"}
                {avgConfidence !== null && (
                  <>
                    {" "}
                    · about <strong>{avgConfidence}%</strong> average AI accuracy
                  </>
                )}
                . Review the fields below — anything the AI was unsure about is highlighted in
                amber or red.
              </span>
            </div>
          )}

          {/* Documents attached */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-[#f9fafb] border border-[#e5e7eb]">
            <div className="flex items-center gap-2 text-sm text-[#374151] min-w-0">
              <Paperclip className="h-4 w-4 text-[#6b7280] flex-shrink-0" />
              <span className="truncate">
                <strong>{attachments.length}</strong>{" "}
                document{attachments.length === 1 ? "" : "s"} attached — sent to the insurer with
                this request.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="text-xs font-bold text-[#16a34a] hover:text-[#15803d] flex-shrink-0"
            >
              Change
            </button>
          </div>

          {/* ─── Hospital (doctor mode) ──────────────────── */}
          {mode === "doctor" && (
            <Section icon={Building2} title="Submitting Hospital">
              {affiliations.length === 0 ? (
                <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>
                    You aren&apos;t affiliated with a hospital yet, so this is submitted as a solo
                    doctor. Link a hospital from <strong>My Hospitals</strong> to let its admin
                    track your pre-auths.
                  </span>
                </div>
              ) : (
                <>
                  <label className="block text-sm font-medium text-[#374151] mb-1.5">
                    Hospital / organisation <span className="text-red-500">*</span>
                  </label>
                  <Select
                    id="clinicId"
                    value={clinicId}
                    onChange={setClinicId}
                    options={[
                      { value: "", label: "— Select a hospital —" },
                      ...affiliations
                        .filter((a) => a.org)
                        .map((a) => ({
                          value: a.org!.id,
                          label: `${a.org!.name} (${a.org!.org_code})`,
                        })),
                    ]}
                  />
                  <p className="text-xs text-[#9ca3af] mt-1.5">
                    The hospital admin can review and govern every pre-auth submitted under it.
                  </p>
                </>
              )}
            </Section>
          )}

          {/* ─── Insurance company ───────────────────────── */}
          <Section icon={ShieldCheck} title="Insurance Company">
            <label className="flex items-center justify-between text-sm font-medium text-[#374151] mb-1.5">
              <span>Registered insurer</span>
              <ConfidenceBadge score={confidence.payer_name} />
            </label>
            <Select
              id="insurerId"
              value={insurerId}
              onChange={setInsurerId}
              options={[
                { value: "", label: "— Not in this list (out-of-network) —" },
                ...insurers.map((ins) => ({
                  value: ins.id,
                  label: `${ins.name}${ins.country ? ` (${ins.country})` : ""}`,
                })),
              ]}
            />

            {isUnrouted ? (
              <div className="mt-3 space-y-3">
                <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>
                    <strong>Out-of-network.</strong> This payer isn&apos;t connected to ClaimRidge.
                    We&apos;ll store the request for your records, but it isn&apos;t routed to an
                    insurer — follow-up has to happen manually.
                  </span>
                </div>
                <Input
                  id="payerNameRaw"
                  label="Insurance company name"
                  placeholder="Type the payer's name"
                  value={payerNameRaw}
                  confidence={confidence.payer_name}
                  onChange={(e) => setPayerNameRaw(e.target.value)}
                />
              </div>
            ) : (
              <div className="mt-3 flex items-start gap-2 px-3 py-2 rounded-lg bg-[#f0fdf4] border border-[#bbf7d0] text-xs text-[#15803d]">
                <ShieldCheck className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>In-network.</strong> The request is routed to the insurer&apos;s queue,
                  where their medical team reviews and decides it against their policy.
                </span>
              </div>
            )}
          </Section>

          {/* ─── Patient demographics ────────────────────── */}
          <Section icon={User} title="Patient">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                id="patientName"
                label="Patient name *"
                value={patientName}
                confidence={confidence.patient_name}
                onChange={(e) => setPatientName(e.target.value)}
              />
              <div>
                <label className="flex items-center justify-between text-sm font-medium text-[#374151] mb-1.5">
                  <span>Date of birth *</span>
                  <ConfidenceBadge score={confidence.patient_dob} />
                </label>
                <input
                  type="date"
                  value={patientDob}
                  max={new Date().toISOString().split("T")[0]}
                  onChange={(e) => setPatientDob(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-[#e5e7eb] bg-white text-sm focus:outline-none focus:ring-4 focus:ring-[#16a34a]/10 focus:border-[#16a34a]"
                />
              </div>
              <div>
                <label className="flex items-center justify-between text-sm font-medium text-[#374151] mb-1.5">
                  <span>Gender *</span>
                  <ConfidenceBadge score={confidence.patient_gender} />
                </label>
                <Select
                  id="patientGender"
                  value={patientGender}
                  onChange={setPatientGender}
                  options={[
                    { value: "", label: "— Select —" },
                    { value: "Male", label: "Male" },
                    { value: "Female", label: "Female" },
                  ]}
                />
              </div>
              <Input
                id="patientId"
                label="National / Patient ID"
                value={patientId}
                confidence={confidence.patient_id}
                onChange={(e) => setPatientId(e.target.value)}
              />
              <Input
                id="insuranceMemberId"
                label="Insurance member ID"
                value={insuranceMemberId}
                confidence={confidence.insurance_member_id}
                onChange={(e) => setInsuranceMemberId(e.target.value)}
              />
              <Input
                id="insuranceGroupNumber"
                label="Group number"
                value={insuranceGroupNumber}
                confidence={confidence.insurance_group_number}
                onChange={(e) => setInsuranceGroupNumber(e.target.value)}
              />
              <Input
                id="patientPhone"
                label="Phone"
                value={patientPhone}
                confidence={confidence.patient_phone}
                onChange={(e) => setPatientPhone(e.target.value)}
              />
              <Input
                id="patientAddress"
                label="Address"
                value={patientAddress}
                confidence={confidence.patient_address}
                onChange={(e) => setPatientAddress(e.target.value)}
              />
            </div>
          </Section>

          {/* ─── Provider information ────────────────────── */}
          <Section icon={Stethoscope} title="Provider Information">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                id="orderingName"
                label="Ordering Physician Name"
                placeholder="Dr. John Doe"
                value={orderingName}
                confidence={confidence.ordering_name}
                onChange={(e) => setOrderingName(e.target.value)}
              />
              <Input
                id="servicingName"
                label="Servicing Facility Name"
                placeholder="Hospital or clinic name"
                value={servicingName}
                confidence={confidence.servicing_name}
                onChange={(e) => setServicingName(e.target.value)}
              />
              <Input
                id="servicingNpi"
                label="Servicing NPI"
                placeholder="10-digit NPI number"
                value={servicingNpi}
                confidence={confidence.servicing_npi}
                onChange={(e) => setServicingNpi(e.target.value)}
              />
              <Input
                id="servicingTaxId"
                label="Servicing Tax ID"
                placeholder="9-digit TIN / EIN"
                value={servicingTaxId}
                confidence={confidence.servicing_tax_id}
                onChange={(e) => setServicingTaxId(e.target.value)}
              />
            </div>
          </Section>

          {/* ─── Clinical coding ─────────────────────────── */}
          <Section icon={ClipboardList} title="Clinical Coding">
            <div className="space-y-5">
              <CodeField
                label="Diagnosis codes (ICD-10) *"
                hint="What illness or condition the patient has."
                codes={diagnosisCodes}
                describe={describeIcd}
                confidence={confidence.diagnosis_codes}
                onAdd={() => setIcdPickerOpen(true)}
                onRemove={(c) => removeCode(diagnosisCodes, setDiagnosisCodes, c)}
              />
              <CodeField
                label="Procedure codes (CPT / HCPCS) *"
                hint="The procedure, surgery or service being requested."
                codes={procedureCodes}
                describe={describeCpt}
                confidence={confidence.procedure_codes}
                onAdd={() => setCptPickerOpen(true)}
                onRemove={(c) => removeCode(procedureCodes, setProcedureCodes, c)}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  id="modifiers"
                  label="Modifiers"
                  placeholder="e.g. LT, RT, 59"
                  value={modifiers}
                  confidence={confidence.modifiers}
                  onChange={(e) => setModifiers(e.target.value)}
                />
                <Input
                  id="ndcCode"
                  label="NDC (drug code)"
                  placeholder="For specialty pharmacy requests"
                  value={ndcCode}
                  confidence={confidence.ndc_code}
                  onChange={(e) => setNdcCode(e.target.value)}
                />
              </div>
            </div>
          </Section>

          {/* ─── Service details ─────────────────────────── */}
          <Section icon={CalendarClock} title="Service Details">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="flex items-center justify-between text-sm font-medium text-[#374151] mb-1.5">
                  <span>Place of service *</span>
                  <ConfidenceBadge score={confidence.place_of_service} />
                </label>
                <Select
                  id="placeOfService"
                  value={placeOfService}
                  onChange={setPlaceOfService}
                  options={[
                    { value: "", label: "— Select —" },
                    ...PLACE_OF_SERVICE.map((p) => ({ value: p, label: p })),
                  ]}
                />
              </div>
              <div>
                <label className="flex items-center justify-between text-sm font-medium text-[#374151] mb-1.5">
                  <span>Anticipated date of service</span>
                  <ConfidenceBadge score={confidence.anticipated_date} />
                </label>
                <input
                  type="date"
                  value={anticipatedDate}
                  onChange={(e) => setAnticipatedDate(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-[#e5e7eb] bg-white text-sm focus:outline-none focus:ring-4 focus:ring-[#16a34a]/10 focus:border-[#16a34a]"
                />
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-[#374151] mb-1.5">Urgency</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <PriorityCard
                  active={priority === "Standard"}
                  onClick={() => setPriority("Standard")}
                  title="Standard"
                  desc="Routine request — 7-day review window."
                />
                <PriorityCard
                  active={priority === "Expedited"}
                  onClick={() => setPriority("Expedited")}
                  title="Expedited / Urgent"
                  desc="Time-sensitive — 72-hour review window."
                />
              </div>
            </div>
          </Section>

          <div className="flex justify-between gap-3">
            <Button type="button" variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Documents
            </Button>
            <Button type="submit" loading={submitting}>
              Submit Pre-Authorisation
            </Button>
          </div>
        </form>
      )}

      {/* Code pickers */}
      <CodePicker
        isOpen={icdPickerOpen}
        onClose={() => setIcdPickerOpen(false)}
        onSelect={(code) => addCode(diagnosisCodes, setDiagnosisCodes, code)}
        codes={ICD10_CODES}
        title="Select an ICD-10 diagnosis code"
        subtitle="Search by code or description."
      />
      <CodePicker
        isOpen={cptPickerOpen}
        onClose={() => setCptPickerOpen(false)}
        onSelect={(code) => addCode(procedureCodes, setProcedureCodes, code)}
        codes={CPT_CODES}
        title="Select a CPT / HCPCS procedure code"
        subtitle="Search by code or description."
      />
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────
function Stepper({ step }: { step: 1 | 2 }) {
  const dot = (n: 1 | 2, label: string) => {
    const active = step === n;
    const done = step > n;
    return (
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold ${
            active
              ? "bg-[#16a34a] text-white"
              : done
              ? "bg-[#bbf7d0] text-[#15803d]"
              : "bg-[#f3f4f6] text-[#9ca3af]"
          }`}
        >
          {n}
        </span>
        <span
          className={`text-sm font-bold ${active ? "text-[#0a0a0a]" : "text-[#9ca3af]"}`}
        >
          {label}
        </span>
      </div>
    );
  };
  return (
    <div className="flex items-center gap-3 mb-6">
      {dot(1, "Documents")}
      <ArrowRight className="h-4 w-4 text-[#d1d5db]" />
      {dot(2, "Review & Submit")}
    </div>
  );
}

function ConfidenceBadge({ score }: { score?: number }) {
  if (score === undefined || score === null) return null;
  const s = Math.round(score);
  const cls =
    s >= 80
      ? "bg-[#f0fdf4] text-[#16a34a] border-[#bbf7d0]"
      : s >= 50
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-red-50 text-red-600 border-red-200";
  return (
    <span
      title="AI extraction accuracy"
      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold border ${cls}`}
    >
      {s}%
    </span>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="font-display text-base sm:text-lg font-bold text-[#0a0a0a] mb-4 pb-2 border-b border-[#e5e7eb] flex items-center gap-2">
        <Icon className="h-4 w-4 text-[#16a34a]" />
        {title}
      </h3>
      {children}
    </section>
  );
}

function CodeField({
  label,
  hint,
  codes,
  describe,
  confidence,
  onAdd,
  onRemove,
}: {
  label: string;
  hint: string;
  codes: string[];
  describe: (code: string) => string;
  confidence?: number;
  onAdd: () => void;
  onRemove: (code: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <label className="block text-sm font-medium text-[#374151]">{label}</label>
          <ConfidenceBadge score={confidence} />
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 text-xs font-bold text-[#16a34a] hover:text-[#15803d]"
        >
          <Plus className="h-3.5 w-3.5" /> Add code
        </button>
      </div>
      <p className="text-xs text-[#9ca3af] mb-2">{hint}</p>
      {codes.length === 0 ? (
        <div className="px-3 py-3 rounded-lg border border-dashed border-[#e5e7eb] text-xs text-[#9ca3af] text-center">
          No codes added yet.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {codes.map((code) => (
            <li
              key={code}
              className="flex items-center gap-2 px-3 py-2 bg-[#f9fafb] border border-[#e5e7eb] rounded-lg"
            >
              <span className="font-mono text-sm font-semibold text-[#16a34a] min-w-[72px]">
                {code}
              </span>
              <span className="flex-1 text-xs text-[#6b7280] truncate">
                {describe(code)}
              </span>
              <button
                type="button"
                onClick={() => onRemove(code)}
                className="text-[#9ca3af] hover:text-red-500"
                aria-label={`Remove ${code}`}
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PriorityCard({
  active,
  onClick,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left px-4 py-3 rounded-lg border transition-all ${
        active
          ? "bg-[#f0fdf4] border-[#16a34a] ring-2 ring-[#16a34a]/15"
          : "bg-white border-[#e5e7eb] hover:border-[#16a34a]"
      }`}
    >
      <p className={`text-sm font-bold ${active ? "text-[#15803d]" : "text-[#0a0a0a]"}`}>
        {title}
      </p>
      <p className="text-xs text-[#6b7280] mt-0.5">{desc}</p>
    </button>
  );
}
