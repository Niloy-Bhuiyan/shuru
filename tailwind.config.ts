import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Shuru pixel palette — use by MEANING, never decoratively
        cream: "#F4E9D8", // backgrounds
        paper: "#FBF4E6", // raised card surface (one step lighter than cream)
        ink: "#1B2A3A",   // text, borders
        amber: "#FF7A3C", // primary actions, deadlines, urgency — AS A FILL
        mint: "#3FBFA0",  // positive: eligible / qualify / in-your-favour
        grey: "#6B6659",  // uncertainty / abstention / missing criteria
        alert: "#B33A28", // closing-very-soon / borderline warnings

        /*
         * TEXT-ON-LIGHT variants. Read this before reaching for `text-amber`
         * or `text-alert`.
         *
         * `amber` is tuned as a FILL — `bg-amber text-ink` is high-contrast
         * and correct, and `text-amber` on the dark forge and terminal
         * surfaces measures 5.63:1. But as text on `cream` / `paper` it is
         * 2.16:1, well under the 4.5:1 WCAG AA needs.
         *
         * `amberInk` is that hue pushed dark enough to pass on both light
         * backgrounds (4.75:1 on cream, 5.21:1 on paper). Use it wherever the
         * colour is the TEXT and the surface is light; keep `amber` for fills
         * and for dark surfaces.
         *
         * `grey` was darkened from #8A8578 for the same reason — it measured
         * 3.07:1 on cream. It is only ever secondary text or a muted fill,
         * and darkening improved BOTH directions (cream-on-grey went 3.07 ->
         * 4.77), so it needed no split.
         *
         * `alert` needed no split either, and that is worth explaining because
         * it looks inconsistent next to amber. It was #E5533D, which failed
         * BOTH ways: 3.10:1 as text on cream, and 3.10:1 for the `text-cream`
         * that sits on `bg-alert` in ~26 places. Both wanted a darker red, so
         * one darker value (#B33A28, 4.92:1 in both directions) fixes both.
         *
         * Amber cannot do that. Its fill role needs it BRIGHT — `text-ink` on
         * #FF7A3C is 5.63:1, but on #B4400F it collapses to 2.56:1. Bright
         * enough to carry dark text and dark enough to be read as text on
         * cream are mutually exclusive, which is why amber alone is split.
         */
        amberInk: "#B4400F",
        // ── Resume Forge "new world" palette (same family, deeper world) ──
        fslate: "#1E2233",  // forge background
        fpanel: "#2A3047",  // forge raised surface
        fedge: "#0C0F1A",   // forge borders/shadows
        fwhite: "#EDEAF2",  // forge text
        famber: "#FF9E45",  // molten forge glow (primary accent)
        // Cool secondary accent. Currently UNUSED — left in place as part of
        // the forge palette. Measures 4.05:1 on fslate, so darken the surface
        // or lighten this before using it as text.
        fviolet: "#7C6FF0",
      },
      fontFamily: {
        pixel: ["var(--font-pixel)", "monospace"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
        bangla: ["var(--font-bangla)", "sans-serif"],
      },
      boxShadow: {
        // Hard offset shadows ONLY. No blur, ever.
        "pixel-sm": "2px 2px 0 0 #1B2A3A",
        pixel: "4px 4px 0 0 #1B2A3A",
        "pixel-lg": "6px 6px 0 0 #1B2A3A",
        "pixel-amber": "4px 4px 0 0 #FF7A3C",
        "pixel-mint": "4px 4px 0 0 #3FBFA0",
        "pixel-none": "0 0 0 0 #1B2A3A",
      },
      borderWidth: {
        "3": "3px",
      },
      maxWidth: {
        app: "430px", // hard mobile frame; design baseline 390px
      },
    },
  },
  plugins: [],
};
export default config;
