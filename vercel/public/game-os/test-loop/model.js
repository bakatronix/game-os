/* Test Loop — pure maths for before/after and variant tests (UMD: window.TestModel / module.exports).
 * Store tests read Page Engine's daily traffic and wishlist tables and its version log. Steamworks has no native
 * split testing of store assets (checked 26 Nov 2026, see STEAM_AB_*), so every store test is a before/after
 * comparison around one change. Off-Steam tests (ads, posts, landing pages, positioning lines) use the studio's
 * own impressions and clicks per variant. Method follows §5.6 of docs/MARKETING-TOOLS-BRIEFS.md.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../page-engine/model.js"), require("../window-planner/model.js"), require("../demo-command/model.js"));
  else root.TestModel = factory(root.PageModel, root.WindowModel, root.DemoModel);
})(typeof self !== "undefined" ? self : this, function (PM, WM, DM) {
  "use strict";

  var wilson = PM.wilson, poisson = PM.poisson, addDays = PM.addDays, isYmd = PM.isYmd, windowSum = PM.windowSum;

  // Store tests compare the same number of days either side of a change. 14 is the brief's default.
  var DEFAULT_DAYS = 14;
  // Fewer than 7 days a side and the weekday mix alone (weekends run differently) can swing the result.
  var MIN_DAYS = 7;
  // Past 56 days a side, other things change too much for the window to describe one change.
  var MAX_DAYS = 56;
  // Click-through needs 1,000 impressions in each window (Page Engine's 28-day minimum, applied per window): below
  // that the Wilson range on each side is several points wide and almost every test reads "can't tell".
  var MIN_IMPRESSIONS = 1000;
  // Visits to wishlists needs 100 visits in each window, so one wishlist moves the ratio by at most 1 per 100.
  var MIN_VISITS = 100;
  // An off-Steam variant needs 100 impressions; below that a single click moves its rate by a whole point or more.
  var MIN_VARIANT_IMPRESSIONS = 100;
  var MAX_VARIANTS = 4;

  // Two-sided z for 95% overall when several variants are each compared with the control (Bonferroni over
  // 1, 2 or 3 comparisons: 0.05, 0.025 and 0.0167 split across both tails).
  var Z_BY_COMPARISONS = { 1: 1.959964, 2: 2.241403, 3: 2.393980 };

  // Steamworks documentation, read 26 Nov 2026: Store Beta Mode previews changes; nothing on splitting traffic.
  var STEAM_AB_CHECKED = "2026-11-26";
  var STEAM_AB_SOURCES = [
    "https://partner.steamgames.com/doc/store/page",
    "https://partner.steamgames.com/doc/marketing/traffic_reporting",
  ];

  var METRICS = {
    ctr: { id: "ctr", name: "Click-through", unit: "visits per 100 impressions", half: "reach", method: "newcombe95" },
    v2w: { id: "v2w", name: "Visits to wishlists", unit: "wishlist adds per 100 visits", half: "resonance", method: "mover_poisson95" },
    clicks: { id: "clicks", name: "Click rate", unit: "clicks per 100 impressions", half: "reach", method: "newcombe95" },
  };

  /* ---------------- Intervals on a difference ---------------- */

  /**
   * Newcombe's hybrid score interval (his method 10) for the difference of two proportions, b − a, built from each
   * side's Wilson interval. Shares are 0–1. With z > 1.96 it widens to keep 95% overall across several comparisons.
   */
  function newcombe(ka, na, kb, nb, z) {
    var A = wilson(ka, na, z), B = wilson(kb, nb, z);
    if (A.p == null || B.p == null) return null;
    var d = B.p - A.p;
    var lo = d - Math.sqrt(Math.pow(B.p - B.lo, 2) + Math.pow(A.hi - A.p, 2));
    var hi = d + Math.sqrt(Math.pow(B.hi - B.p, 2) + Math.pow(A.p - A.lo, 2));
    return { a: A, b: B, diff: d, lo: lo, hi: hi };
  }

  /**
   * Difference of two rates per 100 units of exposure (wishlist adds per 100 visits), b − a. Each rate gets its exact
   * Poisson range on the count with the exposure held fixed, and the two are combined the same way Newcombe combines
   * Wilson intervals (Zou and Donner's MOVER). Used where the ratio isn't a true share (brief §2.4): some adds don't
   * come through a tracked visit, so adds can exceed visits.
   */
  function rateDiff(ka, ea, kb, eb) {
    if (!(ea > 0) || !(eb > 0)) return null;
    var A = poisson(ka, ea), B = poisson(kb, eb);
    var ra = 100 * A.rate, la = 100 * A.lo, ua = 100 * A.hi, rb = 100 * B.rate, lb = 100 * B.lo, ub = 100 * B.hi;
    var d = rb - ra;
    return {
      a: { k: A.count, n: ea, p: ra, lo: la, hi: ua }, b: { k: B.count, n: eb, p: rb, lo: lb, hi: ub },
      diff: d, lo: d - Math.sqrt(Math.pow(rb - lb, 2) + Math.pow(ua - ra, 2)), hi: d + Math.sqrt(Math.pow(ub - rb, 2) + Math.pow(ra - la, 2)),
    };
  }

  /** "better" when the whole range is above zero, "worse" when it's all below, otherwise "can't tell". */
  function verdict(r) {
    if (!r || r.lo == null) return null;
    if (r.lo > 0) return "better";
    if (r.hi < 0) return "worse";
    return "can't tell";
  }

  /* ---------------- Store: before/after one change ---------------- */

  function clampDays(n) {
    n = Math.round(Number(n));
    if (!isFinite(n)) return DEFAULT_DAYS;
    return Math.max(MIN_DAYS, Math.min(MAX_DAYS, n));
  }

  /** The two windows around a change that went live on `date`: before ends the day before, after starts on the day. */
  function windows(date, days) {
    return { before: { start: addDays(date, -days), end: addDays(date, -1) }, after: { start: date, end: addDays(date, days - 1) } };
  }

  /** Things in either window that move traffic on their own: beats, other store changes and Steam events. */
  function confounders(change, days, beats, versions, events) {
    var w = windows(change.date, days), s = w.before.start, e = w.after.end, out = [];
    (beats || []).forEach(function (b) {
      if (b && !b.deleted && isYmd(b.date) && b.date >= s && b.date <= e) out.push({ kind: "beat", date: b.date, name: b.type + (b.channel ? " (" + b.channel + ")" : ""), note: b.note || "" });
    });
    (versions || []).forEach(function (v) {
      if (v && !v.deleted && v.id !== change.id && isYmd(v.date) && v.date >= s && v.date <= e) out.push({ kind: "version", date: v.date, name: v.asset + " " + v.label });
    });
    (events || []).forEach(function (ev) {
      if (ev && isYmd(ev.start) && isYmd(ev.end) && ev.start <= e && ev.end >= s) out.push({ kind: "event", date: ev.start, end: ev.end, name: ev.name });
    });
    return out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  }

  /** Steam events from Window Planner's calendar (upcoming) and Demo Command's sourced past Next Fests. */
  function steamEvents() {
    var seen = {}, out = [];
    (WM.EVENTS || []).filter(function (e) { return e.kind !== "holiday"; }).concat(DM.PAST_NEXT_FESTS || []).forEach(function (e) {
      var k = e.start + "|" + e.name;
      if (!seen[k]) { seen[k] = 1; out.push({ id: e.id, name: e.name, start: e.start, end: e.end }); }
    });
    return out;
  }

  /** One metric's read for one window pair. `num`/`den` are { series, field }. */
  function storeRead(metric, wish, traffic, w, days, lastData) {
    var M = METRICS[metric];
    var numSeries = metric === "ctr" ? traffic : wish, numField = metric === "ctr" ? "visits" : "adds";
    var denField = metric === "ctr" ? "impressions" : "visits", minDen = metric === "ctr" ? MIN_IMPRESSIONS : MIN_VISITS;
    var nb = windowSum(numSeries, numField, w.before.end, days), db = windowSum(traffic, denField, w.before.end, days);
    var na = windowSum(numSeries, numField, w.after.end, days), da = windowSum(traffic, denField, w.after.end, days);
    var out = { metric: metric, name: M.name, half: M.half, method: M.method, unit: M.unit, days: days, windows: w,
      before: { num: nb, den: db }, after: { num: na, den: da }, enough: false, reason: null, result: null, verdict: null };
    if (!lastData || lastData < w.after.end) { out.reason = "running"; out.daysIn = lastData && lastData >= w.after.start ? PM.daysBetween(w.after.start, lastData) + 1 : 0; return out; }
    if (nb.covered < days || db.covered < days || na.covered < days || da.covered < days) { out.reason = "gaps"; return out; }
    if (db.count < minDen || da.count < minDen) { out.reason = "few"; out.min = minDen; return out; }
    out.result = metric === "ctr" ? newcombe(nb.count, db.count, na.count, da.count) : rateDiff(nb.count, db.count, na.count, da.count);
    if (metric === "ctr" && out.result) { ["a", "b"].forEach(function (k) { var x = out.result[k]; x.p *= 100; x.lo *= 100; x.hi *= 100; }); out.result.diff *= 100; out.result.lo *= 100; out.result.hi *= 100; }
    out.verdict = verdict(out.result);
    out.enough = !!out.result;
    out.csv = nb.csv || db.csv || na.csv || da.csv;
    return out;
  }

  /** Last date with daily traffic data (both series use the same day grid). */
  function lastData(wish, traffic) {
    var a = PM.lastDate(traffic), b = PM.lastDate(wish);
    return { traffic: a, wish: b };
  }

  /**
   * Before/after read for one store change. S = { wishlists, traffic, beats, versions }, change = a version row.
   * Returns both metrics plus the confounders in the windows.
   */
  function storeTest(S, change, days) {
    days = clampDays(days == null ? DEFAULT_DAYS : days);
    var w = windows(change.date, days), L = lastData(S.wishlists, S.traffic);
    var ctrEnd = L.traffic, v2wEnd = L.traffic && L.wish ? (L.traffic < L.wish ? L.traffic : L.wish) : null;
    return {
      change: change, days: days, windows: w,
      ctr: storeRead("ctr", S.wishlists, S.traffic, w, days, ctrEnd),
      v2w: storeRead("v2w", S.wishlists, S.traffic, w, days, v2wEnd),
      confounders: confounders(change, days, S.beats, S.versions, steamEvents()),
    };
  }

  /** Version changes that can be tested, newest first. */
  function changes(versions) {
    return (versions || []).filter(function (v) { return v && !v.deleted && isYmd(v.date); })
      .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
  }

  /* ---------------- Off-Steam tests: impressions and clicks per variant ---------------- */

  /** A positioning line in the brief's form: "[familiar anchor] meets [twist], for players who [want X]". */
  function positioningLine(v) {
    var a = String((v && v.anchor) || "").trim(), t = String((v && v.twist) || "").trim(), w = String((v && v.want) || "").trim();
    if (!a || !t || !w) return "";
    return a + " meets " + t + ", for players who " + w.replace(/[.\s]+$/, "") + ".";
  }

  function cleanVariant(v, positioning) {
    if (!v) return null;
    var o = { label: String(v.label || "").slice(0, 60), text: String(v.text || "").slice(0, 300) };
    if (positioning) { o.anchor = String(v.anchor || "").slice(0, 80); o.twist = String(v.twist || "").slice(0, 80); o.want = String(v.want || "").slice(0, 120); o.text = positioningLine(o); }
    ["impressions", "clicks"].forEach(function (k) { var n = Number(v[k]); o[k] = isFinite(n) && n >= 0 ? Math.round(n) : null; });
    if (o.impressions != null && o.clicks != null && o.clicks > o.impressions) o.clicks = null;
    return o;
  }
  function cleanTest(t) {
    if (!t || !t.id) return null;
    var pos = t.kind === "positioning";
    var vs = (Array.isArray(t.variants) ? t.variants : []).map(function (v) { return cleanVariant(v, pos); }).filter(Boolean).slice(0, MAX_VARIANTS);
    if (vs.length < 2) return null;
    return { id: String(t.id).slice(0, 40), kind: pos ? "positioning" : "offsteam", name: String(t.name || "").slice(0, 80), channel: String(t.channel || "").slice(0, 40),
      from: isYmd(t.from) ? t.from : null, to: isYmd(t.to) ? t.to : null, note: String(t.note || "").slice(0, 300), variants: vs,
      created: Number(t.created) || 0, updated: Number(t.updated) || 0 };
  }

  /** Each variant against the first (the control), with the 95% overall range split across the comparisons. */
  function variantTest(t) {
    var vs = t.variants, ctl = vs[0], k = vs.length - 1, z = Z_BY_COMPARISONS[k] || Z_BY_COMPARISONS[3];
    var rows = vs.slice(1).map(function (v, i) {
      var row = { index: i + 1, variant: v, enough: false, reason: null, result: null, verdict: null };
      if (ctl.impressions == null || ctl.clicks == null || v.impressions == null || v.clicks == null) { row.reason = "missing"; return row; }
      if (ctl.impressions < MIN_VARIANT_IMPRESSIONS || v.impressions < MIN_VARIANT_IMPRESSIONS) { row.reason = "few"; return row; }
      var r = newcombe(ctl.clicks, ctl.impressions, v.clicks, v.impressions, z);
      ["a", "b"].forEach(function (x) { r[x].p *= 100; r[x].lo *= 100; r[x].hi *= 100; });
      r.diff *= 100; r.lo *= 100; r.hi *= 100;
      row.result = r; row.verdict = verdict(r); row.enough = true;
      return row;
    });
    var ctlRate = ctl.impressions > 0 && ctl.clicks != null ? wilson(ctl.clicks, ctl.impressions, z) : null;
    // A winner: a variant that beat the control, or the control when every other variant read worse.
    var better = rows.filter(function (r) { return r.verdict === "better"; });
    var winner = null;
    if (better.length === 1) winner = better[0].index;
    else if (better.length > 1) winner = better.sort(function (a, b) { return b.result.lo - a.result.lo; })[0].index;
    else if (rows.length && rows.every(function (r) { return r.verdict === "worse"; })) winner = 0;
    return { test: t, comparisons: k, z: z, control: ctl, controlRate: ctlRate, rows: rows, winner: winner };
  }

  /* ---------------- Ledger rows ---------------- */

  function r2(x) { return Math.round(x * 100) / 100; }
  function side(x) { return { k: x.k, n: x.n, value: r2(x.p), lo: r2(x.lo), hi: r2(x.hi) }; }

  /** test_lift for a store before/after read. Only reads above their minimums are sent (brief §2.4). */
  function storeSignal(T, metric) {
    var R = T[metric];
    if (!R || !R.enough) return null;
    var w = T.windows, r = R.result, c = T.change;
    return { key: "test_lift", label: "Test: " + c.asset + " " + c.label + ", " + R.name.toLowerCase() + " after vs before", value: r2(r.diff), unit: "pct",
      meta: { half: R.half, source: R.csv ? "steamworks-export" : "studio-entered", method: R.method, n: r.a.n + r.b.n,
        window: w.before.start + "/" + w.after.end, lo: r2(r.lo), hi: r2(r.hi), verdict: R.verdict, metric: metric, metric_unit: R.unit,
        id: "store:" + c.id + ":" + metric + ":" + T.days,
        test: { kind: "before_after", change_id: c.id, asset: c.asset, label: c.label, date: c.date, days: T.days },
        variants: { before: Object.assign({ window: w.before.start + "/" + w.before.end }, side(r.a)), after: Object.assign({ window: w.after.start + "/" + w.after.end }, side(r.b)) },
        confounders: T.confounders.map(function (x) { return x.kind + ": " + x.name + " (" + x.date + ")"; }).slice(0, 10) } };
  }

  /** test_lift rows for an off-Steam test: one per variant compared with the control. */
  function variantSignals(V) {
    var t = V.test;
    return V.rows.filter(function (r) { return r.enough; }).map(function (r) {
      var v = r.variant, res = r.result;
      return { key: "test_lift", label: "Test: " + (t.name || (t.kind === "positioning" ? "positioning" : "off-Steam")) + ", " + (v.label || "variant " + (r.index + 1)) + " vs " + (V.control.label || "control"),
        value: r2(res.diff), unit: "pct",
        meta: { half: "reach", source: "studio-entered", method: V.comparisons > 1 ? "newcombe95_bonferroni" : "newcombe95", n: res.a.n + res.b.n,
          window: t.from && t.to ? t.from + "/" + t.to : null, lo: r2(res.lo), hi: r2(res.hi), verdict: r.verdict, metric: "clicks", metric_unit: METRICS.clicks.unit,
          id: "variant:" + t.id + ":" + r.index, comparisons: V.comparisons,
          test: { kind: t.kind, id: t.id, name: t.name, channel: t.channel || null },
          variants: { control: Object.assign({ label: V.control.label, text: V.control.text }, side(res.a)), variant: Object.assign({ label: v.label, text: v.text }, side(res.b)) } } };
    });
  }

  return {
    DEFAULT_DAYS: DEFAULT_DAYS, MIN_DAYS: MIN_DAYS, MAX_DAYS: MAX_DAYS, MIN_IMPRESSIONS: MIN_IMPRESSIONS, MIN_VISITS: MIN_VISITS,
    MIN_VARIANT_IMPRESSIONS: MIN_VARIANT_IMPRESSIONS, MAX_VARIANTS: MAX_VARIANTS, Z_BY_COMPARISONS: Z_BY_COMPARISONS, METRICS: METRICS,
    STEAM_AB_CHECKED: STEAM_AB_CHECKED, STEAM_AB_SOURCES: STEAM_AB_SOURCES,
    newcombe: newcombe, rateDiff: rateDiff, verdict: verdict, clampDays: clampDays, windows: windows, confounders: confounders, steamEvents: steamEvents,
    storeTest: storeTest, changes: changes, positioningLine: positioningLine, cleanTest: cleanTest, variantTest: variantTest,
    storeSignal: storeSignal, variantSignals: variantSignals,
  };
});
