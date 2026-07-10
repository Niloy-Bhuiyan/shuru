"use client";

/**
 * YOU — view + edit the profile that powers eligibility and odds,
 * language preference, sign out, and (demo mode) a data reset.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PixelButton } from "@/components/pixel/PixelButton";
import { PixelInput } from "@/components/pixel/PixelInput";
import { LoadingBlock } from "@/components/LoadingBlock";
import { useProfile } from "@/hooks/useProfile";
import { isDemoMode, mergeIngested, saveProfile } from "@/lib/data";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLang, type Lang } from "@/lib/i18n";

const UNIVERSITIES = ["AIUB", "BUET", "NSU", "BRAC", "IUT", "DU", "JU", "KUET", "CUET", "RUET", "Other"];
const DEPARTMENTS = ["CSE", "SWE", "EEE", "IT", "BBA", "Other"];

export default function YouPage() {
  const router = useRouter();
  const { profile, loading, refresh } = useProfile();
  const { t, lang, setLang } = useLang();
  const demo = isDemoMode();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  async function onRefreshListings() {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      const res = await fetch("/api/ingest", { method: "POST" });
      const d = await res.json();
      if (res.status === 429) {
        setRefreshMsg(t("you.refreshCooldown").replace("{s}", String(d.retry_after_s ?? 0)));
      } else if (!res.ok) {
        setRefreshMsg(t("you.refreshErr"));
      } else if (demo) {
        mergeIngested(d.accepted ?? []);
        setRefreshMsg(
          t("you.refreshOk").replace("{n}", String((d.accepted ?? []).length))
        );
      } else {
        setRefreshMsg(
          t("you.refreshOk").replace("{n}", String(d.inserted_or_refreshed ?? 0))
        );
      }
    } catch {
      setRefreshMsg(t("you.refreshErr"));
    } finally {
      setRefreshing(false);
    }
  }

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
    if (demo) {
      // Clear ALL demo data (profile, applications, resume, ingested rows) —
      // not just the profile — so it can't bleed into the next device profile.
      Object.keys(window.localStorage)
        .filter((k) => k.startsWith("shuru.demo."))
        .forEach((k) => window.localStorage.removeItem(k));
    } else {
      await supabaseBrowser().auth.signOut();
    }
    router.replace("/login");
  }

  function onResetDemo() {
    Object.keys(window.localStorage)
      .filter((k) => k.startsWith("shuru."))
      .forEach((k) => window.localStorage.removeItem(k));
    router.replace("/register");
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

        <div className="border-t-2 border-ink/20 pt-4">
          <div className="mb-3 border-3 border-ink bg-paper p-3 shadow-pixel-sm">
            <p className="font-pixel text-[9px] text-ink">{t("you.refreshTitle")}</p>
            <p className="mt-1.5 font-mono text-[11px] leading-snug text-grey">
              {t("you.refreshBody")}
            </p>
            <PixelButton size="sm" className="mt-2" onClick={onRefreshListings} disabled={refreshing}>
              {refreshing ? t("you.refreshing") : t("you.refreshBtn")}
            </PixelButton>
            {refreshMsg && (
              <p className="mt-2 font-mono text-[11px] font-bold text-ink">{refreshMsg}</p>
            )}
          </div>

          <PixelButton variant="secondary" full onClick={onSignOut}>
            {t("auth.signOut")}
          </PixelButton>
          {demo && (
            <PixelButton variant="danger" full className="mt-3" onClick={onResetDemo}>
              {t("you.resetDemo")}
            </PixelButton>
          )}
        </div>
      </div>
    </main>
  );
}
