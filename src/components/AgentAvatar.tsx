"use client";

import React from "react";
import { cx } from "@/lib/cx";

/**
 * The agent's familiar — a small pixel orb that idles (slow bob + occasional
 * hard blink) and, while it thinks, shows a blinking ▮. `materialize` runs the
 * dithered-particle assembly used by the CRT reveal. All motion is disabled
 * under prefers-reduced-motion (globals.css).
 */
export function AgentAvatar({
  size = 40,
  materialize = false,
  thinking = false,
  className,
}: {
  size?: number;
  materialize?: boolean;
  thinking?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cx("relative shrink-0", materialize && "avatar-materialize", className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg
        viewBox="0 0 16 16"
        width={size}
        height={size}
        shapeRendering="crispEdges"
        className="avatar-bob"
      >
        {/* body — phosphor amber orb */}
        <g fill="#FFB454">
          <rect x="4" y="2" width="8" height="2" />
          <rect x="2" y="4" width="12" height="8" />
          <rect x="4" y="12" width="8" height="2" />
        </g>
        {/* subtle inner shade for depth (hard-edged, no gradient) */}
        <rect x="4" y="10" width="8" height="2" fill="#E89B36" />
        {/* eyes — blink group */}
        <g className="avatar-blink" fill="#071410">
          <rect x="5" y="6" width="2" height="3" />
          <rect x="9" y="6" width="2" height="3" />
        </g>
        {/* mouth */}
        <rect x="6" y="10" width="4" height="1" fill="#071410" />
      </svg>

      {thinking && (
        <span className="pixel-blink absolute -right-1 -top-1 font-mono text-xs font-bold text-amber">
          ▮
        </span>
      )}
    </div>
  );
}

export default AgentAvatar;
