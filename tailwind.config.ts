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
        alert: "#E5533D", // closing-very-soon / borderline — AS A FILL

        /*
         * TEXT-ON-LIGHT variants. Read this before reaching for `text-amber`
         * or `text-alert`.
         *
         * `amber` and `alert` are tuned as FILLS — `bg-amber text-ink` is
         * high-contrast and correct, and `text-amber` on the dark forge and
         * terminal surfaces is fine too. But as text on `cream` / `paper`
         * they measure 2.16:1 and 3.10:1, well under the 4.5:1 WCAG AA needs.
         *
         * These two are the same hues pushed dark enough to pass on both
         * light backgrounds (amberInk 4.75:1 / 5.21:1, alertInk 4.92:1 /
         * 5.40:1). Use them wherever the colour is the TEXT and the surface
         * is light; keep `amber` / `alert` for fills and for dark surfaces.
         *
         * `grey` was darkened from #8A8578 for the same reason — it measured
         * 3.07:1 on cream. It is only ever secondary text or a muted fill,
         * and darkening improved BOTH directions (cream-on-grey went 3.07 ->
         * 4.77), so it needed no split.
         */
        amberInk: "#B4400F",
        alertInk: "#B33A28",
        // ── Resume Forge "new world" palette (same family, deeper world) ──
        fslate: "#1E2233",  // forge background
        fpanel: "#2A3047",  // forge raised surface
        fedge: "#0C0F1A",   // forge borders/shadows
        fwhite: "#EDEAF2",  // forge text
        famber: "#FF9E45",  // molten forge glow (primary accent)
        fviolet: "#7C6FF0", // cool secondary accent
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
