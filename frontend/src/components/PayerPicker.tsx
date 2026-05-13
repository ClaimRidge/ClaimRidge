"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Search, Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface PayerPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (payer: any) => void;
}

export default function PayerPicker({ isOpen, onClose, onSelect }: PayerPickerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [payers, setPayers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch registered insurances from Supabase when the modal opens
  useEffect(() => {
    if (!isOpen) return;
    
    const fetchPayers = async () => {
      setLoading(true);
      const supabase = createClient();
      const { data, error } = await supabase
        .from("insurers")
        .select("id, name, commercial_license_number")
        .order("name", { ascending: true });

      if (!error && data) {
        setPayers(data);
      }
      setLoading(false);
    };

    fetchPayers();
  }, [isOpen]);

  if (!isOpen || !mounted) return null;

  const filteredPayers = payers.filter(
    (payer) =>
      payer.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      payer.commercial_license_number?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-gray-900 text-lg">Select Insurance Payer</h3>
            <p className="text-sm text-gray-500">Registered insurers on ClaimRidge</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-gray-100 bg-gray-50/50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by company name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 transition-shadow"
              autoFocus
            />
          </div>
        </div>

        {/* List */}
        <div className="overflow-y-auto p-2 flex-1">
          {loading ? (
            <div className="p-8 text-center text-gray-500 text-sm">Loading registered insurances...</div>
          ) : filteredPayers.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">
              No registered insurance found. You can close this and type it manually.
            </div>
          ) : (
            <div className="grid gap-1">
              {filteredPayers.map((payer) => (
                <button
                  key={payer.id}
                  onClick={() => {
                    onSelect({
                      id: payer.id,
                      name: payer.name,
                      code: payer.commercial_license_number,
                    });
                    onClose();
                  }}
                  className="flex items-center gap-3 p-3 w-full text-left rounded-xl hover:bg-green-50 transition-colors group"
                >
                  <div className="flex-shrink-0 w-10 h-10 bg-gray-100 group-hover:bg-green-100 text-gray-500 group-hover:text-green-600 rounded-lg flex items-center justify-center transition-colors">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-gray-900 truncate">
                      {payer.name}
                    </h4>
                    <p className="text-xs text-gray-500 uppercase tracking-wider">
                      {payer.commercial_license_number || "INSURER"}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}