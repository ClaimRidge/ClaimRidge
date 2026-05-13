"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { MedicalCode } from "@/data/icd10";

interface CodePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (code: string) => void;
  codes: MedicalCode[];
  title: string;
  subtitle?: string;
}

const MAX_RESULTS = 100;

export default function CodePicker({
  isOpen,
  onClose,
  onSelect,
  codes,
  title,
  subtitle,
}: CodePickerProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return codes.slice(0, MAX_RESULTS);
    return codes
      .filter(
        (c) =>
          c.code.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.category.toLowerCase().includes(q)
      )
      .slice(0, MAX_RESULTS);
  }, [query, codes]);

  const handleSelect = (code: string) => {
    onSelect(code);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && filtered.length > 0) {
      e.preventDefault();
      handleSelect(filtered[0].code);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm p-4 sm:pt-20"
      onClick={onClose}
    >
      <div
        className="bg-white border border-[#e5e7eb] rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-3 sm:px-5 py-4 border-b border-[#f3f4f6] flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="font-display text-base sm:text-lg font-bold text-[#0a0a0a]">{title}</h2>
            {subtitle && (
              <p className="text-xs text-[#6b7280] mt-0.5">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#9ca3af] hover:text-[#0a0a0a] transition-colors p-1 -m-1"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-3 sm:px-5 py-3 border-b border-[#f3f4f6]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9ca3af]" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search by code or description..."
              className="w-full pl-10 pr-4 py-2.5 bg-[#f9fafb] border border-[#e5e7eb] rounded-lg text-sm text-[#0a0a0a] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#16a34a] focus:border-transparent"
            />
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#6b7280]">
              No codes match &quot;{query}&quot;.
            </div>
          ) : (
            <ul className="divide-y divide-[#f3f4f6]">
              {filtered.map((item) => (
                <li key={item.code}>
                  <button
                    type="button"
                    onClick={() => handleSelect(item.code)}
                    className="w-full text-left px-5 py-3 hover:bg-[#f0fdf4] focus:bg-[#f0fdf4] focus:outline-none transition-colors group"
                  >
                    <div className="flex items-start gap-3">
                      <span className="font-mono text-sm font-semibold text-[#16a34a] min-w-[72px]">
                        {item.code}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[#0a0a0a]">{item.description}</p>
                        <p className="text-xs text-[#9ca3af] mt-0.5">
                          {item.category}
                        </p>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-3 sm:px-5 py-2.5 border-t border-[#f3f4f6] bg-[#f9fafb] flex items-center justify-between text-xs text-[#6b7280]">
          <span>
            {filtered.length} result{filtered.length === 1 ? "" : "s"}
            {filtered.length >= MAX_RESULTS && " (showing first 100)"}
          </span>
          <span className="hidden sm:inline">
            <kbd className="px-1.5 py-0.5 bg-white border border-[#e5e7eb] text-[#0a0a0a] rounded text-xs">
              Enter
            </kbd>{" "}
            to select first ·{" "}
            <kbd className="px-1.5 py-0.5 bg-white border border-[#e5e7eb] text-[#0a0a0a] rounded text-xs">
              Esc
            </kbd>{" "}
            to close
          </span>
        </div>
      </div>
    </div>
  );
}
