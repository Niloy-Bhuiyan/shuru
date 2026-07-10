"use client";

import { PixelIcon } from "@/components/pixel/PixelIcon";
import { PixelButton } from "@/components/pixel/PixelButton";
import { useLang } from "@/lib/i18n";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useLang();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <span className="flex h-14 w-14 items-center justify-center border-3 border-ink bg-alert text-cream shadow-pixel">
        <PixelIcon name="x" size={22} />
      </span>
      <h1 className="mt-4 font-pixel text-sm text-ink">{t("error.title")}</h1>
      <p className="mt-2 max-w-xs font-mono text-xs text-ink/70">{t("error.body")}</p>
      <div className="mt-5">
        <PixelButton onClick={() => reset()}>{t("error.retry")}</PixelButton>
      </div>
    </main>
  );
}
