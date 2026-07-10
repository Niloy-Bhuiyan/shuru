"use client";

/**
 * SNAPSHOT GLASS-SHATTER — the actual rendered page breaks, not an overlay.
 *
 * How: at the moment of tap, breakTo() rasterizes the CURRENT VIEWPORT with
 * html2canvas (the page is flat-color pixel UI — near-perfect capture
 * territory). The bitmap is handed through SPA navigation in module memory
 * (no sessionStorage quota risk; router.push never reloads the JS context).
 * On arrival, ShatterPortal maps that bitmap onto the irregular triangulated
 * shards via background-position — so the greeting, card titles and numbers
 * visibly fracture mid-word and fly apart, revealing the new world beneath.
 *
 * RIGID physics, not delicate: a 1-frame impact jolt on the intact pane,
 * then shards exit the viewport COMPLETELY (travel scales past 100vh),
 * rotating ±40–70°, opacity held ≈1 until the final 30% of flight (glass
 * leaves, it doesn't fade). Radial stagger from the tap point preserved.
 *
 * Fallbacks: capture failure/timeout (700ms) → tinted-shard overlay (the
 * previous behavior). prefers-reduced-motion → plain navigation, no effect.
 * GPU budget unchanged: 70 layers, transform + opacity only.
 */

import React, { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

const FLAG = "shuru.shatter";
const COLS = 5;
const ROWS = 7;
const CAPTURE_TIMEOUT_MS = 700;

export type ShatterTint = "cream" | "slate";

// bitmap handoff across SPA navigation — module memory, consumed once
let snapshot: { url: string; w: number; h: number } | null = null;

export function breakTo(
  router: { push: (h: string) => void },
  href: string,
  opts?: { x?: number; y?: number; tint?: ShatterTint }
) {
  if (typeof window === "undefined") {
    router.push(href);
    return;
  }
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    router.push(href);
    return;
  }

  const arm = () => {
    try {
      window.sessionStorage.setItem(
        FLAG,
        JSON.stringify({
          x: opts?.x ?? window.innerWidth / 2,
          y: opts?.y ?? window.innerHeight / 2,
          tint: opts?.tint ?? "cream",
        })
      );
    } catch {
      /* storage unavailable → still navigate; portal just won't play */
    }
    router.push(href);
  };

  void (async () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const capture = (async (): Promise<string | null> => {
      try {
        const { default: html2canvas } = await import("html2canvas");
        const canvas = await html2canvas(document.body, {
          x: window.scrollX,
          y: window.scrollY,
          width: w,
          height: h,
          scale: 1,
          backgroundColor: "#F4E9D8",
          logging: false,
        });
        return canvas.toDataURL("image/jpeg", 0.85);
      } catch {
        return null;
      }
    })();
    const timeout = new Promise<null>((r) =>
      window.setTimeout(() => r(null), CAPTURE_TIMEOUT_MS)
    );
    const url = await Promise.race([capture, timeout]);
    snapshot = url ? { url, w, h } : null;
    arm();
  })();
}

// deterministic pseudo-random in [0,1)
function prand(i: number, salt: number): number {
  const n = Math.imul(i + 1, 2654435761) ^ Math.imul(salt + 1, 40503);
  return ((n >>> 8) % 1000) / 1000;
}

export type Shard = {
  clip: string; // polygon(...)
  cx: number; // centroid % of viewport
  cy: number;
  shade: number;
};

/** Jittered vertex grid → two triangles per cell = irregular "glass". */
export function buildShards(): Shard[] {
  const px: number[][] = [];
  const py: number[][] = [];
  for (let r = 0; r <= ROWS; r++) {
    px[r] = [];
    py[r] = [];
    for (let c = 0; c <= COLS; c++) {
      const jx = (prand(r * 31 + c, 7) - 0.5) * (100 / COLS) * 0.7;
      const jy = (prand(r * 17 + c, 13) - 0.5) * (100 / ROWS) * 0.7;
      px[r][c] =
        c === 0 ? 0 : c === COLS ? 100 : Math.min(99, Math.max(1, (c * 100) / COLS + jx));
      py[r][c] =
        r === 0 ? 0 : r === ROWS ? 100 : Math.min(99, Math.max(1, (r * 100) / ROWS + jy));
    }
  }
  const shards: Shard[] = [];
  const tri = (a: number[], b: number[], c: number[], i: number) => {
    shards.push({
      clip: `polygon(${a[0]}% ${a[1]}%, ${b[0]}% ${b[1]}%, ${c[0]}% ${c[1]}%)`,
      cx: (a[0] + b[0] + c[0]) / 3,
      cy: (a[1] + b[1] + c[1]) / 3,
      shade: Math.floor(prand(i, 29) * 3),
    });
  };
  let i = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const tl = [px[r][c], py[r][c]];
      const tr = [px[r][c + 1], py[r][c + 1]];
      const bl = [px[r + 1][c], py[r + 1][c]];
      const br = [px[r + 1][c + 1], py[r + 1][c + 1]];
      if ((r + c) % 2 === 0) {
        tri(tl, tr, br, i++);
        tri(tl, br, bl, i++);
      } else {
        tri(tr, bl, tl, i++);
        tri(tr, br, bl, i++);
      }
    }
  }
  return shards;
}

const TINTS: Record<ShatterTint, string[]> = {
  cream: ["#F4E9D8", "#FBF4E6", "#EADDC6"],
  slate: ["#1E2233", "#2A3047", "#171B2A"],
};

type PortalState = {
  phase: "intact" | "breaking";
  x: number;
  y: number;
  tint: ShatterTint;
  snap: { url: string; w: number; h: number } | null;
};

/**
 * Wrap a layout's children in this. It renders the shatter on arrival AND
 * gives the destination its scale-up "arriving" reveal.
 */
export function ShatterPortal({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [state, setState] = useState<PortalState | null>(null);

  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = window.sessionStorage.getItem(FLAG);
      if (raw) window.sessionStorage.removeItem(FLAG);
    } catch {
      raw = null;
    }
    const snap = snapshot;
    snapshot = null; // consume once
    if (!raw) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    let tint: ShatterTint = "cream";
    try {
      const p = JSON.parse(raw) as { x: number; y: number; tint: ShatterTint };
      x = p.x;
      y = p.y;
      tint = p.tint === "slate" ? "slate" : "cream";
    } catch {
      /* defaults stand */
    }

    setState({ phase: "intact", x, y, tint, snap });
    // intact pane takes the impact jolt (~110ms), then fractures
    const t1 = window.setTimeout(
      () => setState((s) => (s ? { ...s, phase: "breaking" } : s)),
      120
    );
    const t2 = window.setTimeout(() => setState(null), 1300);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [pathname]);

  const shards = useMemo(buildShards, []);

  const vw = typeof window !== "undefined" ? window.innerWidth : 390;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const tapX = state ? (state.x / vw) * 100 : 50;
  const tapY = state ? (state.y / vh) * 100 : 50;

  return (
    <>
      <div className={state ? "world-enter" : undefined}>{children}</div>

      {state && (
        <div
          aria-hidden
          className={
            "pointer-events-none fixed inset-0 z-[60] overflow-hidden" +
            (state.phase === "intact" ? " shatter-jolt" : "")
          }
        >
          {shards.map((s, i) => {
            const dx = s.cx - tapX;
            const dy = s.cy - tapY;
            const dist = Math.hypot(dx, dy); // 0..~110
            const len = Math.max(0.0001, dist);
            // RIGID: shards fully exit the viewport
            const fly = 70 + dist * 0.9;
            const fx = (dx / len) * fly;
            const fy = (dy / len) * fly + 25; // gravity bias
            const rot = (prand(i, 41) > 0.5 ? 1 : -1) * (40 + prand(i, 61) * 30);
            const delay = Math.min(260, dist * 2.4 + prand(i, 53) * 40);
            const breaking = state.phase === "breaking";
            const bitmap = state.snap;
            return (
              <div
                key={i}
                className="absolute inset-0"
                style={{
                  clipPath: s.clip,
                  ...(bitmap
                    ? {
                        backgroundImage: `url(${bitmap.url})`,
                        backgroundSize: `${bitmap.w}px ${bitmap.h}px`,
                        backgroundPosition: "0 0",
                        backgroundRepeat: "no-repeat",
                      }
                    : { background: TINTS[state.tint][s.shade] }),
                  // glass leaves, it doesn't fade: opacity only in the last ~30%
                  transition: `transform 750ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms, opacity 230ms linear ${delay + 520}ms`,
                  transform: breaking
                    ? `translate(${fx}vw, ${fy}vh) rotate(${rot}deg) scale(0.9)`
                    : "translate(0, 0) rotate(0deg) scale(1)",
                  opacity: breaking ? 0 : 1,
                  willChange: "transform, opacity",
                }}
              />
            );
          })}

          {/* molten bloom at the tap point */}
          <div
            className="shatter-flash absolute"
            style={{ left: `${tapX}%`, top: `${tapY}%` }}
          />
        </div>
      )}
    </>
  );
}

export default ShatterPortal;
