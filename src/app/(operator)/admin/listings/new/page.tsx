"use client";

/**
 * ADMIN CURATION — add a listing no source publishes.
 *
 * The ingestion pipeline can only reach boards with public APIs, and no
 * Bangladeshi job board or major BD employer has one (verified: Robi,
 * Grameenphone, bKash and Brac Bank all run custom career pages with no ATS).
 * Scraping therefore yields remote roles only, and every local internship —
 * the ones this product exists for — has to be entered by hand.
 *
 * Published immediately: an admin adding a listing IS the moderation step,
 * so routing it through the pending queue for the same person to approve
 * would be theatre.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoadingBlock } from "@/components/LoadingBlock";
import { EmptyState } from "@/components/EmptyState";
import { PixelButton } from "@/components/pixel/PixelButton";
import { PixelInput } from "@/components/pixel/PixelInput";
import { createCuratedListing } from "@/lib/data/admin";
import { useRole } from "@/hooks/useRole";
import { useLang } from "@/lib/i18n";
import type { WorkMode } from "@/lib/types";

const WORK_MODES: WorkMode[] = ["onsite", "remote", "hybrid"];

export default function AdminNewListingPage() {
  const { t } = useLang();
  const router = useRouter();
  const { role, loading } = useRole();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [company, setCompany] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [location, setLocation] = useState("Dhaka, Bangladesh");
  const [duration, setDuration] = useState("");
  const [deadline, setDeadline] = useState("");
  const [workMode, setWorkMode] = useState<WorkMode>("onsite");
  const [isPaid, setIsPaid] = useState(true);
  const [applyUrl, setApplyUrl] = useState("");
  const [skills, setSkills] = useState("");
  const [minCgpa, setMinCgpa] = useState("");
  const [minSemester, setMinSemester] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!loading && role !== "admin") setError(t("admin.notAdmin"));
  }, [role, loading, t]);

  if (loading) {
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

  return (
    <main className="px-4 pt-4">
      <h1 className="font-pixel text-xs text-ink">{t("admin.addListing")}</h1>
      <p className="mt-2 font-mono text-[11px] leading-relaxed text-grey">
        {t("admin.addListingHint")}
      </p>

      <form
        className="mb-8 mt-4 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError(null);
          try {
            await createCuratedListing({
              company,
              role: roleTitle,
              location,
              duration,
              deadline,
              work_mode: workMode,
              is_paid: isPaid,
              apply_url: applyUrl.trim() || null,
              skills_required: skills
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
              min_cgpa: minCgpa ? Number(minCgpa) : null,
              min_semester: minSemester ? Number(minSemester) : null,
              notes: notes.trim() || null,
            });
            setDone(true);
            router.push("/radar");
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <PixelInput
          label={t("emp.companyName")}
          name="c-company"
          value={company}
          onChange={setCompany}
          required
          placeholder="Robi Axiata"
        />
        <PixelInput
          label={t("emp.role")}
          name="c-role"
          value={roleTitle}
          onChange={setRoleTitle}
          required
          placeholder="Intern, Technology"
        />
        <PixelInput
          label={t("emp.location")}
          name="c-location"
          value={location}
          onChange={setLocation}
          required
        />
        <PixelInput
          label={t("emp.duration")}
          name="c-duration"
          value={duration}
          onChange={setDuration}
          placeholder="3 months"
        />
        <PixelInput
          label={t("emp.deadline")}
          name="c-deadline"
          type="date"
          value={deadline}
          onChange={setDeadline}
          required
        />

        <div>
          <span className="font-mono text-[11px] font-bold uppercase tracking-wide text-ink">
            {t("emp.workMode")}
          </span>
          <div className="mt-1 flex gap-1.5">
            {WORK_MODES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setWorkMode(m)}
                aria-pressed={workMode === m}
                className={`flex-1 border-3 border-ink px-2 py-1.5 font-mono text-[11px] font-bold uppercase ${
                  workMode === m ? "bg-ink text-cream" : "bg-paper text-ink"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isPaid}
            onChange={(e) => setIsPaid(e.target.checked)}
            className="h-4 w-4 accent-amber"
          />
          <span className="font-mono text-xs text-ink">{t("emp.isPaid")}</span>
        </label>

        <PixelInput
          label={t("admin.applyUrl")}
          name="c-url"
          value={applyUrl}
          onChange={setApplyUrl}
          placeholder="https://"
        />
        <PixelInput
          label={t("emp.skillsRequired")}
          name="c-skills"
          value={skills}
          onChange={setSkills}
          hint={t("emp.skillsHint")}
          placeholder="Python, SQL, Excel"
        />

        <div className="grid grid-cols-2 gap-3">
          <PixelInput
            label={t("emp.minCgpa")}
            name="c-cgpa"
            type="number"
            min="0"
            max="4"
            step="0.01"
            value={minCgpa}
            onChange={setMinCgpa}
            placeholder="3.00"
          />
          <PixelInput
            label={t("emp.minSemester")}
            name="c-sem"
            type="number"
            min="1"
            max="12"
            value={minSemester}
            onChange={setMinSemester}
          />
        </div>

        <PixelInput
          label={t("admin.notes")}
          name="c-notes"
          value={notes}
          onChange={setNotes}
          placeholder="Final-year students only"
        />

        {error && (
          <p className="border-3 border-ink bg-alert p-2 font-mono text-[11px] text-cream">
            {error}
          </p>
        )}

        <PixelButton full type="submit" disabled={busy}>
          {busy
            ? t("admin.savingListing")
            : done
              ? t("admin.listingAdded")
              : t("admin.saveListing")}
        </PixelButton>
      </form>
    </main>
  );
}
