/**
 * The one rule: an unrecognised failure never puts its own text on screen.
 *
 * This is a security property as much as a copy one. Postgres names the table
 * and the policy that refused a write, and that message used to go straight
 * into the DOM of the admin console.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { errorMessageKey, explainedMessage, toUserMessage } from "@/lib/errors";

/** Stands in for the translator; returns the key so assertions stay readable. */
const t = (k: string) => `T:${k}`;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("errorMessageKey", () => {
  it("maps the Postgres codes a user can respond to", () => {
    expect(errorMessageKey({ code: "42501" })).toBe("err.notAllowed");
    expect(errorMessageKey({ code: "23505" })).toBe("err.duplicate");
    expect(errorMessageKey({ code: "23503" })).toBe("err.related");
    expect(errorMessageKey({ code: "PGRST116" })).toBe("err.notFound");
    expect(errorMessageKey({ code: "PGRST301" })).toBe("err.signedOut");
  });

  it("maps this app's own error classes by name", () => {
    expect(errorMessageKey({ name: "EmployerAccessDenied" })).toBe("op.accessDenied");
    expect(errorMessageKey({ name: "InviteDenied" })).toBe("err.notAllowed");
    expect(errorMessageKey({ name: "ModerationRejected" })).toBe(
      "err.moderationReverted"
    );
  });

  it("treats 401 and 403 as a permission problem", () => {
    expect(errorMessageKey({ status: 401 })).toBe("err.notAllowed");
    expect(errorMessageKey({ status: 403 })).toBe("err.notAllowed");
  });

  it("recognises a dropped connection", () => {
    // What a browser actually throws when the network goes away mid-request.
    expect(errorMessageKey(new TypeError("Failed to fetch"))).toBe("err.offline");
    expect(
      errorMessageKey(new TypeError("NetworkError when attempting to fetch resource."))
    ).toBe("err.offline");
  });

  it("recognises an aborted request", () => {
    const e = new Error("aborted");
    e.name = "AbortError";
    expect(errorMessageKey(e)).toBe("err.timeout");
  });

  it("falls back to generic for anything it does not know", () => {
    expect(errorMessageKey(new Error("boom"))).toBe("err.generic");
    expect(errorMessageKey({ code: "99999" })).toBe("err.generic");
    expect(errorMessageKey(null)).toBe("err.generic");
    expect(errorMessageKey(undefined)).toBe("err.generic");
    expect(errorMessageKey("a bare string")).toBe("err.generic");
    expect(errorMessageKey(42)).toBe("err.generic");
  });
});

describe("explainedMessage", () => {
  it("passes through a message the thrower marked as user-facing", () => {
    const e = Object.assign(new Error("You cannot approve your own payment."), {
      explained: true,
    });
    expect(explainedMessage(e)).toBe("You cannot approve your own payment.");
  });

  it("refuses an unmarked message", () => {
    expect(explainedMessage(new Error("relation does not exist"))).toBeNull();
  });

  it("refuses an empty message even when marked", () => {
    // A class that sets the flag and then falls back to a bare code slug must
    // not get to render it.
    const e = Object.assign(new Error("   "), { explained: true });
    expect(explainedMessage(e)).toBeNull();
  });
});

describe("toUserMessage", () => {
  it("NEVER returns the raw text of an unrecognised error", () => {
    // The exact string that shipped to the admin console.
    const leak = new Error(
      'new row violates row-level security policy for table "user_roles"'
    );
    const shown = toUserMessage(leak, t);

    expect(shown).toBe("T:err.generic");
    expect(shown).not.toContain("user_roles");
    expect(shown).not.toContain("row-level security");
  });

  it("leaks nothing for any shape of thrown value", () => {
    const probes: unknown[] = [
      new Error('duplicate key value violates unique constraint "payments_pkey"'),
      { message: "PGRST202: function public.secret_thing does not exist" },
      { code: "XX000", message: "connection to server at 10.0.0.4 failed" },
      "raw string thrown",
      { toString: () => "sneaky" },
    ];
    for (const p of probes) {
      const shown = toUserMessage(p, t);
      expect(shown.startsWith("T:")).toBe(true);
      for (const secret of ["payments_pkey", "secret_thing", "10.0.0.4", "sneaky"]) {
        expect(shown).not.toContain(secret);
      }
    }
  });

  it("does show a message that was written to be read", () => {
    const e = Object.assign(new Error("Another admin already decided this one."), {
      explained: true,
    });
    expect(toUserMessage(e, t)).toBe("Another admin already decided this one.");
  });

  it("logs the detail it refuses to display", () => {
    const spy = vi.spyOn(console, "error");
    const e = new Error("internal detail");
    toUserMessage(e, t);
    expect(spy).toHaveBeenCalledWith("[unhandled]", e);
  });

  it("does not log the failures it already understands", () => {
    const spy = vi.spyOn(console, "error");
    toUserMessage({ code: "42501" }, t);
    expect(spy).not.toHaveBeenCalled();
  });
});
