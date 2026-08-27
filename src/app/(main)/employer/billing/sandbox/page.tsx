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
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PixelButton } from "@/components/pixel/PixelButton";
import { PixelCard } from "@/components/pixel/PixelCard";
import { EmptyState } from "@/components/EmptyState";
import { useLang } from "@/lib/i18n";

type Outcome = "succeeded" | "failed";
type Phase = "idle" | "working" | "done" | "error";

export default function SandboxCheckoutPage() {
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
      <main className="px-4 py-6">
        <EmptyState title={t("pay.checkoutTitle")} hint={t("pay.error")} />
        <Link
          href="/employer"
          className="mt-3 inline-block font-mono text-[11px] underline"
        >
          {t("pay.back")}
        </Link>
      </main>
    );
  }

  return (
    <main className="px-4 py-6">
      {/* Not a footnote. The first thing on the screen. */}
      <div
        role="status"
        className="mb-4 border-3 border-ink bg-amber p-3 shadow-pixel-sm"
      >
        <p className="font-pixel text-[11px] uppercase text-ink">
          ⚠ {t("pay.sandboxTag")}
        </p>
        <p className="mt-1 font-mono text-[11px] leading-relaxed text-ink">
          {t("pay.sandboxBanner")}
        </p>
      </div>

      <h1 className="font-pixel text-xs uppercase text-ink">
        {t("pay.checkoutTitle")}
      </h1>
      <p className="mt-2 font-mono text-[11px] leading-relaxed text-ink/80">
        {t("pay.checkoutBody")}
      </p>

      <PixelCard className="mt-4 p-3">
        <dl className="font-mono text-[11px] text-ink">
          <div className="flex justify-between">
            <dt>{t("pay.price")}</dt>
            {/* Shown struck through: it is a figure, not a charge. */}
            <dd className="line-through opacity-60">৳ 500.00</dd>
          </div>
          <div className="mt-1 flex justify-between">
            <dt>{t("pay.duration")}</dt>
            <dd>30 {t("pay.days")}</dd>
          </div>
        </dl>
        <p className="mt-2 border-t-2 border-ink/20 pt-2 font-mono text-[10px] leading-relaxed text-ink/70">
          {t("pay.whatIsPromotion")}
        </p>
      </PixelCard>

      {phase === "done" ? (
        <div
          role="status"
          aria-live="polite"
          className={`mt-4 border-3 border-ink p-3 font-mono text-[11px] shadow-pixel-sm ${
            outcome === "succeeded" ? "bg-mint text-ink" : "bg-alert text-cream"
          }`}
        >
          {outcome === "succeeded" ? t("pay.succeeded") : t("pay.failed")}
        </div>
      ) : phase === "error" ? (
        <div
          role="alert"
          className="mt-4 border-3 border-ink bg-alert p-3 font-mono text-[11px] text-cream shadow-pixel-sm"
        >
          {t("pay.error")}
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          <PixelButton
            onClick={() => confirm("succeeded")}
            disabled={phase === "working"}
            className="w-full"
          >
            {phase === "working" ? t("pay.working") : t("pay.confirm")}
          </PixelButton>
          {/* A payment path with no failure branch is untested by definition. */}
          <PixelButton
            variant="secondary"
            onClick={() => confirm("failed")}
            disabled={phase === "working"}
            className="w-full"
          >
            {t("pay.decline")}
          </PixelButton>
        </div>
      )}

      <Link
        href="/employer"
        className="mt-4 inline-block font-mono text-[11px] underline"
      >
        {t("pay.back")}
      </Link>
    </main>
  );
}
