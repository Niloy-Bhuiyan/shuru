"use client";

/**
 * Probes /api/agent once per app load (module-cached). Returns:
 *   null  → still checking (render nothing)
 *   false → no provider key configured (entry points stay hidden)
 *   true  → agent available
 */

import { useEffect, useState } from "react";

let cached: boolean | null = null;

export function useAgentEnabled(): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(cached);

  useEffect(() => {
    if (cached !== null) return;
    fetch("/api/agent")
      .then((r) => r.json())
      .then((d: { enabled: boolean }) => {
        cached = d.enabled;
        setEnabled(d.enabled);
      })
      .catch(() => {
        cached = false;
        setEnabled(false);
      });
  }, []);

  return enabled;
}
