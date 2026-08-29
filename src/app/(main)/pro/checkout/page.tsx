"use client";

/**
 * SANDBOX CHECKOUT for a Pro subscription — the page a payment provider hosts.
 *
 * The employer version of this screen lives at /employer/billing/sandbox. This
 * is its counterpart for an individual buying Pro, and it is a separate route
 * rather than a shared one because the two return to different products, show
 * different prices and end in different places. Sharing them would mean a
 * component that branches on role in six places to save one file.
 *
 * What they DO share is the mechanism, and that part is not duplicated:
 * confirming here does not flip a flag. It asks the server to deliver a
 * properly HMAC-signed webhook to the real payment handler, which verifies the
 * signature, claims the event id for idempotency, and grants the subscription
 * through the same `grantEntitlement` an approved bKash transfer goes through.
 * The only fiction is the money.
 *
 * No card field. There is nothing on this screen a real hosted checkout would
 * have asked for, because Shuru never sees those.
 */

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PixelButton } from "@/components/pixel/PixelButton";
import { PixelCard } from "@/components/pixel/PixelCard";
import { EmptyState } from "@/components/EmptyState";
import { LoadingBlock } from "@/components/LoadingBlock";
import { confirmSandbox } from "@/lib/data/subscription";
import { useLang } from "@/lib/i18n";

type Outcome = "succeeded" | "failed";
type Phase = "idle" | "working" | "done" | "error";

/**
 * `useSearchParams()` opts its subtree out of prerendering, so it must sit
 * under a Suspense boundary or `next build` fails on this route. The employer
 * sandbox page learned this the hard way — see the note in its own file.
 */
export default function ProCheckoutPage() {
  return (
    <Suspense
      fallback={
        <main className="px-4 py-6">
          <LoadingBlock />
        </main>
      }
    >
      <ProCheckout />
    </Suspense>
  );
}

function ProCheckout() {
  const { t } = useLang();
  const router = useRouter();
  const sessionId = useSearchParams().get("session");

  const [phase, setPhase] = useState<Phase>("idle");
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function confirm(choice: Outcome) {
    if (!sessionId) return;
    setPhase("working");
    try {
      const ok = await confirmSandbox(sessionId, choice);
      if (!ok) {
        setPhase("error");
        return;
      }
      setOutcome(choice);
      setPhase("done");
      // The entitlement now exists in the database; the client's copy does not.
      router.refresh();
    } catch {
      setPhase("error");
    }
  }

  if (!sessionId) {
    return (
      <main className="px-4 py-6">
        <EmptyState title={t("pro.checkoutTitle")} hint={t("pro.errGeneric")} />
        <Link
          href="/pro"
          className="mt-3 inline-block font-mono text-[12px] underline"
        >
          {t("pro.backToPro")}
        </Link>
      </main>
    );
  }

  return (
    <main className="px-4 py-6">
      {/* Not a footnote. The first thing on the screen, before the price. */}
      <div
        role="status"
        className="mb-4 rounded-lg border border-amber bg-amber/5 p-3.5"
      >
        <p className="font-pixel text-[13px] text-ink">
          {t("pro.sandboxHeading")}
        </p>
        <p className="mt-1.5 font-mono text-[12px] leading-relaxed text-ui-muted">
          {t("pro.sandboxBody")}
        </p>
      </div>

      <h1 className="font-pixel text-base text-ink">{t("pro.checkoutTitle")}</h1>
      <p className="mt-2 font-mono text-[12px] leading-relaxed text-ui-muted">
        {t("pro.checkoutBody")}
      </p>

      <PixelCard className="mt-4 p-3.5">
        <p className="font-mono text-[12px] leading-relaxed text-ink">
          {t("pro.checkoutNoCard")}
        </p>
      </PixelCard>

      {phase === "done" ? (
        <div
          role="status"
          aria-live="polite"
          className={
            outcome === "succeeded"
              ? "mt-4 rounded-lg border border-mint bg-mint/5 p-3.5"
              : "mt-4 rounded-lg border border-alert bg-alert/5 p-3.5"
          }
        >
          <p className="font-pixel text-[13px] text-ink">
            {outcome === "succeeded"
              ? t("pro.checkoutSucceeded")
              : t("pro.checkoutDeclined")}
          </p>
          <Link
            href="/pro"
            className="mt-2.5 inline-block font-mono text-[12px] font-bold underline"
          >
            {t("pro.backToPro")}
          </Link>
        </div>
      ) : phase === "error" ? (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-alert bg-alert/5 p-3.5"
        >
          <p className="font-mono text-[12px] leading-relaxed text-alert">
            {t("pro.errServer")}
          </p>
          {/* An error with no way forward is a dead end. */}
          <PixelButton
            variant="secondary"
            className="mt-3"
            onClick={() => setPhase("idle")}
          >
            {t("error.retry")}
          </PixelButton>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          <PixelButton
            full
            onClick={() => void confirm("succeeded")}
            disabled={phase === "working"}
          >
            {phase === "working" ? t("pro.working") : t("pro.checkoutConfirm")}
          </PixelButton>
          {/* A payment path with no failure branch is untested by definition. */}
          <PixelButton
            full
            variant="secondary"
            onClick={() => void confirm("failed")}
            disabled={phase === "working"}
          >
            {t("pro.checkoutDecline")}
          </PixelButton>
        </div>
      )}

      <Link
        href="/pro"
        className="mt-4 inline-block font-mono text-[12px] underline"
      >
        {t("pro.backToPro")}
      </Link>
    </main>
  );
}
