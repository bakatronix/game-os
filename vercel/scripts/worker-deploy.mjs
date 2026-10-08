#!/usr/bin/env node
// Deploy just the edge router Worker to Cloudflare (no zone/record changes).
// Reads CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID from .env.local.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { VERCEL_DIR, loadEnv, ok, fail, info, bold } from "./lib.mjs";

const env = loadEnv();
const T = env.CLOUDFLARE_API_TOKEN;
const A = env.CLOUDFLARE_ACCOUNT_ID;
if (!T || !A) {
  fail("CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID missing (.env.local)");
  process.exit(1);
}

const src = readFileSync(resolve(VERCEL_DIR, "edge/router.worker.js"), "utf8");
const boundary = "----gosboundary";
const metadata = JSON.stringify({
  main_module: "router.worker.js",
  compatibility_date: "2026-08-27",
  bindings: [
    { type: "plain_text", name: "VERCEL_ORIGIN", text: env.VERCEL_ORIGIN || "game-os-seismic2.vercel.app" },
    { type: "plain_text", name: "NAMECHEAP_ORIGIN", text: env.NAMECHEAP_ORIGIN || "68.65.120.165" },
    { type: "plain_text", name: "ROUTE_API", text: "true" },
  ],
});

const body = Buffer.concat([
  Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\nContent-Type: application/json\r\n\r\n${metadata}\r\n`),
  Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="router.worker.js"; filename="router.worker.js"\r\nContent-Type: application/javascript+module\r\n\r\n`),
  Buffer.from(src),
  Buffer.from(`\r\n--${boundary}--\r\n`),
]);

console.log(bold("\nDeploying edge router Worker\n"));
const res = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${A}/workers/scripts/game-os-router`,
  {
    method: "PUT",
    headers: { Authorization: `Bearer ${T}`, "Content-Type": `multipart/form-data; boundary=${boundary}` },
    body,
  },
);
const out = await res.json();
if (out.success) {
  ok("Worker game-os-router deployed");
} else {
  fail(JSON.stringify(out.errors));
  process.exit(1);
}
info(`VERCEL_ORIGIN=${env.VERCEL_ORIGIN || "game-os-seismic2.vercel.app"}`);
