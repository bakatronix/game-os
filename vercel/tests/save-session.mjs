#!/usr/bin/env node
/* Capture a signed-in session for the e2e tests.
 * Opens a browser; sign in with Google/Discord; press Enter; state is saved.
 *
 *   node tests/save-session.mjs [baseUrl]
 */

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createInterface } from "node:readline";

const BASE = process.argv[2] || process.env.GOS_BASE || "https://llamagriffin.com";
const OUT = resolve("tests/.auth/state.json");
mkdirSync(dirname(OUT), { recursive: true });

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();
await page.goto(`${BASE}/login`);

console.log("\nA browser window is open. Sign in with Google or Discord.");
console.log("Once you reach the Game OS dashboard, come back here and press Enter.\n");

const rl = createInterface({ input: process.stdin, output: process.stdout });
rl.question("Press Enter when signed in: ", async () => {
  await context.storageState({ path: OUT });
  console.log(`\nSaved session to ${OUT}\n`);
  await browser.close();
  rl.close();
});
