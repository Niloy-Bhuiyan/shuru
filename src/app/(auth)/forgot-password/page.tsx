"use client";

/**
 * FORGOT PASSWORD — request a reset link.
 *
 * The success message is deliberately the same whether or not the address has
 * an account: telling an anonymous visitor which emails are registered is an
 * account-enumeration leak.
 */

import { useState } from "react";
import Link from "next/link";
import { SunriseHeader } from "@/components/SunriseHeader";
import { PixelSun } from "@/components/PixelSun";
import { PixelButton } from "@/components/pixel/PixelButton";
import { PixelInput } from "@/components/pixel/PixelInput";
import { supabaseBrowser } from "@/lib/supabase/client";
import { siteUrl } from "@/lib/auth/config";
import { useLang } from "@/lib/i18n";

export default function ForgotPasswordPage() {
  const { t } = useLang();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    if (busy || !email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const sb = supabaseBrowser();
      const { error } = await sb.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${siteUrl()}/auth/callback?next=/reset-password`,
      });
      // Rate limiting is the one failure worth surfacing — it tells the user
      // to wait rather than retry into a wall.
      if (error && /rate|limit|too many/i.test(error.message)) {
        setError(t("auth.errRateLimit"));
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
      <main className="mx-auto w-full max-w-[440px] px-4 pb-16 pt-6">
        <div className="mb-5 flex items-end gap-3">
          <PixelSun width={44} />
          <div>
            <h1 className="font-pixel text-sm text-ink">
              {t("auth.forgotTitle")}
            </h1>
            <p className="mt-1 font-mono text-xs text-grey">{t("tagline")}</p>
          </div>
        </div>

        {sent ? (
          <div className="space-y-4">
            <p className="border-3 border-ink bg-mint p-3 font-mono text-xs font-bold text-ink shadow-pixel-sm">
              {t("auth.resetSent")}
            </p>
            <Link href="/login" className="block">
              <PixelButton full size="lg" variant="secondary">
                {t("auth.login")} →
              </PixelButton>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="font-mono text-xs text-ink">{t("auth.forgotBody")}</p>
            <PixelInput
              label={t("auth.email")}
              name="email"
              type="email"
              value={email}
              onChange={setEmail}
              required
              placeholder="you@university.edu"
              error={error ?? undefined}
            />
            <PixelButton full size="lg" onClick={onSubmit} disabled={busy}>
              {busy ? "…" : t("auth.sendReset")}
            </PixelButton>
            <p className="text-center font-mono text-xs text-ink">
              <Link href="/login" className="inline-block py-1.5 font-bold text-amberInk underline">
                {t("auth.login")}
              </Link>
            </p>
          </div>
        )}
      </main>
    </>
  );
}
