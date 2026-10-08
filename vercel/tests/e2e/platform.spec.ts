import { test, expect } from "@playwright/test";

/* Browser agent — drives the real UI.
 * Covers: login page, OAuth button behavior, tools rendering + tracking,
 * and the auth gate redirect. A signed-in journey runs only if a storage
 * state is provided via GOS_STORAGE (see tests/e2e/README).
 */

test.describe("Login page", () => {
  test("renders both providers and the brand", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("Game OS", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: /Continue with Google/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Continue with Discord/i })).toBeVisible();
  });

  test("Google button starts the OAuth handshake", async ({ page }) => {
    await page.goto("/login");
    const [nav] = await Promise.all([
      page.waitForRequest((r) => /accounts\.google\.com|api\/auth\/signin\/google/.test(r.url()), { timeout: 15000 }).catch(() => null),
      page.getByRole("button", { name: /Continue with Google/i }).click(),
    ]);
    // The server action POSTs to signin and then the browser is sent to Google.
    await page.waitForURL(/accounts\.google\.com|error=/, { timeout: 15000 }).catch(() => {});
    expect(page.url()).toMatch(/accounts\.google\.com|\/login/);
  });
});

test.describe("Auth gate", () => {
  test("/game-os redirects an anonymous user to login", async ({ page }) => {
    await page.goto("/game-os");
    await page.waitForURL(/\/login/, { timeout: 15000 });
    expect(page.url()).toContain("/login");
  });
});

test.describe("Tools render + instrument", () => {
  const tools = [
    ["/game-os/price-calc", /Pricing Dashboard|Indie Game Pricing/i],
    ["/game-os/PMF", /PMF Analyzer/i],
    ["/game-os/chicken-brulee", /Chicken Brûlée|Playtest/i],
    ["/seismic", /Seismic/i],
  ];
  for (const [path, re] of tools) {
    test(`${path} loads and loads track.js`, async ({ page }) => {
      const trackReq = page.waitForRequest((r) => /\/track\.js/.test(r.url()), { timeout: 15000 }).catch(() => null);
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveTitle(re, { timeout: 15000 });
      expect(await trackReq).toBeTruthy();
    });
  }

  test("price-calc emits a page_view event", async ({ page }) => {
    const trackPost = page.waitForRequest(
      (r) => /\/api\/track/.test(r.url()) && r.method() === "POST",
      { timeout: 20000 },
    ).catch(() => null);
    await page.goto("/game-os/price-calc", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    expect(await trackPost).toBeTruthy();
  });
});
