"use client";

/**
 * REGISTRATION — account + onboarding profile in ONE flow.
 *
 * signUp then save the profile immediately if a session came back. When
 * email confirmation is enabled no session is issued, so the profile is
 * parked locally and attached on the first confirmed login.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SunriseHeader } from "@/components/SunriseHeader";
import { PixelSun } from "@/components/PixelSun";
import { ConfigRequired } from "@/components/ConfigRequired";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { PixelButton } from "@/components/pixel/PixelButton";
import { PixelInput } from "@/components/pixel/PixelInput";
import { saveProfile } from "@/lib/data";
import { supabaseBrowser } from "@/lib/supabase/client";
import { goAfterSignIn } from "@/lib/auth/postSignIn";
import { isSupabaseConfigured } from "@/lib/auth/config";
import { useLang } from "@/lib/i18n";
import type { Profile } from "@/lib/types";

const UNIVERSITIES = ["AIUB", "BUET", "NSU", "BRAC", "IUT", "DU", "JU", "KUET", "CUET", "RUET", "Other"];
const DEPARTMENTS = ["CSE", "SWE", "EEE", "IT", "BBA", "Other"];
const PENDING_PROFILE_KEY = "shuru.pendingProfile";

export default function RegisterPage() {
  const router = useRouter();
  const { t } = useLang();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [university, setUniversity] = useState("AIUB");
  const [department, setDepartment] = useState("CSE");
  const [semester, setSemester] = useState("8");
  const [cgpa, setCgpa] = useState("");
  const [skills, setSkills] = useState("");
  const [deployed, setDeployed] = useState("no");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = t("auth.errRequired");
    const g = parseFloat(cgpa);
    if (Number.isNaN(g) || g < 0 || g > 4) e.cgpa = t("auth.errCgpa");
    if (!email.trim()) e.email = t("auth.errRequired");
    if (password.length < 8) e.password = t("auth.errPw");
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function buildProfile(userId: string): Profile {
    return {
      user_id: userId,
      name: name.trim(),
      university,
      department,
      year: parseInt(semester, 10),
      cgpa: parseFloat(cgpa),
      skills: skills
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      has_deployed_project: deployed === "yes",
      language_pref: "en",
    };
  }

  async function onSubmit() {
    if (!validate() || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const sb = supabaseBrowser();
      const { data, error } = await sb.auth.signUp({ email, password });
      if (error) {
        setErrors({ email: error.message });
        return;
      }
      /*
       * Supabase does NOT error when the email already exists — it returns a
       * success-shaped response with a decoy user so an attacker cannot probe
       * which addresses are registered. The tell is an empty `identities`
       * array; a genuinely new signup always has at least one.
       *
       * Without this branch the code fell through to "check your email",
       * which is how a real user spent an evening re-registering an address
       * that already had a Google account, being told it worked each time,
       * and then being unable to log in. The anti-enumeration response is
       * Supabase's to make; presenting it as success was ours.
       */
      if (data.user && (data.user.identities?.length ?? 0) === 0) {
        setErrors({ email: t("auth.errEmailTaken") });
        return;
      }

      if (data.session && data.user) {
        await saveProfile(buildProfile(data.user.id));
        // Full document navigation — see goAfterSignIn.
        goAfterSignIn();
      } else {
        // Email confirmation is ON — park the profile for first login.
        window.localStorage.setItem(
          PENDING_PROFILE_KEY,
          JSON.stringify(buildProfile("pending"))
        );
        router.replace("/verify-email");
      }
    } catch {
      setErrors({ email: t("auth.errGeneric") });
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

  return (
    <>
      <SunriseHeader />
      <main className="px-4 pb-16 pt-6">
        <div className="mb-5 flex items-end gap-3">
          <PixelSun width={44} />
          <div>
            <h1 className="font-pixel text-sm text-ink">{t("auth.register")}</h1>
            <p className="mt-1 font-mono text-xs text-grey">{t("tagline")}</p>
          </div>
        </div>

        {notice && (
          <p className="mb-4 border-3 border-ink bg-amber p-3 font-mono text-xs font-bold text-ink shadow-pixel-sm">
            {notice}
          </p>
        )}

        <div className="space-y-4">
          <OAuthButtons next="/radar" />

          <PixelInput label={t("auth.name")} name="name" value={name} onChange={setName} required error={errors.name} placeholder="Rafid Hasan" />

          <PixelInput label={t("auth.email")} name="email" type="email" value={email} onChange={setEmail} required error={errors.email} placeholder="you@university.edu" />
          <PixelInput label={t("auth.password")} name="password" type="password" value={password} onChange={setPassword} required error={errors.password} hint={t("auth.pwHint")} />

          <PixelInput as="select" label={t("auth.university")} name="university" value={university} onChange={setUniversity} options={UNIVERSITIES.map((u) => ({ value: u, label: u }))} />
          <PixelInput as="select" label={t("auth.department")} name="department" value={department} onChange={setDepartment} options={DEPARTMENTS.map((d) => ({ value: d, label: d }))} />
          <PixelInput as="select" label={t("auth.semester")} name="semester" value={semester} onChange={setSemester} options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `Semester ${i + 1}` }))} />
          <PixelInput label={t("auth.cgpa")} name="cgpa" type="number" value={cgpa} onChange={setCgpa} min="0" max="4" step="0.01" required error={errors.cgpa} hint={t("auth.cgpaHint")} placeholder="3.40" />
          <PixelInput label={t("auth.skills")} name="skills" value={skills} onChange={setSkills} hint={t("auth.skillsHint")} placeholder="Python, React, SQL" />
          <PixelInput as="select" label={t("auth.deployed")} name="deployed" value={deployed} onChange={setDeployed} hint={t("auth.deployedHint")} options={[{ value: "no", label: t("auth.no") }, { value: "yes", label: t("auth.yes") }]} />

          <PixelButton full size="lg" onClick={onSubmit} disabled={busy}>
            {busy ? "…" : t("auth.register")}
          </PixelButton>

          <p className="text-center font-mono text-xs text-ink">
            {t("auth.haveAccount")}{" "}
            <Link href="/login" className="font-bold text-amberInk underline">
              {t("auth.login")}
            </Link>
          </p>
        </div>
      </main>
    </>
  );
}
