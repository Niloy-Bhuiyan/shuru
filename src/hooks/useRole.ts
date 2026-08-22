"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { UserRole } from "@/lib/types";

/**
 * The signed-in user's role.
 *
 * Read from `user_roles` rather than the `current_user_role()` RPC so a
 * missing row reads as "student" here exactly as it does server-side
 * (`getSessionUser`), instead of surfacing an RPC error for the common case.
 *
 * This is a UI affordance ONLY — it decides which links to render. Every
 * privileged action is gated again by `requireRole()` server-side and by RLS
 * in the database; nothing here is a security boundary.
 */
export function useRole() {
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const sb = supabaseBrowser();
        const {
          data: { user },
        } = await sb.auth.getUser();
        if (!user) {
          if (!cancelled) setRole(null);
          return;
        }
        const { data } = await sb
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .maybeSingle();
        if (!cancelled) setRole((data?.role as UserRole | undefined) ?? "student");
      } catch {
        // Fall back to the least-privileged role; a failed lookup must never
        // reveal employer or admin navigation.
        if (!cancelled) setRole("student");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { role, loading };
}
