import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
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
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: "", ...options });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isInsurerRoute = path.startsWith("/dashboard/insurance");
  const isClinicRoute = (path.startsWith("/dashboard") && !isInsurerRoute) || path.startsWith("/claims");
  const isAuthPage = path === "/login" || path === "/signup";

  // Protected routes — redirect to login if not authenticated
  if (!user && (isClinicRoute || isInsurerRoute)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("insurer_id, role")
      .eq("id", user.id)
      .maybeSingle();

    const isInsurer = !!profile?.insurer_id;
    const isDoctor = profile?.role === "doctor";
    const hasFinishedOnboarding = isInsurer || isDoctor;

    // Enforce onboarding for all protected routes if not finished
    if ((isInsurerRoute || isClinicRoute) && !hasFinishedOnboarding && path !== "/onboarding") {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding";
      return NextResponse.redirect(url);
    }

    // Redirect authenticated users away from auth pages
    if (isAuthPage) {
      const url = request.nextUrl.clone();
      if (isInsurer) url.pathname = "/dashboard/insurance";
      else if (isDoctor) url.pathname = "/dashboard/doctor";
      else url.pathname = "/onboarding"; // Default to onboarding if not finished
      return NextResponse.redirect(url);
    }

    // Prevent clinic users from accessing insurer routes
    if (isInsurerRoute && !isInsurer) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }

    // Prevent insurer users from accessing clinic routes
    if (isClinicRoute && isInsurer) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard/insurance";
      return NextResponse.redirect(url);
    }
  }

  return response;
}
