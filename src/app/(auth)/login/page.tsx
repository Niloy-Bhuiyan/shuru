"use client";

/**
 * LOGIN — email + password, plus any enabled OAuth provider.
 *
 * Attaches a parked onboarding profile on the first confirmed login, so a
 * user who registered before confirming their email keeps what they entered.
 */

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { SunriseHeader } from "@/components/SunriseHeader";
import { PixelSun } from "@/components/PixelSun";
import { ConfigRequired } from "@/components/ConfigRequired";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { PixelButton } from "@/components/pixel/PixelButton";
import { PixelInput } from "@/components/pixel/PixelInput";
import { getProfile, saveProfile } from "@/lib/data";
import { supabaseBrowser } from "@/lib/supabase/client";
import { goAfterSignIn, homeForRole } from "@/lib/auth/postSignIn";
import { isSupabaseConfigured } from "@/lib/auth/config";
import { useLang } from "@/lib/i18n";
import type { Profile } from "@/lib/types";

const PENDING_PROFILE_KEY = "shuru.pendingProfile";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { t } = useLang();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // /auth/callback redirects here with ?error= when a provider or an email
  // link fails, so the failure is visible instead of a silent bounce.
  const callbackError = params.get("error");

  /**
   * "That didn't work" is the right message for a wrong password and the
   * wrong one for a broken email link, where the user did nothing wrong and
   * retrying the same way fails the same way.
   *
   * The PKCE case is worth naming specifically. Requesting a reset stores a
   * code verifier in the browser that asked; opening the link somewhere else
   * -- a different browser, incognito, or a different origin such as
   * localhost versus the deployed site -- means the server cannot find it.
   * The raw error says "code verifier not found in storage", which tells a
   * user nothing about what to do next.
   */
  const callbackMessage = !callbackError
    ? null
    : /verifier|pkce/i.test(callbackError)
      ? t("auth.errLinkOtherBrowser")
      : /expired|invalid/i.test(callbackError)
        ? t("auth.errLinkExpired")
        : t("auth.errGeneric");

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
        /*
         * Don't collapse every failure into "wrong password".
         *
         * An account created through Google or GitHub has NO password in
         * Supabase, so password sign-in returns plain invalid-credentials —
         * indistinguishable from a typo, deliberately, so the API cannot be
         * used to enumerate accounts. We must not resolve that ambiguity
         * either, but we can name it: the credentials message points at the
         * social buttons rather than insisting the password is wrong.
         *
         * `email_not_confirmed` IS distinguishable and gets its own message,
         * because "check your inbox" and "retype your password" are entirely
         * different actions.
         */
        setError(
          error?.code === "email_not_confirmed"
            ? t("auth.errUnconfirmed")
            : t("auth.errCreds")
        );
        return;
      }
      const existing = await getProfile();
      if (!existing) {
        const raw = window.localStorage.getItem(PENDING_PROFILE_KEY);
        if (raw) {
          const pending = JSON.parse(raw) as Profile;
          await saveProfile({ ...pending, user_id: data.user.id });
          window.localStorage.removeItem(PENDING_PROFILE_KEY);
        }
      }
      // Land in the workspace this account actually belongs to. An explicit
      // ?next= (set by middleware when it bounced them) always wins, so a
      // user who asked for a page still gets that page.
      let target = params.get("next");
      if (!target) {
        const { data: roleRow } = await sb
          .from("user_roles")
          .select("role")
          .eq("user_id", data.user.id)
          .maybeSingle();
        target = homeForRole(roleRow?.role as string | undefined);
      }
      // Full document navigation, not router.replace — see goAfterSignIn.
      goAfterSignIn(target);
    } catch {
      setError(t("auth.errGeneric"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {callbackMessage && (
        <p
          role="alert"
          className="border-3 border-alert bg-paper p-2 font-mono text-xs font-bold leading-relaxed text-alert"
        >
          {callbackMessage}
        </p>
      )}

      <OAuthButtons next={params.get("next") ?? "/radar"} />

      <PixelInput
        label={t("auth.email")}
        name="email"
        type="email"
        value={email}
        onChange={setEmail}
        required
        placeholder="you@university.edu"
      />
      <PixelInput
        label={t("auth.password")}
        name="password"
        type="password"
        value={password}
        onChange={setPassword}
        required
        error={error ?? undefined}
      />
      <PixelButton full size="lg" onClick={onSubmit} disabled={busy}>
        {busy ? "…" : t("auth.login")}
      </PixelButton>

      <p className="text-center font-mono text-xs text-ink">
        <Link href="/forgot-password" className="inline-block py-1.5 font-bold text-amberInk underline">
          {t("auth.forgot")}
        </Link>
      </p>
      <p className="text-center font-mono text-xs text-ink">
        {t("auth.noAccount")}{" "}
        <Link href="/register" className="font-bold text-amberInk underline">
          {t("auth.register")}
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  const { t } = useLang();

  if (!isSupabaseConfigured()) {
    return (
      <>
        <SunriseHeader />
        <ConfigRequired />
      </>
    );
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

        {/* useSearchParams needs a Suspense boundary for static prerender */}
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </main>
    </>
  );
}
