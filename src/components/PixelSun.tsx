import React from "react";

/**
 * PixelSun — the signature rising-sun mark, drawn straight from the
 * design reference (stacked rect rows + mint horizon). Scales crisply.
 */
export function PixelSun({
  width = 60,
  animated = false,
  withHorizon = true,
  className,
}: {
  width?: number;
  animated?: boolean;
  withHorizon?: boolean;
  className?: string;
}) {
  const height = Math.round((width / 80) * 60);
  return (
    <svg
      viewBox="0 0 80 60"
      width={width}
      height={height}
      shapeRendering="crispEdges"
      className={className}
      aria-hidden
    >
      {/* rays (appear last, stepped) */}
      <g className={animated ? "sun-rays" : undefined} fill="#FF7A3C">
        <rect x="6" y="18" width="8" height="4" />
        <rect x="66" y="18" width="8" height="4" />
        <rect x="14" y="6" width="6" height="4" />
        <rect x="60" y="6" width="6" height="4" />
        <rect x="37" y="0" width="6" height="4" />
      </g>
      {/* sun body — clipped by the horizon so it truly RISES */}
      <g clipPath="url(#horizonClip)">
        <g className={animated ? "sun-idle" : undefined} fill="#FF7A3C">
          <rect x="32" y="8" width="16" height="8" />
          <rect x="26" y="16" width="28" height="8" />
          <rect x="22" y="24" width="36" height="8" />
          <rect x="20" y="32" width="40" height="8" />
          <rect x="20" y="40" width="40" height="8" />
          <rect x="22" y="48" width="36" height="6" />
        </g>
      </g>
      <clipPath id="horizonClip">
        <rect x="0" y="0" width="80" height="54" />
      </clipPath>
      {withHorizon && (
        <>
          <rect x="0" y="54" width="80" height="3" fill="#3FBFA0" />
          <rect x="0" y="57" width="80" height="3" fill="#1B2A3A" />
        </>
      )}
    </svg>
  );
}

export default PixelSun;
