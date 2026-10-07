#!/usr/bin/env node
// Game OS — deploy setup.
// Interactive: checks prereqs, links the Vercel project, collects env vars,
// runs the DB migration, and deploys a preview. Idempotent — safe to re-run.
//
// Usage: node scripts/setup.mjs [--yes]

import { existsSync, appendFileSync, readFileSync } from "node:fs";
import {
  ROOT,
  VERCEL_DIR,
  ENV_PATH,
  loadEnv,
  ask,
  confirm,
  closePrompts,
  step,
  ok,
  warn,
  fail,
  info,
  run,
  hasCommand,
  bold,
} from "./lib.mjs";

const TOTAL = 6;
const autoYes = process.argv.includes("--yes");

async function ensureEnvLine(key, value) {
  if (!existsSync(ENV_PATH)) return;
  const cur = readFileSync(ENV_PATH, "utf8");
  if (new RegExp(`^${key}=`, "m").test(cur)) return;
  appendFileSync(ENV_PATH, `\n${key}=${value}\n`);
}

async function main() {
  console.log(bold("\nGame OS — Vercel setup\n"));

  // 1 — prerequisites
  step(1, TOTAL, "Checking prerequisites");
  const missing = [];
  for (const cmd of ["node", "npm", "npx"]) {
    if (!hasCommand(cmd)) missing.push(cmd);
  }
  if (missing.length) {
    fail(`Missing required commands: ${missing.join(", ")}`);
    process.exit(1);
  }
  ok("node / npm / npx present");
  const hasVercel = hasCommand("vercel");
  info(hasVercel ? "vercel CLI found" : "vercel CLI not global — will use npx");

  // 2 — Vercel login + link
  step(2, TOTAL, "Vercel login and project link");
  const env = loadEnv();
  const linked = existsSync(`${VERCEL_DIR}/.vercel/project.json`);
  if (!linked) {
    warn("Project not linked yet.");
    const go = autoYes || (await confirm("Log in to Vercel and link this project now?"));
    if (!go) {
      fail("Cannot continue without a linked Vercel project.");
      process.exit(1);
    }
    run(hasVercel ? "vercel login" : "npx vercel login", { cwd: VERCEL_DIR });
    run(hasVercel ? "vercel link" : "npx vercel link", { cwd: VERCEL_DIR });
  } else {
    ok("Already linked (.vercel/project.json exists)");
  }

  // 3 — environment variables
  step(3, TOTAL, "Environment variables");
  const required = [
    ["DATABASE_URL", "Neon/Vercel Postgres connection string"],
    ["AUTH_SECRET", "run `npx auth secret` to generate one"],
    ["AUTH_URL", "public URL, e.g. https://llamagriffin.com"],
    ["AUTH_GOOGLE_ID", "Google OAuth client id"],
    ["AUTH_GOOGLE_SECRET", "Google OAuth client secret"],
    ["AUTH_DISCORD_ID", "Discord OAuth client id"],
    ["AUTH_DISCORD_SECRET", "Discord OAuth client secret"],
  ];
  const optional = [["ITAD_API_KEY", "IsThereAnyDeal key (price history) — optional"]];

  const collected = {};
  for (const [key, hint] of required) {
    if (env[key]) {
      ok(`${key} present`);
      collected[key] = env[key];
      continue;
    }
    collected[key] = await ask(`  ${key} (${hint})`);
  }
  for (const [key, hint] of optional) {
    if (env[key]) {
      ok(`${key} present`);
      collected[key] = env[key];
      continue;
    }
    const v = await ask(`  ${key} (${hint}) — leave blank to skip`);
    if (v) collected[key] = v;
  }
  collected.AUTH_TRUST_HOST = "true";

  // write to .env.local (gitignored) so the scripts + local dev can read them
  for (const [k, v] of Object.entries(collected)) {
    await ensureEnvLine(k, v);
  }
  ok("Wrote credentials to vercel/.env.local (gitignored)");

  // push to Vercel (production + preview)
  if (autoYes || (await confirm("Push these env vars to Vercel (production + preview)?"))) {
    for (const [k, v] of Object.entries(collected)) {
      for (const target of ["production", "preview", "development"]) {
        try {
          run(
            `${hasVercel ? "vercel" : "npx vercel"} env add ${k} ${target}`,
            {
              cwd: VERCEL_DIR,
              env: { ...process.env, [k]: v },
              quiet: true,
            },
          );
        } catch {
          warn(`env ${k} ${target} may already exist — skipping`);
        }
      }
      ok(`${k} pushed`);
    }
  }

  // 4 — database migration
  step(4, TOTAL, "Database migration");
  if (autoYes || (await confirm("Run the database migration now?"))) {
    if (!collected.DATABASE_URL) {
      fail("DATABASE_URL missing — cannot migrate");
    } else {
      run("npm run db:migrate", {
        cwd: VERCEL_DIR,
        env: { ...process.env, DATABASE_URL: collected.DATABASE_URL },
      });
      ok("Tables created");
    }
  }

  // 5 — build
  step(5, TOTAL, "Local production build");
  if (autoYes || (await confirm("Run a local production build to verify?"))) {
    run("npm run build", {
      cwd: VERCEL_DIR,
      env: { ...process.env, DATABASE_URL: collected.DATABASE_URL || "postgres://x" },
    });
    ok("Build succeeded");
  }

  // 6 — deploy preview
  step(6, TOTAL, "Deploy preview");
  if (autoYes || (await confirm("Deploy a preview to Vercel?"))) {
    run(hasVercel ? "vercel" : "npx vercel", { cwd: VERCEL_DIR });
    ok("Preview deployed — check the *.vercel.app URL above");
  }

  console.log(bold("\nSetup complete."));
  console.log("Next: test the *.vercel.app URL, then follow RUNBOOK.md for the DNS cutover.\n");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closePrompts);
