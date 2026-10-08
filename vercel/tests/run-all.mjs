#!/usr/bin/env node
/* Test runner — orchestrates the health, OAuth, and browser agents.
 * Usage: node tests/run-all.mjs [baseUrl]
 */

import { spawnSync } from "node:child_process";
import { bold, green, red, dim } from "./lib-print.mjs";

const BASE = process.argv[2] || process.env.GOS_BASE || "https://llamagriffin.com";
const env = { ...process.env, GOS_BASE: BASE };

const agents = [
  ["Health agent", "node", ["tests/agent-health.mjs", BASE]],
  ["OAuth agent", "node", ["tests/agent-oauth.mjs", BASE]],
  ["Browser agent", "npx", ["playwright", "test"]],
];

console.log(bold(`\nGame OS test run — ${BASE}\n`));

let failed = 0;
for (const [name, cmd, args] of agents) {
  console.log(bold(`\n▶ ${name}`));
  const r = spawnSync(cmd, args, { stdio: "inherit", env });
  if (r.status !== 0) {
    failed++;
    console.log(red(`  ${name} FAILED`));
  } else {
    console.log(green(`  ${name} passed`));
  }
}

console.log(bold(`\n${agents.length - failed}/${agents.length} agents passed`));
process.exit(failed ? 1 : 0);
