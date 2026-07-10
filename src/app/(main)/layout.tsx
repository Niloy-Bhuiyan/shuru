"use client";

/**
 * Main app shell: header + bottom nav + client-side profile guard.
 * (In Supabase mode middleware.ts already redirects before this runs;
 * in demo mode this guard is the only gate.)
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SunriseHeader } from "@/components/SunriseHeader";
import { PixelNav } from "@/components/pixel/PixelNav";
import { LoadingBlock } from "@/components/LoadingBlock";
import { getProfile } from "@/lib/data";
import { ShatterPortal } from "@/components/GlassShatter";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getProfile()
      .then((p) => {
        if (!p) router.replace("/login");
        else setReady(true);
      })
      // A transient data/auth error must not hang the shell on the loader
      // forever — fall back to the login gate (the user can retry from there).
      .catch(() => router.replace("/login"));
  }, [router]);

  return (
    <ShatterPortal>
      <SunriseHeader />
      {ready ? (
        <div className="pb-20">{children}</div>
      ) : (
        <main className="px-4 pt-6">
          <LoadingBlock />
        </main>
      )}
      <PixelNav />
    </ShatterPortal>
  );
}
