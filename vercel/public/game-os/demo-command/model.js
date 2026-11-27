/* Demo Command — pure maths over studio-submitted demo numbers (UMD: window.DemoModel / module.exports).
 * Demo players come from the demo's own Steamworks reports (a demo has its own App ID), as a CSV parsed in the
 * browser or numbers typed into a form. Full-game wishlist adds for the same days come from Page Engine.
 * Method follows §5.5 of docs/MARKETING-TOOLS-BRIEFS.md. CSV handling and intervals reuse Page Engine's model.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../page-engine/model.js"), require("../window-planner/model.js"));
  else root.DemoModel = factory(root.PageModel, root.WindowModel);
})(typeof self !== "undefined" ? self : this, function (PM, WM) {
  "use strict";

  var poisson = PM.poisson, wilson = PM.wilson, change = PM.change, addDays = PM.addDays, daysBetween = PM.daysBetween, isYmd = PM.isYmd;

  var WINDOW_DAYS = 28;
  // Wishlists per 100 demo players needs 100 demo players in the window, so one wishlist moves the ratio by at most 1.
  var MIN_PLAYERS = 100;
  // ...and 10 wishlist adds; below that the 95% Poisson range on the adds is wider than the count itself.
  var MIN_ADDS = 10;
  // A window counts only when at least 75% of its days have data (Page Engine's rule), so a gap never reads as a fall.
  var MIN_COVERAGE = PM.MIN_COVERAGE;
  // A Next Fest read compares the fest days with the 28 days before it, and needs data on every fest day.
  var FEST_BEFORE_DAYS = 28;
  // A column whose values never fall over 14+ rows is probably a running total, not a daily count.
  var CUMULATIVE_MIN_ROWS = 14;

  var DEMO_FIELDS = ["players", "wishlisted", "playtime"];

  /* Past Steam Next Fest editions. Window Planner's calendar (WindowModel.EVENTS) lists only upcoming events, and
     demo data is mostly about past ones, so the past editions are kept here, each with the page its dates came from.
     Window Planner is a live tool and is left untouched (agreed with Jay, 26 Nov 2026). */
  var PAST_CHECKED = "2026-11-26";
  var PAST_NEXT_FESTS = [
    // Valve's 2026 events list as reported by GamingOnLinux (Jan 2026); GamesRadar's Next Fest guide gives the same dates.
    { id: "nf-feb26", name: "Steam Next Fest", start: "2026-02-23", end: "2026-03-02", source: "https://www.gamingonlinux.com/2026/01/valve-reveal-all-the-steam-events-scheduled-for-2026", checked: PAST_CHECKED },
    { id: "nf-jun26", name: "Steam Next Fest", start: "2026-06-15", end: "2026-06-22", source: "https://www.gamingonlinux.com/2026/01/valve-reveal-all-the-steam-events-scheduled-for-2026", checked: PAST_CHECKED },
    { id: "nf-oct26", name: "Steam Next Fest", start: "2026-10-19", end: "2026-10-26", source: "https://www.gamingonlinux.com/2026/01/valve-reveal-all-the-steam-events-scheduled-for-2026", checked: PAST_CHECKED },
    // 2025 editions aren't listed yet: no source checked so far gives their dates.
  ];

  /* ---------------- Parsing ---------------- */

  /**
   * Playtime cell to minutes. `unit` is "minutes", "hours" or "seconds" for plain numbers; "h:mm" and "h:mm:ss"
   * are read as hours and minutes whatever the unit. Empty or unreadable gives null.
   */
  function parseDuration(s, unit) {
    var t = String(s == null ? "" : s).trim();
    if (!t || t === "-") return null;
    var m = t.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
    if (m) return +m[1] * 60 + +m[2] + (m[3] ? +m[3] / 60 : 0);
    var v = PM.parseCount(t.replace(/\s*(min(ute)?s?|m|h(ou)?r?s?|s(ec(ond)?s?)?)$/i, ""));
    if (v == null || v < 0) return null;
    return unit === "hours" ? v * 60 : unit === "seconds" ? v / 60 : v;
  }

  /**
   * Turn parsed CSV rows into daily demo rows using the studio's column map ({ date, players, wishlisted, playtime }).
   * Players and wishlisted are summed when a date repeats (e.g. one row per country). A median can't be summed,
   * so a date with more than one playtime value keeps none, and the count of such dates is reported.
   */
  function tableFromCsv(rows, headerIndex, map, order, unit) {
    var byDate = {}, ptCount = {}, skipped = 0;
    for (var i = headerIndex + 1; i < rows.length; i++) {
      var r = rows[i];
      var date = PM.parseDate(r[map.date], order);
      if (!date) { skipped++; continue; }
      var o = byDate[date] || { from: date, to: date };
      var any = false;
      ["players", "wishlisted"].forEach(function (f) {
        if (map[f] == null) return;
        var v = PM.parseCount(r[map[f]]);
        if (v == null || v < 0) return;
        o[f] = (o[f] || 0) + v; any = true;
      });
      if (map.playtime != null) {
        var p = parseDuration(r[map.playtime], unit);
        if (p != null) { ptCount[date] = (ptCount[date] || 0) + 1; o.playtime = p; any = true; }
      }
      if (!any) { skipped++; continue; }
      byDate[date] = o;
    }
    var mixed = 0;
    Object.keys(ptCount).forEach(function (d) { if (ptCount[d] > 1) { delete byDate[d].playtime; mixed++; } });
    var list = Object.keys(byDate).sort().map(function (d) { return byDate[d]; });
    return { rows: list, skipped: skipped, playtimeDropped: mixed, cumulative: looksCumulative(list.map(function (x) { return x.players; })) };
  }

  /** True when a column never falls and grows over at least 14 values: a running total ("lifetime users"), not a daily count. */
  function looksCumulative(values) {
    var v = (values || []).filter(function (x) { return typeof x === "number" && isFinite(x); });
    if (v.length < CUMULATIVE_MIN_ROWS) return false;
    for (var i = 1; i < v.length; i++) if (v[i] < v[i - 1]) return false;
    return v[v.length - 1] > v[0];
  }

  /* ---------------- Measures ---------------- */

  /** Demo players over `days` ending on `end`, with an exact 95% Poisson range on the count. */
  function playersIn(demo, end, days) {
    var w = PM.windowSum(demo, "players", end, days);
    var p = w.covered > 0 ? poisson(w.count, w.covered) : null;
    return { w: w, rate: p, count: w.count, lo: p ? p.lo * w.covered : null, hi: p ? p.hi * w.covered : null, enough: w.enough };
  }

  /** Demo players in the last window against the window before, compared per day so a short gap can't fake a change. */
  function players(demo, end, days) {
    days = days || WINDOW_DAYS;
    var now = playersIn(demo, end, days), before = playersIn(demo, addDays(end, -days), days);
    var out = { days: days, now: now, before: before, change: null, enough: now.enough };
    if (now.enough && before.enough && now.count + before.count >= MIN_PLAYERS) out.change = change(now.rate, before.rate);
    return out;
  }

  /**
   * Full-game wishlist adds per 100 demo players over `days` ending on `end`. A ratio, not a conversion rate:
   * not every wishlist came from a demo player (brief §2.4). The range is the adds' exact Poisson range,
   * scaled per day so the two series can cover slightly different days.
   */
  function per100(demo, wish, end, days) {
    days = days || WINDOW_DAYS;
    var a = PM.windowSum(wish, "adds", end, days), p = PM.windowSum(demo, "players", end, days);
    var out = { adds: a, players: p, value: null, lo: null, hi: null, enough: false, reason: null };
    if (!p.enough) out.reason = "players_days";
    else if (!a.enough) out.reason = "adds_days";
    else if (p.count < MIN_PLAYERS) out.reason = "players_few";
    else if (a.count < MIN_ADDS) out.reason = "adds_few";
    if (out.reason) return out;
    var playersPerDay = p.count / p.covered, r = poisson(a.count, a.covered);
    out.value = 100 * r.rate / playersPerDay; out.lo = 100 * r.lo / playersPerDay; out.hi = 100 * r.hi / playersPerDay;
    out.enough = true;
    return out;
  }

  /**
   * Share of demo players who wishlisted, when the export attributes wishlists to demo players. A true proportion,
   * so it gets a 95% Wilson range. Both columns must cover the same days.
   */
  function attributed(demo, end, days) {
    days = days || WINDOW_DAYS;
    var k = PM.windowSum(demo, "wishlisted", end, days), n = PM.windowSum(demo, "players", end, days);
    var out = { wishlisted: k, players: n, w: null, enough: false };
    if (!k.rows || !k.enough || !n.enough || k.covered !== n.covered || n.count < MIN_PLAYERS || k.count > n.count) return out;
    out.w = wilson(k.count, n.count); out.enough = true;
    return out;
  }

  /**
   * Median demo playtime in minutes over the window. Steamworks reports a median per row; medians can't be averaged,
   * so this is the players-weighted median of the reported values. When one row covers the whole window it is
   * exactly the reported figure.
   */
  function playtime(demo, end, days) {
    days = days || WINDOW_DAYS;
    var start = addDays(end, -(days - 1)), rows = [], covered = 0, n = 0, csv = false;
    (demo || []).forEach(function (r) {
      if (r.playtime == null || r.from < start || r.to > end) return;
      rows.push(r); covered += daysBetween(r.from, r.to) + 1; n += r.players || 0; if (r.src === "csv") csv = true;
    });
    var out = { value: null, n: n, rows: rows.length, covered: covered, start: start, end: end, csv: csv, exact: false, enough: false };
    if (!rows.length || covered < Math.ceil(days * MIN_COVERAGE) || n < MIN_PLAYERS) return out;
    if (rows.length === 1) { out.value = rows[0].playtime; out.exact = true; out.enough = true; return out; }
    var s = rows.filter(function (r) { return r.players > 0; }).sort(function (a, b) { return a.playtime - b.playtime; });
    var half = n / 2, acc = 0;
    for (var i = 0; i < s.length; i++) { acc += s[i].players; if (acc >= half) { out.value = s[i].playtime; break; } }
    out.enough = out.value != null;
    return out;
  }

  /** Same measure for the window before, and whether the two ranges separate (§2.4). */
  function compare(nowR, beforeR) {
    if (!nowR || !beforeR || !nowR.enough || !beforeR.enough) return null;
    var a = nowR.w ? nowR.w : nowR, b = beforeR.w ? beforeR.w : beforeR;
    return change({ lo: a.lo, hi: a.hi }, { lo: b.lo, hi: b.hi });
  }

  /* ---------------- Next Fest ---------------- */

  /** Every Next Fest edition known: the past ones above plus upcoming ones from Window Planner's calendar, oldest first. */
  function nextFests(events) {
    var seen = {}, out = [];
    PAST_NEXT_FESTS.concat((events || (WM && WM.EVENTS) || []).filter(function (e) { return e && e.kind === "nextfest"; }).map(function (e) {
      return { id: e.id, name: e.name, start: e.start, end: e.end || e.start, source: WM ? WM.SOURCE : "", checked: WM ? WM.CHECKED : "" };
    })).forEach(function (f) {
      if (!f || !isYmd(f.start) || !isYmd(f.end) || seen[f.start]) return;
      seen[f.start] = 1; out.push(f);
    });
    return out.sort(function (a, b) { return a.start < b.start ? -1 : 1; });
  }

  /**
   * One Next Fest against the 28 days before it: demo players a day and wishlists per 100 demo players.
   * Needs demo data on every fest day. Reasons when it can't be read: "future", "nodata", "fest_days", "before_days".
   */
  function festRead(demo, wish, fest, lastDemoDay) {
    var days = daysBetween(fest.start, fest.end) + 1;
    var out = { fest: fest, days: days, enough: false, reason: null };
    if (!lastDemoDay || fest.end > lastDemoDay) { out.reason = fest.start > (lastDemoDay || "") ? "future" : "fest_days"; return out; }
    var during = playersIn(demo, fest.end, days), before = playersIn(demo, addDays(fest.start, -1), FEST_BEFORE_DAYS);
    out.during = during; out.before = before;
    if (!during.w.rows && !before.w.rows) { out.reason = "nodata"; return out; }
    if (during.w.covered < days) { out.reason = "fest_days"; return out; }
    if (!before.enough) { out.reason = "before_days"; return out; }
    out.enough = true;
    out.playersPerDay = during.rate.rate; out.beforePerDay = before.rate.rate;
    out.playersChange = change(during.rate, before.rate);
    out.ratio = per100(demo, wish, fest.end, days);
    out.ratioBefore = per100(demo, wish, addDays(fest.start, -1), FEST_BEFORE_DAYS);
    out.ratioChange = compare(out.ratio, out.ratioBefore);
    return out;
  }

  /* ---------------- The whole read ---------------- */

  /** Everything the page shows, for the 28 days ending on the last day of demo data. S = { demo, wishlists }. */
  function analyse(S, end) {
    var demo = (S && S.demo) || [], wish = (S && S.wishlists) || [];
    end = end || PM.lastDate(demo);
    if (!end) return { empty: true, wishEmpty: !wish.length };
    var R = { empty: false, end: end, wishEmpty: !wish.length, wishEnd: PM.lastDate(wish) };
    R.players = players(demo, end);
    R.ratio = per100(demo, wish, end);
    R.ratioBefore = per100(demo, wish, addDays(end, -WINDOW_DAYS));
    R.ratioChange = compare(R.ratio, R.ratioBefore);
    R.attr = attributed(demo, end);
    R.attrBefore = attributed(demo, addDays(end, -WINDOW_DAYS));
    R.attrChange = compare(R.attr, R.attrBefore);
    R.playtime = playtime(demo, end);
    R.playtimeBefore = playtime(demo, addDays(end, -WINDOW_DAYS));
    var first = demo.length ? demo[0].from : end;
    R.fests = nextFests().filter(function (f) { return f.end >= first && f.start <= addDays(end, 120); }).map(function (f) { return festRead(demo, wish, f, end); }).reverse();
    return R;
  }

  /* ---------------- Ledger rows ---------------- */

  function round1(x) { return Math.round(x * 10) / 10; }
  function src(csv) { return csv ? "steamworks-export" : "studio-entered"; }
  function win(w) { return w.start + "/" + w.end; }

  /** Ledger rows for "Send to game". Only measures above their minimum are sent (brief §2.4). */
  function signals(R) {
    if (!R || R.empty) return [];
    var out = [], P = R.players.now;
    if (P.enough && P.count >= MIN_PLAYERS) {
      out.push({ key: "demo_players_28d", label: "Demo players, last 28 days", value: P.count, unit: "units",
        meta: { half: "reach", source: src(P.w.csv), method: "poisson95", n: P.count, window: win(P.w), covered_days: P.w.covered,
          lo: Math.round(P.lo), hi: Math.round(P.hi), per_day: round1(P.rate.rate), change: R.players.change } });
    }
    if (R.ratio.enough) {
      var m = { half: "resonance", source: src(R.ratio.players.csv || R.ratio.adds.csv), method: "poisson95", n: R.ratio.adds.count, demo_players: R.ratio.players.count,
        window: win(R.ratio.players), lo: round1(R.ratio.lo), hi: round1(R.ratio.hi), change: R.ratioChange, ratio_not_conversion: true };
      if (R.attr.enough) m.attributed = { wishlisted: R.attr.wishlisted.count, players: R.attr.players.count, pct: round1(R.attr.w.p * 100), lo: round1(R.attr.w.lo * 100), hi: round1(R.attr.w.hi * 100), method: "wilson95" };
      out.push({ key: "demo_wishlists_per_100", label: "Full-game wishlist adds per 100 demo players, last 28 days", value: round1(R.ratio.value), unit: "ratio", meta: m });
    }
    if (R.playtime.enough) {
      out.push({ key: "demo_median_playtime", label: "Demo median playtime, last 28 days", value: round1(R.playtime.value), unit: "minutes",
        meta: { half: "resonance", source: src(R.playtime.csv), method: R.playtime.exact ? "reported" : "weighted_median_of_reported", n: R.playtime.n,
          window: win(R.playtime), rows: R.playtime.rows } });
    }
    return out;
  }

  return {
    WINDOW_DAYS: WINDOW_DAYS, MIN_PLAYERS: MIN_PLAYERS, MIN_ADDS: MIN_ADDS, MIN_COVERAGE: MIN_COVERAGE, FEST_BEFORE_DAYS: FEST_BEFORE_DAYS,
    CUMULATIVE_MIN_ROWS: CUMULATIVE_MIN_ROWS, DEMO_FIELDS: DEMO_FIELDS, PAST_NEXT_FESTS: PAST_NEXT_FESTS, PAST_CHECKED: PAST_CHECKED,
    parseDuration: parseDuration, tableFromCsv: tableFromCsv, looksCumulative: looksCumulative,
    playersIn: playersIn, players: players, per100: per100, attributed: attributed, playtime: playtime, compare: compare,
    nextFests: nextFests, festRead: festRead, analyse: analyse, signals: signals,
  };
});
