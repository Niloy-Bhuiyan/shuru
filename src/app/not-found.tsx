"use client";

import Link from "next/link";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import { useLang } from "@/lib/i18n";

export default function NotFound() {
  const { t } = useLang();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <span className="flex h-14 w-14 items-center justify-center border-3 border-ink bg-amber text-ink shadow-pixel">
        <PixelIcon name="warn" size={22} />
      </span>
      <h1 className="mt-4 font-pixel text-sm text-ink">{t("notfound.title")}</h1>
      <p className="mt-2 max-w-xs font-mono text-xs text-ink/70">{t("notfound.body")}</p>
      <Link
        href="/radar"
        className="mt-5 inline-block border-3 border-ink bg-amber px-4 py-2 font-mono text-xs font-bold uppercase text-ink shadow-pixel-sm active:translate-x-[1px] active:translate-y-[1px]"
      >
        {t("notfound.home")}
      </Link>
    </main>
  );
}
