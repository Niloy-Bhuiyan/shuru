/**
 * Lever board paging.
 *
 * Motivated by a real misdiagnosis: `palantir` returns 308 postings with full
 * descriptions and takes 33–79s unpaged, so an 8s single-request budget
 * aborted every run and reported "unreachable boards: palantir" for a board
 * that was live the whole time. Paging at limit=50 responds in ~10s.
 *
 * The distinction these tests protect is unreachable (nothing read) vs
 * truncated (partial read) — collapsing them is what hid the bug.
 */
import { describe, expect, it, vi } from "vitest";
import { leverAdapter, leverUrl } from "@/lib/ingest/adapters/lever";

const env = (vars: Record<string, string>) =>
  ({ ...vars }) as unknown as NodeJS.ProcessEnv;

/** One posting that clears matchesFilters (intern-family + tech term). */
function posting(id: number) {
  return {
    id: `p${id}`,
    text: "Software Engineering Intern",
    hostedUrl: `https://jobs.lever.co/acme/${id}`,
    createdAt: Date.now(),
    descriptionPlain: "We use React and TypeScript.",
    categories: { location: "Dhaka", commitment: "Intern", team: "Eng" },
    workplaceType: "remote",
  };
}

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body } as unknown as Response;
}

describe("leverUrl", () => {
  it("requests a bounded page rather than the whole board", () => {
    const url = leverUrl("acme");
    expect(url).toContain("limit=50");
    expect(url).toContain("skip=0");
  });

  it("encodes the slug", () => {
    expect(leverUrl("a/b")).toContain("a%2Fb");
  });
});

describe("leverAdapter.run — paging", () => {
  it("stops at the first short page and reports no error", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([posting(1), posting(2)]));

    const result = await leverAdapter.run(
      fetchImpl as never,
      env({ LEVER_COMPANIES: "acme" })
    );

    // one short page is the last page — exactly one request
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.fetched).toBe(2);
    expect(result.error).toBeNull();
    expect(result.listings.length).toBe(2);
  });

  it("follows skip until the board is exhausted", async () => {
    const full = Array.from({ length: 50 }, (_, i) => posting(i));
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(full))
      .mockResolvedValueOnce(jsonResponse([posting(999)]));

    const result = await leverAdapter.run(
      fetchImpl as never,
      env({ LEVER_COMPANIES: "acme" })
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    // second call must advance skip, or it would loop on page one forever
    expect(String(fetchImpl.mock.calls[1][0])).toContain("skip=50");
    expect(result.fetched).toBe(51);
  });

  it("reports a board that fails on its FIRST page as unreachable", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false }) as unknown as Response);

    const result = await leverAdapter.run(
      fetchImpl as never,
      env({ LEVER_COMPANIES: "acme" })
    );

    expect(result.fetched).toBeNull(); // every board failed
    expect(result.error).toContain("unreachable");
    expect(result.listings).toEqual([]);
  });

  it("reports a board that fails on a LATER page as partial, not unreachable", async () => {
    const full = Array.from({ length: 50 }, (_, i) => posting(i));
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(full))
      .mockResolvedValueOnce({ ok: false } as unknown as Response);

    const result = await leverAdapter.run(
      fetchImpl as never,
      env({ LEVER_COMPANIES: "acme" })
    );

    // the 50 postings we DID read must survive
    expect(result.fetched).toBe(50);
    expect(result.listings.length).toBeGreaterThan(0);
    expect(result.error).toContain("partially read");
    expect(result.error).not.toContain("unreachable");
  });

  it("keeps one dead board from hiding a healthy one", async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      String(url).includes("dead")
        ? ({ ok: false } as unknown as Response)
        : jsonResponse([posting(1)])
    );

    const result = await leverAdapter.run(
      fetchImpl as never,
      env({ LEVER_COMPANIES: "dead,alive" })
    );

    expect(result.fetched).toBe(1); // not null — not every board failed
    expect(result.error).toContain("dead");
    expect(result.listings.length).toBe(1);
  });
});
