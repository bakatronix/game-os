/* Long Tail Engine — pure maths for a released game's tail (UMD: window.TailModel / module.exports).
 * Method follows §5.7 of docs/MARKETING-TOOLS-BRIEFS.md:
 *   - Legs: reviews per day in the last 28 days ÷ reviews per day in the first 28 days after release (Steam's review
 *     histogram), with an exact Poisson range on both.
 *   - Player floor: median steam_players over the last 7 daily snapshots ÷ the median in launch week (the ledger).
 *   - Revenue: the studio's own figures, or a Boxleiter range from Market Scope's model, labelled as an estimate.
 *   - Around each update or sale: reviews per day and players before and after, using Page Engine's beat method.
 *   - Regional: big wishlist regions whose main language the game doesn't list, as questions, not dollar figures.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../page-engine/model.js"), require("../market-scope/model.js"));
  else root.TailModel = factory(root.PageModel, root.MarketModel);
})(typeof self !== "undefined" ? self : this, function (PM, MM) {
  "use strict";

  var DAY = 86400000;
  var poisson = PM.poisson, median = PM.median, addDays = PM.addDays, daysBetween = PM.daysBetween, isYmd = PM.isYmd, ymd = PM.ymd;

  var WINDOW_DAYS = 28;
  // Legs compares the first 28 days with the last 28, so the game needs 56 days on sale before the windows separate.
  var MIN_AGE_DAYS = 56;
  // The first window needs 20 reviews: below that its Poisson range is so wide that the ratio could be almost anything.
  var MIN_FIRST_REVIEWS = 20;
  // Launch week is release day and the six days after.
  var LAUNCH_DAYS = 7;
  // The launch-week median needs 3 snapshots, so one odd reading can't set it.
  var MIN_LAUNCH_SNAPSHOTS = 3;
  // The recent median uses the last 7 snapshots and needs at least 5 of them.
  var RECENT_SNAPSHOTS = 7;
  var MIN_RECENT_SNAPSHOTS = 5;
  // The newest snapshot must be from the last 7 days, or the "floor" describes the past, not now.
  var MAX_SNAPSHOT_AGE_DAYS = 7;
  // The floor compares launch week with a time at least 4 weeks later; earlier than that it's still launch.
  var MIN_FLOOR_AGE_DAYS = 28;
  // Around a beat, players need snapshots on 10 of the 14 days before and 5 of the 7 days from the beat.
  var MIN_PLAYER_BEFORE = 10;
  var MIN_PLAYER_AFTER = 5;
  // Beats with fewer than 10 reviews across both windows aren't read: one review moves the rate too much.
  var MIN_BEAT_REVIEWS = 10;
  // A region is a localisation question only if it holds at least 5% of wishlist adds over 28 days.
  var MIN_REGION_SHARE = 0.05;
  // Revenue compares the first 3 full months on sale with the last 3.
  var REVENUE_MONTHS = 3;

  // Boxleiter range defaults: copies sold per review, low and high, and the share of list price received.
  // Assumptions the studio can edit, not measurements (approved by Jay, 26 Nov 2026). Market Scope uses 30 and 65%.
  var BOX_DEFAULTS = { lo: 20, hi: 50, share: 65 };

  // Steam's review histogram: Valve's own chart on each store page. Its field names were read from live answers
  // when Sentiment Radar was built; the snapshot cron reads the same endpoint.
  var HIST_SOURCE = "https://store.steampowered.com/appreviewhistogram/";
  // The snapshot cron (vercel.json) runs once a day at 06:00 UTC.
  var SNAPSHOT_TIME = "06:00 UTC";

  /* ---------------- Dates ---------------- */

  function secToYmd(s) { return s ? ymd(Number(s) * 1000) : null; }
  function endOfMonth(d) { var p = d.split("-"); return ymd(Date.UTC(+p[0], +p[1], 0)); }
  var MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

  /** Steam's release_date.date text in its usual forms: "12 Mar, 2024", "Mar 12, 2024", "12 Mar 2024", "2024-03-12". */
  function parseReleaseText(t) {
    t = String(t || "").trim();
    var m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return isYmd(t) ? t : null;
    m = t.match(/^(\d{1,2})\s+([A-Za-z]{3,4})[a-z]*\.?,?\s+(\d{4})$/);
    var d, mo, y;
    if (m) { d = +m[1]; mo = MON[m[2].toLowerCase()]; y = +m[3]; }
    else {
      m = t.match(/^([A-Za-z]{3,4})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/);
      if (!m) return null;
      mo = MON[m[1].toLowerCase()]; d = +m[2]; y = +m[3];
    }
    if (!mo) return null;
    var out = y + "-" + String(mo).padStart(2, "0") + "-" + String(d).padStart(2, "0");
    return isYmd(out) ? out : null;
  }

  /* ---------------- Review curve and legs ---------------- */

  /** Histogram rollups as dated buckets: { start, end, days, count, perDay }. Weekly buckets run 7 days, monthly to month end. */
  function buckets(hist) {
    if (!hist || !Array.isArray(hist.rollups)) return [];
    var type = hist.rollup_type;
    var list = hist.rollups.map(function (r) { return { start: secToYmd(r.date), count: (r.up || 0) + (r.down || 0) }; })
      .filter(function (b) { return isYmd(b.start); }).sort(function (a, b) { return a.start < b.start ? -1 : 1; });
    if (!type) type = list.length > 1 && daysBetween(list[0].start, list[1].start) <= 8 ? "week" : "month";
    var lastDay = hist.end_date ? secToYmd(hist.end_date) : null;
    return list.map(function (b) {
      var end = type === "week" ? addDays(b.start, 6) : endOfMonth(b.start);
      if (lastDay && end > lastDay && lastDay >= b.start) end = lastDay;
      var days = daysBetween(b.start, end) + 1;
      return { start: b.start, end: end, days: days, count: b.count, perDay: b.count / days, type: type };
    });
  }

  /** Daily review counts from the histogram's last-30-days list, keyed by date. */
  function recentDaily(hist) {
    var out = {};
    ((hist && hist.recent) || []).forEach(function (r) { var d = secToYmd(r.date); if (isYmd(d)) out[d] = (out[d] || 0) + (r.up || 0) + (r.down || 0); });
    return out;
  }

  /**
   * Legs. The last window is the 28 complete days ending yesterday (or on the last day in Steam's daily list).
   * The first window is every histogram bucket that starts in the 28 days from release. With weekly totals that's
   * 28 to 34 days; with monthly totals (Steam's choice for older games) it can run to about two months, and the page
   * shows the actual dates. A bucket that starts before release day counts whole.
   */
  function legs(hist, release, today) {
    if (!hist || !isYmd(release)) return { status: "no-data" };
    var age = daysBetween(release, today);
    if (age < MIN_AGE_DAYS) return { status: "too-young", age: age, min: MIN_AGE_DAYS };
    var daily = recentDaily(hist), days = Object.keys(daily).sort();
    if (!days.length) return { status: "no-data" };
    var end = days[days.length - 1] >= today ? addDays(today, -1) : days[days.length - 1];
    var start = addDays(end, -(WINDOW_DAYS - 1));
    var lastCount = 0;
    days.forEach(function (d) { if (d >= start && d <= end) lastCount += daily[d]; });
    var last = Object.assign(poisson(lastCount, WINDOW_DAYS), { from: start, to: end });

    var B = buckets(hist), cut = addDays(release, WINDOW_DAYS - 1);
    var first = B.filter(function (b) { return b.end >= release && b.start <= cut; });
    if (!first.length) return { status: "no-first", last: last };
    var fFrom = first[0].start < release ? first[0].start : release, fTo = first[first.length - 1].end;
    var fCount = first.reduce(function (s, b) { return s + b.count; }, 0), fDays = daysBetween(fFrom, fTo) + 1;
    var firstW = Object.assign(poisson(fCount, fDays), { from: fFrom, to: fTo, type: first[0].type, buckets: first.length });
    var out = { status: "ok", last: last, first: firstW, curve: B, rollupType: first[0].type, min: MIN_FIRST_REVIEWS };
    if (fCount < MIN_FIRST_REVIEWS) { out.status = "too-few"; return out; }
    out.ratio = last.rate / firstW.rate;
    // Bounds from both ranges at once: the lowest last-window rate over the highest first-window rate, and back.
    out.lo = last.lo / firstW.hi;
    out.hi = last.hi / firstW.lo;
    return out;
  }

  /* ---------------- Ledger snapshots ---------------- */

  /** Ledger rows for one key, one per UTC day (the latest that day), oldest first: [{ date, value }]. */
  function dailyFromLedger(rows, key) {
    var by = {};
    (rows || []).forEach(function (r) {
      if (!r || r.key !== key || typeof r.value !== "number" || !isFinite(r.value) || !r.observedAt) return;
      var t = Date.parse(r.observedAt); if (!isFinite(t)) return;
      var d = ymd(t);
      if (!by[d] || t >= by[d].t) by[d] = { date: d, value: r.value, t: t };
    });
    return Object.keys(by).sort().map(function (d) { return { date: d, value: by[d].value }; });
  }

  /** Player floor: median of the last 7 snapshots ÷ median of launch week. No range: each snapshot is one reading. */
  function floor(players, release, today) {
    if (!isYmd(release)) return { status: "no-release" };
    var age = daysBetween(release, today);
    if (age < MIN_FLOOR_AGE_DAYS) return { status: "too-young", age: age, min: MIN_FLOOR_AGE_DAYS };
    var launchEnd = addDays(release, LAUNCH_DAYS - 1);
    var launch = (players || []).filter(function (p) { return p.date >= release && p.date <= launchEnd; });
    var later = (players || []).filter(function (p) { return p.date > addDays(release, MIN_FLOOR_AGE_DAYS - 1); });
    var recent = later.slice(-RECENT_SNAPSHOTS);
    var out = { status: "ok", launch: { from: release, to: launchEnd, n: launch.length }, recent: { n: recent.length } };
    if (launch.length < MIN_LAUNCH_SNAPSHOTS) { out.status = "no-launch"; out.min = MIN_LAUNCH_SNAPSHOTS; out.first = players && players.length ? players[0].date : null; return out; }
    if (recent.length < MIN_RECENT_SNAPSHOTS) { out.status = "few-recent"; out.min = MIN_RECENT_SNAPSHOTS; return out; }
    var newest = recent[recent.length - 1].date;
    if (daysBetween(newest, today) > MAX_SNAPSHOT_AGE_DAYS) { out.status = "stale"; out.newest = newest; return out; }
    out.launch.median = median(launch.map(function (p) { return p.value; }));
    out.recent = { from: recent[0].date, to: newest, n: recent.length, median: median(recent.map(function (p) { return p.value; })) };
    if (!(out.launch.median > 0)) { out.status = "zero-launch"; return out; }
    out.ratio = out.recent.median / out.launch.median;
    return out;
  }

  /**
   * Reviews per day, keyed by date. The ledger's daily totals give the change between one snapshot and the next
   * (a fall, from deleted reviews, counts as 0); Steam's exact daily counts replace them for the last 30 days.
   */
  function dailyReviews(hist, totals, today) {
    var out = {}, prev = null;
    (totals || []).forEach(function (t) {
      // Snapshots run at 06:00 UTC, so most of the change between two happened on the earlier day.
      if (prev && daysBetween(prev.date, t.date) === 1) out[prev.date] = Math.max(0, Math.round(t.value - prev.value));
      prev = t;
    });
    var exact = recentDaily(hist), src = {};
    Object.keys(out).forEach(function (d) { src[d] = "ledger"; });
    // Steam's list is exact, but today is still filling up, so it's left out.
    Object.keys(exact).forEach(function (d) { if (!today || d < today) { out[d] = exact[d]; src[d] = "steam"; } });
    return { daily: out, source: src };
  }

  /* ---------------- Around updates and sales ---------------- */

  /** Update and sale beats from Page Engine, plus Steam announcements tagged as patch notes. Same-day duplicates merge. */
  function tailBeats(peBeats, news, release) {
    var list = (peBeats || []).filter(function (b) { return b && !b.deleted && isYmd(b.date) && (b.type === "sale" || b.type === "update"); })
      .map(function (b) { return { id: b.id, date: b.date, type: b.type, channel: b.channel || "", note: b.note || "", from: "page-engine" }; });
    (news || []).forEach(function (n) {
      if (!n || !n.patchnotes || !n.date) return;
      var d = secToYmd(n.date);
      if (!isYmd(d)) return;
      if (list.some(function (b) { return b.type === "update" && Math.abs(daysBetween(b.date, d)) <= 1; })) return;
      list.push({ id: "steam:" + d + ":" + n.title.slice(0, 20), date: d, type: "update", channel: "Steam", note: n.title, url: n.url || null, from: "steam" });
    });
    return list.filter(function (b) { return !isYmd(release) || b.date >= release; })
      .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
  }

  /**
   * For each beat: reviews in the 7 days from it against 7 × the median day of the 14 before, with an exact
   * Poisson range on the 7-day count (Page Engine's beat method, PageModel.beatLift), and the median players at
   * snapshot time in the same windows, without a range. Overlapping beats are flagged; "associated with", never "caused".
   */
  function aroundBeats(beats, reviewsDaily, players) {
    var series = Object.keys(reviewsDaily || {}).sort().map(function (d) { return { from: d, to: d, adds: reviewsDaily[d] }; });
    var lifts = PM.beatLift(series, beats, []);
    var pl = {}; (players || []).forEach(function (p) { pl[p.date] = p.value; });
    return lifts.map(function (L) {
      var b = L.beat, before = [], after = [];
      for (var i = 1; i <= PM.BEAT_BEFORE_DAYS; i++) { var d = addDays(b.date, -i); if (pl[d] != null) before.push(pl[d]); }
      for (var j = 0; j < PM.BEAT_AFTER_DAYS; j++) { var e = addDays(b.date, j); if (pl[e] != null) after.push(pl[e]); }
      var R = { beat: b, reviews: L, players: { before: before.length, after: after.length, enough: false }, overlaps: L.overlaps };
      if (L.enough && L.after + L.baselinePerDay * PM.BEAT_BEFORE_DAYS < MIN_BEAT_REVIEWS) { R.reviews = Object.assign({}, L, { enough: false, few: true }); }
      if (before.length >= MIN_PLAYER_BEFORE && after.length >= MIN_PLAYER_AFTER) {
        var mb = median(before), ma = median(after);
        R.players = { before: before.length, after: after.length, enough: true, medBefore: mb, medAfter: ma, change: mb > 0 ? (ma - mb) / mb : null };
      }
      return R;
    });
  }

  /* ---------------- Revenue ---------------- */

  /** A money cell: drops currency signs, spaces and thousands separators. "(12.50)" is negative. */
  function parseMoney(s) {
    if (s == null) return null;
    var t = String(s).trim(), neg = /^\(.*\)$/.test(t) || /^-/.test(t);
    t = t.replace(/[()\s  ,'$€£¥]|USD|EUR|GBP/gi, "").replace(/^-/, "");
    if (t === "" || t === "-") return null;
    var v = Number(t);
    return isFinite(v) ? (neg ? -v : v) : null;
  }

  /** A date or month cell to "YYYY-MM". Accepts what PageModel.parseDate reads, plus "2025-03" and "Mar 2025". */
  function parseMonth(s, order) {
    var t = String(s || "").trim(), m = t.match(/^(\d{4})[-\/.](\d{1,2})$/);
    if (m && +m[2] >= 1 && +m[2] <= 12) return m[1] + "-" + String(+m[2]).padStart(2, "0");
    m = t.match(/^([A-Za-z]{3,4})[a-z]*\.?\s+(\d{4})$/);
    if (m && MON[m[1].toLowerCase()]) return m[2] + "-" + String(MON[m[1].toLowerCase()]).padStart(2, "0");
    var d = PM.parseDate(t, order);
    return d ? d.slice(0, 7) : null;
  }

  /** Revenue rows from a CSV with the studio's column map { date, gross, net }. Rows are summed by month. */
  function revenueFromCsv(rows, headerIndex, map, order) {
    var by = {}, skipped = 0;
    for (var i = headerIndex + 1; i < rows.length; i++) {
      var r = rows[i], mo = parseMonth(r[map.date], order);
      if (!mo) { skipped++; continue; }
      var g = map.gross != null ? parseMoney(r[map.gross]) : null, n = map.net != null ? parseMoney(r[map.net]) : null;
      if (g == null && n == null) { skipped++; continue; }
      var o = by[mo] || (by[mo] = { month: mo, gross: null, net: null, src: "csv" });
      if (g != null) o.gross = (o.gross || 0) + g;
      if (n != null) o.net = (o.net || 0) + n;
    }
    return { months: Object.keys(by).sort().map(function (k) { return by[k]; }), skipped: skipped };
  }

  function cleanMonth(m) {
    if (!m || !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(m.month))) return null;
    var g = Number(m.gross), n = Number(m.net);
    var o = { month: m.month, gross: m.gross != null && m.gross !== "" && isFinite(g) ? Math.round(g * 100) / 100 : null,
      net: m.net != null && m.net !== "" && isFinite(n) ? Math.round(n * 100) / 100 : null, src: m.src === "csv" ? "csv" : "form" };
    return o.gross == null && o.net == null ? null : o;
  }

  /** Merge months: a newer import or entry replaces the same month. */
  function mergeMonths(old, incoming) {
    var by = {};
    (old || []).concat(incoming || []).forEach(function (m) { var c = cleanMonth(m); if (c) by[c.month] = c; });
    return Object.keys(by).sort().map(function (k) { return by[k]; });
  }

  /**
   * Revenue summary. Uses net when every month has it, else gross. Compares the average of the first 3 full months
   * on sale with the last 3 full months. The current month, still running, is left out.
   */
  function revenue(months, release, today) {
    var list = (months || []).filter(Boolean);
    if (!list.length) return { status: "none" };
    var field = list.every(function (m) { return m.net != null; }) ? "net" : "gross";
    var current = today.slice(0, 7), relMonth = isYmd(release) ? release.slice(0, 7) : null;
    // The release month is partial unless the game came out on the 1st.
    var full = list.filter(function (m) { return m[field] != null && m.month < current && (!relMonth || m.month > relMonth || (m.month === relMonth && release.slice(8) === "01")); });
    var total = list.reduce(function (s, m) { return s + (m[field] || 0); }, 0);
    var out = { status: "ok", field: field, months: list, total: total, csv: list.some(function (m) { return m.src === "csv"; }) };
    if (full.length < REVENUE_MONTHS * 2) { out.compare = null; out.need = REVENUE_MONTHS * 2; out.full = full.length; return out; }
    var f = full.slice(0, REVENUE_MONTHS), l = full.slice(-REVENUE_MONTHS);
    var avg = function (a) { return a.reduce(function (s, m) { return s + m[field]; }, 0) / a.length; };
    out.compare = { first: { from: f[0].month, to: f[f.length - 1].month, avg: avg(f) }, last: { from: l[0].month, to: l[l.length - 1].month, avg: avg(l) } };
    out.compare.ratio = out.compare.first.avg > 0 ? out.compare.last.avg / out.compare.first.avg : null;
    return out;
  }

  /**
   * Boxleiter range through Market Scope's model: reviews × copies per review × list price × share of price.
   * Two multipliers give the low and high ends. An estimate, never a single figure (brief §2.4).
   */
  function boxleiter(reviews, priceCents, a) {
    a = a || {};
    var lo = Number(a.lo), hi = Number(a.hi), share = Number(a.share);
    if (!(reviews >= 0) || reviews == null) return { status: "no-reviews" };
    if (priceCents === 0) return { status: "free" };
    if (!(priceCents > 0)) return { status: "no-price" };
    if (!(lo > 0) || !(hi > 0) || !(share > 0)) return { status: "no-assumptions" };
    if (lo > hi) { var x = lo; lo = hi; hi = x; }
    var row = [0, "", "2000-01-01", priceCents, reviews, null, []];
    var g = function (mult) { return MM.games({ to: "2000-01-01", rows: [row] }, { mult: mult, share: share })[0]; };
    var L = g(lo), H = g(hi);
    return { status: "ok", reviews: reviews, price: priceCents / 100, mult: { lo: lo, hi: hi }, share: share, lo: L.rev, hi: H.rev, unitsLo: L.units, unitsHi: H.units };
  }

  /* ---------------- Regional ---------------- */

  // Countries with one clear main language, as Steam names its languages. A country is matched only by exact name
  // (case-insensitive) or a listed alias; anything else, including regions and multilingual countries such as
  // Switzerland, Belgium, Canada or India, is listed as "not matched" rather than guessed.
  var LANG = {
    "Germany": ["German"], "Austria": ["German"], "France": ["French"], "Italy": ["Italian"],
    "Spain": ["Spanish - Spain", "Spanish - Latin America"],
    "Mexico": ["Spanish - Latin America", "Spanish - Spain"], "Argentina": ["Spanish - Latin America", "Spanish - Spain"],
    "Chile": ["Spanish - Latin America", "Spanish - Spain"], "Colombia": ["Spanish - Latin America", "Spanish - Spain"],
    "Peru": ["Spanish - Latin America", "Spanish - Spain"],
    "Brazil": ["Portuguese - Brazil", "Portuguese - Portugal"], "Portugal": ["Portuguese - Portugal", "Portuguese - Brazil"],
    "Russia": ["Russian"], "Russian Federation": ["Russian"], "Ukraine": ["Ukrainian"], "Poland": ["Polish"], "Turkey": ["Turkish"], "Türkiye": ["Turkish"],
    "Japan": ["Japanese"], "South Korea": ["Korean"], "Korea": ["Korean"], "Korea, Republic of": ["Korean"],
    "China": ["Simplified Chinese"], "Taiwan": ["Traditional Chinese"], "Hong Kong": ["Traditional Chinese"],
    "Czech Republic": ["Czech"], "Czechia": ["Czech"], "Hungary": ["Hungarian"], "Netherlands": ["Dutch"], "Sweden": ["Swedish"],
    "Norway": ["Norwegian"], "Denmark": ["Danish"], "Finland": ["Finnish"], "Thailand": ["Thai"], "Vietnam": ["Vietnamese"], "Viet Nam": ["Vietnamese"],
    "Indonesia": ["Indonesian"], "Greece": ["Greek"], "Romania": ["Romanian"], "Bulgaria": ["Bulgarian"],
    "Saudi Arabia": ["Arabic"], "United Arab Emirates": ["Arabic"], "Egypt": ["Arabic"],
    "United States": ["English"], "USA": ["English"], "United Kingdom": ["English"], "UK": ["English"], "Australia": ["English"],
    "New Zealand": ["English"], "Ireland": ["English"],
  };
  function langFor(region) {
    var k = String(region || "").trim().toLowerCase();
    for (var name in LANG) if (name.toLowerCase() === k) return LANG[name];
    return null;
  }

  /** Regions with at least 5% of wishlist adds whose main language isn't in the game's supported list. */
  function regional(share, languages) {
    if (!share || !share.rows || !share.rows.length) return { status: "none" };
    if (!languages || !languages.length) return { status: "no-languages" };
    var have = {}; languages.forEach(function (l) { have[String(l).toLowerCase()] = 1; });
    var big = share.rows.filter(function (r) { return !r.pooled && r.w && r.w.p >= MIN_REGION_SHARE; });
    var out = { status: "ok", n: share.n, start: share.start, end: share.end, questions: [], covered: [], unmatched: [] };
    big.forEach(function (r) {
      var langs = langFor(r.region);
      if (!langs) { out.unmatched.push(r); return; }
      var ok = langs.some(function (l) { return have[l.toLowerCase()]; });
      (ok ? out.covered : out.questions).push(Object.assign({ language: langs[0] }, r));
    });
    return out;
  }

  /* ---------------- Signals ---------------- */

  function r2(x) { return Math.round(x * 100) / 100; }

  /** Ledger rows for "Send to game". Only reads above their minimums are sent (brief §2.4). */
  function signals(R) {
    var out = [];
    var L = R.legs;
    if (L && L.status === "ok") {
      out.push({ key: "tail_legs_ratio", label: "Legs: reviews per day, last 28 days vs first 28 after release", value: r2(L.ratio), unit: "ratio",
        meta: { half: "reach", source: "steam-public", method: "poisson95_ratio_bounds", n: L.last.count + L.first.count,
          window: L.last.from + "/" + L.last.to, lo: r2(L.lo), hi: r2(L.hi), first_window: L.first.from + "/" + L.first.to,
          first_per_day: r2(L.first.rate), last_per_day: r2(L.last.rate), rollup: L.rollupType, release: R.release } });
    }
    var F = R.floor;
    if (F && F.status === "ok") {
      out.push({ key: "players_floor_ratio", label: "Player floor: players at snapshot time, last 7 vs launch week", value: r2(F.ratio), unit: "ratio",
        meta: { half: "resonance", source: "computed", method: "median", n: F.launch.n + F.recent.n, window: F.recent.from + "/" + F.recent.to,
          launch_window: F.launch.from + "/" + F.launch.to, launch_median: F.launch.median, recent_median: F.recent.median,
          from_key: "steam_players", snapshot_time: SNAPSHOT_TIME, release: R.release } });
    }
    return out;
  }

  /**
   * Run everything. D = { hist, details, news, ledger (rows), release (override), today, pe: { beats, regionShare },
   * revenue (months), box: { lo, hi, share } }.
   */
  function analyse(D) {
    var today = D.today, details = D.details || {};
    var steamRelease = parseReleaseText(details.releaseText);
    var release = isYmd(D.release) ? D.release : steamRelease;
    var players = dailyFromLedger(D.ledger, "steam_players");
    var totals = dailyFromLedger(D.ledger, "steam_reviews");
    var reviewsTotal = totals.length ? totals[totals.length - 1].value : null;
    if (reviewsTotal == null && D.hist) reviewsTotal = buckets(D.hist).reduce(function (s, b) { return s + b.count; }, 0) || null;
    var dr = dailyReviews(D.hist, totals, today);
    var beats = tailBeats(D.pe && D.pe.beats, D.news, release);
    return {
      today: today, release: release, steamRelease: steamRelease, releaseOverridden: isYmd(D.release) && D.release !== steamRelease,
      legs: legs(D.hist, release, today),
      floor: floor(players, release, today), players: players,
      reviewsTotal: reviewsTotal,
      revenue: revenue(D.revenue, release, today),
      box: boxleiter(reviewsTotal, details.free ? 0 : details.priceCents, D.box || BOX_DEFAULTS),
      beats: aroundBeats(beats, dr.daily, players), reviewSource: dr.source,
      regional: regional(D.pe && D.pe.regionShare, details.languages),
    };
  }

  return {
    DAY: DAY, WINDOW_DAYS: WINDOW_DAYS, MIN_AGE_DAYS: MIN_AGE_DAYS, MIN_FIRST_REVIEWS: MIN_FIRST_REVIEWS, LAUNCH_DAYS: LAUNCH_DAYS,
    MIN_LAUNCH_SNAPSHOTS: MIN_LAUNCH_SNAPSHOTS, RECENT_SNAPSHOTS: RECENT_SNAPSHOTS, MIN_RECENT_SNAPSHOTS: MIN_RECENT_SNAPSHOTS,
    MAX_SNAPSHOT_AGE_DAYS: MAX_SNAPSHOT_AGE_DAYS, MIN_FLOOR_AGE_DAYS: MIN_FLOOR_AGE_DAYS, MIN_PLAYER_BEFORE: MIN_PLAYER_BEFORE,
    MIN_PLAYER_AFTER: MIN_PLAYER_AFTER, MIN_BEAT_REVIEWS: MIN_BEAT_REVIEWS, MIN_REGION_SHARE: MIN_REGION_SHARE, REVENUE_MONTHS: REVENUE_MONTHS,
    BOX_DEFAULTS: BOX_DEFAULTS, HIST_SOURCE: HIST_SOURCE, SNAPSHOT_TIME: SNAPSHOT_TIME, LANG: LANG,
    parseReleaseText: parseReleaseText, buckets: buckets, recentDaily: recentDaily, legs: legs,
    dailyFromLedger: dailyFromLedger, floor: floor, dailyReviews: dailyReviews,
    tailBeats: tailBeats, aroundBeats: aroundBeats,
    parseMoney: parseMoney, parseMonth: parseMonth, revenueFromCsv: revenueFromCsv, cleanMonth: cleanMonth, mergeMonths: mergeMonths, revenue: revenue,
    boxleiter: boxleiter, langFor: langFor, regional: regional, signals: signals, analyse: analyse,
  };
});
