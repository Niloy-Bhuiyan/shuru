import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Service-role Supabase client — bypasses RLS. Used ONLY by trusted server
 * routes that must write shared tables the anon key can't (e.g. /api/ingest
 * upserting `opportunities`, which has a SELECT-only policy).
 *
 * SUPABASE_SERVICE_ROLE_KEY is server-only and MUST NEVER be exposed with a
 * NEXT_PUBLIC_ prefix. Throws loudly if it (or the URL) is missing so a real
 * deployment fails with an actionable message instead of a silent RLS block.
 */
export function supabaseServiceRole() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY (and NEXT_PUBLIC_SUPABASE_URL) must be set for " +
        "server-side ingestion in Supabase mode. Add it to your server env — " +
        "it is secret and must never use a NEXT_PUBLIC_ prefix."
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Server Supabase client (route handlers / server components).
 *
 * Async because `cookies()` became async in Next 15 — it is a request-scoped
 * dynamic API now, not a synchronous read. Every caller must await this.
 */
export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — safe to ignore, middleware
            // refreshes sessions.
          }
        },
      },
    }
  );
}
