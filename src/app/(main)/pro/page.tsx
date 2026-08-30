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
 *     and charging for those would be charging for the honest half. It gets
 *     its own card, the same width and the same type as the paid one.
 *
 *  2. SAY, UNMISSABLY, THAT NO MONEY MOVES. Every method here is a
 *     demonstration — bKash, Nagad and Rocket included. What differs between
 *     them is the settlement mechanism being shown: a signed webhook, or an
 *     administrator approving the transaction. A banner states it before the
 *     methods, and each method restates it on its own row.
 *
 *  3. NEVER ASK FOR A CREDENTIAL. There is no card field and no PIN field on
 *     this page, and there must never be one. The mobile-money flow collects a
 *     transaction id the payer already has, which is a receipt number.
 *
 * The purchase itself is deliberately thin here: the body sent to the server
 * is `{ period, method }` plus a receipt number. Price, duration and identity
 * are all decided server-side — see /api/subscription/checkout.
 *
 * ── Structure ─────────────────────────────────────────────────────────────
 *
 * This file owns DATA and STATE. Everything that decides what the screen looks
 * like lives in components/pro/ProUpgrade.tsx, which takes props and fetches
 * nothing. That split is not tidiness: /pro is behind the student route guard,
 * so a version of this screen was once designed, shipped and reviewed by
 * someone who had never seen it rendered. Presentational components can be put
 * in front of a browser with fixed data; a page that fetches cannot.
 *
 * The flow is two steps — plans, then checkout, with a way back. It used to be
 * one page carrying status, price, features, a demo banner, a method grid, a
 * wallet form, a summary and a receipt list all at once: everything present,
 * nothing resolved, and a reader deciding WHETHER to pay had to scroll through
 * the machinery of HOW to pay to finish reading the offer.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PixelButton } from "@/components/pixel/PixelButton";
import { PixelCard } from "@/components/pixel/PixelCard";
import { PixelBadge } from "@/components/pixel/PixelBadge";
import { LoadingBlock } from "@/components/LoadingBlock";
import { MethodMark } from "@/components/brand/MethodMark";
import {
  CheckoutPanel,
  ManualPayForm,
  PlanGrid,
  SandboxNotice,
} from "@/components/pro/ProUpgrade";
import { usePro } from "@/hooks/usePro";
import { useLang, type StringKey } from "@/lib/i18n";
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

type Step = "plans" | "checkout";

export default function ProPage() {
  const { t, lang } = useLang();
  const router = useRouter();
  const { isPro, subscription, viaAdmin, loading: proLoading, refresh } = usePro();

  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loadError, setLoadError] = useState(false);

  const [step, setStep] = useState<Step>("plans");
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
      <main className="mx-auto w-full max-w-3xl px-4 py-6">
        <PixelCard accent="alert" className="p-4">
          <h1 className="text-[18px] font-semibold text-ink">
            {t("pro.loadErrTitle")}
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed text-ui-muted">
            {t("pro.loadErrBody")}
          </p>
          <PixelButton className="mt-3" onClick={() => void load()}>
            {t("error.retry")}
          </PixelButton>
        </PixelCard>
      </main>
    );
  }

  const plans = catalogue!.plans;
  const plan = plans[period];

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      {step === "plans" ? (
        <>
          {/* Who you currently are, before any pitch. */}
          <StatusBanner
            isPro={isPro}
            viaAdmin={viaAdmin}
            until={subscription?.current_period_end ?? null}
            canceled={subscription?.status === "canceled"}
            lang={lang}
            t={t}
          />

          <div className={isPro || viaAdmin ? "mt-7 text-center" : "text-center"}>
            <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.02em] text-ink">
              {t("pro.title")}
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-ui-muted">
              {t("pro.subtitle")}
            </p>
          </div>

          <div className="mt-8">
            <PlanGrid
              period={period}
              onPeriod={setPeriod}
              monthly={plans.monthly.price}
              yearly={plans.yearly.price}
              /*
                Keyed off whether they actually HOLD a subscription, not off
                entitlement. An administrator is `isPro` by role, and this
                screen used to hide the whole purchase from them — so the one
                account most likely to be testing the payment flow was the only
                one that could not see it. They are also genuinely allowed to
                buy: the checkout route asks for a session and nothing more.
              */
              isPro={Boolean(subscription)}
              onUpgrade={() => {
                setStep("checkout");
                setSubmitted(false);
                setFieldError(null);
                setFormError(null);
              }}
              t={t}
            />
          </div>

          {payments.length > 0 && (
            <section aria-labelledby="pro-history" className="mt-10">
              <h2
                id="pro-history"
                className="text-[16px] font-semibold tracking-[-0.01em] text-ink"
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

          <p className="mt-10 text-[13px] leading-relaxed text-ui-faint">
            {t("pro.footerNote")}{" "}
            <Link href="/you" className="underline">
              {t("nav.you")}
            </Link>
          </p>
        </>
      ) : (
        <CheckoutPanel
          planLabel={`${t("pro.planPro")} · ${t(
            period === "monthly" ? "pro.monthly" : "pro.yearly"
          )}`}
          total={formatMoney(plan.price)}
          methods={catalogue!.methods}
          selected={method}
          onSelect={(id) => {
            setMethod(id);
            setSubmitted(false);
            setFieldError(null);
            setFormError(null);
          }}
          onBack={() => setStep("plans")}
          t={t}
        >
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

              {formError && (
                <p
                  role="alert"
                  className="mt-3 rounded-lg border border-alert bg-alert/5 p-3 text-[14px] leading-relaxed text-alert"
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
                  <p className="text-[14px] font-semibold text-ink">
                    {t("pro.submittedTitle")}
                  </p>
                  <p className="mt-1 text-[14px] leading-relaxed text-ui-muted">
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
        </CheckoutPanel>
      )}

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
        <p className="text-[14px] leading-relaxed text-ink">{t("pro.adminAccess")}</p>
      </div>
    );
  }

  if (!isPro) return null;

  return (
    <div role="status" className="rounded-xl border border-mint bg-mint/5 p-4">
      <p className="text-[14px] font-semibold text-ink">{t("pro.activeTitle")}</p>
      <p className="mt-1 text-[14px] leading-relaxed text-ui-muted">
        {canceled ? t("pro.activeUntilCanceled") : t("pro.activeUntil")}{" "}
        <span className="font-semibold text-ink tabular">
          {until ? formatDate(until, lang) : "—"}
        </span>
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
          <span className="text-[15px] font-semibold text-ink tabular">
            {formatMoney({ amountMinor: row.amount_minor, currency: row.currency })}
          </span>
        </span>
        <PixelBadge tone={tone}>{label}</PixelBadge>
      </div>
      <p className="mt-1.5 text-[13px] text-ui-muted">
        {formatDate(row.created_at, lang)} · {row.method}
        {row.is_sandbox && ` · ${t("pro.tagSandbox")}`}
        {row.payer_reference && ` · ${row.payer_reference}`}
      </p>
      {/* A rejection the payer cannot read the reason for is indistinguishable
          from their money vanishing. */}
      {row.review_status === "rejected" && row.review_note && (
        <p className="mt-2 rounded-lg border border-alert/30 bg-alert/5 p-2.5 text-[13px] leading-relaxed text-ink">
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
