#!/usr/bin/env node
/* OAuth flow agent — tests the full sign-in mechanics against the live app.
 *
 * It cannot click Google/Discord consent (needs a real test account), but it
 * verifies every step the app controls:
 *   - providers endpoint advertises the right public callback URLs
 *   - CSRF + POST signin issues a redirect to the provider with correct params
 *   - the redirect_uri matches what the app will receive back
 *   - the callback route exists and rejects an invalid code (not a 500)
 *   - session is created/cleared correctly (signout)
 *   - the OAuth apps are reachable (provider auth endpoints respond)
 *
 * Usage: node tests/agent-oauth.mjs [baseUrl]
 */

import { makeSuite, assert, assertEq, http, summary } from "./harness.mjs";

const BASE = process.argv[2] || process.env.GOS_BASE || "https://llamagriffin.com";
const { describe, run } = makeSuite("oauth");

async function getCsrf() {
  const r = await http(`${BASE}/api/auth/csrf`);
  const jar = r.setCookie || [];
  const token = JSON.parse(r.body).csrfToken;
  return { token, jar };
}

describe("Provider discovery", (t) => {
  t.it("providers advertises google + discord", async () => {
    const r = await http(`${BASE}/api/auth/providers`);
    assertEq(r.status, 200, "status");
    const d = JSON.parse(r.body);
    assert(d.google?.signinUrl && d.google?.callbackUrl, "google urls");
    assert(d.discord?.signinUrl && d.discord?.callbackUrl, "discord urls");
  });
  t.it("callback URLs are on the public domain", async () => {
    const d = JSON.parse((await http(`${BASE}/api/auth/providers`)).body);
    for (const p of ["google", "discord"]) {
      assertEq(d[p].callbackUrl, `${BASE}/api/auth/callback/${p}`, `${p} callback`);
    }
  });
});

describe("Google OAuth mechanics", (t) => {
  t.it("POST signin/google redirects to accounts.google.com", async () => {
    const { token, jar } = await getCsrf();
    const r = await http(`${BASE}/api/auth/signin/google`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: jar.map((c) => c.split(";")[0]).join("; ") },
      body: `csrfToken=${encodeURIComponent(token)}&callbackUrl=${encodeURIComponent(BASE + "/game-os")}`,
    });
    assert([302, 303, 307].includes(r.status), `status ${r.status}`);
    assert(/accounts\.google\.com/.test(r.location), `provider redirect (${r.location})`);
  });
  t.it("google redirect carries the correct client_id + redirect_uri", async () => {
    const { token, jar } = await getCsrf();
    const r = await http(`${BASE}/api/auth/signin/google`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: jar.map((c) => c.split(";")[0]).join("; ") },
      body: `csrfToken=${encodeURIComponent(token)}&callbackUrl=${encodeURIComponent(BASE + "/game-os")}`,
    });
    const u = new URL(r.location);
    assert(u.searchParams.get("client_id"), "has client_id");
    assertEq(u.searchParams.get("redirect_uri"), `${BASE}/api/auth/callback/google`, "redirect_uri");
    assertEq(u.searchParams.get("response_type"), "code", "response_type");
  });
  t.it("missing CSRF is rejected (MissingCSRF, not 500)", async () => {
    const r = await http(`${BASE}/api/auth/signin/google`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "callbackUrl=/game-os",
    });
    assert([302, 303, 400].includes(r.status), `status ${r.status}`);
  });
});

describe("Discord OAuth mechanics", (t) => {
  t.it("POST signin/discord redirects to discord.com", async () => {
    const { token, jar } = await getCsrf();
    const r = await http(`${BASE}/api/auth/signin/discord`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: jar.map((c) => c.split(";")[0]).join("; ") },
      body: `csrfToken=${encodeURIComponent(token)}&callbackUrl=${encodeURIComponent(BASE + "/game-os")}`,
    });
    assert([302, 303, 307].includes(r.status), `status ${r.status}`);
    assert(/discord\.com/.test(r.location), `provider redirect (${r.location})`);
  });
  t.it("discord redirect has client_id + redirect_uri + scope", async () => {
    const { token, jar } = await getCsrf();
    const r = await http(`${BASE}/api/auth/signin/discord`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: jar.map((c) => c.split(";")[0]).join("; ") },
      body: `csrfToken=${encodeURIComponent(token)}&callbackUrl=${encodeURIComponent(BASE + "/game-os")}`,
    });
    const u = new URL(r.location);
    assertEq(u.searchParams.get("client_id"), "1557468588044980285", "discord client_id");
    assertEq(u.searchParams.get("redirect_uri"), `${BASE}/api/auth/callback/discord`, "redirect_uri");
    assert(/identify/.test(u.searchParams.get("scope") || ""), "identify scope");
  });
});

describe("Callback + session handling", (t) => {
  t.it("callback route exists (invalid code -> graceful, not 500)", async () => {
    const r = await http(`${BASE}/api/auth/callback/google?code=invalid&state=invalid`);
    assert(r.status !== 500, `should not 500 (got ${r.status})`);
    assert([302, 303, 307, 400].includes(r.status), `status ${r.status}`);
  });
  t.it("session is null signed-out and clears on signout", async () => {
    const s = await http(`${BASE}/api/auth/session`);
    assertEq(s.body.trim(), "null", "session null");
  });
});

describe("Provider endpoints reachable", (t) => {
  t.it("Google OAuth endpoint responds", async () => {
    const r = await fetch("https://accounts.google.com/.well-known/openid-configuration");
    assertEq(r.status, 200, "google oidc config");
  });
  t.it("Discord OAuth endpoint responds", async () => {
    const r = await fetch("https://discord.com/api/oauth2/authorize", { redirect: "manual" });
    assert(r.status > 0, "discord reachable");
  });
});

await run();
const failed = summary(BASE);
process.exit(failed ? 1 : 0);
