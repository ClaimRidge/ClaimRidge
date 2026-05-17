import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: "", ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isInsuranceRoute = path.startsWith("/dashboard/insurance");
  const isProviderRoute  = path.startsWith("/dashboard/provider");
  const isDoctorRoute    = path.startsWith("/dashboard/doctor");
  const isAdminRoute     = path.startsWith("/dashboard/admin");
  const isAnyDashboard   = path.startsWith("/dashboard") || path.startsWith("/claims");
  const isAuthPage       = path === "/login" || path === "/signup";

  // Not authenticated + protected route → /login
  if (!user && isAnyDashboard) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("account_type, approved")
      .eq("id", user.id)
      .maybeSingle();

    const accountType = profile?.account_type as
      | "provider" | "doctor" | "insurance" | "admin" | null | undefined;
    const approved = profile?.approved || accountType === "admin";
    const hasFinishedOnboarding = !!accountType;

    // Onboarding gate — needs setup, but only stop them on protected routes.
    // Do NOT redirect on /onboarding itself (otherwise loop) or /auth/callback.
    if (
      isAnyDashboard &&
      !hasFinishedOnboarding &&
      path !== "/onboarding"
    ) {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding";
      return NextResponse.redirect(url);
    }

    // Waitlist approval gate
    if (
      isAnyDashboard &&
      hasFinishedOnboarding &&
      !approved &&
      path !== "/waitlist-pending"
    ) {
      const url = request.nextUrl.clone();
      url.pathname = "/waitlist-pending";
      return NextResponse.redirect(url);
    }

    // Bounce authenticated users away from /login or /signup.
    if (isAuthPage) {
      const url = request.nextUrl.clone();
      if (accountType === "insurance") url.pathname = "/dashboard/insurance";
      else if (accountType === "provider") url.pathname = "/dashboard/provider";
      else if (accountType === "doctor") url.pathname = "/dashboard/doctor";
      else if (accountType === "admin") url.pathname = "/dashboard/admin";
      else url.pathname = "/onboarding";
      return NextResponse.redirect(url);
    }

    // Cross-role isolation: a user can only enter their own dashboard tree.
    if (accountType && isAnyDashboard) {
      const onWrongTree =
        (isInsuranceRoute && accountType !== "insurance") ||
        (isProviderRoute  && accountType !== "provider")  ||
        (isDoctorRoute    && accountType !== "doctor")    ||
        (isAdminRoute     && accountType !== "admin");
      if (onWrongTree) {
        const url = request.nextUrl.clone();
        if (accountType === "insurance") url.pathname = "/dashboard/insurance";
        else if (accountType === "provider") url.pathname = "/dashboard/provider";
        else if (accountType === "doctor") url.pathname = "/dashboard/doctor";
        else url.pathname = "/dashboard/admin";
        return NextResponse.redirect(url);
      }
    }
  }

  return response;
}
