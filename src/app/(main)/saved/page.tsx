"use client";

/**
 * APPLICATION TRACKER — a pixel kanban.
 * Columns: Saved → Applied → Interview → Offer / Rejected.
 * ◀ ▶ move cards linearly; from INTERVIEW the outcome forks explicitly into
 * OFFER or REJECTED (you never have to pass through Offer to reach Rejected).
 * Deadline reminders: red strip when deadlines land within 3 days.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import { DeadlineBadge } from "@/components/DeadlineBadge";
import { LoadingBlock } from "@/components/LoadingBlock";
import { EmptyState } from "@/components/EmptyState";
import {
  listApplications,
  listOpportunities,
  removeApplication,
  upsertApplication,
} from "@/lib/data";
import { daysLeft, isEstimatedDeadline } from "@/lib/dates";
import { useLang, type StringKey } from "@/lib/i18n";
import type { Application, ApplicationStatus, Opportunity } from "@/lib/types";

const COLUMNS: { status: ApplicationStatus; key: StringKey; tone: string }[] = [
  { status: "saved", key: "tracker.saved", tone: "bg-paper" },
  { status: "applied", key: "tracker.applied", tone: "bg-amber" },
  { status: "interview", key: "tracker.interview", tone: "bg-mint" },
  { status: "accepted", key: "tracker.accepted", tone: "bg-mint" },
  { status: "rejected", key: "tracker.rejected", tone: "bg-grey" },
];

type Row = { app: Application; op: Opportunity };

export default function TrackerPage() {
  const { t } = useLang();
  const [rows, setRows] = useState<Row[] | null>(null);

  const load = useCallback(async () => {
    const [apps, ops] = await Promise.all([listApplications(), listOpportunities()]);
    const byId = new Map(ops.map((o) => [o.id, o]));
    setRows(
      apps
        .map((app) => ({ app, op: byId.get(app.opportunity_id)! }))
        .filter((r) => r.op)
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function move(row: Row, dir: -1 | 1) {
    const idx = COLUMNS.findIndex((c) => c.status === row.app.status);
    const next = COLUMNS[idx + dir];
    if (!next) return;
    await upsertApplication(row.op.id, next.status);
    await load();
  }

  /** Explicit jump to a specific stage — used by the interview outcome fork. */
  async function branch(row: Row, status: ApplicationStatus) {
    await upsertApplication(row.op.id, status);
    await load();
  }

  async function remove(row: Row) {
    await removeApplication(row.op.id);
    await load();
  }

  const dueSoon = useMemo(
    () =>
      (rows ?? []).filter(
        (r) =>
          r.app.status !== "rejected" &&
          r.app.status !== "accepted" &&
          daysLeft(r.op.deadline) >= 0 &&
          daysLeft(r.op.deadline) < 3
      ).length,
    [rows]
  );

  if (rows === null) {
    return (
      <main className="px-4 pt-4">
        <LoadingBlock />
      </main>
    );
  }

  return (
    <main className="pt-4">
      <div className="px-4">
        <h1 className="font-pixel text-xs text-ink">{t("tracker.title")}</h1>

        {dueSoon > 0 && (
          <p className="mt-3 flex items-center gap-2 border-3 border-ink bg-alert p-2 font-mono text-xs font-bold text-cream shadow-pixel-sm">
            <PixelIcon name="clock" size={12} /> {dueSoon} {t("tracker.dueSoon")}
          </p>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="mt-4 px-4">
          <EmptyState icon="bookmark" title={t("tracker.empty")}>
            <Link
              href="/radar"
              className="inline-block border-3 border-ink bg-amber px-3 py-1.5 font-mono text-xs font-bold text-ink shadow-pixel-sm"
            >
              → {t("nav.radar")}
            </Link>
          </EmptyState>
        </div>
      ) : (
        <div className="no-scrollbar mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4">
          {COLUMNS.map((col, colIdx) => {
            const cards = rows.filter((r) => r.app.status === col.status);
            return (
              <section
                key={col.status}
                className="w-[260px] shrink-0 snap-start border-3 border-ink bg-cream shadow-pixel"
              >
                <header className={`flex items-center justify-between border-b-3 border-ink px-3 py-2 ${col.tone}`}>
                  <h2 className="font-mono text-xs font-bold text-ink">
                    {t(col.key)}
                  </h2>
                  <span className="border-2 border-ink bg-paper px-1.5 font-mono text-[11px] font-bold text-ink">
                    {cards.length}
                  </span>
                </header>

                <div className="min-h-[80px] space-y-2 p-2">
                  {cards.map((row) => (
                    <article key={row.app.id} className="border-2 border-ink bg-paper p-2">
                      <Link href={`/opportunity/${row.op.id}`} className="block">
                        <p className="truncate font-mono text-xs font-bold text-ink">
                          {row.op.role}
                        </p>
                        <p className="truncate font-mono text-[11px] text-ink/70">
                          {row.op.company}
                        </p>
                      </Link>
                      <div className="mt-1.5">
                        <DeadlineBadge
                          deadline={row.op.deadline}
                          estimated={isEstimatedDeadline(row.op)}
                        />
                      </div>

                      {row.app.status === "interview" ? (
                        /* Outcome fork: Offer OR Rejected, both reachable. */
                        <div className="mt-2 border-t-2 border-ink/20 pt-1.5">
                          <div className="flex items-center justify-between">
                            <button
                              type="button"
                              aria-label="Move left"
                              onClick={() => move(row, -1)}
                              className="border-2 border-ink bg-cream px-2 py-0.5 font-mono text-xs font-bold text-ink"
                            >
                              ◀
                            </button>
                            <button
                              type="button"
                              aria-label="Remove"
                              onClick={() => remove(row)}
                              className="px-1 text-grey"
                            >
                              <PixelIcon name="x" size={11} />
                            </button>
                          </div>
                          <div className="mt-1.5 flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => branch(row, "accepted")}
                              className="flex-1 border-2 border-ink bg-mint px-1 py-1 font-mono text-[10px] font-bold text-ink active:translate-x-[1px] active:translate-y-[1px]"
                            >
                              {t("tracker.markAccepted")}
                            </button>
                            <button
                              type="button"
                              onClick={() => branch(row, "rejected")}
                              className="flex-1 border-2 border-ink bg-grey px-1 py-1 font-mono text-[10px] font-bold text-cream active:translate-x-[1px] active:translate-y-[1px]"
                            >
                              {t("tracker.markRejected")}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 flex items-center justify-between border-t-2 border-ink/20 pt-1.5">
                          <button
                            type="button"
                            aria-label="Move left"
                            disabled={colIdx === 0}
                            onClick={() => move(row, -1)}
                            className="border-2 border-ink bg-cream px-2 py-0.5 font-mono text-xs font-bold text-ink disabled:opacity-30"
                          >
                            ◀
                          </button>
                          <button
                            type="button"
                            aria-label="Remove"
                            onClick={() => remove(row)}
                            className="px-1 text-grey"
                          >
                            <PixelIcon name="x" size={11} />
                          </button>
                          <button
                            type="button"
                            aria-label="Move right"
                            disabled={colIdx === COLUMNS.length - 1}
                            onClick={() => move(row, 1)}
                            className="border-2 border-ink bg-cream px-2 py-0.5 font-mono text-xs font-bold text-ink disabled:opacity-30"
                          >
                            ▶
                          </button>
                        </div>
                      )}
                    </article>
                  ))}
                  {cards.length === 0 && (
                    <p className="p-2 text-center font-mono text-[11px] text-grey">—</p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
