"use client";

/**
 * ABSTENTION — the soul of the product. When n < 8 we do NOT invent a
 * number. A calm retro-terminal readout says so, shows what IS known,
 * and offers a watch toggle. Designed as a premium state, not an error.
 */

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import { Typewriter } from "@/components/Typewriter";
import { useLang } from "@/lib/i18n";
import type { Opportunity } from "@/lib/types";

export function AbstentionTerminal({
  op,
  n,
  needed,
  seniors,
  reportCount,
}: {
  op: Opportunity;
  n: number;
  needed: number;
  seniors: number;
  reportCount: number;
}) {
  const { t } = useLang();
  const watchKey = `shuru.watch.${op.id}`;
  const [watching, setWatching] = useState(false);

  useEffect(() => {
    setWatching(window.localStorage.getItem(watchKey) === "1");
  }, [watchKey]);

  function toggleWatch() {
    const next = !watching;
    setWatching(next);
    if (next) window.localStorage.setItem(watchKey, "1");
    else window.localStorage.removeItem(watchKey);
  }

  const rules = op.eligibility_rules;
  const reqs: string[] = [];
  if (rules.min_cgpa != null) reqs.push(`CGPA ≥ ${rules.min_cgpa.toFixed(2)}`);
  if (rules.min_semester != null) reqs.push(`Semester ≥ ${rules.min_semester}`);
  if (rules.allowed_departments?.length)
    reqs.push(rules.allowed_departments.join(" / "));
  if (rules.other_text) reqs.push(rules.other_text);

  return (
    <div>
      {/* the terminal */}
      <div className="border-3 border-ink bg-ink p-4 shadow-pixel">
        <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-cream/50">
          shuru://reality-check
        </p>
        <p className="mt-3 font-pixel text-xs leading-relaxed text-grey">
          <Typewriter text={t("abstain.signal")} />
        </p>
        <p className="mt-2 font-mono text-sm text-cream">
          — {t("abstain.body")}
          <span className="pixel-blink text-amber">▮</span>
        </p>

        <div className="mt-4 space-y-1 font-mono text-xs text-cream/80">
          <p>
            <span className="text-amber">{n}</span> {t("abstain.found")}
          </p>
          <p>
            <span className="text-amber">{needed}</span> {t("abstain.needed")}
          </p>
        </div>

        {/* sample meter: how far to honest odds */}
        <div className="mt-3 flex gap-[3px] border-2 border-cream/30 p-[3px]">
          {Array.from({ length: needed }).map((_, i) => (
            <span
              key={i}
              className={`h-4 flex-1 ${i < n ? "bg-grey" : "dither-grey opacity-30"}`}
            />
          ))}
        </div>

        <p className="mt-4 font-mono text-[11px] italic text-cream/60">
          {t("abstain.honesty")}
        </p>
      </div>

      {/* what IS known */}
      <section className="mt-4">
        <h2 className="mb-2 font-pixel text-[10px] text-ink">{t("abstain.known")}</h2>
        <div className="space-y-2">
          <div className="border-3 border-ink bg-paper p-3">
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-grey">
              {t("abstain.reqs")}
            </p>
            <p className="mt-1 font-mono text-xs font-bold text-ink">
              {reqs.length ? reqs.join(" · ") : "—"}
            </p>
          </div>
          {seniors > 0 && (
            <Link href={`/mentors/${op.id}`} className="block border-3 border-ink bg-paper p-3 shadow-pixel-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-pixel-none">
              <p className="flex items-center justify-between font-mono text-xs font-bold text-ink">
                <span>
                  <span className="text-amber">{seniors}</span> {t("abstain.seniors")}
                </span>
                <PixelIcon name="arrow-right" size={11} />
              </p>
            </Link>
          )}
          {reportCount > 0 && (
            <Link
              href={`/vault?company=${encodeURIComponent(op.company)}`}
              className="block border-3 border-ink bg-paper p-3 shadow-pixel-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-pixel-none"
            >
              <p className="flex items-center justify-between font-mono text-xs font-bold text-ink">
                <span>
                  <span className="text-amber">{reportCount}</span> {t("abstain.reports")}
                </span>
                <PixelIcon name="arrow-right" size={11} />
              </p>
            </Link>
          )}
        </div>
      </section>

      {/* watch toggle */}
      <button
        type="button"
        onClick={toggleWatch}
        aria-pressed={watching}
        className={`mt-4 w-full border-3 border-ink p-3 font-mono text-xs font-bold uppercase tracking-wide shadow-pixel active:translate-x-[2px] active:translate-y-[2px] active:shadow-pixel-none ${
          watching ? "bg-mint text-ink" : "bg-paper text-ink"
        }`}
      >
        {watching ? t("abstain.watching") : `⚑ ${t("abstain.watch")}`}
      </button>
    </div>
  );
}

export default AbstentionTerminal;
