"use client";

/**
 * Append-only history for one application.
 *
 * Every row here was written by a database trigger, so this is a record of
 * what actually happened rather than what the UI believes happened. The
 * actor is shown because "you withdrew" and "the employer rejected you" are
 * very different events and the status alone does not distinguish them.
 */

import { useEffect, useState } from "react";
import { listApplicationEvents } from "@/lib/data/applications";
import { useLang, type StringKey } from "@/lib/i18n";
import type { ApplicationEvent, ApplicationStatus, UserRole } from "@/lib/types";

const STATUS_KEY: Record<ApplicationStatus, StringKey> = {
  saved: "tracker.saved",
  applied: "tracker.applied",
  viewed: "tracker.applied",
  shortlisted: "tracker.interview",
  interview: "tracker.interview",
  accepted: "tracker.accepted",
  rejected: "tracker.rejected",
};

function actorKey(role: UserRole | null): StringKey {
  if (role === "employer") return "timeline.byEmployer";
  if (role === "admin") return "timeline.byAdmin";
  if (role === "student") return "timeline.byYou";
  // No actor recorded means a trigger or the service role wrote it.
  return "timeline.bySystem";
}

export function ApplicationTimeline({ applicationId }: { applicationId: string }) {
  const { t } = useLang();
  const [events, setEvents] = useState<ApplicationEvent[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listApplicationEvents(applicationId)
      .then((rows) => {
        if (!cancelled) setEvents(rows);
      })
      // History is supporting detail — a failure hides the section rather
      // than breaking the page it sits on.
      .catch(() => {
        if (!cancelled) setEvents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [applicationId]);

  if (events === null) return null;

  return (
    <section className="mt-4 border-3 border-ink bg-paper p-3 shadow-pixel">
      <h2 className="font-mono text-xs font-bold uppercase tracking-wide text-ink">
        {t("timeline.title")}
      </h2>

      {events.length === 0 ? (
        <p className="mt-2 font-mono text-[11px] text-grey">{t("timeline.empty")}</p>
      ) : (
        <ol className="mt-3 space-y-0">
          {events.map((e, i) => (
            <li key={e.id} className="flex gap-2.5">
              {/* rail: dot + connector, so the sequence reads vertically */}
              <div className="flex flex-col items-center">
                <span className="mt-1 h-2.5 w-2.5 shrink-0 border-2 border-ink bg-amber" />
                {i < events.length - 1 && <span className="w-[3px] flex-1 bg-ink/20" />}
              </div>

              <div className="pb-3">
                <p className="font-mono text-xs font-bold text-ink">
                  {e.from_status === null
                    ? t("timeline.created")
                    : `${t(STATUS_KEY[e.from_status])} → ${t(STATUS_KEY[e.to_status])}`}
                </p>
                <p className="font-mono text-[10px] uppercase tracking-wide text-grey">
                  {new Date(e.created_at).toLocaleDateString()} · {t(actorKey(e.actor_role))}
                </p>
                {e.note && (
                  <p className="mt-1 font-mono text-[11px] text-ink/70">{e.note}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default ApplicationTimeline;
