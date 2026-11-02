import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/* Regression: every Game OS tool must reference its assets with ABSOLUTE
 * paths (relative refs break under the /x -> /x trailing-slash redirect), and
 * every tool must be gated to Game OS accounts.
 *
 * Asset-path checks read the source HTML from disk (deterministic; the served
 * .html is auth-gated). Gate checks run in the browser.
 */

const ROOT = resolve(__dirname, "..", "..", "public");

const HTML: [string, RegExp, string][] = [
  ["game-os/index.html", /\/game-os\/assets\/app\.js/, "dashboard"],
  ["game-os/chicken-brulee/index.html", /\/game-os\/chicken-brulee\/assets\/app\.js/, "chicken-brulee"],
  ["game-os/steam-page-audit/index.html", /\/game-os\/steam-page-audit\/assets\/app\.js/, "steam-page-audit"],
  ["seismic/index.html", /\/seismic\/js\/app\.js/, "seismic"],
  ["game-os/PMF/index.html", /\/game-os\/PMF\/assets\/index-.*\.js/, "PMF"],
  ["game-os/price-calc/index.html", /(inline|track\.js)/, "price-calc"],
];

test.describe("assets use absolute paths (no relative-ref breakage)", () => {
  for (const [file, absRef, label] of HTML) {
    test(`${label}: no relative asset refs`, () => {
      const body = readFileSync(resolve(ROOT, file), "utf8");
      expect(body, `${label} missing expected ref`).toMatch(absRef);
      expect(body, `${label} has relative asset refs`).not.toMatch(/(href|src)="(assets|css|js)\//);
    });
  }
});

test.describe("every tool is gated to Game OS accounts", () => {
  const paths = [
    "/game-os",
    "/game-os/price-calc",
    "/game-os/PMF",
    "/game-os/chicken-brulee",
    "/game-os/steam-page-audit",
    "/seismic",
  ];
  for (const p of paths) {
    test(`${p} redirects anonymous users to /login`, async ({ page }) => {
      await page.goto(p, { waitUntil: "networkidle" });
      expect(page.url()).toMatch(/\/login/);
    });
  }
});

test.describe("Seismic tools are registered as Game OS widgets", () => {
  test("registry lists 15 tools + 3 shared views under /seismic", async ({ request, baseURL }) => {
    const res = await request.get(`${baseURL}/api/apps`);
    expect(res.status()).toBe(200);
    const { gates } = await res.json();
    const seismicTools = gates.filter((g: any) => g.path === "/seismic" && g.group === "tools");
    expect(seismicTools.length).toBe(18); // 15 tools + 3 shared-object views
    expect(seismicTools.every((g: any) => g.anchor && g.anchor.startsWith("?tool="))).toBe(true);
    expect(seismicTools.some((g: any) => g.anchor === "?tool=market-scope")).toBe(true);
    expect(seismicTools.some((g: any) => g.stage === "Concept")).toBe(true);
  });

  test("deep-link ?tool= opens the right tool (source markup)", () => {
    // Seismic reads ?tool= on load; assert the loader exists in the source.
    const src = readFileSync(resolve(ROOT, "seismic/js/app.js"), "utf8");
    expect(src).toContain("deepLinkTarget");
    expect(src).toContain("get('tool')");
  });
});
