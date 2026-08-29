"use client";

import React from "react";
import Link from "next/link";
import { cx } from "@/lib/cx";
import { PixelSun } from "@/components/PixelSun";
import { useLang } from "@/lib/i18n";

/**
 * LANDING — the public front door at `/`.
 *
 * The `.ui-pro` class on the root takes this page out of the app's centred
 * content frame: a marketing page runs to the edges and manages its own
 * containers (see globals.css). It names neutrals through the `ui-*` scale
 * rather than the product's role tokens (`cream`, `paper`, `ink`), because it
 * has no cards, statuses or controls for those roles to describe.
 *
 * TYPE. Display lines are set in a serif, body and UI in Inter. Inter at 60px
 * is competent and anonymous — it is the default of every SaaS landing page,
 * which is why a page built only from it reads as a template. The serif is
 * English-only: it has no Bengali coverage, so `display()` falls back to Hind
 * Siliguri under `bn`, and it is never used below headline size.
 *
 * NO MANUFACTURED SOCIAL PROOF. No student counts, no testimonials, no
 * employer logos. The product rule against claiming unearned confidence
 * applies hardest on a marketing page. The hero preview is an illustration of
 * the mechanism and is labelled as one — and it shows the abstaining state
 * alongside the confident one, because that is the actual claim.
 */
export function LandingPage() {
  const { t, lang, setLang } = useLang();

  const bn = lang === "bn";
  const face = bn ? "font-bangla" : "font-sans";
  // Serif for English display type; Bengali keeps its own face.
  const display = bn ? "font-bangla" : "font-display";

  const steps = [
    ["landing.how1Title", "landing.how1Body"],
    ["landing.how2Title", "landing.how2Body"],
    ["landing.how3Title", "landing.how3Body"],
  ] as const;

  return (
    <div className={cx("ui-pro min-h-dvh bg-ui-bg text-ui-text", face)}>
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-ui-line/70 bg-ui-bg/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 lg:px-8">
          <div className="flex items-center gap-2.5">
            <PixelSun width={24} withHorizon={false} />
            <span className="text-[17px] font-semibold tracking-[-0.015em] text-ui-text">
              Shuru
            </span>
            <span className="font-bangla text-[15px] font-semibold text-ui-faint">
              শুরু
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div
              className="flex overflow-hidden rounded-lg border border-ui-line"
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
                    "px-2.5 py-1.5 text-[12px] font-medium transition-colors duration-200",
                    l === "bn" ? "font-bangla" : "font-sans",
                    lang === l
                      ? "bg-ui-raised text-ui-text"
                      : "bg-ui-bg text-ui-faint hover:text-ui-muted"
                  )}
                >
                  {l === "en" ? "EN" : "বাং"}
                </button>
              ))}
            </div>

            <Link
              href="/login"
              className="hidden rounded-lg px-3 py-2 text-[14px] font-medium text-ui-muted transition-colors duration-200 hover:text-ui-text sm:block"
            >
              {t("landing.ctaSignIn")}
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-ui-inverse px-4 py-2 text-[14px] font-medium text-white shadow-pixel-sm transition-all duration-200 hover:-translate-y-px hover:shadow-lift"
            >
              {t("landing.ctaStart")}
            </Link>
          </div>
        </div>
      </header>

      {/* Screen-reader users navigate by landmark before they read anything.
          Without this the four sections below belong to no region at all, and
          "skip to content" has nothing to skip to. */}
      <main>
      {/* ── Hero ─────────────────────────────────────────────────────────
          Two columns from lg: the claim on the left, the mechanism on the
          right. A landing page that only asserts is weaker than one that
          shows, and the preview is the only thing on this page that
          demonstrates what the product actually does. */}
      <section className="grain relative overflow-hidden border-b border-ui-line">
        {/* A single warm wash behind the headline. Radial and very weak — it
            gives the flat white something to sit on without reading as a
            gradient anyone chose. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-1/4 -top-1/2 h-[820px] w-[820px] rounded-full opacity-[0.13]"
          style={{
            background:
              "radial-gradient(circle, #EA580C 0%, #F59E0B 34%, transparent 68%)",
          }}
        />

        <div className="relative mx-auto max-w-6xl px-5 py-20 lg:px-8 lg:py-28">
          <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-ui-line bg-ui-bg/70 px-3 py-1 text-[12.5px] font-medium text-ui-muted shadow-pixel-sm backdrop-blur">
                <PixelSun width={15} withHorizon={false} />
                {t("landing.footerNote")}
              </span>

              <h1
                className={cx(
                  display,
                  "mt-7 text-display-sm text-ui-text sm:text-display-md lg:text-display-lg"
                )}
              >
                {t("landing.heroLine")}
              </h1>

              <p className="mt-6 max-w-xl text-[17px] leading-[1.62] text-ui-muted lg:text-[18px]">
                {t("landing.heroBody")}
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link
                  href="/register"
                  className="rounded-xl bg-ui-inverse px-6 py-3.5 text-[15px] font-medium text-white shadow-lift transition-all duration-200 hover:-translate-y-0.5 hover:shadow-float"
                >
                  {t("landing.ctaStart")}
                </Link>
                <Link
                  href="/login"
                  className="rounded-xl border border-ui-lineStrong bg-ui-bg px-6 py-3.5 text-[15px] font-medium text-ui-text transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card"
                >
                  {t("landing.ctaSignIn")}
                </Link>
              </div>
            </div>

            <HeroPreview />
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section className="border-b border-ui-line bg-ui-surface">
        <div className="mx-auto max-w-6xl px-5 py-20 lg:px-8 lg:py-24">
          <SectionLabel>{t("landing.howTitle")}</SectionLabel>

          <ol className="mt-10 grid gap-5 lg:grid-cols-3">
            {steps.map(([title, copy], i) => (
              <li
                key={title}
                className="group rounded-2xl bg-ui-bg p-7 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-lift"
              >
                <span
                  aria-hidden
                  className="tabular inline-flex h-8 w-8 items-center justify-center rounded-lg bg-ui-accentSoft text-[13px] font-semibold text-ui-accent"
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-5 text-[17px] font-semibold tracking-[-0.015em] text-ui-text">
                  {t(title)}
                </h3>
                <p className="mt-2.5 text-[14.5px] leading-[1.68] text-ui-muted">
                  {t(copy)}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── The abstention promise ─────────────────────────────────────── */}
      <section className="grain relative overflow-hidden border-b border-ui-line bg-ui-inverse">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-40 bottom-[-30%] h-[620px] w-[620px] rounded-full opacity-20"
          style={{
            background:
              "radial-gradient(circle, #EA580C 0%, transparent 66%)",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-5 py-24 lg:px-8 lg:py-28">
          <div className="max-w-3xl">
            <span className="text-[12px] font-semibold uppercase tracking-[0.16em] text-ui-accentBright">
              {t("landing.honestTitle")}
            </span>
            <p
              className={cx(
                display,
                "mt-6 text-[26px] leading-[1.32] text-white sm:text-[32px] lg:text-[38px] lg:leading-[1.28]"
              )}
            >
              {t("landing.honestBody")}
            </p>
          </div>
        </div>
      </section>

      {/* ── Employers ────────────────────────────────────────────────────── */}
      <section className="border-b border-ui-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-7 px-5 py-16 lg:flex-row lg:items-center lg:justify-between lg:px-8 lg:py-20">
          <div className="max-w-xl">
            <h2
              className={cx(
                display,
                "text-[26px] leading-tight text-ui-text lg:text-[32px]"
              )}
            >
              {t("landing.empTitle")}
            </h2>
            <p className="mt-3 text-[15px] leading-[1.68] text-ui-muted">
              {t("landing.empBody")}
            </p>
          </div>
          <Link
            href="/register"
            className="shrink-0 self-start rounded-xl border border-ui-lineStrong bg-ui-bg px-5 py-3 text-[15px] font-medium text-ui-text transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card lg:self-auto"
          >
            {t("landing.empCta")}
          </Link>
        </div>
      </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-10 text-[13.5px] text-ui-faint sm:flex-row sm:items-center sm:justify-between lg:px-8">
        <div className="flex items-center gap-2">
          <PixelSun width={18} withHorizon={false} />
          <span className="font-semibold text-ui-muted">Shuru</span>
          <span className="font-bangla text-ui-faint">শুরু</span>
        </div>
        <p>{t("landing.footerNote")}</p>
      </footer>
    </div>
  );
}

/** Small-caps section label — quieter than a heading, still structural. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[12px] font-semibold uppercase tracking-[0.16em] text-ui-faint">
      {children}
    </h2>
  );
}

/**
 * The hero's product preview.
 *
 * Two stacked cards showing the two outcomes the product can return: a
 * calibrated read with its reasons, and an abstention with its reason. The
 * second card is the point — every competitor's marketing shows only the
 * confident state, and showing the other one is the whole pitch.
 *
 * Labelled "Example" on the card itself, and carrying no real employer name,
 * because an illustration that reads as a real listing would be exactly the
 * manufactured confidence the copy promises to avoid.
 */
function HeroPreview() {
  const { t } = useLang();

  return (
    <div className="relative" aria-hidden>
      {/* Ghost card behind, to suggest a feed continuing past the frame. */}
      <div className="absolute -bottom-4 left-4 right-4 h-24 rounded-2xl bg-ui-bg shadow-card" />

      <div className="relative space-y-3 rounded-2xl bg-ui-bg p-3 shadow-float">
        <span className="absolute -top-2.5 left-5 rounded-full bg-ui-inverse px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white">
          {t("landing.previewTag")}
        </span>

        {/* Confident read */}
        <div className="rounded-xl border border-ui-line bg-ui-bg p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[14.5px] font-semibold text-ui-text">
                {t("landing.previewRole")}
              </p>
              <p className="mt-0.5 truncate text-[12.5px] text-ui-faint">
                {t("landing.previewMeta")}
              </p>
            </div>
            <span className="tabular shrink-0 rounded-lg bg-mint/10 px-2 py-1 text-[12px] font-semibold text-[#047857]">
              62%
            </span>
          </div>

          <div className="mt-3.5">
            <div className="flex items-center justify-between text-[11.5px] font-medium text-ui-faint">
              <span>{t("landing.previewOdds")}</span>
              <span className="tabular">62</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ui-raised">
              <div className="h-full w-[62%] rounded-full bg-mint" />
            </div>
          </div>

          <p className="mt-3 text-[12.5px] font-medium text-ui-muted">
            {t("landing.previewWhy")}
          </p>
          <p className="mt-1 text-[12px] text-ui-faint">
            {t("landing.previewWhyList")}
          </p>
          <p className="mt-2 text-[12px] text-amberInk">
            {t("landing.previewMissing")}
          </p>
        </div>

        {/* Abstention — deliberately given equal weight, not a footnote. */}
        <div className="rounded-xl border border-dashed border-ui-lineStrong bg-ui-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[14.5px] font-semibold text-ui-text">
                {t("landing.previewAbstainRole")}
              </p>
              <p className="mt-0.5 truncate text-[12.5px] text-ui-faint">
                {t("landing.previewAbstainMeta")}
              </p>
            </div>
            <span className="shrink-0 rounded-lg bg-grey/10 px-2 py-1 text-[12px] font-semibold text-ui-muted">
              —
            </span>
          </div>

          <div className="mt-3.5">
            <div className="flex items-center justify-between text-[11.5px] font-medium text-ui-faint">
              <span>{t("landing.previewAbstain")}</span>
            </div>
            {/* No bar. An empty track would still imply a measured zero. */}
            <div className="mt-1.5 h-1.5 rounded-full border border-dashed border-ui-lineStrong" />
          </div>

          <p className="mt-3 text-[12.5px] leading-[1.6] text-ui-muted">
            {t("landing.previewAbstainWhy")}
          </p>
        </div>
      </div>
    </div>
  );
}

export default LandingPage;
