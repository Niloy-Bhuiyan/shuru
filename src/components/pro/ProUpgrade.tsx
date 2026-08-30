"use client";

/**
 * THE UPGRADE FLOW, as presentation only.
 *
 * Both halves take everything they render as props and own no data. That is
 * what makes them viewable outside a session: /pro is behind the student route
 * guard, so the previous version of this screen was designed, shipped and
 * reviewed by someone who had never seen it rendered. Splitting the pixels
 * from the fetching means the layout can be put in front of a browser with
 * fixed data and actually looked at.
 *
 * ── Why it is two steps ───────────────────────────────────────────────────
 *
 * It used to be one page: status, price, features, a demo banner, a method
 * grid, a wallet form, a summary and a receipt list, all stacked. Everything
 * was present and nothing was resolved — a reader deciding WHETHER to pay had
 * to scroll past the machinery of HOW to pay to finish reading the offer.
 *
 * Plans first, then checkout, with a way back. That is the shape of every
 * purchase people already know, and it means each screen asks exactly one
 * question.
 */

import React from "react";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import { PixelBadge } from "@/components/pixel/PixelBadge";
import { MethodMark, markIsWordmark } from "@/components/brand/MethodMark";
import { cx } from "@/lib/cx";
import { PixelInput } from "@/components/pixel/PixelInput";
import { formatPriceCompact, type BillingPeriod } from "@/lib/subscription";
import type { StringKey } from "@/lib/i18n";
import type { PaymentMethodId } from "@/lib/payments/methods";

type Translate = (key: StringKey) => string;

export type Money = { amountMinor: number; currency: string };

/** Just enough of a method to draw its tile. */
export type MethodTile = {
  id: PaymentMethodId;
  label: string;
  settlement: "provider_webhook" | "manual_review";
  region: "bd" | "international" | "any";
  merchant_number: string | null;
  is_demo: boolean;
};

/* ─────────────────────────────── plans ─────────────────────────────────── */

export function PlanGrid({
  period,
  onPeriod,
  monthly,
  yearly,
  isPro,
  onUpgrade,
  t,
}: {
  period: BillingPeriod;
  onPeriod: (p: BillingPeriod) => void;
  monthly: Money;
  yearly: Money;
  /** Suppresses the Pro call to action in favour of "your current plan". */
  isPro: boolean;
  onUpgrade: () => void;
  t: Translate;
}) {
  const price = period === "monthly" ? monthly : yearly;

  return (
    <div>
      {/*
        The period switch sits above BOTH cards because it governs both, and
        it is a segmented pill rather than two bordered buttons: a control
        offering two mutually exclusive states should look like one object
        with a position, not like two things you can press.
      */}
      <div className="flex justify-center">
        <div
          role="radiogroup"
          aria-label={t("pro.planHeading")}
          className="inline-flex rounded-full border border-ui-line bg-cream p-1"
        >
          {(["monthly", "yearly"] as const).map((p) => {
            const active = period === p;
            return (
              <label
                key={p}
                className={cx(
                  "relative cursor-pointer rounded-full px-4 py-1.5 text-[14px] font-medium transition-colors",
                  "focus-within:outline-none focus-within:ring-2 focus-within:ring-amber",
                  active
                    ? "bg-paper text-ink shadow-sm"
                    : "text-ui-muted hover:text-ink"
                )}
              >
                <input
                  type="radio"
                  name="billing-period"
                  value={p}
                  checked={active}
                  onChange={() => onPeriod(p)}
                  className="sr-only"
                />
                {t(p === "monthly" ? "pro.monthly" : "pro.yearly")}
                {p === "yearly" && (
                  <span className="ml-1.5 text-[13px] font-normal text-mint">
                    −17%
                  </span>
                )}
              </label>
            );
          })}
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {/*
          Free is a CARD, not a footnote in the margin of the paid one.

          Shuru computes matching, the Reality Check, eligibility, ATS scoring
          and résumé export itself, and charging for those would be charging
          for the honest half. Giving that column the same frame, the same
          type and the same width as the paid column is the difference between
          a product with a free tier and a paywall with an apology.
        */}
        <PlanCard
          name={t("pro.planFree")}
          price={formatPriceCompact({ amountMinor: 0, currency: price.currency })}
          cadence={t("pro.forever")}
          tagline={t("pro.freeTagline")}
          items={FREE_ITEMS}
          t={t}
          cta={
            <PlanCta variant="current" disabled>
              {t("pro.currentFree")}
            </PlanCta>
          }
        />

        <PlanCard
          featured
          name={t("pro.planPro")}
          badge={period === "yearly" ? t("pro.bestValue") : undefined}
          price={formatPriceCompact(price)}
          cadence={t(period === "monthly" ? "pro.per30" : "pro.per365")}
          tagline={t("pro.proTagline")}
          items={PRO_ITEMS}
          t={t}
          cta={
            isPro ? (
              <PlanCta variant="current" disabled>
                {t("pro.currentPlan")}
              </PlanCta>
            ) : (
              <PlanCta variant="primary" onClick={onUpgrade}>
                {t("pro.upgradeCta")}
              </PlanCta>
            )
          }
        />
      </div>
    </div>
  );
}

const PRO_ITEMS: StringKey[] = [
  "pro.featAgent",
  "pro.featAsk",
  "pro.featForge",
  "pro.featDiscover",
];
const FREE_ITEMS: StringKey[] = [
  "pro.freeRadar",
  "pro.freeReality",
  "pro.freeForge",
  "pro.freeVault",
];

function PlanCard({
  name,
  badge,
  price,
  cadence,
  tagline,
  items,
  cta,
  featured,
  t,
}: {
  name: string;
  badge?: string;
  price: string;
  cadence: string;
  tagline: string;
  items: StringKey[];
  cta: React.ReactNode;
  featured?: boolean;
  t: Translate;
}) {
  return (
    <section
      className={cx(
        "flex flex-col rounded-2xl border p-6",
        featured ? "border-ink bg-paper" : "border-ui-line bg-paper"
      )}
    >
      <div className="flex items-center gap-2">
        <h3 className="text-[15px] font-semibold text-ink">{name}</h3>
        {badge && <PixelBadge tone="qualify">{badge}</PixelBadge>}
      </div>

      {/* Price and cadence on one baseline. A big numeral with its unit
          stranded on the line below reads as two facts instead of one. */}
      <p className="mt-4 flex items-baseline gap-1.5">
        <span className="text-[38px] font-semibold leading-none tracking-[-0.03em] text-ink tabular">
          {price}
        </span>
        <span className="text-[14px] text-ui-faint">{cadence}</span>
      </p>

      <p className="mt-3 text-[14px] leading-relaxed text-ui-muted">{tagline}</p>

      <div className="mt-5">{cta}</div>

      <p className="mt-6 text-[13px] font-medium text-ui-muted">
        {t("pro.includedHeading")}
      </p>
      <ul className="mt-3 space-y-2.5">
        {items.map((k) => (
          <li key={k} className="flex gap-2.5">
            <span
              aria-hidden="true"
              className={cx("mt-[3px] shrink-0", featured ? "text-amberInk" : "text-mint")}
            >
              <PixelIcon name="check" size={14} />
            </span>
            <span className="text-[14px] leading-relaxed text-ink">{t(k)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PlanCta({
  children,
  variant,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  variant: "primary" | "current";
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "flex min-h-[44px] w-full items-center justify-center rounded-lg px-4 text-[14px] font-medium transition-colors",
        variant === "primary"
          ? "bg-ink text-white hover:opacity-90"
          : "cursor-default border border-ui-line bg-cream text-ui-muted"
      )}
    >
      {children}
    </button>
  );
}

/* ────────────────────────────── checkout ───────────────────────────────── */

export function CheckoutPanel({
  planLabel,
  total,
  methods,
  selected,
  onSelect,
  onBack,
  children,
  t,
}: {
  planLabel: string;
  total: string;
  methods: MethodTile[];
  selected: PaymentMethodId | null;
  onSelect: (id: PaymentMethodId) => void;
  onBack: () => void;
  /** The method-specific body and the submit control. */
  children: React.ReactNode;
  t: Translate;
}) {
  const groups = [
    { key: "bd", label: t("pro.groupBd"), items: methods.filter((m) => m.region === "bd") },
    {
      key: "intl",
      label: t("pro.groupIntl"),
      items: methods.filter((m) => m.region === "international"),
    },
    { key: "any", label: t("pro.groupDemo"), items: methods.filter((m) => m.region === "any") },
  ].filter((g) => g.items.length > 0);

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="-ml-1 inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-1 text-[14px] text-ui-muted transition-colors hover:text-ink"
      >
        <span aria-hidden="true">←</span>
        {t("pro.backToPlans")}
      </button>

      <h2 className="mt-3 text-[24px] font-semibold tracking-[-0.02em] text-ink">
        {t("pro.checkoutHeading")}
      </h2>

      {/* What is being bought, restated at the top of the step that takes the
          money. The old page put this at the bottom, after the wallet form. */}
      <div className="mt-4 flex items-baseline justify-between gap-3 rounded-xl border border-ui-line bg-cream px-4 py-3">
        <span className="text-[14px] text-ui-muted">{planLabel}</span>
        <span className="text-[18px] font-semibold text-ink tabular">{total}</span>
      </div>

      {/* Ahead of the methods, never after them. A reader deciding how to pay
          has stopped reading by the time they reach a footnote. */}
      <div
        role="status"
        className="mt-3 flex gap-3 rounded-xl border border-amber bg-amber/5 p-4"
      >
        <span className="mt-[2px] shrink-0 text-amberInk" aria-hidden="true">
          <PixelIcon name="warn" size={15} />
        </span>
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-ink">{t("pro.demoBanner")}</p>
          <p className="mt-1 text-[14px] leading-relaxed text-ui-muted">
            {t("pro.demoBannerBody")}
          </p>
        </div>
      </div>

      <h3 className="mt-6 text-[15px] font-semibold text-ink">
        {t("pro.methodHeading")}
      </h3>

      <div className="mt-3 space-y-4">
        {groups.map((g) => (
          <fieldset key={g.key}>
            <legend className="mb-2 text-[13px] font-medium text-ui-muted">
              {g.label}
            </legend>
            {/*
              A vertical list of full-width rows, not a two-column grid of
              tiles. Payment methods are a list people read top to bottom
              looking for their own; a grid makes the eye scan in two
              directions to answer a one-dimensional question, and it left the
              wide wordmarks (bKash, Nagad) cramped against the short ones.
            */}
            <div className="divide-y divide-ui-line overflow-hidden rounded-xl border border-ui-line">
              {g.items.map((m) => {
                const active = selected === m.id;
                return (
                  <label
                    key={m.id}
                    className={cx(
                      // WRAPS. At 375px the card row carries three scheme
                      // marks, the word "Card" and the settlement note, and a
                      // single non-wrapping line put Google Pay straight on
                      // top of both of them. Nothing here may assume it fits.
                      "flex min-h-[60px] cursor-pointer flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 transition-colors",
                      active ? "bg-cream" : "bg-paper hover:bg-cream/60",
                      "focus-within:outline-none focus-within:ring-2 focus-within:ring-inset focus-within:ring-amber"
                    )}
                  >
                    <input
                      type="radio"
                      name="payment-method"
                      value={m.id}
                      checked={active}
                      onChange={() => onSelect(m.id)}
                      className="sr-only"
                    />

                    {/* A drawn radio dot. The native control is hidden to keep
                        the row clickable edge to edge, so the row has to show
                        its own selected state — an outline alone is not enough
                        when the rows sit flush against each other. */}
                    <span
                      aria-hidden="true"
                      className={cx(
                        "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors",
                        active ? "border-ink bg-ink" : "border-ui-lineStrong bg-paper"
                      )}
                    >
                      {active && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </span>

                    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1">
                      <MethodMark id={m.id} height={22} />
                      {markIsWordmark(m.id) ? (
                        <span className="sr-only">{m.label}</span>
                      ) : (
                        <span className="text-[15px] font-medium text-ink">
                          {m.label}
                        </span>
                      )}
                    </span>

                    {/*
                      Rendered ONCE and allowed to move, rather than as a
                      mobile copy plus a desktop copy — two elements with the
                      same words is the same sentence read twice to a screen
                      reader. Below `sm` it takes a full line of its own,
                      indented to clear the radio; from `sm` it returns to the
                      end of the row.
                    */}
                    <span className="w-full shrink-0 pl-[30px] text-[12px] text-ui-faint sm:w-auto sm:pl-0">
                      {m.settlement === "manual_review"
                        ? t("pro.tagVerified")
                        : t("pro.tagSandbox")}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      {children}
    </div>
  );
}

/* ─────────────────────── method-specific bodies ────────────────────────── */

export function ManualPayForm({
  method,
  amount,
  reference,
  msisdn,
  onReference,
  onMsisdn,
  fieldError,
  t,
}: {
  method: MethodTile;
  amount: string;
  reference: string;
  msisdn: string;
  onReference: (v: string) => void;
  onMsisdn: (v: string) => void;
  fieldError: string | null;
  t: Translate;
}) {
  return (
    <div className="rounded-xl border border-ui-line bg-paper p-4">
      <div className="flex items-center gap-2.5">
        <MethodMark id={method.id} height={22} />
        <p className="text-[15px] font-semibold text-ink">{t("pro.manualHeading")}</p>
      </div>

      {/* The three steps, numbered, because this is a task performed in a
          different app and then returned from. */}
      <ol className="mt-3.5 space-y-3">
        <Step n={1}>
          {t("pro.manualStep1")} <span className="font-semibold">{method.label}</span>
        </Step>
        <Step n={2}>
          {t("pro.manualStep2")}
          <span className="mt-2 flex flex-wrap items-center gap-2">
            <code className="rounded-md border border-ui-lineStrong bg-cream px-2 py-1 font-code text-[14px] font-semibold tracking-wider text-ui-muted line-through tabular">
              {method.merchant_number}
            </code>
            <span className="text-[14px] text-ui-muted">· {amount}</span>
            {/* Struck through AND labelled. Someone skimming a payment screen
                sees a number next to an amount and reaches for their wallet;
                the number itself has to look unusable. */}
            {method.is_demo && (
              <PixelBadge tone="urgent">{t("pro.demoNumberWarning")}</PixelBadge>
            )}
          </span>
        </Step>
        <Step n={3}>{t("pro.manualStep3")}</Step>
      </ol>

      <div className="mt-4 space-y-3">
        <PixelInput
          label={t("pro.referenceLabel")}
          name="payer_reference"
          value={reference}
          onChange={onReference}
          required
          error={fieldError ?? undefined}
          hint={t("pro.referenceHint")}
        />
        <PixelInput
          label={t("pro.msisdnLabel")}
          name="payer_msisdn"
          value={msisdn}
          onChange={onMsisdn}
          hint={t("pro.msisdnHint")}
        />
      </div>

      {/* Stated on the screen that collects the number, not only in the docs. */}
      <p className="mt-3.5 border-t border-ui-line pt-3 text-[13px] leading-relaxed text-ui-muted">
        {t("pro.manualSecurity")}
      </p>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className="mt-[1px] flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-ink text-[12px] font-semibold text-white"
      >
        {n}
      </span>
      <span className="text-[14px] leading-relaxed text-ink">{children}</span>
    </li>
  );
}

export function SandboxNotice({ t }: { t: Translate }) {
  return (
    <div role="status" className="rounded-xl border border-amber bg-amber/5 p-4">
      <p className="text-[14px] font-semibold text-ink">{t("pro.sandboxHeading")}</p>
      <p className="mt-1 text-[14px] leading-relaxed text-ui-muted">
        {t("pro.sandboxBody")}
      </p>
    </div>
  );
}
