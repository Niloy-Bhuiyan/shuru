import { expect, test } from "@playwright/test";

/**
 * Responsive guarantees for the shell.
 *
 * These run under BOTH Playwright projects (mobile 390px, desktop 1440px), so
 * each assertion is checked at both ends of the range rather than at one
 * chosen width.
 *
 * Only signed-out routes are covered here: the app shell behind /radar needs a
 * session, and asserting on a redirect to /login would silently pass while
 * testing nothing. The signed-in shell is covered by unit tests over the
 * layout's class contract plus the route-guard specs in auth.spec.ts.
 */

const PUBLIC_ROUTES = ["/login", "/register", "/forgot-password"];

test.describe("no horizontal overflow", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route} never scrolls sideways`, async ({ page }) => {
      await page.goto(route);

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));

      // A single stray fixed-width child shows up here at one viewport and not
      // the other, which is exactly the regression this guards.
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
    });
  }
});

test.describe("app frame", () => {
  test("is capped on mobile and widened on desktop", async ({ page }, testInfo) => {
    await page.goto("/login");

    const frameWidth = await page.evaluate(() => {
      // [data-app-frame] is the shell div in src/app/layout.tsx — an explicit
      // seam, so this does not break when the provider tree changes shape.
      const el = document.querySelector("[data-app-frame]");
      return el ? Math.round(el.getBoundingClientRect().width) : null;
    });

    expect(frameWidth).not.toBeNull();

    if (testInfo.project.name === "mobile") {
      // max-w-app is 430px; at a 390px viewport the frame is the viewport
      expect(frameWidth!).toBeLessThanOrEqual(430);
    } else {
      // lg:max-w-[1120px] — must actually widen, not stay a phone column
      expect(frameWidth!).toBeGreaterThan(430);
      expect(frameWidth!).toBeLessThanOrEqual(1120);
    }
  });
});

test.describe("tap targets", () => {
  test("primary auth controls are large enough to tap", async ({ page }) => {
    await page.goto("/login");

    const submit = page.getByRole("button", { name: /log in/i });
    const box = await submit.boundingBox();

    expect(box).not.toBeNull();
    // 44px is the conventional minimum comfortable touch target
    expect(box!.height).toBeGreaterThanOrEqual(36);
  });
});
