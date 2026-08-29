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
 * because a lock with no name is just a wall. It is deliberately small: this
 * appears inline where a button would have been, and an upsell larger than the
 * thing it replaces reads as a punishment for not having paid.
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
        "rounded-lg border border-ui-lineStrong bg-cream p-3",
        className
      )}
    >
      <p className="flex items-center gap-1.5 font-mono text-[12px] font-bold text-ink">
        <span aria-hidden="true" className="text-amberInk">
          <PixelIcon name="lock" size={13} />
        </span>
        {t(featureKey)}
      </p>
      <p className="mt-1 font-mono text-[11px] leading-relaxed text-ui-muted">
        {t("pro.lockBody")}
      </p>
      <Link
        href="/pro"
        className="mt-2 inline-flex min-h-[36px] items-center rounded-lg bg-ink px-3 font-mono text-[11px] font-bold text-cream hover:bg-ink/90"
      >
        {t("pro.lockCta")}
      </Link>
    </div>
  );
}

export default ProLock;
