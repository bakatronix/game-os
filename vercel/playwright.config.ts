import { defineConfig, devices } from "@playwright/test";

const BASE = process.env.GOS_BASE || "https://llamagriffin.com";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  retries: 1,
  reporter: [["list"]],
  use: {
    baseURL: BASE,
    headless: true,
    ignoreHTTPSErrors: false,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
