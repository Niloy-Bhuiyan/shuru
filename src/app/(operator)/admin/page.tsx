"use client";

/**
 * ADMIN MODERATION DASHBOARD
 *
 * Five queues: listings awaiting review, companies awaiting verification,
 * open listing reports, employer access requests, and ingestion source health.
 *
 * The access queue is the only way anyone becomes an employer. Approving
 * calls decide_employer_access, a SECURITY INVOKER function, so the
 * admin-only policies on user_roles still apply to whoever calls it -- this
 * screen decides what to show, never what is permitted.
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
import { OperatorShell, StatTile } from "@/components/operator/OperatorShell";
import type { OperatorNavItem } from "@/components/operator/OperatorSideNav";
import {
  inviteByEmail,
  InviteDenied,
  listOpenInvites,
  revokeInvite,
  type InvitableRole,
  type RoleInvite,
} from "@/lib/data/roleInvites";
import {
  decideEmployerRequest,
  EmployerAccessDenied,
  listEmployerRequests,
  type EmployerAccessRequest,
} from "@/lib/data/employerAccess";
import {
  listCompaniesByVerification,
  listListingsByStatus,
  listOpenReports,
  moderateListing,
  resolveReport,
  verifyCompany,
} from "@/lib/data/admin";
import { useRole } from "@/hooks/useRole";
import type { IconName } from "@/components/pixel/PixelIcon";
import { useLang } from "@/lib/i18n";
import type { Company, ListingReport, Opportunity } from "@/lib/types";

type Tab = "queue" | "companies" | "reports" | "access" | "sources";

export default function AdminPage() {
  const { t } = useLang();
  const { role, loading: roleLoading } = useRole();

  const [tab, setTab] = useState<Tab>("queue");
  const [pending, setPending] = useState<Opportunity[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [reports, setReports] = useState<ListingReport[]>([]);
  const [access, setAccess] = useState<EmployerAccessRequest[]>([]);
  const [invites, setInvites] = useState<RoleInvite[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<InvitableRole>("employer");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [p, c, r, a, iv] = await Promise.all([
      listListingsByStatus("pending"),
      listCompaniesByVerification("pending"),
      listOpenReports(),
      listEmployerRequests("pending"),
      listOpenInvites(),
    ]);
    setPending(p);
    setCompanies(c);
    setReports(r);
    setAccess(a);
    setInvites(iv);
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

  /**
   * Approve or reject. A 42501 comes back as EmployerAccessDenied and is
   * shown as such: an admin who has lost the role should see why, not a
   * generic failure.
   */
  async function decide(id: string, approve: boolean) {
    await guarded(async () => {
      try {
        await decideEmployerRequest(id, approve, reason[id]);
      } catch (e) {
        if (e instanceof EmployerAccessDenied) throw new Error(t("op.accessDenied"));
        throw e;
      }
      setReason((m) => ({ ...m, [id]: "" }));
    });
  }

  async function sendInvite() {
    await guarded(async () => {
      try {
        await inviteByEmail(inviteEmail, inviteRole);
      } catch (e) {
        if (e instanceof InviteDenied) throw new Error(e.message);
        throw e;
      }
      setInviteEmail("");
    });
  }

  // The queues double as the console's navigation, so the counts are built
  // once and used in both places.
  const TABS: { id: Tab; label: string; icon: IconName; count: number | null }[] = [
    { id: "queue", label: t("admin.queue"), icon: "clock", count: pending.length },
    { id: "companies", label: t("admin.companies"), icon: "check", count: companies.length },
    { id: "reports", label: t("admin.reports"), icon: "warn", count: reports.length },
    { id: "access", label: t("op.access"), icon: "user", count: access.length },
    { id: "sources", label: t("admin.sources"), icon: "signal", count: null },
  ];

  // Everything an admin can act on right now. Drives the header subtitle and
  // the rail badge, so "is there work" is answered in two places from one
  // number rather than two that can disagree.
  const workWaiting =
    pending.length + companies.length + reports.length + access.length;

  // Admin destinations ONLY. The rail used to carry a link into the employer
  // workspace, which meant the maintenance console offered a hop into a
  // different product — three roles smeared into one navigation. An admin who
  // genuinely needs the employer view can type the URL; it should not be a
  // casual click from the moderation queue.
  const NAV: OperatorNavItem[] = [
    { href: "/admin", icon: "check", key: "admin.title", count: workWaiting },
    { href: "/admin/listings/new", icon: "edit", key: "admin.addListing" },
  ];

  if (roleLoading || !ready) {
    return (
      <OperatorShell items={NAV} role="admin" title={t("admin.title")}>
        <LoadingBlock />
      </OperatorShell>
    );
  }

  if (role !== "admin") {
    return (
      <OperatorShell items={NAV} role={null} title={t("admin.title")}>
        <EmptyState icon="warn" title={t("admin.notAdmin")} />
      </OperatorShell>
    );
  }

  return (
    <OperatorShell
      items={NAV}
      role="admin"
      title={t("admin.title")}
      subtitle={
        workWaiting > 0 ? t("op.workWaiting") : t("op.allClear")
      }
      actions={
        <Link
          href="/admin/listings/new"
          className="border-2 border-ink bg-amber px-2.5 py-1.5 font-mono text-[11px] font-bold text-ink shadow-pixel-sm active:translate-x-[1px] active:translate-y-[1px]"
        >
          + {t("admin.addListing")}
        </Link>
      }
    >
      {/* Overview. The tiles that represent WORK go amber when non-zero, so
          "is there anything to do" is answered before anything is read. */}
      <section aria-label={t("op.overview")} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label={t("admin.queue")} value={pending.length} tone="action" hint={t("op.tileQueue")} />
        <StatTile label={t("admin.companies")} value={companies.length} tone="action" hint={t("op.tileCompanies")} />
        <StatTile label={t("admin.reports")} value={reports.length} tone="action" hint={t("op.tileReports")} />
        <StatTile label={t("op.access")} value={access.length} tone="action" hint={t("op.tileAccess")} />
      </section>

      <div className="no-scrollbar mt-5 flex gap-1.5 overflow-x-auto border-b-3 border-ink/20 pb-3">
        {TABS.map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => setTab(x.id)}
            aria-pressed={tab === x.id}
            className={`shrink-0 border-3 border-ink px-2 py-1 font-mono text-[10px] font-bold ${
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
                    className="flex-1 border-2 border-ink bg-mint px-2 py-1 font-mono text-[10px] font-bold text-ink disabled:opacity-50"
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
                    className="flex-1 border-2 border-ink bg-alert px-2 py-1 font-mono text-[10px] font-bold text-cream disabled:opacity-50"
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
                    className="font-mono text-[11px] text-amberInk underline"
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
                    className="flex-1 border-2 border-ink bg-mint px-2 py-1 font-mono text-[10px] font-bold text-ink disabled:opacity-50"
                  >
                    {t("admin.verify")}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => guarded(() => verifyCompany(c.id, "rejected"))}
                    className="flex-1 border-2 border-ink bg-alert px-2 py-1 font-mono text-[10px] font-bold text-cream disabled:opacity-50"
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
                <p className="font-mono text-xs font-bold text-ink">
                  {r.reason}
                </p>
                {r.details && (
                  <p className="mt-1 font-mono text-[11px] text-ink/70">{r.details}</p>
                )}
                <Link
                  href={`/opportunity/${r.opportunity_id}`}
                  className="font-mono text-[11px] text-amberInk underline"
                >
                  {t("admin.action")} ↗
                </Link>

                <div className="mt-2 flex gap-1.5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => guarded(() => resolveReport(r.id, "actioned"))}
                    className="flex-1 border-2 border-ink bg-mint px-2 py-1 font-mono text-[10px] font-bold text-ink disabled:opacity-50"
                  >
                    {t("admin.action")}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => guarded(() => resolveReport(r.id, "dismissed"))}
                    className="flex-1 border-2 border-ink bg-grey px-2 py-1 font-mono text-[10px] font-bold text-cream disabled:opacity-50"
                  >
                    {t("admin.dismiss")}
                  </button>
                </div>
              </article>
            ))
          )}
        </section>
      )}

      {/* ── employer access requests + referrals ── */}
      {tab === "access" && (
        <section className="mb-6 mt-4 space-y-2">
          {/* Referral. Keyed to an address, never a shareable code: see
              migration 0017 for why that choice removes the need for a
              privilege-escalation RPC entirely. */}
          <div className="border-3 border-ink bg-paper p-3 shadow-pixel-sm">
            <p className="font-pixel text-[10px] text-ink">
              {t("op.inviteTitle")}
            </p>
            <p className="mt-1 font-mono text-[10px] leading-relaxed text-grey">
              {t("op.inviteHint")}
            </p>
            <div className="mt-2 flex flex-col gap-2">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder={t("op.inviteEmail")}
                aria-label={t("op.inviteEmail")}
                className="w-full border-3 border-ink bg-cream px-2 py-1.5 font-mono text-[11px] text-ink placeholder:text-grey focus:outline-none"
              />
              <div className="flex gap-1.5">
                {(["employer", "admin"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setInviteRole(r)}
                    aria-pressed={inviteRole === r}
                    className={`flex-1 border-2 border-ink px-2 py-1 font-mono text-[10px] font-bold ${
                      inviteRole === r ? "bg-ink text-cream" : "bg-paper text-ink"
                    }`}
                  >
                    {r === "admin" ? t("admin.title") : t("emp.title")}
                  </button>
                ))}
              </div>
              <button
                type="button"
                disabled={busy || !inviteEmail.includes("@")}
                onClick={sendInvite}
                className="border-2 border-ink bg-amber px-2 py-1 font-mono text-[10px] font-bold text-ink disabled:opacity-50"
              >
                {t("op.inviteSend")}
              </button>
            </div>

            {invites.length > 0 && (
              <ul className="mt-3 space-y-1 border-t-2 border-ink/20 pt-2">
                {invites.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-mono text-[11px] text-ink">
                      {i.email}
                      <span className="ml-1.5 text-grey">
                        {i.role === "admin" ? t("admin.title") : t("emp.title")}
                      </span>
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => guarded(() => revokeInvite(i.id))}
                      className="shrink-0 border-2 border-ink bg-paper px-1.5 py-0.5 font-mono text-[9px] font-bold text-ink disabled:opacity-50"
                    >
                      {t("op.inviteRevoke")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {access.length === 0 ? (
            <EmptyState icon="check" title={t("op.accessEmpty")} />
          ) : (
            access.map((r) => (
              <article key={r.id} className="border-3 border-ink bg-paper p-3 shadow-pixel-sm">
                <p className="font-mono text-xs font-bold text-ink">{r.company_name}</p>
                <dl className="mt-1 space-y-0.5 font-mono text-[11px] text-ink/80">
                  {r.company_website && (
                    <div className="flex gap-1.5">
                      <dt className="text-grey">web</dt>
                      {/* Untrusted: an applicant typed this. Opened with
                          noreferrer and never auto-fetched. */}
                      <dd className="min-w-0 break-all">
                        <a
                          href={r.company_website}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="underline"
                        >
                          {r.company_website}
                        </a>
                      </dd>
                    </div>
                  )}
                  {r.contact_role && (
                    <div className="flex gap-1.5">
                      <dt className="text-grey">role</dt>
                      <dd>{r.contact_role}</dd>
                    </div>
                  )}
                </dl>

                <label className="mt-2 block">
                  <span className="sr-only">{t("op.accessNotes")}</span>
                  <input
                    value={reason[r.id] ?? ""}
                    onChange={(e) => setReason((m) => ({ ...m, [r.id]: e.target.value }))}
                    placeholder={t("op.accessNotes")}
                    className="w-full border-3 border-ink bg-cream px-2 py-1.5 font-mono text-[11px] text-ink placeholder:text-grey focus:outline-none"
                  />
                </label>

                <div className="mt-2 flex gap-1.5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => decide(r.id, true)}
                    className="flex-1 border-2 border-ink bg-mint px-2 py-1 font-mono text-[10px] font-bold text-ink disabled:opacity-50"
                  >
                    {t("op.accessApprove")}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => decide(r.id, false)}
                    className="flex-1 border-2 border-ink bg-alert px-2 py-1 font-mono text-[10px] font-bold text-cream disabled:opacity-50"
                  >
                    {t("op.accessReject")}
                  </button>
                </div>
              </article>
            ))
          )}
        </section>
      )}

      {tab === "sources" && <SourceHealthPanel />}
    </OperatorShell>
  );
}
