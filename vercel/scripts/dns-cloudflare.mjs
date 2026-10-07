#!/usr/bin/env node
// Game OS — Cloudflare DNS + edge router setup.
//
// Recreates the llamagriffin.com zone in Cloudflare from the GoDaddy export
// (../"Hosting Stuff"/DNS Settings/llamagriffin.com.txt), deploys the edge
// router Worker, and binds it to llamagriffin.com/*.
//
//   node scripts/dns-cloudflare.mjs --dry-run     # show the plan, change nothing
//   node scripts/dns-cloudflare.mjs               # apply (prompts first)
//
// Needs in vercel/.env.local:
//   CLOUDFLARE_API_TOKEN   (scoped: Zone:Edit, DNS:Edit, Workers Scripts:Edit)
//   CLOUDFLARE_ACCOUNT_ID
//   CLOUDFLARE_ZONE_ID     (optional — resolved by name if absent)
//   VERCEL_ORIGIN          (e.g. game-os-xxxx.vercel.app)
//   NAMECHEAP_ORIGIN       (default 68.65.120.165)

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import {
  ROOT,
  VERCEL_DIR,
  loadEnv,
  confirm,
  closePrompts,
  step,
  ok,
  warn,
  fail,
  info,
  bold,
} from "./lib.mjs";

const DRY = process.argv.includes("--dry-run");
const ZONE_NAME = "llamagriffin.com";
const TOTAL = 5;

const CF = "https://api.cloudflare.com/client/v4";

function token(env) {
  const t = env.CLOUDFLARE_API_TOKEN;
  if (!t) {
    fail("CLOUDFLARE_API_TOKEN missing (vercel/.env.local)");
    process.exit(1);
  }
  return t;
}

async function cf(env, path, opts = {}) {
  const res = await fetch(`${CF}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token(env)}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const body = await res.json();
  if (!body.success) {
    const msg = JSON.stringify(body.errors || body, null, 2);
    throw new Error(`Cloudflare API ${path} failed: ${msg}`);
  }
  return body.result;
}

/** Parse the GoDaddy BIND export into records (ignoring SOA/NS). */
function parseZoneFile(path) {
  const text = readFileSync(path, "utf8");
  const records = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith(";") || line.startsWith("$")) continue;
    if (line.startsWith("@") && line.includes("SOA")) continue;
    // Skip GoDaddy-specific convenience records.
    if (/^_domainconnect\b/.test(line)) continue;
    // Format: name TTL IN TYPE value...
    const m = line.match(
      /^(\S+)\s+(\d+)\s+IN\s+(A|AAAA|CNAME|MX|TXT)\s+(.+)$/,
    );
    if (!m) continue;
    const [, name, ttl, type, restRaw] = m;
    let content = restRaw.trim().replace(/\s+;$/, "");
    let priority;
    if (type === "MX") {
      const mx = content.match(/^(\d+)\s+(.+)$/);
      if (mx) {
        priority = Number(mx[1]);
        content = mx[2].replace(/\.$/, "");
      }
    } else if (type === "CNAME" || type === "A") {
      content = content.replace(/\.$/, "");
      // "www CNAME @" means "www -> apex".
      if (type === "CNAME" && content === "@") content = ZONE_NAME;
    } else if (type === "TXT") {
      content = content.replace(/^"(.*)"$/, "$1");
    }
    records.push({
      name: name === "@" ? ZONE_NAME : `${name}.${ZONE_NAME}`,
      type,
      content,
      ttl: Number(ttl),
      ...(priority !== undefined ? { priority } : {}),
      proxied: false,
    });
  }
  return records;
}

async function resolveZoneId(env) {
  if (env.CLOUDFLARE_ZONE_ID) return env.CLOUDFLARE_ZONE_ID;
  const zones = await cf(env, `/zones?name=${ZONE_NAME}`);
  if (!zones.length) return null;
  return zones[0].id;
}

async function main() {
  console.log(bold(`\nGame OS — Cloudflare setup${DRY ? " (DRY RUN)" : ""}\n`));
  const env = loadEnv();

  const zoneFile = resolve(
    ROOT,
    "Hosting Stuff",
    "DNS Settings",
    "llamagriffin.com.txt",
  );
  const vercelOrigin = env.VERCEL_ORIGIN;
  const namecheapOrigin = env.NAMECHEAP_ORIGIN || "68.65.120.165";

  // 1 — plan
  step(1, TOTAL, "Reading current records");
  if (!existsSync(zoneFile)) {
    warn(`Zone export not found at ${zoneFile} — using built-in defaults`);
  }
  const wantRecords = existsSync(zoneFile)
    ? parseZoneFile(zoneFile)
    : [
        { name: ZONE_NAME, type: "A", content: namecheapOrigin, ttl: 600 },
        { name: `www.${ZONE_NAME}`, type: "CNAME", content: ZONE_NAME, ttl: 3600 },
        { name: ZONE_NAME, type: "MX", content: "mail.protonmail.ch", priority: 10, ttl: 3600 },
        { name: ZONE_NAME, type: "MX", content: "mailsec.protonmail.ch", priority: 20, ttl: 3600 },
        { name: ZONE_NAME, type: "TXT", content: "v=spf1 include:_spf.protonmail.ch ~all", ttl: 3600 },
      ];
  ok(`${wantRecords.length} records to ensure`);
  for (const r of wantRecords) {
    info(`${r.type.padEnd(5)} ${r.name.padEnd(24)} ${r.content}${r.priority ? ` (prio ${r.priority})` : ""}`);
  }

  // 2 — zone
  step(2, TOTAL, "Zone");
  if (DRY) {
    info(`Would ensure zone ${ZONE_NAME} exists; add its nameservers at GoDaddy.`);
  } else {
    let zoneId = await resolveZoneId(env);
    if (!zoneId) {
      const accountId = env.CLOUDFLARE_ACCOUNT_ID;
      if (!accountId) {
        fail("Zone not in Cloudflare and CLOUDFLARE_ACCOUNT_ID missing");
        process.exit(1);
      }
      const zone = await cf(env, `/zones`, {
        method: "POST",
        body: JSON.stringify({ name: ZONE_NAME, account: { id: accountId } }),
      });
      zoneId = zone.id;
      ok(`Created zone ${ZONE_NAME} (id ${zoneId})`);
    } else {
      ok(`Zone exists (id ${zoneId})`);
    }
    env.CLOUDFLARE_ZONE_ID = zoneId;
  }
  const zoneId = env.CLOUDFLARE_ZONE_ID;

  // 3 — records (upsert-ish: create missing, never delete)
  step(3, TOTAL, "DNS records");
  if (DRY) {
    info("Would create any missing records (existing ones left untouched).");
  } else {
    const existing = await cf(env, `/zones/${zoneId}/dns_records?per_page=200`);
    for (const r of wantRecords) {
      const dup = existing.find(
        (e) =>
          e.type === r.type &&
          e.name === r.name &&
          e.content === r.content &&
          (r.priority === undefined || e.priority === r.priority),
      );
      if (dup) {
        info(`exists: ${r.type} ${r.name} ${r.content}`);
        continue;
      }
      const body = { ...r };
      delete body.proxied; // DNS-only for mail/www/apex until we decide proxying
      await cf(env, `/zones/${zoneId}/dns_records`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      ok(`created: ${r.type} ${r.name} ${r.content}`);
    }
  }

  // 4 — edge router worker
  step(4, TOTAL, "Edge router Worker");
  if (!vercelOrigin) {
    fail("VERCEL_ORIGIN missing — set it to your project's vercel.app host");
    process.exit(1);
  }
  const workerSrc = readFileSync(resolve(VERCEL_DIR, "edge/router.worker.js"), "utf8");
  const scriptName = "game-os-router";
  if (DRY) {
    info(`Would upload Worker "${scriptName}"`);
    info(`  VERCEL_ORIGIN=${vercelOrigin}  NAMECHEAP_ORIGIN=${namecheapOrigin}  ROUTE_API=true`);
  } else {
    const accountId = env.CLOUDFLARE_ACCOUNT_ID;
    if (!accountId) {
      fail("CLOUDFLARE_ACCOUNT_ID missing");
      process.exit(1);
    }
    // Upload as a module Worker with its env vars bound.
    const metadata = {
      main_module: "router.worker.js",
      bindings: [
        { type: "plain_text", name: "VERCEL_ORIGIN", text: vercelOrigin },
        { type: "plain_text", name: "NAMECHEAP_ORIGIN", text: namecheapOrigin },
        { type: "plain_text", name: "ROUTE_API", text: "true" },
      ],
      compatibility_date: "2026-08-27",
    };
    const form = new FormData();
    form.append(
      "metadata",
      new Blob([JSON.stringify(metadata)], { type: "application/json" }),
    );
    form.append(
      "router.worker.js",
      new Blob([workerSrc], { type: "application/javascript+module" }),
      "router.worker.js",
    );
    const res = await fetch(
      `${CF}/accounts/${accountId}/workers/scripts/${scriptName}`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${token(env)}` },
        body: form,
      },
    );
    const out = await res.json();
    if (!out.success) {
      throw new Error(`Worker upload failed: ${JSON.stringify(out.errors, null, 2)}`);
    }
    ok(`Uploaded Worker ${scriptName}`);
  }

  // 5 — route binding (+ optional apex proxying)
  step(5, TOTAL, "Route binding");
  if (DRY) {
    info(`Would route zone ${ZONE_NAME}/* to Worker ${scriptName}`);
    info("Would leave DNS proxying off until you verify email.");
  } else {
    await cf(env, `/zones/${zoneId}/workers/routes`, {
      method: "POST",
      body: JSON.stringify({ pattern: `${ZONE_NAME}/*`, script: scriptName }),
    });
    ok(`Route ${ZONE_NAME}/* -> ${scriptName}`);
  }

  console.log(bold("\nDone."));
  if (!DRY) {
    console.log(
      "Next: set the two nameservers Cloudflare shows for this zone at GoDaddy.\n" +
        "Then run: node scripts/verify.mjs\n",
    );
  } else {
    console.log("Re-run without --dry-run to apply.\n");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closePrompts);
