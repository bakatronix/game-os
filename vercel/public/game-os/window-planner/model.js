/* Window Planner — pure model. UMD: window.WindowModel in the browser, module.exports in Node.
 *
 * Inputs:
 *   upcoming: /api/window-planner payload (Steam coming-soon rows under the tags)
 *   history:  /api/market-scope payload (releases under the same tags, last 36 months)
 *   opts:     { today: "YYYY-MM-DD", weeks: 26, tagNames: ["Roguelike", ...] }
 * Output: one entry per candidate launch week (Monday to Sunday) with crowding,
 * Steam events it touches, which seasonal sale it can still join, a score and reasons.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.WindowModel = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DAY = 86400000;

  /* Steam's own calendar, from Steamworks (checked 2026-11-21).
     https://partner.steamgames.com/doc/marketing/upcoming_events
     Update this list when Valve announces new dates; KNOWN_UNTIL marks where it ends. */
  var CHECKED = "2026-11-21";
  var SOURCE = "https://partner.steamgames.com/doc/marketing/upcoming_events";
  var KNOWN_UNTIL = "2027-07-08";
  var EVENTS = [
    { id: "bf26", kind: "promo", name: "Black Friday discounts", start: "2026-11-26", end: "2026-11-30" },
    { id: "winter26", kind: "sale", name: "Steam Winter Sale", start: "2026-12-17", end: "2027-01-04" },
    { id: "nf-feb27", kind: "nextfest", name: "Steam Next Fest", start: "2027-02-22", end: "2027-03-01" },
    { id: "spring27", kind: "sale", name: "Steam Spring Sale", start: "2027-03-18", end: "2027-03-25" },
    { id: "nf-jun27", kind: "nextfest", name: "Steam Next Fest", start: "2027-06-14", end: "2027-06-21" },
    { id: "summer27", kind: "sale", name: "Steam Summer Sale", start: "2027-06-24", end: "2027-07-08" },
    // Holidays when press, creators and players are thin on the ground (not Steam events).
    { id: "xmas26", kind: "holiday", name: "Christmas and New Year", start: "2026-12-21", end: "2027-01-01" },
    { id: "lny27", kind: "holiday", name: "Lunar New Year week", start: "2027-02-05", end: "2027-02-12" },
    // Steam themed fests. Only those matching your tags are shown as relevant.
    { id: "f-autobattler", kind: "fest", name: "Auto-Battler RPG Fest", start: "2026-11-16", end: "2026-11-23", match: ["auto battler", "autobattler"] },
    { id: "f-companion", kind: "fest", name: "Desktop Companion Fest", start: "2027-01-14", end: "2027-01-18", match: ["idler", "clicker", "desktop"] },
    { id: "f-shop", kind: "fest", name: "Shop Keeper Fest", start: "2027-01-25", end: "2027-02-01", match: ["shop keeper", "management", "trading"] },
    { id: "f-sheep", kind: "fest", name: "Sheep Fest", start: "2027-02-04", end: "2027-02-08", match: ["sheep", "farming"] },
    { id: "f-couch", kind: "fest", name: "Couch Co-Op Fest", start: "2027-02-08", end: "2027-02-15", match: ["local co op", "co op", "local multiplayer", "split screen"] },
    { id: "f-rhythm", kind: "fest", name: "Rhythm Fest", start: "2027-03-08", end: "2027-03-15", match: ["rhythm", "music"] },
    { id: "f-dinos", kind: "fest", name: "Dinos vs. Robots Fest", start: "2027-03-29", end: "2027-04-05", match: ["dinosaurs", "robots", "mechs"] },
    { id: "f-racing", kind: "fest", name: "Racing Fest", start: "2027-04-12", end: "2027-04-19", match: ["racing", "driving"] },
    { id: "f-witch", kind: "fest", name: "Witch Fest", start: "2027-04-22", end: "2027-04-26", match: ["witch", "magic"] },
    { id: "f-fighting", kind: "fest", name: "Fighting Fest", start: "2027-04-26", end: "2027-05-03", match: ["fighting", "2d fighter", "3d fighter", "beat em up"] },
    { id: "f-rts", kind: "fest", name: "Real-Time Strategy Fest", start: "2027-05-10", end: "2027-05-17", match: ["rts", "real time strategy"] },
    { id: "f-mountain", kind: "fest", name: "Mountaineering Fest", start: "2027-05-31", end: "2027-06-03", match: ["climbing", "mountaineering"] },
  ];

  /* Steam rules that shape the date (Steamworks discounting and Next Fest docs). */
  var RULES = {
    saleGapDays: 30,         // released at least 30 days before a seasonal sale starts to join it
    launchDiscountMax: 40,   // launch discount up to 40%
    launchDiscountMin: 10,
    launchDiscountDays: [7, 14],
  };

  /* ---------------- Dates (UTC, "YYYY-MM-DD") ---------------- */
  function d(s) { var p = String(s).split("-"); return Date.UTC(+p[0], +p[1] - 1, +(p[2] || 1)); }
  function iso(t) { return new Date(t).toISOString().slice(0, 10); }
  function addDays(s, n) { return iso(d(s) + n * DAY); }
  function nextMonday(s) { var t = d(s), wd = new Date(t).getUTCDay(); return iso(t + ((8 - wd) % 7 || 7) * DAY); }
  function overlaps(aS, aE, bS, bE) { return aS <= bE && bS <= aE; }
  function daysBetween(a, b) { return Math.round((d(b) - d(a)) / DAY); }
  function daysInMonth(ym) { var p = ym.split("-"); return new Date(Date.UTC(+p[0], +p[1], 0)).getUTCDate(); }

  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function fmt(s, withYear) { var p = s.split("-"); return MON[+p[1] - 1] + " " + (+p[2]) + (withYear ? ", " + p[0] : ""); }
  function fmtRange(a, b) {
    var pa = a.split("-"), pb = b.split("-");
    if (pa[0] !== pb[0]) return fmt(a, true) + " – " + fmt(b, true);
    if (pa[1] === pb[1]) return fmt(a) + "–" + (+pb[2]) + ", " + pb[0];
    return fmt(a) + " – " + fmt(b) + ", " + pb[0];
  }

  function norm(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
  function median(xs) { if (!xs.length) return null; var a = xs.slice().sort(function (x, y) { return x - y; }); var m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; }

  /* ---------------- Analysis ---------------- */
  function analyse(upcoming, history, opts) {
    opts = opts || {};
    var today = opts.today || iso(Date.now());
    var nWeeks = opts.weeks || 26;
    var tagNames = (opts.tagNames || []).map(norm);
    var first = nextMonday(today);

    // Upcoming: exact dates by day, month-only counts by month.
    var byDay = {}, byMonth = {}, dated = [];
    (upcoming && upcoming.rows || []).forEach(function (r) {
      if (r[2]) { (byDay[r[2]] = byDay[r[2]] || []).push(r); dated.push(r); }
      else if (r[3]) byMonth[r[3]] = (byMonth[r[3]] || 0) + 1;
    });

    // History: release dates under the same tags, to see how crowded each calendar week usually is.
    var hist = (history && history.rows || []).map(function (r) { return r[2]; }).filter(Boolean);
    var histFrom = history && history.from ? history.from : null;

    var fests = EVENTS.filter(function (e) {
      if (e.kind !== "fest") return true;
      return (e.match || []).some(function (m) { return tagNames.some(function (t) { return t === m || t.indexOf(m) >= 0 || m.indexOf(t) >= 0; }); });
    });

    var weeks = [];
    for (var i = 0; i < nWeeks; i++) {
      var start = addDays(first, i * 7), end = addDays(start, 6);
      var w = { i: i, start: start, end: end, label: fmt(start), games: [], announced: 0, monthShare: 0, typical: null, typicalYears: 0, events: [], flags: [] };

      for (var k = 0; k < 7; k++) {
        var day = addDays(start, k);
        if (byDay[day]) { w.games = w.games.concat(byDay[day]); }
      }
      w.announced = w.games.length;
      // Games Steam lists only by month: spread them evenly over the month's days.
      for (k = 0; k < 7; k++) {
        var ym = addDays(start, k).slice(0, 7);
        if (byMonth[ym]) w.monthShare += byMonth[ym] / daysInMonth(ym);
      }

      // Typical: same 7 days shifted back 52, 104 and 156 weeks (same weekdays), averaged over years we have data for.
      if (hist.length && histFrom) {
        var counts = [];
        for (var y = 1; y <= 3; y++) {
          var hs = addDays(start, -364 * y), he = addDays(end, -364 * y);
          if (hs < histFrom) continue;
          counts.push(hist.filter(function (x) { return x >= hs && x <= he; }).length);
        }
        if (counts.length) { w.typical = counts.reduce(function (a, b) { return a + b; }, 0) / counts.length; w.typicalYears = counts.length; }
      }
      // Far-out weeks are under-announced: expect at least what this week usually sees.
      w.expected = Math.max(w.announced + w.monthShare, w.typical || 0);

      fests.forEach(function (e) { if (overlaps(start, end, e.start, e.end)) w.events.push(e); });

      // Seasonal sales: the next one this launch could join (released 30+ days before it starts).
      var launch = addDays(start, 1); // a Tuesday launch, the usual pick
      w.launch = launch;
      var sales = EVENTS.filter(function (e) { return e.kind === "sale" && e.start > launch; });
      w.nextSale = sales[0] || null;
      w.canJoinNext = w.nextSale ? daysBetween(launch, w.nextSale.start) >= RULES.saleGapDays : null;
      w.joinableSale = null;
      for (k = 0; k < sales.length; k++) if (daysBetween(launch, sales[k].start) >= RULES.saleGapDays) { w.joinableSale = sales[k]; break; }
      w.beyondKnown = end > KNOWN_UNTIL;
      weeks.push(w);
    }

    // Crowding relative to the window itself.
    var med = median(weeks.map(function (w) { return w.expected; })) || 0;
    weeks.forEach(function (w) {
      // +1 on both sides so one game doesn't make a week "busy" in a small space.
      w.ratio = (w.expected + 1) / (med + 1);
      w.crowd = w.ratio <= 0.8 ? "quiet" : w.ratio >= 1.25 ? "busy" : "normal";
      score(w);
    });

    var picks = pickBest(weeks, 3);
    return {
      today: today, first: first, weeks: weeks, median: med, picks: picks,
      upcomingTotal: dated.length + Object.keys(byMonth).reduce(function (a, k) { return a + byMonth[k]; }, 0),
      undated: upcoming ? upcoming.undated || 0 : 0,
      truncated: !!(upcoming && upcoming.truncated), historyTruncated: !!(history && history.truncated),
      knownUntil: KNOWN_UNTIL, fests: fests,
    };
  }

  /* Score 0–100: start at 70, add for a quiet week, take off for crowding and clashes. Each change is a reason. */
  function score(w) {
    var s = 70, why = [];
    var crowdAdj = Math.max(-30, Math.min(20, Math.round((1 - w.ratio) * 40)));
    s += crowdAdj;
    var exp = Math.round(w.expected * 10) / 10;
    if (w.crowd === "quiet") why.push({ good: true, text: "Quieter than most weeks: about " + fmtN(exp) + " releases under your tags expected" });
    else if (w.crowd === "busy") why.push({ good: false, text: "Busier than most weeks: about " + fmtN(exp) + " releases under your tags expected" });
    else why.push({ neutral: true, text: "A normal week: about " + fmtN(exp) + " releases under your tags expected" });

    w.events.forEach(function (e) {
      if (e.kind === "sale") { s -= 35; why.push({ good: false, text: "Clashes with the " + e.name + ": the store front is all discounts, and a game launched during it can't join it" }); }
      else if (e.kind === "nextfest") { s -= 25; why.push({ good: false, text: "Clashes with " + e.name + ": the front page is full of demos" }); }
      else if (e.kind === "holiday") { s -= 15; why.push({ good: false, text: e.name + ": press and creators are away" }); }
      else if (e.kind === "promo") { s -= 5; why.push({ good: false, text: e.name + " are running on Steam that week" }); }
      else if (e.kind === "fest") { why.push({ neutral: true, text: "Overlaps the " + e.name + " (your genre): check whether it takes new releases" }); }
    });

    if (w.nextSale && !w.canJoinNext && !w.events.some(function (e) { return e.kind === "sale"; })) {
      s -= 10;
      why.push({ good: false, text: "Too close to the " + w.nextSale.name + " (" + fmt(w.nextSale.start) + ") to join it: you need 30 days on sale first" });
    } else if (w.nextSale && w.canJoinNext && daysBetween(w.launch, w.nextSale.start) <= 75) {
      s += 5;
      why.push({ good: true, text: "Released in time to join the " + w.nextSale.name + " (" + fmt(w.nextSale.start) + ") with a discount" });
    }
    if (w.beyondKnown) why.push({ neutral: true, text: "Steam hasn't announced its events this far out yet" });

    w.score = Math.max(0, Math.min(100, Math.round(s)));
    w.why = why;
  }

  function fmtN(n) { return n < 10 ? (Math.round(n * 10) / 10).toString() : Math.round(n).toString(); }

  /* Best weeks, at least two weeks apart so the shortlist isn't three neighbours. */
  function pickBest(weeks, n) {
    var sorted = weeks.slice().sort(function (a, b) { return b.score - a.score || a.expected - b.expected || a.i - b.i; });
    var out = [];
    for (var i = 0; i < sorted.length && out.length < n; i++) {
      var w = sorted[i];
      if (out.some(function (p) { return Math.abs(p.i - w.i) < 2; })) continue;
      out.push(w);
    }
    return out;
  }

  return {
    EVENTS: EVENTS, RULES: RULES, CHECKED: CHECKED, SOURCE: SOURCE, KNOWN_UNTIL: KNOWN_UNTIL,
    analyse: analyse, fmt: fmt, fmtRange: fmtRange, addDays: addDays, daysBetween: daysBetween, nextMonday: nextMonday,
  };
});
