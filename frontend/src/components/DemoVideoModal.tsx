"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";

// TODO: Replace VIDEO_URL with real demo link (YouTube or Loom embed URL)
const VIDEO_URL = "";

interface DemoVideoModalProps {
  children: React.ReactNode;
}

export default function DemoVideoModal({ children }: DemoVideoModalProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handler);
    };
  }, [open]);

  return (
    <>
      <div onClick={() => setOpen(true)}>{children}</div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative w-full max-w-3xl bg-white rounded-xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#f3f4f6]">
              <span className="text-sm font-semibold text-[#0a0a0a]">
                ClaimRidge Demo
              </span>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded-lg hover:bg-[#f3f4f6] text-[#6b7280] hover:text-[#0a0a0a] transition-colors"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Video area */}
            <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
              {VIDEO_URL ? (
                <iframe
                  className="absolute inset-0 w-full h-full"
                  src={VIDEO_URL}
                  title="ClaimRidge Demo"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#f9fafb]">
                  <div className="w-16 h-16 rounded-full bg-[#e5e7eb] flex items-center justify-center mb-4">
                    <svg
                      className="h-7 w-7 text-[#9ca3af] ml-1"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-[#6b7280]">
                    Demo video coming soon
                  </p>
                  <p className="text-xs text-[#9ca3af] mt-1">
                    Replace VIDEO_URL in DemoVideoModal.tsx
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
