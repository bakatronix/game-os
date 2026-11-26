// Unit tests for public/game-os/festival-radar/model.js. Run: npm run test:models
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const M = require("../../public/game-os/festival-radar/model.js");
const PM = require("../../public/game-os/page-engine/model.js");
const WM = require("../../public/game-os/window-planner/model.js");

/** Daily wishlist rows ending on `end`, `n` days long. */
function days(end, n, fn, src = "csv") {
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = PM.addDays(end, -(n - 1 - i));
    out.push({ from: d, to: d, src, adds: fn(i, d) });
  }
  return out;
}
const fest = (o) => Object.assign({ name: "Example Showcase", source: "https://example.com/dates", checked: "2026-11-01", submissionCloses: "2027-01-10", eventStart: "2027-02-01", eventEnd: "2027-02-03" }, o);

test("festivals.json ships empty, with the schema", () => {
  const j = JSON.parse(readFileSync(new URL("../../public/game-os/festival-radar/festivals.json", import.meta.url), "utf8"));
  assert.deepEqual(j.festivals, []);
  assert.ok(j.schema.source && j.schema.checked);
  assert.deepEqual(M.festivalsFrom(j), []);
});

test("cleanFestival needs a name, an https source and a checked date", () => {
  assert.ok(M.cleanFestival(fest({})));
  assert.equal(M.cleanFestival(fest({ source: "" })), null);
  assert.equal(M.cleanFestival(fest({ source: "http://example.com" })), null);
  assert.equal(M.cleanFestival(fest({ checked: "1 Nov" })), null);
  assert.equal(M.cleanFestival(fest({ name: " " })), null);
  assert.equal(M.cleanFestival(fest({ submissionCloses: "", eventStart: "" })), null, "nothing to put on a calendar");
  const f = M.cleanFestival(fest({ eventEnd: "", url: "javascript:alert(1)", submissionOpens: "soon" }));
  assert.equal(f.eventEnd, "2027-02-01", "end defaults to start");
  assert.equal(f.url, "https://example.com/dates", "unsafe url falls back to source");
  assert.equal(f.submissionOpens, "", "bad dates dropped, not guessed");
  assert.equal(f.id, "example-showcase");
});

test("festivalsFrom drops duplicates and invalid entries", () => {
  const list = M.festivalsFrom({ festivals: [fest({ id: "a" }), fest({ id: "a", name: "Dup" }), fest({ id: "b", source: "" }), null] });
  assert.deepEqual(list.map((f) => f.id), ["a"]);
});

test("isStale after 90 days since checked", () => {
  const f = M.cleanFestival(fest({ checked: "2026-08-01" }));
  assert.equal(M.isStale(f, "2026-10-30"), false);
  assert.equal(M.isStale(f, "2026-10-31"), true);
});

test("steamEvents reads Next Fest and themed fests from WindowModel.EVENTS, not sales", () => {
  const s = M.steamEvents();
  const ids = WM.EVENTS.filter((e) => e.kind === "nextfest" || e.kind === "fest").map((e) => "steam-" + e.id);
  assert.deepEqual(s.map((x) => x.id), ids);
  assert.ok(!s.some((x) => /sale/i.test(x.name)));
  assert.ok(s.every((x) => x.source === WM.SOURCE && x.checked === WM.CHECKED && x.steam));
});

test("matches: Next Fest suits everyone, themed fests need a tag, untagged festivals are open", () => {
  const tags = M.gameTags("Roguelike, Deckbuilder", ["co-op"]);
  assert.deepEqual(tags, ["roguelike", "deckbuilder", "co op"]);
  const s = M.steamEvents();
  assert.ok(M.matches(s.find((x) => x.kind === "nextfest"), []));
  assert.ok(M.matches(s.find((x) => x.id === "steam-f-couch"), tags));
  assert.ok(!M.matches(s.find((x) => x.id === "steam-f-racing"), tags));
  assert.ok(!M.matches(s.find((x) => x.id === "steam-f-racing"), []));
  assert.ok(M.matches(M.cleanFestival(fest({ tags: [] })), []));
  assert.ok(M.matches(M.cleanFestival(fest({ tags: ["Roguelikes"] })), tags));
  assert.ok(!M.matches(M.cleanFestival(fest({ tags: ["Horror"] })), tags));
});

test("deadlines: nearest first, open deadlines before event dates, past events dropped", () => {
  const items = [
    M.cleanFestival(fest({ id: "late", submissionCloses: "2027-03-01", eventStart: "2027-04-01", eventEnd: "2027-04-02" })),
    M.cleanFestival(fest({ id: "soon", submissionCloses: "2026-12-05", eventStart: "2027-01-20", eventEnd: "2027-01-22" })),
    M.cleanFestival(fest({ id: "closed", submissionCloses: "2026-11-01", eventStart: "2026-12-10", eventEnd: "2026-12-12" })),
    M.cleanFestival(fest({ id: "over", submissionCloses: "2026-09-01", eventStart: "2026-10-01", eventEnd: "2026-10-03" })),
  ];
  const d = M.deadlines(items, "2026-11-26", [], true);
  assert.deepEqual(d.map((x) => x.f.id), ["soon", "closed", "late"]);
  assert.equal(d[0].daysToDeadline, 9);
  assert.equal(d[1].deadlinePassed, true);
  assert.equal(d[1].deadlineOpen, false);
});

test("deadlines hides tag mismatches unless all, and flags stale entries", () => {
  const items = [M.cleanFestival(fest({ id: "h", tags: ["horror"], checked: "2026-01-01" }))];
  assert.equal(M.deadlines(items, "2026-11-26", ["racing"], false).length, 0);
  const d = M.deadlines(items, "2026-11-26", ["racing"], true);
  assert.equal(d.length, 1);
  assert.equal(d[0].match, false);
  assert.equal(d[0].stale, true);
});

test("cleanEntry keeps known statuses and sane dates", () => {
  const e = M.cleanEntry({ id: "x", name: "Fest", status: "won", eventStart: "2027-01-05", eventEnd: "2027-01-01" });
  assert.equal(e.status, "considering");
  assert.equal(e.eventEnd, "2027-01-05");
  assert.equal(M.cleanEntry({ id: "x", name: "" }), null);
  assert.equal(M.cleanEntry({ name: "x" }), null);
});

test("entryBeat: accepted and attended write a festival beat; other statuses tombstone it", () => {
  const e = M.cleanEntry({ id: "e1", name: "Showcase", status: "accepted", eventStart: "2027-02-01", eventEnd: "2027-02-03", updated: 5 });
  const b = M.entryBeat(e);
  assert.equal(b.id, "fr-e1");
  assert.equal(b.type, "festival");
  assert.equal(b.channel, "festival");
  assert.equal(b.date, "2027-02-01");
  assert.equal(b.deleted, false);
  assert.equal(M.entryBeat(Object.assign({}, e, { status: "rejected" })).deleted, true);
  assert.equal(M.entryBeat(Object.assign({}, e, { eventStart: "" })).deleted, true, "no date, no beat");
  const row = M.beatRow(e);
  assert.equal(row.key, "beat");
  assert.equal(row.meta.kind, "beat");
  assert.equal(row.meta.id, "fr-e1");
  // Round trip through Page Engine's ledger reader.
  const logs = PM.logsFromLedger([{ key: "beat", value: 1, meta: row.meta, observedAt: "2027-01-01T00:00:00Z" }]);
  assert.equal(logs.beats[0].type, "festival");
});

test("lift: adds during the event minus 14-day median baseline × days, Poisson range", () => {
  // 14 days before at 10/day, then 3 event days at 40/day.
  const series = days("2027-02-03", 17, (i) => (i < 14 ? 10 : 40));
  const e = M.cleanEntry({ id: "e1", name: "Showcase", status: "attended", eventStart: "2027-02-01", eventEnd: "2027-02-03" });
  const L = M.lift(series, e, []);
  assert.equal(L.enough, true);
  assert.equal(L.days, 3);
  assert.equal(L.during, 120);
  assert.equal(L.expected, 30);
  assert.equal(L.lift, 90);
  const p = PM.poisson(120, 1);
  assert.ok(Math.abs(L.lo - (p.lo - 30)) < 1e-9 && Math.abs(L.hi - (p.hi - 30)) < 1e-9);
  assert.equal(L.verdict, "rise");
  const s = M.liftSignal(L);
  assert.equal(s.key, "festival_lift");
  assert.equal(s.value, 90);
  assert.equal(s.meta.half, "reach");
  assert.equal(s.meta.source, "steamworks-export");
  assert.equal(s.meta.n, 120);
  assert.equal(s.meta.window, "2027-02-01/2027-02-03");
  assert.equal(s.meta.baseline_per_day, 10);
  assert.ok(s.meta.lo < 90 && s.meta.hi > 90);
});

test("lift says no clear change when the baseline sits inside the range", () => {
  const series = days("2027-02-03", 17, (i) => (i < 14 ? 10 : 11));
  const L = M.lift(series, M.cleanEntry({ id: "e", name: "F", eventStart: "2027-02-01", eventEnd: "2027-02-03" }), []);
  assert.equal(L.verdict, "none");
});

test("lift refuses thin data with a reason", () => {
  const e = M.cleanEntry({ id: "e", name: "F", eventStart: "2027-02-01", eventEnd: "2027-02-03" });
  assert.equal(M.lift([], e, []).reason, "nodata");
  assert.equal(M.lift(days("2027-02-03", 12, () => 10), e, []).reason, "baseline", "only 9 baseline days");
  assert.equal(M.lift(days("2027-02-02", 16, () => 10), e, []).reason, "event", "last event day missing");
  assert.equal(M.lift(days("2027-02-03", 17, (i) => (i < 14 ? 1 : 2)), e, []).reason, "few");
  assert.equal(M.lift(days("2027-02-03", 17, () => 10), M.cleanEntry({ id: "e", name: "F" }), []).reason, "dates");
  assert.equal(M.liftSignal(M.lift([], e, [])), null);
});

test("lift lists other beats in the event window and marks typed-in data", () => {
  const series = days("2027-02-03", 17, (i) => (i < 14 ? 10 : 40), "form");
  const e = M.cleanEntry({ id: "e1", name: "F", eventStart: "2027-02-01", eventEnd: "2027-02-03" });
  const beats = [{ id: "fr-e1", date: "2027-02-01" }, { id: "b1", date: "2027-02-02" }, { id: "b2", date: "2027-01-10" }, { id: "b3", date: "2027-01-28" }];
  const L = M.lift(series, e, beats);
  assert.deepEqual(L.overlaps.map((b) => b.id), ["b1", "b3"]);
  assert.equal(M.liftSignal(L).meta.source, "studio-entered");
});

test("mergeEntries keeps the later edit and the delete", () => {
  const a = [{ id: "1", updated: 1, status: "considering" }];
  const b = [{ id: "1", updated: 2, status: "submitted" }, { id: "2", updated: 1, deleted: true }];
  const m = M.mergeEntries(a, b);
  assert.equal(m.find((x) => x.id === "1").status, "submitted");
  assert.ok(m.find((x) => x.id === "2").deleted);
});
