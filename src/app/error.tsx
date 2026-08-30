"use client";

/**
 * The route-level error boundary.
 *
 * Reached when a page or one of its children throws during render. It has to
 * assume nothing about what broke, so it says one true thing, offers the two
 * things that actually help, and shows no stack trace.
 *
 * `digest` IS shown, and it is the one technical string on the screen worth
 * keeping: it is a hash Next assigns to the error, it appears in the server
 * logs beside the real stack, and it carries no information about the failure
 * on its own. A user quoting it in a bug report turns "it broke" into a log
 * lookup. The message and stack stay off the page — those name our tables and
 * our internals.
 */

import Link from "next/link";
import { useEffect } from "react";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import { PixelButton } from "@/components/pixel/PixelButton";
import { useLang } from "@/lib/i18n";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useLang();

  // The detail has to go somewhere, and "somewhere" is not the page.
  useEffect(() => {
    console.error("[route error]", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-alert/10 text-alert">
        <PixelIcon name="warn" size={22} />
      </span>

      <h1 className="mt-5 text-[22px] font-semibold tracking-[-0.01em] text-ink">
        {t("error.title")}
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-ui-muted">
        {t("error.body")}
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
        <PixelButton onClick={() => reset()}>{t("error.retry")}</PixelButton>
        {/* A retry that fails twice leaves someone stranded on a dead screen
            with no navigation, because this boundary replaces the app frame. */}
        <Link
          href="/"
          className="inline-flex min-h-[40px] items-center rounded-lg border border-ui-lineStrong bg-paper px-4 text-[14px] font-medium text-ink transition-colors hover:bg-cream"
        >
          {t("error.home")}
        </Link>
      </div>

      {error.digest && (
        <p className="mt-8 font-code text-[12px] text-ui-faint">
          {t("error.reference")} {error.digest}
        </p>
      )}
    </main>
  );
}
