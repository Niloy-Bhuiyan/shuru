#!/usr/bin/env node
/**
 * Set (or add) a password on an existing Supabase auth user.
 *
 *   node scripts/set-password.mjs you@example.com
 *
 * It prompts for the password with terminal echo suppressed. The value is
 * never passed as an argument, never written to disk, and never printed — so
 * it cannot end up in your shell history, in a file, or in a commit.
 *
 * WHY THIS EXISTS
 *
 * An account created through Google or GitHub has **no password at all**
 * (`encrypted_password` is null). Signing in with email + password against one
 * fails with "Invalid login credentials", and re-registering does not help:
 * Supabase answers a signup for an existing address with a success-shaped
 * response and creates nothing, so it looks like it worked. This is the
 * supported way to attach a password to such an account.
 *
 * Reads SUPABASE_SERVICE_ROLE_KEY from .env.local. That key bypasses RLS and
 * can rewrite any user, so this is a local operator tool — never expose it
 * over HTTP and never run it from CI.
 */

import fs from "node:fs";
import path from "node:path";

const LF = String.fromCharCode(10);
const CR = String.fromCharCode(13);
const EOT = String.fromCharCode(4);
const ETX = String.fromCharCode(3);
const DEL = String.fromCharCode(127);
const BS = String.fromCharCode(8);

function loadEnv() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return {};
  const env = {};
  for (const raw of fs.readFileSync(file, "utf8").split(LF)) {
    const line = raw.replace(/\r$/, "").trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return env;
}

/**
 * Read a line from stdin without echoing it.
 *
 * Raw mode rather than readline: readline echoes the input before any handler
 * can intercept it, so the password would flash on screen. In raw mode nothing
 * is printed unless this function prints it.
 */
function askHidden(question) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(new Error("Needs an interactive terminal to read the password."));
      return;
    }
    process.stdout.write(question);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    let value = "";
    const finish = (result) => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.off("data", onData);
      process.stdout.write(LF);
      resolve(result);
    };
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === LF || ch === CR || ch === EOT) return finish(value);
        if (ch === ETX) {
          process.stdin.setRawMode(false);
          process.stdout.write(LF);
          process.exit(130);
        }
        if (ch === DEL || ch === BS) value = value.slice(0, -1);
        else value += ch;
      }
    };
    process.stdin.on("data", onData);
  });
}

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("usage: node scripts/set-password.mjs <email>");
    process.exitCode = 1;
    return;
  }

  const env = { ...loadEnv(), ...process.env };
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local"
    );
    process.exitCode = 1;
    return;
  }

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };

  // The admin list endpoint is the only way to map an email to a user id
  // without querying auth.users directly.
  const listRes = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=200`, {
    headers,
  });
  if (!listRes.ok) {
    console.error(`Could not list users: ${listRes.status}`);
    process.exitCode = 1;
    return;
  }
  const { users = [] } = await listRes.json();
  const user = users.find(
    (u) => (u.email || "").toLowerCase() === email.toLowerCase()
  );
  if (!user) {
    console.error(
      `No user with email ${email}. Sign up, or sign in with Google first.`
    );
    process.exitCode = 1;
    return;
  }

  const providers = user.app_metadata?.providers ?? [];
  console.log(`Found ${user.email}`);
  console.log(`  id        : ${user.id}`);
  console.log(`  providers : ${providers.join(", ") || "(none)"}`);
  console.log(
    `  password  : ${providers.includes("email") ? "already set" : "none - will be added"}`
  );
  console.log("");

  const password = await askHidden("New password (input hidden): ");
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exitCode = 1;
    return;
  }

  /*
   * Warn, do not block. A short or common password is accepted by Supabase
   * today but WILL be rejected once "Prevent use of leaked passwords" is
   * enabled, because that checks against HaveIBeenPwned. Saying so here is
   * cheaper than debugging it later.
   */
  if (password.length < 12 || /^[a-z]+[0-9]{1,4}$/i.test(password)) {
    console.warn(
      "  ! That looks weak. It will be REJECTED once leaked-password protection"
    );
    console.warn("    is enabled in Supabase Auth. Consider a longer one.");
    console.warn("");
  }

  const res = await fetch(`${url}/auth/v1/admin/users/${user.id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ password, email_confirm: true }),
  });

  if (!res.ok) {
    console.error(`Failed: ${res.status} ${await res.text()}`);
    process.exitCode = 1;
    return;
  }

  console.log("Password set. You can now sign in with email + password.");
  console.log("Google sign-in keeps working on the same account.");
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
