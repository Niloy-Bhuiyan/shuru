/** Deadline math. All deadlines are ISO dates (YYYY-MM-DD). */

/**
 * Ingested (remote) listings have no real deadline — normalize.ts synthesises
 * one as posted + 30 days and tags the row with a "Rolling · via <source>"
 * cycle label. Such deadlines must never render as a hard countdown, so this
 * flags them for an "estimated" treatment. Curated rows (is_verified true, or
 * a real cycle label) are never treated as estimates.
 */
export function isEstimatedDeadline(op: {
  cycle_label?: string | null;
  is_verified?: boolean;
}): boolean {
  return !op.is_verified && /^rolling · via/i.test(op.cycle_label ?? "");
}

export function daysLeft(deadline: string, now: Date = new Date()): number {
  const d = new Date(deadline + "T23:59:59");
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((d.getTime() - startOfToday.getTime()) / 86400000);
}

export function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
