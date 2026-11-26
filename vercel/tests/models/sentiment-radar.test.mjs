// Unit tests for public/game-os/sentiment-radar/model.js. Run: npm run test:models
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const M = require("../../public/game-os/sentiment-radar/model.js");

const DAY = 86400000;
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ""} expected ${b}, got ${a}`);
const sec = (ms) => Math.floor(ms / 1000);

test("wilson matches published values", () => {
  // 61 of 100: 0.5122–0.7003 (Wilson 1927; e.g. Newcombe 1998 method 3)
  const w = M.wilson(61, 100);
  close(w.lo, 0.5122, 0.0005, "lo"); close(w.hi, 0.7003, 0.0005, "hi");
  // 0 of 10: 0–0.2775
  const z = M.wilson(0, 10);
  assert.equal(z.lo, 0); close(z.hi, 0.2775, 0.0005);
  // n = 0 gives no interval
  assert.equal(M.wilson(0, 0).p, null);
});

test("poisson gives the exact (Garwood) interval", () => {
  // count 10: 4.795–18.390; count 0: 0–3.689; count 1: 0.0253–5.572
  let p = M.poisson(10, 1); close(p.lo, 4.795, 0.002); close(p.hi, 18.390, 0.002);
  p = M.poisson(0, 1); assert.equal(p.lo, 0); close(p.hi, 3.689, 0.002);
  p = M.poisson(1, 1); close(p.lo, 0.0253, 0.0005); close(p.hi, 5.572, 0.002);
  // Rates scale by days
  p = M.poisson(56, 28); close(p.rate, 2, 1e-9); close(p.lo * 28, M.poisson(56, 1).lo, 1e-6);
});

test("change says up or down only when intervals don't overlap", () => {
  assert.equal(M.change(M.poisson(60, 28), M.poisson(20, 28)), "up");
  assert.equal(M.change(M.poisson(20, 28), M.poisson(60, 28)), "down");
  assert.equal(M.change(M.poisson(30, 28), M.poisson(25, 28)), "flat");
  assert.equal(M.change(M.poisson(30, 28), null), null);
});

const now = Date.UTC(2026, 10, 24, 12);
function ledger({ all = 78, pct30 = 61, n30 = 140, reviews = 2000 } = {}) {
  const at = new Date(now - 6 * 3600000).toISOString();
  return [
    { key: "steam_reviews", value: reviews, observedAt: at },
    { key: "steam_review_pct", value: all, observedAt: at },
    { key: "steam_review_pct_30d", value: pct30, observedAt: at },
    { key: "steam_reviews_30d", value: n30, observedAt: at },
  ];
}

test("decay alarm fires when all-time sits above the 30-day interval", () => {
  const d = M.decay(ledger(), [], []);
  assert.equal(d.status, "alarm"); assert.equal(d.alarm, true);
  assert.equal(d.divergence, -17);
  assert.ok(d.recent.hi < 0.78);
});

test("decay alarm stays quiet inside the interval and below the minimum", () => {
  assert.equal(M.decay(ledger({ pct30: 74 }), [], []).status, "steady");
  assert.equal(M.decay(ledger({ pct30: 95 }), [], []).status, "above");
  const few = M.decay(ledger({ n30: M.MIN_RECENT_N - 1, pct30: 20 }), [], []);
  assert.equal(few.status, "too-few"); assert.equal(few.alarm, undefined);
  assert.equal(M.decay([], [], []).status, "no-data");
});

test("decay names the update after which the share drops", () => {
  const upd = now - 12 * DAY;
  const recent = [];
  for (let i = 29; i >= 1; i--) {
    const t = now - i * DAY;
    recent.push(t < upd ? { date: sec(t), recommendations_up: 8, recommendations_down: 1 } : { date: sec(t), recommendations_up: 3, recommendations_down: 5 });
  }
  const news = [{ date: sec(upd), title: "Patch 1.2", feedname: "steam_community_announcements" }, { date: sec(upd), title: "Press", feedname: "pcgamer" }];
  const d = M.decay(ledger(), news, recent);
  assert.equal(d.updates.length, 1);
  assert.equal(d.startsAfter.title, "Patch 1.2");
  assert.ok(d.split.dropAfter);
});

function hist({ type = "week", perDay = 2, priorPerWeek = 14, weeks = 12 } = {}) {
  const today = Math.floor(now / DAY) * DAY;
  const recent = [];
  for (let i = 30; i >= 0; i--) recent.push({ date: sec(today - i * DAY), recommendations_up: perDay, recommendations_down: 0 });
  const rollups = [];
  const step = type === "week" ? 7 : 30;
  for (let i = weeks; i >= 1; i--) rollups.push({ date: sec(today - 30 * DAY - i * step * DAY), recommendations_up: priorPerWeek, recommendations_down: 0 });
  return { rollup_type: type, recent, rollups };
}

test("velocity uses the last 28 complete days and four weekly rollups before them", () => {
  const v = M.velocity(hist(), now);
  assert.equal(v.status, "ok");
  assert.equal(v.last.days, 28); assert.equal(v.last.count, 56); close(v.last.rate, 2, 1e-9);
  assert.equal(v.prior.days, 28); assert.equal(v.prior.count, 56);
  assert.equal(v.change, "flat");
  assert.ok(v.prior.gapDays >= 0);
});

test("velocity reports up, and no earlier window with monthly rollups", () => {
  assert.equal(M.velocity(hist({ perDay: 6, priorPerWeek: 7 }), now).change, "up");
  const m = M.velocity(hist({ type: "month" }), now);
  assert.equal(m.prior, null); assert.equal(m.priorReason, "monthly"); assert.equal(m.change, null);
});

test("velocity below the minimum count is too few to read", () => {
  const v = M.velocity(hist({ perDay: 0, priorPerWeek: 1 }), now);
  assert.equal(v.status, "too-few");
  assert.equal(M.velocity(null, now).status, "no-data");
});

test("playtime converts minutes to hours and splits by verdict", () => {
  const reviews = [];
  for (let i = 0; i < 20; i++) reviews.push({ up: true, playtime: 600 + i * 60 }); // 10h..29h
  for (let i = 0; i < 20; i++) reviews.push({ up: false, playtime: i < 10 ? 60 : 300 });
  reviews.push({ up: false }); // no playtime: ignored
  const p = M.playtime(reviews);
  close(p.pos.median, 19.5, 1e-9); assert.equal(p.pos.n, 20);
  close(p.neg.median, 3, 1e-9); assert.equal(p.neg.n, 20);
  assert.equal(p.early.k, 10); assert.equal(p.early.n, 20); assert.ok(p.early.enough);
});

test("exactly 120 minutes is not early", () => {
  const reviews = Array.from({ length: 20 }, (_, i) => ({ up: false, playtime: i === 0 ? 119 : 120 }));
  assert.equal(M.playtime(reviews).early.k, 1);
  assert.equal(M.playtime(reviews.slice(0, 5)).early.enough, false);
});

test("vocabulary counts once per review, drops stop and name words, finds 3-word phrases", () => {
  const neg = [];
  for (let i = 0; i < 12; i++) neg.push({ up: false, text: i < 4 ? "The save system save system is a waste of money. Hollow Knight is better." : "Combat feels shallow, the save system loses progress.", url: "u" + i });
  const pos = Array.from({ length: 12 }, () => ({ up: true, text: "Gorgeous pixel art and a great soundtrack" }));
  const v = M.vocabulary(neg.concat(pos), { name: "Hollow Knight" });
  const np = v.neg.phrases.map((p) => p.phrase);
  const save = v.neg.phrases.find((p) => p.phrase === "save system");
  assert.equal(save.count, 12, "once per review");
  assert.ok(np.includes("waste of money"));
  assert.ok(!np.some((p) => /hollow|knight/.test(p)), "name words dropped");
  assert.ok(!np.includes("the"));
  assert.ok(save.snippets.length <= 2);
  assert.equal(save.snippets[0].match.toLowerCase(), "save system");
  // "pixel art" is folded into "gorgeous pixel art", which covers all its reviews
  assert.deepEqual(v.pos.phrases.map((p) => p.phrase).slice(0, 1), ["gorgeous pixel art"]);
  assert.ok(!np.includes("shallow the save"), "phrases don't cross punctuation");
  // "save" alone is folded into "save system" (it covers all its reviews)
  assert.ok(!np.includes("save"));
});

test("vocabulary below the minimum lists nothing", () => {
  const v = M.vocabulary([{ up: false, text: "save system" }], {});
  assert.equal(v.neg.enough, false); assert.deepEqual(v.neg.phrases, []);
});

test("mode picks game or comps", () => {
  const comps = [{ name: "A", appId: 10 }, { name: "B" }];
  assert.equal(M.mode({ steamAppId: "413150" }, ledger(), comps).mode, "game");
  const noId = M.mode({ steamAppId: null }, ledger(), comps);
  assert.equal(noId.mode, "comps"); assert.equal(noId.reason, "no-app-id");
  assert.deepEqual(noId.comps.map((c) => c.appid), [10, null]);
  assert.equal(M.mode({ steamAppId: "1" }, ledger({ reviews: 5 }), []).reason, "too-few-reviews");
  assert.equal(M.mode({ steamAppId: "1" }, [], []).reason, "no-snapshot");
});

test("signals carry half and provenance, and none in comps mode", () => {
  const reviews = [];
  for (let i = 0; i < 30; i++) reviews.push({ up: i % 2 === 0, playtime: 30 + i * 10 });
  const r = { mode: "game", decay: M.decay(ledger(), [], []), velocity: M.velocity(hist(), now), playtime: M.playtime(reviews), readWindow: "2026-10-01/2026-11-23" };
  const s = M.signals(r);
  assert.deepEqual(s.map((x) => x.key).sort(), ["playtime_at_review_median", "review_velocity_28d", "sentiment_divergence"]);
  const half = { sentiment_divergence: "resonance", review_velocity_28d: "reach", playtime_at_review_median: "resonance" };
  for (const x of s) {
    assert.equal(x.meta.half, half[x.key]);
    assert.equal(x.meta.source, "steam-public");
    assert.ok(x.meta.method && x.meta.n > 0 && x.meta.window, x.key);
  }
  assert.equal(s.find((x) => x.key === "sentiment_divergence").meta.alarm, true);
  assert.deepEqual(M.signals(Object.assign({}, r, { mode: "comps" })), []);
});

test("early-share signal appears with enough negative reviews and states its rule", () => {
  const reviews = Array.from({ length: 25 }, (_, i) => ({ up: false, playtime: i < 10 ? 30 : 500 }));
  const s = M.signals({ mode: "game", playtime: M.playtime(reviews) });
  const e = s.find((x) => x.key === "neg_review_early_share");
  assert.equal(e.value, 40); assert.equal(e.meta.half, "resonance");
  assert.equal(e.meta.rule_source, M.SOURCE);
});
