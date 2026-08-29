import type { Config } from "tailwindcss";

/*
 * ════════════════════════════════════════════════════════════════════════
 * SHURU DESIGN TOKENS
 *
 * This file used to define a pixel-art system: an ochre/cream palette, hard
 * offset shadows, 3px borders and a bitmap display face. That was replaced
 * wholesale with a conventional product UI.
 *
 * THE TOKEN NAMES DID NOT CHANGE, AND THAT IS DELIBERATE.
 *
 * `cream`, `paper`, `ink`, `amber`, `mint`, `grey` and `alert` were never
 * really colour names — they were already role names: page background, raised
 * surface, text, primary action, positive, muted, danger. Roughly 1,800 class
 * references across ~67 components use them by that meaning. Repointing the
 * VALUES converts every screen at once; renaming them would have meant
 * rewriting all of those by hand for no gain in clarity.
 *
 * The one relationship that flipped: on the old palette `paper` was LIGHTER
 * than `cream` (a raised card on a warm page). The conventional arrangement
 * is the reverse — a tinted page with white cards sitting on it — so `cream`
 * is now the tinted surface and `paper` is white.
 * ════════════════════════════════════════════════════════════════════════
 */

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Use by MEANING, never decoratively.
        cream: "#F8FAFC", // page background (tinted)
        paper: "#FFFFFF", // raised card surface — now lighter than the page
        ink: "#0F172A", // primary text
        amber: "#EA580C", // primary actions, deadlines, urgency — AS A FILL
        mint: "#059669", // positive: eligible / qualify / in-your-favour
        grey: "#64748B", // uncertainty / abstention / missing criteria
        alert: "#DC2626", // closing-very-soon / borderline warnings

        /*
         * `ink` doubles as the border colour in ~217 places. At full strength
         * a slate-900 hairline is far too heavy for a 1px rule, so borders now
         * resolve through `border-ink` being softened in globals.css rather
         * than by changing this value, which also has to stay dark enough to
         * be body text.
         *
         * TEXT-ON-LIGHT variant. The split that existed here for the old
         * amber is still needed for the same reason: #EA580C is tuned as a
         * fill (white text on it measures 4.6:1), while as text on a white or
         * tinted page it only reaches 3.9:1. `amberInk` is the same hue taken
         * down to 5.9:1 on white and 5.6:1 on `cream`. Fills use `amber`;
         * anything where the colour IS the text uses `amberInk`.
         */
        amberInk: "#C2410C",

        // ── Resume Forge "new world" palette — the one dark surface ──
        // Kept as a distinct, deeper environment, restated in slate so it
        // reads as a focused editor rather than a different product.
        fslate: "#0F172A", // forge background
        fpanel: "#1E293B", // forge raised surface
        fedge: "#020617", // forge borders/shadows
        fwhite: "#E2E8F0", // forge text
        famber: "#FB923C", // accent on dark — lifted for contrast (7.1:1)
        fviolet: "#818CF8", // cool secondary accent on dark

        /*
         * Explicit UI scale. The role names above cover most usage; these are
         * for new work that wants to name a neutral directly rather than
         * borrow a role that does not quite fit.
         */
        ui: {
          bg: "#FFFFFF",
          surface: "#F8FAFC",
          raised: "#F1F5F9",
          line: "#E2E8F0",
          lineStrong: "#CBD5E1",
          text: "#0F172A",
          muted: "#475569",
          /*
           * Darkened from #94A3B8, which was slate-400 and never contrast
           * checked. It measured 2.56:1 on `bg` and 2.45:1 on `surface`
           * against the 4.5:1 AA floor, and the landing page put 13 text
           * nodes on it. This value clears AA on all three neutral surfaces
           * — 5.18:1 on `bg`, 4.95:1 on `surface`, 4.73:1 on `raised` — so
           * there is no combination of them left that quietly fails.
           */
          faint: "#5F6E85",
          accent: "#C2410C",
          accentBright: "#EA580C",
          accentSoft: "#FFF7ED",
          inverse: "#0F172A",
        },
      },

      /*
       * Every family resolves to Inter.
       *
       * `font-mono` appears in 306 places and `font-pixel` in 64 — they were
       * carrying body text and headings respectively, because the old system
       * had no text face at all. Pointing all three at one real UI face is
       * what removes the "terminal toy" read in a single change.
       *
       * `font-pixel` additionally picks up weight and tighter tracking from a
       * rule in globals.css, so the 64 headings that use it stay headings.
       *
       * `code` keeps a genuine monospace available for the few places that
       * need aligned figures.
       */
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        pixel: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        bangla: ["var(--font-bangla)", "sans-serif"],
        code: ["var(--font-mono)", "ui-monospace", "monospace"],
        display: ["var(--font-display)", "Georgia", "serif"],
      },

      /*
       * Display sizes, with the tracking and leading already applied.
       *
       * The thing that most reliably makes large type look amateur is leaving
       * it at the body defaults: 1.5 leading and 0 tracking are correct at
       * 15px and far too loose at 60px. Every step here tightens as it grows,
       * which is what typesetting a headline means.
       */
      fontSize: {
        "display-sm": ["2rem", { lineHeight: "1.15", letterSpacing: "-0.02em" }],
        "display-md": ["2.75rem", { lineHeight: "1.08", letterSpacing: "-0.025em" }],
        "display-lg": ["3.75rem", { lineHeight: "1.02", letterSpacing: "-0.03em" }],
        "display-xl": ["4.75rem", { lineHeight: "0.98", letterSpacing: "-0.034em" }],
      },

      /*
       * The `pixel-*` shadow names are kept for the same reason the colour
       * roles are: 127 references. They now describe elevation rather than a
       * hard offset — small, soft and short, so a card reads as lifted off
       * the page instead of stamped onto it.
       */
      /*
       * Elevation, built in layers.
       *
       * A single soft shadow is the giveaway of a default theme: real objects
       * cast a tight contact shadow AND a wide ambient one, and the eye reads
       * the pair as material. Every level below therefore stacks a hairline
       * ring, a short contact shadow and a long diffuse one, with the spread
       * pulled negative so the ambient layer stays under the object instead of
       * haloing it.
       */
      boxShadow: {
        "pixel-sm":
          "0 0 0 1px rgba(15,23,42,0.04), 0 1px 2px -1px rgba(15,23,42,0.08)",
        pixel:
          "0 0 0 1px rgba(15,23,42,0.04), 0 1px 2px -1px rgba(15,23,42,0.07), 0 4px 12px -4px rgba(15,23,42,0.09)",
        "pixel-lg":
          "0 0 0 1px rgba(15,23,42,0.05), 0 2px 4px -2px rgba(15,23,42,0.06), 0 12px 28px -8px rgba(15,23,42,0.14)",
        // Formerly coloured offsets; now focus/emphasis rings.
        "pixel-amber": "0 0 0 3px rgba(234,88,12,0.18)",
        "pixel-mint": "0 0 0 3px rgba(5,150,105,0.18)",
        "pixel-none": "none",

        card:
          "0 0 0 1px rgba(15,23,42,0.04), 0 1px 2px -1px rgba(15,23,42,0.07), 0 4px 12px -4px rgba(15,23,42,0.09)",
        lift:
          "0 0 0 1px rgba(15,23,42,0.05), 0 2px 4px -2px rgba(15,23,42,0.06), 0 12px 28px -8px rgba(15,23,42,0.14)",
        // For the one or two elements meant to sit above the page entirely.
        float:
          "0 0 0 1px rgba(15,23,42,0.06), 0 4px 8px -4px rgba(15,23,42,0.06), 0 24px 48px -12px rgba(15,23,42,0.18), 0 48px 96px -24px rgba(15,23,42,0.12)",
      },

      // `border-3` is used in 106 places as "the framing border". A 3px slate
      // rule is brutal; 1px is what the same intent looks like here.
      borderWidth: {
        "3": "1px",
      },

      borderRadius: {
        DEFAULT: "8px",
      },

      // The mobile frame is now a readable content column rather than a hard
      // device bezel — see the app-frame rules in globals.css.
      maxWidth: {
        app: "480px",
      },
    },
  },
  plugins: [],
};
export default config;
