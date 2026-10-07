// Shared helpers for the Game OS deploy scripts.
// No external deps — keeps the scripts runnable with plain node.

import { readFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const VERCEL_DIR = resolve(ROOT, "vercel");
export const ENV_PATH = resolve(VERCEL_DIR, ".env.local");

/** Parse a .env file (simple KEY=VALUE, ignores comments/blank lines). */
export function parseEnv(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

/** Load .env.local merged with process.env (process.env wins). */
export function loadEnv() {
  const file = parseEnv(ENV_PATH);
  const merged = { ...file, ...process.env };
  return merged;
}

const rl = createInterface({ input: process.stdin, output: process.stdout });

/** Ask a free-text question. */
export function ask(question, { defaultValue = "" } = {}) {
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  return new Promise((res) => {
    rl.question(`${question}${suffix}: `, (answer) => {
      res(answer.trim() || defaultValue);
    });
  });
}

/** Yes/no confirmation. */
export async function confirm(question, { defaultYes = false } = {}) {
  const hint = defaultYes ? "[Y/n]" : "[y/N]";
  const answer = (await ask(`${question} ${hint}`)).toLowerCase();
  if (!answer) return defaultYes;
  return answer === "y" || answer === "yes";
}

export function closePrompts() {
  rl.close();
}

/** Colour helpers (no deps). */
const c = (code) => (s) => `\x1b[${code}m${s}\x1b[0m`;
export const green = c(32);
export const red = c(31);
export const yellow = c(33);
export const bold = c(1);
export const dim = c(2);

export function step(n, total, title) {
  console.log(`\n${bold(`[${n}/${total}]`)} ${title}`);
}

export function ok(msg) {
  console.log(`  ${green("✓")} ${msg}`);
}
export function warn(msg) {
  console.log(`  ${yellow("!")} ${msg}`);
}
export function fail(msg) {
  console.log(`  ${red("✗")} ${msg}`);
}
export function info(msg) {
  console.log(`  ${dim(msg)}`);
}

/** Run a shell command, streaming output; throws on failure. */
export function run(cmd, { cwd = ROOT, env = process.env, quiet = false } = {}) {
  if (!quiet) info(`$ ${cmd}`);
  return execSync(cmd, { cwd, env, stdio: quiet ? "pipe" : "inherit" });
}

/** Run a shell command capturing stdout; returns string. */
export function capture(cmd, { cwd = ROOT, env = process.env } = {}) {
  return execSync(cmd, { cwd, env, stdio: ["ignore", "pipe", "pipe"] })
    .toString()
    .trim();
}

export function hasCommand(name) {
  try {
    execSync(`command -v ${name}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
