import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/auth/config";
import { buildCsp } from "@/lib/auth/csp";

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
  // Billing. Signed-in only — there is nothing to buy without an account, and
  // the checkout return lands under it too.
  "/pro",
  // AI web discovery. Signed-in because the search is built from the caller's
  // own profile, and Pro-gated again in the route handler.
  "/discover",
  "/verify-email",
  // Requires a session but NOT a profile — it is where a profile is created.
  // Must never be listed as public, or middleware would bounce the very users
  // who need it back to /radar.
  "/onboarding",
];
const EMPLOYER_ROUTES = ["/employer"];
const ADMIN_ROUTES = ["/admin"];

/**
 * Routes reachable while signed out, from which an ALREADY signed-in user is
 * bounced to /radar — there is nothing for them on a login form.
 *
 * "/" is the public landing page. It belongs here rather than doing its own
 * session check in the page: this middleware has already called getUser() for
 * every request that reaches it, so guarding "/" here costs nothing, while a
 * server component doing it again would repeat the round trip and put
 * `next/headers` into a route that is otherwise static.
 *
 * `matches()` appends a slash before testing prefixes, so "/" here means the
 * root exactly — "//" prefixes nothing real — and never the whole site.
 */
const PUBLIC_ROUTES = ["/", "/login", "/register", "/forgot-password"];

/**
 * Reachable signed out AND signed in.
 *
 * /reset-password has to be here, and it is not an edge case: a Supabase
 * recovery link works by ESTABLISHING a session, because updateUser() needs
 * one to set the new password. So the user arriving at this form is always
 * authenticated by the time they get here.
 *
 * While it sat in PUBLIC_ROUTES the rule below bounced them straight to
 * /radar, and the password could never be changed — clicking the reset link
 * just silently logged you in. Reported from production.
 */
const SIGNED_IN_OK_ROUTES = ["/reset-password"];

function matches(path: string, routes: string[]): boolean {
  return routes.some((r) => path === r || path.startsWith(r + "/"));
}

export async function middleware(request: NextRequest) {
  /*
   * CSP lives here rather than in next.config.mjs because it depends on the
   * environment (dev needs 'unsafe-eval' for HMR) and on the Supabase URL.
   *
   * There is deliberately no nonce: Next 16's production build does not stamp
   * one onto its scripts, and a nonce present in script-src makes browsers
   * ignore 'unsafe-inline', which breaks hydration outright. Read the header
   * of lib/auth/csp.ts before changing this — it was measured.
   */
  const csp = buildCsp(process.env.NODE_ENV !== "production");

  const withCsp = <T extends NextResponse>(res: T): T => {
    res.headers.set("content-security-policy", csp);
    return res;
  };

  if (!isSupabaseConfigured()) {
    return withCsp(NextResponse.next({ request }));
  }

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
    return withCsp(NextResponse.redirect(url));
  }

  if (user && matches(path, PUBLIC_ROUTES) && !matches(path, SIGNED_IN_OK_ROUTES)) {
    const url = request.nextUrl.clone();
    url.pathname = "/radar";
    url.search = "";
    return withCsp(NextResponse.redirect(url));
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
      return withCsp(NextResponse.redirect(url));
    }
  }

  return withCsp(response);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|auth/callback|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
