"use client";

import { Settings } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0a0a0a]">Settings</h1>
        <p className="text-[#9ca3af] text-sm mt-1">Manage your organization and account preferences</p>
      </div>
      <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm p-12 text-center">
        <Settings className="h-12 w-12 text-[#d1d5db] mx-auto mb-4" />
        <h2 className="font-display text-lg font-bold text-[#0a0a0a] mb-2">Coming Soon</h2>
        <p className="text-[#9ca3af] text-sm max-w-md mx-auto">
          Organization settings, team management, notification preferences, and API key configuration will be available in the next release.
        </p>
      </div>
    </div>
  );
}
