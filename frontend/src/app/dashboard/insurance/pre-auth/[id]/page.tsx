"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import { formatRelativeTime } from "@/lib/utils/format";
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  AlertTriangle,
  FileText,
  User,
  Building2,
  Clock,
  BrainCircuit,
  X
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface PreAuthRequest {
  id: string;
  reference_number: string;
  provider_name: string;
  patient_name: string;
  patient_id: string;
  requested_amount: number;
  status: string;
  sla_deadline: string;
  ai_decision: string | null;
  ai_rationale: string | null;
  created_at: string;
}

interface PreAuthDocument {
  id: string;
  file_name: string;
  file_type: string;
  extracted_text: string;
}

export default function PreAuthReviewPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();

  const [request, setRequest] = useState<PreAuthRequest | null>(null);
  const [documents, setDocuments] = useState<PreAuthDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  const [activeDoc, setActiveDoc] = useState<string | null>(null);
  const [modal, setModal] = useState<"approve" | "deny" | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      // 1. Fetch the request
      const { data: reqData, error: reqErr } = await supabase
        .from("pre_auth_requests")
        .select("*")
        .eq("id", params.id)
        .single();

      if (reqErr || !reqData) {
        setError("Pre-Authorisation request not found.");
        setLoading(false);
        return;
      }
      setRequest(reqData);

      // 2. Fetch the associated documents
      const { data: docsData, error: docsErr } = await supabase
        .from("pre_auth_documents")
        .select("*")
        .eq("pre_auth_id", params.id);

      if (!docsErr && docsData) {
        setDocuments(docsData);
        if (docsData.length > 0) setActiveDoc(docsData[0].id);
      }
      
      setLoading(false);
    };

    fetchData();
  }, [params.id, supabase]);

  const handleDecision = async () => {
    if (!modal || !request) return;
    setSubmitting(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      // Call our secure backend to process the decision and create an audit log
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/pre-auth/${request.id}/review`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          action: modal,
          reason: reason
        })
      });

      if (!res.ok) throw new Error("Failed to submit decision");

      // Update local state to reflect the decision immediately
      setRequest({ ...request, status: modal });
      setModal(null);
    } catch (err) {
      console.error(err);
      alert("An error occurred while submitting your decision.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh]">
        <div className="animate-spin h-8 w-8 border-4 border-[#16a34a] border-t-transparent rounded-full mb-4" />
        <p className="text-[#9ca3af] text-sm animate-pulse">Loading clinical case file...</p>
      </div>
    );
  }

  if (error || !request) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-bold text-red-600 mb-2">Error</h2>
        <p className="text-gray-600 mb-4">{error}</p>
        <Button onClick={() => router.back()}>Go Back</Button>
      </div>
    );
  }

  const isDecided = request.status === "approve" || request.status === "deny";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-[#9ca3af] hover:text-[#0A1628] transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-xl sm:text-2xl font-bold text-[#0a0a0a] tracking-tight">
              {request.reference_number}
            </h1>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
              request.status === "approve" ? "bg-green-100 text-green-700" :
              request.status === "deny" ? "bg-red-100 text-red-700" :
              request.status === "escalated" ? "bg-amber-100 text-amber-700" :
              "bg-blue-100 text-blue-700"
            }`}>
              {request.status}
            </span>
          </div>
          <p className="text-sm text-[#9ca3af] mt-0.5">
            Received {formatRelativeTime(request.created_at)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LEFT COLUMN: Clinical Evidence */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          
          {/* Patient & Provider Meta */}
          <div className="bg-white border border-[#e5e7eb] rounded-xl p-5 shadow-sm flex flex-wrap gap-x-12 gap-y-4">
            <div>
              <p className="text-xs text-[#9ca3af] uppercase tracking-wider font-semibold mb-1 flex items-center gap-1.5"><User className="h-3.5 w-3.5"/> Patient</p>
              <p className="text-sm font-bold text-[#0a0a0a]">{request.patient_name}</p>
              <p className="text-xs text-[#6b7280] font-mono mt-0.5">ID: {request.patient_id}</p>
            </div>
            <div>
              <p className="text-xs text-[#9ca3af] uppercase tracking-wider font-semibold mb-1 flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5"/> Provider</p>
              <p className="text-sm font-bold text-[#0a0a0a]">{request.provider_name}</p>
            </div>
          </div>

          {/* Document Viewer */}
          <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm flex flex-col min-h-[500px]">
            <div className="px-5 py-3 border-b border-[#f3f4f6] flex items-center gap-2 overflow-x-auto">
              <FileText className="h-4 w-4 text-[#9ca3af]" />
              <span className="text-sm font-bold text-[#0a0a0a] mr-4">Clinical Documents</span>
              {documents.map(doc => (
                <button
                  key={doc.id}
                  onClick={() => setActiveDoc(doc.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    activeDoc === doc.id ? "bg-[#0A1628] text-white" : "bg-[#f3f4f6] text-[#6b7280] hover:bg-[#e5e7eb]"
                  }`}
                >
                  {doc.file_name}
                </button>
              ))}
            </div>
            <div className="p-8 flex-1 overflow-y-auto bg-[#fafafa]">
              {activeDoc ? (
                <div className="prose prose-sm prose-slate max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {documents.find(d => d.id === activeDoc)?.extracted_text || "No text extracted."}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm text-[#9ca3af] text-center mt-10">No documents attached.</p>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: AI Analysis & Actions */}
        <div className="flex flex-col gap-6">
          
          {/* AI Decision Panel */}
          <div className={`border rounded-xl p-6 shadow-sm ${
            request.ai_decision === "approve" ? "bg-[#f0fdf4] border-[#bbf7d0]" :
            request.ai_decision === "deny" ? "bg-red-50 border-red-200" :
            "bg-amber-50 border-amber-200"
          }`}>
            <div className="flex items-center gap-2 mb-4">
              <BrainCircuit className={`h-6 w-6 ${
                request.ai_decision === "approve" ? "text-[#16a34a]" :
                request.ai_decision === "deny" ? "text-red-600" : "text-amber-600"
              }`} />
              <h3 className="font-display font-bold text-[#0a0a0a] text-lg">AI Triage Recommendation</h3>
            </div>
            
            <div className="mb-6">
              <span className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest border ${
                request.ai_decision === "approve" ? "bg-white text-[#16a34a] border-[#bbf7d0] shadow-sm" :
                request.ai_decision === "deny" ? "bg-white text-red-800 border-red-200 shadow-sm" :
                "bg-white text-amber-800 border-amber-200 shadow-sm"
              }`}>
                {request.ai_decision === "escalate" ? "Manual Review Required" : `Recommend: ${request.ai_decision}`}
              </span>
            </div>

            <div className="prose prose-sm prose-slate max-w-none">
              <strong className="block text-[10px] uppercase tracking-[0.2em] text-[#9ca3af] mb-3 font-black">Clinical Rationale</strong>
              <div className="text-[#374151] leading-relaxed">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {request.ai_rationale || "*The AI is currently analyzing this request. Please wait...*"}
                </ReactMarkdown>
              </div>
            </div>
          </div>

          {/* Adjudication Actions */}
          <div className="bg-white border border-[#e5e7eb] rounded-xl p-5 shadow-sm">
            <h3 className="font-display font-bold text-[#0a0a0a] mb-4">Final Adjudication</h3>
            
            {isDecided ? (
              <div className="text-center py-4">
                <div className={`inline-flex items-center justify-center w-12 h-12 rounded-full mb-3 ${request.status === "approve" ? "bg-green-100" : "bg-red-100"}`}>
                  {request.status === "approve" ? <CheckCircle className="h-6 w-6 text-[#16a34a]" /> : <XCircle className="h-6 w-6 text-red-600" />}
                </div>
                <p className="font-bold text-[#0a0a0a]">This request was {request.status}d.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <Button className="w-full gap-2 bg-[#16a34a] hover:bg-[#15803d]" onClick={() => setModal("approve")}>
                  <CheckCircle className="h-4 w-4" /> Approve Request
                </Button>
                <Button className="w-full gap-2 bg-red-600 hover:bg-red-700 text-white" onClick={() => setModal("deny")}>
                  <XCircle className="h-4 w-4" /> Deny Request
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Decision Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setModal(null); setReason(""); }} />
          <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4 animate-in fade-in zoom-in duration-200">
            <button onClick={() => { setModal(null); setReason(""); }} className="absolute top-4 right-4 text-[#9ca3af] hover:text-[#0a0a0a]">
              <X className="h-5 w-5" />
            </button>
            <h3 className={`font-display font-bold text-xl mb-2 ${modal === "approve" ? "text-[#16a34a]" : "text-red-600"}`}>
              {modal === "approve" ? "Approve Pre-Authorisation" : "Deny Pre-Authorisation"}
            </h3>
            <p className="text-sm text-[#6b7280] mb-4">
              You are about to {modal} request <span className="font-mono font-bold text-[#0a0a0a]">{request.reference_number}</span>.
            </p>
            
            <label className="block text-sm font-medium text-[#374151] mb-1.5">
              Reasoning / Internal Notes {modal === "deny" && <span className="text-red-500">*</span>}
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              placeholder="Enter clinical rationale..."
              className="w-full px-3 py-2 border border-[#e5e7eb] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0A1628] resize-none"
            />
            
            <div className="flex gap-3 mt-6">
              <Button variant="outline" className="flex-1" onClick={() => { setModal(null); setReason(""); }}>
                Cancel
              </Button>
              <Button 
                className={`flex-1 ${modal === "deny" ? "bg-red-600 hover:bg-red-700" : ""}`}
                onClick={handleDecision}
                loading={submitting}
                disabled={modal === "deny" && !reason.trim()}
              >
                Confirm {modal === "approve" ? "Approval" : "Denial"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}