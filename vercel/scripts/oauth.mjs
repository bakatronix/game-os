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
import { execSync } from "node:child_process";

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
  const push = (name, value, target) => {
    // `vercel env add/update NAME target` reads the value from stdin.
    const cmd = `${vc} env add ${name} ${target}`;
    const upd = `${vc} env update ${name} ${target}`;
    try {
      execSync(cmd, {
        cwd: VERCEL_DIR,
        input: value,
        stdio: ["pipe", "ignore", "ignore"],
      });
      return true;
    } catch {
      try {
        execSync(upd, {
          cwd: VERCEL_DIR,
          input: value,
          stdio: ["pipe", "ignore", "ignore"],
        });
        return true;
      } catch {
        return false;
      }
    }
  };

  for (const [k, v] of [
    ["AUTH_GOOGLE_ID", gid],
    ["AUTH_GOOGLE_SECRET", gsec],
    ["AUTH_DISCORD_ID", did],
    ["AUTH_DISCORD_SECRET", dsec],
  ]) {
    let anyFail = false;
    for (const target of ["production", "preview", "development"]) {
      if (!push(k, v, target)) anyFail = true;
    }
    if (anyFail) fail(`${k}: some targets failed`);
    else ok(`${k} pushed (production/preview/development)`);
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
