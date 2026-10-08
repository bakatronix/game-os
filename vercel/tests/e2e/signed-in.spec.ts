import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";

/* Signed-in journey — runs only when a storage state exists.
 * Create one by logging in once:
 *   1. npx playwright codegen https://llamagriffin.com/login
 *      (sign in with Google/Discord, then save storage state)
 *   Or: node tests/save-session.mjs
 * The saved state is written to tests/.auth/state.json (gitignored).
 */

const STATE = process.env.GOS_STORAGE || "tests/.auth/state.json";
const hasState = existsSync(STATE);

test.describe("Signed-in journey", () => {
  test.skip(!hasState, "No saved auth state (tests/.auth/state.json). See tests/e2e/README.md.");

  test.use({ storageState: hasState });

  test("dashboard loads for a signed-in user", async ({ page }) => {
    await page.goto("/game-os");
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15000 });
    await expect(page.getByText(/Studio|Community|Pricing|PMF/i).first()).toBeVisible({ timeout: 15000 });
  });

  test("account page shows the profile + studio", async ({ page }) => {
    await page.goto("/account");
    await expect(page.getByText(/Profile|Email|Studio/i).first()).toBeVisible({ timeout: 15000 });
  });

  test("admin + analytics render", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByText(/Members|Apps & access|Studio/i).first()).toBeVisible({ timeout: 15000 });
    await page.goto("/admin/analytics");
    await expect(page.getByText(/Funnel|Events by tool|Attribution/i).first()).toBeVisible({ timeout: 15000 });
  });
});
