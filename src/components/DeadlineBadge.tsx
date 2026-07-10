"use client";

import React from "react";
import { PixelBadge } from "@/components/pixel/PixelBadge";
import { daysLeft } from "@/lib/dates";
import { useLang } from "@/lib/i18n";

/**
 * Deadline countdown badge. Amber by default, RED under 3 days —
 * urgency is a color with a meaning, not a decoration.
 *
 * `estimated` rows (ingested listings with a synthetic posted+30d date) are
 * shown muted with an "EST." marker and never take an urgent color, so a
 * fabricated date can never masquerade as a real, urgent due date (see 1.3).
 */
export function DeadlineBadge({
  deadline,
  estimated = false,
}: {
  deadline: string;
  estimated?: boolean;
}) {
  const { t } = useLang();
  const d = daysLeft(deadline);

  if (d < 0) {
    return (
      <PixelBadge tone="ink" icon="x">
        {t("deadline.closed")}
      </PixelBadge>
    );
  }

  // Estimated: calm grey, tilde + "EST." — visibly not a hard countdown.
  if (estimated) {
    const body =
      d === 0
        ? t("deadline.today")
        : `${d} ${d === 1 ? t("deadline.dayLeft") : t("deadline.daysLeft")}`;
    return (
      <PixelBadge tone="borderline" icon="clock">
        ~{body} · {t("deadline.est")}
      </PixelBadge>
    );
  }

  if (d === 0) {
    return (
      <PixelBadge tone="alert" icon="clock" className="deadline-pulse">
        {t("deadline.today")}
      </PixelBadge>
    );
  }
  return (
    <PixelBadge
      tone={d < 3 ? "alert" : "urgent"}
      icon="clock"
      className={d < 3 ? "deadline-pulse" : undefined}
    >
      {d} {d === 1 ? t("deadline.dayLeft") : t("deadline.daysLeft")}
    </PixelBadge>
  );
}

export default DeadlineBadge;
