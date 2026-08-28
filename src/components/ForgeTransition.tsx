"use client";

/**
 * FORGE TRANSITION — a short stepped fade between Radar and the Resume Forge.
 *
 * Deliberately subtle and fast: the destination snaps in over 2 frames
 * (160ms) using steps() timing, matching the low-frame-rate motion language
 * used everywhere else in the pixel system. Navigation is never delayed.
 *
 * Replaces the previous snapshot glass-shatter portal, which rasterized the
 * viewport with html2canvas and flew 70 clip-path shards off-screen before
 * the new page could be read.
 *
 * prefers-reduced-motion is handled in globals.css (animation: none).
 */

import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const FLAG = "shuru.forge-transition";
const DURATION_MS = 160;

/**
 * Navigate to `href`, arming the arrival animation on the destination.
 * If sessionStorage is unavailable the navigation still happens — only the
 * animation is skipped.
 */
export function transitionTo(
  router: { push: (href: string) => void },
  href: string
) {
  armForgeTransition();
  router.push(href);
}

/**
 * Arm the arrival animation without navigating.
 *
 * The nav links are plain <Link>s and should stay that way — intercepting a
 * navigation to run an animation is how you break middle-click and
 * open-in-new-tab. Arming the flag on click lets the browser navigate
 * normally and lets ForgePortal do the rest on the other side.
 *
 * This exists because the Forge became a nav destination: the two callers of
 * transitionTo() were the radar promo block and the Forge's own back button,
 * and both are gone.
 */
export function armForgeTransition() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(FLAG, "1");
  } catch {
    /* storage unavailable → navigate without the animation */
  }
}

/**
 * Wraps the app shell. Plays the arrival animation once, on the first render
 * after a transitionTo() navigation.
 */
export function ForgePortal({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [entering, setEntering] = useState(false);

  useEffect(() => {
    let armed = false;
    try {
      armed = window.sessionStorage.getItem(FLAG) === "1";
      if (armed) window.sessionStorage.removeItem(FLAG);
    } catch {
      armed = false;
    }
    if (!armed) return;

    setEntering(true);
    const t = window.setTimeout(() => setEntering(false), DURATION_MS + 40);
    return () => window.clearTimeout(t);
  }, [pathname]);

  return <div className={entering ? "forge-enter" : undefined}>{children}</div>;
}

export default ForgePortal;
