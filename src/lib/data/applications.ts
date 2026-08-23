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
