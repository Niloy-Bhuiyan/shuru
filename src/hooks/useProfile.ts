"use client";

import { useCallback, useEffect, useState } from "react";
import { getProfile } from "@/lib/data";
import type { Profile } from "@/lib/types";

/** Loads the signed-in user's profile (Supabase) or the device profile (demo). */
export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setProfile(await getProfile());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { profile, loading, refresh };
}
