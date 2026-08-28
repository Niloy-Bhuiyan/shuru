#!/usr/bin/env node
/**
 * Database security gate.
 *
 * Runs the SQL check files and exits non-zero if anything fails, so this works
 * as a release gate and not only as something to read.
 *
 *   npm run verify:rls                     both files
 *   npm run test:rls                       behaviour tests only
 *   node scripts/verify-rls.mjs a.sql      one named file
 *
 * Two files, deliberately separate:
 *
 *   verify-rls.sql  the SHAPE of the config — policies exist, grants match
 *                   them, nothing is over-privileged. Returns one row per
 *                   check with a PASS/FAIL column.
 *   test-rls.sql    what those policies DO — becomes each role, counts what
 *                   is visible, attempts writes that must be refused.
 *                   Asserts with RAISE, so a thrown error IS the report.
 *
 * A table can satisfy every structural invariant and still return another
 * student's applications because a policy's WHERE clause is wrong. Hence both.
 *
 * Needs SUPABASE_DB_URL in .env.local (Supabase -> Project Settings ->
 * Database -> Connection string -> URI). That URI contains your database
 * password; .env.local is git-ignored and the value is never printed.
 *
 * The SQL files are the source of truth — this only runs them and formats the
 * result. Add checks there, not here.
 */

import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const DEFAULT_FILES = ["verify-rls.sql", "test-rls.sql"];

function loadEnv() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return {};
  const env = {};
  for (const raw of fs.readFileSync(file, "utf8").split("\n")) {
    const line = raw.replace(/\r$/, "").trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return env;
}

async function main() {
  const env = { ...loadEnv(), ...process.env };
  const url = env.SUPABASE_DB_URL;
  if (!url) {
    console.error(
      "SUPABASE_DB_URL is not set.\n" +
        "Add it to .env.local — Supabase Dashboard -> Project Settings ->\n" +
        "Database -> Connection string -> URI (replace [YOUR-PASSWORD]).\n\n" +
        "Without it you can still run these by pasting the files in\n" +
        "supabase/ into the Supabase SQL Editor."
    );
    process.exit(1);
  }

  const named = process.argv.slice(2).filter((a) => a.endsWith(".sql"));
  const files = (named.length ? named : DEFAULT_FILES).map((f) =>
    path.join(process.cwd(), "supabase", path.basename(f))
  );
  for (const f of files) {
    if (!fs.existsSync(f)) {
      console.error(`Missing ${f}`);
      process.exit(1);
    }
  }

  const client = new pg.Client({
    connectionString: url,
    // Supabase terminates TLS at the pooler with a certificate this client
    // has no local root for; the connection is still encrypted.
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  let failed = 0;

  try {
    for (const file of files) {
      console.log(`\n── ${path.basename(file)} ──`);

      let rows;
      try {
        ({ rows } = await client.query(fs.readFileSync(file, "utf8")));
      } catch (e) {
        // test-rls.sql asserts by RAISE, so a thrown error is the failure
        // report — and its message already names the check and the numbers.
        console.log(`FAIL  ${e.message}`);
        failed++;
        continue;
      }

      // The two files return different shapes. Handle both rather than
      // pretending they are the same.
      if (rows.length && "check_name" in rows[0]) {
        const width = Math.max(...rows.map((r) => r.check_name.length));
        for (const r of rows) {
          const ok = r.status === "PASS";
          if (!ok) failed++;
          console.log(
            `${ok ? "PASS" : "FAIL"}  ${r.check_name.padEnd(width)}  ` +
              (ok ? "" : `${r.failures} — ${r.detail}`)
          );
        }
      } else {
        console.log(`PASS  ${rows[0]?.result ?? "completed"}`);
        if (rows[0]?.covered) console.log(`      ${rows[0].covered}`);
      }
    }

    console.log(
      failed ? `\n${failed} check(s) FAILED` : "\nall database checks passed"
    );
    process.exit(failed ? 1 : 0);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
