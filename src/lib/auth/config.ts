/**
 * Configuration detection.
 *
 * Shuru is a database-backed product. Rather than simulating a backend when
 * Supabase is absent, the app reports that it is not configured and stops —
 * a running instance always means a real database is behind it.
 *
 * Deliberately framework-agnostic and NOT a client module: it reads only
 * public env vars, so route handlers and middleware can import it too.
 */

/** A value that is present and not an unfilled template placeholder. */
function isSet(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim();
  if (v === "") return false;
  return !v.startsWith("YOUR_") && !v.includes("_HERE");
}

export function isSupabaseConfigured(): boolean {
  return (
    isSet(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    isSet(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
}

/**
 * Absolute origin of this deployment, used to build OAuth callbacks and the
 * links inside verification / password-reset emails. Falls back to the
 * browser's own origin so local development works without configuration;
 * on the server it must be set explicitly.
 */
export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (isSet(configured)) return configured!.replace(/\/$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "http://localhost:3000";
}

export type OAuthProvider = "google" | "github";

/**
 * Which OAuth buttons to render. The client secrets live in the Supabase
 * dashboard, not here — these flags exist so the UI never offers a provider
 * that would fail on click.
 */
export function enabledOAuthProviders(): OAuthProvider[] {
  const providers: OAuthProvider[] = [];
  if (process.env.NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED === "true") {
    providers.push("google");
  }
  if (process.env.NEXT_PUBLIC_OAUTH_GITHUB_ENABLED === "true") {
    providers.push("github");
  }
  return providers;
}
