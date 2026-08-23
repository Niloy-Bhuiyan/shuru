"use client";

/**
 * YOU — view + edit the profile that powers eligibility and odds,
 * language preference, and sign out.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PixelButton } from "@/components/pixel/PixelButton";
import { PixelInput } from "@/components/pixel/PixelInput";
import { LoadingBlock } from "@/components/LoadingBlock";
import { useProfile } from "@/hooks/useProfile";
import { saveProfile } from "@/lib/data";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLang, type Lang } from "@/lib/i18n";

const UNIVERSITIES = ["AIUB", "BUET", "NSU", "BRAC", "IUT", "DU", "JU", "KUET", "CUET", "RUET", "Other"];
const DEPARTMENTS = ["CSE", "SWE", "EEE", "IT", "BBA", "Other"];

export default function YouPage() {
  const router = useRouter();
  const { profile, loading, refresh } = useProfile();
  const { t, lang, setLang } = useLang();
  const [name, setName] = useState("");
  const [university, setUniversity] = useState("AIUB");
  const [department, setDepartment] = useState("CSE");
  const [semester, setSemester] = useState("8");
  const [cgpa, setCgpa] = useState("");
  const [skills, setSkills] = useState("");
  const [deployed, setDeployed] = useState("no");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setName(profile.name);
    setUniversity(profile.university);
    setDepartment(profile.department);
    setSemester(String(profile.year));
    setCgpa(profile.cgpa.toFixed(2));
    setSkills(profile.skills.join(", "));
    setDeployed(profile.has_deployed_project ? "yes" : "no");
  }, [profile]);

  async function onSave() {
    if (!profile || busy) return;
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = t("auth.errRequired");
    const g = parseFloat(cgpa);
    if (Number.isNaN(g) || g < 0 || g > 4) e.cgpa = t("auth.errCgpa");
    setErrors(e);
    if (Object.keys(e).length) return;

    setBusy(true);
    setSavedOk(false);
    try {
      await saveProfile({
        ...profile,
        name: name.trim(),
        university,
        department,
        year: parseInt(semester, 10),
        cgpa: g,
        skills: skills.split(",").map((s) => s.trim()).filter(Boolean),
        has_deployed_project: deployed === "yes",
        language_pref: lang,
      });
      await refresh();
      setSavedOk(true);
    } finally {
      setBusy(false);
    }
  }

  function onLangChange(next: string) {
    // setLang now writes both localStorage and profile.language_pref, so the
    // header and settings toggles share one source of truth (see 1.5).
    setLang(next as Lang);
  }

  async function onSignOut() {
    await supabaseBrowser().auth.signOut();
    router.replace("/login");
  }

  if (loading || !profile) {
    return (
      <main className="px-4 pt-4">
        <LoadingBlock />
      </main>
    );
  }

  return (
    <main className="px-4 pt-4">
      <h1 className="font-pixel text-xs text-ink">{t("you.title")}</h1>

      <div className="mt-4 space-y-4 pb-4">
        <PixelInput label={t("auth.name")} name="name" value={name} onChange={setName} required error={errors.name} />
        <PixelInput as="select" label={t("auth.university")} name="university" value={university} onChange={setUniversity} options={UNIVERSITIES.map((u) => ({ value: u, label: u }))} />
        <PixelInput as="select" label={t("auth.department")} name="department" value={department} onChange={setDepartment} options={DEPARTMENTS.map((d) => ({ value: d, label: d }))} />
        <PixelInput as="select" label={t("auth.semester")} name="semester" value={semester} onChange={setSemester} options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `Semester ${i + 1}` }))} />
        <PixelInput label={t("auth.cgpa")} name="cgpa" type="number" value={cgpa} onChange={setCgpa} min="0" max="4" step="0.01" required error={errors.cgpa} hint={t("auth.cgpaHint")} />
        <PixelInput label={t("auth.skills")} name="skills" value={skills} onChange={setSkills} hint={t("auth.skillsHint")} />
        <PixelInput as="select" label={t("auth.deployed")} name="deployed" value={deployed} onChange={setDeployed} hint={t("auth.deployedHint")} options={[{ value: "no", label: t("auth.no") }, { value: "yes", label: t("auth.yes") }]} />
        <PixelInput as="select" label={t("you.language")} name="lang" value={lang} onChange={onLangChange} options={[{ value: "en", label: "English" }, { value: "bn", label: "বাংলা" }]} />

        <PixelButton full size="lg" onClick={onSave} disabled={busy}>
          {savedOk ? t("you.savedOk") : busy ? "…" : t("you.saveChanges")}
        </PixelButton>

        {/* Operator areas deliberately do NOT live here. /you is the student's
            own profile; employer and admin entry points belong to the app
            chrome (RoleChip in the header), not inside a user surface. */}

        <div className="border-t-2 border-ink/20 pt-4">
          <PixelButton variant="secondary" full onClick={onSignOut}>
            {t("auth.signOut")}
          </PixelButton>
        </div>
      </div>
    </main>
  );
}
