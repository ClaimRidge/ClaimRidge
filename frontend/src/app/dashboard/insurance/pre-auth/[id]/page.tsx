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
  file_base64?: string;
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
  const [viewMode, setViewMode] = useState<"visual" | "text">("visual");
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

  // Polling for updates if still processing
  useEffect(() => {
    if (request?.status !== "processing") return;

    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("pre_auth_requests")
        .select("*")
        .eq("id", params.id)
        .single();

      if (data && data.status !== "processing") {
        setRequest(data);
      }
    }, 3000); // Poll every 3 seconds for a responsive feel

    return () => clearInterval(interval);
  }, [request?.status, params.id, supabase]);

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

  const cleanRationale = (text: string | null) => {
    if (!text) return null;
    // Remove "The final answer is: $\boxed{...}$" or just "$\boxed{...}$"
    return text.replace(/(The final answer is:\s*)?\$\\boxed\{[^}]*\}\$/gi, "").trim();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-[#9ca3af] hover:text-[#0A1628] transition-all hover:scale-110">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="font-sans text-xl sm:text-3xl font-bold text-[#0a0a0a] tracking-tight">
              {request.reference_number}
            </h1>
            <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest ${
              request.status === "approve" ? "bg-green-100 text-green-700 border border-green-200" :
              request.status === "deny" ? "bg-red-100 text-red-700 border border-red-200" :
              request.status === "escalated" ? "bg-amber-100 text-amber-700 border border-amber-200" :
              "bg-blue-100 text-blue-700 border border-blue-200"
            }`}>
              {request.status}
            </span>
          </div>
          <p className="text-sm text-[#9ca3af] mt-1 font-medium">
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
              <p className="text-[10px] text-[#9ca3af] uppercase tracking-[0.2em] font-black mb-1.5 flex items-center gap-1.5"><User className="h-3 w-3"/> Patient</p>
              <p className="text-sm font-bold text-[#0a0a0a] font-sans">{request.patient_name}</p>
              <p className="text-[10px] text-[#6b7280] font-mono mt-1 bg-gray-50 px-1.5 py-0.5 rounded w-fit">ID: {request.patient_id}</p>
            </div>
            <div>
              <p className="text-[10px] text-[#9ca3af] uppercase tracking-[0.2em] font-black mb-1.5 flex items-center gap-1.5"><Building2 className="h-3 w-3"/> Provider</p>
              <p className="text-sm font-bold text-[#0a0a0a] font-sans">{request.provider_name}</p>
            </div>
          </div>

          {/* Document Viewer */}
          <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm flex flex-col min-h-[500px]">
            <div className="px-5 py-3 border-b border-[#f3f4f6] flex items-center justify-between overflow-x-auto gap-4">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-[#9ca3af]" />
                <span className="text-sm font-bold text-[#0a0a0a] mr-4 font-sans">Clinical Documents</span>
                <div className="flex gap-1">
                  {documents.map(doc => (
                    <button
                      key={doc.id}
                      onClick={() => setActiveDoc(doc.id)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all whitespace-nowrap ${
                        activeDoc === doc.id ? "bg-[#0A1628] text-white shadow-md" : "bg-[#f3f4f6] text-[#6b7280] hover:bg-[#e5e7eb]"
                      }`}
                    >
                      {doc.file_name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex bg-[#f3f4f6] p-1 rounded-lg border border-[#e5e7eb]">
                <button 
                  onClick={() => setViewMode("visual")}
                  className={`px-3 py-1 text-[10px] font-black uppercase tracking-wider rounded-md transition-all ${viewMode === "visual" ? "bg-white text-[#0A1628] shadow-sm" : "text-[#9ca3af] hover:text-[#6b7280]"}`}
                >
                  Visual
                </button>
                <button 
                  onClick={() => setViewMode("text")}
                  className={`px-3 py-1 text-[10px] font-black uppercase tracking-wider rounded-md transition-all ${viewMode === "text" ? "bg-white text-[#0A1628] shadow-sm" : "text-[#9ca3af] hover:text-[#6b7280]"}`}
                >
                  Context (Text)
                </button>
              </div>
            </div>
            <div className="p-0 flex-1 overflow-hidden bg-[#fafafa] flex flex-col min-h-[700px]">
              {activeDoc ? (
                (() => {
                  const doc = documents.find(d => d.id === activeDoc);
                  if (!doc) return <div className="p-10 text-center text-gray-500">Document not found.</div>;
                  
                  if (viewMode === "text") {
                    return (
                      <div className="p-8 h-full overflow-y-auto bg-white font-sans">
                        <div className="max-w-3xl mx-auto">
                          <h4 className="text-[10px] uppercase tracking-[0.2em] text-[#9ca3af] mb-6 font-black flex items-center gap-2">
                            <BrainCircuit className="h-3 w-3" /> Extracted Clinical Context
                          </h4>
                          <div className="prose prose-sm prose-slate max-w-none">
                            <div className="whitespace-pre-wrap text-sm leading-relaxed text-[#374151] font-medium bg-gray-50/50 p-6 rounded-xl border border-gray-100">
                              {doc.extracted_text || "No text could be extracted from this document."}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  if (doc.file_base64) {
                    if (doc.file_type === "application/pdf") {
                      return (
                        <iframe 
                          src={`data:application/pdf;base64,${doc.file_base64}#toolbar=0&navpanes=0&scrollbar=1`} 
                          className="w-full h-full border-0 flex-1"
                          title={doc.file_name}
                        />
                      );
                    } else if (doc.file_type.startsWith("image/")) {
                      return (
                        <div className="w-full h-full flex items-center justify-center p-4 bg-gray-50 overflow-auto">
                          <img 
                            src={`data:${doc.file_type};base64,${doc.file_base64}`} 
                            alt={doc.file_name} 
                            className="max-w-full max-h-full object-contain shadow-xl rounded-lg border border-gray-200"
                          />
                        </div>
                      );
                    }
                  }
                  
                  return (
                    <div className="flex flex-col items-center justify-center h-full p-12 text-center">
                      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                        <FileText className="h-8 w-8 text-gray-400" />
                      </div>
                      <h3 className="text-lg font-bold text-gray-900">Preview Unavailable</h3>
                      <p className="text-sm text-gray-500 mt-2 max-w-sm">
                        The real document ({doc.file_name}) cannot be previewed. 
                        Only PDF and Image files are supported for inline viewing.
                      </p>
                    </div>
                  );
                })()
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-[#9ca3af]">
                  <FileText className="h-12 w-12 mb-3 opacity-20" />
                  <p className="text-sm font-medium tracking-wide">Select a document to preview</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: AI Analysis & Actions */}
        <div className="flex flex-col gap-6">
          
          {/* AI Decision Panel */}
          <div className={`border rounded-2xl p-7 shadow-lg transition-all ${
            request.ai_decision === "approve" ? "bg-[#f0fdf4] border-[#bbf7d0]" :
            request.ai_decision === "deny" ? "bg-red-50 border-red-200" :
            "bg-[#fffbeb] border-[#fef3c7]"
          }`}>
            <div className="flex items-center gap-2.5 mb-6">
              <div className={`p-2 rounded-lg ${
                request.ai_decision === "approve" ? "bg-green-100" :
                request.ai_decision === "deny" ? "bg-red-100" : "bg-amber-100"
              }`}>
                <BrainCircuit className={`h-5 w-5 ${
                  request.ai_decision === "approve" ? "text-[#16a34a]" :
                  request.ai_decision === "deny" ? "text-red-600" : "text-amber-600"
                }`} />
              </div>
              <h3 className="font-sans font-bold text-[#0a0a0a] text-xl tracking-tight">AI Clinical Triage</h3>
            </div>
            
            <div className="mb-8">
              <div className={`inline-flex items-center px-4 py-2 rounded-xl text-xs font-black uppercase tracking-[0.1em] border-2 shadow-sm ${
                request.ai_decision === "approve" ? "bg-white text-[#16a34a] border-[#bbf7d0]" :
                request.ai_decision === "deny" ? "bg-white text-red-800 border-red-200" :
                "bg-white text-amber-800 border-amber-200"
              }`}>
                {request.ai_decision === "escalate" ? "Manual Review Required" : `Recommendation: ${request.ai_decision}`}
              </div>
            </div>

            <div className="bg-white/60 backdrop-blur-sm rounded-xl p-5 border border-black/[0.03]">
              <strong className="block text-[10px] uppercase tracking-[0.2em] text-[#9ca3af] mb-4 font-black">
                Clinical Rationale & Evidence
              </strong>
              <div className="text-[#374151] leading-relaxed font-sans text-sm">
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({node, ...props}) => <h1 className="font-sans font-bold text-[#0a0a0a] text-lg mb-4 mt-6 first:mt-0 uppercase tracking-tight" {...props} />,
                    h2: ({node, ...props}) => <h2 className="font-sans font-bold text-[#0a0a0a] text-base mb-3 mt-5 uppercase tracking-tight" {...props} />,
                    h3: ({node, ...props}) => <h3 className="font-sans font-bold text-[#0a0a0a] text-sm mb-2 mt-4 uppercase tracking-tight" {...props} />,
                    p: ({node, ...props}) => <p className="mb-4 last:mb-0 text-sm leading-relaxed" {...props} />,
                    strong: ({node, ...props}) => <strong className="font-bold text-[#0a0a0a]" {...props} />,
                    ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-4 space-y-2" {...props} />,
                    li: ({node, ...props}) => <li className="text-sm leading-relaxed pl-1" {...props} />,
                  }}
                >
                  {cleanRationale(request.ai_rationale) || "*The AI engine is synthesizing clinical evidence. This may take up to 30 seconds...*"}
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
                <p className="font-bold text-[#0a0a0a]">
                  This request was {request.status === "approve" ? "approved" : "denied"}.
                </p>
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