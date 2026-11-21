/* PMF Analyzer — pure scoring over /api/pmf data (UMD: window.PmfModel / module.exports).
 * Every score is 0–100 and comes with the numbers behind it, so the page can show its working.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PmfModel = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var MIN_REVIEWS = 50;          // below this a verdict is guesswork
  var PLAYTIME_FULL_H = 10;      // a 10-hour median scores full marks on playtime
  var ACH_FULL = 30;             // a 30% median achievement rate scores full marks on depth
  var REFUND_H = 2;              // Steam's refund window
  var SEAN_ELLIS = 40;           // % "very disappointed" that signals PMF
  var REVIEWS_PER_COPY = 30;     // same rule of thumb as Market Scope

  function clamp(v, lo, hi) { return Math.max(lo == null ? 0 : lo, Math.min(hi == null ? 100 : hi, v)); }
  function sum(list, k) { return list.reduce(function (a, x) { return a + (x[k] || 0); }, 0); }
  function median(list) {
    if (!list.length) return null;
    var s = list.slice().sort(function (a, b) { return a - b; }), m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function pctPos(list) { var u = sum(list, "up"), d = sum(list, "down"); return u + d ? (u / (u + d)) * 100 : null; }
  /** Share of values strictly below v, as 0–100. */
  function percentile(values, v) {
    if (!values.length || v == null) return null;
    var below = 0, eq = 0;
    values.forEach(function (x) { if (x < v) below++; else if (x === v) eq++; });
    return ((below + eq / 2) / values.length) * 100;
  }

  /** Generic tags that make poor peer groups. */
  var BROAD = { 492: 1, 4182: 1, 3871: 1, 4191: 1, 3859: 1, 1756: 1, 493: 1, 113: 1, 19: 1, 21: 1, 597: 1, 9: 1, 599: 1, 122: 1, 4305: 1, 4726: 1, 7481: 1, 3834: 1, 1742: 1, 4166: 1, 4136: 1, 3964: 1 };
  function peerTags(tags) {
    var t = (tags || []).filter(function (x) { return !BROAD[x.id]; });
    if (t.length < 2) t = tags || [];
    return t.slice(0, 2).map(function (x) { return x.id; });
  }
  function addMonths(ymd, n) {
    var p = ymd.split("-"), d = new Date(Date.UTC(+p[0], +p[1] - 1 + n, +p[2]));
    return d.toISOString().slice(0, 10);
  }
  /** The release window peers are drawn from: ±9 months around the first release, never in the future. */
  function peerWindow(D, today) {
    var rel = D.firstReleased || D.released;
    if (!rel) return null;
    var to = addMonths(rel, 9);
    if (to > today) to = today;
    return { from: addMonths(rel, -9), to: to };
  }

  function analyse(D, peers) {
    var R = {};
    var N = D.reviews.total || 0, pct = D.reviews.pct;
    R.tooEarly = N < MIN_REVIEWS;

    // ---- Satisfaction ----
    var h = D.history || [];
    var last3 = h.slice(-3), prev3 = h.slice(-6, -3);
    var sat = {
      score: pct == null ? null : pct,
      pct: pct, total: N, label: D.reviews.label,
      recent3: pctPos(last3), recent3n: sum(last3, "up") + sum(last3, "down"),
      recent30: pctPos(D.recent || []), recent30n: sum(D.recent || [], "up") + sum(D.recent || [], "down"),
    };
    sat.drift = sat.recent3 != null && pct != null && sat.recent3n >= 20 ? sat.recent3 - pct : null;
    R.satisfaction = sat;

    // ---- Engagement ----
    var P = D.players || {};
    var medH = P.medianMinutes ? P.medianMinutes / 60 : null;
    var avgH = P.avgMinutes ? P.avgMinutes / 60 : null;
    var ach = D.achievements && D.achievements.percents && D.achievements.percents.length ? D.achievements.percents : null;
    var achMed = ach ? median(ach) : null;
    var achFirst = ach ? ach[0] : null;
    var parts = [];
    if (medH != null) parts.push(clamp((medH / PLAYTIME_FULL_H) * 100));
    if (achMed != null) parts.push(clamp((achMed / ACH_FULL) * 100));
    R.engagement = {
      score: parts.length ? parts.reduce(function (a, b) { return a + b; }, 0) / parts.length : null,
      medianHours: medH, avgHours: avgH,
      median2wHours: P.median2wMinutes ? P.median2wMinutes / 60 : null,
      achCount: ach ? ach.length : 0, achMedian: achMed, achFirst: achFirst, achLast: ach ? ach[ach.length - 1] : null,
      hoursPerDollar: medH != null && D.price ? medH / (D.price / 100) : null,
      refundRisk: medH != null && medH < REFUND_H,
    };

    // ---- Reach ----
    var reach = { total: N, owners: P.owners || null, current: P.current, peak: P.peakYesterday, estCopies: N * REVIEWS_PER_COPY };
    if (peers && peers.rows && peers.rows.length >= 10) {
      var others = peers.rows.filter(function (r) { return r[0] !== D.appid; });
      reach.peerN = others.length;
      reach.peerPct = percentile(others.map(function (r) { return r[4] || 0; }), N);
      var rated = others.filter(function (r) { return r[5] != null && (r[4] || 0) >= MIN_REVIEWS; });
      sat.peerPct = rated.length >= 10 && pct != null ? percentile(rated.map(function (r) { return r[5]; }), pct) : null;
      sat.peerN = rated.length;
      reach.peerMedian = median(others.map(function (r) { return r[4] || 0; }));
      reach.score = reach.peerPct;
      reach.method = "peers";
    } else {
      reach.score = N > 0 ? clamp((Math.log10(N) / 5) * 100) : 0;
      reach.method = "scale";
    }
    R.reach = reach;

    // ---- Momentum & updates ----
    var up3 = sum(last3, "up") + sum(last3, "down"), up6 = sum(prev3, "up") + sum(prev3, "down");
    var news = D.news || [];
    R.momentum = {
      last3: up3, prev3: up6, change: up6 > 0 ? (up3 - up6) / up6 : null,
      patches90: news.filter(function (n) { return n.patch && n.age <= 90; }).length,
      patches365: news.filter(function (n) { return n.patch && n.age <= 365; }).length,
      lastUpdate: news.length ? news[0] : null,
    };

    // ---- Verdict ----
    var s = sat.score, e = R.engagement.score, r = reach.score;
    var v;
    if (R.tooEarly) v = { key: "early", label: "Too early to call", text: "Fewer than " + MIN_REVIEWS + " reviews. The scores below are shown, but they can swing a long way with the next few reviews." };
    else if (s >= 85 && r >= 60 && (e == null || e >= 50)) v = { key: "strong", label: "Strong fit", text: "Players love it, they keep playing, and it has found a real audience." };
    else if (s >= 85 && r < 60) v = { key: "hidden", label: "Loved, but not found yet", text: "The players who find it are very happy. The gap is reach: more people need to discover it." };
    else if (s >= 75 && (e == null || e >= 40)) v = { key: "promising", label: "Promising", text: "Players mostly like it. Look at the weakest of the three scores below for where to push." };
    else if (s < 70) v = { key: "weak", label: "Not there yet", text: "Too many buyers are unhappy. Fix what reviews complain about before spending on reach." };
    else v = { key: "mixed", label: "Mixed signals", text: "Some signs of fit, but no clear strength yet. Read each lens below." };
    R.verdict = v;

    R.recs = recommendations(D, R);
    return R;
  }

  function recommendations(D, R) {
    var out = [], S = R.satisfaction, E = R.engagement, Rc = R.reach, M = R.momentum;
    function add(pri, title, detail, tool) { out.push({ pri: pri, title: title, detail: detail, tool: tool || null }); }
    if (R.tooEarly) add("high", "Get to 50 reviews", "Under 50 reviews, every score here is noisy. Ask early players for reviews, for example in your Discord and in-game after a good session.", null);
    if (S.score != null && S.score < 70) add("high", "Fix what players dislike first", S.score + "% of reviews are positive. Below 70% Steam labels the game Mixed or worse, which cuts store visibility. Read the negative reviews and fix the top complaint before spending on marketing.", { id: "chicken-brulee", name: "Chicken Brûlée" });
    if (S.drift != null && S.drift <= -5) add("high", "Recent reviews are slipping", "The last three months are " + Math.round(S.recent3) + "% positive against " + S.pct + "% all-time. Check what changed: a patch, a price change or a new audience.", null);
    if (S.drift != null && S.drift >= 5) add("low", "Recent reviews are improving", "The last three months are " + Math.round(S.recent3) + "% positive, above the all-time " + S.pct + "%. Say so on the store page and in your next announcement.", null);
    if (E.refundRisk) add("high", "Players stop before two hours", "The median player has played " + E.medianHours.toFixed(1) + " hours, inside Steam's two-hour refund window. Make the first hour count: tighten onboarding and get to the hook sooner.", { id: "playtest-pipeline", name: "Playtest Pipeline" });
    if (E.achFirst != null && E.achFirst < 60) add("medium", "Many players never get going", "Only " + Math.round(E.achFirst) + "% of owners have earned even the easiest achievement. Many buyers barely start the game: look at the first session.", null);
    if (S.score != null && S.score >= 85 && Rc.score != null && Rc.score < 50) add("high", "Spend on being found", "Players rate it highly, but reach is low. Festivals, creators and a store page refresh will do more than changes to the game.", { id: "festival-radar", name: "Festival Radar" });
    if (M.change != null && M.change <= -0.4 && M.prev3 >= 30) add("medium", "Interest is fading", "Reviews in the last three months are down " + Math.round(-M.change * 100) + "% on the three months before. An update, a sale or a content drop can restart it.", { id: "long-tail-engine", name: "Long Tail Engine" });
    if (M.patches90 === 0 && (D.news || []).length) add("low", "No update announced in 90 days", "Steam shows no patch or update post in the last 90 days. Regular update posts keep followers and wishlisters coming back.", null);
    if (E.hoursPerDollar != null && E.hoursPerDollar >= 1.5 && S.score >= 85) add("low", "Price has headroom", E.hoursPerDollar.toFixed(1) + " hours of median play per dollar. Players get a lot for the price, so a higher price on your next game or DLC is defensible.", { id: "price-calc", name: "Pricing Calculator" });
    if (!out.length) add("low", "Keep doing what works", "No warning signs in Steam's public data. Watch the review trend and keep the update rhythm going.", null);
    var order = { high: 0, medium: 1, low: 2 };
    return out.sort(function (a, b) { return order[a.pri] - order[b.pri]; });
  }

  function seanEllis(very, somewhat, notv) {
    var n = (very || 0) + (somewhat || 0) + (notv || 0);
    if (!n) return null;
    var share = (very / n) * 100;
    return { n: n, share: share, pass: share >= SEAN_ELLIS, small: n < 40 };
  }

  return {
    MIN_REVIEWS: MIN_REVIEWS, PLAYTIME_FULL_H: PLAYTIME_FULL_H, ACH_FULL: ACH_FULL, REFUND_H: REFUND_H,
    SEAN_ELLIS: SEAN_ELLIS, REVIEWS_PER_COPY: REVIEWS_PER_COPY,
    analyse: analyse, peerTags: peerTags, peerWindow: peerWindow, seanEllis: seanEllis, median: median, percentile: percentile,
  };
});
