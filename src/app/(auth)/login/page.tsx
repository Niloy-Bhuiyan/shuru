"use client";

/**
 * LOGIN. Demo mode: device profile is the "account" — offer to open Radar
 * or create the profile. Supabase mode: email + password with pixel errors;
 * attaches a parked onboarding profile on first confirmed login.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SunriseHeader } from "@/components/SunriseHeader";
import { PixelSun } from "@/components/PixelSun";
import { PixelButton } from "@/components/pixel/PixelButton";
import { PixelInput } from "@/components/pixel/PixelInput";
import { getProfile, isDemoMode, saveProfile } from "@/lib/data";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLang } from "@/lib/i18n";
import type { Profile } from "@/lib/types";

const PENDING_PROFILE_KEY = "shuru.pendingProfile";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useLang();
  const demo = isDemoMode();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hasDeviceProfile, setHasDeviceProfile] = useState(false);

  useEffect(() => {
    if (demo) getProfile().then((p) => setHasDeviceProfile(!!p));
  }, [demo]);

  async function onSubmit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const sb = supabaseBrowser();
      const { data, error } = await sb.auth.signInWithPassword({
        email,
        password,
      });
      if (error || !data.user) {
        setError(t("auth.errCreds"));
        return;
      }
      // First login after email confirmation: attach the parked profile.
      const existing = await getProfile();
      if (!existing) {
        const raw = window.localStorage.getItem(PENDING_PROFILE_KEY);
        if (raw) {
          const pending = JSON.parse(raw) as Profile;
          await saveProfile({ ...pending, user_id: data.user.id });
          window.localStorage.removeItem(PENDING_PROFILE_KEY);
        }
      }
      router.replace("/radar");
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
            <h1 className="font-pixel text-sm text-ink">{t("auth.login")}</h1>
            <p className="mt-1 font-mono text-xs text-grey">{t("tagline")}</p>
          </div>
        </div>

        {demo ? (
          <div className="space-y-4">
            <p className="border-3 border-ink bg-mint p-3 font-mono text-xs font-bold text-ink shadow-pixel-sm">
              {t("auth.demoNote")}
            </p>
            {hasDeviceProfile ? (
              <PixelButton full size="lg" onClick={() => router.replace("/radar")}>
                {t("nav.radar")} →
              </PixelButton>
            ) : (
              <PixelButton full size="lg" onClick={() => router.push("/register")}>
                {t("auth.register")} →
              </PixelButton>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <PixelInput label={t("auth.email")} name="email" type="email" value={email} onChange={setEmail} required placeholder="you@university.edu" />
            <PixelInput label={t("auth.password")} name="password" type="password" value={password} onChange={setPassword} required error={error ?? undefined} />
            <PixelButton full size="lg" onClick={onSubmit} disabled={busy}>
              {busy ? "…" : t("auth.login")}
            </PixelButton>
            <p className="text-center font-mono text-xs text-ink">
              {t("auth.noAccount")}{" "}
              <Link href="/register" className="font-bold text-amber underline">
                {t("auth.register")}
              </Link>
            </p>
          </div>
        )}
      </main>
    </>
  );
}
