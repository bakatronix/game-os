/* Sentiment Radar — pure maths over public Steam review data (UMD: window.SentimentModel / module.exports).
 * Inputs come from the game's signal ledger (daily Steam snapshot) and /api/sentiment-radar.
 * Method follows §5.1 of docs/MARKETING-TOOLS-BRIEFS.md (phases 1, 2, 3 and 4 of the method; no LLM).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../audience-map/model.js"));
  else root.SentimentModel = factory(root.AudienceModel);
})(typeof self !== "undefined" ? self : this, function (Audience) {
  "use strict";

  var DAY = 86400000;
  var Z95 = 1.959963984540054;

  // Steam shows no review score below 10 reviews, so below this the tool reads the comps instead.
  var MIN_GAME_REVIEWS = 10;
  // Below 30 reviews in 30 days the Wilson interval is about ±17 points wide: too wide to call a drop.
  var MIN_RECENT_N = 30;
  // Velocity needs at least 10 reviews across the two windows; fewer and every change reads as noise.
  var MIN_WINDOW_COUNT = 10;
  // A median from fewer than 20 reviews moves a lot when one review is added.
  var MIN_PLAYTIME_N = 20;
  // The early-exit share needs at least 20 negative reviews with playtime to mean anything.
  var MIN_NEG_N = 20;
  // A side (positive or negative) needs 10 reviews before its phrases are worth listing.
  var MIN_VOCAB_REVIEWS = 10;
  // A phrase must appear in 3 separate reviews; one player repeating themselves is not a pattern.
  var MIN_PHRASE_REVIEWS = 3;
  // Each side of an update needs 10 reviews before we say the drop starts after it.
  var MIN_SPLIT_N = 10;
  // Drop a shorter phrase when a longer one containing it covers at least 80% of its reviews.
  var SUBSUME_RATIO = 0.8;
  var VELOCITY_DAYS = 28;

  // Steam refunds: "requested within 14 days of purchase and [the game] has been played for less than 2 hours".
  var EARLY_MINUTES = 120;
  var CHECKED = "2026-11-22";
  var SOURCE = "https://store.steampowered.com/steam_refunds";

  /* ---------------- Intervals ---------------- */

  /** 95% Wilson score interval for k successes in n trials. Shares are 0–1. */
  function wilson(k, n, z) {
    z = z || Z95;
    if (!(n > 0)) return { p: null, lo: null, hi: null, k: k || 0, n: 0 };
    k = Math.max(0, Math.min(n, k));
    var p = k / n, z2 = z * z;
    var den = 1 + z2 / n;
    var mid = (p + z2 / (2 * n)) / den;
    var half = (z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n))) / den;
    return { p: p, lo: Math.max(0, mid - half), hi: Math.min(1, mid + half), k: k, n: n };
  }

  // Regularised lower incomplete gamma P(a, x) (Numerical Recipes: series below a+1, continued fraction above).
  function lnGamma(x) {
    var c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    var y = x, tmp = x + 5.5, ser = 1.000000000190015;
    tmp -= (x + 0.5) * Math.log(tmp);
    for (var j = 0; j < 6; j++) ser += c[j] / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }
  function gammaP(a, x) {
    if (x <= 0) return 0;
    var gln = lnGamma(a), i;
    if (x < a + 1) {
      var ap = a, sum = 1 / a, del = sum;
      for (i = 0; i < 500; i++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-14) break; }
      return sum * Math.exp(-x + a * Math.log(x) - gln);
    }
    var b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
    for (i = 1; i < 500; i++) {
      var an = -i * (i - a); b += 2;
      d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
      c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d; var del2 = d * c; h *= del2;
      if (Math.abs(del2 - 1) < 1e-14) break;
    }
    return 1 - Math.exp(-x + a * Math.log(x) - gln) * h;
  }
  function gammaInv(p, a) {
    var lo = 0, hi = Math.max(10, a * 3 + 40);
    while (gammaP(a, hi) < p) hi *= 2;
    for (var i = 0; i < 200; i++) { var mid = (lo + hi) / 2; if (gammaP(a, mid) < p) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }

  /** Exact (Garwood) 95% Poisson interval for a count, as a rate per day over `days`. */
  function poisson(count, days) {
    count = Math.max(0, Math.round(count || 0));
    var d = days > 0 ? days : 1;
    var lo = count === 0 ? 0 : gammaInv(0.025, count);
    var hi = gammaInv(0.975, count + 1);
    return { count: count, days: d, rate: count / d, lo: lo / d, hi: hi / d };
  }

  /** §2.4: "up" or "down" only when the two intervals don't overlap. `now` and `before` have lo/hi. */
  function change(now, before) {
    if (!now || !before || now.lo == null || before.lo == null) return null;
    if (now.lo > before.hi) return "up";
    if (now.hi < before.lo) return "down";
    return "flat";
  }

  /* ---------------- Helpers ---------------- */

  function median(list) {
    var s = list.filter(function (x) { return typeof x === "number" && isFinite(x); }).sort(function (a, b) { return a - b; });
    if (!s.length) return null;
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function ymd(ms) { return new Date(ms).toISOString().slice(0, 10); }
  function dayStart(ms) { return Math.floor(ms / DAY) * DAY; }
  function round1(x) { return Math.round(x * 10) / 10; }
  function ledgerEntry(ledger, key) {
    for (var i = 0; i < (ledger || []).length; i++) if (ledger[i] && ledger[i].key === key) return ledger[i];
    return null;
  }
  function toMs(t) {
    if (t == null) return null;
    if (typeof t === "number") return t < 1e11 ? t * 1000 : t; // Steam gives seconds
    var v = Date.parse(t);
    return isFinite(v) ? v : null;
  }

  /* ---------------- Mode ---------------- */

  /** "game" when the game has a Steam App ID and enough reviews in the ledger; otherwise "comps". */
  function mode(game, ledger, compSet) {
    var appid = game && Number(game.steamAppId);
    var hasId = Number.isInteger(appid) && appid > 0;
    var rev = ledgerEntry(ledger, "steam_reviews");
    var reviews = rev && typeof rev.value === "number" ? rev.value : null;
    var comps = (Array.isArray(compSet) ? compSet : []).filter(function (c) { return c && c.name; })
      .map(function (c) { var id = Number(c.appId || c.appid); return { name: String(c.name), appid: Number.isInteger(id) && id > 0 ? id : null }; });
    if (hasId && reviews != null && reviews >= MIN_GAME_REVIEWS) return { mode: "game", appid: appid, reviews: reviews, comps: comps };
    var reason = !game ? "no-game" : !hasId ? "no-app-id" : reviews == null ? "no-snapshot" : "too-few-reviews";
    return { mode: "comps", appid: hasId ? appid : null, reviews: reviews, reason: reason, comps: comps };
  }

  /* ---------------- 1. Decay alarm ---------------- */

  /** Developer posts from GetNewsForApp, newest first, as { t, date, title, url }. */
  function updates(news) {
    return (news || []).filter(function (n) { return n && n.date && (n.feed === "steam_community_announcements" || n.feedname === "steam_community_announcements"); })
      .map(function (n) { var t = toMs(n.date); return { t: t, date: ymd(t), title: n.title || "Update", url: n.url || null }; })
      .sort(function (a, b) { return b.t - a.t; });
  }

  /** Positive share before and after a date, from the histogram's daily buckets. */
  function splitAt(recent, t) {
    var b = { up: 0, n: 0 }, a = { up: 0, n: 0 };
    (recent || []).forEach(function (d) {
      var dt = toMs(d.date), up = d.recommendations_up || 0, down = d.recommendations_down || 0;
      var side = dt >= dayStart(t) ? a : b;
      side.up += up; side.n += up + down;
    });
    var wb = wilson(b.up, b.n), wa = wilson(a.up, a.n);
    var enough = b.n >= MIN_SPLIT_N && a.n >= MIN_SPLIT_N;
    return { before: wb, after: wa, enough: enough, dropAfter: enough && wa.hi < wb.lo };
  }

  /**
   * The decay alarm. Reads steam_review_pct (all-time), steam_review_pct_30d and steam_reviews_30d from the ledger.
   * Fires when the all-time share sits above the upper bound of the 30-day Wilson interval.
   */
  function decay(ledger, news, recent) {
    var all = ledgerEntry(ledger, "steam_review_pct");
    var pct30 = ledgerEntry(ledger, "steam_review_pct_30d");
    var n30 = ledgerEntry(ledger, "steam_reviews_30d");
    if (!all || !n30) return { status: "no-data" };
    var n = Math.round(n30.value || 0);
    var obs = toMs(n30.observedAt) || Date.now();
    var window = { from: ymd(obs - 30 * DAY), to: ymd(obs) };
    var base = { allTime: all.value, n: n, window: window, observedAt: ymd(obs) };
    if (n < MIN_RECENT_N || !pct30) return Object.assign(base, { status: "too-few", min: MIN_RECENT_N });
    var k = Math.round((pct30.value / 100) * n);
    var w = wilson(k, n);
    var a = all.value / 100;
    var status = a > w.hi ? "alarm" : a < w.lo ? "above" : "steady";
    var inWindow = updates(news).filter(function (u) { return u.t >= obs - 30 * DAY && u.t <= obs; });
    var split = null, starts = null;
    for (var i = inWindow.length - 1; i >= 0; i--) { // oldest first: the first update after which the share drops
      var s = splitAt(recent, inWindow[i].t);
      if (s.dropAfter) { split = s; starts = inWindow[i]; break; }
    }
    return Object.assign(base, {
      status: status, alarm: status === "alarm", recent: w, recentPct: pct30.value,
      divergence: round1(pct30.value - all.value), updates: inWindow, startsAfter: starts, split: split,
    });
  }

  /* ---------------- 2. Review velocity ---------------- */

  /**
   * Reviews per day over the last 28 complete days (daily buckets) against the 28 days before.
   * The earlier window comes from weekly rollups that end before the recent window starts.
   * Monthly rollups are too coarse, so then there is no earlier window yet.
   */
  function velocity(hist, now) {
    if (!hist || !Array.isArray(hist.recent) || !hist.recent.length) return { status: "no-data" };
    var today = dayStart(now || Date.now());
    var recent = hist.recent.map(function (d) { return { t: dayStart(toMs(d.date)), n: (d.recommendations_up || 0) + (d.recommendations_down || 0) }; })
      .filter(function (d) { return d.t < today; }).sort(function (a, b) { return a.t - b.t; });
    if (!recent.length) return { status: "no-data" };
    var end = recent[recent.length - 1].t + DAY;
    var rollups = (hist.rollups || []).map(function (r) { return { t: dayStart(toMs(r.date)), n: (r.recommendations_up || 0) + (r.recommendations_down || 0) }; })
      .sort(function (a, b) { return a.t - b.t; });
    var firstData = rollups.length ? rollups[0].t : recent[0].t;
    var start = Math.max(end - VELOCITY_DAYS * DAY, firstData);
    var days = Math.round((end - start) / DAY);
    var count = recent.filter(function (d) { return d.t >= start && d.t < end; }).reduce(function (s, d) { return s + d.n; }, 0);
    var last = Object.assign(poisson(count, days), { from: ymd(start), to: ymd(end - DAY) });

    var type = hist.rollup_type || (rollups.length > 1 && rollups[1].t - rollups[0].t <= 8 * DAY ? "week" : "month");
    var prior = null, reason = null;
    if (type !== "week") reason = "monthly";
    else {
      var weeks = rollups.filter(function (r) { return r.t + 7 * DAY <= start; }).slice(-4);
      if (weeks.length < 2) reason = "too-young";
      else {
        var pStart = weeks[0].t, pEnd = weeks[weeks.length - 1].t + 7 * DAY;
        var pc = weeks.reduce(function (s, r) { return s + r.n; }, 0);
        prior = Object.assign(poisson(pc, weeks.length * 7), { from: ymd(pStart), to: ymd(pEnd - DAY), gapDays: Math.round((start - pEnd) / DAY) });
      }
    }
    var total = last.count + (prior ? prior.count : 0);
    var enough = total >= MIN_WINDOW_COUNT;
    return {
      status: enough ? "ok" : "too-few", min: MIN_WINDOW_COUNT, rollupType: type,
      last: last, prior: prior, priorReason: reason, change: enough && prior ? change(last, prior) : null,
    };
  }

  /* ---------------- 3. Playtime at review ---------------- */

  function playtime(reviews) {
    var pos = [], neg = [];
    (reviews || []).forEach(function (r) {
      var m = r && typeof r.playtime === "number" && r.playtime >= 0 ? r.playtime : null;
      if (m == null) return;
      (r.up ? pos : neg).push(m);
    });
    var all = pos.concat(neg);
    var early = neg.filter(function (m) { return m < EARLY_MINUTES; }).length;
    var share = wilson(early, neg.length);
    var h = function (m) { return m == null ? null : m / 60; };
    return {
      all: { median: h(median(all)), n: all.length, enough: all.length >= MIN_PLAYTIME_N },
      pos: { median: h(median(pos)), n: pos.length, enough: pos.length >= MIN_PLAYTIME_N },
      neg: { median: h(median(neg)), n: neg.length, enough: neg.length >= MIN_PLAYTIME_N },
      early: Object.assign(share, { enough: neg.length >= MIN_NEG_N, minutes: EARLY_MINUTES }),
      min: MIN_PLAYTIME_N, minNeg: MIN_NEG_N,
    };
  }

  /* ---------------- 4. Player vocabulary ---------------- */

  // Review boilerplate that says nothing about the game. Price words stay: "waste of money" is a real complaint.
  var REVIEW_STOP = "recommend recommended review reviews lol".split(" ");
  function stopSet() {
    var s = {};
    ((Audience && Audience.stopWords) || []).forEach(function (w) { s[w] = 1; });
    REVIEW_STOP.forEach(function (w) { s[w] = 1; });
    return s;
  }
  function tokenize(s) { return Audience && Audience.words ? Audience.words(s) : String(s).toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter(Boolean); }
  function reEscape(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  /** A short piece of the original review text around the phrase. */
  function snippet(text, gram) {
    var src = String(text || "");
    var re = new RegExp("(^|[^a-z0-9])(" + gram.split(" ").map(function (w) { return reEscape(w).replace(/'/g, "['’]?"); }).join("[^a-z0-9']+") + "s?)(?=$|[^a-z0-9])", "i");
    var m = re.exec(src);
    if (!m) return null;
    var at = m.index + m[1].length, endAt = at + m[2].length;
    var from = Math.max(0, at - 60), to = Math.min(src.length, endAt + 60);
    while (from > 0 && /\S/.test(src[from - 1])) from--;
    while (to < src.length && /\S/.test(src[to])) to++;
    return { before: (from > 0 ? "…" : "") + src.slice(from, at).replace(/\s+/g, " ").trimStart(), match: src.slice(at, endAt), after: src.slice(endAt, to).replace(/\s+/g, " ").trimEnd() + (to < src.length ? "…" : "") };
  }

  /** Phrases of 1–3 words, counted once per review, in one set of reviews. */
  function countPhrases(reviews, exclude, limit) {
    var STOPS = stopSet();
    var vocab = {}, canon = {};
    // Phrases never cross punctuation: each review is split into clauses first.
    var toks = reviews.map(function (r) {
      return String(r.text || "").split(/[.,!?;:()\[\]\n\r"“”…\-–—\/]+/).map(function (c) {
        var w = tokenize(c); w.forEach(function (x) { vocab[x] = 1; }); return w;
      }).filter(function (w) { return w.length; });
    });
    // Fold plurals into one entry ("mod" and "mods") when both forms appear.
    Object.keys(vocab).forEach(function (w) { if (w.length > 3 && /s$/.test(w) && !/ss$/.test(w) && vocab[w.slice(0, -1)]) canon[w] = w.slice(0, -1); });
    var ok = function (x) { return x.length > 2 && !STOPS[x] && !exclude[x] && !/^\d+$/.test(x) && /[a-z]/.test(x); };
    var by = {};
    toks.forEach(function (clauses, ri) {
      var seen = {};
      function add(p) {
        if (seen[p]) return; seen[p] = 1;
        var v = by[p] || (by[p] = { phrase: p, words: p.split(" ").length, count: 0, idx: [] });
        v.count++; v.idx.push(ri);
      }
      clauses.forEach(function (w0) {
      var w = w0.map(function (x) { return canon[x] || x; });
      for (var i = 0; i < w.length; i++) {
        if (!ok(w[i])) continue;
        add(w[i]);
        if (i + 1 < w.length && ok(w[i + 1])) add(w[i] + " " + w[i + 1]);
        // Three words: the ends must carry meaning; a small word may sit in the middle ("waste of money").
        if (i + 2 < w.length && ok(w[i + 2]) && !/^\d+$/.test(w[i + 1])) add(w[i] + " " + w[i + 1] + " " + w[i + 2]);
      }
      });
    });
    var list = Object.keys(by).map(function (k) { return by[k]; }).filter(function (v) { return v.count >= MIN_PHRASE_REVIEWS; });
    // Prefer the longer phrase when it covers nearly all the reviews of a shorter one inside it.
    var keep = list.filter(function (v) {
      return !list.some(function (o) {
        return o.words > v.words && (" " + o.phrase + " ").indexOf(" " + v.phrase + " ") >= 0 && o.count >= v.count * SUBSUME_RATIO;
      });
    });
    keep.sort(function (a, b) { return b.count - a.count || b.words - a.words || (a.phrase < b.phrase ? -1 : 1); });
    var n = reviews.length;
    return keep.slice(0, limit || 25).map(function (v) {
      var snippets = [];
      for (var i = 0; i < v.idx.length && snippets.length < 2; i++) {
        var r = reviews[v.idx[i]], s = snippet(r.text, v.phrase);
        if (s) snippets.push(Object.assign(s, { url: r.url || null, comp: r.comp || null }));
      }
      return { phrase: v.phrase, count: v.count, share: wilson(v.count, n), snippets: snippets };
    });
  }

  /** Phrase counts run separately on positive and negative reviews. `name` words (the game's title) are dropped. */
  function vocabulary(reviews, opts) {
    opts = opts || {};
    var exclude = {};
    tokenize(opts.name || "").forEach(function (w) { exclude[w] = 1; });
    var pos = (reviews || []).filter(function (r) { return r && r.up && r.text; });
    var neg = (reviews || []).filter(function (r) { return r && !r.up && r.text; });
    function side(list) {
      return list.length >= MIN_VOCAB_REVIEWS
        ? { n: list.length, enough: true, phrases: countPhrases(list, exclude, opts.limit) }
        : { n: list.length, enough: false, phrases: [] };
    }
    return { pos: side(pos), neg: side(neg), min: MIN_VOCAB_REVIEWS, minPhrase: MIN_PHRASE_REVIEWS };
  }

  /* ---------------- Signals ---------------- */

  function lo1(x) { return x == null ? null : round1(x); }

  /**
   * GOS.recordSignals rows for "your game" mode. Comps mode and readings below a minimum write nothing.
   * r = { mode, decay, velocity, playtime, readWindow }
   */
  function signals(r) {
    if (!r || r.mode !== "game") return [];
    var out = [];
    var d = r.decay;
    if (d && d.recent && (d.status === "alarm" || d.status === "steady" || d.status === "above")) {
      out.push({
        key: "sentiment_divergence", label: "Recent vs all-time positive share", value: d.divergence, unit: "pct",
        meta: { half: "resonance", source: "steam-public", method: "wilson95", n: d.n, window: d.window.from + "/" + d.window.to,
          lo: lo1(d.recent.lo * 100 - d.allTime), hi: lo1(d.recent.hi * 100 - d.allTime), alarm: d.alarm, recent_pct: d.recentPct, all_time_pct: d.allTime },
      });
    }
    var v = r.velocity;
    if (v && v.status === "ok") {
      out.push({
        key: "review_velocity_28d", label: "Reviews per day, last 28 days", value: Math.round(v.last.rate * 100) / 100, unit: "per_day",
        meta: { half: "reach", source: "steam-public", method: "poisson95", n: v.last.count, window: v.last.from + "/" + v.last.to,
          lo: Math.round(v.last.lo * 100) / 100, hi: Math.round(v.last.hi * 100) / 100, change: v.change || null,
          prior_window: v.prior ? v.prior.from + "/" + v.prior.to : null, prior_rate: v.prior ? Math.round(v.prior.rate * 100) / 100 : null },
      });
    }
    var p = r.playtime;
    var win = r.readWindow || null;
    if (p && p.all.enough) {
      out.push({
        key: "playtime_at_review_median", label: "Median playtime at review", value: round1(p.all.median), unit: "hours",
        meta: { half: "resonance", source: "steam-public", method: "median", n: p.all.n, window: win,
          pos: p.pos.enough ? round1(p.pos.median) : null, neg: p.neg.enough ? round1(p.neg.median) : null, pos_n: p.pos.n, neg_n: p.neg.n },
      });
    }
    if (p && p.early.enough) {
      out.push({
        key: "neg_review_early_share", label: "Negative reviews under 2 hours played", value: round1(p.early.p * 100), unit: "pct",
        meta: { half: "resonance", source: "steam-public", method: "wilson95", n: p.early.n, window: win,
          lo: round1(p.early.lo * 100), hi: round1(p.early.hi * 100), threshold_minutes: EARLY_MINUTES, rule_source: SOURCE, rule_checked: CHECKED },
      });
    }
    return out;
  }

  return {
    MIN_GAME_REVIEWS: MIN_GAME_REVIEWS, MIN_RECENT_N: MIN_RECENT_N, MIN_WINDOW_COUNT: MIN_WINDOW_COUNT,
    MIN_PLAYTIME_N: MIN_PLAYTIME_N, MIN_NEG_N: MIN_NEG_N, MIN_VOCAB_REVIEWS: MIN_VOCAB_REVIEWS,
    MIN_PHRASE_REVIEWS: MIN_PHRASE_REVIEWS, MIN_SPLIT_N: MIN_SPLIT_N, VELOCITY_DAYS: VELOCITY_DAYS,
    EARLY_MINUTES: EARLY_MINUTES, CHECKED: CHECKED, SOURCE: SOURCE,
    wilson: wilson, poisson: poisson, change: change, median: median,
    mode: mode, updates: updates, splitAt: splitAt, decay: decay, velocity: velocity,
    playtime: playtime, vocabulary: vocabulary, snippet: snippet, signals: signals,
  };
});
