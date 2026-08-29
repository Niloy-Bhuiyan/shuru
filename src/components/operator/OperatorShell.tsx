"use client";

/**
 * OperatorShell — sidebar rail + working area.
 *
 * Replaces the earlier header-plus-tabs arrangement. That version separated
 * the operator area from the student app but kept its shape, so admin still
 * read as a mode of the student product rather than as its own tool.
 *
 * The split is deliberate: a dark rail for navigation, a light working area
 * for the rows an operator actually reads. Moderation is reading — listings,
 * companies, reports — and long stretches of small text on a dark surface is
 * the wrong trade for that. The chrome carries the "different product"
 * signal; the content stays legible.
 */

import React from "react";
import { OperatorSideNav, type OperatorNavItem } from "./OperatorSideNav";
import { useLang } from "@/lib/i18n";
import { cx } from "@/lib/cx";

export function OperatorShell({
  items,
  role,
  title,
  subtitle,
  actions,
  children,
}: {
  items: OperatorNavItem[];
  role: "admin" | "employer" | null;
  title: string;
  subtitle?: string;
  /** Page-level controls, e.g. "add a listing". */
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { lang, setLang } = useLang();

  return (
    <div className="flex min-h-dvh items-start bg-cream">
      <OperatorSideNav items={items} role={role} />

      <div className="min-w-0 flex-1">
        {/* Page header. The title is a real heading here — in the previous
            version it was 12px and lost next to the button beside it. */}
        <header className="flex items-start justify-between gap-3 border-b-3 border-ink bg-paper px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h1 className="font-pixel text-base leading-tight text-ink sm:text-lg">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1.5 font-mono text-[11px] leading-relaxed text-ink/70">
                {subtitle}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {actions}
            <div className="flex border-2 border-ink" role="group" aria-label="Language">
              {(["en", "bn"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLang(l)}
                  aria-pressed={lang === l}
                  className={cx(
                    "px-2 py-1 text-[11px] font-bold",
                    l === "bn" ? "font-bangla" : "font-mono",
                    lang === l ? "bg-ink text-cream" : "bg-paper text-ink"
                  )}
                >
                  {l === "en" ? "EN" : "বাং"}
                </button>
              ))}
            </div>
          </div>
        </header>

        <div className="px-4 py-5 sm:px-6">{children}</div>
      </div>
    </div>
  );
}

/**
 * A number that means something, with the word for what it counts.
 *
 * `tone` marks a figure that represents WORK WAITING rather than a fact
 * about the system — pending reviews are actionable, total listings are not.
 * An operator should be able to tell those apart at a glance.
 */
export function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: "neutral" | "action";
}) {
  const needsAction = tone === "action" && typeof value === "number" && value > 0;
  return (
    <div
      className={cx(
        "border-3 border-ink p-3 shadow-pixel-sm",
        needsAction ? "bg-amber" : "bg-paper"
      )}
    >
      <p
        className={cx(
          "font-mono text-[10px] font-bold tracking-[0.15em]",
          needsAction ? "text-ink/80" : "text-ink/60"
        )}
      >
        {label}
      </p>
      <p className="mt-1 font-pixel text-xl leading-none text-ink">{value}</p>
      {hint && (
        <p
          className={cx(
            "mt-1.5 font-mono text-[10px] leading-relaxed",
            needsAction ? "text-ink/70" : "text-ink/50"
          )}
        >
          {hint}
        </p>
      )}
    </div>
  );
}

export default OperatorShell;
