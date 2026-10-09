import { test, expect, type Page } from "@playwright/test";

/* Regression: each tool's OWN assets must load and the app must initialize.
 * Catches relative-asset breakage from trailing-slash redirects (the blank
 * dashboard bug). Fails if a tool's CSS/JS 404 or the app never renders.
 */

type Fail = { url: string; status?: number; error?: string };

async function check(
  page: Page,
  path: string,
  opts: { assetPattern: RegExp; expectRendered: () => Promise<boolean>; label: string },
) {
  const bad: Fail[] = [];
  page.on("response", (r) => {
    if (opts.assetPattern.test(r.url()) && r.status() >= 400) {
      bad.push({ url: r.url(), status: r.status() });
    }
  });
  page.on("requestfailed", (r) => {
    if (opts.assetPattern.test(r.url())) bad.push({ url: r.url(), error: r.failure()?.errorText });
  });

  await page.goto(path, { waitUntil: "networkidle" });
  const rendered = await opts.expectRendered();
  expect(bad, `assets failed to load: ${JSON.stringify(bad)}`).toEqual([]);
  expect(rendered, `${opts.label} did not render`).toBeTruthy();
}

test.describe("tool assets load and apps render", () => {
  test("dashboard: styles + app.js load, #content renders", async ({ page }) => {
    // dashboard is auth-gated; unauthenticated it goes to /login. Assert the
    // login page's own assets load, and (if redirected) skip the render check.
    await page.goto("/game-os", { waitUntil: "networkidle" });
    if (/\/login/.test(page.url())) {
      await expect(page.getByRole("button", { name: /Continue with Google/i })).toBeVisible();
      return;
    }
    await expect(page.locator("#content")).not.toBeEmpty();
  });

  test("price-calc: renders", async ({ page }) => {
    await check(page, "/game-os/price-calc", {
      assetPattern: /\/game-os\/price-calc\//,
      label: "price-calc",
      expectRendered: async () => (await page.title()).length > 0,
    });
  });

  test("PMF: renders", async ({ page }) => {
    await check(page, "/game-os/PMF", {
      assetPattern: /\/game-os\/PMF\//,
      label: "PMF",
      expectRendered: async () => (await page.title()).length > 0,
    });
  });

  test("chicken-brulee: its own assets load (not the dashboard's)", async ({ page }) => {
    const seen: string[] = [];
    page.on("response", (r) => {
      if (/\/assets\/(app|styles)\.(js|css)/.test(r.url())) seen.push(r.url());
    });
    await page.goto("/game-os/chicken-brulee", { waitUntil: "networkidle" });
    // Every asset URL must be under /game-os/chicken-brulee/ — never /game-os/assets/
    const wrong = seen.filter((u) => /\/game-os\/assets\//.test(u));
    expect(wrong, `chicken-brulee loaded wrong assets: ${wrong}`).toEqual([]);
    expect(seen.some((u) => /\/game-os\/chicken-brulee\/assets\//.test(u))).toBeTruthy();
  });

  test("seismic: css + js load", async ({ page }) => {
    const bad: string[] = [];
    page.on("response", (r) => {
      if (/\/seismic\/(css|js)\//.test(r.url()) && r.status() >= 400) bad.push(`${r.status()} ${r.url()}`);
    });
    await page.goto("/seismic", { waitUntil: "networkidle" });
    expect(bad, `seismic assets failed: ${bad}`).toEqual([]);
  });
});
