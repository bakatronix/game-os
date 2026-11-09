#!/usr/bin/env node
// Deploy just the edge router Worker to Cloudflare (no zone/record changes).
// Reads CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID from .env.local.

import { loadEnv, ok, fail, info, bold, appendWorkerModules } from "./lib.mjs";

const env = loadEnv();
const T = env.CLOUDFLARE_API_TOKEN;
const A = env.CLOUDFLARE_ACCOUNT_ID;
if (!T || !A) {
  fail("CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID missing (.env.local)");
  process.exit(1);
}

const metadata = JSON.stringify({
  main_module: "router.worker.js",
  compatibility_date: "2026-08-27",
  bindings: [
    { type: "plain_text", name: "VERCEL_ORIGIN", text: env.VERCEL_ORIGIN || "game-os-seismic2.vercel.app" },
    { type: "plain_text", name: "NAMECHEAP_ORIGIN", text: env.NAMECHEAP_ORIGIN || "68.65.120.165" },
    { type: "plain_text", name: "ROUTE_API", text: "true" },
  ],
});
const body = new FormData();
body.append("metadata", new Blob([metadata], { type: "application/json" }));
appendWorkerModules(body);

console.log(bold("\nDeploying edge router Worker\n"));
const res = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${A}/workers/scripts/game-os-router`,
  {
    method: "PUT",
    headers: { Authorization: `Bearer ${T}` },
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
