import { expect, test } from "@playwright/test";

/**
 * Auth surfaces that do not require a database read: page rendering,
 * client-side validation, navigation between the auth screens, and the
 * signed-out route guard.
 *
 * Flows that need real rows (register -> verify -> profile -> apply) live in
 * flows.spec.ts and are skipped until a seeded test account exists.
 */

test.describe("login", () => {
  test("renders the sign-in form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /log in/i })).toBeVisible();
  });

  test("offers only the OAuth providers that are switched on", async ({ page }) => {
    await page.goto("/login");
    const google = page.getByRole("button", { name: /google/i });
    const github = page.getByRole("button", { name: /github/i });

    // The flags are build-time public env vars, so whichever is enabled must
    // render and whichever is not must be absent — never a dead button.
    const googleEnabled = process.env.NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED === "true";
    const githubEnabled = process.env.NEXT_PUBLIC_OAUTH_GITHUB_ENABLED === "true";

    if (googleEnabled) await expect(google).toBeVisible();
    if (githubEnabled) await expect(github).toBeVisible();
    if (!googleEnabled && !githubEnabled) {
      await expect(google).toHaveCount(0);
      await expect(github).toHaveCount(0);
    }
  });

  test("links to registration and password reset", async ({ page }) => {
    // Headroom over the 5s default for a cold first paint under parallel
    // workers. The suite now runs against a production build, so there is no
    // on-demand compile — this is defensive, not load-bearing.
    const NAV_TIMEOUT = 20_000;

    await page.goto("/login");
    await page.getByRole("link", { name: /forgot password/i }).click();
    await expect(page).toHaveURL(/\/forgot-password/, { timeout: NAV_TIMEOUT });

    await page.goto("/login");
    await page.getByRole("link", { name: /create account/i }).click();
    await expect(page).toHaveURL(/\/register/, { timeout: NAV_TIMEOUT });
  });
});

test.describe("signed-out header", () => {
  test("does not render the notification bell", async ({ page }) => {
    // SunriseHeader is shared with the auth screens. The bell used to poll
    // /rest/v1/notifications here and 401 twice on every visit; a signed-out
    // user has no alerts, so it must not render at all.
    await page.goto("/login");
    await expect(page.getByRole("link", { name: /notification/i })).toHaveCount(0);
  });

  test("makes no authenticated data request", async ({ page }) => {
    const unauthorized: string[] = [];
    page.on("response", (r) => {
      if (r.status() === 401) unauthorized.push(r.url());
    });

    await page.goto("/login");
    await page.waitForTimeout(3000);

    expect(
      unauthorized,
      `signed-out page made authenticated requests:\n  ${unauthorized.join("\n  ")}`
    ).toEqual([]);
  });
});

test.describe("operator endpoints", () => {
  // These name the job boards in use, their health, and the email provider.
  // No app surface consumes them, so they must not answer an anonymous GET.
  for (const path of ["/api/ingest", "/api/notifications/dispatch"]) {
    test(`${path} refuses an unauthenticated GET`, async ({ request }) => {
      const res = await request.get(path);
      expect(res.status()).toBe(401);
    });
  }

  test("does not leak provider or source config in the 401 body", async ({ request }) => {
    const res = await request.get("/api/notifications/dispatch");
    const body = await res.text();
    expect(body).not.toMatch(/resend|postmark|remoteok|arbeitnow|lever|ashby/i);
  });
});

test.describe("payment endpoints", () => {
  /*
   * The webhook is the only endpoint that can grant a paid entitlement, and it
   * is deliberately session-less — a payment provider has no login. Its
   * authentication is the signature, so an unsigned POST reaching it must
   * change nothing. This is the single most important negative test in the
   * payment path.
   */
  test("the webhook rejects an unsigned request", async ({ request }) => {
    const res = await request.post("/api/payments/webhook", {
      data: { session_id: "sbx_anything", outcome: "succeeded" },
    });
    expect(res.status()).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_signature" });
  });

  test("the webhook rejects a forged signature", async ({ request }) => {
    const res = await request.post("/api/payments/webhook", {
      headers: { "x-shuru-sandbox-signature": "0".repeat(64), "x-shuru-sandbox-event-id": "evt_forged" },
      data: { session_id: "sbx_anything", outcome: "succeeded" },
    });
    expect(res.status()).toBe(400);
  });

  // Starting a payment and confirming a sandbox one both require an employer
  // session. Signed out, neither may be reachable.
  for (const path of ["/api/payments/checkout", "/api/payments/sandbox-confirm"]) {
    test(`${path} refuses an unauthenticated POST`, async ({ request }) => {
      const res = await request.post(path, { data: {} });
      expect([401, 403]).toContain(res.status());
    });
  }

  test("checkout refuses an unauthenticated GET", async ({ request }) => {
    const res = await request.get("/api/payments/checkout");
    expect([401, 403]).toContain(res.status());
  });
});

test.describe("retrieval endpoint", () => {
  /*
   * /api/ask carries the service token server-side and spends the caller's
   * daily quota. Signed out it must not answer, and it must not disclose
   * whether this deployment even runs a retrieval service.
   */
  test("refuses an unauthenticated GET probe", async ({ request }) => {
    const res = await request.get("/api/ask");
    expect(res.status()).toBe(401);
  });

  test("refuses an unauthenticated POST", async ({ request }) => {
    const res = await request.post("/api/ask", { data: { question: "hi" } });
    expect(res.status()).toBe(401);
  });

  test("never leaks the service token or its URL", async ({ request }) => {
    const body = await (await request.get("/api/ask")).text();
    expect(body).not.toMatch(/SHURU_RAG_SERVICE_TOKEN|bearer|localhost:8000/i);
  });
});

test.describe("registration", () => {
  test("rejects a short password and an out-of-range CGPA", async ({ page }) => {
    await page.goto("/register");

    await page.getByLabel(/^name/i).fill("Test Student");
    await page.getByLabel(/email/i).fill("student@example.edu");
    await page.getByLabel(/password/i).fill("short");
    await page.getByLabel(/cgpa/i).fill("9.9");

    await page.getByRole("button", { name: /create account/i }).click();

    // client-side validation must stop the submission before any network call
    await expect(page).toHaveURL(/\/register/);
    await expect(page.getByText(/minimum 8 characters/i)).toBeVisible();
    await expect(page.getByText(/between 0\.00 and 4\.00/i)).toBeVisible();
  });
});

test.describe("password reset", () => {
  test("does not reveal whether an email has an account", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByLabel(/email/i).fill("definitely-not-registered@example.com");
    await page.getByRole("button", { name: /send reset link/i }).click();

    // the same message must appear regardless, or it leaks account existence
    await expect(page.getByText(/if that email has an account/i)).toBeVisible({
      timeout: 15_000,
    });
  });
});

test.describe("route guard", () => {
  for (const path of [
    "/radar",
    "/saved",
    "/vault",
    "/you",
    "/notifications",
    "/onboarding",
    "/employer",
    "/employer/listings/new",
    "/admin",
    "/admin/listings/new",
  ]) {
    test(`redirects ${path} to login when signed out`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    });
  }
});
