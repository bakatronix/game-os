/* Festival Radar — pure maths and list logic (UMD: window.FestivalModel / module.exports).
 * Steam's own events come from Window Planner's model (WindowModel.EVENTS); other festivals come from the
 * hand-maintained festivals.json in this folder. Measured lift reads Page Engine's daily wishlist adds.
 * Method follows §5.4 of docs/MARKETING-TOOLS-BRIEFS.md.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../page-engine/model.js"), require("../window-planner/model.js"));
  else root.FestivalModel = factory(root.PageModel, root.WindowModel);
})(typeof self !== "undefined" ? self : this, function (PM, WM) {
  "use strict";

  var isYmd = PM.isYmd, addDays = PM.addDays, daysBetween = PM.daysBetween, median = PM.median, poisson = PM.poisson;

  // A festival entry checked more than 90 days ago may have moved its dates; the page says so (brief §5.4).
  var STALE_DAYS = 90;
  // Baseline: median daily adds in the 14 days before the event, from at least 10 of those days (as Page Engine's beat read).
  var BASELINE_DAYS = PM.BEAT_BEFORE_DAYS;
  var MIN_BASELINE_DAYS = PM.MIN_BASELINE_DAYS;
  // Lift needs 10 adds during the event; below that the 95% Poisson range is wider than the count itself.
  var MIN_EVENT_ADDS = 10;
  // An event longer than 31 days isn't a festival window the baseline method can read.
  var MAX_EVENT_DAYS = 31;

  var STATUSES = ["considering", "submitted", "accepted", "rejected", "attended"];
  var BEAT_STATUSES = ["accepted", "attended"];

  /* ---------------- Helpers ---------------- */

  function norm(s) { return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
  function str(s, n) { return String(s == null ? "" : s).trim().slice(0, n); }
  function https(u) { u = str(u, 500); return /^https:\/\//i.test(u) ? u : ""; }
  function list(a, n) { return (Array.isArray(a) ? a : []).map(function (x) { return str(x, 60); }).filter(Boolean).slice(0, n); }
  function dateOr(d) { return isYmd(d) ? d : ""; }

  /* ---------------- Festivals from festivals.json ---------------- */

  /**
   * One festival from festivals.json, or null when it can't be shown honestly: it needs a name, an https source
   * URL and the date it was checked. Dates that aren't YYYY-MM-DD are dropped rather than guessed.
   */
  function cleanFestival(f) {
    if (!f || typeof f !== "object") return null;
    var name = str(f.name, 120), source = https(f.source), checked = dateOr(f.checked);
    if (!name || !source || !checked) return null;
    var o = {
      id: str(f.id, 60) || norm(name).replace(/ /g, "-"),
      name: name, url: https(f.url) || source,
      submissionOpens: dateOr(f.submissionOpens), submissionCloses: dateOr(f.submissionCloses),
      eventStart: dateOr(f.eventStart), eventEnd: dateOr(f.eventEnd),
      cost: str(f.cost, 80), platforms: list(f.platforms, 10), tags: list(f.tags, 20),
      source: source, checked: checked, kind: "festival",
    };
    if (o.eventStart && !o.eventEnd) o.eventEnd = o.eventStart;
    if (o.eventStart && o.eventEnd < o.eventStart) o.eventEnd = o.eventStart;
    if (!o.submissionCloses && !o.eventStart) return null;   // nothing to put on a calendar
    return o;
  }
  /** The festivals list from festivals.json ({ festivals: [...] }), keeping only entries that pass cleanFestival. */
  function festivalsFrom(json) {
    var raw = json && Array.isArray(json.festivals) ? json.festivals : [];
    var seen = {};
    return raw.map(cleanFestival).filter(function (f) { if (!f || seen[f.id]) return false; seen[f.id] = 1; return true; });
  }
  function isStale(f, today) { return !!(f && f.checked && isYmd(today) && daysBetween(f.checked, today) > STALE_DAYS); }

  /* ---------------- Steam's own events (read from Window Planner, not copied) ---------------- */

  /** Next Fest and Steam's themed fests from WindowModel.EVENTS. Sales, promos and holidays aren't festivals. */
  function steamEvents(events) {
    return (events || (WM && WM.EVENTS) || []).filter(function (e) { return e && (e.kind === "nextfest" || e.kind === "fest"); }).map(function (e) {
      return {
        id: "steam-" + e.id, name: e.name, kind: e.kind === "nextfest" ? "nextfest" : "steamfest", steam: true,
        url: WM ? WM.SOURCE : "", source: WM ? WM.SOURCE : "", checked: WM ? WM.CHECKED : "",
        submissionOpens: "", submissionCloses: "", eventStart: e.start, eventEnd: e.end || e.start,
        cost: "", platforms: ["Steam"], tags: e.kind === "fest" ? (e.match || []).slice() : [],
      };
    });
  }

  /* ---------------- Tags ---------------- */

  /** Tags to filter by: the game's genre (split on commas and slashes) plus the studio's own tags. */
  function gameTags(genre, extra) {
    var out = [];
    String(genre || "").split(/[,/;|]+/).concat(extra || []).forEach(function (t) { var n = norm(t); if (n && out.indexOf(n) < 0) out.push(n); });
    return out;
  }
  /**
   * Whether a festival suits the game's tags. Next Fest is open to every game with a demo; a festival with no
   * genre tags is treated as open to all. Otherwise one tag must match (either containing the other).
   */
  function matches(f, tags) {
    if (f.kind === "nextfest") return true;
    if (!f.tags || !f.tags.length) return f.kind !== "steamfest";
    if (!tags || !tags.length) return false;
    var ft = f.tags.map(norm);
    return tags.some(function (t) { return ft.some(function (x) { return x && (x === t || x.indexOf(t) >= 0 || t.indexOf(x) >= 0); }); });
  }

  /* ---------------- Deadline list ---------------- */

  /**
   * Upcoming festivals, nearest deadline first. The sort date is the submission close when it's still ahead,
   * otherwise the event start. Anything whose event has ended (or, with no event dates, whose deadline has
   * passed) is left out. `all` keeps festivals that don't match the tags.
   */
  function deadlines(items, today, tags, all) {
    return (items || []).filter(function (f) {
      var end = f.eventEnd || f.submissionCloses;
      return end && end >= today && (all || matches(f, tags));
    }).map(function (f) {
      var open = f.submissionCloses && f.submissionCloses >= today;
      var key = open ? f.submissionCloses : f.eventStart || f.submissionCloses;
      return {
        f: f, key: key, deadlineOpen: !!open, deadlinePassed: !!(f.submissionCloses && f.submissionCloses < today),
        daysToDeadline: open ? daysBetween(today, f.submissionCloses) : null,
        daysToEvent: f.eventStart ? daysBetween(today, f.eventStart) : null,
        running: !!(f.eventStart && f.eventStart <= today && f.eventEnd >= today),
        stale: !f.steam && isStale(f, today), match: matches(f, tags),
      };
    }).sort(function (a, b) { return a.key < b.key ? -1 : a.key > b.key ? 1 : a.f.name < b.f.name ? -1 : 1; });
  }

  /* ---------------- The studio's entries ---------------- */

  function cleanEntry(e) {
    if (!e || !e.id) return null;
    var name = str(e.name, 120);
    if (!name) return null;
    var o = {
      id: str(e.id, 60), festivalId: str(e.festivalId, 80), name: name,
      status: STATUSES.indexOf(e.status) >= 0 ? e.status : "considering",
      eventStart: dateOr(e.eventStart), eventEnd: dateOr(e.eventEnd), submitted: dateOr(e.submitted),
      note: str(e.note, 300), updated: Number(e.updated) || 0, deleted: !!e.deleted,
    };
    if (o.eventStart && (!o.eventEnd || o.eventEnd < o.eventStart)) o.eventEnd = o.eventStart;
    if (!o.eventStart) o.eventEnd = "";
    return o;
  }
  /** Merge two copies of the entry list by id; the later `updated` wins. Deleted entries are kept so the delete sticks. */
  function mergeEntries(a, b) {
    var by = {};
    (a || []).concat(b || []).forEach(function (x) { if (x && x.id && (!by[x.id] || (x.updated || 0) >= (by[x.id].updated || 0))) by[x.id] = x; });
    return Object.keys(by).map(function (k) { return by[k]; });
  }
  function entryFor(entries, festivalId) {
    return (entries || []).filter(function (e) { return !e.deleted && e.festivalId === festivalId; })[0] || null;
  }

  /**
   * The Page Engine beat for an entry (§5.2 id/tombstone shape). Accepted and attended festivals with an event
   * date are live beats dated to the first event day; anything else is a tombstone that removes an earlier beat.
   */
  function entryBeat(e, now) {
    var live = !e.deleted && BEAT_STATUSES.indexOf(e.status) >= 0 && isYmd(e.eventStart);
    return PM.cleanBeat({
      id: "fr-" + e.id, date: isYmd(e.eventStart) ? e.eventStart : PM.ymd(now || Date.now()),
      type: "festival", channel: "festival", effort: "", spend: null,
      note: (e.name + " (" + e.status + (e.eventEnd && e.eventEnd !== e.eventStart ? ", until " + e.eventEnd : "") + ")").slice(0, 300),
      updated: e.updated || now || Date.now(), deleted: !live,
    });
  }
  function beatRow(e, now) { var b = entryBeat(e, now); return b ? PM.beatSignal(b) : null; }

  /* ---------------- Measured lift ---------------- */

  /**
   * Wishlist adds during an attended event, minus a baseline: the median daily adds in the 14 days before the
   * event × the number of event days. The 95% range is the exact Poisson range on the event-window count, with
   * the baseline subtracted. "Rise" only when the baseline sits below that range. Other beats inside the event
   * window are listed, because their effect can't be separated from the festival's.
   */
  function lift(series, e, beats) {
    var out = { entry: e, enough: false, reason: "" };
    if (!e || !isYmd(e.eventStart) || !isYmd(e.eventEnd)) { out.reason = "dates"; return out; }
    var days = daysBetween(e.eventStart, e.eventEnd) + 1;
    out.days = days;
    if (days > MAX_EVENT_DAYS) { out.reason = "long"; return out; }
    var daily = PM.dailyAdds(series || []);
    var csv = true, any = false;
    (series || []).forEach(function (r) { if (r.from === r.to && r.adds != null) { any = true; if (r.src !== "csv") csv = false; } });
    if (!any) { out.reason = "nodata"; return out; }
    var before = [], during = 0, covered = 0;
    for (var i = 1; i <= BASELINE_DAYS; i++) { var d = addDays(e.eventStart, -i); if (daily[d] != null) before.push(daily[d]); }
    for (var j = 0; j < days; j++) { var x = addDays(e.eventStart, j); if (daily[x] != null) { during += daily[x]; covered++; } }
    out.beforeDays = before.length; out.coveredDays = covered; out.csv = csv;
    if (before.length < MIN_BASELINE_DAYS) { out.reason = "baseline"; return out; }
    if (covered < days) { out.reason = "event"; return out; }
    if (during < MIN_EVENT_ADDS) { out.reason = "few"; out.during = during; return out; }
    var base = median(before), p = poisson(during, 1), expected = base * days;
    out.enough = true;
    out.baselinePerDay = base; out.expected = expected; out.during = during;
    out.lift = during - expected; out.lo = p.lo - expected; out.hi = p.hi - expected;
    out.verdict = expected < p.lo ? "rise" : expected > p.hi ? "fall" : "none";
    out.overlaps = (beats || []).filter(function (b) {
      return b && !b.deleted && b.id !== "fr-" + e.id && isYmd(b.date) && b.date >= addDays(e.eventStart, -6) && b.date <= e.eventEnd;
    });
    return out;
  }

  /** One `festival_lift` ledger row for a measured event (Reach, with §2.3 provenance). */
  function liftSignal(L) {
    if (!L || !L.enough) return null;
    var e = L.entry;
    return {
      key: "festival_lift", label: "Festival lift: " + e.name, value: Math.round(L.lift), unit: "units",
      meta: {
        half: "reach", source: L.csv ? "steamworks-export" : "studio-entered", method: "poisson95-minus-median14",
        n: L.during, window: e.eventStart + "/" + e.eventEnd, lo: Math.round(L.lo), hi: Math.round(L.hi),
        festival: e.name, festival_id: e.festivalId || null, entry_id: e.id, event_days: L.days,
        baseline_per_day: Math.round(L.baselinePerDay * 10) / 10, baseline_days: L.beforeDays, expected: Math.round(L.expected),
        verdict: L.verdict, overlapping_beats: (L.overlaps || []).length,
      },
    };
  }

  return {
    STALE_DAYS: STALE_DAYS, BASELINE_DAYS: BASELINE_DAYS, MIN_BASELINE_DAYS: MIN_BASELINE_DAYS, MIN_EVENT_ADDS: MIN_EVENT_ADDS,
    MAX_EVENT_DAYS: MAX_EVENT_DAYS, STATUSES: STATUSES, BEAT_STATUSES: BEAT_STATUSES,
    norm: norm, cleanFestival: cleanFestival, festivalsFrom: festivalsFrom, isStale: isStale, steamEvents: steamEvents,
    gameTags: gameTags, matches: matches, deadlines: deadlines,
    cleanEntry: cleanEntry, mergeEntries: mergeEntries, entryFor: entryFor, entryBeat: entryBeat, beatRow: beatRow,
    lift: lift, liftSignal: liftSignal,
  };
});
