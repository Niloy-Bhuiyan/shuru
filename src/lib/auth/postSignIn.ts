/**
 * Where to go once a session has just been created, and how to get there.
 *
 * THE BUG THIS EXISTS TO PREVENT
 *
 * `supabase.auth.signInWithPassword()` resolves as soon as the token request
 * succeeds, and `@supabase/ssr` writes the session into cookies. Following it
 * with `router.replace("/radar")` — a CLIENT-side navigation — then races that
 * cookie write: Next asks the server for the new route, `middleware.ts` calls
 * `supabase.auth.getUser()`, sees no session yet, and redirects straight back
 * to `/login?next=/radar`.
 *
 * The user experience is the worst possible one: the credentials were correct,
 * the session cookie really was created, and the screen just sits there on the
 * login form with no error. It looks like the button is dead. It happened on
 * production and cost hours to track down, because every individual piece —
 * the password, the token endpoint, the cookie, the guard — tested fine on its
 * own.
 *
 * A full document navigation removes the race by construction: the browser
 * sends the freshly-written cookie with a real request, and middleware sees
 * the session on the first try. A hard reload after sign-in is not a cost
 * worth optimising away — it happens once, and it is the moment correctness
 * matters most.
 */

/**
 * A redirect target that cannot leave this origin.
 *
 * Mirrors `safeNext` in src/app/auth/callback/route.ts. `?next=` arrives from
 * middleware, but a crafted link could put anything there, so an absolute or
 * protocol-relative URL is discarded rather than followed.
 */
export function safeInternalPath(raw: string | null | undefined): string {
  if (!raw) return "/radar";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/radar";
  return raw;
}

/**
 * Navigate after a session has just been created.
 *
 * Deliberately `window.location.assign`, NOT `router.replace` — see above.
 * `assign` rather than `replace` so the browser back button still works.
 */
export function goAfterSignIn(next?: string | null): void {
  window.location.assign(safeInternalPath(next));
}
