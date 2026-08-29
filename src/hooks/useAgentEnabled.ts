"use client";

/**
 * Probes /api/agent once per app load (module-cached).
 *
 * The probe answers two SEPARATE questions and the UI needs both:
 *
 *   enabled — does this deployment have a provider key at all? False hides
 *             every entry point. There is no teaser for a feature the
 *             operator has not turned on.
 *   pro     — may THIS user use it? False shows a lock and a price, because
 *             the feature does exist here and is one purchase away.
 *
 * Collapsing them would make an unsubscribed user on a fully working
 * deployment see the same nothing as a user on an unconfigured one.
 */

import { useEffect, useState } from "react";

type Probe = { enabled: boolean; pro: boolean };

let cached: Probe | null = null;
/** In-flight probe, so N components mounting together make one request. */
let inflight: Promise<Probe> | null = null;

function probe(): Promise<Probe> {
  if (cached) return Promise.resolve(cached);
  inflight ??= fetch("/api/agent")
    .then((r) => r.json())
    .then((d: Partial<Probe>) => ({
      enabled: Boolean(d.enabled),
      pro: Boolean(d.pro),
    }))
    // A failed probe is "unavailable", never optimistically available: the
    // alternative is rendering a control whose every use errors.
    .catch(() => ({ enabled: false, pro: false }))
    .then((p) => {
      cached = p;
      inflight = null;
      return p;
    });
  return inflight;
}

/** Availability only. Existing call sites keep their `boolean | null`. */
export function useAgentEnabled(): boolean | null {
  return useAgentProbe()?.enabled ?? null;
}

/** Both facts, for the call sites that render a lock. */
export function useAgentProbe(): Probe | null {
  const [state, setState] = useState<Probe | null>(cached);

  useEffect(() => {
    if (cached) return;
    let cancelled = false;
    void probe().then((p) => {
      if (!cancelled) setState(p);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
