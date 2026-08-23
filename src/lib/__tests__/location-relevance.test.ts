/**
 * Location relevance.
 *
 * Shuru serves students in Bangladesh. An onsite internship in San Francisco
 * is a genuine listing but not one they can accept, and a feed full of them
 * looks busy while being useless.
 *
 * The rule: remote is always applicable; anything else must be in Bangladesh.
 */
import { describe, expect, it } from "vitest";
import { buildListing, isRelevantLocation } from "@/lib/ingest/normalize";

describe("isRelevantLocation", () => {
  it("keeps remote roles wherever the company sits", () => {
    expect(isRelevantLocation("San Francisco, California", "remote")).toBe(true);
    expect(isRelevantLocation("Berlin", "remote")).toBe(true);
    expect(isRelevantLocation("", "remote")).toBe(true);
  });

  it("keeps onsite roles inside Bangladesh", () => {
    for (const location of [
      "Dhaka",
      "Dhaka, Bangladesh",
      "Chattogram",
      "Chittagong",
      "Sylhet",
      "Gazipur",
    ]) {
      expect(isRelevantLocation(location, "onsite"), location).toBe(true);
    }
  });

  it("drops onsite roles abroad", () => {
    for (const location of [
      "San Francisco, California",
      "Berlin",
      "London, United Kingdom",
      "Washington, D.C.",
      "Seoul, South Korea",
    ]) {
      expect(isRelevantLocation(location, "onsite"), location).toBe(false);
    }
  });

  it("treats hybrid as onsite — it still requires being near the office", () => {
    expect(isRelevantLocation("London", "hybrid")).toBe(false);
    expect(isRelevantLocation("Dhaka", "hybrid")).toBe(true);
  });

  it("is case insensitive", () => {
    expect(isRelevantLocation("DHAKA, BANGLADESH", "onsite")).toBe(true);
  });
});

describe("buildListing applies the filter centrally", () => {
  const base = {
    source: "lever" as const,
    sourceId: "x1",
    company: "Acme",
    role: "Software Engineering Intern",
    postedIso: new Date().toISOString(),
    paidEvidence: true,
    url: "https://example.com/job",
  };

  it("returns null for an onsite role abroad", () => {
    expect(
      buildListing({ ...base, location: "San Francisco, California", workMode: "onsite" })
    ).toBeNull();
  });

  it("returns a listing for a remote role abroad", () => {
    const row = buildListing({
      ...base,
      location: "San Francisco, California",
      workMode: "remote",
    });
    expect(row).not.toBeNull();
  });

  it("returns a listing for an onsite role in Dhaka", () => {
    const row = buildListing({ ...base, location: "Dhaka, Bangladesh", workMode: "onsite" });
    expect(row).not.toBeNull();
    expect(row!.location).toBe("Dhaka, Bangladesh");
  });

  it("defaults a missing work mode to remote, so nothing is dropped for lacking one", () => {
    // adapters that never set workMode (RemoteOK) must keep working
    const row = buildListing({ ...base, location: "Anywhere" });
    expect(row).not.toBeNull();
  });
});
