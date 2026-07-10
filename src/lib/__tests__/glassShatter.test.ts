import { describe, expect, it } from "vitest";
import { buildShards } from "@/components/GlassShatter";

describe("buildShards (snapshot-shatter geometry)", () => {
  const shards = buildShards();

  it("produces 70 triangular shards (5×7 grid × 2)", () => {
    expect(shards).toHaveLength(70);
    for (const s of shards) {
      const points = s.clip.match(/%/g)!.length / 2;
      expect(points).toBe(3);
    }
  });

  it("keeps every centroid inside the viewport (0–100%)", () => {
    for (const s of shards) {
      expect(s.cx).toBeGreaterThanOrEqual(0);
      expect(s.cx).toBeLessThanOrEqual(100);
      expect(s.cy).toBeGreaterThanOrEqual(0);
      expect(s.cy).toBeLessThanOrEqual(100);
    }
  });

  it("is deterministic — SSR and client markup can never disagree", () => {
    expect(buildShards()).toEqual(shards);
  });

  it("pins the outer grid vertices to the viewport edges (no gaps)", () => {
    const corner = (x: number, y: number) =>
      shards.some((s) => s.clip.includes(`${x}% ${y}%`));
    expect(corner(0, 0)).toBe(true);
    expect(corner(100, 0)).toBe(true);
    expect(corner(0, 100)).toBe(true);
    expect(corner(100, 100)).toBe(true);
  });
});
