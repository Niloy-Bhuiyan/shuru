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
import { PixelSideNav } from "@/components/pixel/PixelSideNav";
import { LoadingBlock } from "@/components/LoadingBlock";
import { getProfile } from "@/lib/data";
import { ForgePortal } from "@/components/ForgeTransition";
import { AgentDock } from "@/components/agent/AgentDock";

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
        // A session without a profile means an OAuth signup that never passed
        // through /register. Send it to onboarding, NOT to /login — middleware
        // bounces an authenticated user off /login straight back here, and the
        // two used to loop forever.
        if (!p) router.replace("/onboarding");
        else setReady(true);
      })
      // A transient data/auth error must not hang the shell on the loader
      // forever — fall back to the login gate (the user can retry from there).
      .catch(() => router.replace("/login"));
  }, [router]);

  return (
    <ForgePortal>
      <SunriseHeader />
      {/*
        One shell, two shapes. Mobile stacks content above the fixed bottom
        nav (pb-20 clears it); from `lg` the sidebar takes the left column and
        that bottom padding is dropped, since PixelNav is hidden there.
      */}
      <div className="lg:flex lg:items-start">
        <PixelSideNav />
        {/*
          The content column fills exactly the space the sidebar leaves:
          1120px frame - 200px sidebar = 920px.

          It used to be capped at 880px for reading-line reasons, which left a
          40px strip of the cream frame showing down the right-hand side. On
          the ordinary cream screens that was invisible. On the Forge and the
          agent — full-bleed dark "worlds" — it rendered as a pale gutter
          beside a dark panel and read as a rendering bug. 920px is still a
          comfortable measure and still gives the radar feed two card columns.
        */}
        <div className="min-w-0 flex-1 lg:max-w-[920px]">
          {ready ? (
            <div className="pb-20 lg:pb-8">{children}</div>
          ) : (
            <main className="px-4 pt-6">
              <LoadingBlock />
            </main>
          )}
        </div>
      </div>
      <PixelNav />
      {/* The agent rides along on every screen instead of owning one. It
          renders nothing until the profile guard clears, so it cannot appear
          over the onboarding redirect. */}
      {ready && <AgentDock />}
    </ForgePortal>
  );
}
