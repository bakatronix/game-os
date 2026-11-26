/* Momentum Score — Game OS (UMD: window.Momentum / module.exports).
 *
 * Turns a game's signal ledger into one 0–100 score:
 *   1. Each known signal is scored 0–100 against a stated benchmark (RULES).
 *   2. Scored signals roll up into four pillars: Market, Store page, Players, Steam traction.
 *      Signals that measure the same thing share a group; only the newest of a group counts.
 *   3. Pillars are weighted by the game's stage (WEIGHTS) — market evidence matters most at
 *      Concept, live traction most after launch. Pillars with no data drop out and the
 *      remaining weights are rescaled; `coverage` says how much of the ideal picture exists.
 * Signals without a rule stay in the ledger but don't move the score.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Momentum = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function clamp(v) { return Math.max(0, Math.min(100, v)); }
  function log(v) { return Math.log10(Math.max(0, v) + 1); }

  var PILLARS = [
    { id: "market", name: "Market", q: "Is there a paying audience for this kind of game?", tools: [{ id: "market-scope", name: "Market Scope" }, { id: "mobile-calc", name: "Mobile Calculator" }] },
    { id: "page", name: "Store page", q: "Will the store page turn visitors into wishlists?", tools: [{ id: "steam-page-audit", name: "Steam Page Audit" }] },
    { id: "players", name: "Players", q: "Do the people who play it like it?", tools: [{ id: "chicken-brulee", name: "Chicken Brûlée" }, { id: "PMF", name: "PMF Analyzer" }] },
    { id: "traction", name: "Steam traction", q: "Is it finding players on Steam, and is that growing?", tools: [{ id: "PMF", name: "PMF Analyzer" }] },
  ];

  /* Stage 1–8 (Concept … Post-launch). Index 0 unused. */
  var WEIGHTS = {
    market:   [0, 0.6, 0.5, 0.3, 0.2, 0.15, 0.1, 0.1, 0.1],
    page:     [0, 0.1, 0.2, 0.4, 0.4, 0.35, 0.3, 0.2, 0.1],
    players:  [0, 0.3, 0.3, 0.3, 0.3, 0.35, 0.3, 0.3, 0.3],
    traction: [0, 0,   0,   0,   0.1, 0.15, 0.3, 0.4, 0.5],
  };

  /* key → { pillar, group, score(value, signal), bench } */
  var RULES = {
    market_hit_rate: { pillar: "market", group: "market_hit", score: function (v) { return clamp((v / 14) * 100); },
      bench: "Share of similar games earning over $100K. A typical Steam space is around 7%; 14% or more scores full marks." },
    market_median_revenue: { pillar: "market", group: "market_median", score: function (v) { return clamp(((Math.log10(Math.max(v, 1)) - 2) / 3) * 100); },
      bench: "Median gross revenue of similar games, on a log scale: $100 scores 0, $1K 33, $10K 67, $100K 100." },
    market_release_change: { pillar: "market", group: "market_crowding", score: function (v) { return clamp(50 - v / 2); },
      bench: "Change in yearly releases in your space. Flat scores 50; doubling scores 0; halving scores 75." },
    mobile_ltv_cpi_ratio: { pillar: "market", group: "mobile_ratio", score: function (v, s) { var t = (s.meta && s.meta.target) || 3; return clamp((v / t) * 75); },
      bench: "Lifetime value per install ÷ cost per install. Hitting your target ratio scores 75." },
    page_audit_overall: { pillar: "page", group: "page_audit", score: function (v) { return clamp(v); },
      bench: "Steam Page Audit's own 100-point score across art, trailer, description, reviews and pricing." },
    playtest_positive_share: { pillar: "players", group: "playtest", score: function (v) { return clamp(v); },
      bench: "Share of playtest observations that are positive (Chicken Brûlée)." },
    pmf_sean_ellis: { pillar: "players", group: "sean_ellis", score: function (v) { return clamp((v / 40) * 75); },
      bench: "Share of your players who'd be very disappointed to lose the game. 40%, the usual product-market-fit line, scores 75." },
    pmf_engagement: { pillar: "players", group: "engagement", score: function (v) { return clamp(v); },
      bench: "PMF Analyzer engagement: median playtime and achievement depth." },
    pmf_satisfaction: { pillar: "players", group: "review_pct", score: function (v) { return clamp((v - 50) * 2); },
      bench: "Share of positive Steam reviews. 50% scores 0, 75% scores 50, 100% scores 100. Below 70% Steam labels it Mixed." },
    steam_review_pct: { pillar: "players", group: "review_pct", score: function (v) { return clamp((v - 50) * 2); },
      bench: "Share of positive Steam reviews. 50% scores 0, 75% scores 50, 100% scores 100. Below 70% Steam labels it Mixed." },
    steam_review_pct_30d: { pillar: "players", group: "review_pct_30d", score: function (v) { return clamp((v - 50) * 2); },
      bench: "Positive share of the last 30 days of reviews, same scale. Shows whether recent players are happier or less happy." },
    pmf_reach: { pillar: "traction", group: "reach", score: function (v) { return clamp(v); },
      bench: "PMF Analyzer reach: review count ranked against similar games." },
    steam_reviews: { pillar: "traction", group: "reach", score: function (v) { return clamp((log(v) / 5) * 100); },
      bench: "Total Steam reviews on a log scale: 100 scores 40, 1,000 scores 60, 10,000 scores 80, 100,000 scores 100." },
    steam_reviews_30d: { pillar: "traction", group: "reviews_30d", score: function (v) { return clamp((log(v) / 4) * 100); },
      bench: "Reviews in the last 30 days, on a log scale: 10 scores 26, 100 scores 50, 1,000 scores 75, 10,000 scores 100." },
    steam_players: { pillar: "traction", group: "players_now", score: function (v) { return clamp((log(v) / 4) * 100); },
      bench: "Players in game when the snapshot ran, on a log scale: 10 scores 26, 100 scores 50, 1,000 scores 75." },
  };

  function time(s) { return new Date(s.observedAt).getTime(); }

  /** Latest signal per key (from rows, optionally only those on or before `asOf`). */
  function latest(rows, asOf) {
    var by = {};
    rows.forEach(function (r) {
      if (r.value == null || !isFinite(r.value)) return;
      if (asOf != null && time(r) > asOf) return;
      var cur = by[r.key];
      if (!cur || time(r) >= time(cur)) by[r.key] = r;
    });
    return by;
  }

  /** Momentum from a { key: signal } map of latest values. */
  function compute(byKey, stage) {
    stage = Math.min(8, Math.max(1, Number(stage) || 1));
    var groups = {};
    Object.keys(byKey).forEach(function (k) {
      var rule = RULES[k]; if (!rule) return;
      var s = byKey[k], g = groups[rule.group];
      if (!g || time(s) > time(g.signal)) groups[rule.group] = { key: k, rule: rule, signal: s };
    });
    var pillars = PILLARS.map(function (p) {
      var items = Object.keys(groups).map(function (g) { return groups[g]; }).filter(function (x) { return x.rule.pillar === p.id; })
        .map(function (x) { return { key: x.key, signal: x.signal, score: x.rule.score(x.signal.value, x.signal), bench: x.rule.bench }; });
      var score = items.length ? items.reduce(function (a, x) { return a + x.score; }, 0) / items.length : null;
      return { id: p.id, name: p.name, q: p.q, tools: p.tools, weight: WEIGHTS[p.id][stage], score: score, items: items };
    });
    var wAll = pillars.reduce(function (a, p) { return a + p.weight; }, 0);
    var have = pillars.filter(function (p) { return p.score != null && p.weight > 0; });
    var wHave = have.reduce(function (a, p) { return a + p.weight; }, 0);
    var score = wHave ? have.reduce(function (a, p) { return a + p.score * p.weight; }, 0) / wHave : null;
    pillars.forEach(function (p) { p.share = wHave && p.score != null && p.weight > 0 ? p.weight / wHave : 0; });
    return { score: score, coverage: wAll ? wHave / wAll : 0, stage: stage, pillars: pillars };
  }

  /** Momentum over time: a point per day (short spans) or per week, using what was known then. */
  function history(rows, stage, now) {
    now = now || Date.now();
    var scored = rows.filter(function (r) { return RULES[r.key] && r.value != null; });
    if (!scored.length) return [];
    var first = Math.min.apply(null, scored.map(time));
    var day = 86400000, span = now - first;
    var step = span > 90 * day ? 7 * day : day;
    var pts = [];
    for (var t = first; t <= now + 1; t += step) {
      var c = compute(latest(rows, t), stage);
      if (c.score != null) pts.push({ t: t, score: c.score, coverage: c.coverage });
    }
    var last = compute(latest(rows, now), stage);
    if (last.score != null && (!pts.length || pts[pts.length - 1].t < now)) pts.push({ t: now, score: last.score, coverage: last.coverage });
    return pts;
  }

  /** Score `days` ago, for "change in the last 30 days". */
  function scoreAt(rows, stage, msAgo) {
    return compute(latest(rows, Date.now() - msAgo), stage).score;
  }

  function band(score) {
    if (score == null) return { key: "none", label: "No data yet" };
    if (score >= 75) return { key: "strong", label: "Strong" };
    if (score >= 55) return { key: "building", label: "Building" };
    if (score >= 35) return { key: "watch", label: "Watch" };
    return { key: "weak", label: "Weak" };
  }

  return { RULES: RULES, PILLARS: PILLARS, WEIGHTS: WEIGHTS, latest: latest, compute: compute, history: history, scoreAt: scoreAt, band: band };
});
