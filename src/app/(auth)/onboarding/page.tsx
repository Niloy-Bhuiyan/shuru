"use client";

/**
 * ONBOARDING — profile completion for accounts that skipped the register form.
 *
 * A Google or GitHub signup never passes through /register, so it arrives with
 * a session and no `profiles` row. Before this screen existed the app shell
 * saw the missing profile and sent the user to /login, middleware saw a valid
 * session and sent them back to /radar, and the two bounced forever — which
 * presented as "everything is stuck loading".
 *
 * Nothing here is guessable from the OAuth identity: CGPA, university,
 * department and semester drive eligibility and the odds engine, so they must
 * be asked for rather than defaulted. A fabricated profile would produce
 * confident, wrong numbers — the exact failure this product exists to avoid.
 *
 * Deliberately outside the (main) group: that layout requires a profile, so
 * hosting the profile form inside it would reintroduce the loop.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SunriseHeader } from "@/components/SunriseHeader";
import { ConfigRequired } from "@/components/ConfigRequired";
import { LoadingBlock } from "@/components/LoadingBlock";
import { PixelButton } from "@/components/pixel/PixelButton";
import { PixelInput } from "@/components/pixel/PixelInput";
import { getProfile, saveProfile } from "@/lib/data";
import { supabaseBrowser } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/auth/config";
import { useLang } from "@/lib/i18n";

const UNIVERSITIES = ["AIUB", "BUET", "NSU", "BRAC", "IUT", "DU", "JU", "KUET", "CUET", "RUET", "Other"];
const DEPARTMENTS = ["CSE", "SWE", "EEE", "IT", "BBA", "Other"];

export default function OnboardingPage() {
  const router = useRouter();
  const { t, lang } = useLang();

  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [university, setUniversity] = useState("AIUB");
  const [department, setDepartment] = useState("CSE");
  const [semester, setSemester] = useState("8");
  const [cgpa, setCgpa] = useState("");
  const [skills, setSkills] = useState("");
  const [deployed, setDeployed] = useState("no");
  const [errors, setErrors] = useState<{ name?: string; cgpa?: string }>({});

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const sb = supabaseBrowser();
      const {
        data: { user },
      } = await sb.auth.getUser();

      if (cancelled) return;
      if (!user) {
        router.replace("/login");
        return;
      }

      // Already onboarded — never trap someone on this screen.
      const existing = await getProfile().catch(() => null);
      if (cancelled) return;
      if (existing) {
        router.replace("/radar");
        return;
      }

      setUserId(user.id);
      // Prefill the one thing OAuth does tell us.
      const metaName =
        (user.user_metadata?.full_name as string | undefined) ??
        (user.user_metadata?.name as string | undefined) ??
        "";
      setName(metaName);
      setChecking(false);
    })().catch(() => {
      if (!cancelled) router.replace("/login");
    });

    return () => {
      cancelled = true;
    };
  }, [router]);

  function validate(): boolean {
    const next: { name?: string; cgpa?: string } = {};
    if (name.trim().length < 2) next.name = t("auth.errRequired");
    const parsed = parseFloat(cgpa);
    if (Number.isNaN(parsed) || parsed < 0 || parsed > 4) {
      next.cgpa = t("auth.errCgpa");
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit() {
    if (!userId || busy || !validate()) return;
    setBusy(true);
    try {
      await saveProfile({
        user_id: userId,
        name: name.trim(),
        university,
        department,
        year: parseInt(semester, 10),
        cgpa: parseFloat(cgpa),
        skills: skills.split(",").map((s) => s.trim()).filter(Boolean),
        has_deployed_project: deployed === "yes",
        language_pref: lang,
      });
      router.replace("/radar");
    } catch {
      setErrors({ name: t("auth.errGeneric") });
    } finally {
      setBusy(false);
    }
  }

  if (!isSupabaseConfigured()) {
    return (
      <>
        <SunriseHeader />
        <ConfigRequired />
      </>
    );
  }

  if (checking) {
    return (
      <>
        <SunriseHeader />
        <main className="mx-auto w-full max-w-[440px] px-4 pt-6">
          <LoadingBlock />
        </main>
      </>
    );
  }

  return (
    <>
      <SunriseHeader />
      <main className="mx-auto w-full max-w-[440px] px-4 pb-10 pt-6">
        <h1 className="font-pixel text-xs text-ink">{t("onboard.title")}</h1>
        <p className="mt-2 font-mono text-[11px] leading-relaxed text-grey">
          {t("onboard.hint")}
        </p>

        <div className="mt-4 space-y-4">
          <PixelInput
            label={t("auth.name")}
            name="name"
            value={name}
            onChange={setName}
            required
            error={errors.name}
          />
          <PixelInput
            as="select"
            label={t("auth.university")}
            name="university"
            value={university}
            onChange={setUniversity}
            options={UNIVERSITIES.map((u) => ({ value: u, label: u }))}
          />
          <PixelInput
            as="select"
            label={t("auth.department")}
            name="department"
            value={department}
            onChange={setDepartment}
            options={DEPARTMENTS.map((d) => ({ value: d, label: d }))}
          />
          <PixelInput
            as="select"
            label={t("auth.semester")}
            name="semester"
            value={semester}
            onChange={setSemester}
            // Bare number: the field label already says "Current semester",
            // and a digit needs no translation.
            options={Array.from({ length: 12 }, (_, i) => ({
              value: String(i + 1),
              label: String(i + 1),
            }))}
          />
          <PixelInput
            label={t("auth.cgpa")}
            name="cgpa"
            type="number"
            min="0"
            max="4"
            step="0.01"
            value={cgpa}
            onChange={setCgpa}
            required
            error={errors.cgpa}
            hint={t("auth.cgpaHint")}
          />
          <PixelInput
            label={t("auth.skills")}
            name="skills"
            value={skills}
            onChange={setSkills}
            hint={t("auth.skillsHint")}
          />
          <PixelInput
            as="select"
            label={t("auth.deployed")}
            name="deployed"
            value={deployed}
            onChange={setDeployed}
            hint={t("auth.deployedHint")}
            options={[
              { value: "no", label: t("auth.no") },
              { value: "yes", label: t("auth.yes") },
            ]}
          />

          <PixelButton full size="lg" onClick={onSubmit} disabled={busy}>
            {busy ? "…" : t("onboard.finish")}
          </PixelButton>
        </div>
      </main>
    </>
  );
}
