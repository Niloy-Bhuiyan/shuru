"use client";

/**
 * ADMIN MODERATION DASHBOARD
 *
 * Four queues: listings awaiting review, companies awaiting verification,
 * open listing reports, and ingestion source health.
 *
 * The role check here only decides what to render. The real boundary is in
 * the database — `moderateListing`/`verifyCompany` re-read the row after
 * writing and raise `ModerationRejected` if the guard trigger reverted it, so
 * a non-admin who reaches this screen gets an honest error rather than a
 * moderation action that silently did nothing.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { LoadingBlock } from "@/components/LoadingBlock";
import { EmptyState } from "@/components/EmptyState";
import { SourceHealthPanel } from "@/components/admin/SourceHealthPanel";
import {
  listCompaniesByVerification,
  listListingsByStatus,
  listOpenReports,
  moderateListing,
  resolveReport,
  verifyCompany,
} from "@/lib/data/admin";
import { useRole } from "@/hooks/useRole";
import { useLang } from "@/lib/i18n";
import type { Company, ListingReport, Opportunity } from "@/lib/types";

type Tab = "queue" | "companies" | "reports" | "sources";

export default function AdminPage() {
  const { t } = useLang();
  const { role, loading: roleLoading } = useRole();

  const [tab, setTab] = useState<Tab>("queue");
  const [pending, setPending] = useState<Opportunity[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [reports, setReports] = useState<ListingReport[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [p, c, r] = await Promise.all([
      listListingsByStatus("pending"),
      listCompaniesByVerification("pending"),
      listOpenReports(),
    ]);
    setPending(p);
    setCompanies(c);
    setReports(r);
    setReady(true);
  }, []);

  useEffect(() => {
    if (roleLoading) return;
    if (role !== "admin") {
      setReady(true);
      return;
    }
    load().catch((e) => {
      setError((e as Error).message);
      setReady(true);
    });
  }, [role, roleLoading, load]);

  async function guarded(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (roleLoading || !ready) {
    return (
      <main className="px-4 pt-4">
        <LoadingBlock />
      </main>
    );
  }

  if (role !== "admin") {
    return (
      <main className="px-4 pt-4">
        <EmptyState icon="warn" title={t("admin.notAdmin")} />
      </main>
    );
  }

  const TABS: { id: Tab; label: string; count: number | null }[] = [
    { id: "queue", label: t("admin.queue"), count: pending.length },
    { id: "companies", label: t("admin.companies"), count: companies.length },
    { id: "reports", label: t("admin.reports"), count: reports.length },
    { id: "sources", label: t("admin.sources"), count: null },
  ];

  return (
    <main className="px-4 pt-4">
      <h1 className="font-pixel text-xs text-ink">{t("admin.title")}</h1>

      <div className="no-scrollbar mt-3 flex gap-1.5 overflow-x-auto">
        {TABS.map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => setTab(x.id)}
            aria-pressed={tab === x.id}
            className={`shrink-0 border-3 border-ink px-2 py-1 font-mono text-[10px] font-bold uppercase ${
              tab === x.id ? "bg-ink text-cream" : "bg-paper text-ink"
            }`}
          >
            {x.label}
            {x.count !== null && x.count > 0 && ` (${x.count})`}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-3 border-3 border-ink bg-alert p-2 font-mono text-[11px] text-cream">
          {error}
        </p>
      )}

      {/* ── listing queue ── */}
      {tab === "queue" && (
        <section className="mb-6 mt-4 space-y-2">
          {pending.length === 0 ? (
            <EmptyState icon="check" title={t("admin.noPending")} />
          ) : (
            pending.map((l) => (
              <article
                key={l.id}
                className="border-3 border-ink bg-cream p-2.5 shadow-pixel-sm"
              >
                <Link href={`/opportunity/${l.id}`} className="block">
                  <p className="font-mono text-xs font-bold text-ink">{l.role}</p>
                  <p className="font-mono text-[11px] text-ink/70">
                    {l.company} · {l.location}
                  </p>
                </Link>

                <input
                  value={reason[l.id] ?? ""}
                  onChange={(e) =>
                    setReason((p) => ({ ...p, [l.id]: e.target.value }))
                  }
                  placeholder={t("admin.rejectReason")}
                  className="mt-2 w-full border-2 border-ink bg-paper px-2 py-1 font-mono text-[11px] text-ink focus:outline-none"
                />

                <div className="mt-2 flex gap-1.5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => guarded(() => moderateListing(l.id, "approved"))}
                    className="flex-1 border-2 border-ink bg-mint px-2 py-1 font-mono text-[10px] font-bold uppercase text-ink disabled:opacity-50"
                  >
                    {t("admin.approve")}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      guarded(() =>
                        moderateListing(l.id, "rejected", reason[l.id] || undefined)
                      )
                    }
                    className="flex-1 border-2 border-ink bg-alert px-2 py-1 font-mono text-[10px] font-bold uppercase text-cream disabled:opacity-50"
                  >
                    {t("admin.reject")}
                  </button>
                </div>
              </article>
            ))
          )}
        </section>
      )}

      {/* ── company verification ── */}
      {tab === "companies" && (
        <section className="mb-6 mt-4 space-y-2">
          {companies.length === 0 ? (
            <EmptyState icon="check" title={t("admin.noPending")} />
          ) : (
            companies.map((c) => (
              <article
                key={c.id}
                className="border-3 border-ink bg-cream p-2.5 shadow-pixel-sm"
              >
                <p className="font-mono text-xs font-bold text-ink">{c.name}</p>
                {c.website && (
                  <a
                    href={c.website}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-[11px] text-amber underline"
                  >
                    {c.website} ↗
                  </a>
                )}
                <p className="font-mono text-[11px] text-ink/70">{c.location}</p>

                <div className="mt-2 flex gap-1.5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => guarded(() => verifyCompany(c.id, "approved"))}
                    className="flex-1 border-2 border-ink bg-mint px-2 py-1 font-mono text-[10px] font-bold uppercase text-ink disabled:opacity-50"
                  >
                    {t("admin.verify")}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => guarded(() => verifyCompany(c.id, "rejected"))}
                    className="flex-1 border-2 border-ink bg-alert px-2 py-1 font-mono text-[10px] font-bold uppercase text-cream disabled:opacity-50"
                  >
                    {t("admin.reject")}
                  </button>
                </div>
              </article>
            ))
          )}
        </section>
      )}

      {/* ── reports ── */}
      {tab === "reports" && (
        <section className="mb-6 mt-4 space-y-2">
          {reports.length === 0 ? (
            <EmptyState icon="check" title={t("admin.noPending")} />
          ) : (
            reports.map((r) => (
              <article
                key={r.id}
                className="border-3 border-ink bg-cream p-2.5 shadow-pixel-sm"
              >
                <p className="font-mono text-xs font-bold uppercase text-ink">
                  {r.reason}
                </p>
                {r.details && (
                  <p className="mt-1 font-mono text-[11px] text-ink/70">{r.details}</p>
                )}
                <Link
                  href={`/opportunity/${r.opportunity_id}`}
                  className="font-mono text-[11px] text-amber underline"
                >
                  {t("admin.action")} ↗
                </Link>

                <div className="mt-2 flex gap-1.5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => guarded(() => resolveReport(r.id, "actioned"))}
                    className="flex-1 border-2 border-ink bg-mint px-2 py-1 font-mono text-[10px] font-bold uppercase text-ink disabled:opacity-50"
                  >
                    {t("admin.action")}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => guarded(() => resolveReport(r.id, "dismissed"))}
                    className="flex-1 border-2 border-ink bg-grey px-2 py-1 font-mono text-[10px] font-bold uppercase text-cream disabled:opacity-50"
                  >
                    {t("admin.dismiss")}
                  </button>
                </div>
              </article>
            ))
          )}
        </section>
      )}

      {tab === "sources" && <SourceHealthPanel />}
    </main>
  );
}
