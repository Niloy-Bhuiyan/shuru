"use client";

/**
 * OperatorShell -- sidebar rail + working area.
 *
 * Replaces the earlier header-plus-tabs arrangement. That version separated
 * the operator area from the student app but kept its shape, so admin still
 * read as a mode of the student product rather than as its own tool.
 *
 * The split is deliberate: a dark rail for navigation, a light working area
 * for the rows an operator actually reads. Moderation is reading -- listings,
 * companies, reports -- and long stretches of small text on a dark surface is
 * the wrong trade for that. The chrome carries the "different product"
 * signal; the content stays legible.
 *
 * The chrome was rebuilt on the product token set (`ui-line`, `paper`,
 * `cream`, rounded corners, real type sizes). It had been left behind on the
 * retired pixel vocabulary -- 3px ink borders, offset shadows, 10px tracked
 * mono -- so the console looked like a different, older application than
 * every screen an operator reaches from it.
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
        {/*
          Sticky. An operator works down a queue by scrolling, and the header
          carries the one line that says whether anything is still waiting --
          which is worth nothing if it scrolls away on the first item.
        */}
        <header className="sticky top-0 z-10 flex flex-col gap-3 border-b border-ui-line bg-paper/95 px-4 py-4 backdrop-blur sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-6">
          <div className="min-w-0">
            <h1 className="font-sans text-[19px] font-semibold leading-tight tracking-[-0.01em] text-ink sm:text-[22px]">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1 font-sans text-[13px] leading-relaxed text-ui-muted">
                {subtitle}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {actions}
            <div
              className="flex overflow-hidden rounded-lg border border-ui-lineStrong"
              role="group"
              aria-label="Language"
            >
              {(["en", "bn"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLang(l)}
                  aria-pressed={lang === l}
                  className={cx(
                    "min-h-[36px] px-2.5 text-[13px] font-medium transition-colors",
                    l === "bn" ? "font-bangla" : "font-sans",
                    lang === l
                      ? "bg-ink text-white"
                      : "bg-paper text-ui-muted hover:bg-cream hover:text-ink"
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
 * `tone="action"` marks a figure that represents WORK WAITING rather than a
 * fact about the system -- pending reviews are actionable, total listings are
 * not. An operator should be able to tell those apart at a glance.
 *
 * That distinction used to be drawn by flooding the whole tile with amber.
 * Five saturated tiles side by side is a warning strip, not a hierarchy: when
 * everything shouts, the count that matters is no easier to find than the one
 * that doesn't. The signal now sits on the numeral and a single dot, so a row
 * of tiles reads as a row of numbers with some of them lit.
 *
 * Passing `onClick` turns the tile into the queue selector as well as its
 * summary -- see the note in the admin page about why the console has one
 * navigation for the queues rather than two.
 */
export function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
  selected,
  onClick,
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: "neutral" | "action";
  /** Marks this tile as the queue currently on screen. */
  selected?: boolean;
  onClick?: () => void;
}) {
  const needsAction = tone === "action" && typeof value === "number" && value > 0;
  const interactive = typeof onClick === "function";

  const body = (
    <>
      <div className="flex items-start gap-1.5">
        {needsAction && (
          <span
            aria-hidden="true"
            className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-amber"
          />
        )}
        {/* Wraps. `truncate` turned "Listing queue" into "Li..." the moment
            the console was narrow, which is a label that has stopped being a
            label. Two lines is fine; two letters is not. */}
        <p className="min-w-0 font-sans text-[12px] font-medium leading-tight text-ui-muted">
          {label}
        </p>
      </div>
      <p
        className={cx(
          "mt-1.5 font-sans text-[26px] font-semibold leading-none tabular",
          needsAction ? "text-amberInk" : "text-ink"
        )}
      >
        {value}
      </p>
      {hint && (
        <p className="mt-1.5 font-sans text-[12px] leading-snug text-ui-faint">
          {hint}
        </p>
      )}
    </>
  );

  const surface = cx(
    "rounded-xl border p-3.5 text-left transition-colors",
    selected
      ? "border-ink bg-paper ring-1 ring-ink"
      : "border-ui-line bg-paper",
    interactive && !selected && "hover:border-ui-lineStrong hover:bg-cream"
  );

  if (!interactive) {
    return <div className={surface}>{body}</div>;
  }

  return (
    <button type="button" onClick={onClick} aria-pressed={selected} className={surface}>
      {body}
    </button>
  );
}

export default OperatorShell;
