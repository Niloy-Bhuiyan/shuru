"use client";

/**
 * EMPLOYER DASHBOARD
 *
 * Company setup, listings, and the applicant pipeline in one screen — an
 * employer here manages one company, so a separate index would be a menu with
 * a single entry.
 *
 * Two things are deliberately read-only in this UI because the database owns
 * them: `verification_status` (admin-set, guarded by
 * `guard_company_verification`) and a listing's `status` (admin-set, guarded
 * by `guard_opportunity_moderation`). Rendering them as editable would be a
 * lie about what a save can do.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { LoadingBlock } from "@/components/LoadingBlock";
import { OperatorShell, StatTile } from "@/components/operator/OperatorShell";
import type { OperatorNavItem } from "@/components/operator/OperatorSideNav";
import { EmptyState } from "@/components/EmptyState";
import { PixelButton } from "@/components/pixel/PixelButton";
import { PixelInput } from "@/components/pixel/PixelInput";
import { PixelBadge } from "@/components/pixel/PixelBadge";
import {
  createCompany,
  getMyCompany,
  listCompanyApplicants,
  listCompanyListings,
  setApplicationStatus,
  summarisePipeline,
  updateCompany,
  type ApplicantRow,
} from "@/lib/data/employer";
import { useRole } from "@/hooks/useRole";
import { useLang, type StringKey } from "@/lib/i18n";
import type { Company, ListingStatus, Opportunity } from "@/lib/types";
import { EMPLOYER_SET_STATUSES } from "@/lib/types";

const LISTING_STATUS_KEY: Record<ListingStatus, StringKey> = {
  pending: "emp.pendingReview",
  approved: "emp.approved",
  rejected: "emp.rejected",
  expired: "emp.expired",
};

/**
 * Status colour, expressed as a PixelBadge tone rather than a raw fill.
 *
 * These were saturated blocks -- solid amber, solid mint, white-on-red. One
 * per listing row, down a list, is a column of traffic lights shouting at an
 * employer about listings that are mostly just fine. The badge tones carry the
 * same four meanings as tints, which is the volume a status label warrants.
 */
const LISTING_STATUS_TONE: Record<
  ListingStatus,
  React.ComponentProps<typeof PixelBadge>["tone"]
> = {
  pending: "urgent",
  approved: "qualify",
  rejected: "alert",
  expired: "borderline",
};

const VERIFY_KEY = {
  pending: "emp.verifyPending",
  approved: "emp.verifyApproved",
  rejected: "emp.verifyRejected",
} as const satisfies Record<Company["verification_status"], StringKey>;

export default function EmployerPage() {
  const { t } = useLang();
  const [promoting, setPromoting] = useState<string | null>(null);
  const { role, loading: roleLoading } = useRole();

  const [company, setCompany] = useState<Company | null | undefined>(undefined);
  const [listings, setListings] = useState<Opportunity[]>([]);
  const [applicants, setApplicants] = useState<ApplicantRow[]>([]);
  const [busy, setBusy] = useState(false);

  // company form
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [industry, setIndustry] = useState("");
  const [location, setLocation] = useState("");

  const load = useCallback(async () => {
    const c = await getMyCompany();
    setCompany(c);
    if (!c) return;
    setName(c.name);
    setWebsite(c.website ?? "");
    setIndustry(c.industry ?? "");
    setLocation(c.location ?? "");
    const [ls, as] = await Promise.all([
      listCompanyListings(c.id),
      listCompanyApplicants(c.id),
    ]);
    setListings(ls);
    setApplicants(as);
  }, []);

  useEffect(() => {
    if (roleLoading) return;
    if (role !== "employer" && role !== "admin") {
      setCompany(null);
      return;
    }
    load().catch(() => setCompany(null));
  }, [role, roleLoading, load]);

  // The rail. An employer sees only their own workspace; an admin visiting
  // it keeps a way back to moderation.
  const NAV: OperatorNavItem[] = [
    { href: "/employer", icon: "hammer", key: "emp.title" },
    { href: "/employer/listings/new", icon: "edit", key: "emp.newListing" },
    // No cross-link back to /admin. The employer workspace is a product for
    // employers; an admin who is standing in it should be looking at it as
    // one, not treating it as a tab of the console.
  ];

  if (roleLoading || company === undefined) {
    return (
      <OperatorShell items={NAV} role="employer" title={t("emp.title")}>
        <LoadingBlock />
      </OperatorShell>
    );
  }

  if (role !== "employer" && role !== "admin") {
    return (
      <OperatorShell items={NAV} role="employer" title={t("emp.title")}>
        <EmptyState icon="warn" title={t("emp.notEmployer")} />
      </OperatorShell>
    );
  }

  // ── first run: create the company ──
  if (!company) {
    return (
      <OperatorShell
        items={NAV}
        role="employer"
        title={t("emp.setupTitle")}
        subtitle={t("emp.setupHint")}
      >

        <form
          className="mt-4 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim() || busy) return;
            setBusy(true);
            try {
              await createCompany({
                name: name.trim(),
                website: website.trim() || null,
                industry: industry.trim() || null,
                location: location.trim() || null,
              });
              await load();
            } finally {
              setBusy(false);
            }
          }}
        >
          <PixelInput
            label={t("emp.companyName")}
            name="company-name"
            value={name}
            onChange={setName}
            required
          />
          <PixelInput
            label={t("emp.website")}
            name="company-website"
            value={website}
            onChange={setWebsite}
            placeholder="https://"
          />
          <PixelInput
            label={t("emp.industry")}
            name="company-industry"
            value={industry}
            onChange={setIndustry}
          />
          <PixelInput
            label={t("emp.location")}
            name="company-location"
            value={location}
            onChange={setLocation}
            placeholder="Dhaka"
          />
          <PixelButton full type="submit" disabled={busy || !name.trim()}>
            {busy ? t("emp.creating") : t("emp.create")}
          </PixelButton>
        </form>
      </OperatorShell>
    );
  }

  const pipeline = summarisePipeline(applicants);

  /** A listing is promoted while `featured_until` is still in the future. */
  function isPromoted(l: Opportunity): boolean {
    return Boolean(l.featured_until && new Date(l.featured_until) > new Date());
  }

  /**
   * Starts a sandbox payment and hands off to the checkout page.
   *
   * Nothing is granted here — the server writes a `pending` row and the
   * entitlement arrives only via the verified webhook.
   */
  async function startPromotion(opportunityId: string) {
    setPromoting(opportunityId);
    try {
      const res = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ opportunity_id: opportunityId }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && typeof body.redirect_url === "string") {
        window.location.href = body.redirect_url;
        return;
      }
    } finally {
      setPromoting(null);
    }
  }

  return (
    <OperatorShell
      items={NAV}
      role="employer"
      title={company.name}
      subtitle={t("emp.dashSubtitle")}
    >

      {/*
        The overview row this console has always needed.

        `StatTile` was imported here and never rendered -- the employer
        dashboard borrowed the admin console's tile and then made an employer
        read their own pipeline out of a strip of "status: n" chips further
        down the page. These are the four numbers an employer opens the
        dashboard to see, so they go at the top, in the same component the
        admin console uses for the same job.
      */}
      <section aria-label={t("op.overview")} className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile label={t("emp.listings")} value={listings.length} />
        <StatTile label={t("emp.applicants")} value={applicants.length} />
        <StatTile
          label={t("emp.applied")}
          value={pipeline.applied}
          tone="action"
          hint={t("emp.tileNew")}
        />
        <StatTile label={t("emp.interview")} value={pipeline.interview} />
      </section>

      {/* verification is admin-owned: reported, never editable here */}
      <p className="mt-4 flex flex-wrap items-center gap-2 font-sans text-[13px] text-ui-muted">
        {t("emp.verification")}:
        <PixelBadge
          tone={
            company.verification_status === "approved"
              ? "qualify"
              : company.verification_status === "rejected"
                ? "alert"
                : "urgent"
          }
        >
          {t(VERIFY_KEY[company.verification_status])}
        </PixelBadge>
      </p>

      {/* ── company profile ── */}
      <section className="mt-4 rounded-xl border border-ui-line bg-paper p-4">
        <div className="space-y-3">
          <PixelInput
            label={t("emp.companyName")}
            name="c-name"
            value={name}
            onChange={setName}
          />
          <PixelInput
            label={t("emp.website")}
            name="c-website"
            value={website}
            onChange={setWebsite}
          />
          <PixelInput
            label={t("emp.location")}
            name="c-location"
            value={location}
            onChange={setLocation}
          />
          <PixelButton
            full
            variant="secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await updateCompany(company.id, {
                  name: name.trim(),
                  website: website.trim() || null,
                  location: location.trim() || null,
                });
                await load();
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("emp.save")}
          </PixelButton>
        </div>
      </section>

      {/* ── listings ── */}
      <section className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-sans text-[16px] font-semibold tracking-[-0.01em] text-ink">
            {t("emp.listings")}{" "}
            <span className="font-normal text-ui-faint tabular">
              {listings.length}
            </span>
          </h2>
          <Link
            href="/employer/listings/new"
            className="inline-flex min-h-[36px] items-center rounded-lg bg-ink px-3 font-sans text-[13px] font-medium text-white transition-opacity hover:opacity-90"
          >
            + {t("emp.newListing")}
          </Link>
        </div>

        {listings.length === 0 ? (
          <p className="mt-3 font-sans text-[14px] text-ui-muted">
            {t("emp.noListings")}
          </p>
        ) : (
          <ul className="mt-3 space-y-2.5">
            {listings.map((l) => (
              <li
                key={l.id}
                className="rounded-xl border border-ui-line bg-paper p-4 transition-colors hover:border-ui-lineStrong"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-sans text-[15px] font-medium text-ink">
                      {l.role}
                    </p>
                    <p className="mt-0.5 truncate font-sans text-[13px] text-ui-muted">
                      {l.location} · {l.duration}
                    </p>
                  </div>
                  <PixelBadge
                    tone={LISTING_STATUS_TONE[l.status ?? "pending"]}
                    className="shrink-0"
                  >
                    {t(LISTING_STATUS_KEY[l.status ?? "pending"])}
                  </PixelBadge>
                </div>
                {l.rejection_reason && (
                  <p className="mt-2.5 rounded-lg border border-alert/30 bg-alert/5 p-2.5 font-sans text-[13px] leading-relaxed text-ink">
                    {l.rejection_reason}
                  </p>
                )}
                {/*
                  Promotion is offered only on an approved listing: promoting
                  one a student cannot see would be selling nothing. The
                  sandbox tag is on the button itself, not only on the
                  checkout page, so the flow is never entered by someone who
                  thinks they are about to be charged.
                */}
                {l.status === "approved" && (
                  <div className="mt-3">
                    {isPromoted(l) ? (
                      <PixelBadge tone="urgent" icon="spark">
                        {t("pay.promoted")} · {t("pay.promotedUntil")}{" "}
                        {new Date(l.featured_until!).toLocaleDateString()}
                      </PixelBadge>
                    ) : (
                      <PixelButton
                        size="sm"
                        variant="secondary"
                        onClick={() => startPromotion(l.id)}
                        disabled={promoting === l.id}
                      >
                        {t("pay.promote")} · {t("pay.sandboxTag")}
                      </PixelButton>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── applicant pipeline ── */}
      <section className="mb-6 mt-7">
        <h2 className="font-sans text-[16px] font-semibold tracking-[-0.01em] text-ink">
          {t("emp.applicants")}{" "}
          <span className="font-normal text-ui-faint tabular">
            {applicants.length}
          </span>
        </h2>

        {/* The pipeline counts. The four that matter are already in the tiles
            at the top of the page; this is the full breakdown, so it reads as
            a legend rather than as a second set of headline figures. */}
        <dl className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
          {EMPLOYER_SET_STATUSES.map((s) => (
            <div key={s} className="flex items-baseline gap-1.5">
              <dt className="font-sans text-[13px] text-ui-faint">{s}</dt>
              <dd className="font-sans text-[13px] font-medium text-ink tabular">
                {pipeline[s]}
              </dd>
            </div>
          ))}
        </dl>

        {applicants.length === 0 ? (
          <p className="mt-3 font-sans text-[14px] text-ui-muted">
            {t("emp.noApplicants")}
          </p>
        ) : (
          <ul className="mt-3 space-y-2.5">
            {applicants.map(({ application, opportunity, profile }) => (
              <li
                key={application.id}
                className="rounded-xl border border-ui-line bg-paper p-4 transition-colors hover:border-ui-lineStrong"
              >
                <p className="font-sans text-[15px] font-medium text-ink">
                  {profile?.name ?? t("emp.noProfile")}
                </p>
                <p className="mt-0.5 font-sans text-[13px] text-ui-muted">
                  {opportunity.role}
                  {profile &&
                    ` · ${profile.department} · ${t("emp.cgpa")} ${Number(profile.cgpa).toFixed(2)}`}
                </p>
                {profile && profile.skills.length > 0 && (
                  <p className="mt-1.5 font-sans text-[13px] leading-relaxed text-ui-faint">
                    {profile.skills.join(", ")}
                  </p>
                )}

                <div className="mt-3 border-t border-ui-line pt-3">
                  <p className="font-sans text-[12px] font-medium text-ui-muted">
                    {t("emp.moveTo")}
                  </p>
                  {/* A segmented control, because these are one setting with
                      six values -- not six independent buttons. The current
                      value is the pressed segment rather than a disabled
                      button, which previously made "where this applicant IS"
                      look like "what you may not do". */}
                  <div
                    role="group"
                    aria-label={t("emp.moveTo")}
                    className="mt-1.5 flex flex-wrap gap-1.5"
                  >
                    {EMPLOYER_SET_STATUSES.map((s) => {
                      const current = application.status === s;
                      return (
                        <button
                          key={s}
                          type="button"
                          aria-pressed={current}
                          disabled={busy || current}
                          onClick={async () => {
                            setBusy(true);
                            try {
                              await setApplicationStatus(application.id, s);
                              await load();
                            } finally {
                              setBusy(false);
                            }
                          }}
                          className={`min-h-[32px] rounded-lg border px-2.5 font-sans text-[13px] font-medium transition-colors ${
                            current
                              ? "border-ink bg-ink text-white"
                              : "border-ui-lineStrong bg-paper text-ui-muted hover:bg-cream hover:text-ink disabled:opacity-50"
                          }`}
                        >
                          {s}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </OperatorShell>
  );
}
