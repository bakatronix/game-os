// Unit tests for public/game-os/creator-match/model.js. Run: npm run test:models
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const M = require("../../public/game-os/creator-match/model.js");
const PM = require("../../public/game-os/page-engine/model.js");

function days(end, n, fn) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = PM.addDays(end, -(n - 1 - i));
    out.push(Object.assign({ from: d, to: d, src: "csv" }, fn(i, d)));
  }
  return out;
}

test("suggest finds the Twitch columns and prefers hours over minutes", () => {
  assert.deepEqual(M.suggest(["Date", "Hours Watched", "Unique Viewers", "Unique Broadcasters"]), { date: 0, hours: 1, viewers: 2, broadcasters: 3 });
  assert.deepEqual(M.suggest(["Day", "Minutes Watched", "Streamers"]), { date: 0, minutes: 1, broadcasters: 2 });
  const both = M.suggest(["date", "hours watched", "minutes watched"]);
  assert.equal(both.hours, 1);
  assert.equal(both.minutes, undefined);
});

test("twitchFromCsv reads daily rows, converts minutes to hours, skips totals", () => {
  const p = PM.parseCsv("Twitch analytics\nDate,Minutes Watched,Unique Viewers,Unique Broadcasters\n2026-11-01,600,40,3\n2026-11-02,90,\"1,200\",1\nTotal,690,1240,4\n");
  const hi = PM.findHeader(p.rows);
  const t = M.twitchFromCsv(p.rows, hi, { date: 0, minutes: 1, viewers: 2, broadcasters: 3 }, "ymd");
  assert.equal(t.rows.length, 2);
  assert.equal(t.skipped, 1);
  assert.deepEqual(t.rows[0], { from: "2026-11-01", to: "2026-11-01", src: "csv", hours: 10, viewers: 40, broadcasters: 3 });
  assert.equal(t.rows[1].hours, 1.5);
  assert.equal(t.rows[1].viewers, 1200);
});

test("footprint: 28-day hours total, broadcaster-days with Poisson range and change rule", () => {
  const end = "2026-11-28";
  const s = days(end, 56, (i) => ({ hours: 2, broadcasters: i < 28 ? 1 : 4 }));
  const F = M.footprint(s);
  assert.equal(F.end, end);
  assert.equal(F.hours.count, 56);
  assert.equal(F.hoursBefore.count, 56);
  assert.equal(F.broadcasters.count, 112);
  assert.equal(F.broadcastersBefore.count, 28);
  assert.equal(F.bChange, "up");
  assert.ok(F.bRate.lo < 4 && F.bRate.hi > 4);
});

test("footprint: too little coverage → not enough, and no change call", () => {
  const F = M.footprint(days("2026-11-28", 10, () => ({ hours: 5, broadcasters: 2 })));
  assert.equal(F.hours.enough, false);
  assert.equal(F.bChange, null);
  assert.deepEqual(M.signals(F, null), []);
});

test("footprint: few broadcaster-days → no change call even with full coverage", () => {
  const F = M.footprint(days("2026-11-28", 56, (i) => ({ broadcasters: i === 50 ? 1 : 0 })));
  assert.equal(F.broadcasters.enough, true);
  assert.equal(F.bChange, null);
});

test("cleanContact keeps only http links, known platforms and statuses", () => {
  const c = M.cleanContact({ id: "a", creator: " Chan ", platform: "MySpace", link: "javascript:alert(1)", contacted: "2026-11-01", status: "weird", coverageLink: "https://youtu.be/x" });
  assert.equal(c.creator, "Chan");
  assert.equal(c.platform, "Other");
  assert.equal(c.link, "");
  assert.equal(c.status, "contacted");
  assert.equal(c.coverageLink, "https://youtu.be/x");
  assert.equal(M.cleanContact({ id: "b", creator: "" }), null);
  assert.equal(M.cleanContact({ creator: "x" }), null);
});

test("mergeContacts keeps the later edit, including deletes", () => {
  const a = [{ id: "1", creator: "A", updated: 1 }, { id: "2", creator: "B", updated: 5 }];
  const b = [{ id: "1", creator: "A2", updated: 3 }, { id: "2", creator: "B", updated: 4, deleted: true }];
  const m = M.mergeContacts(a, b);
  assert.equal(m.find((x) => x.id === "1").creator, "A2");
  assert.equal(m.find((x) => x.id === "2").deleted, undefined);
});

function contact(i, status, extra) {
  return M.cleanContact(Object.assign({ id: "c" + i, creator: "Creator " + i, platform: "YouTube", contacted: "2026-11-0" + ((i % 9) + 1), status }, extra || {}));
}

test("outreach counts replies (replied, covered, declined) and hides the rate below the minimum", () => {
  const list = [contact(1, "replied"), contact(2, "covered"), contact(3, "declined"), contact(4, "no reply"), contact(5, "contacted"),
    M.cleanContact({ id: "x", creator: "Not contacted yet", platform: "Twitch" }), Object.assign(contact(6, "replied"), { deleted: true })];
  const O = M.outreach(list);
  assert.equal(O.listed, 6);
  assert.equal(O.contacted, 5);
  assert.equal(O.replies, 3);
  assert.equal(O.covered, 1);
  assert.equal(O.enough, false);
  const S = M.signals(null, O, "2026-11-26");
  assert.deepEqual(S.map((s) => s.key), ["outreach_contacted", "outreach_covered"]);
  assert.equal(S[0].meta.half, "reach");
  assert.equal(S[0].meta.window, "2026-11-02/2026-11-26");
});

test("outreach reply rate: Wilson range once 10 are contacted", () => {
  const list = [];
  for (let i = 0; i < 12; i++) list.push(contact(i, i < 3 ? "replied" : "no reply"));
  const O = M.outreach(list);
  assert.equal(O.enough, true);
  const r = M.signals(null, O, "2026-11-26").find((s) => s.key === "outreach_reply_rate");
  assert.equal(r.value, 25);
  assert.equal(r.meta.method, "wilson95");
  assert.equal(r.meta.n, 12);
  assert.ok(r.meta.lo < 25 && r.meta.hi > 25);
});

test("a coverage link counts as covered and as a reply even if the status wasn't updated", () => {
  const O = M.outreach([contact(1, "contacted", { coverageLink: "https://youtu.be/abc" })]);
  assert.equal(O.covered, 1);
  assert.equal(O.replies, 1);
});

test("coverageBeat: Page Engine's beat shape, stable id, deleted when coverage is removed", () => {
  const c = contact(1, "covered", { platform: "Twitch", coverageDate: "2026-11-20", coverageLink: "https://twitch.tv/videos/1" });
  const row = M.beatRow(c, 1000);
  assert.equal(row.key, "beat");
  assert.equal(row.meta.kind, "beat");
  assert.equal(row.meta.id, "cm-c1");
  assert.equal(row.meta.type, "creator coverage");
  assert.equal(row.meta.channel, "Twitch");
  assert.equal(row.meta.date, "2026-11-20");
  assert.equal(row.meta.deleted, false);
  const back = PM.logsFromLedger([row]).beats[0];
  assert.equal(back.type, "creator coverage");
  const undone = M.beatRow(Object.assign({}, c, { status: "replied", coverageDate: "", coverageLink: "" }), 2000);
  assert.equal(undone.meta.id, "cm-c1");
  assert.equal(undone.meta.deleted, true);
  assert.equal(PM.logsFromLedger([row, undone]).beats[0].deleted, true);
  const other = M.beatRow(contact(2, "covered", { platform: "Blog or site" }), 1);
  assert.equal(other.meta.channel, null, "platforms outside Page Engine's channels get no channel");
});

test("Twitch signals carry source, window and the broadcaster-days label", () => {
  const F = M.footprint(days("2026-11-28", 56, () => ({ hours: 3, broadcasters: 2 })));
  const S = M.signals(F, M.outreach([]));
  assert.deepEqual(S.map((s) => s.key), ["twitch_hours_watched_28d", "twitch_broadcasters_28d"]);
  assert.equal(S[0].value, 84);
  assert.equal(S[0].meta.source, "twitch-dev-analytics");
  assert.equal(S[0].meta.window, "2026-11-01/2026-11-28");
  assert.equal(S[1].value, 56);
  assert.equal(S[1].meta.measure, "broadcaster-days");
  assert.equal(S[1].meta.change, "flat");
  S.forEach((s) => assert.equal(s.meta.half, "reach"));
});
