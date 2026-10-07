#!/usr/bin/env node
// Wire OAuth credentials quickly.
//
//   node scripts/oauth.mjs \
//     --google-id XXX --google-secret XXX \
//     --discord-id XXX --discord-secret XXX
//
// Or run with no args and paste values at the prompt. Writes them to
// vercel/.env.local and pushes to the Vercel project (all environments).

import {
  VERCEL_DIR,
  loadEnv,
  ask,
  confirm,
  closePrompts,
  step,
  ok,
  fail,
  info,
  bold,
  run,
  hasCommand,
} from "./lib.mjs";

import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

function upsertEnv(key, value) {
  const path = resolve(VERCEL_DIR, ".env.local");
  let cur = existsSync(path) ? readFileSync(path, "utf8") : "";
  const re = new RegExp(`^${key}=.*$`, "m");
  const line = `${key}="${value}"`;
  if (re.test(cur)) cur = cur.replace(re, line);
  else cur += `\n${line}\n`;
  writeFileSync(path, cur);
}

async function main() {
  console.log(bold("\nGame OS — wire OAuth\n"));
  const env = loadEnv();

  const gid = arg("google-id") || env.AUTH_GOOGLE_ID || (await ask("AUTH_GOOGLE_ID"));
  const gsec = arg("google-secret") || env.AUTH_GOOGLE_SECRET || (await ask("AUTH_GOOGLE_SECRET"));
  const did = arg("discord-id") || env.AUTH_DISCORD_ID || (await ask("AUTH_DISCORD_ID"));
  const dsec = arg("discord-secret") || env.AUTH_DISCORD_SECRET || (await ask("AUTH_DISCORD_SECRET"));

  if (!gid || !gsec || !did || !dsec) {
    fail("All four values are required.");
    process.exit(1);
  }

  step(1, 3, "Write vercel/.env.local");
  upsertEnv("AUTH_GOOGLE_ID", gid);
  upsertEnv("AUTH_GOOGLE_SECRET", gsec);
  upsertEnv("AUTH_DISCORD_ID", did);
  upsertEnv("AUTH_DISCORD_SECRET", dsec);
  ok("Saved locally (gitignored)");

  step(2, 3, "Push to Vercel");
  const vc = hasCommand("vercel") ? "vercel" : "npx --yes vercel";
  for (const [k, v] of [
    ["AUTH_GOOGLE_ID", gid],
    ["AUTH_GOOGLE_SECRET", gsec],
    ["AUTH_DISCORD_ID", did],
    ["AUTH_DISCORD_SECRET", dsec],
  ]) {
    for (const target of ["production", "preview", "development"]) {
      const runEnv = { cwd: VERCEL_DIR, env: { ...process.env, [k]: v }, quiet: true };
      try {
        run(`${vc} env add ${k} ${target}`, runEnv);
      } catch {
        // Already exists — update it instead.
        try {
          run(`${vc} env update ${k} ${target}`, runEnv);
        } catch {
          info(`${k} ${target}: add+update both failed — set it in the dashboard`);
        }
      }
    }
    ok(`${k} pushed`);
  }

  step(3, 3, "Redeploy");
  if (await confirm("Redeploy to production now?", { defaultYes: true })) {
    run(`${vc} --prod`, { cwd: VERCEL_DIR });
    ok("Redeployed");
  }

  console.log(bold("\nDone. Test sign-in at /login.\n"));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(closePrompts);
