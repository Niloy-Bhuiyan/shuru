import { afterEach, describe, expect, it, vi } from "vitest";
import { transitionTo } from "@/components/ForgeTransition";

/**
 * The transition is CSS; the only logic worth testing is that navigation is
 * never blocked by the animation bookkeeping.
 */

const realWindow = (globalThis as { window?: unknown }).window;

function stubWindow(sessionStorage: unknown) {
  (globalThis as { window?: unknown }).window = { sessionStorage };
}

afterEach(() => {
  if (realWindow === undefined) {
    delete (globalThis as { window?: unknown }).window;
  } else {
    (globalThis as { window?: unknown }).window = realWindow;
  }
});

describe("transitionTo", () => {
  it("navigates and arms the arrival flag", () => {
    const setItem = vi.fn();
    stubWindow({ setItem, getItem: () => null, removeItem: vi.fn() });
    const push = vi.fn();

    transitionTo({ push }, "/forge");

    expect(setItem).toHaveBeenCalledWith("shuru.forge-transition", "1");
    expect(push).toHaveBeenCalledWith("/forge");
  });

  it("still navigates when sessionStorage throws", () => {
    stubWindow({
      setItem: () => {
        throw new Error("storage disabled");
      },
    });
    const push = vi.fn();

    expect(() => transitionTo({ push }, "/radar")).not.toThrow();
    expect(push).toHaveBeenCalledWith("/radar");
  });

  it("navigates when there is no window (server render)", () => {
    delete (globalThis as { window?: unknown }).window;
    const push = vi.fn();

    transitionTo({ push }, "/radar");

    expect(push).toHaveBeenCalledWith("/radar");
  });
});
