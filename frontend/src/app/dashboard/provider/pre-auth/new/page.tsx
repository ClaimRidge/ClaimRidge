"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import {
  ArrowLeft,
  FileUp,
  ShieldCheck,
  AlertTriangle,
  Trash2,
} from "lucide-react";

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

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "";

export default function NewProviderPreAuthPage() {
  const router = useRouter();
  const supabase = createClient();

  const [insurers, setInsurers] = useState<Insurer[]>([]);
  const [insurerId, setInsurerId] = useState<string>(""); // "" = out-of-network
  const [payerNameRaw, setPayerNameRaw] = useState("");
  const [providerName, setProviderName] = useState("");
  const [patientName, setPatientName] = useState("");
  const [patientId, setPatientId] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${BACKEND}/api/dropoff/insurers`);
        if (res.ok) setInsurers(await res.json());
      } catch {
        /* non-critical */
      }
    })();
  }, []);

  const isUnrouted = !insurerId;

  const handleFileChange = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1];
        setAttachments((prev) => [
          ...prev,
          { file_name: file.name, content_type: file.type || "application/octet-stream", content: base64 },
        ]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (attachments.length === 0) {
      setError("Please attach at least one clinical document.");
      return;
    }
    if (isUnrouted && !payerNameRaw.trim()) {
      setError("Please type the insurance company name (or pick one from the list).");
      return;
    }

    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${BACKEND}/api/dropoff/provider`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          insurer_id: insurerId || null,
          payer_name_raw: isUnrouted ? payerNameRaw : null,
          provider_name: providerName || null,
          patient_name: patientName || null,
          patient_id: patientId || null,
          attachments,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail || "Failed to submit pre-authorisation.");
      }

      const data = await res.json();
      router.push(
        `/dashboard/provider/pre-auth?submitted=${encodeURIComponent(data.reference_number)}` +
        `&routing=${data.routing_status}`
      );
    } catch (err: any) {
      setError(err?.message || "Unexpected error.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-6">
        <Link
          href="/dashboard/provider"
          className="group flex items-center gap-2 text-sm font-medium text-[#6b7280] hover:text-[#16a34a]"
        >
          <div className="w-8 h-8 flex items-center justify-center rounded-full bg-white border border-[#e5e7eb] group-hover:border-[#16a34a] group-hover:bg-[#f0fdf4] transition-all">
            <ArrowLeft className="h-4 w-4" />
          </div>
          Back to Dashboard
        </Link>
      </div>

      <div className="mb-8 flex items-center gap-3">
        <div className="inline-flex items-center justify-center w-11 h-11 bg-[#f0fdf4] border border-[#bbf7d0] rounded-lg">
          <ShieldCheck className="h-5 w-5 text-[#16a34a]" />
        </div>
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#0a0a0a]">
            Submit Pre-Authorisation
          </h1>
          <p className="text-[#6b7280] text-sm">
            Upload supporting clinical documents — our AI will review them against the payer&apos;s policy.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm p-6 md:p-8 space-y-8">
        {error && (
          <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 border border-red-200">{error}</div>
        )}

        {/* Insurer selection */}
        <section>
          <h3 className="font-display text-base sm:text-lg font-bold text-[#0a0a0a] mb-4 pb-2 border-b border-[#e5e7eb]">
            Insurance Company
          </h3>
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">Pick a registered insurer</label>
            <select
              value={insurerId}
              onChange={(e) => setInsurerId(e.target.value)}
              className="w-full h-[46px] px-3.5 py-2.5 bg-white border border-[#e5e7eb] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]/10 focus:border-[#16a34a]"
            >
              <option value="">— Not in this list (manual follow-up) —</option>
              {insurers.map((ins) => (
                <option key={ins.id} value={ins.id}>
                  {ins.name}{ins.country ? ` (${ins.country})` : ""}
                </option>
              ))}
            </select>

            {isUnrouted ? (
              <>
                <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>
                    <strong>Out-of-network.</strong> The insurer you typed isn&apos;t connected to ClaimRidge yet. We&apos;ll store the request for your records, but follow-up has to happen manually outside the platform.
                  </span>
                </div>
                <Input
                  id="payerNameRaw"
                  label="Insurance company name"
                  placeholder="Type the company name"
                  value={payerNameRaw}
                  onChange={(e) => setPayerNameRaw(e.target.value)}
                  required={isUnrouted}
                />
              </>
            ) : (
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-[#f0fdf4] border border-[#bbf7d0] text-xs text-[#15803d]">
                <ShieldCheck className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>In-network.</strong> The request will be routed to the insurer&apos;s queue and processed by our AI against their policy.
                </span>
              </div>
            )}
          </div>
        </section>

        {/* Optional identity hints */}
        <section>
          <h3 className="font-display text-base sm:text-lg font-bold text-[#0a0a0a] mb-4 pb-2 border-b border-[#e5e7eb]">
            Identity hints (optional)
          </h3>
          <p className="text-xs text-[#6b7280] mb-4">
            We&apos;ll extract patient and provider details automatically from the uploaded documents. You can pre-fill these if you want.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input id="providerName" label="Provider / Hospital Name" value={providerName} onChange={(e) => setProviderName(e.target.value)} />
            <Input id="patientName" label="Patient Name" value={patientName} onChange={(e) => setPatientName(e.target.value)} />
            <Input id="patientId" label="Patient ID" value={patientId} onChange={(e) => setPatientId(e.target.value)} />
          </div>
        </section>

        {/* Attachments */}
        <section>
          <h3 className="font-display text-base sm:text-lg font-bold text-[#0a0a0a] mb-4 pb-2 border-b border-[#e5e7eb]">
            Clinical Documents
          </h3>
          <label className="block">
            <div className="bg-[#fcfdfc] border-2 border-dashed border-[#e5e7eb] hover:border-[#16a34a] rounded-xl p-6 text-center cursor-pointer transition-all">
              <FileUp className="h-8 w-8 text-[#16a34a] mx-auto mb-2" />
              <p className="text-sm font-medium text-[#0a0a0a]">Click to upload PDFs / images / docs</p>
              <p className="text-xs text-[#6b7280] mt-1">You can attach multiple files.</p>
              <input
                type="file"
                multiple
                accept="application/pdf,image/*,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                onChange={(e) => handleFileChange(e.target.files)}
              />
            </div>
          </label>

          {attachments.length > 0 && (
            <ul className="mt-4 space-y-2">
              {attachments.map((att, i) => (
                <li key={i} className="flex items-center justify-between px-3 py-2 bg-[#f9fafb] border border-[#e5e7eb] rounded-lg">
                  <span className="text-sm text-[#0a0a0a] truncate">{att.file_name}</span>
                  <button
                    type="button"
                    onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
          <Button type="submit" loading={submitting}>
            Submit Pre-Authorisation
          </Button>
        </div>
      </form>
    </div>
  );
}
