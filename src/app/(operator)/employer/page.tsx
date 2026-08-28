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

const LISTING_STATUS_TONE: Record<ListingStatus, string> = {
  pending: "bg-amber",
  approved: "bg-mint",
  rejected: "bg-alert text-cream",
  expired: "bg-grey text-cream",
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
    ...(role === "admin"
      ? [{ href: "/admin", icon: "check" as const, key: "admin.title" as const }]
      : []),
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

      {/* verification is admin-owned: reported, never editable here */}
      <p className="mt-2 inline-block border-2 border-ink bg-paper px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wide text-ink">
        {t("emp.verification")}: {t(VERIFY_KEY[company.verification_status])}
      </p>

      {/* ── company profile ── */}
      <section className="mt-4 border-3 border-ink bg-paper p-3 shadow-pixel">
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
      <section className="mt-5">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-xs font-bold uppercase tracking-wide text-ink">
            {t("emp.listings")} ({listings.length})
          </h2>
          <Link
            href="/employer/listings/new"
            className="border-2 border-ink bg-amber px-2 py-1 font-mono text-[11px] font-bold uppercase text-ink shadow-pixel-sm"
          >
            + {t("emp.newListing")}
          </Link>
        </div>

        {listings.length === 0 ? (
          <p className="mt-2 font-mono text-[11px] text-grey">{t("emp.noListings")}</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {listings.map((l) => (
              <li
                key={l.id}
                className="border-3 border-ink bg-cream p-2.5 shadow-pixel-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs font-bold text-ink">
                      {l.role}
                    </p>
                    <p className="truncate font-mono text-[11px] text-ink/70">
                      {l.location} · {l.duration}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 border-2 border-ink px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase ${LISTING_STATUS_TONE[l.status ?? "pending"]}`}
                  >
                    {t(LISTING_STATUS_KEY[l.status ?? "pending"])}
                  </span>
                </div>
                {l.rejection_reason && (
                  <p className="mt-1.5 border-2 border-ink bg-alert p-1.5 font-mono text-[10px] text-cream">
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
                {l.status === "approved" &&
                  (isPromoted(l) ? (
                    <p className="mt-1.5 inline-block border-2 border-ink bg-amber px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase text-ink">
                      {t("pay.promoted")} · {t("pay.promotedUntil")}{" "}
                      {new Date(l.featured_until!).toLocaleDateString()}
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startPromotion(l.id)}
                      disabled={promoting === l.id}
                      className="mt-1.5 border-2 border-ink bg-paper px-1.5 py-1 font-mono text-[10px] font-bold uppercase text-ink shadow-pixel-sm disabled:opacity-50"
                    >
                      {t("pay.promote")} · {t("pay.sandboxTag")}
                    </button>
                  ))}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── applicant pipeline ── */}
      <section className="mb-6 mt-5">
        <h2 className="font-mono text-xs font-bold uppercase tracking-wide text-ink">
          {t("emp.applicants")} ({applicants.length})
        </h2>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {EMPLOYER_SET_STATUSES.map((s) => (
            <span
              key={s}
              className="border-2 border-ink bg-paper px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase text-ink"
            >
              {s}: {pipeline[s]}
            </span>
          ))}
        </div>

        {applicants.length === 0 ? (
          <p className="mt-3 font-mono text-[11px] text-grey">{t("emp.noApplicants")}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {applicants.map(({ application, opportunity, profile }) => (
              <li
                key={application.id}
                className="border-3 border-ink bg-cream p-2.5 shadow-pixel-sm"
              >
                <p className="font-mono text-xs font-bold text-ink">
                  {profile?.name ?? t("emp.noProfile")}
                </p>
                <p className="font-mono text-[11px] text-ink/70">
                  {opportunity.role}
                  {profile &&
                    ` · ${profile.department} · ${t("emp.cgpa")} ${Number(profile.cgpa).toFixed(2)}`}
                </p>
                {profile && profile.skills.length > 0 && (
                  <p className="mt-1 font-mono text-[10px] text-grey">
                    {profile.skills.join(", ")}
                  </p>
                )}

                <div className="mt-2 flex flex-wrap gap-1.5 border-t-2 border-ink/20 pt-2">
                  {EMPLOYER_SET_STATUSES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={busy || application.status === s}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await setApplicationStatus(application.id, s);
                          await load();
                        } finally {
                          setBusy(false);
                        }
                      }}
                      className="border-2 border-ink bg-paper px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase text-ink active:translate-x-[1px] active:translate-y-[1px] disabled:bg-ink disabled:text-cream disabled:opacity-100"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </OperatorShell>
  );
}
