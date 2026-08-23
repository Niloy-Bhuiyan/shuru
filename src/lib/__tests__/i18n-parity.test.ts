/**
 * Translation parity.
 *
 * `t()` falls back to English for a missing Bangla key, which keeps the UI
 * usable but makes a gap invisible — a half-Bangla screen looks like a design
 * choice rather than an oversight. This test makes the gap loud instead.
 *
 * Parsed from source rather than imported: the fallback in `t()` means an
 * imported dictionary cannot distinguish "translated" from "fell back".
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync("src/lib/i18n.tsx", "utf8");

function sectionKeys(startMarker: string, endMarker: string): Set<string> {
  const start = src.indexOf(startMarker);
  const end = src.indexOf(endMarker, start + startMarker.length);
  expect(start, `could not find ${startMarker}`).toBeGreaterThan(-1);
  expect(end, `could not find ${endMarker}`).toBeGreaterThan(start);

  const block = src.slice(start, end);
  const keys = new Set<string>();
  // matches   "some.key":   and bare identifiers like   appName:
  const re = /^\s{4}(?:"([^"]+)"|([A-Za-z_$][\w$]*))\s*:/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) keys.add(m[1] ?? m[2]);
  return keys;
}

const en = sectionKeys("  en: {", "  bn: {");
const bn = sectionKeys("  bn: {", "} as const;");

describe("i18n parity", () => {
  it("parsed a plausible number of keys from both dictionaries", () => {
    // guards against the regex silently matching nothing after a refactor
    expect(en.size).toBeGreaterThan(300);
    expect(bn.size).toBeGreaterThan(300);
  });

  it("every English key has a Bangla translation", () => {
    const missing = Array.from(en).filter((k) => !bn.has(k));
    expect(
      missing,
      `missing Bangla translations:\n  ${missing.join("\n  ")}`
    ).toEqual([]);
  });

  it("has no Bangla key without an English counterpart", () => {
    // A bn-only key is dead weight: StringKey derives from `en`, so nothing
    // can ever request it.
    const orphaned = Array.from(bn).filter((k) => !en.has(k));
    expect(
      orphaned,
      `Bangla keys with no English counterpart:\n  ${orphaned.join("\n  ")}`
    ).toEqual([]);
  });
});
