#!/usr/bin/env node
/* End-to-end auth agent against the mock OIDC IdP.
 * Exercises the FULL callback path: signin -> authorize -> code -> token ->
 * id_token (with iss) -> callback -> session. Works wherever ENABLE_TEST_AUTH
 * is on, so it can run against Vercel too: node tests/agent-auth-e2e.mjs <base>
 */

const BASE = process.argv[2] || process.env.GOS_BASE || "http://localhost:8831";

let jar = new Map();
function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}
function storeCookies(setCookies) {
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
  const res = await fetch(url, {
    redirect: "manual",
    ...opts,
    headers: { ...(opts.headers || {}), cookie: cookieHeader() },
  });
  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  storeCookies(setCookies);
  let body = "";
  try { body = await res.text(); } catch {}
  return { status: res.status, location: res.headers.get("location") || "", body, setCookies };
}

function log(label, ok, detail = "") {
  console.log(`${ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${label}${detail ? " — " + detail : ""}`);
  return ok;
}

let allOk = true;
const check = (l, ok, d) => { allOk = log(l, ok, d) && allOk; };

console.log(`\nE2E auth (mock OIDC) against ${BASE}\n`);

// 1. CSRF
const csrf = await req(`${BASE}/api/auth/csrf`);
const csrfToken = JSON.parse(csrf.body).csrfToken;
check("GET /api/auth/csrf", !!csrfToken && csrf.status === 200);

// 2. signin/test -> redirect to mock authorize
const signin = await req(`${BASE}/api/auth/signin/test`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: `csrfToken=${encodeURIComponent(csrfToken)}&callbackUrl=${encodeURIComponent(BASE + "/game-os")}`,
});
const toAuthorize = /authorize/.test(signin.location);
check("POST signin/test -> authorize", toAuthorize, signin.location.slice(0, 80));
const pkce = [...jar.keys()].some((k) => /pkce/.test(k));
check("PKCE cookie issued", pkce);

// 3. follow authorize -> it redirects to callback with ?code
const authorize = await req(signin.location);
const toCallback = /\/api\/auth\/callback\/test\?.*code=/.test(authorize.location);
check("authorize -> callback with code", toCallback, authorize.location.slice(0, 80));

// 4. follow callback -> exchange + session
const callback = await req(authorize.location);
const cbOk = [302, 303, 307].includes(callback.status);
check("GET callback completes (redirect)", cbOk, `status ${callback.status} -> ${callback.location.slice(0, 60)}`);
const errLoc = /error/.test(callback.location);
check("callback does NOT redirect to an error", !errLoc, callback.location.slice(0, 80));

// 5. session is created
const session = await req(`${BASE}/api/auth/session`);
const hasUser = /test-agent@llamagriffin.com/.test(session.body) || /"user"/.test(session.body);
check("session contains the user", hasUser, session.body.slice(0, 100));

console.log(`\n${allOk ? "\x1b[32mALL PASSED\x1b[0m" : "\x1b[31mFAILURES\x1b[0m"}\n`);
process.exit(allOk ? 0 : 1);
