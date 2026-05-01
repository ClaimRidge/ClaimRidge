"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Upload, FileText, CheckCircle, ArrowLeft, Loader2, Building2, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import ClaimRidgeLogo from "@/components/ClaimRidgeLogo";

interface Insurer {
  id: string;
  name: string;
  license_number: string;
}

export default function DropOffPortal() {
  const [insurers, setInsurers] = useState<Insurer[]>([]);
  const [selectedInsurerId, setSelectedInsurerId] = useState("");
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  
  const [providerName, setProviderName] = useState("");
  const [patientName, setPatientName] = useState("");
  const [patientId, setPatientId] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState("");

  const selectedInsurer = insurers.find(i => i.id === selectedInsurerId);
  const filteredInsurers = insurers.filter(i => 
    i.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (i.license_number && i.license_number.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Fetch insurers
  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/dropoff/insurers`)
      .then(res => res.json())
      .then(data => {
        setInsurers(data);
      })
      .catch(err => console.error("Failed to fetch insurers", err));
  }, []);

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles([...files, ...Array.from(e.target.files)]);
    }
  };

  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = (reader.result as string).split(",")[1];
        resolve(base64String);
      };
      reader.onerror = error => reject(error);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInsurerId || !providerName || !patientName || files.length === 0) {
      setError("Please fill all fields and attach at least one document.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const attachments = await Promise.all(
        files.map(async (file) => ({
          file_name: file.name,
          content_type: file.type || "application/pdf",
          content: await convertFileToBase64(file),
        }))
      );

      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/dropoff/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          insurer_id: selectedInsurerId,
          provider_name: providerName,
          patient_name: patientName,
          patient_id: patientId,
          attachments,
        }),
      });

      if (!res.ok) throw new Error("Failed to submit request");

      const data = await res.json();
      setSuccess(data.reference_number);
      
      setPatientName("");
      setPatientId("");
      setFiles([]);
    } catch (err) {
      console.error(err);
      setError("An error occurred during submission.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f9fafb] p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center border border-gray-100">
          <div className="w-16 h-16 bg-[#f0fdf4] rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="h-8 w-8 text-[#16a34a]" />
          </div>
          <h2 className="font-display text-2xl font-bold text-[#0a0a0a] mb-2">Request Submitted</h2>
          <p className="text-[#6b7280] mb-6">
            Your pre-authorisation request has been sent to the insurer for AI review.
          </p>
          <div className="bg-[#f9fafb] border border-[#e5e7eb] rounded-lg py-3 px-4 mb-8 font-mono text-sm font-bold text-[#0A1628]">
            Ref: {success}
          </div>
          <Button className="w-full" onClick={() => setSuccess(null)}>Submit Another Request</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f9fafb] py-12 px-4 sm:px-6 lg:px-8 relative font-sans">
      {/* --- INSURER BROWSER MODAL --- */}
      {isBrowserOpen && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 sm:p-6 md:p-8">
          <div 
            className="absolute inset-0 bg-[#0a0a0a]/80 backdrop-blur-2xl transition-opacity animate-in fade-in duration-500"
            onClick={() => setIsBrowserOpen(false)}
          />
          
          <div className="relative w-full max-w-5xl h-full max-h-[90vh] bg-white rounded-[3rem] shadow-[0_0_100px_-20px_rgba(0,0,0,0.3)] border border-white/10 overflow-hidden animate-in slide-in-from-bottom-10 fade-in zoom-in-95 duration-500 flex flex-col">
            {/* Header */}
            <div className="px-8 py-10 sm:px-12 bg-white/50 border-b border-gray-100 flex items-end justify-between gap-8">
              <div className="flex-1">
                <h2 className="text-4xl font-black text-[#0A1628] leading-tight tracking-tight">
                  Browse Insurance Partners
                </h2>
              </div>
              <button 
                onClick={() => setIsBrowserOpen(false)}
                className="group flex flex-col items-center gap-2 p-2"
              >
                <div className="w-14 h-14 bg-gray-50 border border-gray-100 rounded-2xl flex items-center justify-center text-gray-400 group-hover:bg-[#0A1628] group-hover:text-white group-hover:rotate-90 transition-all duration-500 shadow-sm">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                </div>
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest group-hover:text-[#0A1628] transition-colors">Close</span>
              </button>
            </div>

            {/* Search Section */}
            <div className="px-8 py-8 sm:px-12 flex flex-col min-h-0 flex-1">
              <div className="relative mb-10 group">
                <div className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-[#16a34a] transition-colors duration-300">
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                </div>
                <input 
                  type="text"
                  placeholder="Search by name or License ID (e.g. INS-1002)..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-16 pr-8 py-7 bg-gray-50/50 border-3 border-transparent focus:border-[#16a34a] focus:bg-white rounded-[2rem] outline-none transition-all text-xl font-bold shadow-sm placeholder:text-gray-300 placeholder:font-medium"
                  autoFocus
                />
              </div>

              {/* Scrollable List */}
              <div className="flex-1 overflow-y-auto pr-4 custom-scrollbar">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pb-12">
                  {filteredInsurers.length > 0 ? (
                    filteredInsurers.map((ins) => (
                      <button
                        key={ins.id}
                        type="button"
                        onClick={() => {
                          setSelectedInsurerId(ins.id);
                          setIsBrowserOpen(false);
                        }}
                        className={`flex items-center justify-between p-7 rounded-[2.2rem] border-3 transition-all duration-300 group relative overflow-hidden ${
                          selectedInsurerId === ins.id
                            ? "bg-[#16a34a]/5 border-[#16a34a] shadow-[0_20px_40px_-15px_rgba(22,163,74,0.15)]"
                            : "bg-white border-gray-100 hover:border-gray-200 hover:shadow-xl hover:shadow-gray-200/50 hover:-translate-y-1"
                        }`}
                      >
                        <div className="flex items-center gap-6 z-10">
                          <div className={`w-16 h-16 rounded-[1.4rem] flex items-center justify-center transition-all duration-500 ${
                            selectedInsurerId === ins.id 
                              ? "bg-[#16a34a] text-white shadow-lg shadow-[#16a34a]/30" 
                              : "bg-gray-100 text-gray-400 group-hover:bg-[#0A1628] group-hover:text-white"
                          }`}>
                            <Building2 className="h-7 w-7" />
                          </div>
                          <div className="text-left">
                            <h4 className="font-black text-[#0A1628] text-xl leading-none mb-2">{ins.name}</h4>
                            <div className="flex items-center gap-2">
                               <div className="w-1.5 h-1.5 rounded-full bg-[#16a34a]" />
                               <span className="text-xs font-black text-gray-400 uppercase tracking-widest">
                                 License: {ins.license_number}
                               </span>
                            </div>
                          </div>
                        </div>
                        
                        {selectedInsurerId === ins.id ? (
                          <div className="bg-[#16a34a] rounded-full p-2 z-10 shadow-md">
                            <CheckCircle className="h-6 w-6 text-white" />
                          </div>
                        ) : (
                          <div className="opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-x-4 group-hover:translate-x-0 z-10">
                             <div className="w-10 h-10 bg-[#0A1628] rounded-full flex items-center justify-center text-white">
                                <ArrowLeft className="h-5 w-5 rotate-180" />
                             </div>
                          </div>
                        )}
                        
                        {/* Subtle background decoration */}
                        <div className={`absolute top-0 right-0 w-32 h-32 -mr-16 -mt-16 rounded-full transition-all duration-700 ${
                          selectedInsurerId === ins.id ? "bg-[#16a34a]/10" : "bg-gray-50 opacity-0 group-hover:opacity-100"
                        }`} />
                      </button>
                    ))
                  ) : (
                    <div className="col-span-full py-24 text-center">
                      <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-8 border border-gray-100">
                        <Building2 className="h-10 w-10 text-gray-200" />
                      </div>
                      <h3 className="text-2xl font-black text-[#0A1628] mb-2">No matching partners</h3>
                      <p className="text-gray-500 max-w-xs mx-auto text-lg">We couldn&apos;t find any insurer matching &quot;{searchTerm}&quot;.</p>
                      <button 
                        onClick={() => setSearchTerm("")}
                        className="mt-6 text-[#16a34a] font-black uppercase tracking-widest text-sm hover:underline"
                      >
                        Clear search
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-10">
          <div className="flex justify-center mb-4">
            <ClaimRidgeLogo size={40} variant="light" />
          </div>
          <h1 className="font-display text-4xl font-extrabold text-[#0a0a0a] tracking-tight">Provider Drop-Off</h1>
          <p className="text-[#6b7280] mt-3 text-lg">Securely upload clinical documents for immediate AI review.</p>
        </div>

        <div className="bg-white/70 backdrop-blur-md rounded-3xl shadow-xl border border-white/50 p-6 sm:p-10">
          {error && <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm mb-8 border border-red-100 flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-red-600 rounded-full animate-pulse" />
            {error}
          </div>}

          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="space-y-4">
              <label className="block text-sm font-bold text-[#374151] tracking-wide uppercase">
                Step 1: Select Insurance Partner
              </label>
              
              <div 
                onClick={() => setIsBrowserOpen(true)}
                className="group relative flex items-center justify-between p-5 bg-white border-2 border-gray-100 hover:border-[#16a34a] rounded-2xl cursor-pointer transition-all duration-300 shadow-sm hover:shadow-md"
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-gray-50 group-hover:bg-[#f0fdf4] rounded-xl text-gray-400 group-hover:text-[#16a34a] transition-colors">
                    <Building2 className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-0.5">Selected Partner</p>
                    <h3 className="text-lg font-extrabold text-[#0A1628]">
                      {selectedInsurer?.name || "Choose a company..."}
                    </h3>
                    {selectedInsurer && (
                      <p className="text-xs text-[#16a34a] font-medium">Licensed: {selectedInsurer.license_number}</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-center gap-1 text-[#16a34a] font-bold text-xs group-hover:translate-x-1 transition-transform">
                  <span>BROWSE</span>
                  <ArrowLeft className="h-4 w-4 rotate-180" />
                </div>
              </div>
            </div>

            <div className="space-y-6 pt-4 border-t border-gray-100">
              <label className="block text-sm font-bold text-[#374151] tracking-wide uppercase">
                Step 2: Patient & Provider Info
              </label>
              
              <Input 
                label="Provider / Clinic Name" 
                placeholder="e.g. Amman General Hospital" 
                value={providerName} 
                onChange={e => setProviderName(e.target.value)} 
                required 
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <Input 
                  label="Patient Full Name" 
                  placeholder="Ahmad Khalil" 
                  value={patientName} 
                  onChange={e => setPatientName(e.target.value)} 
                  required 
                />
                <Input 
                  label="Patient ID / National ID" 
                  placeholder="987654321" 
                  value={patientId} 
                  onChange={e => setPatientId(e.target.value)} 
                  required 
                />
              </div>
            </div>

            <div className="space-y-6 pt-4 border-t border-gray-100">
              <label className="block text-sm font-bold text-[#374151] tracking-wide uppercase">
                Step 3: Clinical Documentation
              </label>
              
              <div className="relative border-2 border-dashed border-[#e5e7eb] hover:border-[#16a34a] bg-[#fafafa] rounded-2xl p-8 transition-all group text-center">
                <input 
                  type="file" 
                  multiple 
                  accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*" 
                  onChange={handleFileChange} 
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  required
                />
                <div className="flex flex-col items-center justify-center pointer-events-none">
                  <div className="w-14 h-14 bg-white rounded-full shadow-sm flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Upload className="h-6 w-6 text-[#16a34a]" />
                  </div>
                  <p className="text-base font-bold text-[#0a0a0a]">Click to browse or drag documents</p>
                  <p className="text-sm text-[#6b7280] mt-1">Upload Lab Results, Doctor Notes, MRI Reports (PDF/JPG)</p>
                </div>
              </div>

              {files.length > 0 && (
                <div className="grid grid-cols-1 gap-2 mt-4">
                  {files.map((file, i) => (
                    <div key={i} className="flex items-center justify-between bg-[#f0fdf4] border border-[#bbf7d0] text-[#16a34a] px-4 py-3 rounded-xl text-sm font-semibold group/file hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-all">
                      <div className="flex items-center gap-2 truncate">
                        <FileText className="h-4 w-4" />
                        <span className="truncate">{file.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase bg-white/50 px-2 py-0.5 rounded flex-shrink-0 group-hover/file:hidden">Ready</span>
                        <button 
                          type="button"
                          onClick={() => removeFile(i)}
                          className="hidden group-hover/file:flex items-center gap-1 text-red-600 hover:text-red-700 font-bold px-2 py-1 rounded-lg hover:bg-red-100 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span>Remove</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-6">
              <Button type="submit" className="w-full h-14 text-lg font-bold rounded-2xl shadow-lg shadow-[#16a34a]/20" loading={loading}>
                {loading ? "Processing via AI..." : "Submit for AI Review"}
              </Button>
              <p className="text-center text-xs text-gray-400 mt-4 px-8">
                By submitting, you agree to our terms. Clinical data is encrypted and handled according to HIPAA standards.
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
