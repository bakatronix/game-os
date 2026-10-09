import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

/* Diagnostic: drive the real Google sign-in and capture every network hop,
 * console message, and navigation so we can see exactly where it loops.
 * Run: npx playwright test tests/e2e/diagnose-oauth.spec.ts --reporter=list
 */

test("trace the Google sign-in round trip", async ({ page, context }) => {
  const log: any[] = [];
  const record = (kind: string, data: any) => {
    log.push({ kind, ...data, t: Date.now() });
  };

  page.on("request", (r) => {
    const u = r.url();
    if (/accounts\.google|lammagriffin|vercel|api\/auth|api\/track/.test(u)) {
      record("request", { method: r.method(), url: u });
    }
  });
  page.on("response", (r) => {
    const u = r.url();
    if (/accounts\.google|lammagriffin|vercel|api\/auth/.test(u)) {
      record("response", {
        status: r.status(),
        url: u,
        location: r.headers()["location"],
        setCookie: (r.headers()["set-cookie"] || "").slice(0, 200),
      });
    }
  });
  page.on("console", (m) => record("console", { type: m.type(), text: m.text().slice(0, 300) }));
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame()) record("navigate", { url: f.url() });
  });

  await page.goto("/login", { waitUntil: "domcontentloaded" });

  // Click Google. It will navigate to Google's consent; we won't authenticate,
  // but the first leg + the server action + cookies reveal the mismatch.
  await page.getByRole("button", { name: /Continue with Google/i }).click();
  await page.waitForTimeout(4000);

  // Capture cookies (names + domains) on the public domain.
  const cookies = await context.cookies();
  const cookieInfo = cookies.map((c) => ({ name: c.name, domain: c.domain, path: c.path }));

  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/oauth-trace.json", JSON.stringify({ log, cookieInfo, finalUrl: page.url() }, null, 2));

  console.log("\n=== FINAL URL ===", page.url());
  console.log("\n=== COOKIES ===");
  for (const c of cookieInfo) console.log(`  ${c.name}  domain=${c.domain}`);
  console.log("\n=== HOPS (auth-related) ===");
  for (const e of log) {
    if (e.kind === "navigate") console.log(`  NAV  ${e.url}`);
    if (e.kind === "response" && /api\/auth/.test(e.url))
      console.log(`  RES  ${e.status} ${e.url}${e.location ? " -> " + e.location : ""}`);
  }

  expect(log.length).toBeGreaterThan(0);
});
