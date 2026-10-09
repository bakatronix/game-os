#!/usr/bin/env node
/* Middleware session-recognition agent.
 * Logs in via the mock IdP, then verifies the Edge middleware recognizes the
 * session cookie and serves /game-os (instead of looping back to /login).
 * This is the exact failure mode of the Google login loop.
 *
 * Usage: node tests/agent-middleware.mjs <base>
 */

const BASE = process.argv[2] || process.env.GOS_BASE || "https://llamagriffin.com";

let jar = new Map();
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
function store(setCookies) {
  for (const c of setCookies) {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    const k = pair.slice(0, i).trim();
    const v = pair.slice(i + 1).trim();
    if (/Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(c)) jar.delete(k);
    else jar.set(k, v);
  }
}
async function req(url, opts = {}) {
  const res = await fetch(url, { redirect: "manual", ...opts, headers: { ...(opts.headers || {}), cookie: cookieHeader() } });
  store(res.headers.getSetCookie ? res.headers.getSetCookie() : []);
  let body = ""; try { body = await res.text(); } catch {}
  return { status: res.status, location: res.headers.get("location") || "", body };
}

let ok = true;
const check = (l, pass, d = "") => { console.log(`${pass ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${l}${d ? " — " + d : ""}`); ok = ok && pass; };

console.log(`\nMiddleware session recognition against ${BASE}\n`);

// login via mock IdP
const csrf = JSON.parse((await req(`${BASE}/api/auth/csrf`)).body).csrfToken;
const signin = await req(`${BASE}/api/auth/signin/test`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: `csrfToken=${encodeURIComponent(csrf)}&callbackUrl=${encodeURIComponent(BASE + "/game-os")}`,
});
const authorize = await req(signin.location);
const callback = await req(authorize.location);
check("login completed", [302, 303, 307].includes(callback.status) && !/error/.test(callback.location), callback.location);

const sessionCookie = [...jar.keys()].find((k) => /session-token/.test(k));
check("session cookie present", !!sessionCookie, sessionCookie || "none");

// The real test: /game-os must NOT redirect to /login
const gated = await req(`${BASE}/game-os`);
const loops = /\/login/.test(gated.location);
check(
  "middleware recognizes session (GET /game-os does not bounce to /login)",
  !loops,
  loops ? `LOOP -> ${gated.location}` : `status ${gated.status} -> ${gated.location || "served"}`,
);

// account page too
const account = await req(`${BASE}/account`);
check("GET /account does not bounce to /login", !/\/login/.test(account.location), account.location || `status ${account.status}`);

console.log(`\n${ok ? "\x1b[32mPASSED\x1b[0m" : "\x1b[31mFAILED\x1b[0m"}\n`);
process.exit(ok ? 0 : 1);
