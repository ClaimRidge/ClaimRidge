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
  const isInsurerRoute = path.startsWith("/insurer");
  const isClinicRoute = path.startsWith("/dashboard") || path.startsWith("/claims");
  const isAuthPage = path === "/login" || path === "/signup";

  // Protected routes — redirect to login if not authenticated
  if (!user && (isClinicRoute || isInsurerRoute)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user) {
    // Helper: check if user is an insurer
    const { data: insurerProfile } = await supabase
      .from("insurer_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    const isInsurer = !!insurerProfile;

    // Redirect authenticated users away from auth pages to their dashboard
    if (isAuthPage) {
      const url = request.nextUrl.clone();
      url.pathname = isInsurer ? "/insurer/dashboard" : "/dashboard";
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
      url.pathname = "/insurer/dashboard";
      return NextResponse.redirect(url);
    }
  }

  return response;
}
