// Unit tests for lib/long-tail-sources.ts (Long Tail Engine's public Steam reads). Run: npm run test:lib
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as L from "../../lib/long-tail-sources.ts";

/** A fake fetch that answers by URL prefix and records the calls. */
function fake(routes) {
  const calls = [];
  const f = async (url) => {
    calls.push(String(url));
    for (const [prefix, res] of routes) {
      if (String(url).startsWith(prefix)) {
        const r = typeof res === "function" ? res(String(url)) : res;
        const status = r.status || 200;
        return { ok: status < 300, status, headers: { get: () => r.type || "application/json" }, json: async () => r.body };
      }
    }
    return { ok: false, status: 404, headers: { get: () => "text/html" }, json: async () => ({}) };
  };
  f.calls = calls;
  return f;
}

const HIST = { success: 1, results: { rollup_type: "week", start_date: 1772409600, end_date: 1795996800,
  rollups: [{ date: 1772409600, recommendations_up: 90, recommendations_down: 10 }, { date: "bad" }],
  recent: [{ date: 1795910400, recommendations_up: 3, recommendations_down: 1 }] } };
const DETAILS = { 413150: { success: true, data: { name: "Stardew Valley", type: "game", is_free: false,
  release_date: { coming_soon: false, date: "26 Feb, 2016" },
  price_overview: { currency: "USD", initial: 1499, final: 1499, discount_percent: 0 },
  supported_languages: "English<strong>*</strong>, German, Spanish - Spain, Portuguese - Brazil<br><strong>*</strong>languages with full audio support",
  genres: [{ id: "23", description: "Indie" }] } } };
const NEWS = { appnews: { newsitems: [
  { title: "1.6 patch notes", url: "https://store.steampowered.com/news/1", date: 1710000000, tags: ["patchnotes"] },
  { title: "Dev blog", url: "javascript:alert(1)", date: 1700000000 },
] } };

const ok = () => fake([
  ["https://store.steampowered.com/appreviewhistogram/", { body: HIST }],
  ["https://store.steampowered.com/api/appdetails", { body: DETAILS }],
  ["https://api.steampowered.com/ISteamNews/", { body: NEWS }],
]);

beforeEach(() => L._resetCache());

test("parseLanguages strips the HTML, the asterisks and the footnote", () => {
  assert.deepEqual(L.parseLanguages(DETAILS[413150].data.supported_languages), ["English", "German", "Spanish - Spain", "Portuguese - Brazil"]);
  assert.deepEqual(L.parseLanguages(null), []);
});

test("tailData shapes all three parts and caches a full answer", async () => {
  const f = ok();
  const a = await L.tailData(413150, { fetcher: f, now: 1_000_000 });
  assert.equal(a.complete, true);
  assert.equal(a.cached, false);
  const b = a.body;
  assert.equal(b.histogram.rollup_type, "week");
  assert.deepEqual(b.histogram.rollups, [{ date: 1772409600, up: 90, down: 10 }]);
  assert.equal(b.details.priceCents, 1499);
  assert.equal(b.details.releaseText, "26 Feb, 2016");
  assert.deepEqual(b.details.languages, ["English", "German", "Spanish - Spain", "Portuguese - Brazil"]);
  assert.equal(b.news[0].patchnotes, true);
  assert.equal(b.news[1].url, null); // only https links are passed on
  assert.deepEqual(b.missing, []);
  assert.equal(f.calls.length, 3);
  assert.ok(f.calls.some((u) => u.includes("feeds=steam_community_announcements")));
  const again = await L.tailData(413150, { fetcher: f, now: 1_000_000 + L.CACHE_MS - 1 });
  assert.equal(again.cached, true);
  assert.equal(f.calls.length, 3);
  await L.tailData(413150, { fetcher: f, now: 1_000_000 + L.CACHE_MS + 1 });
  assert.equal(f.calls.length, 6);
});

test("a refused part is reported, not retried, and cached only briefly", async () => {
  const f = fake([
    ["https://store.steampowered.com/appreviewhistogram/", { status: 429, body: {} }],
    ["https://store.steampowered.com/api/appdetails", { status: 302, body: {} }],
    ["https://api.steampowered.com/ISteamNews/", { body: NEWS }],
  ]);
  const a = await L.tailData(10, { fetcher: f, now: 0 });
  assert.equal(a.complete, false);
  assert.deepEqual(a.body.missing, [{ part: "histogram", reason: "rate-limited" }, { part: "details", reason: "redirected" }]);
  assert.equal(f.calls.length, 3);
  assert.equal((await L.tailData(10, { fetcher: f, now: L.SHORT_CACHE_MS - 1 })).cached, true);
  assert.equal((await L.tailData(10, { fetcher: f, now: L.SHORT_CACHE_MS + 1 })).cached, false);
});

test("appdetails without success, or a non-USD price, gives no details or no price", async () => {
  const f = fake([
    ["https://store.steampowered.com/appreviewhistogram/", { body: HIST }],
    ["https://store.steampowered.com/api/appdetails", { body: { 5: { success: false } } }],
    ["https://api.steampowered.com/ISteamNews/", { body: {} }],
  ]);
  const a = await L.tailData(5, { fetcher: f, now: 0 });
  assert.equal(a.body.details, null);
  assert.deepEqual(a.body.missing, [{ part: "details", reason: "empty" }]);
  const g = fake([
    ["https://store.steampowered.com/appreviewhistogram/", { body: HIST }],
    ["https://store.steampowered.com/api/appdetails", { body: { 6: { success: true, data: { price_overview: { currency: "EUR", initial: 999 } } } } }],
    ["https://api.steampowered.com/ISteamNews/", { body: NEWS }],
  ]);
  assert.equal((await L.tailData(6, { fetcher: g, now: 0 })).body.details.priceCents, null);
});
