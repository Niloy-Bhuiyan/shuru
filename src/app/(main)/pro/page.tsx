"use client";

/**
 * SHURU PRO — the one screen where money is discussed.
 *
 * Three things this page has to do, in this order of importance:
 *
 *  1. SAY WHAT STAYS FREE. A pricing page that lists only what you get when
 *     you pay reads as a paywall over the whole product. The free column here
 *     is not a courtesy — matching, the Reality Check, eligibility, ATS
 *     scoring, résumé building and export are the parts Shuru computes itself,
 *     and charging for those would be charging for the honest half.
 *
 *  2. SAY, UNMISSABLY, THAT NO MONEY MOVES. Every method here is a
 *     demonstration — bKash, Nagad and Rocket included. What differs between
 *     them is the settlement mechanism being shown: a signed webhook, or an
 *     administrator approving the transaction. A banner states it before the
 *     methods, and each method restates it on its own tile, because a payment
 *     screen is exactly where a reader stops believing generic disclaimers.
 *
 *  3. NEVER ASK FOR A CREDENTIAL. There is no card field and no PIN field on
 *     this page, and there must never be one. The mobile-money flow collects a
 *     transaction id the payer already has, which is a receipt number.
 *
 * The purchase itself is deliberately thin here: the body sent to the server
 * is `{ period, method }` plus a receipt number. Price, duration and identity
 * are all decided server-side — see /api/subscription/checkout.
 *
 * ── Why this reads like a checkout now ────────────────────────────────────
 *
 * The mechanics were right and the presentation was not, in three specific
 * ways that a payer notices and a developer does not:
 *
 *  - The period control was a segmented toggle with the price in a separate
 *    card below it, so choosing a plan meant flipping a switch and then
 *    looking somewhere else to find out what it did. Two selectable plan
 *    cards put the choice and its consequence in the same object.
 *  - Methods were named in text. "Card" is a form factor, not a brand, and a
 *    payer scanning a checkout is looking for their own scheme's mark. The
 *    tiles carry the real marks now.
 *  - There was no order summary. Every checkout has one, because the last
 *    thing before an irreversible-looking button should be a restatement of
 *    what is about to happen — here, including the line saying it isn't.
 *
 * Both pickers are real radio inputs rather than buttons with `aria-pressed`.
 * They are mutually exclusive choices, which is what a radio group IS, and it
 * buys arrow-key navigation and the correct screen-reader announcement
 * ("2 of 4") for free rather than through hand-rolled key handling.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PixelButton } from "@/components/pixel/PixelButton";
import { PixelCard } from "@/components/pixel/PixelCard";
import { PixelInput } from "@/components/pixel/PixelInput";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import { PixelBadge } from "@/components/pixel/PixelBadge";
import { LoadingBlock } from "@/components/LoadingBlock";
import { MethodMark, markIsWordmark } from "@/components/brand/MethodMark";
import { usePro } from "@/hooks/usePro";
import { useLang, type StringKey } from "@/lib/i18n";
import { cx } from "@/lib/cx";
import { formatMoney, type BillingPeriod } from "@/lib/subscription";
import type { PaymentMethodId } from "@/lib/payments/methods";
import {
  CheckoutFailed,
  getCatalogue,
  listMyPayments,
  startCheckout,
  type Catalogue,
  type MethodInfo,
  type PaymentRow,
} from "@/lib/data/subscription";

/** What Pro unlocks, and what it does not. Mirrors lib/subscription.ts. */
const PRO_ITEMS = [
  "pro.featAgent",
  "pro.featAsk",
  "pro.featForge",
  "pro.featDiscover",
] as const;
const FREE_ITEMS = [
  "pro.freeRadar",
  "pro.freeReality",
  "pro.freeForge",
  "pro.freeVault",
] as const;

export default function ProPage() {
  const { t, lang } = useLang();
  const router = useRouter();
  const { isPro, subscription, viaAdmin, loading: proLoading, refresh } = usePro();

  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loadError, setLoadError] = useState(false);

  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  const [method, setMethod] = useState<PaymentMethodId | null>(null);
  const [reference, setReference] = useState("");
  const [msisdn, setMsisdn] = useState("");

  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const [c, p] = await Promise.all([getCatalogue(), listMyPayments()]);
      setCatalogue(c);
      setPayments(p);
    } catch {
      // Every load here can fail for the same boring reason, and a screen
      // stuck on a spinner is the one outcome with no way out. Show the
      // failure and a retry.
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected: MethodInfo | null =
    catalogue?.methods.find((m) => m.id === method) ?? null;
  const isManual = selected?.settlement === "manual_review";

  async function submit() {
    if (!selected) return;
    setFieldError(null);
    setFormError(null);

    if (isManual && !reference.trim()) {
      setFieldError(t("pro.errReferenceRequired"));
      return;
    }

    setBusy(true);
    try {
      const result = await startCheckout({
        period,
        method: selected.id,
        payerReference: isManual ? reference.trim() : undefined,
        payerMsisdn: isManual && msisdn.trim() ? msisdn.trim() : undefined,
      });

      if (result.status === "redirect") {
        router.push(result.redirect_url);
        return;
      }

      // Manual: nothing is granted yet, and the screen must not imply it was.
      setSubmitted(true);
      setReference("");
      setMsisdn("");
      await load();
    } catch (e) {
      const code = e instanceof CheckoutFailed ? e.code : "checkout_failed";
      const message = CHECKOUT_ERRORS[code];
      if (code === "reference_required" || code === "reference_already_submitted") {
        setFieldError(t(message ?? "pro.errGeneric"));
      } else {
        setFormError(t(message ?? "pro.errGeneric"));
      }
    } finally {
      setBusy(false);
    }
  }

  if (proLoading || (!catalogue && !loadError)) {
    return (
      <main className="px-4 py-6">
        <LoadingBlock />
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="px-4 py-6">
        <PixelCard accent="alert" className="p-4">
          <h1 className="font-sans text-[18px] font-semibold text-ink">
            {t("pro.loadErrTitle")}
          </h1>
          <p className="mt-2 font-sans text-[14px] leading-relaxed text-ui-muted">
            {t("pro.loadErrBody")}
          </p>
          <PixelButton className="mt-3" onClick={() => void load()}>
            {t("error.retry")}
          </PixelButton>
        </PixelCard>
      </main>
    );
  }

  const plan = catalogue!.plans[period];

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      {/* ── who you currently are, before any pitch ───────────────────── */}
      <StatusBanner
        isPro={isPro}
        viaAdmin={viaAdmin}
        until={subscription?.current_period_end ?? null}
        canceled={subscription?.status === "canceled"}
        lang={lang}
        t={t}
      />

      <h1 className="mt-5 font-sans text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ink">
        {t("pro.title")}
      </h1>
      <p className="mt-2 max-w-prose font-sans text-[15px] leading-relaxed text-ui-muted">
        {t("pro.subtitle")}
      </p>

      {/* ── what it costs ────────────────────────────────────────────── */}
      <section aria-labelledby="pro-price" className="mt-7">
        <h2
          id="pro-price"
          className="font-sans text-[16px] font-semibold tracking-[-0.01em] text-ink"
        >
          {t("pro.planHeading")}
        </h2>

        <div
          role="radiogroup"
          aria-labelledby="pro-price"
          className="mt-3 grid gap-2.5 sm:grid-cols-2"
        >
          {(["monthly", "yearly"] as const).map((p) => {
            const active = period === p;
            const info = catalogue!.plans[p];
            return (
              <label
                key={p}
                className={cx(
                  "relative cursor-pointer rounded-xl border p-4 transition-colors",
                  active
                    ? "border-ink bg-paper ring-1 ring-ink"
                    : "border-ui-line bg-paper hover:border-ui-lineStrong hover:bg-cream",
                  // The focus ring has to live on the label, because the input
                  // it belongs to is visually hidden.
                  "focus-within:outline-none focus-within:ring-2 focus-within:ring-amber"
                )}
              >
                <input
                  type="radio"
                  name="billing-period"
                  value={p}
                  checked={active}
                  onChange={() => setPeriod(p)}
                  className="sr-only"
                />

                <div className="flex items-center justify-between gap-2">
                  <span className="font-sans text-[14px] font-medium text-ink">
                    {t(p === "monthly" ? "pro.monthly" : "pro.yearly")}
                  </span>
                  {p === "yearly" && (
                    <PixelBadge tone="qualify">{t("pro.bestValue")}</PixelBadge>
                  )}
                </div>

                <p className="mt-2 font-sans text-[30px] font-semibold leading-none tracking-[-0.02em] text-ink tabular">
                  {formatMoney(info.price)}
                </p>
                <p className="mt-1.5 font-sans text-[13px] text-ui-muted">
                  {t(p === "monthly" ? "pro.per30" : "pro.per365")}
                </p>
                {p === "yearly" && (
                  <p className="mt-2 font-sans text-[13px] leading-snug text-mint">
                    {t("pro.yearlySaving")}
                  </p>
                )}
              </label>
            );
          })}
        </div>
      </section>

      {/* ── what you get, and what you already have ──────────────────── */}
      <section aria-labelledby="pro-includes" className="mt-7">
        <h2
          id="pro-includes"
          className="font-sans text-[16px] font-semibold tracking-[-0.01em] text-ink"
        >
          {t("pro.includesHeading")}
        </h2>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <ul className="space-y-2.5 rounded-xl border border-ui-line bg-paper p-4">
            {PRO_ITEMS.map((k) => (
              <li key={k} className="flex gap-2.5">
                <span className="mt-[3px] shrink-0 text-amberInk" aria-hidden="true">
                  <PixelIcon name="check" size={14} />
                </span>
                <span className="font-sans text-[14px] leading-relaxed text-ink">
                  {t(k)}
                </span>
              </li>
            ))}
          </ul>

          {/*
            The free column, given equal weight rather than a footnote. A
            reader should be able to leave this page having decided NOT to pay
            and still know exactly what they keep.
          */}
          <div className="rounded-xl border border-ui-line bg-cream p-4">
            <p className="font-sans text-[13px] font-semibold text-ui-muted">
              {t("pro.freeHeading")}
            </p>
            <ul className="mt-2.5 space-y-2">
              {FREE_ITEMS.map((k) => (
                <li
                  key={k}
                  className="font-sans text-[14px] leading-relaxed text-ui-muted"
                >
                  {t(k)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/*
        ── how to pay ─────────────────────────────────────────────────────
        Rendered for everyone, deliberately.

        This used to be hidden whenever `isPro` was true with no subscription
        row — which is exactly an administrator, since their access comes from
        their role. The result was that the one account most likely to be
        checking the payment flow was the one account that could not see it.

        An admin is also genuinely allowed to buy: the checkout route asks for
        a session and nothing more. Hiding a purchase someone is permitted to
        make is the wrong call even when they have no reason to want it.

        The heading keys off whether they actually HOLD a subscription, not off
        entitlement — "renew" is nonsense to someone who has never bought one.
      */}
      <section aria-labelledby="pro-pay" className="mt-8">
        <h2
          id="pro-pay"
          className="font-sans text-[16px] font-semibold tracking-[-0.01em] text-ink"
        >
          {subscription ? t("pro.renewHeading") : t("pro.payHeading")}
        </h2>

        {/* Ahead of the methods, not after them. A reader deciding how to
            pay has stopped reading by the time they reach a footnote. */}
        <div
          role="status"
          className="mt-3 flex gap-3 rounded-xl border border-amber bg-amber/5 p-4"
        >
          <span className="mt-[3px] shrink-0 text-amberInk" aria-hidden="true">
            <PixelIcon name="warn" size={15} />
          </span>
          <div className="min-w-0">
            <p className="font-sans text-[14px] font-semibold text-ink">
              {t("pro.demoBanner")}
            </p>
            <p className="mt-1 font-sans text-[14px] leading-relaxed text-ui-muted">
              {t("pro.demoBannerBody")}
            </p>
          </div>
        </div>

        <MethodPicker
          methods={catalogue!.methods}
          selected={method}
          onSelect={(id) => {
            setMethod(id);
            setSubmitted(false);
            setFieldError(null);
            setFormError(null);
          }}
          t={t}
        />

        {selected && (
          <div className="mt-5">
            {isManual ? (
              <ManualPayForm
                method={selected}
                amount={formatMoney(plan.price)}
                reference={reference}
                msisdn={msisdn}
                onReference={setReference}
                onMsisdn={setMsisdn}
                fieldError={fieldError}
                t={t}
              />
            ) : (
              <SandboxNotice t={t} />
            )}

            <OrderSummary
              planLabel={t(period === "monthly" ? "pro.monthly" : "pro.yearly")}
              methodLabel={selected.label}
              total={formatMoney(plan.price)}
              t={t}
            />

            {formError && (
              <p
                role="alert"
                className="mt-3 rounded-lg border border-alert bg-alert/5 p-3 font-sans text-[14px] leading-relaxed text-alert"
              >
                {formError}
              </p>
            )}

            {submitted ? (
              <div
                role="status"
                aria-live="polite"
                className="mt-3 rounded-xl border border-mint bg-mint/5 p-4"
              >
                <p className="font-sans text-[14px] font-semibold text-ink">
                  {t("pro.submittedTitle")}
                </p>
                <p className="mt-1 font-sans text-[14px] leading-relaxed text-ui-muted">
                  {t("pro.submittedBody")}
                </p>
              </div>
            ) : (
              <PixelButton
                full
                size="lg"
                className="mt-4"
                disabled={busy}
                onClick={() => void submit()}
              >
                {busy
                  ? t("pro.working")
                  : isManual
                    ? t("pro.submitReference")
                    : t("pro.continueCheckout")}
              </PixelButton>
            )}
          </div>
        )}
      </section>

      {/* ── the receipts ─────────────────────────────────────────────── */}
      {payments.length > 0 && (
        <section aria-labelledby="pro-history" className="mt-9">
          <h2
            id="pro-history"
            className="font-sans text-[16px] font-semibold tracking-[-0.01em] text-ink"
          >
            {t("pro.historyHeading")}
          </h2>
          <ul className="mt-3 space-y-2">
            {payments.map((p) => (
              <PaymentRowItem key={p.id} row={p} lang={lang} t={t} />
            ))}
          </ul>
        </section>
      )}

      <p className="mt-9 font-sans text-[13px] leading-relaxed text-ui-faint">
        {t("pro.footerNote")}{" "}
        <Link href="/you" className="underline">
          {t("nav.you")}
        </Link>
      </p>

      {/* Refresh the entitlement when returning from a completed checkout. */}
      <RefreshOnFocus onFocus={refresh} />
    </main>
  );
}

/* ────────────────────────────────────────────────────────────────────── */

/**
 * The translator, passed down rather than re-read from context in every
 * subcomponent. Typed against `StringKey` so a key that does not exist is a
 * build error here, not a raw dotted string rendered to a user.
 */
type Translate = (key: StringKey) => string;

function StatusBanner({
  isPro,
  viaAdmin,
  until,
  canceled,
  lang,
  t,
}: {
  isPro: boolean;
  viaAdmin: boolean;
  until: string | null;
  canceled: boolean;
  lang: string;
  t: Translate;
}) {
  if (viaAdmin) {
    return (
      <div role="status" className="rounded-xl border border-ui-lineStrong bg-cream p-4">
        <p className="font-sans text-[14px] leading-relaxed text-ink">
          {t("pro.adminAccess")}
        </p>
      </div>
    );
  }

  if (!isPro) return null;

  return (
    <div role="status" className="rounded-xl border border-mint bg-mint/5 p-4">
      <p className="font-sans text-[14px] font-semibold text-ink">
        {t("pro.activeTitle")}
      </p>
      <p className="mt-1 font-sans text-[14px] leading-relaxed text-ui-muted">
        {canceled ? t("pro.activeUntilCanceled") : t("pro.activeUntil")}{" "}
        <span className="font-semibold text-ink tabular">
          {until ? formatDate(until, lang) : "—"}
        </span>
      </p>
    </div>
  );
}

function MethodPicker({
  methods,
  selected,
  onSelect,
  t,
}: {
  methods: MethodInfo[];
  selected: PaymentMethodId | null;
  onSelect: (id: PaymentMethodId) => void;
  t: Translate;
}) {
  // Grouped by who each group is for. A Bangladeshi student should not have to
  // read past four international options to find bKash, and someone abroad
  // should not be left wondering whether any of this works for them.
  const groups: { key: string; label: string; ids: MethodInfo[] }[] = [
    { key: "bd", label: t("pro.groupBd"), ids: methods.filter((m) => m.region === "bd") },
    {
      key: "intl",
      label: t("pro.groupIntl"),
      ids: methods.filter((m) => m.region === "international"),
    },
    { key: "any", label: t("pro.groupDemo"), ids: methods.filter((m) => m.region === "any") },
  ].filter((g) => g.ids.length > 0);

  return (
    <div className="mt-5">
      <h3 className="font-sans text-[14px] font-medium text-ink">
        {t("pro.methodHeading")}
      </h3>

      <div className="mt-3 space-y-4">
        {groups.map((g) => (
          <fieldset key={g.key}>
            <legend className="mb-2 font-sans text-[13px] font-medium text-ui-muted">
              {g.label}
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {g.ids.map((m) => {
                const active = selected === m.id;
                const wordmark = markIsWordmark(m.id);
                return (
                  <label
                    key={m.id}
                    className={cx(
                      "flex min-h-[68px] cursor-pointer flex-col justify-center gap-1.5 rounded-xl border px-3.5 py-3 transition-colors",
                      active
                        ? "border-ink bg-paper ring-1 ring-ink"
                        : "border-ui-line bg-paper hover:border-ui-lineStrong hover:bg-cream",
                      !m.available && "opacity-60",
                      "focus-within:outline-none focus-within:ring-2 focus-within:ring-amber"
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

                    <span className="flex min-h-[22px] items-center gap-2">
                      <MethodMark id={m.id} height={22} />
                      {/* A wordmark already says the name; printing it again
                          beside the logo is the label twice. The marks are
                          aria-hidden, so the accessible name comes from the
                          visually hidden span that always renders. */}
                      {!wordmark && (
                        <span className="font-sans text-[15px] font-medium text-ink">
                          {m.label}
                        </span>
                      )}
                      {wordmark && <span className="sr-only">{m.label}</span>}
                    </span>

                    {/* Names the MECHANISM, and says "demo" on every single
                        tile. One banner at the top of the section is not
                        enough on a screen where the reader is deciding whether
                        to part with money — the reassurance has to be where
                        the choice is. */}
                    <span className="font-sans text-[12px] leading-snug text-ui-faint">
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
    </div>
  );
}

/**
 * The restatement before the button.
 *
 * The "total" line is the one number a payer checks twice, so it gets the
 * weight — and the line under it saying the number is hypothetical gets to
 * sit in the same box rather than three sections away.
 */
function OrderSummary({
  planLabel,
  methodLabel,
  total,
  t,
}: {
  planLabel: string;
  methodLabel: string;
  total: string;
  t: Translate;
}) {
  return (
    <section
      aria-labelledby="pro-summary"
      className="mt-4 rounded-xl border border-ui-line bg-cream p-4"
    >
      <h3
        id="pro-summary"
        className="font-sans text-[13px] font-semibold text-ui-muted"
      >
        {t("pro.summaryHeading")}
      </h3>

      <dl className="mt-2.5 space-y-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="font-sans text-[14px] text-ui-muted">
            {t("pro.summaryPlan")}
          </dt>
          <dd className="font-sans text-[14px] text-ink">{planLabel}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="font-sans text-[14px] text-ui-muted">
            {t("pro.summaryMethod")}
          </dt>
          <dd className="font-sans text-[14px] text-ink">{methodLabel}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-t border-ui-line pt-2.5">
          <dt className="font-sans text-[14px] font-semibold text-ink">
            {t("pro.summaryTotal")}
          </dt>
          <dd className="font-sans text-[18px] font-semibold text-ink tabular">
            {total}
          </dd>
        </div>
      </dl>

      <p className="mt-2.5 font-sans text-[12px] leading-relaxed text-ui-faint">
        {t("pro.summaryNoCharge")}
      </p>
    </section>
  );
}

function ManualPayForm({
  method,
  amount,
  reference,
  msisdn,
  onReference,
  onMsisdn,
  fieldError,
  t,
}: {
  method: MethodInfo;
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
        <p className="font-sans text-[15px] font-semibold text-ink">
          {t("pro.manualHeading")}
        </p>
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
            <span className="font-sans text-[14px] text-ui-muted">· {amount}</span>
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
      <p className="mt-3.5 border-t border-ui-line pt-3 font-sans text-[13px] leading-relaxed text-ui-muted">
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
        className="mt-[1px] flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-ink font-sans text-[12px] font-semibold text-white"
      >
        {n}
      </span>
      <span className="font-sans text-[14px] leading-relaxed text-ink">
        {children}
      </span>
    </li>
  );
}

function SandboxNotice({ t }: { t: Translate }) {
  return (
    <div role="status" className="rounded-xl border border-amber bg-amber/5 p-4">
      <p className="font-sans text-[14px] font-semibold text-ink">
        {t("pro.sandboxHeading")}
      </p>
      <p className="mt-1 font-sans text-[14px] leading-relaxed text-ui-muted">
        {t("pro.sandboxBody")}
      </p>
    </div>
  );
}

function PaymentRowItem({
  row,
  lang,
  t,
}: {
  row: PaymentRow;
  lang: string;
  t: Translate;
}) {
  const tone =
    row.status === "succeeded"
      ? "qualify"
      : row.status === "failed"
        ? "alert"
        : "borderline";

  const label =
    row.status === "succeeded"
      ? t("pro.stSucceeded")
      : row.status === "failed"
        ? row.review_status === "rejected"
          ? t("pro.stRejected")
          : t("pro.stFailed")
        : row.review_status === "pending"
          ? t("pro.stAwaitingReview")
          : t("pro.stPending");

  return (
    <li className="rounded-xl border border-ui-line bg-paper p-3.5">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2.5">
          <MethodMark id={row.method} height={18} />
          <span className="font-sans text-[15px] font-semibold text-ink tabular">
            {formatMoney({ amountMinor: row.amount_minor, currency: row.currency })}
          </span>
        </span>
        <PixelBadge tone={tone}>{label}</PixelBadge>
      </div>
      <p className="mt-1.5 font-sans text-[13px] text-ui-muted">
        {formatDate(row.created_at, lang)} · {row.method}
        {row.is_sandbox && ` · ${t("pro.tagSandbox")}`}
        {row.payer_reference && ` · ${row.payer_reference}`}
      </p>
      {/* A rejection the payer cannot read the reason for is indistinguishable
          from their money vanishing. */}
      {row.review_status === "rejected" && row.review_note && (
        <p className="mt-2 rounded-lg border border-alert/30 bg-alert/5 p-2.5 font-sans text-[13px] leading-relaxed text-ink">
          {row.review_note}
        </p>
      )}
    </li>
  );
}

/**
 * Re-read the entitlement when the tab regains focus.
 *
 * The sandbox checkout finishes on another route and the manual path finishes
 * in a different app entirely, so the most common way to arrive back at a
 * stale version of this page is a tab switch.
 */
function RefreshOnFocus({ onFocus }: { onFocus: () => void }) {
  useEffect(() => {
    const handler = () => onFocus();
    window.addEventListener("focus", handler);
    return () => window.removeEventListener("focus", handler);
  }, [onFocus]);
  return null;
}

function formatDate(iso: string, lang: string): string {
  try {
    return new Date(iso).toLocaleDateString(lang === "bn" ? "bn-BD" : "en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

/** Server refusal codes → the string key that explains them. */
const CHECKOUT_ERRORS: Record<string, StringKey> = {
  reference_required: "pro.errReferenceRequired",
  reference_already_submitted: "pro.errReferenceDuplicate",
  bad_period: "pro.errGeneric",
  bad_method: "pro.errGeneric",
  could_not_record_payment: "pro.errServer",
  could_not_start_payment: "pro.errServer",
};
