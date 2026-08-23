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
          Cap the reading column on desktop. Without it, single-column screens
          (alerts, profile) stretch a form across ~920px, which is wide enough
          that the eye loses the line. 880px still leaves the radar feed two
          comfortable card columns.
        */}
        <div className="min-w-0 flex-1 lg:max-w-[880px]">
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
    </ForgePortal>
  );
}
