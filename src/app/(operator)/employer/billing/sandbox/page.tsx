"use client";

/**
 * SANDBOX CHECKOUT — the page a payment provider would host.
 *
 * Everything on this screen exists to make one thing impossible to miss: no
 * money moves. The banner is not a footnote, the button says "(SANDBOX)", and
 * the success state says the payment was *recorded*, never that a card was
 * charged.
 *
 * Confirming does not flip a flag. It asks the server to deliver a signed
 * webhook to the real payment handler, which verifies the signature and grants
 * the entitlement. The flow is genuine; only the money is not.
 *
 * It now LOOKS like the hosted checkout it stands in for — a narrow centred
 * column, an order summary, the accepted-scheme marks, and one primary action
 * with the decline path demoted beneath it. That is not decoration: the whole
 * point of this page is to exercise the shape of a real provider handoff, and
 * a stand-in that looks nothing like the thing it stands in for tests the
 * mechanism while proving nothing about the experience.
 */

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PixelButton } from "@/components/pixel/PixelButton";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import { EmptyState } from "@/components/EmptyState";
import { LoadingBlock } from "@/components/LoadingBlock";
import {
  GooglePayMark,
  MastercardMark,
  VisaMark,
} from "@/components/brand/PaymentMarks";
import { useLang } from "@/lib/i18n";

type Outcome = "succeeded" | "failed";
type Phase = "idle" | "working" | "done" | "error";

/**
 * useSearchParams() opts its subtree out of prerendering, so it has to sit
 * under a Suspense boundary or the build fails on this route.
 *
 * This used to build only by accident. The student shell this page lived
 * under withheld its children behind a profile lookup that never resolves
 * during a prerender, so the component below was simply never reached. The
 * operator shell renders its children directly and the missing boundary
 * surfaced immediately.
 */
export default function SandboxCheckoutPage() {
  return (
    <Suspense
      fallback={
        <main className="px-4 py-6">
          <LoadingBlock />
        </main>
      }
    >
      <SandboxCheckout />
    </Suspense>
  );
}

function SandboxCheckout() {
  const { t } = useLang();
  const router = useRouter();
  const sessionId = useSearchParams().get("session");

  const [phase, setPhase] = useState<Phase>("idle");
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function confirm(choice: Outcome) {
    if (!sessionId) return;
    setPhase("working");
    try {
      const res = await fetch("/api/payments/sandbox-confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, outcome: choice }),
      });
      if (!res.ok) {
        setPhase("error");
        return;
      }
      setOutcome(choice);
      setPhase("done");
      // The employer dashboard reads the promotion from the database, so it
      // has to re-fetch to see it.
      router.refresh();
    } catch {
      setPhase("error");
    }
  }

  if (!sessionId) {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-8">
        <EmptyState title={t("pay.checkoutTitle")} hint={t("pay.error")} />
        <Link
          href="/employer"
          className="mt-4 inline-block font-sans text-[14px] text-amberInk underline"
        >
          {t("pay.back")}
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 py-8">
      {/* Not a footnote. The first thing on the screen. */}
      <div
        role="status"
        className="flex gap-3 rounded-xl border border-amber bg-amber/5 p-4"
      >
        <span className="mt-[2px] shrink-0 text-amberInk" aria-hidden="true">
          <PixelIcon name="warn" size={15} />
        </span>
        <div className="min-w-0">
          <p className="font-sans text-[14px] font-semibold text-ink">
            {t("pay.sandboxTag")}
          </p>
          <p className="mt-1 font-sans text-[14px] leading-relaxed text-ui-muted">
            {t("pay.sandboxBanner")}
          </p>
        </div>
      </div>

      <h1 className="mt-6 font-sans text-[22px] font-semibold leading-tight tracking-[-0.01em] text-ink">
        {t("pay.checkoutTitle")}
      </h1>
      <p className="mt-2 font-sans text-[14px] leading-relaxed text-ui-muted">
        {t("pay.checkoutBody")}
      </p>

      <section
        aria-label={t("pay.checkoutTitle")}
        className="mt-5 rounded-xl border border-ui-line bg-paper p-4"
      >
        <dl className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="font-sans text-[14px] text-ui-muted">{t("pay.price")}</dt>
            {/* Shown struck through: it is a figure, not a charge. */}
            <dd className="font-sans text-[16px] font-semibold text-ui-muted line-through tabular">
              ৳ 500.00
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="font-sans text-[14px] text-ui-muted">
              {t("pay.duration")}
            </dt>
            <dd className="font-sans text-[14px] text-ink tabular">
              30 {t("pay.days")}
            </dd>
          </div>
        </dl>

        {/* The marks a hosted checkout would show. They are the reason this
            page is recognisable as a checkout at a glance, and they are
            aria-hidden because they name nothing the payer has to choose —
            there is no scheme selection on this screen. */}
        <div className="mt-3.5 flex items-center gap-2.5 border-t border-ui-line pt-3.5">
          <VisaMark height={20} />
          <MastercardMark height={20} />
          <GooglePayMark height={20} />
        </div>

        <p className="mt-3.5 border-t border-ui-line pt-3 font-sans text-[13px] leading-relaxed text-ui-muted">
          {t("pay.whatIsPromotion")}
        </p>
      </section>

      {phase === "done" ? (
        <div
          role="status"
          aria-live="polite"
          className={`mt-5 rounded-xl border p-4 font-sans text-[14px] leading-relaxed ${
            outcome === "succeeded"
              ? "border-mint bg-mint/5 text-ink"
              : "border-alert bg-alert/5 text-ink"
          }`}
        >
          {outcome === "succeeded" ? t("pay.succeeded") : t("pay.failed")}
        </div>
      ) : phase === "error" ? (
        <div
          role="alert"
          className="mt-5 rounded-xl border border-alert bg-alert/5 p-4 font-sans text-[14px] leading-relaxed text-alert"
        >
          {t("pay.error")}
        </div>
      ) : (
        <div className="mt-5 space-y-2.5">
          <PixelButton
            full
            size="lg"
            onClick={() => confirm("succeeded")}
            disabled={phase === "working"}
          >
            {phase === "working" ? t("pay.working") : t("pay.confirm")}
          </PixelButton>
          {/* A payment path with no failure branch is untested by definition.
              Demoted to `ghost`: it is a testing affordance, not a choice the
              payer is being offered alongside paying. */}
          <PixelButton
            full
            variant="ghost"
            onClick={() => confirm("failed")}
            disabled={phase === "working"}
          >
            {t("pay.decline")}
          </PixelButton>
        </div>
      )}

      <Link
        href="/employer"
        className="mt-5 inline-block font-sans text-[14px] text-amberInk underline"
      >
        {t("pay.back")}
      </Link>
    </main>
  );
}
