// Unit tests for public/game-os/test-loop/model.js. Run: npm run test:models
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const M = require("../../public/game-os/test-loop/model.js");
const PM = require("../../public/game-os/page-engine/model.js");

const close = (a, b, tol = 1e-3) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);

/** Daily rows from `start` for `n` days; fn(i, date) returns the row's fields. */
function days(start, n, fn, src = "csv") {
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = PM.addDays(start, i);
    out.push(Object.assign({ from: d, to: d, src }, fn(i, d)));
  }
  return out;
}

test("newcombe matches Newcombe (1998) method 10 worked examples", () => {
  // 56/70 vs 48/80: difference 0.2000, 95% interval 0.0524 to 0.3339.
  const a = M.newcombe(48, 80, 56, 70);
  close(a.diff, 0.2, 1e-9); close(a.lo, 0.0524); close(a.hi, 0.3339);
  // 9/10 vs 3/10: 0.6, 0.1705 to 0.8090.
  const b = M.newcombe(3, 10, 9, 10);
  close(b.lo, 0.1705); close(b.hi, 0.809);
  // Same data, sides swapped: the interval mirrors.
  const c = M.newcombe(56, 70, 48, 80);
  close(c.lo, -0.3339); close(c.hi, -0.0524);
  assert.equal(M.newcombe(1, 0, 1, 10), null);
});

test("a wider z widens the interval", () => {
  const n95 = M.newcombe(50, 1000, 70, 1000), nB = M.newcombe(50, 1000, 70, 1000, M.Z_BY_COMPARISONS[3]);
  assert.ok(nB.lo < n95.lo && nB.hi > n95.hi);
});

test("rateDiff: per-100 difference with MOVER over exact Poisson ranges, and allows adds above visits", () => {
  const r = M.rateDiff(20, 1000, 40, 1000);
  close(r.diff, 2, 1e-9);
  assert.ok(r.lo > 0 && r.hi > r.diff);
  // Exposure larger than the count makes no difference to validity; adds can exceed visits.
  const s = M.rateDiff(150, 100, 160, 100);
  close(s.diff, 10, 1e-9);
  assert.ok(s.lo < 0 && s.hi > 0);
  assert.equal(M.rateDiff(1, 0, 1, 10), null);
});

test("verdict reads the whole range", () => {
  assert.equal(M.verdict({ lo: 0.1, hi: 2 }), "better");
  assert.equal(M.verdict({ lo: -2, hi: -0.1 }), "worse");
  assert.equal(M.verdict({ lo: -1, hi: 1 }), "can't tell");
  assert.equal(M.verdict(null), null);
});

test("clampDays keeps the window between the minimum and maximum", () => {
  assert.equal(M.clampDays(3), M.MIN_DAYS);
  assert.equal(M.clampDays(200), M.MAX_DAYS);
  assert.equal(M.clampDays("21"), 21);
  assert.equal(M.clampDays("x"), M.DEFAULT_DAYS);
});

test("windows: before ends the day before the change, after starts on it", () => {
  const w = M.windows("2026-10-15", 14);
  assert.deepEqual(w, { before: { start: "2026-10-01", end: "2026-10-14" }, after: { start: "2026-10-15", end: "2026-10-28" } });
});

const CHANGE = { id: "v2", asset: "capsule", label: "v2", number: 2, date: "2026-10-15" };
function store({ impBefore = 2000, visBefore = 100, impAfter = 2000, visAfter = 160, addsBefore = 10, addsAfter = 10, start = "2026-09-17", n = 56 } = {}) {
  const traffic = days(start, n, (i, d) => d < CHANGE.date ? { impressions: impBefore, visits: visBefore } : { impressions: impAfter, visits: visAfter });
  const wishlists = days(start, n, (i, d) => ({ adds: d < CHANGE.date ? addsBefore : addsAfter, deletes: 1 }));
  return { traffic, wishlists, beats: [], versions: [CHANGE] };
}

test("storeTest: click-through rise reads better with a Newcombe range in percentage points", () => {
  const T = M.storeTest(store(), CHANGE, 14);
  assert.equal(T.ctr.enough, true);
  close(T.ctr.result.a.p, 5, 1e-9); close(T.ctr.result.b.p, 8, 1e-9); close(T.ctr.result.diff, 3, 1e-9);
  assert.equal(T.ctr.verdict, "better");
  assert.equal(T.ctr.half, "reach");
  // Visits rose and adds stayed flat, so adds per 100 visits fell: a Resonance drop behind a Reach gain.
  assert.equal(T.v2w.enough, true);
  close(T.v2w.result.a.p, 10, 1e-9); close(T.v2w.result.b.p, 6.25, 1e-9);
  assert.equal(T.v2w.verdict, "worse");
  assert.equal(T.v2w.half, "resonance");
});

test("storeTest: no real change reads can't tell", () => {
  const T = M.storeTest(store({ visAfter: 102 }), CHANGE, 14);
  assert.equal(T.ctr.verdict, "can't tell");
});

test("storeTest: after window still running, gaps, and too few", () => {
  // Data ends 5 days after the change.
  const short = store({ n: 33 });
  let T = M.storeTest(short, CHANGE, 14);
  assert.equal(T.ctr.reason, "running"); assert.equal(T.ctr.daysIn, 5);
  // A missing day in the before window.
  const gap = store(); gap.traffic = gap.traffic.filter((r) => r.from !== "2026-10-05");
  T = M.storeTest(gap, CHANGE, 14);
  assert.equal(T.ctr.reason, "gaps"); assert.equal(T.v2w.reason, "gaps");
  // 50 impressions a day is 700 per window: under the minimum.
  T = M.storeTest(store({ impBefore: 50, impAfter: 50, visBefore: 5, visAfter: 6 }), CHANGE, 14);
  assert.equal(T.ctr.reason, "few"); assert.equal(T.v2w.reason, "few");
  // No traffic at all.
  T = M.storeTest({ traffic: [], wishlists: [], beats: [], versions: [] }, CHANGE, 14);
  assert.equal(T.ctr.reason, "running"); assert.equal(T.ctr.daysIn, 0);
});

test("storeTest: weekly totals that straddle a window edge don't count as covering it", () => {
  const S = store();
  S.traffic = S.traffic.filter((r) => r.from < "2026-10-10" || r.from > "2026-10-16");
  S.traffic.push({ from: "2026-10-10", to: "2026-10-16", impressions: 14000, visits: 900, src: "form" });
  const T = M.storeTest(S, CHANGE, 14);
  assert.equal(T.ctr.reason, "gaps");
});

test("confounders: beats, other changes and Steam events in either window", () => {
  const S = store();
  S.beats = [
    { id: "b1", date: "2026-10-03", type: "trailer", channel: "YouTube" },
    { id: "b2", date: "2026-11-20", type: "sale" },
    { id: "b3", date: "2026-10-20", type: "announcement", deleted: true },
  ];
  S.versions = [CHANGE, { id: "v9", asset: "header", label: "v3", date: "2026-10-25" }, { id: "v1", asset: "capsule", label: "v1", date: "2026-08-01" }];
  const T = M.storeTest(S, CHANGE, 14);
  const names = T.confounders.map((c) => c.kind + ":" + c.name);
  assert.ok(names.includes("beat:trailer (YouTube)"));
  assert.ok(names.includes("version:header v3"));
  // Steam Next Fest, 19–26 Oct 2026, from Demo Command's sourced past list.
  assert.ok(names.some((n) => n.startsWith("event:Steam Next Fest")));
  assert.equal(names.length, 3);
});

test("steamEvents leaves out holidays and doesn't repeat events", () => {
  const ev = M.steamEvents();
  assert.ok(ev.length > 0);
  assert.ok(!ev.some((e) => /Christmas/.test(e.name)));
  const keys = ev.map((e) => e.start + e.name);
  assert.equal(new Set(keys).size, keys.length);
});

test("changes: newest first, deleted ones left out", () => {
  const c = M.changes([{ id: "a", date: "2026-01-01" }, { id: "b", date: "2026-03-01" }, { id: "c", date: "2026-02-01", deleted: true }, { id: "d", date: "bad" }]);
  assert.deepEqual(c.map((x) => x.id), ["b", "a"]);
});

test("positioningLine builds the brief's form, and needs all three parts", () => {
  assert.equal(M.positioningLine({ anchor: "Into the Breach", twist: "a cooking sim", want: "like tight puzzles." }), "Into the Breach meets a cooking sim, for players who like tight puzzles.");
  assert.equal(M.positioningLine({ anchor: "X", twist: "", want: "y" }), "");
});

test("cleanTest: keeps 2–4 variants, drops clicks above impressions, rebuilds positioning text", () => {
  const t = M.cleanTest({ id: "t1", kind: "positioning", name: "Hook", variants: [
    { label: "A", anchor: "Slay the Spire", twist: "fishing", want: "want calm runs", impressions: 500, clicks: 20, text: "ignored" },
    { label: "B", anchor: "Hades", twist: "gardening", want: "like builds", impressions: 400, clicks: 900 },
    { label: "C" }, { label: "D" }, { label: "E" },
  ] });
  assert.equal(t.variants.length, 4);
  assert.equal(t.variants[0].text, "Slay the Spire meets fishing, for players who want calm runs.");
  assert.equal(t.variants[1].clicks, null);
  assert.equal(M.cleanTest({ id: "x", variants: [{ label: "A" }] }), null);
  assert.equal(M.cleanTest({ variants: [{}, {}] }), null);
});

test("variantTest: two variants use plain 95%; a clear winner is named", () => {
  const V = M.variantTest(M.cleanTest({ id: "t", variants: [{ label: "A", impressions: 5000, clicks: 100 }, { label: "B", impressions: 5000, clicks: 180 }] }));
  assert.equal(V.comparisons, 1); close(V.z, 1.96, 1e-3);
  assert.equal(V.rows[0].verdict, "better");
  close(V.rows[0].result.diff, 1.6, 1e-9);
  assert.equal(V.winner, 1);
});

test("variantTest: several variants widen each range; control wins only if every other is worse", () => {
  const V = M.variantTest(M.cleanTest({ id: "t", variants: [
    { label: "A", impressions: 5000, clicks: 300 }, { label: "B", impressions: 5000, clicks: 150 }, { label: "C", impressions: 5000, clicks: 160 },
  ] }));
  assert.equal(V.comparisons, 2);
  assert.ok(V.rows.every((r) => r.verdict === "worse"));
  assert.equal(V.winner, 0);
  const W = M.variantTest(M.cleanTest({ id: "t", variants: [
    { label: "A", impressions: 5000, clicks: 300 }, { label: "B", impressions: 5000, clicks: 150 }, { label: "C", impressions: 5000, clicks: 295 },
  ] }));
  assert.equal(W.winner, null);
});

test("variantTest: too few impressions or missing numbers aren't read", () => {
  const V = M.variantTest(M.cleanTest({ id: "t", variants: [{ label: "A", impressions: 50, clicks: 5 }, { label: "B", impressions: 500, clicks: 9 }, { label: "C" }] }));
  assert.equal(V.rows[0].reason, "few");
  assert.equal(V.rows[1].reason, "missing");
  assert.equal(V.winner, null);
});

test("storeSignal: test_lift with half by metric, provenance and verdict; nothing below the minimum", () => {
  const T = M.storeTest(store(), CHANGE, 14);
  const c = M.storeSignal(T, "ctr"), v = M.storeSignal(T, "v2w");
  assert.equal(c.key, "test_lift"); assert.equal(c.unit, "pct");
  assert.equal(c.value, 3);
  assert.equal(c.meta.half, "reach"); assert.equal(v.meta.half, "resonance");
  assert.equal(c.meta.method, "newcombe95"); assert.equal(v.meta.method, "mover_poisson95");
  assert.equal(c.meta.source, "steamworks-export");
  assert.equal(c.meta.window, "2026-10-01/2026-10-28");
  assert.equal(c.meta.verdict, "better"); assert.equal(v.meta.verdict, "worse");
  assert.equal(c.meta.n, 28000 + 28000);
  assert.ok(c.meta.lo < 3 && c.meta.hi > 3);
  assert.equal(c.meta.variants.before.window, "2026-10-01/2026-10-14");
  assert.equal(c.meta.test.change_id, "v2");
  assert.equal(c.meta.id, "store:v2:ctr:14");
  const few = M.storeTest(store({ impBefore: 50, impAfter: 50, visBefore: 5, visAfter: 6 }), CHANGE, 14);
  assert.equal(M.storeSignal(few, "ctr"), null);
});

test("variantSignals: one row per variant read, Bonferroni noted with several variants", () => {
  const V = M.variantTest(M.cleanTest({ id: "t9", name: "Reddit ad", from: "2026-11-01", to: "2026-11-07", variants: [
    { label: "A", impressions: 5000, clicks: 100 }, { label: "B", impressions: 5000, clicks: 180 }, { label: "C", impressions: 40, clicks: 1 },
  ] }));
  const s = M.variantSignals(V);
  assert.equal(s.length, 1);
  assert.equal(s[0].meta.half, "reach");
  assert.equal(s[0].meta.method, "newcombe95_bonferroni");
  assert.equal(s[0].meta.source, "studio-entered");
  assert.equal(s[0].meta.window, "2026-11-01/2026-11-07");
  assert.equal(s[0].meta.id, "variant:t9:1");
  assert.equal(s[0].meta.variants.control.k, 100);
});
