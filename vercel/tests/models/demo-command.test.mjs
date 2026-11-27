// Unit tests for public/game-os/demo-command/model.js. Run: npm run test:models
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const M = require("../../public/game-os/demo-command/model.js");
const PM = require("../../public/game-os/page-engine/model.js");

/** `n` daily rows ending on `end`; fn(i, date) returns the row's fields. */
function days(end, n, fn, src = "csv") {
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = PM.addDays(end, -(n - 1 - i));
    out.push(Object.assign({ from: d, to: d, src }, fn(i, d)));
  }
  return out;
}
const END = "2026-11-20";

test("parseDuration reads minutes, hours, seconds and h:mm", () => {
  assert.equal(M.parseDuration("42", "minutes"), 42);
  assert.equal(M.parseDuration("1.5", "hours"), 90);
  assert.equal(M.parseDuration("1,800", "seconds"), 30);
  assert.equal(M.parseDuration("1:05", "minutes"), 65);
  assert.equal(M.parseDuration("0:30:30", "seconds"), 30.5);
  assert.equal(M.parseDuration("25 min", "minutes"), 25);
  assert.equal(M.parseDuration("", "minutes"), null);
  assert.equal(M.parseDuration("-", "minutes"), null);
  assert.equal(M.parseDuration("n/a", "minutes"), null);
});

test("tableFromCsv sums players per date and drops playtime where a date repeats", () => {
  const csv = PM.parseCsv("Demo report\nDate,Country,New users,Median time\n2026-11-01,DE,10,20\n2026-11-01,US,15,30\n2026-11-02,US,7,12\nTotal,,32,\n");
  const hi = PM.findHeader(csv.rows);
  const t = M.tableFromCsv(csv.rows, hi, { date: 0, players: 2, playtime: 3 }, "ymd", "minutes");
  assert.equal(t.rows.length, 2);
  assert.deepEqual(t.rows[0], { from: "2026-11-01", to: "2026-11-01", players: 25 });
  assert.equal(t.rows[1].playtime, 12);
  assert.equal(t.playtimeDropped, 1, "a median can't be summed across rows");
  assert.equal(t.skipped, 1, "the totals row");
});

test("looksCumulative flags a running total, not a daily count", () => {
  const run = Array.from({ length: 20 }, (_, i) => 100 + i * 5);
  assert.equal(M.looksCumulative(run), true);
  assert.equal(M.looksCumulative(run.slice(0, 10)), false, "too short to tell");
  const daily = run.slice(); daily[7] = 50;
  assert.equal(M.looksCumulative(daily), false);
  assert.equal(M.looksCumulative(Array(20).fill(10)), false, "flat isn't growing");
});

test("players: Poisson range on the 28-day count, change only when ranges separate", () => {
  const demo = days(END, 56, (i) => ({ players: i < 28 ? 20 : 40 }));
  const P = M.players(demo, END);
  assert.equal(P.now.count, 1120);
  assert.ok(P.now.lo < 1120 && P.now.hi > 1120);
  assert.equal(P.change, "up");
  const flat = M.players(days(END, 56, () => ({ players: 20 })), END);
  assert.equal(flat.change, "flat");
});

test("players needs 75% of the window's days", () => {
  const demo = days(END, 20, () => ({ players: 50 }));
  const P = M.players(demo, END);
  assert.equal(P.enough, false);
  assert.equal(P.now.w.covered, 20);
});

test("per100: wishlist adds per 100 demo players, with the adds' range", () => {
  const demo = days(END, 28, () => ({ players: 50 }));      // 1,400 players
  const wish = days(END, 28, () => ({ adds: 7 }));          // 196 adds
  const r = M.per100(demo, wish, END);
  assert.equal(r.enough, true);
  assert.equal(r.value, 14);
  assert.ok(r.lo < 14 && r.hi > 14);
  const P = PM.poisson(196, 28);
  assert.ok(Math.abs(r.lo - 100 * P.lo / 50) < 1e-9, "range is the adds' Poisson range per demo player");
});

test("per100 says why it can't read", () => {
  const wish = days(END, 28, () => ({ adds: 7 }));
  assert.equal(M.per100(days(END, 28, () => ({ players: 3 })), wish, END).reason, "players_few");
  assert.equal(M.per100(days(END, 28, () => ({ players: 50 })), days(END, 28, () => ({ adds: 0 })), END).reason, "adds_few");
  assert.equal(M.per100(days(END, 28, () => ({ players: 50 })), [], END).reason, "adds_days");
  assert.equal(M.per100([], wish, END).reason, "players_days");
});

test("attributed: Wilson share only when the export attributes wishlists to demo players", () => {
  const demo = days(END, 28, () => ({ players: 50, wishlisted: 5 }));
  const a = M.attributed(demo, END);
  assert.equal(a.enough, true);
  assert.equal(a.w.p, 0.1);
  assert.equal(M.attributed(days(END, 28, () => ({ players: 50 })), END).enough, false);
});

test("playtime: exact when one row covers the window, players-weighted median otherwise", () => {
  const one = [{ from: PM.addDays(END, -27), to: END, src: "form", players: 500, playtime: 34 }];
  const p1 = M.playtime(one, END);
  assert.equal(p1.value, 34);
  assert.equal(p1.exact, true);
  const demo = days(END, 28, (i) => ({ players: i < 20 ? 10 : 100, playtime: i < 20 ? 5 : 40 }));
  const p = M.playtime(demo, END);
  assert.equal(p.exact, false);
  assert.equal(p.value, 40, "most players are in the long-playtime days");
  assert.equal(M.playtime(days(END, 28, () => ({ players: 2, playtime: 10 })), END).enough, false, "too few players");
});

test("Next Fests: past editions with sources, plus Window Planner's upcoming ones", () => {
  const F = M.nextFests();
  assert.ok(F.length >= 4);
  F.forEach((f) => { assert.ok(PM.isYmd(f.start) && PM.isYmd(f.end) && f.end >= f.start); assert.match(f.source, /^https:\/\//); });
  M.PAST_NEXT_FESTS.forEach((f) => assert.ok(f.checked));
  for (let i = 1; i < F.length; i++) assert.ok(F[i].start > F[i - 1].start, "sorted, no duplicates");
});

test("festRead compares the fest days with the 28 days before", () => {
  const fest = { id: "x", name: "Steam Next Fest", start: "2026-10-19", end: "2026-10-26" };
  const end = "2026-11-10";
  const demo = days(end, 70, (i, d) => ({ players: d >= fest.start && d <= fest.end ? 400 : 30 }));
  const wish = days(end, 70, (i, d) => ({ adds: d >= fest.start && d <= fest.end ? 40 : 5 }));
  const r = M.festRead(demo, wish, fest, end);
  assert.equal(r.enough, true);
  assert.equal(r.days, 8);
  assert.equal(r.playersChange, "up");
  assert.equal(r.ratio.value, 10);
  assert.equal(M.festRead(demo, wish, { start: "2027-02-22", end: "2027-03-01" }, end).reason, "future");
  const gap = demo.filter((x) => x.from !== "2026-10-21");
  assert.equal(M.festRead(gap, wish, fest, end).reason, "fest_days");
});

test("analyse and signals: only measures above their minimum are sent, each with meta", () => {
  const demo = days(END, 56, () => ({ players: 50, playtime: 30 }));
  const wish = days(END, 56, () => ({ adds: 7 }));
  const R = M.analyse({ demo, wishlists: wish });
  const S = M.signals(R);
  assert.deepEqual(S.map((s) => s.key), ["demo_players_28d", "demo_wishlists_per_100", "demo_median_playtime"]);
  S.forEach((s) => { assert.ok(s.meta.half && s.meta.source && s.meta.method && s.meta.window); assert.ok(s.meta.n > 0); });
  assert.equal(S[0].meta.half, "reach");
  assert.equal(S[1].meta.half, "resonance");
  assert.equal(S[1].meta.ratio_not_conversion, true);
  assert.equal(S[2].unit, "minutes");
  const few = M.analyse({ demo: days(END, 28, () => ({ players: 2 })), wishlists: wish });
  assert.deepEqual(M.signals(few), [], "below 100 players nothing is sent");
  assert.equal(M.analyse({ demo: [], wishlists: wish }).empty, true);
});
