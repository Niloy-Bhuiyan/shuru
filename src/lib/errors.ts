/**
 * WHAT A USER IS TOLD WHEN SOMETHING FAILS.
 *
 * Every screen in this app used to do the same thing with a caught error:
 * `setError((e as Error).message)`, straight into the DOM. That is how a
 * moderator came to see
 *
 *   new row violates row-level security policy for table "user_roles"
 *
 * on the admin console. It is accurate, it is useless, and it is a sentence
 * about our database rather than about anything they can do. Worse, it leaks
 * table names and policy names to whoever triggered it.
 *
 * ── The rule ──────────────────────────────────────────────────────────────
 *
 * `toUserMessage` NEVER returns the raw text of an error it does not
 * recognise. An unrecognised failure produces the generic message, and the
 * detail goes to the console for whoever is debugging. There is no code path
 * from a Postgres string to a rendered paragraph.
 *
 * ── The exception, and why it is one ──────────────────────────────────────
 *
 * Some errors carry a message that was deliberately WRITTEN for a person to
 * read — `DecisionRejected` explains that you cannot approve your own payment
 * and to ask another admin. Those are better than any generic string, so they
 * pass through. They are marked with an explicit `explained` flag rather than
 * detected by shape: "this message is fit to show a human" is a claim the
 * thrower has to make on purpose, not something this file should guess.
 */

import type { StringKey } from "@/lib/i18n";

/**
 * Postgres / PostgREST codes worth naming.
 *
 * Only failures a user can actually respond to are mapped. Everything else is
 * deliberately generic: "could not connect to the database" is not more
 * actionable than "something went wrong", it just sounds more specific.
 */
const CODE_KEYS: Record<string, StringKey> = {
  // insufficient_privilege — an RLS policy or a GRANT refused this. On this
  // app that nearly always means the role changed under someone mid-session.
  "42501": "err.notAllowed",
  // unique_violation
  "23505": "err.duplicate",
  // foreign_key_violation
  "23503": "err.related",
  // check_violation / not_null_violation
  "23514": "err.invalid",
  "23502": "err.invalid",
  // PostgREST: no rows where exactly one was required
  PGRST116: "err.notFound",
  // PostgREST: JWT expired or invalid
  PGRST301: "err.signedOut",
};

/** Thrown types this app defines, by `name` so nothing has to be imported. */
const NAME_KEYS: Record<string, StringKey> = {
  ModerationRejected: "err.moderationReverted",
  EmployerAccessDenied: "op.accessDenied",
  InviteDenied: "err.notAllowed",
};

type ErrorLike = {
  name?: unknown;
  code?: unknown;
  message?: unknown;
  status?: unknown;
  /** Set by throwers whose message was written to be read by a user. */
  explained?: unknown;
};

function asErrorLike(e: unknown): ErrorLike {
  return typeof e === "object" && e !== null ? (e as ErrorLike) : {};
}

/**
 * A message the thrower marked as fit for a person, or null.
 *
 * The flag has to be true AND the message non-empty: a class that sets
 * `explained` and then falls back to a bare code slug would otherwise render
 * "decision_failed" to a reviewer, which is exactly the class of string this
 * module exists to keep off the screen.
 */
export function explainedMessage(e: unknown): string | null {
  const err = asErrorLike(e);
  if (err.explained !== true) return null;
  const message = typeof err.message === "string" ? err.message.trim() : "";
  return message.length > 0 ? message : null;
}

/**
 * Which translated string describes this failure.
 *
 * Exported separately from `toUserMessage` so it can be tested without a
 * translator, and so a caller that wants to branch on the KIND of failure —
 * to offer a "sign in again" button on `err.signedOut`, say — can.
 */
export function errorMessageKey(e: unknown): StringKey {
  const err = asErrorLike(e);

  const name = typeof err.name === "string" ? err.name : "";
  if (name in NAME_KEYS) return NAME_KEYS[name];

  const code = typeof err.code === "string" ? err.code : "";
  if (code in CODE_KEYS) return CODE_KEYS[code];

  // Supabase surfaces auth failures as an HTTP status rather than a PG code.
  if (err.status === 401 || err.status === 403) return "err.notAllowed";

  /*
   * A dropped connection arrives as `TypeError: Failed to fetch` (Chrome) or
   * `NetworkError when attempting to fetch resource` (Firefox), with no code
   * and no status. Telling someone their connection dropped is worth the
   * string match, because it is the one failure here they can actually fix.
   */
  const message = typeof err.message === "string" ? err.message : "";
  if (name === "AbortError" || name === "TimeoutError") return "err.timeout";
  if (
    e instanceof TypeError &&
    /fetch|network|connection/i.test(message)
  ) {
    return "err.offline";
  }

  return "err.generic";
}

/**
 * The single call every UI makes in a `catch`.
 *
 * Logs the real error and returns something safe to render. The logging is
 * the half that makes the strict rule above affordable: nothing is lost by
 * refusing to print a Postgres message at a user, because it is still one
 * console line away for whoever is actually debugging.
 */
export function toUserMessage(
  e: unknown,
  t: (key: StringKey) => string
): string {
  const explained = explainedMessage(e);
  if (explained) return explained;

  const key = errorMessageKey(e);
  if (key === "err.generic") {
    // Only the unrecognised ones are worth the noise; the mapped cases are
    // already understood and would just fill the console during normal use.
    console.error("[unhandled]", e);
  }
  return t(key);
}
