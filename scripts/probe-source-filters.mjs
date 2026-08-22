// Compare filter rules against BOTH live sources before changing anything.
const INTERN = ["intern", "internship", "trainee", "graduate", "entry level", "junior", "fresher"];
const EXCLUDE = ["senior", "sr.", "staff", "lead", "principal", "manager", "head of", "director", "vp ", "chief"];
const TECH = ["engineer","developer","software","data","frontend","backend","fullstack","full stack","web","mobile","android","ios","ml","machine learning","ai","devops","cloud","qa","test","security","python","javascript","typescript","react","node","java","c++","go","rust","sql"];

const hit = (list, s) => list.some((t) => s.includes(t));

// current: everything matched against title + tags
const current = (title, tags) => {
  const hay = `${title} ${tags.join(" ")}`.toLowerCase();
  if (hit(EXCLUDE, hay)) return false;
  return hit(INTERN, hay) && hit(TECH, hay);
};

// title-only: tags ignored entirely
const titleOnly = (title) => {
  const t = title.toLowerCase();
  if (hit(EXCLUDE, t)) return false;
  return hit(INTERN, t) && hit(TECH, t);
};

// hybrid: seniority + intern from title, tech may come from tags
const hybrid = (title, tags) => {
  const t = title.toLowerCase();
  if (hit(EXCLUDE, t)) return false;
  if (!hit(INTERN, t)) return false;
  return hit(TECH, `${t} ${tags.join(" ").toLowerCase()}`);
};

async function load(url, key, map) {
  const r = await fetch(url, { headers: { accept: "application/json" } });
  const raw = await r.json();
  const arr = key ? raw[key] : raw;
  return arr.map(map).filter((x) => x.title);
}

const remoteok = await load("https://remoteok.com/api", null, (j) => ({
  title: typeof j.position === "string" ? j.position : "",
  tags: Array.isArray(j.tags) ? j.tags.map(String) : [],
}));
const arbeitnow = await load("https://arbeitnow.com/api/job-board-api", "data", (j) => ({
  title: typeof j.title === "string" ? j.title : "",
  tags: [...(j.tags ?? []), ...(j.job_types ?? [])].map(String),
}));

for (const [name, rows] of [["remoteok", remoteok], ["arbeitnow", arbeitnow]]) {
  const c = rows.filter((r) => current(r.title, r.tags));
  const t = rows.filter((r) => titleOnly(r.title));
  const h = rows.filter((r) => hybrid(r.title, r.tags));
  console.log(`\n=== ${name} (${rows.length} rows) ===`);
  console.log(`  current   : ${c.length}`);
  console.log(`  titleOnly : ${t.length}`);
  console.log(`  hybrid    : ${h.length}`);
  const gained = h.filter((r) => !c.some((x) => x.title === r.title));
  if (gained.length) {
    console.log("  hybrid would newly admit:");
    for (const g of gained.slice(0, 12)) console.log(`    + ${g.title}`);
  }
  const hybridNotTitle = h.filter((r) => !t.some((x) => x.title === r.title));
  if (hybridNotTitle.length) {
    console.log("  admitted by TAGS only (tech not in title):");
    for (const g of hybridNotTitle.slice(0, 12)) console.log(`    ~ ${g.title}`);
  }
}
