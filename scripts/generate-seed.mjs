/**
 * Source of truth for ALL seed data. Generates:
 *   - supabase/seed.sql          (run in Supabase SQL editor after schema.sql)
 *   - src/lib/data/seed.ts       (identical data — TEST FIXTURE ONLY)
 *   - src/lib/data/seedIds.ts    (ids only — the one artefact the app ships)
 * Deterministic (seeded RNG) — re-running always produces the same files.
 *   node scripts/generate-seed.mjs
 */
import { writeFileSync } from "node:fs";

// ── deterministic RNG ──────────────────────────────────────────
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const uuid = (n) => `11111111-1111-4111-8111-0000000000${String(n).padStart(2, "0")}`;
const CYCLES = ["Summer 2025", "Fall 2025", "Spring 2026"];

// ── 30 listings. n = outcome sample size → tier:
//    sized so the COHORT (cgpa band [+dept]) hits HIGH >=20 / MED 8-19 / ABSTAIN <8 (the honest-abstention screen) ──
const L = (company, role, location, duration, is_paid, deadline, rules, is_verified, cycle_label, n, deptPool) =>
  ({ company, role, location, duration, is_paid, deadline, rules, is_verified, cycle_label, n, deptPool });

const LISTINGS = [
  L("Grameenphone", "Nextern Intern (Technology)", "Dhaka", "3 months", true, "2026-07-20", { min_cgpa: 3.2, min_semester: 8, allowed_departments: ["CSE", "EEE", "SWE"], other_text: "Strong problem-solving; campus ambassadors preferred" }, true, "Nextern 2026", 65, ["CSE", "EEE", "SWE"]),
  L("bKash", "Software Engineer Intern", "Dhaka", "6 months", true, "2026-07-12", { min_cgpa: 3.3, min_semester: 8, allowed_departments: ["CSE", "SWE"], other_text: "Java/Spring exposure is a plus" }, true, "Summer 2026", 60, ["CSE", "SWE"]),
  L("Pathao", "Data Analyst Intern", "Dhaka", "3 months", true, "2026-07-08", { min_cgpa: 3.0, min_semester: 7, allowed_departments: ["CSE", "SWE", "IT"], other_text: "SQL + spreadsheet fluency required" }, true, "Summer 2026", 58, ["CSE", "SWE", "IT"]),
  L("Samsung R&D Institute BD", "Software Engineer Intern", "Dhaka", "6 months", true, "2026-08-10", { min_cgpa: 3.5, min_semester: 8, allowed_departments: ["CSE", "EEE"], other_text: "Strong DSA; C/C++ preferred" }, true, "Fall 2026", 70, ["CSE", "EEE"]),
  L("Brain Station 23", "Web Development Intern", "Dhaka", "3 months", true, "2026-07-25", { min_cgpa: 3.0, min_semester: 6, allowed_departments: ["CSE", "SWE", "IT"], other_text: null }, true, "Summer 2026", 55, ["CSE", "SWE", "IT"]),
  L("Optimizely", "Software Engineer Intern", "Dhaka", "6 months", true, "2026-08-01", { min_cgpa: 3.4, min_semester: 8, allowed_departments: ["CSE"], other_text: ".NET stack; strong OOP" }, true, "Fall 2026", 62, ["CSE"]),
  L("Nagad", "Fintech Product Intern", "Dhaka", "3 months", true, "2026-07-15", { min_cgpa: 3.0, min_semester: 7, allowed_departments: null, other_text: "Interest in mobile financial services" }, true, "Summer 2026", 32, ["CSE", "BBA", "EEE"]),
  L("Robi Axiata", "Data & AI Intern", "Dhaka", "3 months", true, "2026-07-30", { min_cgpa: 3.2, min_semester: 7, allowed_departments: ["CSE", "EEE"], other_text: "Python + pandas" }, true, "Summer 2026", 28, ["CSE", "EEE"]),
  L("Therap (BD)", "SQA Intern", "Dhaka", "4 months", true, "2026-08-05", { min_cgpa: 3.25, min_semester: 8, allowed_departments: ["CSE", "SWE"], other_text: null }, true, "Fall 2026", 34, ["CSE", "SWE"]),
  L("Enosis Solutions", "Software Engineer Intern", "Dhaka", "6 months", true, "2026-07-18", { min_cgpa: 3.4, min_semester: 8, allowed_departments: ["CSE"], other_text: "Heavy DSA screening round" }, true, "Summer 2026", 26, ["CSE"]),
  L("ShopUp", "Backend Engineer Intern", "Dhaka", "3 months", true, "2026-08-12", { min_cgpa: 3.0, min_semester: 6, allowed_departments: ["CSE", "SWE", "IT"], other_text: "Node.js or Python" }, true, "Fall 2026", 24, ["CSE", "SWE", "IT"]),
  L("10 Minute School", "Frontend Intern", "Dhaka", "3 months", true, "2026-07-22", { min_cgpa: null, min_semester: 6, allowed_departments: ["CSE", "SWE", "IT"], other_text: "React portfolio required" }, true, "Summer 2026", 30, ["CSE", "SWE", "IT"]),
  L("Chaldal", "Software Engineer Intern", "Dhaka", "6 months", true, "2026-07-07", { min_cgpa: 3.2, min_semester: 7, allowed_departments: ["CSE"], other_text: "Functional programming interest (F#)" }, true, "Summer 2026", 5, ["CSE"]),
  L("Kona Software Lab", "Software Engineer Intern", "Dhaka", "4 months", true, "2026-08-20", { min_cgpa: 3.3, min_semester: 8, allowed_departments: ["CSE", "EEE"], other_text: "Smart-card / embedded interest a plus" }, true, "Fall 2026", 6, ["CSE", "EEE"]),
  L("SELISE Digital Platforms", "Cloud Engineering Intern", "Dhaka", "3 months", true, "2026-08-15", { min_cgpa: 3.0, min_semester: 7, allowed_departments: ["CSE", "SWE"], other_text: null }, true, "Fall 2026", 4, ["CSE", "SWE"]),
  L("Cefalo Bangladesh", "Software Engineer Intern", "Dhaka", "6 months", true, "2026-09-01", { min_cgpa: 3.5, min_semester: 9, allowed_departments: ["CSE"], other_text: "Norwegian client teams; strong English" }, true, "Fall 2026", 3, ["CSE"]),
  L("BJIT", "Java Developer Intern", "Dhaka", "4 months", true, "2026-07-28", { min_cgpa: 3.0, min_semester: 7, allowed_departments: ["CSE", "SWE", "IT"], other_text: "Japanese language interest a plus" }, true, "Summer 2026", 7, ["CSE", "SWE", "IT"]),
  L("WellDev", ".NET Developer Intern", "Dhaka", "4 months", true, "2026-08-25", { min_cgpa: 3.2, min_semester: 8, allowed_departments: ["CSE"], other_text: null }, true, "Fall 2026", 2, ["CSE"]),
  L("Sheba Platform", "Product Intern", "Dhaka", "3 months", false, "2026-08-08", { min_cgpa: null, min_semester: 6, allowed_departments: null, other_text: "Ops + product curiosity" }, true, "Fall 2026", 4, ["CSE", "BBA"]),
  L("DataSoft", "Machine Learning Intern", "Dhaka", "3 months", true, "2026-07-14", { min_cgpa: 3.3, min_semester: 8, allowed_departments: ["CSE", "EEE"], other_text: "Python + one ML project" }, true, "Summer 2026", 6, ["CSE", "EEE"]),
  L("Banglalink", "Ennovators Intern", "Dhaka", "3 months", true, "2026-08-30", { min_cgpa: 3.0, min_semester: 7, allowed_departments: null, other_text: null }, false, "Fall 2026", 5, ["CSE", "EEE", "BBA"]),
  L("Augmedix BD", "NLP Engineer Intern", "Dhaka", "6 months", true, "2026-08-18", { min_cgpa: 3.4, min_semester: 8, allowed_departments: ["CSE"], other_text: "Transformers / speech-to-text exposure" }, true, "Fall 2026", 3, ["CSE"]),
  L("Riseup Labs", "Game Developer Intern", "Dhaka", "3 months", false, "2026-09-10", { min_cgpa: 3.0, min_semester: 6, allowed_departments: ["CSE", "SWE"], other_text: "Unity portfolio" }, false, "Fall 2026", 2, ["CSE", "SWE"]),
  L("TigerIT", "Computer Vision Intern", "Dhaka", "4 months", true, "2026-08-22", { min_cgpa: 3.5, min_semester: 8, allowed_departments: ["CSE", "EEE"], other_text: "OpenCV / PyTorch" }, true, "Fall 2026", 4, ["CSE", "EEE"]),
  L("Dynamic Solution Innovators", "Software Engineer Intern", "Dhaka", "4 months", true, "2026-07-26", { min_cgpa: 3.3, min_semester: 7, allowed_departments: ["CSE"], other_text: null }, true, "Summer 2026", 5, ["CSE"]),
  L("REVE Systems", "VoIP Engineer Intern", "Dhaka", "4 months", true, "2026-09-05", { min_cgpa: 3.0, min_semester: 7, allowed_departments: ["CSE", "EEE"], other_text: null }, false, "Fall 2026", 1, ["CSE", "EEE"]),
  L("Field Buzz", "Android Developer Intern", "Dhaka", "3 months", false, "2026-08-14", { min_cgpa: 3.2, min_semester: 7, allowed_departments: ["CSE", "SWE"], other_text: "Kotlin preferred" }, true, "Fall 2026", 3, ["CSE", "SWE"]),
  L("Craftsmen", "DevOps Intern", "Dhaka", "4 months", true, "2026-09-15", { min_cgpa: 3.4, min_semester: 8, allowed_departments: ["CSE"], other_text: "Docker + CI basics" }, true, "Fall 2026", 0, ["CSE"]),
  L("Vivasoft", "Node.js Developer Intern", "Dhaka", "3 months", true, "2026-07-10", { min_cgpa: 3.0, min_semester: 6, allowed_departments: ["CSE", "SWE", "IT"], other_text: null }, true, "Summer 2026", 6, ["CSE", "SWE", "IT"]),
  L("Astha IT", "Fullstack Developer Intern", "Dhaka", "4 months", true, "2026-08-28", { min_cgpa: 3.25, min_semester: 7, allowed_departments: ["CSE"], other_text: null }, false, "Fall 2026", 4, ["CSE"]),
];

// ── outcome generation: shortlisting is CORRELATED with real signals
//    (deployed project, CGPA 3.5+, portfolio) so "THE ONE THING" is
//    meaningful, not noise. 'offer' implies shortlisted. ──
function makeOutcomes() {
  const rows = [];
  LISTINGS.forEach((l, i) => {
    const rand = mulberry32(1000 + i * 7);
    for (let k = 0; k < l.n; k++) {
      const cgpa = Math.round((2.7 + rand() * 1.28) * 100) / 100;
      const dept = l.deptPool[Math.floor(rand() * l.deptPool.length)];
      const year = 6 + Math.floor(rand() * 6); // semester 6–11
      const has_projects = rand() < 0.7;
      const has_deployed_project = has_projects && rand() < 0.55;
      let p = 0.1;
      if (has_deployed_project) p += 0.3;
      if (cgpa >= 3.5) p += 0.18;
      if (has_projects) p += 0.07;
      const shortlisted = rand() < p;
      const result = shortlisted ? (rand() < 0.3 ? "offer" : "shortlisted") : "rejected";
      const cycle = CYCLES[Math.floor(rand() * CYCLES.length)];
      rows.push({
        opportunity_id: uuid(i + 1),
        profile_snapshot: { cgpa, dept, year, has_projects, has_deployed_project },
        result,
        cycle,
      });
    }
  });
  return rows;
}

// ── interview reports (15) ──
const REPORTS = [
  { company: "Grameenphone", role: "Nextern Intern (Technology)", rounds: [{ name: "Online Assessment", format: "MCQ: aptitude + CS basics", notes: "60 min, webcam proctored" }, { name: "Group Case Round", format: "Team case study", notes: "Telco product case; speak up early" }, { name: "Panel Interview", format: "2 tech + 1 HR", notes: "Projects grilled; know your thesis cold" }], question_types: ["Aptitude", "OOP", "Projects", "Behavioral"], difficulty: 3, apply_to_offer_days: 45, author_anon: "CSE '25, AIUB" },
  { company: "Grameenphone", role: "Nextern Intern (Technology)", rounds: [{ name: "Online Assessment", format: "MCQ" }, { name: "Panel Interview", format: "Tech + HR", notes: "Asked why telco, not startup" }], question_types: ["SQL", "Projects", "Behavioral"], difficulty: 2, apply_to_offer_days: 38, author_anon: "EEE '24, BUET" },
  { company: "bKash", role: "Software Engineer Intern", rounds: [{ name: "Coding Test", format: "2 problems, HackerRank", notes: "Arrays + strings, medium" }, { name: "Technical Interview", format: "1:1", notes: "Java collections, REST, one SQL join" }, { name: "HR Round", format: "Culture fit" }], question_types: ["DSA", "Java", "SQL", "Behavioral"], difficulty: 3, apply_to_offer_days: 30, author_anon: "CSE '25, NSU" },
  { company: "Pathao", role: "Data Analyst Intern", rounds: [{ name: "Take-home", format: "Dataset + 5 questions", notes: "Rider churn CSV; used pandas" }, { name: "Review Call", format: "Walk through your notebook" }], question_types: ["SQL", "Pandas", "Product sense"], difficulty: 2, apply_to_offer_days: 21, author_anon: "CSE '26, BRAC" },
  { company: "Samsung R&D Institute BD", role: "Software Engineer Intern", rounds: [{ name: "SW Competency Test", format: "3 problems, 3 hrs, C/C++", notes: "Classic SRBD style — graph + DP heavy" }, { name: "Technical Interview", format: "Whiteboard DSA" }, { name: "Executive Interview", format: "Behavioral" }], question_types: ["DSA", "DP", "Graphs", "C/C++"], difficulty: 5, apply_to_offer_days: 60, author_anon: "CSE '24, BUET" },
  { company: "Samsung R&D Institute BD", role: "Software Engineer Intern", rounds: [{ name: "SW Competency Test", format: "3 problems", notes: "Solve 2/3 to pass, practice codeforces 1400+" }, { name: "Technical Interview", format: "DSA + OS basics" }], question_types: ["DSA", "OS", "C/C++"], difficulty: 5, apply_to_offer_days: 55, author_anon: "CSE '25, KUET" },
  { company: "Brain Station 23", role: "Web Development Intern", rounds: [{ name: "Written Test", format: "JS + logic" }, { name: "Technical Interview", format: "Live coding", notes: "Built a small React component" }], question_types: ["JavaScript", "React", "Projects"], difficulty: 2, apply_to_offer_days: 18, author_anon: "SWE '25, AIUB" },
  { company: "Optimizely", role: "Software Engineer Intern", rounds: [{ name: "Online Test", format: "Codility, 90 min" }, { name: "Tech Interview 1", format: "DSA + OOP" }, { name: "Tech Interview 2", format: "System basics + .NET" }, { name: "HR", format: "Offer chat" }], question_types: ["DSA", "OOP", ".NET", "System basics"], difficulty: 4, apply_to_offer_days: 40, author_anon: "CSE '24, IUT" },
  { company: "Enosis Solutions", role: "Software Engineer Intern", rounds: [{ name: "Written DSA", format: "On paper!", notes: "Recursion + complexity analysis by hand" }, { name: "Technical Interview", format: "2 rounds same day" }], question_types: ["DSA", "Recursion", "Complexity"], difficulty: 4, apply_to_offer_days: 25, author_anon: "CSE '25, CUET" },
  { company: "Therap (BD)", role: "SQA Intern", rounds: [{ name: "Written Test", format: "Logic + basic SQL" }, { name: "Interview", format: "Test-case design", notes: "Asked to break a login form" }], question_types: ["SQL", "Test design", "Logic"], difficulty: 2, apply_to_offer_days: 28, author_anon: "CSE '25, JU" },
  { company: "Nagad", role: "Fintech Product Intern", rounds: [{ name: "CV Shortlist", format: "—" }, { name: "Case Interview", format: "MFS product case", notes: "Sizing + a wallet feature pitch" }, { name: "HR", format: "Behavioral" }], question_types: ["Product sense", "Case", "Behavioral"], difficulty: 3, apply_to_offer_days: 35, author_anon: "BBA '25, DU" },
  { company: "ShopUp", role: "Backend Engineer Intern", rounds: [{ name: "Coding Task", format: "Take-home API", notes: "Small REST service, graded on tests" }, { name: "Tech Call", format: "Code review of your task" }], question_types: ["Node.js", "API design", "Projects"], difficulty: 3, apply_to_offer_days: 20, author_anon: "CSE '26, NSU" },
  { company: "10 Minute School", role: "Frontend Intern", rounds: [{ name: "Portfolio Review", format: "They open your GitHub live" }, { name: "Live Coding", format: "React state task" }], question_types: ["React", "JavaScript", "Projects"], difficulty: 2, apply_to_offer_days: 14, author_anon: "SWE '26, BRAC" },
  { company: "Robi Axiata", role: "Data & AI Intern", rounds: [{ name: "Online Test", format: "Python + stats MCQ" }, { name: "Panel", format: "Notebook walkthrough", notes: "Explain a model you actually built" }], question_types: ["Python", "Statistics", "ML basics"], difficulty: 3, apply_to_offer_days: 32, author_anon: "EEE '25, RUET" },
  { company: "Chaldal", role: "Software Engineer Intern", rounds: [{ name: "Problem Solving", format: "2 hrs onsite", notes: "Puzzle-flavoured, language-agnostic" }, { name: "Pair Programming", format: "With a senior eng" }], question_types: ["DSA", "Puzzles", "Pairing"], difficulty: 4, apply_to_offer_days: 22, author_anon: "CSE '24, BUET" },
];

// ── mentors (12) ──
const MENTORS = [
  { name_display: "Tanvir A. (CSE '24)", company: "Grameenphone", university: "AIUB", offers: ["cv_review", "intro"] },
  { name_display: "Nusrat J. (CSE '23)", company: "Grameenphone", university: "BUET", offers: ["cv_review"] },
  { name_display: "Rafid H. (SWE '24)", company: "bKash", university: "AIUB", offers: ["intro"] },
  { name_display: "Mehnaz K. (CSE '24)", company: "bKash", university: "NSU", offers: ["cv_review", "intro"] },
  { name_display: "Sabbir R. (CSE '23)", company: "Samsung R&D Institute BD", university: "BUET", offers: ["cv_review"] },
  { name_display: "Adiba T. (CSE '24)", company: "Samsung R&D Institute BD", university: "AIUB", offers: ["cv_review"] },
  { name_display: "Fahim S. (CSE '25)", company: "Brain Station 23", university: "AIUB", offers: ["cv_review", "intro"] },
  { name_display: "Priyanka D. (CSE '24)", company: "Optimizely", university: "IUT", offers: ["intro"] },
  { name_display: "Shakil M. (CSE '23)", company: "Pathao", university: "BRAC", offers: ["cv_review"] },
  { name_display: "Israt E. (CSE '25)", company: "Therap (BD)", university: "NSU", offers: ["cv_review", "intro"] },
  { name_display: "Mahir F. (SWE '24)", company: "10 Minute School", university: "BRAC", offers: ["intro"] },
  { name_display: "Anika B. (CSE '24)", company: "Chaldal", university: "BUET", offers: ["cv_review"] },
];

// ════════════════════ emit SQL ════════════════════
const esc = (s) => String(s).replace(/'/g, "''");
const sqlStr = (s) => (s === null || s === undefined ? "null" : `'${esc(s)}'`);
const sqlArr = (a) => `array[${a.map((x) => `'${esc(x)}'`).join(", ")}]::text[]`;

const outcomes = makeOutcomes();
let sql = `-- ════════════════════════════════════════════════════════════════
-- SHURU — seed.sql (GENERATED by scripts/generate-seed.mjs — do not hand-edit)
-- Run AFTER schema.sql. ${LISTINGS.length} opportunities, ${outcomes.length} outcomes,
-- ${REPORTS.length} interview reports, ${MENTORS.length} mentors.
-- ════════════════════════════════════════════════════════════════

insert into public.opportunities (id, company, role, location, duration, is_paid, deadline, eligibility_rules, source_url, is_verified, cycle_label) values
`;
sql += LISTINGS.map((l, i) => {
  const src = `https://careers.example.com/${l.company.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return `  ('${uuid(i + 1)}', ${sqlStr(l.company)}, ${sqlStr(l.role)}, ${sqlStr(l.location)}, ${sqlStr(l.duration)}, ${l.is_paid}, '${l.deadline}', '${esc(JSON.stringify(l.rules))}'::jsonb, ${sqlStr(src)}, ${l.is_verified}, ${sqlStr(l.cycle_label)})`;
}).join(",\n") + ";\n\n";

sql += `insert into public.outcomes (opportunity_id, profile_snapshot, result, cycle) values\n`;
sql += outcomes.map((o) => `  ('${o.opportunity_id}', '${esc(JSON.stringify(o.profile_snapshot))}'::jsonb, '${o.result}', '${o.cycle}')`).join(",\n") + ";\n\n";

sql += `insert into public.interview_reports (company, role, rounds, question_types, difficulty, apply_to_offer_days, author_anon) values\n`;
sql += REPORTS.map((r) => `  (${sqlStr(r.company)}, ${sqlStr(r.role)}, '${esc(JSON.stringify(r.rounds))}'::jsonb, ${sqlArr(r.question_types)}, ${r.difficulty}, ${r.apply_to_offer_days}, ${sqlStr(r.author_anon)})`).join(",\n") + ";\n\n";

sql += `insert into public.mentors (user_id, name_display, company, university, offers, opt_in) values\n`;
sql += MENTORS.map((m) => `  (null, ${sqlStr(m.name_display)}, ${sqlStr(m.company)}, ${sqlStr(m.university)}, ${sqlArr(m.offers)}, true)`).join(",\n") + ";\n";

writeFileSync("supabase/seed.sql", sql);

// ════════════════════ emit TS mirror (offline demo mode) ════════════════════
const withIds = (rows, prefix) => rows.map((r, i) => ({ id: `${prefix}-${i + 1}`, ...r }));
const ts = `/**
 * GENERATED by scripts/generate-seed.mjs — do not hand-edit.
 * Identical to supabase/seed.sql.
 *
 * TEST FIXTURE ONLY. Nothing the browser loads may import this module: it is
 * ~9k lines, and pulling it into a "use client" file ships the entire
 * illustrative dataset to every visitor. The app needs only the ids, which
 * live in the much smaller ./seedIds.
 */
import type { Opportunity, Outcome, InterviewReport, Mentor } from "@/lib/types";

export const SEED_OPPORTUNITIES: Opportunity[] = ${JSON.stringify(
  LISTINGS.map((l, i) => ({
    id: uuid(i + 1), company: l.company, role: l.role, location: l.location,
    duration: l.duration, is_paid: l.is_paid, deadline: l.deadline,
    eligibility_rules: l.rules,
    source_url: `https://careers.example.com/${l.company.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    is_verified: l.is_verified, cycle_label: l.cycle_label,
  })), null, 2)};

export const SEED_OUTCOMES: Outcome[] = ${JSON.stringify(withIds(outcomes, "out"), null, 2)};

export const SEED_REPORTS: InterviewReport[] = ${JSON.stringify(withIds(REPORTS.map(r => ({...r})), "rep"), null, 2)};

export const SEED_MENTORS: Mentor[] = ${JSON.stringify(withIds(MENTORS.map((m) => ({ user_id: null, ...m, opt_in: true })), "men"), null, 2)};
`;
writeFileSync("src/lib/data/seed.ts", ts);

// ══════════════════════ emit ids-only module (shipped) ══════════════════════
/*
 * Split out from seed.ts deliberately. `isSeededOpportunity()` needs nothing
 * but the ids, and it is called from a "use client" module — importing the
 * full dataset there put ~9k lines of illustrative outcomes, reports and
 * mentors into the browser bundle for a 30-entry membership test.
 */
const idsTs = `/**
 * GENERATED by scripts/generate-seed.mjs — do not hand-edit.
 *
 * Ids of the rows in supabase/seed.sql, and nothing else. This is the only
 * seed artefact the client bundle is allowed to import; see ./seed for why.
 */
export const SEED_OPPORTUNITY_IDS: readonly string[] = ${JSON.stringify(
  LISTINGS.map((_, i) => uuid(i + 1)),
  null,
  2
)};
`;
writeFileSync("src/lib/data/seedIds.ts", idsTs);

console.log(`seed.sql + seed.ts + seedIds.ts: ${LISTINGS.length} opportunities, ${outcomes.length} outcomes, ${REPORTS.length} reports, ${MENTORS.length} mentors`);
