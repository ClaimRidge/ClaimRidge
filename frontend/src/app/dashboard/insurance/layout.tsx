"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { User } from "@supabase/supabase-js";
import ClaimRidgeLogo from "@/components/ClaimRidgeLogo";
import {
  LayoutDashboard,
  FileSearch,
  Scale,
  Users,
  BarChart3,
  ShieldAlert,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Inbox
} from "lucide-react";

const NAV_GROUPS = [
  {
    label: "Medical Operations",
    items: [
      { href: "/dashboard/insurance", label: "Pre-Auth Inbox", icon: Inbox, exact: true },
    ],
  },
  {
    label: "Knowledge Base",
    items: [
      { href: "/dashboard/insurance/policies", label: "Medical Policies (RAG)", icon: Scale },
      { href: "/dashboard/insurance/providers", label: "Network Providers", icon: Users },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { href: "/dashboard/insurance/analytics", label: "Turnaround Analytics", icon: BarChart3 },
      { href: "/dashboard/insurance/audit", label: "Compliance & Audit", icon: ShieldAlert },
    ],
  },
];

function NavItem({
  href,
  label,
  icon: Icon,
  exact,
  pathname,
  onClick,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  exact?: boolean;
  pathname: string;
  onClick?: () => void;
}) {
  const isActive = exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`group flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
        isActive
          ? "bg-[#16a34a] text-white shadow-lg shadow-[#16a34a]/20"
          : "text-white/40 hover:text-white hover:bg-white/5"
      }`}
    >
      <div className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
        isActive ? "bg-white/20" : "bg-white/5 group-hover:bg-white/10"
      }`}>
        <Icon className="h-4 w-4 flex-shrink-0" />
      </div>
      <span className="flex-1 truncate">{label}</span>
      {isActive && <ChevronRight className="h-3 w-3 text-white/40" />}
    </Link>
  );
}

export default function InsurerLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setUser(user);

      // Fetch the profile and join with the insurers table to get the company name
      const { data: profile, error } = await supabase
        .from("profiles")
        .select(`
          role,
          insurer_id,
          insurers ( name )
        `)
        .eq("id", user.id)
        .maybeSingle();

      if (!profile?.insurer_id) { 
        router.push("/onboarding"); 
        return; 
      }
      
      // @ts-ignore - Supabase join typing workaround
      setCompanyName(profile.insurers?.name || "Insurance Partner");
      setAuthorized(true);
      setLoading(false);
    };
    checkAuth();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  // Hide root navbar/footer
  useEffect(() => {
    const nav = document.querySelector("body > nav, nav.sticky");
    const footer = document.querySelector("body > footer, footer");
    const main = document.querySelector("body > main");
    if (nav) (nav as HTMLElement).style.display = "none";
    if (footer) (footer as HTMLElement).style.display = "none";
    if (main) {
      (main as HTMLElement).style.flex = "1";
      (main as HTMLElement).style.display = "flex";
      (main as HTMLElement).style.flexDirection = "column";
    }
    return () => {
      if (nav) (nav as HTMLElement).style.display = "";
      if (footer) (footer as HTMLElement).style.display = "";
    };
  }, []);

  if (loading || !authorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f9fafb]">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin h-8 w-8 border-4 border-[#16a34a] border-t-transparent rounded-full" />
          <p className="text-sm text-[#9ca3af] font-medium">Verifying access...</p>
        </div>
      </div>
    );
  }

  const initials = companyName
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <div className="h-screen bg-[#f4f6f9] flex overflow-hidden">

      {/* ─── Desktop Sidebar ─────────────────────────────── */}
      <aside className="hidden lg:flex lg:flex-col lg:w-60 xl:w-64 flex-shrink-0 bg-[#0A1628] border-r border-white/5 h-full">
        {/* Logo */}
        <div className="h-20 flex items-center px-6 border-b border-white/5">
          <Link href="/dashboard/insurance" className="hover:opacity-80 transition-opacity">
            <ClaimRidgeLogo size={28} variant="dark" />
          </Link>
        </div>

        {/* Unified Navigation Container */}
        <div className="flex-1 flex flex-col justify-between py-6 px-3 min-h-0">
          {/* Main Menu */}
          <nav className="space-y-6 overflow-y-auto no-scrollbar">
            {NAV_GROUPS.map((group) => (
              <div key={group.label} className="space-y-1">
                <p className="px-3 mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-white/20">
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <NavItem
                      key={item.href}
                      {...item}
                      pathname={pathname}
                    />
                  ))}
                </div>
              </div>
            ))}
          </nav>

          {/* Bottom Actions - Unified with Nav Style */}
          <div className="mt-8 space-y-1 pt-6 border-t border-white/5">
            <NavItem 
              href="/dashboard/insurance/settings" 
              label="Settings" 
              icon={Settings} 
              pathname={pathname} 
            />
            <button
              onClick={handleSignOut}
              className="w-full group flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-white/40 hover:text-red-400 hover:bg-red-400/10 transition-all duration-200"
            >
              <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 group-hover:bg-red-400/10 transition-colors">
                <LogOut className="h-4 w-4 transition-colors" />
              </div>
              <span className="flex-1 text-left">Sign Out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* ─── Mobile Header ───────────────────────────────── */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-[#0A1628] px-4 h-14 flex items-center justify-between">
        <Link href="/dashboard/insurance">
          <ClaimRidgeLogo size={22} variant="dark" />
        </Link>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1.5 text-white/70 hover:text-white">
          {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* ─── Mobile Drawer ───────────────────────────────── */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-14 bottom-0 w-64 bg-[#0A1628] flex flex-col">

            <nav className="flex-1 px-3 py-2 space-y-5 overflow-y-auto">
              {NAV_GROUPS.map((group) => (
                <div key={group.label}>
                  <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white/25">
                    {group.label}
                  </p>
                  <div className="space-y-0.5">
                    {group.items.map((item) => (
                      <NavItem key={item.href} {...item} pathname={pathname} onClick={() => setSidebarOpen(false)} />
                    ))}
                  </div>
                </div>
              ))}
            </nav>
            <div className="px-3 py-3 border-t border-white/8 space-y-0.5">
              <NavItem href="/dashboard/insurance/settings" label="Settings" icon={Settings} pathname={pathname} onClick={() => setSidebarOpen(false)} />
              <button
                onClick={handleSignOut}
                className="w-full group flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-white/50 hover:text-red-400 hover:bg-red-500/10 transition-all duration-150"
              >
                <LogOut className="h-4 w-4 text-white/30 group-hover:text-red-400" />
                Sign Out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ─── Main Content ─────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">



        {/* Page content */}
        <main className="flex-1 overflow-y-auto pt-14 lg:pt-0">
          {children}
        </main>
      </div>
    </div>
  );
}
