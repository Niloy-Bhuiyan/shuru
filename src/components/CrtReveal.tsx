"use client";

import React, { useEffect, useState } from "react";

/**
 * CRT power-on reveal (NOT glass-shatter). A bright phosphor line snaps open
 * to full height, flickers, then fades to reveal the agent screen. Calls
 * onDone when finished. Under prefers-reduced-motion it finishes instantly
 * (plain open) and renders nothing.
 */
export function CrtReveal({ onDone }: { onDone: () => void }) {
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setGone(true);
      onDone();
      return;
    }
    const t = setTimeout(() => {
      setGone(true);
      onDone();
    }, 900);
    return () => clearTimeout(t);
    // onDone identity is stable enough for a one-shot reveal
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (gone) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center overflow-hidden">
      <div
        className="crt-on h-full w-full"
        style={{ backgroundColor: "#9ff5cf" }}
      />
    </div>
  );
}

export default CrtReveal;
