"use client";

/**
 * Shown when no Supabase project is connected.
 *
 * Shuru previously simulated a backend in localStorage when keys were
 * absent, which meant a running app did not imply a real database. This
 * screen replaces that: it states plainly that nothing is configured rather
 * than presenting fabricated listings as though they were live.
 */

import { PixelSun } from "@/components/PixelSun";
import { useLang } from "@/lib/i18n";

export function ConfigRequired() {
  const { t } = useLang();

  return (
    <main className="px-4 pb-16 pt-6">
      <div className="mb-5 flex items-end gap-3">
        <PixelSun width={44} />
        <div>
          <h1 className="font-pixel text-sm text-alert">{t("config.title")}</h1>
          <p className="mt-1 font-mono text-xs text-grey">{t("tagline")}</p>
        </div>
      </div>

      <div className="space-y-3">
        <p className="border-3 border-alert bg-paper p-3 font-mono text-xs font-bold text-ink shadow-pixel-sm">
          {t("config.body")}
        </p>
        <p className="border-3 border-ink bg-paper p-3 font-mono text-[11px] leading-relaxed text-ink">
          {t("config.hint")}
        </p>
      </div>
    </main>
  );
}

export default ConfigRequired;
