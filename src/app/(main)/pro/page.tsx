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
 *  2. BE HONEST ABOUT WHICH MONEY IS REAL. Card and Demo run a labelled
 *     sandbox: nothing is charged. bKash, Nagad and Rocket move real money the
 *     payer sends from their own wallet app. Those are different enough that
 *     one generic "checkout" would be a lie to one of the two groups, so each
 *     path states its own truth before the payer commits.
 *
 *  3. NEVER ASK FOR A CREDENTIAL. There is no card field and no PIN field on
 *     this page, and there must never be one. The mobile-money flow collects a
 *     transaction id the payer already has, which is a receipt number.
 *
 * The purchase itself is deliberately thin here: the body sent to the server
 * is `{ period, method }` plus a receipt number. Price, duration and identity
 * are all decided server-side — see /api/subscription/checkout.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PixelButton } from "@/components/pixel/PixelButton";
import { PixelCard } from "@/components/pixel/PixelCard";
import { PixelInput } from "@/components/pixel/PixelInput";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import { LoadingBlock } from "@/components/LoadingBlock";
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
const PRO_ITEMS = ["pro.featAgent", "pro.featAsk", "pro.featForge"] as const;
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
          <h1 className="font-pixel text-sm text-ink">{t("pro.loadErrTitle")}</h1>
          <p className="mt-2 font-mono text-[12px] leading-relaxed text-ui-muted">
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
    <main className="px-4 py-6">
      {/* ── who you currently are, before any pitch ───────────────────── */}
      <StatusBanner
        isPro={isPro}
        viaAdmin={viaAdmin}
        until={subscription?.current_period_end ?? null}
        canceled={subscription?.status === "canceled"}
        lang={lang}
        t={t}
      />

      <h1 className="mt-5 font-pixel text-lg leading-tight text-ink">
        {t("pro.title")}
      </h1>
      <p className="mt-2 max-w-prose font-mono text-[12px] leading-relaxed text-ui-muted">
        {t("pro.subtitle")}
      </p>

      {/* ── what it costs ────────────────────────────────────────────── */}
      <section aria-labelledby="pro-price" className="mt-5">
        <h2 id="pro-price" className="sr-only">
          {t("pro.priceHeading")}
        </h2>

        <div
          role="group"
          aria-label={t("pro.priceHeading")}
          className="inline-flex overflow-hidden rounded-lg border border-ui-lineStrong"
        >
          {(["monthly", "yearly"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              aria-pressed={period === p}
              className={cx(
                // 44px minimum target height — this is the first control on
                // the page and it is used on a phone.
                "min-h-[44px] px-4 font-mono text-[12px] font-bold transition-colors",
                period === p
                  ? "bg-ink text-cream"
                  : "bg-paper text-ink hover:bg-cream"
              )}
            >
              {t(p === "monthly" ? "pro.monthly" : "pro.yearly")}
            </button>
          ))}
        </div>

        <PixelCard className="mt-3 p-4">
          <p className="font-pixel text-2xl leading-none text-ink tabular">
            {formatMoney(plan.price)}
          </p>
          <p className="mt-1.5 font-mono text-[12px] text-ui-muted">
            {t(period === "monthly" ? "pro.per30" : "pro.per365")}
          </p>
          {period === "yearly" && (
            <p className="mt-2 font-mono text-[11px] text-mint">
              {t("pro.yearlySaving")}
            </p>
          )}
        </PixelCard>
      </section>

      {/* ── what you get, and what you already have ──────────────────── */}
      <section aria-labelledby="pro-includes" className="mt-6">
        <h2
          id="pro-includes"
          className="font-pixel text-sm text-ink"
        >
          {t("pro.includesHeading")}
        </h2>

        <ul className="mt-3 space-y-2">
          {PRO_ITEMS.map((k) => (
            <li key={k} className="flex gap-2.5">
              <span className="mt-0.5 shrink-0 text-amberInk" aria-hidden="true">
                <PixelIcon name="check" size={14} />
              </span>
              <span className="font-mono text-[12px] leading-relaxed text-ink">
                {t(k)}
              </span>
            </li>
          ))}
        </ul>

        {/*
          The free column, given equal weight rather than a footnote. A reader
          should be able to leave this page having decided NOT to pay and still
          know exactly what they keep.
        */}
        <div className="mt-4 rounded-lg border border-ui-line bg-cream p-3.5">
          <p className="font-mono text-[11px] font-bold tracking-[0.14em] text-ui-muted">
            {t("pro.freeHeading")}
          </p>
          <ul className="mt-2 space-y-1.5">
            {FREE_ITEMS.map((k) => (
              <li
                key={k}
                className="font-mono text-[12px] leading-relaxed text-ui-muted"
              >
                {t(k)}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── how to pay ───────────────────────────────────────────────── */}
      {!isPro || subscription ? (
        <section aria-labelledby="pro-pay" className="mt-6">
          <h2 id="pro-pay" className="font-pixel text-sm text-ink">
            {isPro ? t("pro.renewHeading") : t("pro.payHeading")}
          </h2>

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

          {selected && !selected.available && (
            <p
              role="status"
              className="mt-3 rounded-lg border border-ui-lineStrong bg-cream p-3 font-mono text-[12px] leading-relaxed text-ui-muted"
            >
              {t("pro.methodUnavailable")}
              {selected.unconfigured_env_var && (
                <span className="mt-1 block font-code text-[11px] text-ink">
                  {selected.unconfigured_env_var}
                </span>
              )}
            </p>
          )}

          {selected?.available && (
            <div className="mt-4">
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
                  className="mt-3 rounded-lg border border-alert bg-alert/5 p-3 font-mono text-[12px] leading-relaxed text-alert"
                >
                  {formError}
                </p>
              )}

              {submitted ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="mt-3 rounded-lg border border-mint bg-mint/5 p-3.5"
                >
                  <p className="font-pixel text-[13px] text-ink">
                    {t("pro.submittedTitle")}
                  </p>
                  <p className="mt-1.5 font-mono text-[12px] leading-relaxed text-ui-muted">
                    {t("pro.submittedBody")}
                  </p>
                </div>
              ) : (
                <PixelButton
                  full
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
      ) : null}

      {/* ── the receipts ─────────────────────────────────────────────── */}
      {payments.length > 0 && (
        <section aria-labelledby="pro-history" className="mt-8">
          <h2 id="pro-history" className="font-pixel text-sm text-ink">
            {t("pro.historyHeading")}
          </h2>
          <ul className="mt-3 space-y-2">
            {payments.map((p) => (
              <PaymentRowItem key={p.id} row={p} lang={lang} t={t} />
            ))}
          </ul>
        </section>
      )}

      <p className="mt-8 font-mono text-[11px] leading-relaxed text-ui-faint">
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
      <div
        role="status"
        className="rounded-lg border border-ui-lineStrong bg-cream p-3.5"
      >
        <p className="font-mono text-[12px] leading-relaxed text-ink">
          {t("pro.adminAccess")}
        </p>
      </div>
    );
  }

  if (!isPro) return null;

  return (
    <div
      role="status"
      className="rounded-lg border border-mint bg-mint/5 p-3.5"
    >
      <p className="font-pixel text-[13px] text-ink">{t("pro.activeTitle")}</p>
      <p className="mt-1.5 font-mono text-[12px] leading-relaxed text-ui-muted">
        {canceled ? t("pro.activeUntilCanceled") : t("pro.activeUntil")}{" "}
        <span className="font-bold text-ink tabular">
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
    {
      key: "bd",
      label: t("pro.groupBd"),
      ids: methods.filter((m) => m.region === "bd"),
    },
    {
      key: "intl",
      label: t("pro.groupIntl"),
      ids: methods.filter((m) => m.region === "international"),
    },
    {
      key: "any",
      label: t("pro.groupDemo"),
      ids: methods.filter((m) => m.region === "any"),
    },
  ].filter((g) => g.ids.length > 0);

  return (
    <div className="mt-3 space-y-4">
      {groups.map((g) => (
        <fieldset key={g.key}>
          <legend className="mb-2 font-mono text-[11px] font-bold tracking-[0.14em] text-ui-muted">
            {g.label}
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {g.ids.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onSelect(m.id)}
                aria-pressed={selected === m.id}
                className={cx(
                  "min-h-[52px] rounded-lg border px-3 py-2.5 text-left transition-colors",
                  selected === m.id
                    ? "border-amber bg-amber/5 shadow-pixel-sm"
                    : "border-ui-lineStrong bg-paper hover:bg-cream",
                  !m.available && "opacity-60"
                )}
              >
                <span className="block font-mono text-[13px] font-bold text-ink">
                  {m.label}
                </span>
                <span className="mt-0.5 block font-mono text-[10px] leading-tight text-ui-muted">
                  {!m.available
                    ? t("pro.notEnabled")
                    : m.settlement === "manual_review"
                      ? t("pro.tagVerified")
                      : t("pro.tagSandbox")}
                </span>
              </button>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
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
    <div className="rounded-lg border border-ui-lineStrong bg-paper p-4 shadow-pixel-sm">
      <p className="font-pixel text-[13px] text-ink">
        {t("pro.manualHeading")}
      </p>

      {/* The three steps, numbered, because this is a task performed in a
          different app and then returned from. */}
      <ol className="mt-3 space-y-2.5">
        <Step n={1}>
          {t("pro.manualStep1")}{" "}
          <span className="font-bold">{method.label}</span>
        </Step>
        <Step n={2}>
          {t("pro.manualStep2")}
          <span className="mt-1.5 flex items-center gap-2">
            <code className="rounded border border-ui-lineStrong bg-cream px-2 py-1 font-code text-[14px] font-bold tracking-wider text-ink tabular">
              {method.merchant_number}
            </code>
            <span className="font-mono text-[12px] text-ui-muted">
              · {amount}
            </span>
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
      <p className="mt-3 border-t border-ui-line pt-3 font-mono text-[11px] leading-relaxed text-ui-muted">
        {t("pro.manualSecurity")}
      </p>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink font-mono text-[10px] font-bold text-cream"
      >
        {n}
      </span>
      <span className="font-mono text-[12px] leading-relaxed text-ink">
        {children}
      </span>
    </li>
  );
}

function SandboxNotice({ t }: { t: Translate }) {
  return (
    <div
      role="status"
      className="rounded-lg border border-amber bg-amber/5 p-3.5"
    >
      <p className="font-pixel text-[13px] text-ink">
        {t("pro.sandboxHeading")}
      </p>
      <p className="mt-1.5 font-mono text-[12px] leading-relaxed text-ui-muted">
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
      ? "text-mint"
      : row.status === "failed"
        ? "text-alert"
        : "text-ui-muted";

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
    <li className="rounded-lg border border-ui-line bg-paper p-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[12px] font-bold text-ink tabular">
          {formatMoney({
            amountMinor: row.amount_minor,
            currency: row.currency,
          })}
        </span>
        <span className={cx("font-mono text-[11px] font-bold", tone)}>
          {label}
        </span>
      </div>
      <p className="mt-1 font-mono text-[11px] text-ui-muted">
        {formatDate(row.created_at, lang)} · {row.method}
        {row.is_sandbox && ` · ${t("pro.tagSandbox")}`}
        {row.payer_reference && ` · ${row.payer_reference}`}
      </p>
      {/* A rejection the payer cannot read the reason for is indistinguishable
          from their money vanishing. */}
      {row.review_status === "rejected" && row.review_note && (
        <p className="mt-1.5 rounded border border-alert/30 bg-alert/5 p-2 font-mono text-[11px] leading-relaxed text-ink">
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
  method_not_configured: "pro.errMethodOff",
  bad_period: "pro.errGeneric",
  bad_method: "pro.errGeneric",
  could_not_record_payment: "pro.errServer",
  could_not_start_payment: "pro.errServer",
};
