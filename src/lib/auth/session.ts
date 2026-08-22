import { supabaseServer } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";

/**
 * Server-side session and role helpers.
 *
 * Route handlers and server components must re-check the caller's role here
 * before any privileged operation. Middleware redirects are a UX layer that
 * a direct API call bypasses entirely, and RLS — while the real boundary —
 * produces empty result sets rather than the clear 401/403 an API should
 * return.
 *
 * Server-only by construction: supabaseServer() reads next/headers, which
 * throws if this module is ever pulled into a client component.
 */

export type SessionUser = {
  id: string;
  email: string | null;
  emailVerified: boolean;
  role: UserRole;
};

/** The signed-in user, or null. Always validated against Supabase. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const sb = supabaseServer();

  // getUser() re-validates with the auth server; getSession() would trust a
  // cookie the client could have tampered with.
  const {
    data: { user },
    error,
  } = await sb.auth.getUser();
  if (error || !user) return null;

  const { data: roleRow } = await sb
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  return {
    id: user.id,
    email: user.email ?? null,
    emailVerified: Boolean(user.email_confirmed_at),
    role: (roleRow?.role as UserRole | undefined) ?? "student",
  };
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/** The signed-in user, or throw a 401. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("Authentication required", 401);
  return user;
}

/**
 * The signed-in user, or throw. Admins satisfy every role requirement;
 * an employer requirement is not satisfied by a student.
 */
export async function requireRole(
  ...allowed: UserRole[]
): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role === "admin") return user;
  if (!allowed.includes(user.role)) {
    throw new AuthError(`Requires role: ${allowed.join(" or ")}`, 403);
  }
  return user;
}

/** Turn an AuthError into a Response; rethrow anything else. */
export function authErrorResponse(err: unknown): Response | null {
  if (err instanceof AuthError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  return null;
}
