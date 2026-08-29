"use client";

/**
 * POST A LISTING
 *
 * Every listing enters as `pending` — `guard_opportunity_insert` rejects any
 * other status from a non-admin, so the form does not offer one.
 *
 * Required skills are prompted for prominently because they are the single
 * biggest input to the match engine: a listing without them cannot be scored
 * at all and the engine will abstain on it (ADR 0002). The hint says so
 * rather than letting an employer discover it later.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoadingBlock } from "@/components/LoadingBlock";
import { EmptyState } from "@/components/EmptyState";
import { PixelButton } from "@/components/pixel/PixelButton";
import { PixelInput } from "@/components/pixel/PixelInput";
import { createListing, getMyCompany } from "@/lib/data/employer";
import { useRole } from "@/hooks/useRole";
import { useLang } from "@/lib/i18n";
import type { Company, WorkMode } from "@/lib/types";

const WORK_MODES: WorkMode[] = ["onsite", "remote", "hybrid"];

export default function NewListingPage() {
  const { t } = useLang();
  const router = useRouter();
  const { role, loading: roleLoading } = useRole();

  const [company, setCompany] = useState<Company | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [role_, setRole_] = useState("");
  const [location, setLocation] = useState("");
  const [duration, setDuration] = useState("");
  const [deadline, setDeadline] = useState("");
  const [isPaid, setIsPaid] = useState(true);
  const [workMode, setWorkMode] = useState<WorkMode>("onsite");
  const [skills, setSkills] = useState("");
  const [minCgpa, setMinCgpa] = useState("");
  const [minSemester, setMinSemester] = useState("");

  useEffect(() => {
    if (roleLoading) return;
    if (role !== "employer" && role !== "admin") {
      setCompany(null);
      return;
    }
    getMyCompany()
      .then(setCompany)
      .catch(() => setCompany(null));
  }, [role, roleLoading]);

  if (roleLoading || company === undefined) {
    return (
      <main className="px-4 pt-4">
        <LoadingBlock />
      </main>
    );
  }

  if (!company) {
    return (
      <main className="px-4 pt-4">
        <EmptyState icon="warn" title={t("emp.notEmployer")} />
      </main>
    );
  }

  return (
    <main className="px-4 pt-4">
      <h1 className="font-pixel text-xs text-ink">{t("emp.newListing")}</h1>

      <form
        className="mb-6 mt-4 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError(null);
          try {
            await createListing(company.id, {
              company: company.name,
              role: role_.trim(),
              location: location.trim(),
              duration: duration.trim(),
              deadline,
              is_paid: isPaid,
              work_mode: workMode,
              // The employer stated it, so record it as stated — this is what
              // separates a scoreable listing from an abstention.
              compensation_stated: true,
              skills_required: skills
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
              eligibility_rules: {
                min_cgpa: minCgpa ? Number(minCgpa) : null,
                min_semester: minSemester ? Number(minSemester) : null,
                allowed_departments: null,
              },
              is_verified: false,
              cycle_label: String(new Date().getFullYear()),
            });
            router.push("/employer");
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <PixelInput
          label={t("emp.role")}
          name="l-role"
          value={role_}
          onChange={setRole_}
          required
          placeholder="Frontend Engineering Intern"
        />
        <PixelInput
          label={t("emp.location")}
          name="l-location"
          value={location}
          onChange={setLocation}
          required
          placeholder="Dhaka"
        />
        <PixelInput
          label={t("emp.duration")}
          name="l-duration"
          value={duration}
          onChange={setDuration}
          required
          placeholder="3 months"
        />
        <PixelInput
          label={t("emp.deadline")}
          name="l-deadline"
          type="date"
          value={deadline}
          onChange={setDeadline}
          required
        />

        <div>
          <span className="font-mono text-[11px] font-bold text-ink">
            {t("emp.workMode")}
          </span>
          <div className="mt-1 flex gap-1.5">
            {WORK_MODES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setWorkMode(m)}
                aria-pressed={workMode === m}
                className={`flex-1 border-3 border-ink px-2 py-1.5 font-mono text-[11px] font-bold ${
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
          label={t("emp.skillsRequired")}
          name="l-skills"
          value={skills}
          onChange={setSkills}
          hint={t("emp.skillsHint")}
          placeholder="React, TypeScript, SQL"
        />

        <div className="grid grid-cols-2 gap-3">
          <PixelInput
            label={t("emp.minCgpa")}
            name="l-cgpa"
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
            name="l-sem"
            type="number"
            min="1"
            max="12"
            value={minSemester}
            onChange={setMinSemester}
            placeholder="5"
          />
        </div>

        {error && (
          <p className="border-3 border-ink bg-alert p-2 font-mono text-[11px] text-cream">
            {error}
          </p>
        )}

        <PixelButton full type="submit" disabled={busy}>
          {busy ? t("emp.publishing") : t("emp.publish")}
        </PixelButton>
      </form>
    </main>
  );
}
