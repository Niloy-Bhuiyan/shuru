/**
 * Content-Security-Policy.
 *
 * ── WHY script-src CARRIES 'unsafe-inline', STATED HONESTLY ────────────────
 *
 * A nonce-based policy was built first and did not work, for a reason worth
 * recording so nobody spends the afternoon again:
 *
 *   Next 16's Turbopack production build emits TWO load-bearing inline
 *   <script> tags and every chunk <script src> with NO nonce attribute at
 *   all, even when the nonce is supplied on the Content-Security-Policy
 *   request header the way the docs describe. It works in `next dev` and not
 *   in `next build`. Measured, not assumed: with
 *   `script-src 'self' 'nonce-…'` the browser reported "Executing inline
 *   script violates the following Content Security Policy directive" and the
 *   page died with React error #412 — a hydration failure. The login form
 *   never rendered.
 *
 * `'strict-dynamic'` makes it worse rather than better: it tells the browser
 * to IGNORE 'self', so the un-nonced chunk tags are blocked too.
 *
 * And a nonce cannot be kept "for later" alongside 'unsafe-inline': the
 * presence of a nonce in script-src causes browsers to ignore 'unsafe-inline'
 * entirely, which is exactly the broken state above. It is one or the other.
 *
 * ── SO WHAT IS THIS POLICY WORTH? ─────────────────────────────────────────
 *
 * Less than a nonce policy, and considerably more than nothing. Be precise
 * about which half is which:
 *
 *   NOT prevented — an injected <script> still executes. `script-src` is not
 *   doing real work here, and no header dump should be read as if it is.
 *
 *   Prevented — what that script can then DO. `connect-src` names the only
 *   origins it may talk to, so a stolen session cannot be posted to an
 *   attacker's server. `form-action` stops a planted form from submitting
 *   credentials off-origin. `base-uri` stops a <base> tag redirecting every
 *   relative URL on the page. `object-src 'none'` removes the plugin vectors.
 *   `frame-ancestors 'none'` is the modern clickjacking control.
 *
 * Containment, not prevention. That is a real security property and it is the
 * one available on this framework version today.
 *
 * ── THE UPGRADE PATH ──────────────────────────────────────────────────────
 *
 * When Next's production build stamps nonces onto its scripts, delete
 * `'unsafe-inline'` from script-src, add `'nonce-…'` and `'strict-dynamic'`,
 * and re-run the check in `.local-scripts/csptest.mjs` — hydration failing is
 * silent in a header dump and loud in the browser console. `csp.test.ts`
 * pins the directives that must not regress in the meantime.
 */

export function buildCsp(isDev: boolean): string {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  // Realtime uses a websocket on the same host.
  const supabaseWs = supabase.replace(/^https:/, "wss:");

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],

    // See the header. 'unsafe-eval' is additionally required by the dev HMR
    // runtime and is never emitted in production.
    "script-src": ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : [])],

    // Inline STYLE ATTRIBUTES are unavoidable — sizing an SVG with
    // style={{ width }} is a style attribute. This permits inline CSS, not
    // inline script.
    "style-src": ["'self'", "'unsafe-inline'"],

    // Avatars come from Google's CDN after OAuth; company logos are arbitrary
    // remote URLs. data:/blob: cover generated previews such as the resume PDF.
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:"],

    // THE LOAD-BEARING DIRECTIVE. This is what contains a successful
    // injection: it can run, but it can only reach these origins, so it
    // cannot exfiltrate a session.
    "connect-src": ["'self'", supabase, supabaseWs].filter(Boolean),

    "worker-src": ["'self'", "blob:"],
    "frame-src": ["'self'", "blob:"],

    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };

  const parts = Object.entries(directives).map(([k, v]) => `${k} ${v.join(" ")}`);
  if (!isDev) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}
