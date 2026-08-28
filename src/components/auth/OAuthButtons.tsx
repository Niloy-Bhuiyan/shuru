"use client";

/**
 * Google / GitHub sign-in.
 *
 * Renders nothing unless a provider is switched on via env, so the UI never
 * offers a button that would fail on click — the client secrets live in the
 * Supabase dashboard, and a provider that isn't configured there returns an
 * error instead of a consent screen.
 */

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { enabledOAuthProviders, siteUrl, type OAuthProvider } from "@/lib/auth/config";
import { useLang } from "@/lib/i18n";
import { cx } from "@/lib/cx";

const LABELS: Record<OAuthProvider, string> = {
  google: "GOOGLE",
  github: "GITHUB",
};

export function OAuthButtons({ next = "/radar" }: { next?: string }) {
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
      const { error } = await sb.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
        },
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
        {providers.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => signIn(p)}
            disabled={busy !== null}
            className={cx(
              "w-full border-3 border-ink bg-paper px-4 py-3 text-center",
              "font-mono text-xs font-bold uppercase tracking-widest text-ink",
              "shadow-pixel-sm active:translate-x-[2px] active:translate-y-[2px]",
              "active:shadow-pixel-none disabled:opacity-60"
            )}
          >
            {busy === p ? "…" : `${t("auth.continueWith")} ${LABELS[p]}`}
          </button>
        ))}
      </div>

      {error && (
        <p className="border-3 border-alert bg-paper p-2 font-mono text-xs font-bold text-alertInk">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2" aria-hidden>
        <span className="h-[3px] flex-1 bg-ink/20" />
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-grey">
          {t("auth.orEmail")}
        </span>
        <span className="h-[3px] flex-1 bg-ink/20" />
      </div>
    </div>
  );
}

export default OAuthButtons;
