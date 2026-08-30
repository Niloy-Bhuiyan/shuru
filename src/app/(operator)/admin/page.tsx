"use client";

/**
 * ADMIN MODERATION DASHBOARD
 *
 * Six queues: listings awaiting review, companies awaiting verification,
 * open listing reports, employer access requests, mobile-money transactions
 * awaiting verification, and ingestion source health.
 *
 * The access queue is the only way anyone becomes an employer. Approving
 * calls decide_employer_access, a SECURITY INVOKER function, so the
 * admin-only policies on user_roles still apply to whoever calls it -- this
 * screen decides what to show, never what is permitted.
 *
 * The role check here only decides what to render. The real boundary is in
 * the database -- `moderateListing`/`verifyCompany` re-read the row after
 * writing and raise `ModerationRejected` if the guard trigger reverted it, so
 * a non-admin who reaches this screen gets an honest error rather than a
 * moderation action that silently did nothing.
 *
 * ── The console has ONE navigation for the queues ─────────────────────────
 *
 * There used to be two, stacked: a row of five stat tiles carrying the counts,
 * and directly beneath it a row of six tab buttons carrying the same counts
 * again. Two controls, one axis, identical numbers -- and only the lower one
 * did anything. The tiles ARE the selector now. That removes the duplication,
 * gives the counts a job, and means the number an operator reads and the
 * thing they click are the same object.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { LoadingBlock } from "@/components/LoadingBlock";
import { EmptyState } from "@/components/EmptyState";
import { SourceHealthPanel } from "@/components/admin/SourceHealthPanel";
import { PaymentsQueue } from "@/components/admin/PaymentsQueue";
import { OperatorShell, StatTile } from "@/components/operator/OperatorShell";
import { PixelButton } from "@/components/pixel/PixelButton";
import { PixelBadge } from "@/components/pixel/PixelBadge";
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
import { useLang, type StringKey } from "@/lib/i18n";
import type { Company, ListingReport, Opportunity } from "@/lib/types";

type Tab = "queue" | "companies" | "reports" | "access" | "payments" | "sources";

export default function AdminPage() {
  const { t } = useLang();
  const { role, loading: roleLoading } = useRole();

  const [tab, setTab] = useState<Tab>("queue");
  const [pending, setPending] = useState<Opportunity[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [reports, setReports] = useState<ListingReport[]>([]);
  const [access, setAccess] = useState<EmployerAccessRequest[]>([]);
  const [invites, setInvites] = useState<RoleInvite[]>([]);
  /*
   * Owned by PaymentsQueue and lifted here, rather than fetched again in this
   * file. The queue is the only thing that knows what is outstanding, and two
   * independent counts of the same table drift the moment one of them is
   * reloaded and the other is not.
   */
  const [paymentCount, setPaymentCount] = useState(0);
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

  /*
   * The queues, defined once. They drive the tiles (which are the selector),
   * the panel heading, and the rail badge -- so a count can never appear as
   * one number in one place and a different number two inches away.
   *
   * `count: null` means "this queue has no backlog to count". Source health is
   * a status, not a pile of work; giving it a 0 would file it under "nothing
   * to do here" alongside the queues that are genuinely clear.
   */
  const QUEUES: {
    id: Tab;
    label: string;
    hint: StringKey;
    count: number | null;
  }[] = [
    { id: "queue", label: t("admin.queue"), hint: "op.tileQueue", count: pending.length },
    { id: "companies", label: t("admin.companies"), hint: "op.tileCompanies", count: companies.length },
    { id: "reports", label: t("admin.reports"), hint: "op.tileReports", count: reports.length },
    { id: "access", label: t("op.access"), hint: "op.tileAccess", count: access.length },
    { id: "payments", label: t("adminPay.tab"), hint: "op.tilePayments", count: paymentCount },
    { id: "sources", label: t("admin.sources"), hint: "op.tileSources", count: null },
  ];

  // Everything an admin can act on right now. Drives the header subtitle and
  // the rail badge, so "is there work" is answered in two places from one
  // number rather than two that can disagree.
  const workWaiting =
    pending.length +
    companies.length +
    reports.length +
    access.length +
    // Counted with the rest because somebody has already sent money and is
    // waiting on a human. If anything in this console is urgent, it is this.
    paymentCount;

  // Admin destinations ONLY. The rail used to carry a link into the employer
  // workspace, which meant the maintenance console offered a hop into a
  // different product -- three roles smeared into one navigation. An admin who
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

  const active = QUEUES.find((q) => q.id === tab)!;

  return (
    <OperatorShell
      items={NAV}
      role="admin"
      title={t("admin.title")}
      subtitle={workWaiting > 0 ? t("op.workWaiting") : t("op.allClear")}
      actions={
        <Link
          href="/admin/listings/new"
          className="inline-flex min-h-[36px] items-center rounded-lg bg-ink px-3 font-sans text-[13px] font-medium text-white transition-opacity hover:opacity-90"
        >
          + {t("admin.addListing")}
        </Link>
      }
    >
      {/* ── overview, and the queue selector ─────────────────────────────
          One control doing both jobs. See the header note. */}
      <section aria-label={t("op.selectQueue")}>
        <h2 className="sr-only">{t("op.overview")}</h2>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
          {QUEUES.map((q) => (
            <StatTile
              key={q.id}
              label={q.label}
              value={q.count ?? "—"}
              hint={t(q.hint)}
              tone="action"
              selected={tab === q.id}
              onClick={() => setTab(q.id)}
            />
          ))}
        </div>
      </section>

      {error && (
        <p
          role="alert"
          className="mt-5 rounded-lg border border-alert bg-alert/5 p-3 font-sans text-[13px] leading-relaxed text-alert"
        >
          {error}
        </p>
      )}

      {/* The panel gets its own heading rather than relying on the pressed
          tile. "Which queue am I looking at" should not require reading a
          selection state six tiles wide. */}
      <div className="mt-6 flex items-baseline gap-2.5">
        <h2 className="font-sans text-[16px] font-semibold tracking-[-0.01em] text-ink">
          {active.label}
        </h2>
        {active.count !== null && active.count > 0 && (
          <PixelBadge tone="urgent">{active.count}</PixelBadge>
        )}
      </div>

      {/* ── listing queue ── */}
      {tab === "queue" && (
        <QueueList
          empty={pending.length === 0}
          emptyLabel={t("admin.noPending")}
        >
          {pending.map((l) => (
            <QueueRow key={l.id}>
              <Link href={`/opportunity/${l.id}`} className="block hover:underline">
                <p className="font-sans text-[15px] font-medium text-ink">{l.role}</p>
                <p className="mt-0.5 font-sans text-[13px] text-ui-muted">
                  {l.company} · {l.location}
                </p>
              </Link>

              <ReasonField
                id={`reason-${l.id}`}
                label={t("admin.rejectReason")}
                value={reason[l.id] ?? ""}
                onChange={(v) => setReason((p) => ({ ...p, [l.id]: v }))}
              />

              <RowActions>
                <PixelButton
                  size="sm"
                  variant="positive"
                  disabled={busy}
                  onClick={() => guarded(() => moderateListing(l.id, "approved"))}
                >
                  {t("admin.approve")}
                </PixelButton>
                <PixelButton
                  size="sm"
                  variant="danger"
                  disabled={busy}
                  onClick={() =>
                    guarded(() =>
                      moderateListing(l.id, "rejected", reason[l.id] || undefined)
                    )
                  }
                >
                  {t("admin.reject")}
                </PixelButton>
              </RowActions>
            </QueueRow>
          ))}
        </QueueList>
      )}

      {/* ── company verification ── */}
      {tab === "companies" && (
        <QueueList
          empty={companies.length === 0}
          emptyLabel={t("admin.noPending")}
        >
          {companies.map((c) => (
            <QueueRow key={c.id}>
              <p className="font-sans text-[15px] font-medium text-ink">{c.name}</p>
              <p className="mt-0.5 font-sans text-[13px] text-ui-muted">{c.location}</p>
              {c.website && (
                <a
                  href={c.website}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="mt-1 inline-block break-all font-sans text-[13px] text-amberInk underline"
                >
                  {c.website} ↗
                </a>
              )}

              <RowActions>
                <PixelButton
                  size="sm"
                  variant="positive"
                  disabled={busy}
                  onClick={() => guarded(() => verifyCompany(c.id, "approved"))}
                >
                  {t("admin.verify")}
                </PixelButton>
                <PixelButton
                  size="sm"
                  variant="danger"
                  disabled={busy}
                  onClick={() => guarded(() => verifyCompany(c.id, "rejected"))}
                >
                  {t("admin.reject")}
                </PixelButton>
              </RowActions>
            </QueueRow>
          ))}
        </QueueList>
      )}

      {/* ── reports ── */}
      {tab === "reports" && (
        <QueueList empty={reports.length === 0} emptyLabel={t("admin.noPending")}>
          {reports.map((r) => (
            <QueueRow key={r.id}>
              <p className="font-sans text-[15px] font-medium text-ink">{r.reason}</p>
              {r.details && (
                <p className="mt-0.5 font-sans text-[13px] leading-relaxed text-ui-muted">
                  {r.details}
                </p>
              )}
              <Link
                href={`/opportunity/${r.opportunity_id}`}
                className="mt-1 inline-block font-sans text-[13px] text-amberInk underline"
              >
                {t("admin.action")} ↗
              </Link>

              <RowActions>
                <PixelButton
                  size="sm"
                  variant="positive"
                  disabled={busy}
                  onClick={() => guarded(() => resolveReport(r.id, "actioned"))}
                >
                  {t("admin.action")}
                </PixelButton>
                <PixelButton
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => guarded(() => resolveReport(r.id, "dismissed"))}
                >
                  {t("admin.dismiss")}
                </PixelButton>
              </RowActions>
            </QueueRow>
          ))}
        </QueueList>
      )}

      {/* ── mobile-money transaction review ──
          Always mounted so its count is known before the tab is opened; the
          alternative is a component that hides its own body, and then the
          badge would only appear after a click. */}
      <div className={tab === "payments" ? "mt-3" : "hidden"}>
        <PaymentsQueue onCountChange={setPaymentCount} />
      </div>

      {/* ── employer access requests + referrals ── */}
      {tab === "access" && (
        <section className="mb-6 mt-3 space-y-3">
          {/* Referral. Keyed to an address, never a shareable code: see
              migration 0017 for why that choice removes the need for a
              privilege-escalation RPC entirely. */}
          <div className="rounded-xl border border-ui-line bg-paper p-4">
            <p className="font-sans text-[15px] font-medium text-ink">
              {t("op.inviteTitle")}
            </p>
            <p className="mt-1 max-w-prose font-sans text-[13px] leading-relaxed text-ui-muted">
              {t("op.inviteHint")}
            </p>

            <div className="mt-3 flex flex-col gap-2.5 sm:flex-row sm:items-end">
              <label className="min-w-0 flex-1">
                <span className="mb-1 block font-sans text-[13px] font-medium text-ink">
                  {t("op.inviteEmail")}
                </span>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="min-h-[40px] w-full rounded-lg border border-ui-lineStrong bg-paper px-3 font-sans text-[14px] text-ink placeholder:text-ui-faint focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
                />
              </label>

              <div
                role="group"
                aria-label={t("op.inviteTitle")}
                className="flex shrink-0 overflow-hidden rounded-lg border border-ui-lineStrong"
              >
                {(["employer", "admin"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setInviteRole(r)}
                    aria-pressed={inviteRole === r}
                    className={`min-h-[40px] px-3 font-sans text-[13px] font-medium transition-colors ${
                      inviteRole === r
                        ? "bg-ink text-white"
                        : "bg-paper text-ui-muted hover:bg-cream hover:text-ink"
                    }`}
                  >
                    {r === "admin" ? t("admin.title") : t("emp.title")}
                  </button>
                ))}
              </div>

              <PixelButton
                className="shrink-0"
                disabled={busy || !inviteEmail.includes("@")}
                onClick={sendInvite}
              >
                {t("op.inviteSend")}
              </PixelButton>
            </div>

            {invites.length > 0 && (
              <ul className="mt-4 space-y-1 border-t border-ui-line pt-3">
                {invites.map((i) => (
                  <li
                    key={i.id}
                    className="flex items-center justify-between gap-3 py-1"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 truncate font-sans text-[14px] text-ink">
                        {i.email}
                      </span>
                      <PixelBadge tone="borderline">
                        {i.role === "admin" ? t("admin.title") : t("emp.title")}
                      </PixelBadge>
                    </span>
                    <PixelButton
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => guarded(() => revokeInvite(i.id))}
                    >
                      {t("op.inviteRevoke")}
                    </PixelButton>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {access.length === 0 ? (
            <EmptyState icon="check" title={t("op.accessEmpty")} />
          ) : (
            access.map((r) => (
              <QueueRow key={r.id}>
                <p className="font-sans text-[15px] font-medium text-ink">
                  {r.company_name}
                </p>
                <dl className="mt-1 space-y-0.5 font-sans text-[13px] text-ui-muted">
                  {r.company_website && (
                    <div className="flex gap-2">
                      <dt className="shrink-0 text-ui-faint">web</dt>
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
                    <div className="flex gap-2">
                      <dt className="shrink-0 text-ui-faint">role</dt>
                      <dd>{r.contact_role}</dd>
                    </div>
                  )}
                </dl>

                <ReasonField
                  id={`access-${r.id}`}
                  label={t("op.accessNotes")}
                  value={reason[r.id] ?? ""}
                  onChange={(v) => setReason((m) => ({ ...m, [r.id]: v }))}
                />

                <RowActions>
                  <PixelButton
                    size="sm"
                    variant="positive"
                    disabled={busy}
                    onClick={() => decide(r.id, true)}
                  >
                    {t("op.accessApprove")}
                  </PixelButton>
                  <PixelButton
                    size="sm"
                    variant="danger"
                    disabled={busy}
                    onClick={() => decide(r.id, false)}
                  >
                    {t("op.accessReject")}
                  </PixelButton>
                </RowActions>
              </QueueRow>
            ))
          )}
        </section>
      )}

      {tab === "sources" && (
        <div className="mt-3">
          <SourceHealthPanel />
        </div>
      )}
    </OperatorShell>
  );
}

/* ────────────────────────────────────────────────────────────────────── */

/** The list body for a queue, or its cleared state. */
function QueueList({
  empty,
  emptyLabel,
  children,
}: {
  empty: boolean;
  emptyLabel: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6 mt-3 space-y-2.5">
      {empty ? <EmptyState icon="check" title={emptyLabel} /> : children}
    </section>
  );
}

/** One item awaiting a decision. */
function QueueRow({ children }: { children: React.ReactNode }) {
  return (
    <article className="rounded-xl border border-ui-line bg-paper p-4 transition-colors hover:border-ui-lineStrong">
      {children}
    </article>
  );
}

/**
 * The free-text note attached to a decision.
 *
 * It has a real visible label now. It was a bare placeholder before, and a
 * placeholder is not a label: it disappears the moment anyone types into it,
 * which on this screen means the field that gets QUOTED BACK to an employer
 * loses the only thing saying so exactly when it is being filled in.
 */
function ReasonField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="mt-3">
      <label
        htmlFor={id}
        className="mb-1 block font-sans text-[12px] font-medium text-ui-muted"
      >
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[40px] w-full rounded-lg border border-ui-lineStrong bg-paper px-3 font-sans text-[14px] text-ink placeholder:text-ui-faint focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
      />
    </div>
  );
}

/**
 * The decision buttons.
 *
 * They are sized to their words rather than stretched half-and-half across
 * the row. Two equal-width fills, one green and one red, is the layout of a
 * confirmation dialog -- it reads as though the pair is a single question
 * with a default, and it puts "reject" at the same visual weight as
 * "approve" on every row an operator scrolls past.
 */
function RowActions({ children }: { children: React.ReactNode }) {
  return <div className="mt-3 flex flex-wrap gap-2">{children}</div>;
}
