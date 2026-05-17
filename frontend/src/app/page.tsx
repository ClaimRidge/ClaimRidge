"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { 
  ArrowRight, 
  FileCheck, 
  Brain, 
  Check, 
  ShieldCheck, 
  Lock, 
  Sparkles, 
  Stethoscope,
  Building,
  BriefcaseMedical,
  Activity,
  FileText,
  AlertTriangle,
  Zap,
  Link as LinkIcon,
  MessageSquare,
  History
} from "lucide-react";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const checkUser = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        router.push("/dashboard");
      }
    };
    checkUser();
  }, [router]);

  return (
    <div className="bg-white text-[#0a0a0a]">
      {/* ==================== HERO ==================== */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 hero-mesh pointer-events-none" aria-hidden="true" />
        <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
          <div className="absolute -top-12 -left-16 opacity-[0.05]" style={{ transform: "rotate(-14deg)" }}>
            <ShieldBg size={360} />
          </div>
          <div className="absolute top-32 right-[-80px] opacity-[0.04]" style={{ transform: "rotate(18deg)" }}>
            <ShieldBg size={480} />
          </div>
          <div className="absolute bottom-[-60px] left-[30%] opacity-[0.05]" style={{ transform: "rotate(-6deg)" }}>
            <ShieldBg size={280} />
          </div>
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16 md:pt-24 md:pb-20">
          <div className="grid md:grid-cols-[1.05fr_1fr] gap-8 md:gap-12 lg:gap-16 items-center">
            {/* Copy */}
            <div>
              <h1
                className="font-serif-display text-[#0a0a0a] mb-6"
                style={{
                  fontSize: "clamp(36px, 5.4vw, 52px)",
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.15,
                }}
              >
                The compliance layer connecting MENA healthcare.
              </h1>

              <p
                className="text-[#374151] mb-9 text-justify"
                style={{
                  fontSize: "clamp(15px, 1.15vw, 18px)",
                  lineHeight: 1.75,
                  maxWidth: "32rem",
                  fontFamily: "var(--font-playfair), Georgia, serif",
                }}
              >
                ClaimRidge brings providers, doctors, and insurers together across pre-authorisation and claims. 
                Our AI validates medical necessity and payer rules instantly, meaning fewer denials for providers and automated adjudication for insurers.
              </p>

              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  href="/signup"
                  className="inline-flex items-center justify-center gap-2 bg-[#16a34a] text-white font-semibold px-6 py-3 rounded-lg transition-all hover:bg-[#15803d] hover:scale-[1.01]"
                >
                  Join the Waitlist
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center gap-2 bg-white border border-[#16a34a] text-[#16a34a] hover:bg-[#f0faf4] font-semibold px-6 py-3 rounded-lg transition-colors"
                >
                  Log In
                </Link>
              </div>



              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-[#6b7280]">
                <span className="flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> End-to-end encryption</span>
                <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> PDPL aligned</span>
                <span className="flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> MENA payer rules</span>
              </div>
            </div>

            {/* Animated scrubbing claim document */}
            <div className="relative hidden md:block">
              <ScrubbingDocument />
            </div>
          </div>
        </div>
      </section>

      {/* ==================== WHO IT'S FOR ==================== */}
      <section className="py-20 md:py-24 border-t border-[#f3f4f6] bg-[#fafafa]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2
              className="font-serif-display text-[#0a0a0a]"
              style={{ fontSize: "clamp(28px, 3.6vw, 40px)", fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.2 }}
            >
              One platform, three perspectives.
            </h2>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-white border border-[#e5e7eb] rounded-xl p-8 shadow-sm">
              <Building className="h-8 w-8 text-[#16a34a] mb-5" />
              <h3 className="font-serif-display text-xl font-bold text-[#0a0a0a] mb-3">Providers</h3>
              <p className="text-[#6b7280] leading-relaxed">
                Hospitals and clinics manage their clinical staff, oversee billing compliance, and review AI suggestions to ensure claims are clean before submission.
              </p>
            </div>
            <div className="bg-white border border-[#e5e7eb] rounded-xl p-8 shadow-sm">
              <Stethoscope className="h-8 w-8 text-[#16a34a] mb-5" />
              <h3 className="font-serif-display text-xl font-bold text-[#0a0a0a] mb-3">Doctors</h3>
              <p className="text-[#6b7280] leading-relaxed">
                Clinicians request pre-authorisations with full visibility, getting faster approvals for planned procedures with medical necessity verified instantly.
              </p>
            </div>
            <div className="bg-white border border-[#e5e7eb] rounded-xl p-8 shadow-sm">
              <BriefcaseMedical className="h-8 w-8 text-[#16a34a] mb-5" />
              <h3 className="font-serif-display text-xl font-bold text-[#0a0a0a] mb-3">Insurers</h3>
              <p className="text-[#6b7280] leading-relaxed">
                Payer medical teams review pre-auths and claims automatically scored for fraud risk and policy compliance, saving countless hours of manual adjudication.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== TWO WORKFLOWS ==================== */}
      <section className="py-20 md:py-24 border-t border-[#f3f4f6]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mb-14">
            <div className="text-xs font-semibold text-[#16a34a] uppercase tracking-wider mb-3">Unified Workflows</div>
            <h2
              className="font-serif-display text-[#0a0a0a]"
              style={{ fontSize: "clamp(28px, 3.6vw, 40px)", fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.2 }}
            >
              The full lifecycle of care.
            </h2>
            <p className="text-[#6b7280] mt-4 text-base md:text-lg">
              From the moment care is planned to the final payment, ClaimRidge connects the dots.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="card-light p-8 md:p-10 border-l-4 border-l-[#16a34a]">
              <div className="flex items-center gap-4 mb-6">
                <div className="bg-[#f0faf4] p-3 rounded-lg">
                  <Activity className="h-6 w-6 text-[#16a34a]" />
                </div>
                <h3 className="font-serif-display text-2xl font-bold text-[#0a0a0a]">Pre-authorisation</h3>
              </div>
              <p className="text-[#6b7280] mb-6 leading-relaxed">
                Before care happens, providers request a greenlight. Insurers review medical necessity against their policy. On approval, a time-boxed authorization number is issued, locking in the scope of care.
              </p>
              <ul className="space-y-3 text-sm text-[#374151]">
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#16a34a]" /> Instant payer rules validation</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#16a34a]" /> Digital clinical document attachments</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#16a34a]" /> Faster patient care access</li>
              </ul>
            </div>

            <div className="card-light p-8 md:p-10 border-l-4 border-l-[#16a34a]">
              <div className="flex items-center gap-4 mb-6">
                <div className="bg-[#f0faf4] p-3 rounded-lg">
                  <FileCheck className="h-6 w-6 text-[#16a34a]" />
                </div>
                <h3 className="font-serif-display text-2xl font-bold text-[#0a0a0a]">Claims Processing</h3>
              </div>
              <p className="text-[#6b7280] mb-6 leading-relaxed">
                After care, providers file the bill. If an authorization number exists, it's instantly linked and verified. The AI scrubs for coding compliance, and the insurer adjudicates the final submission.
              </p>
              <ul className="space-y-3 text-sm text-[#374151]">
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#16a34a]" /> Automated CPT & ICD-10 scrubbing</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#16a34a]" /> Upcoding & bundling detection</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-[#16a34a]" /> Seamless pre-auth linkage</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== HOW IT WORKS ==================== */}
      <section id="how-it-works" className="py-20 md:py-24 border-t border-[#f3f4f6] bg-[#fafafa]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mb-14">
            <div className="text-xs font-semibold text-[#16a34a] uppercase tracking-wider mb-3">The AI Claim Flow</div>
            <h2
              className="font-serif-display text-[#0a0a0a]"
              style={{ fontSize: "clamp(28px, 3.6vw, 40px)", fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.2 }}
            >
              Review before you send.
            </h2>
            <p className="text-[#6b7280] mt-4 text-base md:text-lg">
              Catch coding and billing errors internally. Nothing is submitted to the insurer until you confirm it's correct.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {[
              { icon: FileText, step: "01", title: "Extract & Submit", description: "Drop in clinical documents. The AI auto-fills the form fields with per-field confidence scores." },
              { icon: Brain, step: "02", title: "Review AI Suggestions", description: "The AI scrubs the claim against payer policy. Review its compliance suggestions and fix any issues before it leaves your system." },
              { icon: ShieldCheck, step: "03", title: "Confirm & Adjudicate", description: "Confirm and send. The clean claim reaches the insurer, where it is automatically scored and adjudicated for a rapid verdict." },
            ].map((f, i) => (
              <div key={i} className="card-light p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="inline-flex items-center justify-center w-9 h-9 bg-[#f0faf4] rounded-md">
                    <f.icon className="h-4 w-4 text-[#16a34a]" />
                  </div>
                  <span className="font-mono text-xs text-[#9ca3af]">{f.step}</span>
                </div>
                <h3 className="font-serif-display text-lg font-bold text-[#0a0a0a] mb-2" style={{ letterSpacing: "-0.01em" }}>{f.title}</h3>
                <p className="text-[#6b7280] text-sm leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ==================== CAPABILITIES ==================== */}
      <section id="capabilities" className="py-20 md:py-24 border-t border-[#f3f4f6]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2
              className="font-serif-display text-[#0a0a0a]"
              style={{ fontSize: "clamp(28px, 3.6vw, 40px)", fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.2 }}
            >
              Platform Capabilities
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12">
            {[
              { icon: Brain, title: "AI Claim Scrubbing", desc: "Checks coding & billing compliance (CPT ↔ ICD-10, NCCI, modifiers, fee schedules) against specific payer rules." },
              { icon: AlertTriangle, title: "Statistical Fraud Detection", desc: "An advanced ML model scores claims for fraud risk on the insurer side to flag suspicious billing patterns." },
              { icon: Zap, title: "Automated Adjudication", desc: "Produces accept, deny, or escalate verdicts by combining the coding review, fraud score, and payer policy." },
              { icon: LinkIcon, title: "Authorization Linkage", desc: "Automatically verifies claims against pre-auth validity windows, patient identity, and approved procedures." },
              { icon: MessageSquare, title: "AI Assistant", desc: "A read-only assistant in every portal answering questions about claims, pre-auths, and policy with cited sources." },
              { icon: History, title: "Audit Trail & Compliance", desc: "An append-only, hash-chained event log with PII-access logging and data retention tooling for full accountability." },
            ].map((cap, i) => (
              <div key={i} className="flex gap-4">
                <div className="flex-shrink-0 mt-1">
                  <div className="w-10 h-10 rounded-lg bg-[#f0faf4] flex items-center justify-center">
                    <cap.icon className="h-5 w-5 text-[#16a34a]" />
                  </div>
                </div>
                <div>
                  <h3 className="font-serif-display text-xl font-bold text-[#0a0a0a] mb-2">{cap.title}</h3>
                  <p className="text-[#6b7280] text-sm leading-relaxed">{cap.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ==================== TRUST & MENA ==================== */}
      <section className="py-16 md:py-20 border-t border-[#f3f4f6] bg-[#0A1628] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2
                className="font-serif-display mb-6"
                style={{ fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1.2 }}
              >
                Built for MENA Healthcare
              </h2>
              <p className="text-[#9ca3af] text-lg mb-8 leading-relaxed max-w-lg">
                The compliance layer aligned with regional standards, trained on payer rules across Jordan, UAE, Saudi Arabia, and the GCC.
              </p>
              
              <div className="space-y-5">
                <div className="flex items-start gap-3">
                  <Lock className="h-5 w-5 text-[#16a34a] mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-white">End-to-end Encryption</h4>
                    <p className="text-sm text-[#9ca3af] mt-1">Data is encrypted in transit and at rest using industry-standard protocols.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <ShieldCheck className="h-5 w-5 text-[#16a34a] mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-white">PDPL Alignment</h4>
                    <p className="text-sm text-[#9ca3af] mt-1">Designed with data-protection requirements in mind, including retention and erasure tooling.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <History className="h-5 w-5 text-[#16a34a] mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-white">Immutable Audit Trail</h4>
                    <p className="text-sm text-[#9ca3af] mt-1">Hash-chained event logging ensures every action and PII access is recorded permanently.</p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="relative">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-sm">
                <div className="flex justify-between items-center mb-6 pb-6 border-b border-white/10">
                   <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#16a34a]/20 flex items-center justify-center">
                         <Lock className="h-5 w-5 text-[#16a34a]" />
                      </div>
                      <div>
                        <div className="text-sm font-medium">Security Posture</div>
                        <div className="text-xs text-[#9ca3af]">Continuous monitoring</div>
                      </div>
                   </div>
                   <div className="px-3 py-1 bg-[#16a34a]/20 text-[#16a34a] text-xs font-semibold rounded-full">
                      Secured
                   </div>
                </div>
                <div className="space-y-4">
                  {[
                    { label: "Data Encryption", status: "Active" },
                    { label: "Audit Hash Chain", status: "Verified" },
                    { label: "Access Logging", status: "Enforced" }
                  ].map((item, i) => (
                    <div key={i} className="flex justify-between items-center">
                      <span className="text-sm text-[#9ca3af]">{item.label}</span>
                      <span className="text-sm text-white font-mono flex items-center gap-1.5">
                        <Check className="h-3.5 w-3.5 text-[#16a34a]" /> {item.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== CTA ==================== */}
      <section className="py-20 md:py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2
            className="font-serif-display text-[#0a0a0a] mb-4"
            style={{ fontSize: "clamp(28px, 3.6vw, 40px)", fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.2 }}
          >
            Connect the dots in your healthcare workflow.
          </h2>
          <p className="text-[#6b7280] text-base md:text-lg mb-9 max-w-xl mx-auto">
            Whether you&apos;re a hospital reducing rejections, a doctor speeding up care, or an insurer automating reviews — ClaimRidge brings compliance from day one.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center gap-2 bg-[#16a34a] text-white font-semibold px-8 py-3.5 rounded-lg transition-all hover:bg-[#15803d] hover:scale-[1.01]"
            >
              Join the Waitlist
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function Footer() {
  return (
    <footer className="bg-[#f9fafb] border-t border-[#e5e7eb] py-12 md:py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          <div className="md:col-span-2">
            <div className="font-display text-xl font-extrabold text-[#0a0a0a] mb-5">
              Claim<span className="text-[#16a34a]">Ridge</span>
            </div>
            <p className="text-sm text-[#6b7280] leading-relaxed max-w-sm">
              The AI compliance layer for MENA healthcare. Bridging providers, doctors, and insurers across pre-authorisation and claims.
            </p>
          </div>
          <div>
            <h4 className="text-xs font-bold text-[#0a0a0a] uppercase tracking-wider mb-5">Company</h4>
            <ul className="space-y-3 text-sm text-[#6b7280]">
              <li><Link href="#" className="hover:text-[#16a34a] transition-colors">About Us</Link></li>
              <li><Link href="#" className="hover:text-[#16a34a] transition-colors">Privacy Policy</Link></li>
              <li><Link href="#" className="hover:text-[#16a34a] transition-colors">Terms of Service</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-bold text-[#0a0a0a] uppercase tracking-wider mb-5">Trust & Security</h4>
            <ul className="space-y-3 text-sm text-[#6b7280]">
              <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#16a34a]" /> PDPL Aligned</li>
              <li className="flex items-center gap-2"><Lock className="h-4 w-4 text-[#16a34a]" /> End-to-end Encryption</li>
              <li className="flex items-center gap-2"><History className="h-4 w-4 text-[#16a34a]" /> Immutable Audit Trail</li>
            </ul>
          </div>
        </div>
        <div className="mt-12 pt-8 border-t border-[#e5e7eb] flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-[10px] sm:text-xs text-[#9ca3af] uppercase tracking-widest font-medium">
            © {new Date().getFullYear()} ClaimRidge. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <Link href="#" className="text-[#9ca3af] hover:text-[#0a0a0a] transition-colors text-xs">LinkedIn</Link>
            <Link href="#" className="text-[#9ca3af] hover:text-[#0a0a0a] transition-colors text-xs">Twitter</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}



/* ============ Animated Scrubbing Document ============ */

function ScrubbingDocument() {
  const fields = [
    { label: "Patient Name", value: "Ahmad Khalil" },
    { label: "Date of Service", value: "2026-04-12" },
    { label: "Provider ID", value: "JO-AMM-HSP-00118" },
    { label: "Payer", value: "Jordan Insurance Co." },
    { label: "Diagnosis (ICD-10)", value: "J06.9" },
    { label: "Procedure (CPT)", value: "99213" },
    { label: "Billed Amount", value: "85.00 JOD" },
  ];

  const stagger = 0.7;

  return (
    <div className="relative">
      {/* Ambient soft glow behind card */}
      <div
        className="absolute -inset-6 rounded-3xl pointer-events-none"
        style={{
          background:
            "radial-gradient(400px 300px at 50% 50%, rgba(22,163,74,0.08), transparent 70%)",
        }}
        aria-hidden="true"
      />

      <div className="relative bg-white border border-[#e5e7eb] rounded-2xl p-4 sm:p-6 shadow-[0_8px_32px_rgba(16,24,40,0.06)]">
        {/* Header */}
        <div className="flex items-center justify-between mb-5 pb-4 border-b border-[#f3f4f6]">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#ff5f56]" />
            <div className="w-2 h-2 rounded-full bg-[#ffbd2e]" />
            <div className="w-2 h-2 rounded-full bg-[#27c93f]" />
          </div>
          <span className="font-mono text-[10px] text-[#9ca3af] uppercase tracking-wider">claim_submission.json</span>
        </div>

        <div className="space-y-1.5">
          {fields.map((field, i) => {
            const delay = `${i * stagger}s`;
            return (
              <div
                key={field.label}
                className="scrub-row flex items-center justify-between py-2 px-2 rounded-md"
                style={{ animationDelay: delay }}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="text-[11px] sm:text-xs text-[#6b7280] w-24 sm:w-32 flex-shrink-0">{field.label}</span>
                  <span className="text-sm text-[#0a0a0a] font-mono truncate">{field.value}</span>
                </div>
                <span
                  className="scrub-check flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#f0faf4] ml-3"
                  style={{ animationDelay: delay }}
                >
                  <Check className="h-3 w-3 text-[#16a34a]" strokeWidth={3} />
                </span>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-5 pt-4 border-t border-[#f3f4f6] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[#16a34a] animate-pulse" />
            <span className="text-xs text-[#6b7280]">Scrubbing with AI</span>
          </div>
          <span className="font-mono text-xs text-[#16a34a] font-semibold">100% clean</span>
        </div>
      </div>
    </div>
  );
}

/* ============ Decorative Shield SVG ============ */

function ShieldBg({ size = 300 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size * (50 / 44)}
      viewBox="0 0 44 50"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M8 2H36L42 10V30C42 39 33 46 22 49C11 46 2 39 2 30V10L8 2Z"
        stroke="#16a34a"
        strokeWidth="0.5"
        fill="none"
      />
      <path
        d="M13 25L19 32L31 17"
        stroke="#16a34a"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
