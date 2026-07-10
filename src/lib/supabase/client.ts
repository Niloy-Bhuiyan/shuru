"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Browser Supabase client. Only call when NOT in demo mode. */
export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
