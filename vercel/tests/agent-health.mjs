#!/usr/bin/env node
/* Platform health agent — routes, gating, APIs, content.
 * Usage: node tests/agent-health.mjs [baseUrl]
 */

import { makeSuite, assert, assertEq, http, summary } from "./harness.mjs";

const BASE = process.argv[2] || process.env.GOS_BASE || "https://llamagriffin.com";
const { describe, run } = makeSuite("health");

describe("Marketing site (Namecheap via Cloudflare)", (t) => {
  t.it("GET / returns 200", async () => {
    const r = await http(`${BASE}/`);
    assertEq(r.status, 200, "status");
    assert(r.body.length > 1000, "has content");
  });
  t.it("GET /Data/Index/ returns 200 (case studies)", async () => {
    const r = await http(`${BASE}/Data/Index/`);
    assert([200, 301, 302].includes(r.status), `status ${r.status}`);
  });
  t.it("GET /press/ returns 200", async () => {
    const r = await http(`${BASE}/press/`);
    assert([200, 301, 302].includes(r.status), `status ${r.status}`);
  });
  t.it("marketing NOT served by Vercel", async () => {
    const r = await http(`${BASE}/`);
    assert(!r.vercel, "should not carry x-vercel-id");
  });
});

describe("Game OS app shell", (t) => {
  t.it("GET /login returns 200 on Vercel", async () => {
    const r = await http(`${BASE}/login`);
    assertEq(r.status, 200, "status");
    assert(r.vercel, "served by Vercel");
    assert(/Game OS/i.test(r.body), "renders");
  });
  t.it("GET /game-os/ redirects (chain) to login", async () => {
    let r = await http(`${BASE}/game-os/`);
    assert([307, 308, 302].includes(r.status), `status ${r.status}`);
    // Follow up to 3 hops (trailing-slash normalisation then gate).
    let loc = r.location;
    for (let i = 0; i < 3 && loc && !/\/login/.test(loc); i++) {
      const next = loc.startsWith("http") ? loc : `${BASE}${loc}`;
      r = await http(next);
      loc = r.location || loc;
    }
    assert(/\/login/.test(loc), `chain reaches /login (got ${loc})`);
  });
  t.it("GET /game-os redirects with callbackUrl", async () => {
    const r = await http(`${BASE}/game-os`);
    assert([307, 308, 302].includes(r.status), `status ${r.status}`);
    assert(/\/login\?callbackUrl=/.test(r.location), `location ${r.location}`);
  });
  t.it("gated pages redirect to login", async () => {
    for (const p of ["/account", "/admin", "/admin/analytics"]) {
      const r = await http(`${BASE}${p}`);
      assert([307, 308, 302].includes(r.status), `${p} -> ${r.status}`);
      assert(/\/login/.test(r.location), `${p} -> ${r.location}`);
    }
  });
});

describe("Tools (all gated to Game OS accounts)", (t) => {
  const tools = [
    ["/game-os/price-calc", /Pricing Dashboard|price/i],
    ["/game-os/PMF", /PMF Analyzer/i],
    ["/game-os/chicken-brulee", /Chicken Brûlée|Playtest/i],
    ["/seismic", /Seismic/i],
    ["/game-os/steam-page-audit", /Steam Page Audit/i],
  ];
  for (const [path] of tools) {
    t.it(`${path} requires auth (redirects to /login)`, async () => {
      let r = await http(`${BASE}${path}`);
      if (r.status === 308 && r.location) {
        const next = r.location.startsWith("http") ? r.location : `${BASE}${r.location}`;
        r = await http(next);
      }
      assert([307, 302, 200].includes(r.status), `status ${r.status}`);
      if (r.status !== 200) assert(/\/login/.test(r.location), `${path} -> ${r.location}`);
    });
  }
  // Assets are public (not gated) — verify they serve for each tool.
  const assets = [
    "/game-os/assets/app.js",
    "/seismic/js/app.js",
    "/game-os/steam-page-audit/assets/app.js",
  ];
  for (const a of assets) {
    t.it(`${a} serves (200)`, async () => {
      const r = await http(`${BASE}${a}`);
      assertEq(r.status, 200, `status ${r.status}`);
    });
  }
});

describe("Public APIs", (t) => {
  t.it("GET /api/apps returns the registry", async () => {
    const r = await http(`${BASE}/api/apps`);
    assertEq(r.status, 200, "status");
    const d = JSON.parse(r.body);
    assert(Array.isArray(d.gates) && d.gates.length >= 5, "5+ gates");
    assert(d.gates.some((g) => g.id === "price-calc"), "has price-calc");
  });
  t.it("GET /api/me null when signed out", async () => {
    const r = await http(`${BASE}/api/me`);
    assertEq(r.status, 200, "status");
    assertEq(JSON.parse(r.body).user, null, "user null");
  });
  t.it("GET /api/steam proxies live data", async () => {
    const r = await http(`${BASE}/api/steam?appid=105600`);
    assertEq(r.status, 200, "status");
    assert(/Terraria/.test(r.body), "returns Terraria");
  });
  t.it("POST /api/v1/analyze scores a game", async () => {
    const r = await http(`${BASE}/api/v1/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: 105600 }),
    });
    assertEq(r.status, 200, "status");
    const d = JSON.parse(r.body);
    assert(d.lenses?.satisfaction?.score > 0, "scored");
    assertEq(d.game_name, "Terraria", "game_name");
  });
  t.it("POST /api/track accepts an event", async () => {
    const r = await http(`${BASE}/api/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anon_id: "a_agenttest", events: [{ event_name: "page_view", tool_id: "test", props: {} }] }),
    });
    assertEq(r.status, 200, "status");
    assert(/"ok":true/.test(r.body), "ok");
  });
  t.it("POST /api/steam-page-audit scores a game", async () => {
    const r = await http(`${BASE}/api/steam-page-audit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: 105600 }),
    });
    assertEq(r.status, 200, "status");
    const d = JSON.parse(r.body);
    assert(d.overall > 0 && d.grade, "scored");
    assert(Array.isArray(d.criteria) && d.criteria.length >= 5, "criteria present");
  });
});

describe("Auth mechanics", (t) => {
  t.it("providers list google + discord with public callbacks", async () => {
    const r = await http(`${BASE}/api/auth/providers`);
    assertEq(r.status, 200, "status");
    const d = JSON.parse(r.body);
    assert(d.google && d.discord, "both providers");
    assert(d.google.callbackUrl.startsWith(BASE), `google callback (${d.google.callbackUrl})`);
    assert(d.discord.callbackUrl.startsWith(BASE), `discord callback (${d.discord.callbackUrl})`);
  });
  t.it("csrf returns a token", async () => {
    const r = await http(`${BASE}/api/auth/csrf`);
    assertEq(r.status, 200, "status");
    assert(/csrfToken/.test(r.body), "csrfToken");
  });
  t.it("session null when signed out", async () => {
    const r = await http(`${BASE}/api/auth/session`);
    assertEq(r.status, 200, "status");
    assertEq(r.body.trim(), "null", "session null");
  });
});

await run();
const failed = summary(BASE);
process.exit(failed ? 1 : 0);
