// Which public Lever / Ashby boards actually resolve, and do they carry interns?
const LEVER = ["netflix", "palantir", "plaid", "brex", "ramp", "figma", "voleon", "spotify", "shopify"];
const ASHBY = ["openai", "linear", "notion", "ramp", "vanta", "deel", "posthog", "replit"];

const INTERN = ["intern", "internship", "trainee", "graduate", "entry level", "junior", "fresher"];
const isIntern = (s) => INTERN.some((t) => s.toLowerCase().includes(t));

async function tryJson(url, opts = {}) {
  try {
    const r = await fetch(url, { headers: { accept: "application/json" }, ...opts });
    if (!r.ok) return { ok: false, status: r.status };
    return { ok: true, body: await r.json() };
  } catch (e) {
    return { ok: false, status: e.name };
  }
}

console.log("=== LEVER ===");
for (const slug of LEVER) {
  const r = await tryJson(`https://api.lever.co/v0/postings/${slug}?mode=json`);
  if (!r.ok || !Array.isArray(r.body)) {
    console.log(`  ${slug.padEnd(12)} unavailable (${r.status ?? "shape"})`);
    continue;
  }
  const interns = r.body.filter((p) => typeof p.text === "string" && isIntern(p.text));
  const withDesc = interns.filter((p) => (p.descriptionPlain ?? "").length > 200);
  console.log(
    `  ${slug.padEnd(12)} ${String(r.body.length).padStart(4)} postings, ${interns.length} intern-titled, ${withDesc.length} with description`
  );
}

console.log("\n=== ASHBY ===");
for (const slug of ASHBY) {
  const r = await tryJson(
    `https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`
  );
  const jobs = r.ok ? r.body?.jobs : null;
  if (!Array.isArray(jobs)) {
    console.log(`  ${slug.padEnd(12)} unavailable (${r.status ?? "shape"})`);
    continue;
  }
  const interns = jobs.filter((j) => typeof j.title === "string" && isIntern(j.title));
  console.log(
    `  ${slug.padEnd(12)} ${String(jobs.length).padStart(4)} postings, ${interns.length} intern-titled`
  );
}
