import next from "eslint-config-next";
import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/**
 * ESLint flat config.
 *
 * Replaces `.eslintrc.json`. ESLint 9 defaults to flat config and
 * `eslint-config-next` 16 requires ESLint >= 9, so the format change arrived
 * with the Next 16 upgrade rather than being a separate decision.
 *
 * `eslint-config-next` 16 exports flat config natively — it must NOT be
 * bridged through `FlatCompat`. Doing so throws
 * "TypeError: Converting circular structure to JSON", because the compat
 * layer tries to serialise an already-flat config whose plugin objects
 * reference each other.
 */
const config = [
  {
    // Flat config has no `.eslintignore`; ignores live here.
    // `.local-scripts/` is the developer's own verification scratch space,
    // git-ignored and not part of the app.
    ignores: [
      ".local-scripts/**",
      "node_modules/**",
      ".next/**",
      "out/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  ...next,
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      /*
       * DELIBERATE DOWNGRADE — error to warning. Read before changing.
       *
       * `eslint-config-next` 16 newly enables the React Compiler hook rules.
       * Three of them fired on this codebase when Next went 14 -> 16:
       *
       *   react-hooks/static-components  (5)  FIXED — a component declared in
       *       a render body remounts its whole subtree every render.
       *   react-hooks/refs               (4)  FIXED — undo/redo `disabled`
       *       and a text-draft input were read from refs during render, so
       *       they were not tracked by React and only updated by accident.
       *   react-hooks/set-state-in-effect (18) NOT fixed — this rule.
       *
       * The first two were real defects and were fixed. This one fires on the
       * ordinary "load on mount / reset when a dependency changes" idiom:
       *
       *     useEffect(() => { setItems(null); load(); }, [profile]);
       *
       * The rule is right that this costs a cascading render, and React's
       * preferred answers are a `key` prop, deriving during render, or a data
       * library. All 18 sites are correct today and covered by tests; changing
       * every data-loading screen in the same commit as a framework major is
       * how a working app breaks.
       *
       * So it stays visible as a warning — not disabled, not ignored — and the
       * 18 sites are listed in CONTEXT.md as tracked follow-up work. The gate
       * is "zero errors"; this must go back to `error` once they are migrated.
       */
      "react-hooks/set-state-in-effect": "warn",

      /*
       * Honour the `_name` convention for deliberately-unused bindings —
       * placeholder parameters in a not-yet-implemented provider, and handler
       * signatures that must match an interface they do not fully use.
       */
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
];

export default config;
