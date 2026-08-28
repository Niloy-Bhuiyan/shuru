"use client";

/**
 * RESET PASSWORD — set a new password.
 *
 * Reached from the emailed link, which lands on /auth/callback first; that
 * route exchanges the one-time code for a session and forwards here. So a
 * valid visitor already has a session, and updateUser() is the whole update.
 * No session means the link was invalid, expired, or already used.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SunriseHeader } from "@/components/SunriseHeader";
import { PixelSun } from "@/components/PixelSun";
import { PixelButton } from "@/components/pixel/PixelButton";
import { PixelInput } from "@/components/pixel/PixelInput";
import { LoadingBlock } from "@/components/LoadingBlock";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLang } from "@/lib/i18n";

const MIN_PASSWORD = 8;

export default function ResetPasswordPage() {
  const router = useRouter();
  const { t } = useLang();

  const [checking, setChecking] = useState(true);
  const [valid, setValid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sb = supabaseBrowser();
        const { data } = await sb.auth.getUser();
        if (!cancelled) setValid(Boolean(data.user));
      } catch {
        if (!cancelled) setValid(false);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit() {
    if (busy) return;
    if (password.length < MIN_PASSWORD) {
      setError(t("auth.errPw"));
      return;
    }
    if (password !== confirm) {
      setError(t("auth.errPwMatch"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const sb = supabaseBrowser();
      const { error } = await sb.auth.updateUser({ password });
      if (error) {
        setError(t("auth.errGeneric"));
        return;
      }
      setDone(true);
      router.replace("/radar");
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
              {t("auth.resetTitle")}
            </h1>
            <p className="mt-1 font-mono text-xs text-grey">{t("tagline")}</p>
          </div>
        </div>

        {checking ? (
          <LoadingBlock />
        ) : !valid ? (
          <div className="space-y-4">
            <p className="border-3 border-alert bg-paper p-3 font-mono text-xs font-bold text-alert shadow-pixel-sm">
              {t("auth.resetInvalid")}
            </p>
            <Link href="/forgot-password" className="block">
              <PixelButton full size="lg">
                {t("auth.sendReset")} →
              </PixelButton>
            </Link>
          </div>
        ) : done ? (
          <p className="border-3 border-ink bg-mint p-3 font-mono text-xs font-bold text-ink shadow-pixel-sm">
            {t("auth.resetDone")}
          </p>
        ) : (
          <div className="space-y-4">
            <PixelInput
              label={t("auth.newPassword")}
              name="password"
              type="password"
              value={password}
              onChange={setPassword}
              required
              hint={t("auth.pwHint")}
            />
            <PixelInput
              label={t("auth.confirmPassword")}
              name="confirm"
              type="password"
              value={confirm}
              onChange={setConfirm}
              required
              error={error ?? undefined}
            />
            <PixelButton full size="lg" onClick={onSubmit} disabled={busy}>
              {busy ? "…" : t("auth.updatePassword")}
            </PixelButton>
          </div>
        )}
      </main>
    </>
  );
}
