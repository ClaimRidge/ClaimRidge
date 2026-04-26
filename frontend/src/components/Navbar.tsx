"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { User } from "@supabase/supabase-js";
import { Menu, X, LogOut, LayoutDashboard, FilePlus, Stethoscope, Settings, Columns3 } from "lucide-react";
import ClaimRidgeLogo from "@/components/ClaimRidgeLogo";

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  useEffect(() => {
    const fetchUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user);
      setLoading(false);
    };
    fetchUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  // Show Navbar on home, dashboards, claims, and settings
  const showNavbar = 
    pathname === "/" || 
    pathname.startsWith("/dashboard") || 
    pathname.startsWith("/claims") || 
    pathname.startsWith("/settings");

  if (!showNavbar) {
    return null;
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <nav className="bg-white sticky top-0 z-50 border-b border-[#f3f4f6]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" aria-label="ClaimRidge home">
            <ClaimRidgeLogo size={32} variant="light" />
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-7">
            {!loading && user ? (
              <>
                <Link
                  href="/dashboard"
                  className={`flex items-center gap-1.5 text-sm transition-colors ${
                    pathname === "/dashboard/provider" || pathname === "/dashboard" 
                      ? "text-[#16a34a] font-semibold" 
                      : "text-[#374151] hover:text-[#16a34a]"
                  }`}
                >
                  <LayoutDashboard className="h-4 w-4" />
                  Overview
                </Link>
                <Link
                  href="/dashboard/pipeline"
                  className={`flex items-center gap-1.5 text-sm transition-colors ${
                    pathname.startsWith("/dashboard/pipeline") 
                      ? "text-[#16a34a] font-semibold" 
                      : "text-[#374151] hover:text-[#16a34a]"
                  }`}
                >
                  <Columns3 className="h-4 w-4" />
                  Pipeline
                </Link>
                <Link
                  href="/claims/new"
                  className="flex items-center gap-1.5 text-sm text-[#374151] hover:text-[#16a34a] transition-colors"
                >
                  <FilePlus className="h-4 w-4" />
                  New Claim
                </Link>
                <Link
                  href="/settings"
                  className="flex items-center gap-1.5 text-sm text-[#374151] hover:text-[#16a34a] transition-colors"
                >
                  <Settings className="h-4 w-4" />
                  Settings
                </Link>
                <div className="flex items-center gap-3 ml-2 pl-4 border-l border-[#e5e7eb]">
                  <span className="text-sm text-[#6b7280]">{user.email}</span>
                  <button
                    onClick={handleSignOut}
                    className="flex items-center gap-1 text-sm text-[#6b7280] hover:text-[#16a34a] transition-colors"
                    aria-label="Sign out"
                  >
                    <LogOut className="h-4 w-4" />
                    <span className="hidden lg:inline">Sign Out</span>
                  </button>
                </div>
              </>
            ) : !loading ? (
              <>
                <Link
                  href="/login"
                  className="text-sm font-medium text-[#374151] hover:text-[#0a0a0a] transition-colors"
                >
                  Log In
                </Link>
                <Link
                  href="/signup"
                  className="inline-flex items-center justify-center bg-[#16a34a] text-white font-semibold text-sm px-4 py-2 rounded-lg hover:bg-[#15803d] transition-colors"
                >
                  Get Started
                </Link>
              </>
            ) : null}
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 text-[#0a0a0a]"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-[#f3f4f6] bg-white px-4 py-4 space-y-3">
          {!loading && user ? (
            <>
              <Link
                href="/dashboard"
                className={`flex items-center gap-2 py-2 transition-colors ${
                  pathname === "/dashboard/provider" || pathname === "/dashboard" 
                    ? "text-[#16a34a] font-semibold" 
                    : "text-[#374151] hover:text-[#16a34a]"
                }`}
                onClick={() => setMobileOpen(false)}
              >
                <LayoutDashboard className="h-4 w-4" />
                Overview
              </Link>
              <Link
                href="/dashboard/pipeline"
                className={`flex items-center gap-2 py-2 transition-colors ${
                  pathname.startsWith("/dashboard/pipeline") 
                    ? "text-[#16a34a] font-semibold" 
                    : "text-[#374151] hover:text-[#16a34a]"
                }`}
                onClick={() => setMobileOpen(false)}
              >
                <Columns3 className="h-4 w-4" />
                Pipeline
              </Link>
              <Link
                href="/claims/new"
                className="flex items-center gap-2 py-2 text-[#374151] hover:text-[#16a34a]"
                onClick={() => setMobileOpen(false)}
              >
                <FilePlus className="h-4 w-4" />
                New Claim
              </Link>
              <Link
                href="/settings"
                className="flex items-center gap-2 py-2 text-[#374151] hover:text-[#16a34a]"
                onClick={() => setMobileOpen(false)}
              >
                <Settings className="h-4 w-4" />
                Settings
              </Link>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-2 py-2 text-[#374151] hover:text-[#16a34a] w-full"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </>
          ) : !loading ? (
            <>
              <Link
                href="/login"
                onClick={() => setMobileOpen(false)}
                className="block py-2 text-[#374151] hover:text-[#0a0a0a]"
              >
                Log In
              </Link>
              <Link
                href="/signup"
                onClick={() => setMobileOpen(false)}
                className="block text-center bg-[#16a34a] text-white font-semibold px-4 py-2.5 rounded-lg hover:bg-[#15803d]"
              >
                Get Started
              </Link>
            </>
          ) : null}
        </div>
      )}
    </nav>
  );
}
