"use client";

/**
 * APPLICATION HISTORY
 *
 * `application_events` is append-only and written exclusively by the
 * `record_application_event` trigger — 0007/0009 revoke INSERT/UPDATE/DELETE
 * from `authenticated` precisely so no client can forge a history entry.
 * Reads are shared: a student sees their own application's history, an
 * employer sees it for listings their company owns, both via RLS.
 */

import { supabaseBrowser } from "@/lib/supabase/client";
import type { ApplicationEvent } from "@/lib/types";

/** Append-only history for one application, oldest first. */
export async function listApplicationEvents(
  applicationId: string
): Promise<ApplicationEvent[]> {
  const { data, error } = await supabaseBrowser()
    .from("application_events")
    .select("*")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ApplicationEvent[];
}

/** The caller's application for one listing, or null if they have none. */
export async function getApplicationFor(
  opportunityId: string
): Promise<{ id: string; status: string } | null> {
  const sb = supabaseBrowser();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;

  const { data, error } = await sb
    .from("applications")
    .select("id, status")
    .eq("user_id", user.id)
    .eq("opportunity_id", opportunityId)
    .maybeSingle();
  if (error) throw error;
  return (data as { id: string; status: string }) ?? null;
}
