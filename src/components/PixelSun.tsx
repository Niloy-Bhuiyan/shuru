import React from "react";

/**
 * The rising-sun mark.
 *
 * Was drawn as stacked rectangles — literal pixel art. It is the same mark,
 * redrawn as a smooth arc: "shuru" means beginning, and a sun coming up over
 * the horizon is the whole idea, so the concept survived the change of
 * clothes. The viewBox and aspect ratio are unchanged, so every layout that
 * sized it still reserves exactly the same space.
 *
 * The filename and props are kept because nine files import it.
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
      className={className}
      aria-hidden
    >
      {/* Rays, set back from the disc so they read at small sizes. */}
      <g
        className={animated ? "sun-rays" : undefined}
        stroke="#EA580C"
        strokeWidth="3"
        strokeLinecap="round"
      >
        <path d="M40 4v7" />
        <path d="M14.5 15.5l5 5" />
        <path d="M65.5 15.5l-5 5" />
        <path d="M4 42h7" />
        <path d="M76 42h-7" />
      </g>

      {/* The disc rises out of the horizon rather than sitting on it, so it
          is drawn as a half-circle ending exactly on the line. */}
      <g className={animated ? "sun-idle" : undefined}>
        <path d="M18 44a22 22 0 0 1 44 0Z" fill="#EA580C" />
      </g>

      {withHorizon && (
        <path
          d="M2 45.5h76"
          stroke="#0F172A"
          strokeWidth="3"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

export default PixelSun;
