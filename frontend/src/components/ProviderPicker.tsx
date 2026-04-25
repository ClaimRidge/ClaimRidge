"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X, Hospital, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Provider {
  name: string;
  nameAr: string;
  city: string;
  country: string;
  type: string;
  providerId?: string;
}

interface ProviderPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (provider: Provider) => void;
}

const MAX_RESULTS = 50;

export default function ProviderPicker({
  isOpen,
  onClose,
  onSelect,
}: ProviderPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  // Initial search and focus on open
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      fetchResults(""); // Initial load
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [isOpen]);

  // Helper function for searching
  const fetchResults = async (searchQuery: string) => {
    setLoading(true);
    try {
      let request = supabase
        .from("directory_entities")
        .select("*")
        .eq("entity_type", "clinic")
        .limit(MAX_RESULTS);

      if (searchQuery.trim()) {
        request = request.or(`name_en.ilike.%${searchQuery}%,name_ar.ilike.%${searchQuery}%`);
      }

      const { data, error } = await request;

      if (error) throw error;

      const mappedResults: Provider[] = (data || []).map(item => ({
        name: item.name_en,
        nameAr: item.name_ar,
        city: item.city || "Unknown",
        country: item.country || "Jordan",
        type: "Facility",
        providerId: item.license_number
      }));

      setResults(mappedResults);
    } catch (err) {
      console.error("Directory search failed:", err);
    } finally {
      setLoading(false);
    }
  };

  // Debounced database search for user input
  useEffect(() => {
    if (!isOpen || query === "") return;
    
    const searchTimer = setTimeout(() => {
      fetchResults(query);
    }, 300);

    return () => clearTimeout(searchTimer);
  }, [query, isOpen]);

  const handleSelect = (provider: Provider) => {
    onSelect(provider);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && results.length > 0) {
      e.preventDefault();
      handleSelect(results[0]);
    }
  };

  // Grouping logic for the UI
  const grouped: Record<string, Provider[]> = {};
  for (const p of results) {
    const key = `${p.country} — ${p.city}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(p);
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm p-4 sm:pt-20"
      onClick={onClose}
    >
      <div
        className="bg-white border border-[#e5e7eb] rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-3 sm:px-5 py-4 border-b border-[#f3f4f6] flex items-start justify-between gap-2">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 bg-[#f0fdf4] border border-[#bbf7d0] rounded-lg flex items-center justify-center flex-shrink-0">
              <Hospital className="h-5 w-5 text-[#16a34a]" />
            </div>
            <div>
              <h2 className="font-display text-base sm:text-lg font-bold text-[#0a0a0a]">
                Search Hospital or Clinic
              </h2>
              <p className="text-xs text-[#6b7280] mt-0.5">
                Real-time directory of facilities in our master database
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#9ca3af] hover:text-[#0a0a0a] transition-colors p-1 -m-1"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-3 sm:px-5 py-3 border-b border-[#f3f4f6]">
          <div className="relative">
            {loading ? (
              <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#16a34a] animate-spin" />
            ) : (
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9ca3af]" />
            )}
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Start typing facility name..."
              className="w-full pl-10 pr-4 py-2.5 bg-[#f9fafb] border border-[#e5e7eb] rounded-lg text-sm text-[#0a0a0a] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#16a34a] focus:border-transparent"
            />
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {results.length === 0 && !loading ? (
            <div className="p-10 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-gray-50 rounded-full mb-3 text-gray-300">
                <Search className="h-6 w-6" />
              </div>
              <p className="text-sm text-gray-900 font-medium">
                {query.trim() === "" ? "No facilities in directory" : "No results found in directory"}
              </p>
              <p className="text-xs text-[#6b7280] mt-1">
                You can still manually enter the name in the main form.
              </p>
            </div>
          ) : (
            Object.entries(grouped).map(([groupKey, providers]) => (
              <div key={groupKey}>
                <div className="sticky top-0 bg-[#f9fafb] border-b border-[#f3f4f6] px-5 py-1.5 z-10">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#16a34a]">
                    {groupKey}
                  </span>
                </div>
                <ul className="divide-y divide-[#f3f4f6]">
                  {providers.map((p, idx) => (
                    <li key={idx}>
                      <button
                        type="button"
                        onClick={() => handleSelect(p)}
                        className="w-full text-left px-5 py-3 hover:bg-[#f0fdf4] focus:bg-[#f0fdf4] focus:outline-none transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-[#0a0a0a]">
                              {p.name}
                            </p>
                            <p
                              className="text-sm text-[#6b7280] mt-0.5"
                              dir="rtl"
                              lang="ar"
                            >
                              {p.nameAr}
                            </p>
                            {p.providerId && (
                              <p className="text-xs text-[#9ca3af] mt-1 font-mono">
                                License: {p.providerId}
                              </p>
                            )}
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-3 sm:px-5 py-2.5 border-t border-[#f3f4f6] bg-[#f9fafb] flex items-center justify-between text-xs text-[#6b7280]">
          <span>{results.length} result{results.length === 1 ? "" : "s"}</span>
          <span className="hidden sm:inline">
            <kbd className="px-1.5 py-0.5 bg-white border border-[#e5e7eb] text-[#0a0a0a] rounded text-xs">Enter</kbd> to select first
          </span>
        </div>
      </div>
    </div>
  );
}
