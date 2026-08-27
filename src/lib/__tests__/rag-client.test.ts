/**
 * Configuration gating for the retrieval-service client.
 *
 * The rule under test: with the service unconfigured, the feature reports
 * itself unavailable and names the exact missing variable. It never falls back
 * to a degraded answer, and it never claims to be available.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  askRag,
  ragConfigured,
  ragMissingVars,
  RagUnavailableError,
} from "@/lib/rag/client";

const ORIGINAL = { ...process.env };

beforeEach(() => {
  delete process.env.SHURU_RAG_URL;
  delete process.env.SHURU_RAG_SERVICE_TOKEN;
});

afterEach(() => {
  process.env = { ...ORIGINAL };
  vi.restoreAllMocks();
});

describe("ragConfigured", () => {
  it("is false with nothing set", () => {
    expect(ragConfigured()).toBe(false);
  });

  it("is false with only one of the two set", () => {
    process.env.SHURU_RAG_URL = "http://localhost:8000";
    expect(ragConfigured()).toBe(false);
  });

  it("is true once both are set", () => {
    process.env.SHURU_RAG_URL = "http://localhost:8000";
    process.env.SHURU_RAG_SERVICE_TOKEN = "tok";
    expect(ragConfigured()).toBe(true);
  });

  it("treats an unfilled placeholder as unset", () => {
    // A copied template must not read as a working configuration.
    process.env.SHURU_RAG_URL = "http://localhost:8000";
    process.env.SHURU_RAG_SERVICE_TOKEN = "YOUR_TOKEN_HERE";
    expect(ragConfigured()).toBe(false);
  });
});

describe("ragMissingVars", () => {
  it("names both when neither is set", () => {
    expect(ragMissingVars()).toEqual([
      "SHURU_RAG_URL",
      "SHURU_RAG_SERVICE_TOKEN",
    ]);
  });

  it("names only what is actually missing", () => {
    process.env.SHURU_RAG_URL = "http://localhost:8000";
    expect(ragMissingVars()).toEqual(["SHURU_RAG_SERVICE_TOKEN"]);
  });

  it("is empty when configured", () => {
    process.env.SHURU_RAG_URL = "http://localhost:8000";
    process.env.SHURU_RAG_SERVICE_TOKEN = "tok";
    expect(ragMissingVars()).toEqual([]);
  });
});

describe("askRag", () => {
  it("refuses before making a request when unconfigured", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(askRag("q", "user-1")).rejects.toBeInstanceOf(
      RagUnavailableError
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends the token as a bearer header and never in the body", async () => {
    process.env.SHURU_RAG_URL = "http://localhost:8000/";
    process.env.SHURU_RAG_SERVICE_TOKEN = "sekrit";

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          answer: "",
          abstained: true,
          abstain_reason: "no_relevant_sources",
          citations: [],
          took_ms: 5,
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    await askRag("does it need python?", "user-1");

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    // Trailing slash on the base must not produce a double slash.
    expect(url).toBe("http://localhost:8000/ask");
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer sekrit"
    );
    expect(String(init.body)).not.toContain("sekrit");
    expect(JSON.parse(String(init.body))).toEqual({
      question: "does it need python?",
      user_id: "user-1",
    });
  });

  it("passes an abstention through as a normal result", async () => {
    // Abstaining is the product working. It must not surface as an error.
    process.env.SHURU_RAG_URL = "http://localhost:8000";
    process.env.SHURU_RAG_SERVICE_TOKEN = "tok";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          answer: "",
          abstained: true,
          abstain_reason: "no_relevant_sources",
          citations: [],
          took_ms: 5,
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const r = await askRag("anything", "user-1");
    expect(r.abstained).toBe(true);
    expect(r.abstain_reason).toBe("no_relevant_sources");
  });

  it("surfaces the service's own structured reason", async () => {
    process.env.SHURU_RAG_URL = "http://localhost:8000";
    process.env.SHURU_RAG_SERVICE_TOKEN = "tok";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "daily_limit_reached" }), {
        status: 429,
        headers: { "content-type": "application/json" },
      })
    );

    await expect(askRag("q", "user-1")).rejects.toMatchObject({
      detail: "daily_limit_reached",
    });
  });

  it("reports an unreachable service rather than throwing a raw network error", async () => {
    process.env.SHURU_RAG_URL = "http://localhost:8000";
    process.env.SHURU_RAG_SERVICE_TOKEN = "tok";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(askRag("q", "user-1")).rejects.toMatchObject({
      detail: "unreachable",
    });
  });
});
