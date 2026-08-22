#!/usr/bin/env node
/**
 * Migration runner.
 *
 * Applies every file in supabase/migrations/ in filename order and records
 * what ran in public.schema_migrations, so re-running only applies what is
 * new. Each file executes inside a transaction: a failure rolls that file
 * back rather than leaving the schema half-migrated.
 *
 *   node scripts/migrate.mjs           apply pending migrations
 *   node scripts/migrate.mjs --status  list applied / pending, apply nothing
 *   node scripts/migrate.mjs --force   re-apply every migration
 *
 * Needs SUPABASE_DB_URL in .env.local (Supabase -> Project Settings ->
 * Database -> Connection string -> URI). That URI contains your database
 * password: .env.local is git-ignored and the value is never printed.
 */

import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");

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
  const args = process.argv.slice(2);
  const statusOnly = args.includes("--status");
  const force = args.includes("--force");

  const env = { ...loadEnv(), ...process.env };
  const url = env.SUPABASE_DB_URL;
  if (!url) {
    console.error(
      "SUPABASE_DB_URL is not set.\n" +
        "Add it to .env.local — Supabase Dashboard -> Project Settings ->\n" +
        "Database -> Connection string -> URI (replace [YOUR-PASSWORD])."
    );
    process.exit(1);
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  if (files.length === 0) {
    console.error(`No .sql files in ${MIGRATIONS_DIR}`);
    process.exit(1);
  }

  const client = new pg.Client({
    connectionString: url,
    // Supabase terminates TLS at the pooler with a cert this client does not
    // have a local root for; the connection is still encrypted.
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    await client.query(`
      create table if not exists public.schema_migrations (
        filename text primary key,
        applied_at timestamptz not null default now()
      );
    `);

    const { rows } = await client.query(
      "select filename from public.schema_migrations"
    );
    const applied = new Set(rows.map((r) => r.filename));

    if (statusOnly) {
      console.log("migration status:\n");
      for (const f of files) {
        console.log(`  ${applied.has(f) ? "applied" : "PENDING"}  ${f}`);
      }
      return;
    }

    const pending = force ? files : files.filter((f) => !applied.has(f));
    if (pending.length === 0) {
      console.log("nothing to apply — schema is up to date");
      return;
    }

    for (const f of pending) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8");
      process.stdout.write(`applying ${f} ... `);
      try {
        await client.query("begin");
        await client.query(sql);
        await client.query(
          `insert into public.schema_migrations (filename) values ($1)
           on conflict (filename) do update set applied_at = now()`,
          [f]
        );
        await client.query("commit");
        console.log("ok");
      } catch (err) {
        await client.query("rollback");
        console.log("FAILED");
        console.error(`\n${f} failed and was rolled back:\n  ${err.message}`);
        if (err.hint) console.error(`  hint: ${err.hint}`);
        if (err.position) console.error(`  position: ${err.position}`);
        process.exit(1);
      }
    }

    console.log(`\napplied ${pending.length} migration(s)`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  // never surface the connection string, which carries the password
  console.error("migration run failed:", err.message);
  process.exit(1);
});
