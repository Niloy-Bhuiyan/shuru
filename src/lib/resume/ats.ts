/**
 * ATS SCORE — rule-based, instant, free. NO LLM anywhere in here.
 * Pure functions over the structured ResumeContent. Because the editor is
 * structured (no tables / columns / images can even exist), the layout
 * hazards ATS parsers choke on are prevented by construction — one check
 * verifies the remaining text-level hazards.
 */

import type { ResumeContent } from "@/lib/types";

export type AtsCheck = {
  id:
    | "contact"
    | "headers"
    | "bullets"
    | "quantified"
    | "verbs"
    | "length"
    | "format";
  label: string;
  detail: string;
  state: "met" | "missing";
  weight: number;
};

export type AtsResult = {
  /** 0–100 */
  score: number;
  checks: AtsCheck[];
  wordCount: number;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /(\+?\d[\d\s-]{7,})/;
const NUMBER_RE = /(\d+(\.\d+)?\s*%|\d+\s*\+|\b\d+(\.\d+)?\b|৳|\$)/;

const ACTION_VERBS = [
  "built", "developed", "designed", "led", "created", "shipped", "deployed",
  "implemented", "engineered", "launched", "automated", "improved", "reduced",
  "increased", "optimized", "optimised", "delivered", "migrated", "integrated",
  "architected", "refactored", "tested", "trained", "fine-tuned", "analyzed",
  "analysed", "managed", "mentored", "wrote", "published", "won", "achieved",
  "scaled", "maintained", "researched", "presented", "collaborated",
];

// text-level hazards ATS parsers misread
const HAZARD_RE = /[|\t]|[│┃┆]|\u2028|\u2029/;

function allBullets(r: ResumeContent): string[] {
  return [
    ...r.experience.flatMap((e) => e.bullets),
    ...r.projects.flatMap((p) => p.bullets),
  ]
    .map((b) => b.trim())
    .filter(Boolean);
}

function allText(r: ResumeContent): string {
  return [
    r.contact.name, r.contact.email, r.contact.phone, r.contact.location,
    ...r.contact.links,
    r.summary,
    ...r.education.flatMap((e) => [e.institution, e.degree, e.notes]),
    ...r.experience.flatMap((e) => [e.company, e.role, ...e.bullets]),
    ...r.projects.flatMap((p) => [p.name, p.tech, ...p.bullets]),
    ...r.skills,
  ]
    .filter(Boolean)
    .join(" ");
}

export function wordCount(r: ResumeContent): number {
  return allText(r).split(/\s+/).filter(Boolean).length;
}

export function computeAts(r: ResumeContent): AtsResult {
  const checks: AtsCheck[] = [];
  const bullets = allBullets(r);
  const words = wordCount(r);

  // 1 — contact info (15)
  const emailOk = EMAIL_RE.test(r.contact.email.trim());
  const phoneOk = PHONE_RE.test(r.contact.phone.trim());
  const nameOk = r.contact.name.trim().length >= 3;
  checks.push({
    id: "contact",
    weight: 15,
    state: nameOk && emailOk && phoneOk ? "met" : "missing",
    label: "Contact info complete",
    detail:
      nameOk && emailOk && phoneOk
        ? "Name, email and phone all present and parseable"
        : `Missing/invalid: ${[!nameOk && "name", !emailOk && "email", !phoneOk && "phone"].filter(Boolean).join(", ")}`,
  });

  // 2 — standard section headers with content (15)
  const hasBody = r.experience.length + r.projects.length > 0;
  const sectionsOk =
    r.summary.trim().length > 0 &&
    r.education.length > 0 &&
    hasBody &&
    r.skills.length >= 3;
  checks.push({
    id: "headers",
    weight: 15,
    state: sectionsOk ? "met" : "missing",
    label: "Standard sections filled",
    detail: sectionsOk
      ? "Summary, Education, Experience/Projects and Skills (3+) present"
      : `Fill: ${[
          !r.summary.trim() && "Summary",
          r.education.length === 0 && "Education",
          !hasBody && "Experience or Projects",
          r.skills.length < 3 && "Skills (need 3+)",
        ]
          .filter(Boolean)
          .join(", ")}`,
  });

  // 3 — bullet volume per entry, 2–6 (15)
  const entries = [...r.experience, ...r.projects];
  const badEntries = entries.filter(
    (e) => e.bullets.filter((b) => b.trim()).length < 2 || e.bullets.filter((b) => b.trim()).length > 6
  ).length;
  const bulletsOk = entries.length > 0 && badEntries === 0 && bullets.length >= 2;
  checks.push({
    id: "bullets",
    weight: 15,
    state: bulletsOk ? "met" : "missing",
    label: "2–6 bullets per entry",
    detail: bulletsOk
      ? `${bullets.length} bullets across ${entries.length} entries — good volume`
      : entries.length === 0
        ? "Add at least one experience or project entry"
        : `${badEntries} entr${badEntries === 1 ? "y" : "ies"} outside the 2–6 bullet range`,
  });

  // 4 — quantified achievements (15)
  const quantified = bullets.filter((b) => NUMBER_RE.test(b)).length;
  const quantOk = bullets.length > 0 && quantified / bullets.length >= 0.3;
  checks.push({
    id: "quantified",
    weight: 15,
    state: quantOk ? "met" : "missing",
    label: "Quantified achievements",
    detail:
      bullets.length === 0
        ? "No bullets yet to measure"
        : quantOk
          ? `${quantified}/${bullets.length} bullets carry a number — recruiters trust numbers`
          : `Only ${quantified}/${bullets.length} bullets carry a number (aim for 1 in 3: %, counts, users, ms)`,
  });

  // 5 — action verbs open bullets (10)
  const verbStarts = bullets.filter((b) =>
    ACTION_VERBS.includes(b.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z-]/g, "") ?? "")
  ).length;
  const verbsOk = bullets.length > 0 && verbStarts / bullets.length >= 0.5;
  checks.push({
    id: "verbs",
    weight: 10,
    state: verbsOk ? "met" : "missing",
    label: "Bullets start with action verbs",
    detail:
      bullets.length === 0
        ? "No bullets yet to measure"
        : verbsOk
          ? `${verbStarts}/${bullets.length} bullets open with a strong verb`
          : `${verbStarts}/${bullets.length} open with a verb — start with Built / Deployed / Reduced…`,
  });

  // 6 — length (15)
  const lengthOk = words >= 150 && words <= 700;
  checks.push({
    id: "length",
    weight: 15,
    state: lengthOk ? "met" : "missing",
    label: "One-page length",
    detail: lengthOk
      ? `${words} words — fits one clean page`
      : words < 150
        ? `${words} words — too thin, add substance (150+)`
        : `${words} words — trim toward one page (≤700)`,
  });

  // 7 — text-level format hazards (15). Structure already bans
  //     tables/columns/images by construction.
  const hazards = HAZARD_RE.test(allText(r));
  const shoutyBullets = bullets.filter(
    (b) => b.length > 12 && b === b.toUpperCase()
  ).length;
  const formatOk = !hazards && shoutyBullets === 0;
  checks.push({
    id: "format",
    weight: 15,
    state: formatOk ? "met" : "missing",
    label: "ATS-safe formatting",
    detail: formatOk
      ? "No tables, columns, images, pipes or tabs — parsers read this cleanly"
      : hazards
        ? "Remove pipes (|), tabs or column characters from text"
        : "Avoid ALL-CAPS bullets",
  });

  const score = checks.reduce((s, c) => s + (c.state === "met" ? c.weight : 0), 0);
  return { score, checks, wordCount: words };
}
