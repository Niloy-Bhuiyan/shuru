"use client";

/**
 * Google / GitHub sign-in.
 *
 * Renders nothing unless a provider is switched on via env, so the UI never
 * offers a button that would fail on click -- the client secrets live in the
 * Supabase dashboard, and a provider that isn't configured there returns an
 * error instead of a consent screen.
 *
 * The buttons carry the providers' real marks. Both companies ask for this
 * and both are right to: a sign-in button with a redrawn logo is what a
 * phishing page looks like, and this is the one control on the site that
 * hands a user off to somebody else's password form.
 */

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { GoogleMark, GitHubMark } from "@/components/brand/ProviderMarks";
import { enabledOAuthProviders, siteUrl, type OAuthProvider } from "@/lib/auth/config";
import { useLang } from "@/lib/i18n";
import { cx } from "@/lib/cx";

const LABELS: Record<OAuthProvider, string> = {
  google: "Google",
  github: "GitHub",
};

const MARKS: Record<OAuthProvider, React.ComponentType<{ size?: number }>> = {
  google: GoogleMark,
  github: GitHubMark,
};

/**
 * `next` is optional and stays UNSET when the caller has no specific
 * destination in mind. It used to default to "/radar", which meant every OAuth
 * sign-in told the callback route exactly where to go — and so the callback
 * never got to apply role-based landing, stranding admins and employers on the
 * student feed. See the note in src/app/auth/callback/route.ts.
 */
export function OAuthButtons({ next }: { next?: string | null }) {
  const { t } = useLang();
  const providers = enabledOAuthProviders();
  const [busy, setBusy] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (providers.length === 0) return null;

  async function signIn(provider: OAuthProvider) {
    if (busy) return;
    setBusy(provider);
    setError(null);
    try {
      const sb = supabaseBrowser();
      // The param is omitted entirely when there is no requested destination,
      // rather than sent empty — the callback treats absent as "you decide".
      const callback = next
        ? `${siteUrl()}/auth/callback?next=${encodeURIComponent(next)}`
        : `${siteUrl()}/auth/callback`;
      const { error } = await sb.auth.signInWithOAuth({
        provider,
        options: { redirectTo: callback },
      });
      // On success the browser navigates away, so reaching here means failure.
      if (error) {
        setError(t("auth.errGeneric"));
        setBusy(null);
      }
    } catch {
      setError(t("auth.errGeneric"));
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2">
        {providers.map((p) => {
          const Mark = MARKS[p];
          return (
            <button
              key={p}
              type="button"
              onClick={() => signIn(p)}
              disabled={busy !== null}
              className={cx(
                // 44px minimum, and the mark sits in a fixed-width slot so the
                // labels line up with each other rather than with their logos.
                "flex min-h-[44px] w-full items-center justify-center gap-3 rounded-lg",
                "border border-ui-lineStrong bg-paper px-4 py-2.5",
                "font-sans text-[14px] font-medium text-ink",
                "transition-colors duration-150 hover:bg-cream",
                "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-paper"
              )}
            >
              <span className="flex w-[18px] shrink-0 justify-center">
                {busy === p ? (
                  <span
                    aria-hidden="true"
                    className="block h-[14px] w-[14px] animate-spin rounded-full border-2 border-ui-lineStrong border-t-ink"
                  />
                ) : (
                  <Mark size={18} />
                )}
              </span>
              <span>
                {t("auth.continueWith")} {LABELS[p]}
              </span>
            </button>
          );
        })}
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-alert bg-alert/5 p-3 font-sans text-[13px] leading-relaxed text-alert"
        >
          {error}
        </p>
      )}

      <div className="flex items-center gap-3" aria-hidden>
        <span className="h-px flex-1 bg-ui-line" />
        <span className="font-sans text-[12px] text-ui-faint">
          {t("auth.orEmail")}
        </span>
        <span className="h-px flex-1 bg-ui-line" />
      </div>
    </div>
  );
}

export default OAuthButtons;
