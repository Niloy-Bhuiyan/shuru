"use client";

/**
 * VERIFY EMAIL — shown after registration when the account is not yet
 * confirmed, and reachable from the profile screen.
 *
 * Confirmation itself happens through the emailed link, which lands on
 * /auth/callback. This screen only explains the state and offers a resend.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { SunriseHeader } from "@/components/SunriseHeader";
import { PixelSun } from "@/components/PixelSun";
import { PixelButton } from "@/components/pixel/PixelButton";
import { supabaseBrowser } from "@/lib/supabase/client";
import { siteUrl } from "@/lib/auth/config";
import { useLang } from "@/lib/i18n";

export default function VerifyEmailPage() {
  const { t } = useLang();
  const [email, setEmail] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sb = supabaseBrowser();
        const { data } = await sb.auth.getUser();
        if (cancelled) return;
        setEmail(data.user?.email ?? null);
        setVerified(Boolean(data.user?.email_confirmed_at));
      } catch {
        /* unauthenticated — the resend form simply won't have an address */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function resend() {
    if (busy || !email) return;
    setBusy(true);
    setError(null);
    try {
      const sb = supabaseBrowser();
      const { error } = await sb.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: `${siteUrl()}/auth/callback?next=/radar` },
      });
      if (error) {
        setError(
          /rate|limit|too many/i.test(error.message)
            ? t("auth.errRateLimit")
            : t("auth.errGeneric")
        );
        return;
      }
      setSent(true);
    } catch {
      setError(t("auth.errGeneric"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SunriseHeader />
      <main className="px-4 pb-16 pt-6">
        <div className="mb-5 flex items-end gap-3">
          <PixelSun width={44} />
          <div>
            <h1 className="font-pixel text-sm text-ink">
              {t("auth.verifyTitle")}
            </h1>
            <p className="mt-1 font-mono text-xs text-grey">{t("tagline")}</p>
          </div>
        </div>

        {verified ? (
          <div className="space-y-4">
            <p className="border-3 border-ink bg-mint p-3 font-mono text-xs font-bold text-ink shadow-pixel-sm">
              ✓ {email}
            </p>
            <Link href="/radar" className="block">
              <PixelButton full size="lg">
                {t("nav.radar")} →
              </PixelButton>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="border-3 border-ink bg-paper p-3 font-mono text-xs text-ink shadow-pixel-sm">
              {t("auth.verifyBody")}
              {email && (
                <span className="mt-2 block font-bold text-amberInk">{email}</span>
              )}
            </p>
            <p className="font-mono text-xs text-grey">{t("auth.verifyWhy")}</p>

            {sent ? (
              <p className="border-3 border-ink bg-mint p-3 font-mono text-xs font-bold text-ink shadow-pixel-sm">
                {t("auth.resent")}
              </p>
            ) : (
              <PixelButton
                full
                size="lg"
                variant="secondary"
                onClick={resend}
                disabled={busy || !email}
              >
                {busy ? "…" : t("auth.resend")}
              </PixelButton>
            )}

            {error && (
              <p className="border-3 border-alert bg-paper p-2 font-mono text-xs font-bold text-alert">
                {error}
              </p>
            )}

            <p className="text-center font-mono text-xs text-ink">
              <Link href="/radar" className="inline-block py-1.5 font-bold text-amberInk underline">
                {t("nav.radar")} →
              </Link>
            </p>
          </div>
        )}
      </main>
    </>
  );
}
