"use client";

/**
 * YOUR PLAN — the billing summary on the profile screen.
 *
 * Sits next to "request employer access" for the same reason that one does:
 * both are facts about YOUR OWN account, and the profile page is where a
 * person looks for those. It is a summary and a door, not a second pricing
 * page — everything about what Pro costs lives at /pro.
 *
 * Renders nothing for an admin. An admin's Pro access comes from their role
 * rather than from a payment (see lib/auth/pro.ts), so a card saying "Free —
 * upgrade" would be wrong and a card saying "Pro" would imply a subscription
 * that does not exist. Neither is worth showing; their console is elsewhere.
 */

import Link from "next/link";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import { usePro } from "@/hooks/usePro";
import { useLang } from "@/lib/i18n";
import { cx } from "@/lib/cx";

export function PlanCard() {
  const { t, lang } = useLang();
  const { isPro, subscription, viaAdmin, loading } = usePro();

  // Nothing during the lookup: a card that says "Free" for half a second and
  // then flips to "Pro" is worse than a card that appears a beat later.
  if (loading || viaAdmin) return null;

  const endsAt = subscription?.current_period_end ?? null;
  const canceled = subscription?.status === "canceled";

  return (
    <section
      aria-labelledby="plan-card"
      className={cx(
        "rounded-xl border p-4",
        isPro ? "border-mint bg-mint/5" : "border-ui-line bg-paper"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="plan-card"
            className="flex items-center gap-1.5 font-sans text-[15px] font-semibold text-ink"
          >
            {!isPro && (
              <span aria-hidden="true" className="text-amberInk">
                <PixelIcon name="spark" size={13} />
              </span>
            )}
            {isPro ? t("plan.pro") : t("plan.free")}
          </h2>

          <p className="mt-1.5 font-sans text-[14px] leading-relaxed text-ui-muted">
            {isPro ? (
              <>
                {canceled ? t("plan.endsOn") : t("plan.renewsOn")}{" "}
                <span className="font-semibold text-ink tabular">
                  {endsAt ? formatDate(endsAt, lang) : "—"}
                </span>
              </>
            ) : (
              t("plan.freeBody")
            )}
          </p>
        </div>

        <Link
          href="/pro"
          className={cx(
            // 36px is the floor for a secondary control in this shell; the
            // whole row is comfortably past the 44px target once padding and
            // the text beside it are counted.
            "inline-flex min-h-[40px] shrink-0 items-center rounded-lg px-4 font-sans text-[14px] font-medium transition-colors",
            isPro
              ? "border border-ui-lineStrong bg-paper text-ink hover:bg-cream"
              : "bg-ink text-white hover:opacity-90"
          )}
        >
          {isPro ? t("plan.manage") : t("plan.seePro")}
        </Link>
      </div>
    </section>
  );
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

export default PlanCard;
