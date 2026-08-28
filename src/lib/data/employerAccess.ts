"use client";

/**
 * EMPLOYER ACCESS REQUESTS
 *
 * The missing half of role provisioning. `handle_new_user` makes every signup
 * a student and `user_roles` has admin-only writes with no self-write path —
 * correct, but until migration 0016 there was nothing on the other side of
 * it, so the employer product was unreachable without hand-written SQL.
 *
 * Nothing here is a security boundary. The insert policy pins `status` to
 * 'pending' and `user_id` to the caller; `guard_employer_access_request`
 * rewrites the decision fields on any non-admin write; and the approval runs
 * through `decide_employer_access`, a SECURITY INVOKER function, so the
 * admin-only policies on `user_roles` still apply to whoever calls it. A
 * non-admin calling `decide()` gets 42501 and changes nothing — verified
 * against the live database.
 */

import { supabaseBrowser } from "@/lib/supabase/client";

export type EmployerAccessStatus = "pending" | "approved" | "rejected";

export type EmployerAccessRequest = {
  id: string;
  user_id: string;
  company_name: string;
  company_website: string | null;
  contact_role: string | null;
  note: string | null;
  status: EmployerAccessStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
};

/**
 * This user's most recent request, or null if they have never asked.
 * RLS restricts the select to their own rows, so no user filter is needed
 * here to be correct — only to pick the latest of several.
 */
export async function getMyEmployerRequest(): Promise<EmployerAccessRequest | null> {
  const sb = supabaseBrowser();
  const { data, error } = await sb
    .from("employer_access_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as EmployerAccessRequest | null) ?? null;
}

/**
 * File a request. `status` is deliberately not sent: the column defaults to
 * 'pending' and the trigger would overwrite anything else anyway. Sending it
 * would imply the client has a say.
 */
export async function requestEmployerAccess(input: {
  company_name: string;
  company_website?: string;
  contact_role?: string;
  note?: string;
}): Promise<EmployerAccessRequest> {
  const sb = supabaseBrowser();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { data, error } = await sb
    .from("employer_access_requests")
    .insert({
      user_id: user.id,
      company_name: input.company_name.trim(),
      company_website: input.company_website?.trim() || null,
      contact_role: input.contact_role?.trim() || null,
      note: input.note?.trim() || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as EmployerAccessRequest;
}

/** Admin: the review queue. RLS returns nothing at all to a non-admin. */
export async function listEmployerRequests(
  status: EmployerAccessStatus = "pending"
): Promise<EmployerAccessRequest[]> {
  const sb = supabaseBrowser();
  const { data, error } = await sb
    .from("employer_access_requests")
    .select("*")
    .eq("status", status)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as EmployerAccessRequest[];
}

export class EmployerAccessDenied extends Error {
  constructor() {
    super("Not permitted to decide this request");
    this.name = "EmployerAccessDenied";
  }
}

/**
 * Admin: approve or reject, and set the role, in one statement.
 *
 * Two separate writes could leave a user holding `employer` against a request
 * that still reads `pending`, or the reverse. The RPC does both or neither.
 * A 42501 back from it means the caller is not an admin — surfaced as a typed
 * error so the UI can say so rather than showing a generic failure.
 */
export async function decideEmployerRequest(
  requestId: string,
  approve: boolean,
  notes?: string
): Promise<void> {
  const sb = supabaseBrowser();
  const { error } = await sb.rpc("decide_employer_access", {
    p_request_id: requestId,
    p_approve: approve,
    p_notes: notes?.trim() || null,
  });
  if (error) {
    if (error.code === "42501") throw new EmployerAccessDenied();
    throw error;
  }
}
