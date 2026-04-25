"use client";
// Force re-build


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
  Building2,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard/insurance", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/insurance/claims", label: "Claims", icon: FileSearch },
  { href: "/dashboard/insurance/policies", label: "Policies", icon: Scale },
  { href: "/dashboard/insurance/providers", label: "Providers", icon: Users },
  { href: "/dashboard/insurance/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/insurance/fraud", label: "Fraud Detection", icon: ShieldAlert },
  { href: "/dashboard/insurance/payments", label: "Payments", icon: Building2 },
  { href: "/dashboard/insurance/appeals", label: "Appeals", icon: Scale },
  { href: "/dashboard/insurance/audit", label: "Compliance", icon: ShieldAlert },
  { href: "/dashboard/insurance/settings", label: "Settings", icon: Settings },
];

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

      if (!user) {
        router.push("/login");
        return;
      }

      setUser(user);

      const { data: profile } = await supabase
        .from("insurer_profiles")
        .select("company_name")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!profile) {
        router.push("/dashboard");
        return;
      }

      setCompanyName(profile.company_name);
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

  // Hide the main navbar and footer when insurer layout is active
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
        <div className="animate-spin h-8 w-8 border-4 border-[#0A1628] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f9fafb] flex">
      {/* Sidebar - Desktop */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 bg-[#0A1628] text-white">
        <div className="p-5 border-b border-white/10">
          <Link href="/dashboard/insurance">
            <ClaimRidgeLogo size={28} variant="dark" />
          </Link>
        </div>

        <div className="px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-[#16a34a]" />
            <span className="text-sm font-medium text-white/90 truncate">{companyName}</span>
          </div>
          <p className="text-xs text-white/50 mt-0.5 truncate">{user?.email}</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-white/10 text-white"
                    : "text-white/60 hover:text-white hover:bg-white/5"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10">
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors w-full"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-[#0A1628] text-white px-4 h-14 flex items-center justify-between">
        <Link href="/dashboard/insurance">
          <ClaimRidgeLogo size={24} variant="dark" />
        </Link>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1">
          {sidebarOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="absolute left-0 top-14 bottom-0 w-64 bg-[#0A1628] text-white p-4 space-y-1">
            <div className="pb-3 mb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-[#16a34a]" />
                <span className="text-sm font-medium truncate">{companyName}</span>
              </div>
              <p className="text-xs text-white/50 mt-0.5 truncate">{user?.email}</p>
            </div>
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-white/10 text-white"
                      : "text-white/60 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors w-full px-3 py-2.5 mt-4"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 lg:overflow-y-auto pt-14 lg:pt-0">
        {children}
      </main>
    </div>
  );
}
