/**
 * PAYMENT BRAND MARKS.
 *
 * Inline SVG, one component per scheme, so a payment method tile shows the
 * mark a payer actually recognises instead of the word "Card". Inline rather
 * than <img> for three reasons that all matter here: the CSP on this app
 * blocks external hosts, a mark that arrives late makes a payment screen look
 * broken while it loads, and the marks have to scale crisply at 20px.
 *
 * These are third-party trademarks, reproduced unmodified and used only to
 * identify which payment method a tile selects -- nominative use, which is
 * what a checkout is for. They are NOT endorsements, and this deployment
 * moves no money through any of them: see lib/payments/methods.ts.
 *
 * -- Sizing ---------------------------------------------------------------
 * Every mark renders at a fixed HEIGHT and lets width follow its own aspect
 * ratio, because that is what makes a row of logos look level. Their natural
 * ratios differ by more than 3x (Mastercard is nearly square, bKash is very
 * wide), so a shared box would either crop the wide ones or strand the square
 * ones in whitespace. `height` is the only size prop for that reason.
 *
 * Each mark is aria-hidden and carries no title: the tile next to it already
 * has a real text label, and a second announcement of "Visa" is noise to a
 * screen reader. A mark used WITHOUT adjacent text needs its own label at the
 * call site.
 */

import React, { useId } from "react";

/**
 * -- A note on the viewBoxes -------------------------------------------------
 *
 * Every one of these was retightened to the mark's actual ink. The source
 * assets ship a viewBox that is roughly a third empty padding, measured with
 * getBBox() in a browser: bKash drew into 48% of its declared height and the
 * rest into 67%. At a shared `height` prop that makes the logos render at
 * about two thirds the size they are asked for, and by different amounts each
 * -- so a row of them looks both undersized and unevenly aligned, which is
 * exactly what it looked like.
 *
 * Visa's box could not be measured the same way: getBBox() on a clipped
 * element reports the geometry BEFORE the clip, so it returned bounds larger
 * than the visible mark. Its box is the clip path's own extent put through the
 * matrix transform below it.
 */

type MarkProps = {
  /** Rendered height in px. Width follows the mark's own aspect ratio. */
  height?: number;
  className?: string;
};

function svgProps(height: number, viewBox: string, className?: string) {
  return {
    viewBox,
    role: "presentation" as const,
    "aria-hidden": true,
    focusable: "false" as const,
    // width:auto is what actually lets the aspect ratio drive the box; without
    // it a parent flex rule can square the element off.
    style: { height, width: "auto" as const },
    className,
  };
}

/**
 * Visa. The wordmark is a clip path filled by a gradient, which is how the
 * official asset is drawn -- the letterforms are the hole, not the ink.
 *
 * The ids are generated per instance with useId. Two Visa marks on one page
 * would otherwise emit duplicate ids, and a duplicate id is not merely untidy
 * here: url(#a) resolves to whichever came first, so the second mark silently
 * borrows the first one geometry.
 */
export function VisaMark({ height = 20, className }: MarkProps) {
  const uid = useId();
  const clip = `visa-clip-${uid}`;
  const grad = `visa-grad-${uid}`;

  return (
    <svg
      {...svgProps(height, "8 -3 501 173", className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient
          id={grad}
          x1="0"
          y1="0"
          x2="1"
          y2="0"
          gradientUnits="userSpaceOnUse"
          gradientTransform="scale(89.72793 -89.72793) rotate(-20.218 .966 -.457)"
          spreadMethod="pad"
        >
          <stop offset="0" stopColor="#222357" />
          <stop offset="1" stopColor="#254aa5" />
        </linearGradient>
        <clipPath id={clip} clipPathUnits="userSpaceOnUse">
          <path d="M413.742 90.435c-.057-4.494 4.005-7.002 7.065-8.493 3.144-1.53 4.2-2.511 4.188-3.879-.024-2.094-2.508-3.018-4.833-3.054-4.056-.063-6.414 1.095-8.289 1.971l-1.461-6.837c1.881-.867 5.364-1.623 8.976-1.656 8.478 0 14.025 4.185 14.055 10.674.033 8.235-11.391 8.691-11.313 12.372.027 1.116 1.092 2.307 3.426 2.61 1.155.153 4.344.27 7.959-1.395l1.419 6.615c-1.944.708-4.443 1.386-7.554 1.386-7.98 0-13.593-4.242-13.638-10.314m34.827 9.744c-1.548 0-2.853-.903-3.435-2.289l-12.111-28.917h8.472l1.686 4.659h10.353l.978-4.659h7.467l-6.516 31.206h-6.894m1.185-8.43l2.445-11.718h-6.696l4.251 11.718m-46.284 8.43l-6.678-31.206h8.073l6.675 31.206h-8.07m-11.943 0l-8.403-21.24-3.399 18.06c-.399 2.016-1.974 3.18-3.723 3.18h-13.737l-.192-.906c2.82-.612 6.024-1.599 7.965-2.655 1.188-.645 1.527-1.209 1.917-2.742l6.438-24.903h8.532l13.08 31.206h-8.478" />
        </clipPath>
      </defs>
      <g
        clipPath={`url(#${clip})`}
        transform="matrix(4.98469 0 0 -4.98469 -1804.82 502.202)"
      >
        <path
          d="M0 0l98.437 36.252 22.394-60.809-98.436-36.252"
          fill={`url(#${grad})`}
          transform="translate(351.611 96.896)"
        />
      </g>
    </svg>
  );
}

/** Mastercard. The two discs and their overlap; no wordmark. */
export function MastercardMark({ height = 20, className }: MarkProps) {
  return (
    <svg
      {...svgProps(height, "-8 -8 656 412", className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path fill="#ff5f00" d="M224.833 42.298h190.416v311.005H224.833z" />
      <path
        fill="#eb001b"
        d="M244.446 197.828a197.448 197.448 0 0175.54-155.475 197.777 197.777 0 100 311.004 197.448 197.448 0 01-75.54-155.53z"
      />
      <path
        fill="#f79e1b"
        d="M621.101 320.394v-6.372h2.747v-1.319h-6.537v1.319h2.582v6.373zm12.691 0v-7.69h-1.978l-2.307 5.493-2.308-5.494h-1.977v7.691h1.428v-5.823l2.143 5h1.483l2.143-5v5.823z"
      />
      <path
        fill="#f79e1b"
        d="M640 197.828a197.777 197.777 0 01-320.015 155.474 197.777 197.777 0 000-311.004A197.777 197.777 0 01640 197.773z"
      />
    </svg>
  );
}

/** Google Pay -- the four-colour G with the "Pay" wordmark. */
export function GooglePayMark({ height = 20, className }: MarkProps) {
  return (
    <svg
      {...svgProps(height, "-6 -6 448 185", className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="#5f6368"
        d="M206.197 84.585v50.75h-16.1V10.005h42.7a38.61 38.61 0 0127.65 10.85 34.88 34.88 0 0111.55 26.45 34.72 34.72 0 01-11.55 26.6q-11.2 10.68-27.65 10.67h-26.6zm0-59.15v43.75h27a21.28 21.28 0 0015.93-6.48 21.36 21.36 0 000-30.63 21 21 0 00-15.93-6.65h-27zm102.9 21.35q17.85 0 28.18 9.54 10.33 9.54 10.32 26.16v52.85h-15.4v-11.9h-.7q-10 14.7-26.6 14.7-14.17 0-23.71-8.4a26.82 26.82 0 01-9.54-21q0-13.31 10.06-21.17 10.06-7.86 26.86-7.88 14.34 0 23.62 5.25v-3.68a18.33 18.33 0 00-6.65-14.25 22.8 22.8 0 00-15.54-5.87q-13.49 0-21.35 11.38l-14.18-8.93q11.7-16.8 34.63-16.8zm-20.83 62.3a12.86 12.86 0 005.34 10.5 19.64 19.64 0 0012.51 4.2 25.67 25.67 0 0018.11-7.52q8-7.53 8-17.67-7.53-6-21-6-9.81 0-16.36 4.73c-4.41 3.2-6.6 7.09-6.6 11.76zm147.73-59.5l-53.76 123.55h-16.62l19.95-43.23-35.35-80.32h17.5l25.55 61.6h.35l24.85-61.6z"
      />
      <path
        fill="#4285f4"
        d="M141.137 73.645a85.79 85.79 0 00-1.24-14.64h-67.9v27.73h38.89a33.33 33.33 0 01-14.38 21.88v18h23.21c13.59-12.53 21.42-31.06 21.42-52.97z"
      />
      <path
        fill="#34a853"
        d="M71.997 144.005c19.43 0 35.79-6.38 47.72-17.38l-23.21-18c-6.46 4.38-14.78 6.88-24.51 6.88-18.78 0-34.72-12.66-40.42-29.72H7.667v18.55a72 72 0 0064.33 39.67z"
      />
      <path
        fill="#fbbc04"
        d="M31.577 85.785a43.14 43.14 0 010-27.56v-18.55H7.667a72 72 0 000 64.66z"
      />
      <path
        fill="#ea4335"
        d="M71.997 28.505a39.09 39.09 0 0127.62 10.8l20.55-20.55A69.18 69.18 0 0071.997.005a72 72 0 00-64.33 39.67l23.91 18.55c5.7-17.06 21.64-29.72 40.42-29.72z"
      />
    </svg>
  );
}

/** bKash -- the folded-ribbon mark with its wordmark. */
export function BkashMark({ height = 20, className }: MarkProps) {
  return (
    <svg
      {...svgProps(height, "-4 -4 255 121", className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path fill="#d12053" d="M223.66 62.45l-53.03-8.31 7.03 31.6z" />
      <path fill="#e2136e" d="M223.66 62.45L183.7 6.93l-13.06 47.22z" />
      <path fill="#d12053" d="M169.4 53.51L127.53 0l54.83 6.55z" />
      <path fill="#9e1638" d="M150.33 31.15L127.08 9.24h6.12z" />
      <path fill="#d12053" d="M234.97 35.46l-9.84 26.69-15.95-22.06z" />
      <path fill="#e2136e" d="M183.85 84.14l38.61-15.51 1.62-4.93z" />
      <path fill="#9e1638" d="M152.97 113.41l16.54-58.02 8.39 37.75z" />
      <path fill="#e2136e" d="M236.51 35.67l-4.06 11.02 14.64-.24z" />
      <path
        fill="#e2136e"
        d="M.01 40.09c.71.06 1.43.19 2.19.19s1.38-.13 2.19-.19v23.47c2.31-3.93 5.22-6.52 9.5-6.52 7.74 0 11.06 7.66 11.06 14.7 0 8.43-4.5 16.5-12.39 16.5a8.66 8.66 0 01-7.77-4.47c-1.32 1.16-2.49 2.55-3.74 3.81h-1zm4.28 34.52c0 6.84 2.9 11.61 7.67 11.61 6.19 0 8.18-8.32 8.18-14.22 0-6.85-2.26-12.24-7.62-12.3-6.26-.05-8.23 7.36-8.23 14.92"
      />
      <path
        fill="#231f20"
        d="M45.14 55.27l-4.66 6c4.38 6.4 8.92 12.67 13.32 19.15l4.44 7v.35c-1.09-.07-2.08-.21-3-.21-.92 0-2.08.14-3.06.21-1.21-2.24-2.41-4.31-3.78-6.34l-12-17.75c-.27-.28-.92-.5-.92-.21v24.3c-.88-.07-1.65-.21-2.41-.21-.76 0-1.64.14-2.41.21V40.09c.77.06 1.6.21 2.41.21s1.53-.15 2.41-.21v21.52c0 .42.82.14 1.36-.42a37.1 37.1 0 002.92-3.42l13.49-17.7c.71.06 1.42.21 2.19.21s1.36-.15 2.14-.21z"
      />
      <path
        fill="#231f20"
        d="M81.43 82.4c0 2.48-.16 3.74 3.07 2.92v1.39a8.87 8.87 0 01-1.65.63c-2.85.57-5.21.06-5.65-3.67l-.49.55a10.17 10.17 0 01-8.12 4c-3.88 0-7.28-3.06-7.28-7.75 0-7.23 5-8.18 10.13-9.13 4.34-.82 5.82-1.2 5.82-4.25 0-4.7-2.3-7.42-6.41-7.42a6.85 6.85 0 00-6.52 4.37h-.6v-3.52a14.2 14.2 0 018.87-3.48c5.75 0 8.88 3.48 8.88 10.65zm-4.38-10.47l-1.93.44c-3.73.82-9.32 1.45-9.32 7.24 0 4 2 6 5.36 6a6.83 6.83 0 004.44-2.44c.4-.46 1.5-1.54 1.5-2z"
      />
      <path
        fill="#231f20"
        d="M91.2 81.56c1.3 2.49 3.72 4.72 6.3 4.72a5.67 5.67 0 005.38-5.78c0-8.56-12.95-3-12.95-14.08 0-6.08 4-9.37 8.93-9.37a11.57 11.57 0 016.2 1.64 32.79 32.79 0 00-1.3 4.5h-.5c-.72-2.09-2.63-4.19-4.66-4.19-2.74 0-5 1.85-5 5.28 0 8.11 12.95 3.79 12.95 13.94 0 6.79-5.26 10-10.1 10a12.73 12.73 0 01-6.84-2 34.42 34.42 0 001.15-4.65z"
      />
      <path
        fill="#231f20"
        d="M113.93 40.09c.73.06 1.44.19 2.2.19.76 0 1.38-.13 2.2-.19v23.09c1.92-3.87 4.93-6.14 8.83-6.14 6.36 0 8.83 4.36 8.83 12.36v18.37c-.83-.07-1.47-.19-2.2-.19-.73 0-1.48.13-2.2.19V70.85c0-7-1.41-10.53-6.08-10.53-4.94 0-7.18 3.56-7.18 10.15v17.3c-.82-.07-1.47-.19-2.2-.19-.73 0-1.46.13-2.2.19z"
      />
    </svg>
  );
}

/** Nagad -- the ring device with its wordmark. */
export function NagadMark({ height = 20, className }: MarkProps) {
  return (
    <svg
      {...svgProps(height, "-5 -5 310 141", className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <g transform="translate(-1266.194 -110.295) scale(2.59472)">
        <g transform="translate(481.988 41.407)">
          <path
            fill="#ed1c24"
            d="M80.6 20.7H60.4c-.4 0-.6.3-.6.6v1.6c0 .4.3.6.6.6h15.1v8.4c-.4-.6-.9-1.2-1.4-1.8-1.8-1.8-3.7-2.7-5.7-2.7-1.6 0-2.9.8-4 2.2-.9 1.2-1.4 2.6-1.4 3.9 0 1.3.2 3 1.2 4.6 1.2 1.9 3.2 2.5 5 2.5 2.3 0 4.2-1.6 4.2-3.7 0-1.2-.6-2.2-1.7-2.9l-1.1-.6v1.8c-.1.5-.9 1.2-1.8 1.2-.8 0-1.5-.3-2-.8-.3-.3-.5-.9-.4-1.3 0-.6.2-1.1.6-1.6.5-.6 1-.9 1.8-.9 2 0 3.7.9 5.1 2.9 1.1 1.7 1.7 3.3 1.7 5.1V44l3 1.8c.1.1.2.1.3.1.4 0 .6-.3.6-.6V23.6h1.2c.4 0 .6-.3.6-.6v-1.6c0-.4-.3-.7-.7-.7z"
          />
          <path
            fill="#ed1c24"
            d="M121 20.7H95.4c-.4 0-.6.3-.6.6v2.8c-2.5-2.6-4.7-3.9-6.7-3.9-1.9 0-3.5.4-4.9 1.5-1.3 1-2.1 2.3-2.1 3.8 0 4.5 5 4.4 6.3 3.8.2-.1.5-.3.8-.3 1 0 1.4.8 1.4 1.5 0 1-1.5 1.9-3.3 1.9-1 0-1.6-.3-2-.9l-.8-1.2-.5 1.4c-.1.3-.3.7-.3 1.2 0 1 .5 2 1.5 2.9.9.8 2 1.2 3.2 1.2 1.9 0 3.5-.7 4.5-2.1.9-1.1 1.3-2.4 1.3-3.9 0-.8-.3-1.7-1-2.7-.8-1.2-1.8-1.8-2.9-1.8-.4 0-.9.1-1.4.3-.2.1-.6.2-.7.2-.2 0-.5-.1-.7-.4-.2-.2-.4-.5-.4-1 0-1.1 1-2.2 2.8-2.2h.1c1.2 0 2.4.6 3.5 1.7.9.9 1.6 1.8 2.2 2.8v15.9l3 1.8c.1.1.2.1.3.1.4 0 .6-.3.6-.6V23.6h4.6v13.9l3.6 1.5h.2c.3 0 .6-.2.6-.6v-.1c.6-4.1 2.4-6.9 5.4-8.6v.8c0 .6 0 2.1.1 2.9 0 .5 0 .8.1 1.1 0 1.6.2 4 .7 5.8 1 3.4 2.7 4.2 3.9 4.2h.1c.7 0 1.3-.2 1.7-.6.2-.2.5-.6.5-1.3 0-.6-.1-1.1-.3-1.5l-.3-.5-.6.1c-.6.2-.9.2-.9.1h-.1c-.2 0-.2 0-.3-.1-.2-.1-.6-.4-.9-1.5-.2-.8-.3-1.9-.3-2.5 0-4.5.9-7.9 2.4-8.6h.1c.2-.1.4-.3.4-.6 0-.1 0-.2-.1-.3v-.1c-.7-1.4-2.2-2.4-4.2-2.9h-.4c-1.6.3-3.5 1.4-5.9 3.4-.6.5-1.2 1-1.7 1.5v-5.5h14c.4 0 .6-.3.6-.6v-1.6c.1-.4-.2-.7-.6-.7z"
          />
          <path
            fill="#ed1c24"
            d="M53.2 28.1c0 .7 0 1.3-.1 1.9-.2 2.8-.9 5.4-2 7.8-.4 1-.9 1.9-1.5 2.8-4.2 6.6-11.6 11-20 11-3.6 0-7-.8-10-2.2C11.6 45.7 6 37.5 6 28.1 6 18.8 11.4 10.8 19.1 7c-.6.8-1.2 1.6-1.7 2.5 0 .1-.1.1-.1.2-.3.3-.6.5-.9.8-.4.3-.7.7-1.1 1l-.2.2-.2.2c-.1.1-.2.3-.4.4-.2.3-.5.6-.7.9-1 1.3-1.8 2.7-2.4 4.2-.1.1-.1.3-.2.4-.1.2-.1.4-.2.5 0 .1-.1.2-.1.3-.1.3-.2.5-.3.8-.1.2-.1.4-.2.5 0 .1-.1.2-.1.3 0 .2-.1.4-.1.6l-.3 1.8c0 .2 0 .3-.1.5v2.4c0 6.4 2.9 12.2 7.6 15.9 3.6 2.9 8.1 4.7 13 4.7 4.5 0 8.6-1.4 12-3.9 2.5-1.8 4.5-4.1 6-6.8.2-.4.4-.7.6-1.1 1.2-2.5 1.9-5.2 1.9-8.1v-.7c0-.7 0-1.3-.1-2l.1.1c.3.3.6.5.9.8.3-.5.6-.9.9-1.4.2.9.3 1.8.4 2.8.1.9.1 1.6.1 2.3z"
          />
          <path
            fill="#f7941d"
            d="M32.4 9.2L28 1.1c-7.3 3.3-12.3 10.6-12.3 19.1 0 4.3 1.3 8.3 3.5 11.6-.2-1.1-.2-2.2-.2-3.4.1-8.7 5.6-16.1 13.4-19.2z"
          />
          <path
            fill="#ed1c24"
            d="M35.9 13.2c1.8-.5 3.8-.7 5.7-.7 1.2 0 2.5.1 3.6.3l-.1-3.6-.2-7.2c-.8-.1-1.7-.2-2.6-.2-4 0-7.7 1.3-10.7 3.4L34 9.6c-4.3 1.5-7.8 4.5-10 8.4-1.1 1.9-1.9 4.1-2.2 6.4.6-1.2 1.3-2.3 2.1-3.3 2.9-3.8 7.1-6.7 12-7.9z"
          />
          <path
            fill="#f7941d"
            d="M46.4 9.1l.2 5.1c-1.7-.5-3.4-.8-5.3-.8-3.5 0-6.8 1-9.7 2.7-3.6 2.2-6.4 5.7-7.8 9.8 1.4-1.9 3.1-3.6 5.1-4.9 2.9-1.9 6.4-3 10.1-3 2.8 0 5.4.6 7.8 1.7 1.8.8 3.4 1.9 4.8 3.3l2.8-4.2 3.6-5.5c-3.2-2.6-7.2-4.2-11.6-4.2z"
          />
          <path
            fill="#f7941d"
            d="M50.9 25.7v.7c0 4.2-1.7 7.7-1.9 8.1-.2.4-.4.7-.6 1.1-1.5 2.7-3.5 5-6 6.8-3.4 2.4-7.5 3.9-12 3.9-4.9 0-9.5-1.7-13-4.7-4.6-3.8-7.6-9.5-7.6-15.9v-2.4c0-.2 0-.3.1-.5l.3-1.8c0-.2.1-.4.1-.6 0-.1.1-.2.1-.3.1-.2.1-.4.2-.5.1-.3.2-.6.3-.8 0-.1.1-.2.1-.3.1-.2.1-.4.2-.5.1-.1.1-.3.2-.4.6-1.5 1.5-2.9 2.4-4.2.2-.3.5-.6.7-.9.1-.1.2-.3.4-.4.1-.1.1-.2.2-.2.1-.1.1-.2.2-.2.3-.4.7-.7 1.1-1 .3-.3.6-.5.9-.8 0 .1-.1.1-.1.2s-.1.2-.1.2c-1.2 2.4-2 5.3-2.3 8.3-.1.8-.1 1.6-.1 2.5 0 10.8 6.3 19.5 14.1 19.5h.8c1.1 0 2.2-.2 3.3-.4 5.3-1.4 9.2-6.3 9.2-12v-.3c-.1-3.4-1.5-6.5-3.8-8.6 1.6 0 3.2.3 4.7.7 2.9.7 5.5 2.1 7.8 3.9l.1.1c-.1.4 0 1.1 0 1.7z"
          />
        </g>
      </g>
    </svg>
  );
}

/**
 * Rocket (Dutch-Bangla Bank).
 *
 * No official asset was supplied for this one, and inventing a lookalike is
 * worse than not drawing it: a mark that is nearly right is exactly the kind
 * of thing a payer half-recognises and trusts. This is a deliberately
 * typographic lettermark in the scheme's purple, not an imitation of the real
 * logo. Swap it for the genuine asset when there is one.
 */
export function RocketMark({ height = 20, className }: MarkProps) {
  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        height,
        display: "inline-flex",
        alignItems: "center",
        paddingInline: height * 0.34,
        borderRadius: height * 0.22,
        background: "#8B2E8B",
        color: "#FFFFFF",
        fontSize: height * 0.56,
        fontWeight: 700,
        letterSpacing: "-0.01em",
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      Rocket
    </span>
  );
}
