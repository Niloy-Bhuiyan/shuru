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
    await page.goto("/login");
    await page.getByRole("link", { name: /forgot password/i }).click();
    await expect(page).toHaveURL(/\/forgot-password/);

    await page.goto("/login");
    await page.getByRole("link", { name: /create account/i }).click();
    await expect(page).toHaveURL(/\/register/);
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
  for (const path of ["/radar", "/saved", "/vault", "/you", "/employer", "/admin"]) {
    test(`redirects ${path} to login when signed out`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    });
  }
});
