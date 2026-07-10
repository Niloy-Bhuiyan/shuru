"use client";

/**
 * First-run orientation (Phase 2). A lightweight, one-time intro shown on the
 * first Radar visit that names the app's two best ideas: honest/abstaining
 * odds and the ATS-proof resume. Dismissible and skippable; once dismissed it
 * never shows again (localStorage flag). Renders nothing after that.
 */

import { useEffect, useState } from "react";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import { PixelButton } from "@/components/pixel/PixelButton";
import { useLang } from "@/lib/i18n";

const LS_INTRO_SEEN = "shuru.introSeen";

export function RadarIntro() {
  const { t } = useLang();
  // Start hidden to avoid a flash / hydration mismatch; reveal in effect.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(LS_INTRO_SEEN) !== "1") setVisible(true);
    } catch {
      /* storage unavailable — just skip the intro */
    }
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      window.localStorage.setItem(LS_INTRO_SEEN, "1");
    } catch {
      /* ignore */
    }
  }

  if (!visible) return null;

  return (
    <div className="mt-3 border-3 border-ink bg-cream p-3 shadow-pixel">
      <div className="flex items-center justify-between">
        <p className="font-pixel text-[10px] text-ink">{t("intro.title")}</p>
        <button
          type="button"
          aria-label={t("intro.dismiss")}
          onClick={dismiss}
          className="text-grey"
        >
          <PixelIcon name="x" size={12} />
        </button>
      </div>

      <div className="mt-2 space-y-2">
        <div className="flex items-start gap-2 border-2 border-ink bg-paper p-2">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center border-2 border-ink bg-amber text-ink">
            <PixelIcon name="signal" size={12} />
          </span>
          <div>
            <p className="font-mono text-xs font-bold text-ink">{t("intro.card1Title")}</p>
            <p className="mt-0.5 font-mono text-[11px] leading-snug text-ink/80">
              {t("intro.card1Body")}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2 border-2 border-ink bg-paper p-2">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center border-2 border-ink bg-mint text-ink">
            <PixelIcon name="hammer" size={12} />
          </span>
          <div>
            <p className="font-mono text-xs font-bold text-ink">{t("intro.card2Title")}</p>
            <p className="mt-0.5 font-mono text-[11px] leading-snug text-ink/80">
              {t("intro.card2Body")}
            </p>
          </div>
        </div>
      </div>

      <PixelButton size="sm" full className="mt-3" onClick={dismiss}>
        {t("intro.dismiss")}
      </PixelButton>
    </div>
  );
}

export default RadarIntro;
