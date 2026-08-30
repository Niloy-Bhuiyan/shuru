"use client";

/**
 * WHAT A PRO FEATURE LOOKS LIKE WHEN YOU DO NOT HAVE IT.
 *
 * Used in exactly one situation: the feature IS configured on this deployment
 * and would work, and the signed-in user has not paid for it. That is a
 * different state from "this deployment has no model key", which stays hidden
 * entirely — a teaser for something the operator has not enabled is an advert
 * for a product that does not exist here.
 *
 * So the rule each call site follows is:
 *
 *   not configured → render nothing
 *   configured, not Pro → render this
 *   configured, Pro → render the feature
 *
 * It says what the feature is and what it costs to reach, in that order,
 * because a lock with no name is just a wall.
 *
 * ── Why it looks like this ────────────────────────────────────────────────
 *
 * The previous version was 11px bold mono on a flat grey box: correct in
 * content and completely inert. This is the surface where somebody decides
 * whether the paid half of the product is worth anything, and it was the
 * plainest thing on the screen — it read as a disabled control rather than as
 * an offer, which is exactly why Pro felt like a link buried in a corner.
 *
 * It is still deliberately NOT large. The old comment was right that an upsell
 * bigger than the thing it replaces reads as a punishment for not having paid.
 * The change is in weight, not size: one warm accent, a real heading, the
 * benefit stated in a full sentence, and a button that looks pressable. The
 * lock icon became a spark on purpose — a padlock says "you are shut out",
 * a spark says "there is something here", and only one of those is an
 * invitation.
 */

import Link from "next/link";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import { useLang, type StringKey } from "@/lib/i18n";
import { cx } from "@/lib/cx";

export function ProLock({
  /** Names the specific capability, e.g. "pro.lockAsk". */
  featureKey,
  className,
}: {
  featureKey: StringKey;
  className?: string;
}) {
  const { t } = useLang();

  return (
    <div
      className={cx(
        "relative overflow-hidden rounded-xl border border-amber/30",
        "bg-gradient-to-br from-amber/[0.07] via-paper to-paper p-4",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber/15 text-amberInk"
        >
          <PixelIcon name="spark" size={16} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="font-sans text-[15px] font-semibold text-ink">
              {t(featureKey)}
            </p>
            <span className="rounded-md bg-amber/15 px-1.5 py-0.5 font-sans text-[11px] font-semibold uppercase tracking-wide text-amberInk">
              {t("pro.planPro")}
            </span>
          </div>

          <p className="mt-1.5 font-sans text-[14px] leading-relaxed text-ui-muted">
            {t("pro.lockBody")}
          </p>

          <Link
            href="/pro"
            className="mt-3 inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-ink px-4 font-sans text-[14px] font-medium text-white transition-opacity hover:opacity-90"
          >
            {t("pro.lockCta")}
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default ProLock;
