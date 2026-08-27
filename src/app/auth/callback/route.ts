import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/auth/config";

/**
 * OAuth + email-link landing point.
 *
 * Supabase redirects here after Google/GitHub sign-in, email confirmation and
 * password-reset links, carrying a one-time `code` to exchange for a session.
 *
 * `next` controls where the user lands afterwards. It is validated as a
 * same-origin relative path, because an attacker who can craft the callback
 * URL would otherwise have an open redirect.
 */

function safeNext(raw: string | null): string {
  if (!raw) return "/radar";
  // must be a relative path, and not protocol-relative ("//evil.com")
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/radar";
  return raw;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  // Supabase reports provider-side failures as query params, not exceptions.
  const authError =
    searchParams.get("error_description") ?? searchParams.get("error");
  if (authError) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(authError)}`
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(`${origin}/login?error=not_configured`);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const sb = await supabaseServer();
  const { error } = await sb.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`
    );
  }

  return NextResponse.redirect(`${origin}${next}`);
}
