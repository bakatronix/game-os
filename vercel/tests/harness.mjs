/* Minimal async test harness — no external deps.
 * Suites are registered, then run sequentially and awaited by runAll().
 */

export const results = [];

export function makeSuite(name) {
  const tests = [];
  return {
    describe(suiteName, fn) {
      const ctx = {
        it(title, fn2) {
          tests.push({ suite: suiteName, name: title, fn: fn2 });
        },
      };
      fn(ctx);
    },
    async run() {
      for (const t of tests) {
        const started = Date.now();
        process.stdout.write(`\x1b[2m[${t.suite}]\x1b[0m ${t.name} ... `);
        try {
          await t.fn();
          results.push({ ...t, ok: true, ms: Date.now() - started });
          process.stdout.write(`\x1b[32m✓\x1b[0m \x1b[2m(${Date.now() - started}ms)\x1b[0m\n`);
        } catch (err) {
          results.push({ ...t, ok: false, ms: Date.now() - started, error: String(err?.message || err) });
          process.stdout.write(`\x1b[31m✗\x1b[0m\n    \x1b[31m${String(err?.message || err).split("\n")[0]}\x1b[0m\n`);
        }
      }
      return tests.length;
    },
  };
}

export function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}
export function assertEq(a, b, msg) {
  if (a !== b) throw new Error(`${msg || "not equal"}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

export async function http(url, opts = {}) {
  const res = await fetch(url, { redirect: "manual", ...opts });
  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  let body = "";
  try {
    body = await res.text();
  } catch {}
  return {
    status: res.status,
    location: res.headers.get("location") || "",
    headers: res.headers,
    setCookie,
    server: res.headers.get("server") || "",
    vercel: res.headers.get("x-vercel-id") || "",
    body,
  };
}

export function cookieHeader(setCookies) {
  return setCookies.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
}

export function summary(base) {
  const pass = results.filter((r) => r.ok).length;
  const fail = results.length - pass;
  console.log(`\n\x1b[1m${pass}/${results.length} passed\x1b[0m${fail ? ` \x1b[31m(${fail} failed)\x1b[0m` : ""}`);
  console.log(`target: ${base}\n`);
  if (fail) {
    console.log("Failures:");
    for (const r of results.filter((x) => !x.ok)) console.log(`  - [${r.suite}] ${r.name}: ${r.error}`);
  }
  return fail;
}
