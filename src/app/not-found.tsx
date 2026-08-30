"use client";

/**
 * 404.
 *
 * Sends people to `/` rather than `/radar`, which is what it used to do. A 404
 * is reachable signed out — a stale link, a typo, a shared URL — and the old
 * button pointed at a guarded route, so a signed-out visitor's only way out of
 * this page was a bounce through the login form. `/` is public and greets
 * both.
 */

import Link from "next/link";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import { useLang } from "@/lib/i18n";

export default function NotFound() {
  const { t } = useLang();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber/10 text-amberInk">
        <PixelIcon name="search" size={22} />
      </span>

      <h1 className="mt-5 text-[22px] font-semibold tracking-[-0.01em] text-ink">
        {t("notfound.title")}
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-ui-muted">
        {t("notfound.body")}
      </p>

      <Link
        href="/"
        className="mt-6 inline-flex min-h-[40px] items-center rounded-lg bg-ink px-4 text-[14px] font-medium text-white transition-opacity hover:opacity-90"
      >
        {t("notfound.home")}
      </Link>
    </main>
  );
}
