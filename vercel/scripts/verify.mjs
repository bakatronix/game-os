#!/usr/bin/env node
// Game OS — post-cutover verification.
// Checks that the marketing site + content still serve, email records are
// intact, and /game-os/* is now served by Vercel.
//
//   node scripts/verify.mjs

import { execSync } from "node:child_process";
import { loadEnv, closePrompts, bold, ok, fail, warn, info, green, red } from "./lib.mjs";

const DOMAIN = "llamagriffin.com";

function dig(name, type) {
  // Retry a couple of times: some resolvers intermittently time out on TXT.
  for (let i = 0; i < 3; i++) {
    try {
      const out = execSync(`dig +short ${name} ${type}`, {
        stdio: ["ignore", "pipe", "pipe"],
      })
        .toString()
        .trim();
      if (out) return out;
    } catch {
      /* retry */
    }
  }
  return "";
}

/** DNS-over-HTTPS lookup (cloudflare) — reliable where dig TXT times out. */
async function doh(name, type) {
  try {
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`,
      { headers: { accept: "application/dns-json" } },
    );
    const body = await res.json();
    return (body.Answer || []).map((a) => a.data).join("\n");
  } catch {
    return "";
  }
}

async function head(url) {
  try {
    const res = await fetch(url, { redirect: "manual", method: "GET" });
    return {
      status: res.status,
      server: res.headers.get("server") || "",
      vercel: res.headers.get("x-vercel-id") || "",
      cfRay: res.headers.get("cf-ray") || "",
    };
  } catch (e) {
    return { error: String(e) };
  }
}

/** Fetch forcing the name to an IP (bypasses stale local resolver cache). */
function headVia(url, ip) {
  try {
    const out = execSync(
      `curl -sI -m 20 --resolve "${new URL(url).hostname}:443:${ip}" "${url}"`,
      { stdio: ["ignore", "pipe", "pipe"] },
    ).toString();
    const h = (name) => {
      const m = out.match(new RegExp(`^${name}:\\s*(.+)$`, "im"));
      return m ? m[1].trim() : "";
    };
    const statusM = out.match(/^HTTP\/[\d.]+ (\d+)/m);
    return {
      status: statusM ? Number(statusM[1]) : 0,
      server: h("server"),
      vercel: h("x-vercel-id"),
      cfRay: h("cf-ray"),
    };
  } catch {
    return { status: 0, server: "", vercel: "", cfRay: "" };
  }
}

const results = [];
function record(label, pass, detail) {
  results.push({ label, pass, detail });
  console.log(`  ${pass ? green("✓") : red("✗")} ${label} — ${detail}`);
}

async function main() {
  console.log(bold(`\nGame OS — verification for ${DOMAIN}\n`));
  const env = loadEnv();

  // 1 — DNS
  console.log("DNS records");
  const a = dig(DOMAIN, "A") || (await doh(DOMAIN, "A"));
  const mx = dig(DOMAIN, "MX") || (await doh(DOMAIN, "MX"));
  const ns = dig(DOMAIN, "NS") || (await doh(DOMAIN, "NS"));
  const spf = await doh(DOMAIN, "TXT");
  const dmarc = await doh(`_dmarc.${DOMAIN}`, "TXT");

  record("apex A resolves", !!a, a || "none");
  record("MX present (Proton)", /protonmail\.ch/i.test(mx), mx || "none");
  record("NS present", !!ns, ns.split("\n").join(", ") || "none");
  record("SPF present", /spf1/i.test(spf), spf.includes("spf1") ? "ok" : "missing");
  record("DMARC present", /DMARC1/i.test(dmarc), dmarc.includes("DMARC1") ? "ok" : "missing");

  const onCloudflare = /cloudflare/i.test(ns) || ns.includes("ns.cloudflare.com");
  record(
    "Nameservers on Cloudflare",
    onCloudflare,
    onCloudflare ? ns.split("\n")[0] : "still GoDaddy — cutover not done",
  );

  // Resolve the apex to its current IP (authoritative via DoH) so checks are
  // not fooled by a stale local resolver cache.
  const apexIpMatch = (await doh(DOMAIN, "A")).match(/[\d.]+/);
  const apexIp = apexIpMatch ? apexIpMatch[0] : "68.65.120.165";
  info(`apex -> ${apexIp} (bypassing local DNS cache)`);

  // 2 — site paths still on Namecheap
  console.log("\nMarketing site + content (must stay on Namecheap)");
  const paths = ["/", "/Data/Index/", "/press/"];
  for (const p of paths) {
    const r = headVia(`https://${DOMAIN}${p}`, apexIp);
    const code = r.status ?? 0;
    record(
      `${p}`,
      code === 200 || code === 301 || code === 302,
      `${code || "ERR"}${r.vercel ? " (VERCEL!)" : ""}`,
    );
  }

  // 3 — game-os served by Vercel
  console.log("\nGame OS (target: Vercel)");
  const g = headVia(`https://${DOMAIN}/game-os/`, apexIp);
  const code = g.status ?? 0;
  const viaVercel = !!g.vercel || /vercel/i.test(g.server);
  record("/game-os/ reachable", code === 200 || code === 307 || code === 308 || code === 302, `${code || "ERR"}`);
  record(
    "/game-os/ served by Vercel",
    viaVercel,
    g.vercel ? `x-vercel-id ${g.vercel}` : `server=${g.server || "?"}`,
  );
  if (g.cfRay) info(`cf-ray ${g.cfRay}`);

  // 4 — direct Vercel origin (from env)
  if (env.VERCEL_ORIGIN) {
    console.log("\nDirect Vercel origin");
    const d = await head(`https://${env.VERCEL_ORIGIN}/game-os/`);
    record(
      `${env.VERCEL_ORIGIN}/game-os/`,
      [200, 307, 308, 302].includes(d.status ?? 0),
      `${d.status ?? "ERR"}`,
    );
  }

  // summary
  const failed = results.filter((r) => !r.pass);
  console.log(bold(`\n${results.length - failed.length}/${results.length} checks passed.`));
  if (failed.length) {
    console.log(red("Failures:"));
    for (const f of failed) console.log(`  - ${f.label}: ${f.detail}`);
    process.exitCode = 1;
  } else {
    console.log(green("All checks passed."));
  }
  console.log("");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closePrompts);
