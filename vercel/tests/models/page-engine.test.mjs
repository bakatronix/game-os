// Unit tests for public/game-os/page-engine/model.js. Run: npm run test:models
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const M = require("../../public/game-os/page-engine/model.js");

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ""} expected ${b}, got ${a}`);

/** `n` daily rows ending on `end`, with fields from fn(i) (i = 0 is the oldest day). */
function days(end, n, fn, src) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = M.addDays(end, -(n - 1 - i));
    out.push(Object.assign({ from: d, to: d, src: src || "csv" }, fn(i, d)));
  }
  return out;
}

test("parseCsv handles quotes, CRLF, BOM and semicolons", () => {
  const p = M.parseCsv('﻿Date;"Adds, total";Note\r\n2026-11-01;"1,234";"say ""hi"""\r\n\r\n2026-11-02;5;x');
  assert.equal(p.delimiter, ";");
  assert.deepEqual(p.rows[0], ["Date", "Adds, total", "Note"]);
  assert.deepEqual(p.rows[1], ["2026-11-01", "1,234", 'say "hi"']);
  assert.equal(p.rows.length, 3);
});

test("findHeader skips title lines above the table", () => {
  const p = M.parseCsv("Wishlist report\nMy Game\nDate,Adds,Deletes\n2026-11-01,3,1\n2026-11-02,4,0\n");
  assert.equal(M.findHeader(p.rows), 2);
});

test("suggest maps by keyword and never reuses a column", () => {
  const s = M.suggest(["DateLocal", "Wishlist Additions", "Wishlist Deletions", "Purchases and Activations"], ["date", "adds", "deletes", "purchases"]);
  assert.deepEqual(s, { date: 0, adds: 1, deletes: 2, purchases: 3 });
  assert.equal(M.suggest(["foo"], ["date"]).date, undefined);
});

test("dates: ISO, day-first, month-first and guessing the order", () => {
  assert.equal(M.parseDate("2026-11-03"), "2026-11-03");
  assert.equal(M.parseDate("2026/11/03 00:00"), "2026-11-03");
  assert.equal(M.parseDate("03/11/2026", "dmy"), "2026-11-03");
  assert.equal(M.parseDate("11/03/2026", "mdy"), "2026-11-03");
  assert.equal(M.parseDate("2026-02-30"), null);
  assert.equal(M.guessDateOrder(["25/11/2026", "01/11/2026"]), "dmy");
  assert.equal(M.guessDateOrder(["11/25/2026"]), "mdy");
  assert.equal(M.guessDateOrder(["01/02/2026"]), "ambiguous");
});

test("parseCount drops separators and treats blanks as missing", () => {
  assert.equal(M.parseCount("1,234"), 1234);
  assert.equal(M.parseCount(" 12 "), 12);
  assert.equal(M.parseCount(""), null);
  assert.equal(M.parseCount("n/a"), null);
  assert.equal(M.parseCount("-7"), -7);
});

test("tableFromCsv sums regions per day, keeps the split, and stores deletes as positive", () => {
  const p = M.parseCsv("Date,Region,Adds,Deletes\n2026-11-01,EU,10,-2\n2026-11-01,NA,5,-1\n2026-11-02,EU,3,0\nTotal,,18,-3\n");
  const t = M.tableFromCsv(p.rows, 0, { date: 0, region: 1, adds: 2, deletes: 3 }, "wishlists", "ymd");
  assert.deepEqual(t.rows.map((r) => [r.from, r.adds, r.deletes]), [["2026-11-01", 15, 3], ["2026-11-02", 3, 0]]);
  assert.deepEqual(t.regions["2026-11-01"], { EU: 10, NA: 5 });
  assert.equal(t.skipped, 1);
});

test("merge replaces overlapping rows instead of double counting", () => {
  const a = [{ from: "2026-11-01", to: "2026-11-07", adds: 70 }];
  const b = days("2026-11-03", 3, () => ({ adds: 5 }));
  const m = M.merge(a, b);
  assert.equal(m.length, 3);
  assert.equal(M.windowSum(m, "adds", "2026-11-03", 3).count, 15);
});

test("windowSum leaves out multi-day rows that straddle the edge and reports coverage", () => {
  const s = [{ from: "2026-10-30", to: "2026-11-05", adds: 70 }].concat(days("2026-11-28", 20, () => ({ adds: 2 })));
  const w = M.windowSum(s, "adds", "2026-11-28", 28);
  assert.equal(w.count, 40); assert.equal(w.covered, 20); assert.equal(w.enough, false); // 20 < 21
  const w2 = M.windowSum(s.concat([{ from: "2026-11-01", to: "2026-11-08", adds: 8 }]), "adds", "2026-11-28", 28);
  assert.equal(w2.covered, 28); assert.equal(w2.enough, true);
});

test("velocity: up only when the Poisson ranges don't overlap", () => {
  const s = days("2026-11-28", 56, (i) => ({ adds: i < 28 ? 2 : 10 }));
  const v = M.velocity(s, "2026-11-28", 28);
  close(v.nowRate.rate, 10, 1e-9); close(v.beforeRate.rate, 2, 1e-9);
  assert.equal(v.change, "up");
  const flat = M.velocity(days("2026-11-28", 56, (i) => ({ adds: i < 28 ? 9 : 10 })), "2026-11-28", 28);
  assert.equal(flat.change, "flat");
  // Too few adds across both windows: no call either way.
  const thin = M.velocity(days("2026-11-28", 14, (i) => ({ adds: i < 7 ? 0 : 1 })), "2026-11-28", 7);
  assert.equal(thin.change, null);
});

test("deletes per 100 adds uses the deletes' Poisson range and a minimum", () => {
  const s = days("2026-11-28", 28, () => ({ adds: 5, deletes: 1 }));
  const d = M.deletesPer100(s, "2026-11-28");
  assert.equal(d.enough, true); close(d.value, 20, 1e-9);
  const p = M.poisson(28, 28);
  close(d.lo, 100 * p.lo / 5, 1e-9); close(d.hi, 100 * p.hi / 5, 1e-9);
  assert.equal(M.deletesPer100(days("2026-11-28", 28, () => ({ adds: 1, deletes: 0 })), "2026-11-28").enough, false);
});

test("click-through is a Wilson share and needs enough impressions", () => {
  const t = days("2026-11-28", 28, () => ({ impressions: 100, visits: 5 }));
  const c = M.ctr(t, "2026-11-28", 28);
  assert.equal(c.enough, true);
  const w = M.wilson(140, 2800);
  close(c.w.p, 0.05, 1e-12); close(c.w.lo, w.lo, 1e-12); close(c.w.hi, w.hi, 1e-12);
  assert.equal(M.ctr(days("2026-11-28", 28, () => ({ impressions: 10, visits: 1 })), "2026-11-28", 28).enough, false);
});

test("visits to wishlists is adds per 100 visits", () => {
  const w = days("2026-11-28", 28, () => ({ adds: 3 }));
  const t = days("2026-11-28", 28, () => ({ impressions: 1000, visits: 60 }));
  const r = M.visitsToWishlist(w, t, "2026-11-28", 28);
  assert.equal(r.enough, true); close(r.value, 5, 1e-9);
  assert.ok(r.lo < 5 && r.hi > 5);
});

test("beat lift: rise, overlap and too-few-days", () => {
  const s = days("2026-11-28", 40, (i, d) => ({ adds: d >= "2026-11-15" && d <= "2026-11-21" ? 40 : 10 }));
  const beats = [
    { id: "a", date: "2026-11-15", type: "trailer" },
    { id: "b", date: "2026-11-18", type: "announcement" },
    { id: "c", date: "2026-11-27", type: "sale" },
  ];
  const r = M.beatLift(s, beats, []);
  const a = r.find((x) => x.beat.id === "a");
  assert.equal(a.enough, true); assert.equal(a.baselinePerDay, 10); assert.equal(a.expected, 70); assert.equal(a.after, 280);
  assert.equal(a.verdict, "rise");
  assert.deepEqual(a.overlaps.map((o) => o.id), ["b"]);
  const c = r.find((x) => x.beat.id === "c");
  assert.equal(c.enough, false); // only two days after it
  // Deleted beats are ignored.
  assert.equal(M.beatLift(s, [{ id: "x", date: "2026-11-15", type: "trailer", deleted: true }], []).length, 0);
});

test("beat lift: a flat week is 'none'", () => {
  const s = days("2026-11-28", 40, () => ({ adds: 10 }));
  const r = M.beatLift(s, [{ id: "a", date: "2026-11-10", type: "update" }], []);
  assert.equal(r[0].verdict, "none");
});

test("region share pools small regions", () => {
  const regions = { "2026-11-20": { EU: 50, NA: 40, BR: 5 }, "2026-11-21": { EU: 10, JP: 3 } };
  const r = M.regionShare(regions, "2026-11-28");
  assert.equal(r.n, 108);
  assert.deepEqual(r.rows.map((x) => x.region), ["EU", "NA", "Other (each under 30 adds)"]);
  close(r.rows[0].w.p, 60 / 108, 1e-12);
});

test("UTM ratio only above the visit minimum", () => {
  const t = M.utmTable([{ source: "x", visits: 200, wishlists: 10 }, { source: "y", visits: 10, wishlists: 5 }]);
  close(t[0].ratio.value, 5, 1e-9);
  assert.equal(t[1].ratio, null);
});

test("analyse and signals: provenance on every row, nothing below minimums", () => {
  const S = {
    wishlists: days("2026-11-28", 56, () => ({ adds: 10, deletes: 2 })).concat([{ from: "2026-11-28", to: "2026-11-28", adds: 10, deletes: 2, outstanding: 5000, src: "csv" }]),
    traffic: days("2026-11-28", 56, () => ({ impressions: 2000, visits: 100 }), "form"),
  };
  S.wishlists = M.merge([], S.wishlists);
  const R = M.analyse(S);
  assert.equal(R.end, "2026-11-28");
  const sig = M.signals(R);
  assert.deepEqual(sig.map((x) => x.key).sort(), ["page_ctr_28d", "page_visits_to_wishlist_28d", "wishlist_adds_28d", "wishlist_deletes_per_100_adds_28d", "wishlists_outstanding"]);
  for (const x of sig) {
    assert.ok(["reach", "resonance"].includes(x.meta.half), x.key);
    assert.ok(x.meta.source && x.meta.method && x.meta.n != null && x.meta.window, x.key);
  }
  const by = Object.fromEntries(sig.map((x) => [x.key, x]));
  assert.equal(by.wishlist_adds_28d.value, 280);
  assert.equal(by.wishlist_adds_28d.meta.source, "steamworks-export");
  assert.equal(by.page_ctr_28d.meta.source, "studio-entered");
  assert.equal(by.page_ctr_28d.value, 5);
  assert.equal(by.wishlist_deletes_per_100_adds_28d.meta.half, "resonance");
  assert.equal(R.verdict.next, "steady");
  assert.deepEqual(M.signals(M.analyse({ wishlists: days("2026-11-28", 5, () => ({ adds: 1 })) })), []);
  assert.equal(M.analyse({}).empty, true);
});

test("verdict points at the half that moved", () => {
  const base = { vel28: { change: "flat" }, ctrChange: "flat", vtwChange: "flat", delChange: "flat" };
  assert.equal(M.verdict(Object.assign({}, base, { ctrChange: "down" })).next, "reach");
  assert.equal(M.verdict(Object.assign({}, base, { delChange: "up" })).next, "resonance");
  assert.equal(M.verdict(Object.assign({}, base, { vel28: { change: "down" }, vtwChange: "down" })).next, "both");
  assert.equal(M.verdict(Object.assign({}, base, { vel28: { change: "up" } })).next, "up");
});

test("beat and version ledger rows round-trip, latest row per id wins, deletes stick", () => {
  const b = { id: "b1", date: "2026-11-10", type: "trailer", channel: "YouTube", effort: "major", spend: null, note: "Reveal", updated: 100 };
  const row = M.beatSignal(b);
  assert.equal(row.key, "beat"); assert.equal(row.value, 1); assert.equal(row.meta.kind, "beat");
  assert.equal(row.meta.half, undefined);
  const edited = M.beatSignal(Object.assign({}, b, { note: "Reveal trailer", updated: 200 }));
  const del = M.versionSignal({ id: "v1", date: "2026-11-01", asset: "capsule", label: "v2", number: 2, updated: 300, deleted: true });
  assert.equal(del.value, 2); assert.equal(del.meta.kind, "creative_version");
  const logs = M.logsFromLedger([edited, row, del, { key: "steam_players", meta: {} }].map((r) => ({ key: r.key, value: r.value, meta: r.meta, observedAt: "2026-11-20T00:00:00Z" })));
  assert.equal(logs.beats.length, 1); assert.equal(logs.beats[0].note, "Reveal trailer");
  assert.equal(logs.versions[0].deleted, true);
  const merged = M.mergeLog([b], logs.beats);
  assert.equal(merged.length, 1); assert.equal(merged[0].updated, 200);
  assert.equal(M.nextVersion([{ asset: "capsule", number: 2 }, { asset: "capsule", number: 3, deleted: true }, { asset: "header", number: 5 }], "capsule"), 3);
});
