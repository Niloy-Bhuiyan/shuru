#!/usr/bin/env node
/**
 * Database security gate.
 *
 * Runs supabase/verify-rls.sql and exits non-zero if any invariant fails, so
 * it works as a release gate and not only as something to read.
 *
 *   npm run verify:rls
 *
 * Needs SUPABASE_DB_URL in .env.local (Supabase -> Project Settings ->
 * Database -> Connection string -> URI). That URI contains your database
 * password; .env.local is git-ignored and the value is never printed.
 *
 * The SQL file is the source of truth — this only runs it and formats the
 * result. Add checks there, not here.
 */

import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const SQL_FILE = path.join(process.cwd(), "supabase", "verify-rls.sql");

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
        "Without it you can still run the checks by pasting\n" +
        "supabase/verify-rls.sql into the Supabase SQL Editor."
    );
    process.exit(1);
  }

  if (!fs.existsSync(SQL_FILE)) {
    console.error(`Missing ${SQL_FILE}`);
    process.exit(1);
  }

  const client = new pg.Client({
    connectionString: url,
    // Supabase terminates TLS at the pooler with a certificate this client
    // has no local root for; the connection is still encrypted.
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    const { rows } = await client.query(fs.readFileSync(SQL_FILE, "utf8"));

    const width = Math.max(...rows.map((r) => r.check_name.length));
    let failed = 0;
    for (const r of rows) {
      const ok = r.status === "PASS";
      if (!ok) failed++;
      console.log(
        `${ok ? "PASS" : "FAIL"}  ${r.check_name.padEnd(width)}  ` +
          (ok ? "" : `${r.failures} — ${r.detail}`)
      );
    }

    console.log(
      `\n${rows.length - failed}/${rows.length} checks passed` +
        (failed ? ` — ${failed} FAILED` : "")
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
