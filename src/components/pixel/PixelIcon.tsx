/**
 * The app's icon set. All icons inherit currentColor so they recolour with
 * text. NEVER emoji.
 *
 * These were hand-plotted rectangles on a 12×12 grid — literal pixel art,
 * with `shapeRendering="crispEdges"` to keep the steps hard. They are stroked
 * paths on a 24-unit grid now, which is what lets them stay legible at the
 * 22-30px nav sizes where the bitmap versions were most obviously blocky.
 *
 * The `IconName` union and the props are unchanged; 23 names are imported
 * across the app and every call site keeps working.
 */

import React from "react";

export type IconName =
  | "sun"
  | "radar"
  | "bookmark"
  | "vault"
  | "user"
  | "check"
  | "warn"
  | "search"
  | "clock"
  | "x"
  | "arrow-right"
  | "signal"
  | "hammer"
  | "chevron"
  | "eye"
  | "upload"
  | "download"
  | "undo"
  | "redo"
  | "edit"
  | "spark"
  | "arrow-up"
  | "arrow-down";

/*
 * Path data on a 24×24 grid, drawn to be stroked rather than filled — a
 * single consistent stroke weight is what makes a set read as one family.
 * `sun` is the one exception: its disc is filled, to match the brand mark.
 */
const ICONS: Record<IconName, { d: string; fill?: string }[]> = {
  sun: [
    { d: "M12 3v2M5.6 5.6l1.4 1.4M3 12h2M19 12h2M17 7l1.4-1.4" },
    { d: "M7 15a5 5 0 0 1 10 0Z", fill: "currentColor" },
    { d: "M3 18h18" },
  ],
  radar: [
    { d: "M4 4h4M4 4v4M20 4h-4M20 4v4M4 20h4M4 20v-4M20 20h-4M20 20v-4" },
    { d: "M12 12h.01" },
    { d: "M12 12l4-2.5" },
  ],
  bookmark: [{ d: "M6 3h12v18l-6-4.5L6 21Z" }],
  vault: [
    { d: "M4 4h16v16H4Z" },
    { d: "M12 12h.01" },
    { d: "M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" },
  ],
  user: [
    { d: "M12 4a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" },
    { d: "M4.5 20a7.5 7.5 0 0 1 15 0" },
  ],
  check: [{ d: "M4 12.5 9.5 18 20 6.5" }],
  warn: [
    { d: "M12 3.5 22 20H2Z" },
    { d: "M12 10v4M12 17h.01" },
  ],
  search: [
    { d: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z" },
    { d: "M16.5 16.5 21 21" },
  ],
  clock: [
    { d: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z" },
    { d: "M12 7v5.2l3.4 2" },
  ],
  x: [{ d: "M5 5l14 14M19 5 5 19" }],
  "arrow-right": [{ d: "M4 12h15M13 6l6 6-6 6" }],
  signal: [{ d: "M4 20v-4M10 20v-8M16 20v-12M22 20V4" }],
  hammer: [
    { d: "M14 3 21 10l-3 3-7-7Z" },
    { d: "M11.5 8.5 3 17v4h4l8.5-8.5" },
  ],
  chevron: [{ d: "M9 5l7 7-7 7" }],
  eye: [
    { d: "M2 12s3.8-6.5 10-6.5S22 12 22 12s-3.8 6.5-10 6.5S2 12 2 12Z" },
    { d: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" },
  ],
  upload: [
    { d: "M12 16V4M7 9l5-5 5 5" },
    { d: "M4 20h16" },
  ],
  download: [
    { d: "M12 4v12M7 11l5 5 5-5" },
    { d: "M4 20h16" },
  ],
  undo: [
    { d: "M4 9h11a5 5 0 0 1 0 10h-6" },
    { d: "M8 5 4 9l4 4" },
  ],
  redo: [
    { d: "M20 9H9a5 5 0 0 0 0 10h6" },
    { d: "M16 5l4 4-4 4" },
  ],
  edit: [
    { d: "M4 20h4L19 9l-4-4L4 16Z" },
    { d: "M14 6l4 4" },
  ],
  spark: [{ d: "M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2Z" }],
  "arrow-up": [{ d: "M12 20V5M6 11l6-6 6 6" }],
  "arrow-down": [{ d: "M12 4v15M6 13l6 6 6-6" }],
};

export function PixelIcon({
  name,
  size = 14,
  className,
  title,
}: {
  name: IconName;
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      /*
       * Scaled stroke: these render anywhere from 9px to 30px, and a fixed
       * width that reads correctly in a 22px nav icon turns a 9px badge glyph
       * into a solid blob. 2 units at 24px, easing heavier as they shrink.
       */
      strokeWidth={size <= 12 ? 2.4 : size <= 16 ? 2.1 : 1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      {ICONS[name].map((p, i) => (
        <path key={i} d={p.d} fill={p.fill ?? "none"} />
      ))}
    </svg>
  );
}

export default PixelIcon;
