"use client";

/**
 * Ingestion source health, computed from recorded runs.
 *
 * Reads `ingestion_runs` directly rather than GET /api/ingest so the panel
 * reflects RLS (an admin sees it; nobody else does) and does not depend on
 * the service-role key being present in the browser tier.
 *
 * `yielding_nothing` is styled as a neutral observation, not an error —
 * RemoteOK legitimately carries no tech internships for long stretches
 * (ADR 0001), and colouring that red trains admins to ignore the panel.
 */

import { useEffect, useState } from "react";
import { LoadingBlock } from "@/components/LoadingBlock";
import { listIngestionRuns } from "@/lib/data/admin";
import { assessSourceHealth, type HealthStatus, type SourceHealth } from "@/lib/ingest/health";
import { useLang } from "@/lib/i18n";
import type { IngestionRun, InternshipSource } from "@/lib/types";

const TONE: Record<HealthStatus, string> = {
  healthy: "bg-mint",
  yielding_nothing: "bg-paper",
  degraded: "bg-amber",
  failing: "bg-alert text-cream",
  never_run: "bg-grey text-cream",
};

export function SourceHealthPanel() {
  const { t } = useLang();
  const [health, setHealth] = useState<SourceHealth[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listIngestionRuns(100)
      .then((runs) => {
        if (cancelled) return;
        // Sources are derived from what has actually run: the browser cannot
        // read INGEST_* env flags, so recorded history is the honest input.
        const seen = Array.from(
          new Set((runs as IngestionRun[]).map((r) => r.source))
        ) as InternshipSource[];
        setHealth(assessSourceHealth(runs, seen));
      })
      .catch(() => {
        if (!cancelled) setHealth([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (health === null) return <LoadingBlock />;

  return (
    <section className="mb-6 mt-4 space-y-2">
      <h2 className="font-mono text-xs font-bold text-ink">
        {t("admin.health")}
      </h2>

      {health.length === 0 ? (
        <p className="font-mono text-[11px] text-grey">{t("admin.neverRun")}</p>
      ) : (
        health.map((h) => (
          <article
            key={h.source}
            className="border-3 border-ink bg-cream shadow-pixel-sm"
          >
            <header
              className={`flex items-center justify-between border-b-3 border-ink px-2.5 py-1.5 ${TONE[h.status]}`}
            >
              <span className="font-mono text-[11px] font-bold">
                {h.source}
              </span>
              <span className="font-mono text-[9px] font-bold">
                {h.status.replace(/_/g, " ")}
              </span>
            </header>
            <div className="p-2.5">
              <p className="font-mono text-[11px] leading-relaxed text-ink">
                {h.detail}
              </p>
              <p className="mt-1 font-mono text-[10px] text-grey">
                {t("admin.lastRun")}:{" "}
                {h.lastRunAt ? new Date(h.lastRunAt).toLocaleString() : "—"}
              </p>
            </div>
          </article>
        ))
      )}
    </section>
  );
}

export default SourceHealthPanel;
