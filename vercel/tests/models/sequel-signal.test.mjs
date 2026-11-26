// Unit tests for public/game-os/sequel-signal/model.js. Run: npm run test:models
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const M = require("../../public/game-os/sequel-signal/model.js");

const at = "2026-11-20T06:00:00.000Z";
const e = (key, value, meta, extra = {}) => ({ key, toolId: extra.toolId || "sentiment-radar", label: extra.label || key, unit: extra.unit || "pct", value, meta: meta || null, observedAt: extra.observedAt || at, history: [{ value, observedAt: at }] });

const LEDGER = [
  e("review_velocity_28d", 3.2, { half: "reach", n: 90, window: "2026-10-23/2026-11-19", lo: 2.6, hi: 3.9, change: "down" }, { unit: "per_day" }),
  e("neg_review_early_share", 41, { half: "resonance", n: 60, lo: 29, hi: 54 }),
  e("sentiment_divergence", -9.5, { half: "resonance", n: 140, alarm: true }),
  e("steam_reviews", 1200, { appid: 1 }, { toolId: "steam", unit: "units" }),
  e("steam_review_pct", 81, null, { toolId: "steam" }),
  e("steam_players", 140, null, { toolId: "steam", unit: "units" }),
  e("beat", 1, { kind: "beat", id: "b1" }, { toolId: "page-engine", unit: "count" }),
  e("market_median_revenue", 42000, { half: "market", tags: ["Roguelike", "Deckbuilding"], from: "2023-11-01", to: "2026-11-01", copies_per_review: 30, price_paid_pct: 65 }, { toolId: "market-scope", unit: "usd" }),
  e("market_p75_revenue", 180000, null, { toolId: "market-scope", unit: "usd" }),
  e("market_hit_rate", 22, null, { toolId: "market-scope" }),
  e("market_releases_last_year", 310, null, { toolId: "market-scope", unit: "units" }),
  e("test_lift", 2.1, { half: "reach", verdict: "can't tell" }, { toolId: "test-loop" }),
  e("old_thing", 5, null, { toolId: "mystery-tool", unit: "units" }),
];

test("classify splits the ledger by half, maps snapshot keys, and leaves out log records", () => {
  const g = M.classify(LEDGER);
  assert.deepEqual(g.reach.map((r) => r.key).sort(), ["review_velocity_28d", "steam_reviews", "test_lift"]);
  assert.deepEqual(g.resonance.map((r) => r.key).sort(), ["neg_review_early_share", "sentiment_divergence", "steam_review_pct"]);
  assert.deepEqual(g.market.map((r) => r.key).sort(), ["market_hit_rate", "market_median_revenue", "market_p75_revenue", "market_releases_last_year"]);
  assert.deepEqual(g.unlabelled.map((r) => r.key).sort(), ["old_thing", "steam_players"]);
  assert.ok(!JSON.stringify(g).includes('"beat"'), "beats are log records, not measurements");
});

test("row keeps range, n, window, change and the tool link; the map label is marked as the page's", () => {
  const g = M.classify(LEDGER);
  const v = g.reach.find((r) => r.key === "review_velocity_28d");
  assert.equal(v.lo, 2.6); assert.equal(v.hi, 3.9); assert.equal(v.n, 90); assert.equal(v.change, "down");
  assert.equal(v.tool.name, "Sentiment Radar"); assert.equal(v.tool.path, "/game-os/sentiment-radar");
  assert.equal(v.labelledBy, "tool");
  const s = g.reach.find((r) => r.key === "steam_reviews");
  assert.equal(s.labelledBy, "map"); assert.equal(s.tool.name, "Daily Steam snapshot");
  const odd = g.unlabelled.find((r) => r.key === "old_thing");
  assert.equal(odd.tool.path, "/game-os/mystery-tool");
  assert.equal(M.tool("../evil").path, null);
});

test("steam_players stays unlabelled, as agreed", () => {
  assert.equal(M.halfOf({ key: "steam_players", meta: null }), null);
  assert.equal(M.halfOf({ key: "steam_players", meta: { half: "resonance" } }), "resonance");
  assert.equal(M.halfOf({ key: "refund_rate", meta: { source: "studio-entered" } }), "resonance");
});

test("gap: not measured, then nearest evidence in a fixed order", () => {
  const g = M.gap(LEDGER);
  assert.equal(g.status, "not-measured");
  assert.deepEqual(g.nearest.map((r) => r.key), ["neg_review_early_share", "sentiment_divergence"]);
});

test("gap: Sentiment Radar phase 2 rows with meta.flags, and a checked run with none", () => {
  const flagRow = e("expectation_gap_flag", 2, {
    half: "resonance", window: "2026-10-28/2026-11-26", read: 400,
    flags: [
      { claim: "deep tactical combat", complaint: "combat feels shallow", count: 31, n: 120, lo: 19, hi: 34,
        quotes: [{ text: "Combat is just clicking.", url: "https://steamcommunity.com/profiles/1/recommended/2/" }, { text: "x", url: "javascript:alert(1)" }, "plain quote"] },
      { complaint: "too short", count: 12, n: 120 },
      { nothing: true },
    ],
  }, { unit: "units" });
  const g = M.gap([flagRow]);
  assert.equal(g.status, "flags");
  assert.equal(g.flags.length, 2);
  assert.equal(g.read, 400);
  assert.equal(g.found, null);
  const trimmed = M.gap([e("expectation_gap_flag", 5, { found: 5, trimmed: true, flags: [{ claim: "a", complaint: "b" }] }, { unit: "units" })]);
  assert.equal(trimmed.found, 5); assert.equal(trimmed.trimmed, true); assert.equal(trimmed.flags.length, 1);
  assert.equal(g.flags[0].window, "2026-10-28/2026-11-26");
  assert.equal(g.flags[0].quotes[0].url, "https://steamcommunity.com/profiles/1/recommended/2/");
  assert.equal(g.flags[0].quotes[1].url, null, "only Steam links are kept");
  assert.equal(g.flags[0].quotes[2].text, "plain quote");
  assert.equal(g.flags[0].lo, 19);
  const none = M.gap([e("expectation_gap_flag", 0, { flags: [] }, { unit: "units" })]);
  assert.equal(none.status, "none-found");
  // The flag row never lands in the Resonance panel.
  assert.ok(!M.classify([flagRow]).resonance.length);
});

test("marketBaseline reads the tags and assumptions from the median row", () => {
  const b = M.marketBaseline(LEDGER);
  assert.deepEqual(b.tags, ["Roguelike", "Deckbuilding"]);
  assert.equal(b.mult, 30); assert.equal(b.share, 65);
  assert.equal(b.then.median, 42000); assert.equal(b.then.p75, 180000); assert.equal(b.then.p90, null);
  assert.equal(M.marketBaseline(LEDGER.filter((x) => x.key !== "market_median_revenue")), null);
  assert.equal(M.marketBaseline([e("market_median_revenue", 1, { tags: [] })]), null);
});

test("tagIds maps names case-insensitively and reports the missing ones", () => {
  const r = M.tagIds(["roguelike", "Gone Tag"], [{ id: 1716, name: "Roguelike" }, { id: 17389, name: "Deckbuilding" }]);
  assert.deepEqual(r.ids, [1716]);
  assert.deepEqual(r.missing, ["Gone Tag"]);
});

test("marketNow and marketCompare: relative change for money and counts, points for shares", () => {
  const now = M.marketNow({ total: 900, spread: { n: 400, median: 31500, p75: 200000, p90: 900000, overHit: 0.18, underSmall: 0.5 }, crowding: { lastYear: 372, change: 0.2 } });
  assert.equal(now.hit, 18); assert.equal(now.change, 20);
  const rows = M.marketCompare(M.marketBaseline(LEDGER).then, now);
  const med = rows.find((r) => r.id === "median");
  assert.equal(med.rel, -0.25);
  const hit = rows.find((r) => r.id === "hit");
  assert.equal(hit.diff, -4); assert.equal(hit.rel, null);
  const rel = rows.find((r) => r.id === "releases");
  assert.ok(Math.abs(rel.rel - 0.2) < 1e-9);
  // A row with neither side is dropped; a row with only today is kept.
  const p90 = rows.find((r) => r.id === "p90");
  assert.equal(p90.then, null); assert.equal(p90.now, 900000);
  assert.equal(M.marketCompare({}, null).length, 0);
});

test("guidance states facts and the brief's rules, never a verdict", () => {
  const a = M.analyse({ ledger: LEDGER });
  const text = a.guidance.facts.concat(a.guidance.rules).join(" ");
  assert.match(text, /3 Reach signals/);
  assert.match(text, /hasn't been measured/);
  assert.match(text, /sequel inherits the gap/);
  assert.doesNotMatch(text, /recommend(ed)?:|score|\bwill\b|predicts|guarantees/i);
  const empty = M.analyse({ ledger: [] });
  assert.match(empty.guidance.facts.join(" "), /No Reach signals/);
});

test("draft puts this game first in the comps and copies audience, price and genre", () => {
  const game = { title: "Abyss", steamAppId: "123", genre: "Roguelike" };
  const thesis = { audience: "Deckbuilder fans", priceHypothesis: "14.99", compSet: [{ name: "Slay the Spire", appId: 646570 }, { name: "abyss" }, { name: "" }] };
  const d = M.draft(game, thesis, "sequel");
  assert.equal(d.title, "Abyss 2");
  assert.equal(d.genre, "Roguelike");
  assert.equal(d.audience, "Deckbuilder fans");
  assert.equal(d.priceHypothesis, "14.99");
  assert.deepEqual(d.comps, [{ name: "Abyss", appId: 123, price: 14.99 }, { name: "Slay the Spire", appId: 646570 }]);
  assert.equal(M.draft(game, null, "dlc").title, "Abyss: DLC");
  assert.equal(M.draft(game, null, "new").title, "");
  assert.equal(M.draft(game, null, "nope").path, "sequel");
  assert.deepEqual(M.draft({ title: "Solo" }, null, "port").comps, [{ name: "Solo" }]);
});

test("buildCreate validates and builds the two request bodies", () => {
  const bad = M.buildCreate({ title: " ", path: "x", priceHypothesis: "abc" }, { title: "Abyss" });
  assert.equal(bad.errors.length, 3);
  assert.ok(M.buildCreate({ title: "A", path: "dlc", priceHypothesis: "1001" }).errors);
  const ok = M.buildCreate({ title: "Abyss 2", path: "sequel", genre: "Roguelike", audience: "  Fans ", priceHypothesis: "$19.9", comps: [{ name: "Abyss", appId: 123 }, { name: "Abyss" }] }, { title: "Abyss" });
  assert.deepEqual(ok.game, { title: "Abyss 2", genre: "Roguelike", stage: 1 });
  assert.equal(ok.thesis.source, "sequel-signal");
  assert.match(ok.thesis.note, /^Draft from Sequel Signal \(Sequel\), based on Abyss\./);
  assert.equal(ok.thesis.audience, "Fans");
  assert.equal(ok.thesis.priceHypothesis, "19.90");
  assert.deepEqual(ok.thesis.compSet, [{ name: "Abyss", appId: 123 }]);
  assert.equal(ok.hasThesis, true);
  const bare = M.buildCreate({ title: "New thing", path: "new" }, { title: "Abyss" });
  assert.equal(bare.hasThesis, false);
  assert.equal(bare.game.genre, null);
  assert.equal(bare.thesis.priceHypothesis, undefined);
});

test("dedupeComps caps the list at the comp-set limit", () => {
  const many = Array.from({ length: 40 }, (_, i) => ({ name: "Game " + i }));
  assert.equal(M.dedupeComps(many).length, M.MAX_COMPS);
});

test("fmt formats each unit, and percentage points for divergence", () => {
  assert.equal(M.fmt(42000, "usd"), "$42K");
  assert.equal(M.fmt(1500000, "usd"), "$1.5M");
  assert.equal(M.fmt(41.26, "pct"), "41.3%");
  assert.equal(M.fmt(-9.5, "pct", true), "−9.5 pts");
  assert.equal(M.fmt(3.2, "per_day"), "3.2 a day");
  assert.equal(M.fmt(null, "usd"), "—");
  assert.equal(M.fmt(1234, "units"), "1,234");
});
