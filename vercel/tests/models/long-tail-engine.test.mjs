// Unit tests for public/game-os/long-tail-engine/model.js. Run: npm run test:models
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const M = require("../../public/game-os/long-tail-engine/model.js");
const PM = require("../../public/game-os/page-engine/model.js");
const MM = require("../../public/game-os/market-scope/model.js");

const close = (a, b, tol = 1e-3) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);
const sec = (ymd) => Date.parse(ymd + "T00:00:00Z") / 1000;

/** A weekly histogram from `start`, `weeks` long, plus daily counts for the 30 days before `today`. */
function weeklyHist(start, weekly, today, perDayRecent) {
  const rollups = weekly.map((n, i) => ({ date: sec(PM.addDays(start, 7 * i)), up: n, down: 0 }));
  const recent = [];
  for (let i = 30; i >= 1; i--) recent.push({ date: sec(PM.addDays(today, -i)), up: perDayRecent, down: 0 });
  recent.push({ date: sec(today), up: 99, down: 0 }); // today, still filling up
  return { rollup_type: "week", start_date: sec(start), end_date: sec(PM.addDays(today, -1)), rollups, recent };
}

test("parseReleaseText reads Steam's date forms and rejects the rest", () => {
  assert.equal(M.parseReleaseText("12 Mar, 2024"), "2024-03-12");
  assert.equal(M.parseReleaseText("Mar 12, 2024"), "2024-03-12");
  assert.equal(M.parseReleaseText("3 Sept, 2025"), "2025-09-03");
  assert.equal(M.parseReleaseText("2024-03-12"), "2024-03-12");
  assert.equal(M.parseReleaseText("Coming soon"), null);
  assert.equal(M.parseReleaseText("Q1 2027"), null);
  assert.equal(M.parseReleaseText("31 Feb, 2024"), null);
});

test("buckets: weekly runs 7 days, monthly runs to the month's end", () => {
  const w = M.buckets({ rollup_type: "week", rollups: [{ date: sec("2026-01-05"), up: 7, down: 7 }] });
  assert.deepEqual([w[0].start, w[0].end, w[0].days, w[0].count, w[0].perDay], ["2026-01-05", "2026-01-11", 7, 14, 2]);
  const m = M.buckets({ rollup_type: "month", rollups: [{ date: sec("2026-02-01"), up: 28, down: 0 }] });
  assert.deepEqual([m[0].end, m[0].days, m[0].perDay], ["2026-02-28", 28, 1]);
  // Without rollup_type, the gap between buckets decides.
  const g = M.buckets({ rollups: [{ date: sec("2026-01-05"), up: 1 }, { date: sec("2026-01-12"), up: 1 }] });
  assert.equal(g[0].type, "week");
});

test("legs: last 28 days over the first 28 after release, with Poisson bounds", () => {
  const today = "2026-11-26", release = "2026-03-02";
  // 4 launch weeks of 140 reviews (20 a day), then quieter weeks; 5 a day in the last 30 days.
  const weekly = [140, 140, 140, 140].concat(Array(34).fill(35));
  const L = M.legs(weeklyHist(release, weekly, today, 5), release, today);
  assert.equal(L.status, "ok");
  assert.equal(L.first.from, "2026-03-02");
  assert.equal(L.first.to, "2026-03-29");
  assert.equal(L.first.count, 560);
  assert.equal(L.last.count, 140);
  assert.equal(L.last.to, "2026-11-25"); // today is left out
  close(L.ratio, 0.25);
  assert.ok(L.lo < 0.25 && L.hi > 0.25);
  const P = PM.poisson(140, 28), F = PM.poisson(560, 28);
  close(L.lo, P.lo / F.hi);
  close(L.hi, P.hi / F.lo);
});

test("legs: a release mid-week counts the whole first bucket and shows the real dates", () => {
  const today = "2026-11-26";
  const L = M.legs(weeklyHist("2026-03-02", [70, 140, 140, 140, 140].concat(Array(33).fill(7)), today, 1), "2026-03-05", today);
  assert.equal(L.first.from, "2026-03-02");
  assert.equal(L.first.to, "2026-04-05");
  assert.equal(L.first.count, 630);
});

test("legs: too young, too few and no data", () => {
  assert.equal(M.legs(weeklyHist("2026-10-20", [5, 5], "2026-11-26", 1), "2026-10-20", "2026-11-26").status, "too-young");
  const few = M.legs(weeklyHist("2026-03-02", [3, 3, 3, 3].concat(Array(34).fill(1)), "2026-11-26", 1), "2026-03-02", "2026-11-26");
  assert.equal(few.status, "too-few");
  assert.equal(few.ratio, undefined);
  assert.equal(M.legs(null, "2026-03-02", "2026-11-26").status, "no-data");
  assert.equal(M.legs({ rollups: [], recent: [] }, "2026-03-02", "2026-11-26").status, "no-data");
});

/** Ledger rows for one key, one a day. */
function ledger(key, start, n, fn) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ key, value: fn(i), observedAt: PM.addDays(start, i) + "T06:00:00.000Z" });
  return out;
}

test("dailyFromLedger keeps the latest row per day", () => {
  const rows = [
    { key: "steam_players", value: 10, observedAt: "2026-11-01T06:00:00Z" },
    { key: "steam_players", value: 12, observedAt: "2026-11-01T18:00:00Z" },
    { key: "steam_reviews", value: 99, observedAt: "2026-11-01T06:00:00Z" },
    { key: "steam_players", value: 8, observedAt: "2026-11-02T06:00:00Z" },
  ];
  assert.deepEqual(M.dailyFromLedger(rows, "steam_players"), [{ date: "2026-11-01", value: 12 }, { date: "2026-11-02", value: 8 }]);
});

test("floor: median of the last 7 snapshots over the launch-week median", () => {
  const release = "2026-06-01", today = "2026-11-26";
  const rows = ledger("steam_players", release, 179, (i) => (i < 7 ? [100, 120, 90, 110, 105, 95, 130][i] : i > 170 ? 25 + (i % 3) : 40));
  const F = M.floor(M.dailyFromLedger(rows, "steam_players"), release, today);
  assert.equal(F.status, "ok");
  assert.equal(F.launch.median, 105);
  assert.equal(F.recent.n, 7);
  assert.equal(F.recent.median, 26);
  close(F.ratio, 26 / 105);
});

test("floor: no launch-week snapshots, stale data, too young", () => {
  const release = "2026-01-10", today = "2026-11-26";
  const late = M.dailyFromLedger(ledger("steam_players", "2026-10-01", 50, () => 30), "steam_players");
  const a = M.floor(late, release, today);
  assert.equal(a.status, "no-launch");
  assert.equal(a.first, "2026-10-01");
  const stale = M.dailyFromLedger(ledger("steam_players", release, 60, () => 30), "steam_players");
  assert.equal(M.floor(stale, release, today).status, "stale");
  assert.equal(M.floor(stale, "2026-11-10", today).status, "too-young");
  assert.equal(M.floor([], null, today).status, "no-release");
});

test("dailyReviews: ledger differences, replaced by Steam's exact daily counts", () => {
  const totals = [{ date: "2026-11-01", value: 100 }, { date: "2026-11-02", value: 104 }, { date: "2026-11-03", value: 103 }, { date: "2026-11-05", value: 110 }];
  const hist = { recent: [{ date: sec("2026-11-02"), up: 9, down: 1 }, { date: sec("2026-11-26"), up: 5, down: 0 }] };
  const D = M.dailyReviews(hist, totals, "2026-11-26");
  assert.equal(D.daily["2026-11-01"], 4);
  assert.equal(D.daily["2026-11-02"], 10); // Steam's exact count wins over the ledger's 0 (a fall)
  assert.equal(D.source["2026-11-02"], "steam");
  assert.equal(D.daily["2026-11-03"], undefined); // the gap to 5 Nov isn't one day
  assert.equal(D.daily["2026-11-26"], undefined); // today is still filling up
});

test("tailBeats: sale and update beats plus Steam patch notes, merged by day", () => {
  const pe = [
    { id: "a", date: "2026-07-01", type: "update", channel: "Steam" },
    { id: "b", date: "2026-08-10", type: "sale" },
    { id: "c", date: "2026-08-20", type: "trailer" },
    { id: "d", date: "2026-09-01", type: "sale", deleted: true },
    { id: "e", date: "2026-01-01", type: "update" },
  ];
  const news = [
    { title: "Patch 1.1", date: sec("2026-07-02"), patchnotes: true, url: "https://x" },
    { title: "Patch 1.2", date: sec("2026-09-15"), patchnotes: true },
    { title: "Dev diary", date: sec("2026-09-20"), patchnotes: false },
  ];
  const B = M.tailBeats(pe, news, "2026-03-01");
  assert.deepEqual(B.map((b) => b.date + " " + b.type + " " + b.from), ["2026-09-15 update steam", "2026-08-10 sale page-engine", "2026-07-01 update page-engine"]);
});

test("aroundBeats: reviews by Page Engine's beat method, players as medians", () => {
  const daily = {}, players = [];
  for (let i = 0; i < 40; i++) {
    const d = PM.addDays("2026-08-01", i);
    daily[d] = i >= 20 && i < 27 ? 15 : 5;
    players.push({ date: d, value: i >= 20 && i < 27 ? 60 : 40 });
  }
  const R = M.aroundBeats([{ id: "s", date: "2026-08-21", type: "sale" }], daily, players);
  assert.equal(R.length, 1);
  assert.equal(R[0].reviews.enough, true);
  assert.equal(R[0].reviews.after, 105);
  assert.equal(R[0].reviews.expected, 35);
  assert.equal(R[0].reviews.verdict, "rise");
  assert.equal(R[0].players.enough, true);
  close(R[0].players.change, 0.5);
});

test("aroundBeats: too few reviews or snapshots isn't read", () => {
  const daily = {}, players = [];
  for (let i = 0; i < 40; i++) { const d = PM.addDays("2026-08-01", i); daily[d] = 0; if (i % 3 === 0) players.push({ date: d, value: 10 }); }
  daily["2026-08-22"] = 2;
  const R = M.aroundBeats([{ id: "s", date: "2026-08-21", type: "sale" }], daily, players);
  assert.equal(R[0].reviews.enough, false);
  assert.equal(R[0].reviews.few, true);
  assert.equal(R[0].players.enough, false);
});

test("parseMoney and parseMonth", () => {
  assert.equal(M.parseMoney("$1,234.50"), 1234.5);
  assert.equal(M.parseMoney("(12.50)"), -12.5);
  assert.equal(M.parseMoney("€ 900"), 900);
  assert.equal(M.parseMoney(""), null);
  assert.equal(M.parseMonth("2025-03"), "2025-03");
  assert.equal(M.parseMonth("Mar 2025"), "2025-03");
  assert.equal(M.parseMonth("2025-03-14"), "2025-03");
  assert.equal(M.parseMonth("14/03/2025", "dmy"), "2025-03");
  assert.equal(M.parseMonth("2025-13"), null);
});

test("revenueFromCsv sums daily rows into months with the studio's column map", () => {
  const P = PM.parseCsv("Date,Gross Revenue (USD),Net Revenue (USD)\n2026-04-01,\"$1,000.00\",700\n2026-04-02,500,350\n2026-05-01,200,140\nTotal,,\n");
  const R = M.revenueFromCsv(P.rows, 0, { date: 0, gross: 1, net: 2 });
  assert.deepEqual(R.months, [{ month: "2026-04", gross: 1500, net: 1050, src: "csv" }, { month: "2026-05", gross: 200, net: 140, src: "csv" }]);
  assert.equal(R.skipped, 1);
});

test("mergeMonths replaces a month and drops empty ones", () => {
  const a = M.mergeMonths([{ month: "2026-04", gross: 10 }], [{ month: "2026-04", gross: 20 }, { month: "2026-05", gross: null, net: null }]);
  assert.deepEqual(a, [{ month: "2026-04", gross: 20, net: null, src: "form" }]);
});

test("revenue: first 3 full months vs last 3, skipping the partial release month and this month", () => {
  const months = ["2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]
    .map((m, i) => ({ month: m, gross: 1000 - i * 50, net: 700 - i * 35 }));
  const R = M.revenue(months, "2026-02-14", "2026-11-26");
  assert.equal(R.field, "net");
  assert.equal(R.compare.first.from, "2026-03");
  assert.equal(R.compare.last.to, "2026-10");
  close(R.compare.first.avg, 630);
  close(R.compare.last.avg, 455);
  close(R.compare.ratio, 455 / 630);
  const short = M.revenue(months.slice(0, 5), "2026-02-14", "2026-11-26");
  assert.equal(short.compare, null);
  assert.equal(M.revenue([], "2026-02-14", "2026-11-26").status, "none");
  // Gross when any month lacks net.
  assert.equal(M.revenue([{ month: "2026-03", gross: 5, net: null }], null, "2026-11-26").field, "gross");
});

test("boxleiter uses Market Scope's model for both ends of the range", () => {
  const B = M.boxleiter(1000, 1999, { lo: 20, hi: 50, share: 65 });
  assert.equal(B.status, "ok");
  const row = [0, "", "2000-01-01", 1999, 1000, null, []];
  close(B.lo, MM.games({ to: "2000-01-01", rows: [row] }, { mult: 20, share: 65 })[0].rev);
  close(B.lo, 1000 * 20 * 19.99 * 0.65);
  close(B.hi, 1000 * 50 * 19.99 * 0.65);
  assert.equal(B.unitsLo, 20000);
  assert.equal(M.boxleiter(1000, 0, M.BOX_DEFAULTS).status, "free");
  assert.equal(M.boxleiter(1000, null, M.BOX_DEFAULTS).status, "no-price");
  assert.equal(M.boxleiter(null, 999, M.BOX_DEFAULTS).status, "no-reviews");
  assert.equal(M.boxleiter(10, 999, { lo: 0, hi: 50, share: 65 }).status, "no-assumptions");
  const swapped = M.boxleiter(10, 1000, { lo: 50, hi: 20, share: 50 });
  assert.equal(swapped.mult.lo, 20);
});

test("regional: big regions whose language isn't supported become questions; unknown names aren't guessed", () => {
  const share = { n: 1000, start: "2026-10-29", end: "2026-11-25", rows: [
    { region: "United States", count: 400, w: { p: 0.4 } },
    { region: "Germany", count: 150, w: { p: 0.15 } },
    { region: "brazil", count: 100, w: { p: 0.1 } },
    { region: "Switzerland", count: 60, w: { p: 0.06 } },
    { region: "Japan", count: 40, w: { p: 0.04 } },
    { region: "Other (each under 30 adds)", count: 250, w: { p: 0.25 }, pooled: true },
  ] };
  const R = M.regional(share, ["English", "German", "Spanish - Spain"]);
  assert.deepEqual(R.questions.map((q) => q.region + ":" + q.language), ["brazil:Portuguese - Brazil"]);
  assert.deepEqual(R.covered.map((q) => q.region), ["United States", "Germany"]);
  assert.deepEqual(R.unmatched.map((q) => q.region), ["Switzerland"]);
  assert.equal(M.regional(share, []).status, "no-languages");
  assert.equal(M.regional(null, ["English"]).status, "none");
});

test("analyse and signals: provenance on both keys, nothing below the minimums", () => {
  const today = "2026-11-26", release = "2026-03-02";
  const hist = weeklyHist(release, [140, 140, 140, 140].concat(Array(34).fill(35)), today, 5);
  const rows = ledger("steam_players", release, 270, (i) => (i < 7 ? 100 : 30)).concat(ledger("steam_reviews", "2026-10-01", 56, (i) => 2000 + i * 5));
  const R = M.analyse({ hist, details: { releaseText: "2 Mar, 2026", priceCents: 1499, languages: ["English"] }, news: [], ledger: rows, today, pe: {}, revenue: [], box: M.BOX_DEFAULTS });
  assert.equal(R.release, release);
  assert.equal(R.reviewsTotal, 2275);
  assert.equal(R.box.status, "ok");
  const S = M.signals(R);
  assert.deepEqual(S.map((s) => s.key), ["tail_legs_ratio", "players_floor_ratio"]);
  const [legs, fl] = S;
  assert.equal(legs.meta.half, "reach");
  assert.equal(legs.meta.source, "steam-public");
  assert.equal(legs.meta.n, 700);
  assert.ok(legs.meta.lo < legs.value && legs.meta.hi > legs.value);
  assert.equal(fl.meta.half, "resonance");
  assert.equal(fl.meta.method, "median");
  assert.equal(fl.value, 0.3);
  // A studio override of the release date wins over Steam's.
  const O = M.analyse({ hist, details: { releaseText: "2 Mar, 2026" }, ledger: [], today, release: "2026-03-09" });
  assert.equal(O.release, "2026-03-09");
  assert.equal(O.releaseOverridden, true);
  // Too little: no signals.
  assert.deepEqual(M.signals(M.analyse({ hist: null, details: {}, ledger: [], today })), []);
});
