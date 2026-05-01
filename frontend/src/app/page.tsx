"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { ArrowRight, FileCheck, Brain, BarChart3, Check, ShieldCheck, Lock, Sparkles, Play, X as XIcon, Building2 } from "lucide-react";
import DemoVideoModal from "@/components/DemoVideoModal";

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
        {/* Sage → white gradient mesh */}
        <div className="absolute inset-0 hero-mesh pointer-events-none" aria-hidden="true" />

        {/* Large faded shield watermarks */}
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
                Bridging providers and insurers, one clean claim at a time.
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
                ClaimRidge is the AI-powered compliance layer that
                sits between hospitals and insurance companies,
                validating every claim against payer-specific rules
                before submission. The result: fewer denials for
                providers and less manual review for insurers.
              </p>

              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  href="/signup"
                  className="inline-flex items-center justify-center gap-2 bg-[#16a34a] text-white font-semibold px-6 py-3 rounded-lg transition-all hover:bg-[#15803d] hover:scale-[1.01]"
                >
                  Get Started Free
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center gap-2 bg-white border border-[#16a34a] text-[#16a34a] hover:bg-[#f0faf4] font-semibold px-6 py-3 rounded-lg transition-colors"
                >
                  Log In
                </Link>
              </div>

              {/* Demo video placeholder */}
              <DemoVideoButton />

              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-[#6b7280]">
                <span className="flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> HIPAA-grade encryption</span>
                <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> NPHIES-compatible</span>
                <span className="flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> MENA payer rules</span>
              </div>
            </div>

            {/* Animated scrubbing claim document */}
            <div className="relative hidden md:block">
              <ScrubbingDocument />
            </div>
          </div>
        </div>

        {/* Insurance logos marquee 
        <div className="relative pb-12 md:pb-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <p className="text-center text-[10px] tracking-[0.2em] uppercase text-[#9ca3af] mb-5">
              Integrated with major MENA payers and TPAs
            </p>
          </div>
          <LogoMarquee />
        </div>*/}
      </section>

      {/* ==================== SOCIAL PROOF ==================== 
      <section className="py-10 md:py-12 bg-[#f9fafb] border-t border-[#f3f4f6]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-sm text-[#6b7280] mb-6">
            Trusted by providers and insurers across Jordan and the GCC
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="flex items-center gap-2.5 bg-white border border-[#e5e7eb] rounded-lg px-5 py-3 w-full sm:w-auto"
              >
                <Building2 className="h-5 w-5 text-[#d1d5db] flex-shrink-0" />
                <span className="text-sm text-[#9ca3af] font-medium">Clinic Partner</span>
              </div>
            ))}
          </div>
        </div>
      </section>*/}

      {/* ==================== HOW IT WORKS ==================== */}
      <section className="py-20 md:py-24 border-t border-[#f3f4f6]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mb-14">
            <div className="text-xs font-semibold text-[#16a34a] uppercase tracking-wider mb-3">How it works</div>
            <h2
              className="font-serif-display text-[#0a0a0a]"
              style={{ fontSize: "clamp(28px, 3.6vw, 40px)", fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.2 }}
            >
              Compliance built into the workflow.
            </h2>
            <p className="text-[#6b7280] mt-4 text-base md:text-lg">
              ClaimRidge sits between your billing team and the payer, catching issues before they become denials.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {[
              { icon: FileCheck, step: "01", title: "Submit", description: "Provider uploads or enters claim details (patient, diagnosis, procedure codes, and payer information)." },
              { icon: Brain, step: "02", title: "Validate", description: "AI checks every field against the specific payer's requirements (coding accuracy, medical necessity, and compliance rules)." },
              { icon: BarChart3, step: "03", title: "Clear to Send", description: "Compliant claims go through. Flagged claims get actionable fixes (so nothing hits the payer until it's right)." },
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

      {/* ==================== MENA FOCUS ==================== */}
      <section className="py-12 md:py-14 border-t border-[#f3f4f6] bg-[#fafafa]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p
            className="font-serif-display text-[#374151] leading-relaxed"
            style={{ fontSize: "clamp(18px, 2.6vw, 24px)", fontWeight: 500, letterSpacing: "-0.01em" }}
          >
            The compliance layer built for MENA healthcare, trained on payer rules across Jordan, UAE, Saudi Arabia, and the GCC.
          </p>
        </div>
      </section>

      {/* ==================== CTA ==================== */}
      <section className="py-20 md:py-24 border-t border-[#f3f4f6]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2
            className="font-serif-display text-[#0a0a0a] mb-4"
            style={{ fontSize: "clamp(28px, 3.6vw, 40px)", fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.2 }}
          >
            Stop losing revenue to preventable denials.
          </h2>
          <p className="text-[#6b7280] text-base md:text-lg mb-9 max-w-lg mx-auto">
            Whether you&apos;re a hospital reducing rejections or an insurer cutting manual review, ClaimRidge makes every claim compliant from day one.
          </p>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 bg-[#16a34a] text-white font-semibold px-6 py-3 rounded-lg transition-all hover:bg-[#15803d] hover:scale-[1.01]"
          >
            Get Started Free
            <ArrowRight className="h-4 w-4" />
          </Link>
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
          <div className="md:col-span-1">
            <div className="font-display text-xl font-extrabold text-[#0a0a0a] mb-5">
              Claim<span className="text-[#16a34a]">Ridge</span>
            </div>
            <p className="text-sm text-[#6b7280] leading-relaxed">
              The AI compliance layer for MENA healthcare. Bridging the gap between providers and insurance.
            </p>
          </div>
          <div>
            <h4 className="text-xs font-bold text-[#0a0a0a] uppercase tracking-wider mb-5">Platform</h4>
            <ul className="space-y-3 text-sm text-[#6b7280]">
              <li><Link href="/signup" className="hover:text-[#16a34a] transition-colors">For Providers</Link></li>
              <li><Link href="/signup" className="hover:text-[#16a34a] transition-colors">For Insurance</Link></li>
              <li><Link href="/dashboard" className="hover:text-[#16a34a] transition-colors">AI Scrubber</Link></li>
            </ul>
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
            <h4 className="text-xs font-bold text-[#0a0a0a] uppercase tracking-wider mb-5">Security</h4>
            <ul className="space-y-3 text-sm text-[#6b7280]">
              <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#16a34a]" /> HIPAA Compliant</li>
              <li className="flex items-center gap-2"><Lock className="h-4 w-4 text-[#16a34a]" /> 256-bit Encryption</li>
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

/* ============ Demo Video Button ============ */

function DemoVideoButton() {
  return (
    <DemoVideoModal>
      <button
        type="button"
        className="mt-6 group flex items-center gap-3 bg-[#f9fafb] hover:bg-[#f3f4f6] border border-[#e5e7eb] hover:border-[#d1d5db] rounded-xl px-4 py-3 transition-all w-full sm:w-auto"
      >
        <span className="flex-shrink-0 w-9 h-9 rounded-full bg-[#16a34a] flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
          <Play className="h-4 w-4 text-white ml-0.5" />
        </span>
        <span className="text-sm font-medium text-[#374151] group-hover:text-[#0a0a0a] transition-colors">
          Watch a 60-second demo
        </span>
      </button>
    </DemoVideoModal>
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

/* ============ Insurance Logo Marquee ============ */

function LogoMarquee() {
  // Varied placeholder "logo" shapes — no real names or brand marks
  const logos = [
    { w: 110, shape: "pill" },
    { w: 95, shape: "block" },
    { w: 120, shape: "split" },
    { w: 100, shape: "pill" },
    { w: 115, shape: "dotted" },
    { w: 100, shape: "block" },
    { w: 110, shape: "split" },
    { w: 105, shape: "pill" },
  ];

  // Duplicate the list so the marquee can loop seamlessly
  const track = [...logos, ...logos];

  return (
    <div className="relative w-full overflow-hidden">
      {/* Edge fade masks */}
      <div
        className="absolute inset-y-0 left-0 w-24 md:w-40 z-10 pointer-events-none"
        style={{ background: "linear-gradient(to right, #ffffff 10%, rgba(255,255,255,0) 100%)" }}
        aria-hidden="true"
      />
      <div
        className="absolute inset-y-0 right-0 w-24 md:w-40 z-10 pointer-events-none"
        style={{ background: "linear-gradient(to left, #ffffff 10%, rgba(255,255,255,0) 100%)" }}
        aria-hidden="true"
      />

      <div className="marquee-track flex items-center gap-10 md:gap-14 w-max">
        {track.map((logo, i) => (
          <PlaceholderLogo key={i} width={logo.w} shape={logo.shape as PlaceholderShape} />
        ))}
      </div>
    </div>
  );
}

type PlaceholderShape = "pill" | "block" | "split" | "dotted";

function PlaceholderLogo({ width, shape }: { width: number; shape: PlaceholderShape }) {
  const commonWrapperStyle: React.CSSProperties = {
    width,
    height: 32,
    filter: "blur(0.5px)",
    opacity: 0.18,
  };

  switch (shape) {
    case "pill":
      return (
        <div style={commonWrapperStyle} className="flex items-center gap-2 flex-shrink-0">
          <div className="w-7 h-7 rounded-full logo-shimmer flex-shrink-0" />
          <div className="flex-1 h-3.5 rounded-sm logo-shimmer" />
        </div>
      );
    case "block":
      return (
        <div style={commonWrapperStyle} className="flex items-center gap-2 flex-shrink-0">
          <div className="w-8 h-8 rounded-md logo-shimmer flex-shrink-0" />
          <div className="flex flex-col gap-1 flex-1">
            <div className="h-2.5 rounded-sm logo-shimmer w-full" />
            <div className="h-1.5 rounded-sm logo-shimmer w-3/4" />
          </div>
        </div>
      );
    case "split":
      return (
        <div style={commonWrapperStyle} className="flex items-center gap-1.5 flex-shrink-0">
          <div className="w-5 h-5 rotate-45 logo-shimmer flex-shrink-0" />
          <div className="flex-1 h-3 rounded-sm logo-shimmer" />
        </div>
      );
    case "dotted":
      return (
        <div style={commonWrapperStyle} className="flex items-center gap-2 flex-shrink-0">
          <div className="flex gap-1 flex-shrink-0">
            <div className="w-2 h-2 rounded-full logo-shimmer" />
            <div className="w-2 h-2 rounded-full logo-shimmer" />
            <div className="w-2 h-2 rounded-full logo-shimmer" />
          </div>
          <div className="flex-1 h-3 rounded-sm logo-shimmer" />
        </div>
      );
  }
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
