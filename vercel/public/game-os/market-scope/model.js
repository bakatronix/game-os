/* Market Scope — pure math over Steam search rows (UMD: window.MarketModel / module.exports).
 * Row: [appid, name, "YYYY-MM-DD", listPriceCents|null, reviews|null, positivePct|null, tagids[]]
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MarketModel = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DEFAULTS = { mult: 30, share: 65 };
  // Steam shows no review summary below 10 reviews; count those games as 5.
  var UNKNOWN_REVIEWS = 5;
  var MATURE_MONTHS = 6;
  var SMALL = 10000;   // "earned almost nothing" line
  var HIT = 100000;    // "a real business" line for tag-pair hit rates
  var MIN_GAP_N = 5;   // fewer mature games than this under a tag pair is too few to read
  var BINS = [
    { lo: 0, hi: 1000, label: "Under $1K" },
    { lo: 1000, hi: 10000, label: "$1K–10K" },
    { lo: 10000, hi: 50000, label: "$10K–50K" },
    { lo: 50000, hi: 100000, label: "$50K–100K" },
    { lo: 100000, hi: 500000, label: "$100K–500K" },
    { lo: 500000, hi: 1000000, label: "$500K–1M" },
    { lo: 1000000, hi: 5000000, label: "$1M–5M" },
    { lo: 5000000, hi: Infinity, label: "$5M+" },
  ];

  function parseYmd(s) {
    var p = String(s).split("-");
    return Date.UTC(+p[0], +p[1] - 1, +p[2]);
  }
  function monthsBetween(a, b) { return (b - a) / (30.4375 * 86400000); }

  function quantile(sorted, q) {
    if (!sorted.length) return null;
    var pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }
  function median(list) {
    var s = list.slice().sort(function (a, b) { return a - b; });
    return quantile(s, 0.5);
  }

  /** Turn rows into games with an estimate. a = { mult, share (percent) }. */
  function games(data, a) {
    var mult = Number(a && a.mult) > 0 ? Number(a.mult) : DEFAULTS.mult;
    var share = Number(a && a.share) > 0 ? Number(a.share) / 100 : DEFAULTS.share / 100;
    var to = parseYmd(data.to);
    return (data.rows || []).map(function (r) {
      var price = r[3] == null ? null : r[3] / 100;
      var known = r[4] != null;
      var reviews = known ? r[4] : UNKNOWN_REVIEWS;
      var free = price === 0;
      var rev = price == null || free ? null : reviews * mult * price * share;
      var t = parseYmd(r[2]);
      return {
        appid: r[0], name: r[1], date: r[2], t: t, age: monthsBetween(t, to),
        price: price, free: free, reviews: known ? r[4] : null, pct: r[5],
        units: reviews * mult, rev: rev, tags: r[6] || [],
      };
    });
  }

  function quarterKey(t) {
    var d = new Date(t);
    return d.getUTCFullYear() + "-Q" + (Math.floor(d.getUTCMonth() / 3) + 1);
  }

  /** Everything the page shows, from the API payload and the assumptions. */
  function analyse(data, a) {
    var all = games(data, a);
    var to = parseYmd(data.to), from = parseYmd(data.from);
    var paid = all.filter(function (g) { return g.rev != null; });
    var mature = paid.filter(function (g) { return g.age >= MATURE_MONTHS; });
    var revs = mature.map(function (g) { return g.rev; }).sort(function (x, y) { return x - y; });

    var spread = {
      n: revs.length,
      free: all.filter(function (g) { return g.free; }).length,
      median: quantile(revs, 0.5),
      p75: quantile(revs, 0.75),
      p90: quantile(revs, 0.9),
      underSmall: revs.length ? revs.filter(function (v) { return v < SMALL; }).length / revs.length : null,
      overHit: revs.length ? revs.filter(function (v) { return v >= HIT; }).length / revs.length : null,
      bins: BINS.map(function (b) {
        return { label: b.label, n: revs.filter(function (v) { return v >= b.lo && v < b.hi; }).length };
      }),
    };

    // Quarters from the cutoff's quarter to today's.
    var quarters = [], qIndex = {};
    var d = new Date(from); d.setUTCDate(1); d.setUTCMonth(Math.floor(d.getUTCMonth() / 3) * 3);
    while (d.getTime() <= to) {
      var k = quarterKey(d.getTime());
      var qStart = d.getTime();
      var next = new Date(d); next.setUTCMonth(next.getUTCMonth() + 3);
      var qEnd = next.getTime();
      qIndex[k] = quarters.length;
      quarters.push({
        key: k, label: k.replace("-", " "), start: qStart, end: qEnd,
        partial: qStart < from || qEnd > to + 86400000,
        maturing: monthsBetween(qEnd, to) < MATURE_MONTHS,
        releases: 0, revs: [],
      });
      d = next;
    }
    all.forEach(function (g) {
      var i = qIndex[quarterKey(g.t)];
      if (i === undefined) return;
      quarters[i].releases++;
      if (g.rev != null) quarters[i].revs.push(g.rev);
    });
    quarters.forEach(function (q) { q.median = q.revs.length ? median(q.revs) : null; delete q.revs; });

    // Releases in the last 12 months vs the 12 before.
    var yr = 365.25 * 86400000;
    var last = all.filter(function (g) { return g.t > to - yr; }).length;
    var prev = all.filter(function (g) { return g.t > to - 2 * yr && g.t <= to - yr; }).length;
    var crowding = {
      lastYear: last, prevYear: prev,
      change: data.truncated || !prev ? null : (last - prev) / prev,
    };

    // Tag-pair gaps: each tag that co-occurs on mature paid games in the core.
    var core = {}; (data.tags || []).forEach(function (t) { core[t] = 1; });
    var byTag = {};
    mature.forEach(function (g) {
      g.tags.forEach(function (t) {
        if (core[t]) return;
        (byTag[t] = byTag[t] || []).push(g.rev);
      });
    });
    var coreHit = spread.overHit, coreN = spread.n;
    var gaps = Object.keys(byTag).map(function (t) {
      var list = byTag[t];
      var hit = list.filter(function (v) { return v >= HIT; }).length / list.length;
      var share = coreN ? list.length / coreN : 0;
      var rel = coreHit ? hit / coreHit : null;
      var verdict = "";
      if (coreHit != null) {
        if (list.length >= 8 && hit * list.length >= 2 && hit >= 2 * coreHit && share <= 0.15) verdict = "opening";
        else if (share >= 0.25 && hit <= coreHit) verdict = "crowded";
      }
      return { tag: +t, n: list.length, share: share, median: median(list), hit: hit, rel: rel, verdict: verdict };
    }).filter(function (g) { return g.n >= MIN_GAP_N; });
    gaps.sort(function (x, y) {
      var o = { opening: 0, "": 1, crowded: 2 };
      if (o[x.verdict] !== o[y.verdict]) return o[x.verdict] - o[y.verdict];
      return y.hit - x.hit || y.n - x.n;
    });

    var comps = paid.slice().sort(function (x, y) { return y.rev - x.rev; }).slice(0, 25);

    return {
      total: all.length, paid: paid.length, spread: spread, quarters: quarters,
      crowding: crowding, gaps: gaps, comps: comps,
    };
  }

  return {
    DEFAULTS: DEFAULTS, UNKNOWN_REVIEWS: UNKNOWN_REVIEWS, MATURE_MONTHS: MATURE_MONTHS,
    SMALL: SMALL, HIT: HIT, MIN_GAP_N: MIN_GAP_N, games: games, analyse: analyse, median: median, quantile: quantile,
  };
});
