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
        amber: "#FF7A3C", // primary actions, deadlines, urgency
        mint: "#3FBFA0",  // positive: eligible / qualify / in-your-favour
        grey: "#8A8578",  // uncertainty / abstention / missing criteria
        alert: "#E5533D", // closing-very-soon / borderline warnings
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
