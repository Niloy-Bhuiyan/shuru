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
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(FLAG, "1");
    } catch {
      /* storage unavailable → navigate without the animation */
    }
  }
  router.push(href);
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
