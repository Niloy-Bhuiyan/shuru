import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/auth/config";

/**
 * Session refresh + role-aware route guard.
 *
 * This is a UX and defence-in-depth layer, not the authorization boundary —
 * a direct API call bypasses middleware entirely. Row Level Security in
 * Postgres is the real boundary, and route handlers re-check roles via
 * lib/auth/session before any privileged mutation.
 *
 * With no Supabase project configured there is nothing to guard: every page
 * renders its own "not configured" state, so the middleware steps aside.
 */

const STUDENT_ROUTES = [
  "/radar",
  "/saved",
  "/vault",
  "/you",
  "/opportunity",
  "/mentors",
  "/forge",
  "/agent",
  "/notifications",
  "/verify-email",
  // Requires a session but NOT a profile — it is where a profile is created.
  // Must never be listed as public, or middleware would bounce the very users
  // who need it back to /radar.
  "/onboarding",
];
const EMPLOYER_ROUTES = ["/employer"];
const ADMIN_ROUTES = ["/admin"];

/** Routes reachable while signed out. */
const PUBLIC_ROUTES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
];

function matches(path: string, routes: string[]): boolean {
  return routes.some((r) => path === r || path.startsWith(r + "/"));
}

export async function middleware(request: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const needsAuth =
    matches(path, STUDENT_ROUTES) ||
    matches(path, EMPLOYER_ROUTES) ||
    matches(path, ADMIN_ROUTES);

  if (!user && needsAuth) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // come back here after signing in
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (user && matches(path, PUBLIC_ROUTES)) {
    const url = request.nextUrl.clone();
    url.pathname = "/radar";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Role gates. Only queried for the two role-scoped areas, so ordinary
  // student navigation costs no extra round trip.
  if (user && (matches(path, EMPLOYER_ROUTES) || matches(path, ADMIN_ROUTES))) {
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    const role = roleRow?.role ?? "student";

    const allowed =
      role === "admin" ||
      (role === "employer" && matches(path, EMPLOYER_ROUTES));

    if (!allowed) {
      const url = request.nextUrl.clone();
      url.pathname = "/radar";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|auth/callback|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
