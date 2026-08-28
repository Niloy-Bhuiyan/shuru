"use client";

/**
 * WIZARD STEP 1 — START.
 *
 * Redesigned as the Forge's front door rather than a bare pair of buttons.
 * The old version put a 10px centred line above two small cards and left
 * roughly 600px of empty slate beneath them on a desktop screen, which reads
 * as an unfinished page rather than a deliberate one.
 *
 * Three changes carry it:
 *
 *   1. A real headline. The Forge is a different world from the rest of the
 *      app and its entrance should say so at a size you can actually read,
 *      instead of a 10px label duplicating the top bar.
 *   2. The two choices get weight, and UPLOAD is clearly the primary one.
 *   3. The empty space below is filled with what the wizard is about to do —
 *      four steps, numbered, in the order they happen. Someone deciding
 *      whether to hand over their CV wants to know what happens to it.
 */

import React from "react";
import { PixelButton } from "@/components/pixel/PixelButton";
import { PixelIcon, type IconName } from "@/components/pixel/PixelIcon";
import { UploadResume } from "@/components/forge/UploadResume";
import { useLang, type StringKey } from "@/lib/i18n";
import type { ResumeContent } from "@/lib/types";

/** The wizard, previewed. Mirrors BUILD → SCORE → TAILOR → FINISH. */
const AHEAD: { icon: IconName; title: StringKey; body: StringKey }[] = [
  { icon: "edit", title: "forge.ahead1", body: "forge.ahead1b" },
  { icon: "check", title: "forge.ahead2", body: "forge.ahead2b" },
  { icon: "spark", title: "forge.ahead3", body: "forge.ahead3b" },
  { icon: "download", title: "forge.ahead4", body: "forge.ahead4b" },
];

export function StepStart({
  hasExisting,
  onParsed,
  onScratch,
  onKeep,
}: {
  hasExisting: boolean;
  onParsed: (content: ResumeContent, structured: boolean) => void;
  onScratch: () => void;
  onKeep: () => void;
}) {
  const { t } = useLang();

  return (
    <div className="mt-6">
      {/* ── headline ── */}
      <div className="mb-6 text-center">
        <span
          aria-hidden
          className="mx-auto mb-3 flex h-14 w-14 items-center justify-center border-3 border-ink bg-amber text-ink shadow-pixel"
        >
          <PixelIcon name="hammer" size={26} />
        </span>
        <h2 className="font-pixel text-lg leading-tight text-amber sm:text-xl">
          {t("forge.title")}
        </h2>
        <p className="mx-auto mt-2 max-w-[36ch] font-mono text-[13px] leading-relaxed text-ink/80">
          {t("forge.startLead")}
        </p>
      </div>

      <UploadResume onParsed={onParsed} onScratch={onScratch} />

      {hasExisting && (
        <PixelButton size="sm" variant="secondary" className="mt-4" onClick={onKeep}>
          ← {t("forge.keepCurrent")}
        </PixelButton>
      )}

      {/* ── what the wizard does next ──
          This block replaces the empty slate, and it is not decoration. */}
      <section aria-labelledby="forge-ahead" className="mt-8 border-t-3 border-ink/30 pt-5">
        <h3
          id="forge-ahead"
          className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ink/70"
        >
          {t("forge.aheadTitle")}
        </h3>

        <ol className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {AHEAD.map((s, i) => (
            <li
              key={s.title}
              className="flex items-start gap-3 border-3 border-ink bg-paper p-3 shadow-pixel-sm"
            >
              <span
                aria-hidden
                className="flex h-8 w-8 shrink-0 items-center justify-center border-2 border-ink bg-ink font-pixel text-[11px] text-amber"
              >
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 font-pixel text-[10px] text-ink">
                  <PixelIcon name={s.icon} size={11} className="text-amber" />
                  {t(s.title)}
                </p>
                <p className="mt-1 font-mono text-[11px] leading-relaxed text-ink/80">
                  {t(s.body)}
                </p>
              </div>
            </li>
          ))}
        </ol>

        {/* The one promise the Forge makes that a resume builder normally does
            not. It belongs on the entrance, not buried inside SCORE. */}
        <p className="mt-4 border-3 border-amber bg-paper p-3 font-mono text-[11px] leading-relaxed text-ink/90">
          <span className="font-bold text-amber">{t("forge.honestTag")}</span>{" "}
          {t("forge.honestBody")}
        </p>
      </section>
    </div>
  );
}

export default StepStart;
