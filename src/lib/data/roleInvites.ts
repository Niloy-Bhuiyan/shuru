"use client";

/**
 * ROLE INVITES (referrals)
 *
 * Admin-only, all of it. Every policy on `role_invites` is gated on
 * is_admin(), so a non-admin calling any of these gets an empty list or 42501
 * — verified against the live database.
 *
 * Two paths, because there are two situations, and only one of them needs an
 * invite at all:
 *
 *   inviteByEmail  — the person does not have an account yet. The row sits
 *                    and waits; `handle_new_user` consumes it at signup.
 *   setRoleNow     — the person already signed up. No invite is involved: an
 *                    admin already holds INSERT/UPDATE on user_roles, so this
 *                    is a plain write, not an escalation.
 *
 * That split is why there is no redemption RPC anywhere in this file. See
 * migration 0017.
 */

import { supabaseBrowser } from "@/lib/supabase/client";
import type { UserRole } from "@/lib/types";

export type InvitableRole = Extract<UserRole, "employer" | "admin">;

export type RoleInvite = {
  id: string;
  email: string;
  role: InvitableRole;
  note: string | null;
  invited_by: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  accepted_by: string | null;
  accepted_at: string | null;
};

/** Invites still waiting to be accepted. */
export async function listOpenInvites(): Promise<RoleInvite[]> {
  const sb = supabaseBrowser();
  const { data, error } = await sb
    .from("role_invites")
    .select("*")
    .is("accepted_by", null)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as RoleInvite[];
}

export class InviteDenied extends Error {
  constructor(message = "Not permitted") {
    super(message);
    this.name = "InviteDenied";
  }
}

/**
 * Record that an address should get a role when it signs up.
 *
 * The email is lowercased here because the column has a CHECK that it equals
 * its own lower(), and because the trigger matches on lower(new.email). An
 * address is case-insensitive; storing it two ways would let one person hold
 * two open invites.
 */
export async function inviteByEmail(
  email: string,
  role: InvitableRole,
  note?: string
): Promise<RoleInvite> {
  const sb = supabaseBrowser();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new InviteDenied("Not signed in");

  const { data, error } = await sb
    .from("role_invites")
    .insert({
      email: email.trim().toLowerCase(),
      role,
      note: note?.trim() || null,
      invited_by: user.id,
    })
    .select()
    .single();
  if (error) {
    if (error.code === "42501") throw new InviteDenied();
    // 23505 = the partial unique index: that address already has a live invite.
    if (error.code === "23505") throw new InviteDenied("That address already has an open invite");
    throw error;
  }
  return data as RoleInvite;
}

/** Withdraw an invite that has not been accepted. */
export async function revokeInvite(id: string): Promise<void> {
  const sb = supabaseBrowser();
  const { error } = await sb
    .from("role_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .is("accepted_by", null);
  if (error) {
    if (error.code === "42501") throw new InviteDenied();
    throw error;
  }
}
