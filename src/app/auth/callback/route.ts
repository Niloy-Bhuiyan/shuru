import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/auth/config";
import { homeForRole } from "@/lib/auth/postSignIn";

/**
 * OAuth + email-link landing point.
 *
 * Supabase redirects here after Google/GitHub sign-in, email confirmation and
 * password-reset links, carrying a one-time `code` to exchange for a session.
 *
 * `next` controls where the user lands afterwards. It is validated as a
 * same-origin relative path, because an attacker who can craft the callback
 * URL would otherwise have an open redirect.
 *
 * ── Role-based landing applies HERE too ───────────────────────────────────
 *
 * It did not, and that was a real bug with a very confusing symptom: an admin
 * who signs in with Google always landed on /radar and could not reach /admin
 * at all.
 *
 * The password form resolves its own destination — it reads `user_roles` and
 * calls `homeForRole` — so `homeForRole` looked wired up. But OAuth does not
 * go through that form. It goes through this route, which honoured whatever
 * `next` it was handed, and the sign-in buttons handed it a hardcoded
 * "/radar". Two sign-in paths, one of which quietly ignored the rule.
 *
 * Since `60546c0` removed the operator entry points from the student app,
 * role-based landing is the ONLY route into the console. So for an account
 * created through Google — which is how the owner's admin account was made —
 * the admin area was unreachable through the UI entirely.
 *
 * The resolution belongs in this route rather than in the buttons: the role
 * is only knowable after the code exchange, and this is the one place every
 * provider and every email link passes through.
 */

/**
 * The caller's requested destination, or null if they did not ask for one.
 *
 * The null case is the point. This used to fall back to "/radar" for a missing
 * param, which made "no preference" indistinguishable from "explicitly wants
 * radar" — and that collapse is what hid the bug above. Absent now means
 * absent, so the role gets to decide.
 */
function explicitNext(raw: string | null): string | null {
  if (!raw) return null;
  // must be a relative path, and not protocol-relative ("//evil.com")
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const requested = explicitNext(searchParams.get("next"));

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
  const { data, error } = await sb.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`
    );
  }

  // An explicit ?next= always wins: middleware sets it when it bounces someone
  // off a page they asked for, and overriding it would lose what they were
  // doing. Only when nothing was requested does the role choose.
  let target = requested;
  if (!target) {
    /*
     * `user_roles_select_own` (migration 0002) lets a signed-in user read
     * their own row, so this needs no elevated client. A failure here must
     * NOT strand the sign-in that just succeeded — `homeForRole(undefined)`
     * returns /radar, so the worst case is the old behaviour rather than an
     * error page for someone who authenticated correctly.
     */
    const userId = data.user?.id;
    if (userId) {
      const { data: roleRow } = await sb
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();
      target = homeForRole(roleRow?.role as string | undefined);
    } else {
      target = homeForRole(undefined);
    }
  }

  return NextResponse.redirect(`${origin}${target}`);
}
