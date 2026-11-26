/* Page Engine — pure maths over studio-submitted Steamworks numbers (UMD: window.PageModel / module.exports).
 * Data comes from CSVs the studio exports from Steamworks (parsed in the browser) or from a form.
 * Method follows §5.2 of docs/MARKETING-TOOLS-BRIEFS.md. Intervals reuse Sentiment Radar's model.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../sentiment-radar/model.js"));
  else root.PageModel = factory(root.SentimentModel);
})(typeof self !== "undefined" ? self : this, function (SR) {
  "use strict";

  var DAY = 86400000;
  var wilson = SR.wilson, poisson = SR.poisson, change = SR.change, median = SR.median;

  // A window counts only when at least 75% of its days have data; otherwise a gap would read as a fall.
  var MIN_COVERAGE = 0.75;
  // Velocity needs 10 adds across the two windows it compares; fewer and every change reads as noise.
  var MIN_WINDOW_COUNT = 10;
  // Deletes per 100 adds needs 30 adds in 28 days; below that one delete moves the ratio by 3+ points.
  var MIN_ADDS_FOR_DELETES = 30;
  // Click-through needs 1,000 impressions in 28 days; below that the Wilson range is too wide to act on.
  var MIN_IMPRESSIONS = 1000;
  // Visits to wishlists needs 100 visits in 28 days, so one wishlist moves the ratio by at most 1 per 100.
  var MIN_VISITS = 100;
  // A beat's baseline needs daily adds on at least 10 of the 14 days before it.
  var MIN_BASELINE_DAYS = 10;
  // ...and daily adds on all 7 days from the beat on, or the "after" count would be short.
  var BEAT_AFTER_DAYS = 7;
  var BEAT_BEFORE_DAYS = 14;
  // A region needs 30 adds in 28 days before its share is shown on its own; smaller ones are pooled as "Other".
  var MIN_REGION_ADDS = 30;
  // A UTM row needs 30 visits before its wishlists-per-100-visits ratio is shown.
  var MIN_UTM_VISITS = 30;

  // Steamworks documentation on UTM Analytics, read 22 Nov 2026 (brief §2.6).
  var UTM_CHECKED = "2026-11-22";
  var UTM_SOURCE = "https://partner.steamgames.com/doc/marketing/utm_analytics";

  var BEAT_TYPES = ["announcement", "trailer", "festival", "demo launch", "sale", "update", "creator coverage", "press embargo", "other"];
  var CHANNELS = ["Steam", "X", "Reddit", "TikTok", "YouTube", "Twitch", "Discord", "press", "festival"];
  var ASSETS = ["capsule", "header", "trailer", "screenshots", "short description"];

  var WISHLIST_FIELDS = ["adds", "deletes", "purchases", "outstanding"];
  var TRAFFIC_FIELDS = ["impressions", "visits"];

  /* ---------------- Dates ---------------- */

  function ymd(ms) { return new Date(ms).toISOString().slice(0, 10); }
  function ms(d) { var v = Date.parse(String(d) + "T00:00:00Z"); return isFinite(v) ? v : null; }
  function addDays(d, n) { return ymd(ms(d) + n * DAY); }
  function daysBetween(a, b) { return Math.round((ms(b) - ms(a)) / DAY); }
  function isYmd(d) { return typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && ms(d) != null && ymd(ms(d)) === d; }
  function round1(x) { return Math.round(x * 10) / 10; }

  /* ---------------- CSV ---------------- */

  /** Split CSV text into rows of cells. Handles quotes, doubled quotes, CRLF, and comma, semicolon or tab delimiters. */
  function parseCsv(text) {
    text = String(text || "").replace(/^﻿/, "");
    var first = text.split(/\r?\n/).slice(0, 20).join("\n");
    var counts = { ",": 0, ";": 0, "\t": 0 };
    for (var i = 0; i < first.length; i++) if (counts[first[i]] != null) counts[first[i]]++;
    var delim = counts["\t"] > counts[","] && counts["\t"] > counts[";"] ? "\t" : counts[";"] > counts[","] ? ";" : ",";
    var rows = [], row = [], cell = "", q = false;
    for (var j = 0; j < text.length; j++) {
      var c = text[j];
      if (q) {
        if (c === '"') { if (text[j + 1] === '"') { cell += '"'; j++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === delim) { row.push(cell.trim()); cell = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[j + 1] === "\n") j++;
        row.push(cell.trim()); rows.push(row); row = []; cell = "";
      } else cell += c;
    }
    if (cell !== "" || row.length) { row.push(cell.trim()); rows.push(row); }
    rows = rows.filter(function (r) { return r.some(function (x) { return x !== ""; }); });
    return { delimiter: delim, rows: rows };
  }

  /** The header is the first row with the most common cell count (exports often start with a few title lines). */
  function findHeader(rows) {
    var freq = {}, best = 0, width = 0;
    rows.forEach(function (r) { var n = r.length; freq[n] = (freq[n] || 0) + 1; });
    Object.keys(freq).forEach(function (k) { if (+k >= 2 && (freq[k] > best || (freq[k] === best && +k > width))) { best = freq[k]; width = +k; } });
    for (var i = 0; i < rows.length; i++) if (rows[i].length === width) return i;
    return 0;
  }

  /** Suggest a column for each field by keyword. A suggestion only: the studio confirms every mapping on the page. */
  var HINTS = {
    date: [/^date$/, /date/, /^day$/],
    adds: [/add/],
    deletes: [/delet/, /remov/],
    purchases: [/purchas/, /activat/],
    outstanding: [/outstanding/, /balance/, /total wishlist/],
    region: [/region/, /country/],
    impressions: [/impression/],
    visits: [/visit/, /views?$/],
    source: [/source/],
    medium: [/medium/],
    campaign: [/campaign/],
    content: [/content/],
    term: [/term/],
    wishlists: [/wishlist/],
  };
  function suggest(headers, fields) {
    var used = {}, out = {};
    fields.forEach(function (f) {
      var hints = HINTS[f] || [];
      for (var h = 0; h < hints.length && out[f] == null; h++) {
        for (var i = 0; i < headers.length; i++) {
          if (!used[i] && hints[h].test(String(headers[i]).toLowerCase())) { out[f] = i; used[i] = 1; break; }
        }
      }
    });
    return out;
  }

  /** Parse a date cell. `order` is "ymd", "mdy" or "dmy"; slashes and dots only matter for the last two. */
  function parseDate(s, order) {
    s = String(s || "").trim();
    var m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
    var y, mo, d;
    if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else {
      m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/);
      if (!m) { var t = Date.parse(s); return isFinite(t) && /[a-z]/i.test(s) ? ymd(t - new Date(t).getTimezoneOffset() * 60000) : null; }
      y = +m[3]; if (y < 100) y += 2000;
      if (order === "dmy") { d = +m[1]; mo = +m[2]; } else { mo = +m[1]; d = +m[2]; }
    }
    var out = y + "-" + String(mo).padStart(2, "0") + "-" + String(d).padStart(2, "0");
    return isYmd(out) ? out : null;
  }
  /** Guess day/month order from the cells: any first part over 12 means day first; any second part over 12 means month first. */
  function guessDateOrder(cells) {
    var dmy = false, mdy = false;
    cells.forEach(function (s) {
      var m = String(s || "").trim().match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.]\d{2,4}/);
      if (!m) return;
      if (+m[1] > 12) dmy = true;
      if (+m[2] > 12) mdy = true;
    });
    if (dmy && !mdy) return "dmy";
    if (mdy && !dmy) return "mdy";
    return dmy && mdy ? null : "ambiguous";
  }

  /** Parse a count cell: drops thousands separators and spaces. Empty or non-numeric gives null. */
  function parseCount(s) {
    if (s == null) return null;
    var t = String(s).replace(/[\s ,']/g, "");
    if (t === "" || t === "-") return null;
    var v = Number(t);
    return isFinite(v) ? v : null;
  }

  /**
   * Turn parsed CSV rows into daily rows for one series ("wishlists" or "traffic") using the studio's column map.
   * Rows with the same date (e.g. one per region) are summed; the per-region split is kept separately.
   * Deletes are stored as positive counts whatever sign the export uses.
   */
  function tableFromCsv(rows, headerIndex, map, series, order) {
    var fields = series === "traffic" ? TRAFFIC_FIELDS : WISHLIST_FIELDS;
    var byDate = {}, regions = {}, skipped = 0;
    for (var i = headerIndex + 1; i < rows.length; i++) {
      var r = rows[i];
      var date = parseDate(r[map.date], order);
      if (!date) { skipped++; continue; }
      var o = byDate[date] || (byDate[date] = { from: date, to: date });
      var any = false;
      fields.forEach(function (f) {
        if (map[f] == null) return;
        var v = parseCount(r[map[f]]);
        if (v == null) return;
        if (f === "deletes") v = Math.abs(v);
        any = true;
        // Outstanding is a balance, not a flow: keep it once per date rather than summing regions.
        if (f === "outstanding" && map.region != null) return;
        o[f] = (o[f] || 0) + v;
      });
      if (!any) { skipped++; continue; }
      if (series !== "traffic" && map.region != null && map.adds != null) {
        var reg = String(r[map.region] || "").trim() || "Unknown";
        var a = parseCount(r[map.adds]);
        if (a != null) { regions[date] = regions[date] || {}; regions[date][reg] = (regions[date][reg] || 0) + a; }
      }
    }
    var list = Object.keys(byDate).sort().map(function (d) { return byDate[d]; });
    return { rows: list, regions: regions, skipped: skipped };
  }

  /** UTM rows from a CSV: one row per UTM combination, with visits, wishlists and purchases. */
  function utmFromCsv(rows, headerIndex, map) {
    var out = [], skipped = 0;
    for (var i = headerIndex + 1; i < rows.length; i++) {
      var r = rows[i];
      var row = {
        source: map.source != null ? String(r[map.source] || "").trim() : "",
        medium: map.medium != null ? String(r[map.medium] || "").trim() : "",
        campaign: map.campaign != null ? String(r[map.campaign] || "").trim() : "",
        content: map.content != null ? String(r[map.content] || "").trim() : "",
        term: map.term != null ? String(r[map.term] || "").trim() : "",
        visits: map.visits != null ? parseCount(r[map.visits]) : null,
        wishlists: map.wishlists != null ? parseCount(r[map.wishlists]) : null,
        purchases: map.purchases != null ? parseCount(r[map.purchases]) : null,
      };
      if (!row.source && !row.medium && !row.campaign) { skipped++; continue; }
      if (row.visits == null && row.wishlists == null && row.purchases == null) { skipped++; continue; }
      out.push(row);
    }
    return { rows: out, skipped: skipped };
  }

  /* ---------------- Series ---------------- */

  /**
   * Merge new rows (daily or multi-day periods) into a series. A new row replaces any old row it overlaps,
   * so re-importing a newer export, or typing a correction, never double counts.
   */
  function merge(series, incoming) {
    // Within the new rows too, a later row replaces an earlier one it overlaps.
    incoming = (incoming || []).filter(function (n, i, all) {
      return !all.slice(i + 1).some(function (m) { return !(n.to < m.from || n.from > m.to); });
    });
    var keep = (series || []).filter(function (old) {
      return !incoming.some(function (n) { return !(old.to < n.from || old.from > n.to); });
    });
    return keep.concat(incoming).sort(function (a, b) { return a.from < b.from ? -1 : a.from > b.from ? 1 : 0; });
  }

  function lastDate(series) {
    var d = null;
    (series || []).forEach(function (r) { if (!d || r.to > d) d = r.to; });
    return d;
  }

  /**
   * Total a field over the `days` days ending on `end` (inclusive). Only rows wholly inside the window count;
   * `covered` is how many days they span. Multi-day rows that straddle the edge are left out, never split.
   */
  function windowSum(series, field, end, days) {
    var start = addDays(end, -(days - 1));
    var count = 0, covered = 0, rows = 0, csv = false;
    (series || []).forEach(function (r) {
      if (r[field] == null || r.from < start || r.to > end) return;
      count += r[field]; covered += daysBetween(r.from, r.to) + 1; rows++;
      if (r.src === "csv") csv = true;
    });
    return { field: field, start: start, end: end, days: days, count: count, covered: covered, rows: rows, csv: csv, enough: covered >= Math.ceil(days * MIN_COVERAGE) };
  }
  function rateOf(w) { return w.covered > 0 ? poisson(w.count, w.covered) : null; }

  /* ---------------- Measures ---------------- */

  /** Wishlist adds per day over `days`, against the `days` before, with exact Poisson ranges and the §2.4 change rule. */
  function velocity(series, end, days) {
    var now = windowSum(series, "adds", end, days);
    var before = windowSum(series, "adds", addDays(end, -days), days);
    var out = { days: days, now: now, before: before, nowRate: rateOf(now), beforeRate: rateOf(before), change: null, enough: now.enough };
    if (now.enough && before.enough && now.count + before.count >= MIN_WINDOW_COUNT) out.change = change(out.nowRate, out.beforeRate);
    return out;
  }

  /** Deletes per 100 adds over 28 days. A ratio, not a churn rate: deletes can come from wishlists added long ago. */
  function deletesPer100(series, end) {
    var a = windowSum(series, "adds", end, 28), d = windowSum(series, "deletes", end, 28);
    var out = { adds: a, deletes: d, value: null, lo: null, hi: null, enough: false };
    if (!a.enough || !d.enough || a.count < MIN_ADDS_FOR_DELETES) return out;
    // Scale to the same days: both series usually cover identical days, but don't assume it.
    var addsPerDay = a.count / a.covered, p = poisson(d.count, d.covered);
    out.value = 100 * p.rate / addsPerDay; out.lo = 100 * p.lo / addsPerDay; out.hi = 100 * p.hi / addsPerDay;
    out.enough = true;
    return out;
  }

  /** Click-through: visits ÷ impressions over `days`, with a Wilson range. */
  function ctr(traffic, end, days) {
    days = days || 28;
    var imp = windowSum(traffic, "impressions", end, days), vis = windowSum(traffic, "visits", end, days);
    var out = { impressions: imp, visits: vis, w: null, enough: false };
    if (!imp.enough || !vis.enough || imp.covered !== vis.covered || imp.count < MIN_IMPRESSIONS) return out;
    out.w = wilson(vis.count, imp.count); out.enough = true;
    return out;
  }

  /** Wishlist adds per 100 store visits over `days`, with the adds' Poisson range. A ratio: some adds don't come through a tracked visit. */
  function visitsToWishlist(wish, traffic, end, days) {
    days = days || 28;
    var a = windowSum(wish, "adds", end, days), v = windowSum(traffic, "visits", end, days);
    var out = { adds: a, visits: v, value: null, lo: null, hi: null, enough: false };
    if (!a.enough || !v.enough || v.count < MIN_VISITS) return out;
    var visitsPerDay = v.count / v.covered, p = poisson(a.count, a.covered);
    out.value = 100 * p.rate / visitsPerDay; out.lo = 100 * p.lo / visitsPerDay; out.hi = 100 * p.hi / visitsPerDay;
    out.enough = true;
    return out;
  }

  /** Same measure for the previous window, and whether the two ranges separate. */
  function compareRatio(nowR, beforeR) {
    if (!nowR || !beforeR || !nowR.enough || !beforeR.enough) return null;
    var a = nowR.w ? nowR.w : nowR, b = beforeR.w ? beforeR.w : beforeR;
    return change({ lo: a.lo, hi: a.hi }, { lo: b.lo, hi: b.hi });
  }

  /** Latest outstanding-wishlist balance in the data, if the export or the form gave one. */
  function outstanding(series) {
    var best = null;
    (series || []).forEach(function (r) { if (r.outstanding != null && (!best || r.to > best.date)) best = { date: r.to, value: r.outstanding, csv: r.src === "csv" }; });
    return best;
  }

  /** Share of wishlist adds by region over 28 days, with Wilson ranges. Small regions are pooled. */
  function regionShare(regions, end) {
    var start = addDays(end, -27), totals = {}, n = 0;
    Object.keys(regions || {}).forEach(function (d) {
      if (d < start || d > end) return;
      Object.keys(regions[d]).forEach(function (r) { totals[r] = (totals[r] || 0) + regions[d][r]; n += regions[d][r]; });
    });
    if (!n) return null;
    var rows = [], other = 0;
    Object.keys(totals).forEach(function (r) { if (totals[r] >= MIN_REGION_ADDS) rows.push({ region: r, count: totals[r] }); else other += totals[r]; });
    rows.sort(function (a, b) { return b.count - a.count; });
    if (other > 0) rows.push({ region: "Other (each under " + MIN_REGION_ADDS + " adds)", count: other, pooled: true });
    rows.forEach(function (r) { r.w = wilson(r.count, n); });
    return { n: n, start: start, end: end, rows: rows };
  }

  /** UTM table: wishlists per 100 visits for rows with enough visits, using the wishlists' Poisson range. */
  function utmTable(rows) {
    return (rows || []).map(function (r) {
      var o = Object.assign({}, r, { ratio: null });
      if (r.visits != null && r.visits >= MIN_UTM_VISITS && r.wishlists != null) {
        var p = poisson(r.wishlists, 1);
        o.ratio = { value: 100 * r.wishlists / r.visits, lo: 100 * p.lo / r.visits, hi: 100 * p.hi / r.visits };
      }
      return o;
    }).sort(function (a, b) { return (b.visits || 0) - (a.visits || 0); });
  }

  /** Daily adds keyed by date, from single-day rows only (multi-day form totals can't be placed on a day). */
  function dailyAdds(series) {
    var out = {};
    (series || []).forEach(function (r) { if (r.from === r.to && r.adds != null) out[r.from] = r.adds; });
    return out;
  }

  /**
   * Beat view. For each beat: adds on the beat day and the six days after, against 7 × the median day in the
   * 14 days before, with an exact Poisson range on the "after" count. "Associated with", never "caused".
   * Beats (or version changes) whose 7-day windows overlap are marked as impossible to separate.
   */
  function beatLift(series, beats, versions) {
    var daily = dailyAdds(series);
    var markers = (beats || []).filter(function (b) { return !b.deleted && isYmd(b.date); }).map(function (b) { return { id: b.id, date: b.date, what: "beat", label: b.type }; })
      .concat((versions || []).filter(function (v) { return !v.deleted && isYmd(v.date); }).map(function (v) { return { id: v.id, date: v.date, what: "version", label: v.label || v.asset }; }));
    return (beats || []).filter(function (b) { return !b.deleted && isYmd(b.date); }).map(function (b) {
      var before = [], after = 0, afterDays = 0;
      for (var i = 1; i <= BEAT_BEFORE_DAYS; i++) { var d = addDays(b.date, -i); if (daily[d] != null) before.push(daily[d]); }
      for (var j = 0; j < BEAT_AFTER_DAYS; j++) { var e = addDays(b.date, j); if (daily[e] != null) { after += daily[e]; afterDays++; } }
      var overlaps = markers.filter(function (m) { return m.id !== b.id && Math.abs(daysBetween(m.date, b.date)) < BEAT_AFTER_DAYS; });
      var out = { beat: b, beforeDays: before.length, afterDays: afterDays, overlaps: overlaps, enough: false };
      if (before.length < MIN_BASELINE_DAYS || afterDays < BEAT_AFTER_DAYS) return out;
      var base = median(before), p = poisson(after, 1);
      out.enough = true;
      out.baselinePerDay = base; out.expected = base * BEAT_AFTER_DAYS; out.after = after;
      out.lo = p.lo; out.hi = p.hi; out.lift = after - out.expected;
      out.verdict = out.expected < p.lo ? "rise" : out.expected > p.hi ? "fall" : "none";
      return out;
    }).sort(function (a, b) { return a.beat.date < b.beat.date ? 1 : -1; });
  }

  /** Point to the half that moved, without any outside benchmark: only the game's own previous window. */
  function verdict(R) {
    var v28 = R.vel28, ctrCh = R.ctrChange, vtwCh = R.vtwChange, delCh = R.delChange;
    var reachDown = v28.change === "down" || ctrCh === "down";
    var resonanceDown = vtwCh === "down" || delCh === "up";
    var out = { reachDown: reachDown, resonanceDown: resonanceDown };
    if (reachDown && resonanceDown) out.next = "both";
    else if (resonanceDown) out.next = "resonance";
    else if (reachDown) out.next = "reach";
    else if (v28.change === "up" || ctrCh === "up" || vtwCh === "up") out.next = "up";
    else out.next = "steady";
    return out;
  }

  /** Run every measure. `S` is the saved tool state; `end` defaults to the last date with wishlist data. */
  function analyse(S, end) {
    var wish = S.wishlists || [], traffic = S.traffic || [];
    end = end || lastDate(wish) || lastDate(traffic);
    if (!end) return { empty: true };
    var prev = addDays(end, -28);
    var R = {
      end: end,
      vel7: velocity(wish, end, 7),
      vel28: velocity(wish, end, 28),
      del: deletesPer100(wish, end),
      delBefore: deletesPer100(wish, prev),
      ctr: ctr(traffic, end, 28),
      ctrBefore: ctr(traffic, prev, 28),
      vtw: visitsToWishlist(wish, traffic, end, 28),
      vtwBefore: visitsToWishlist(wish, traffic, prev, 28),
      outstanding: outstanding(wish),
      regions: regionShare(S.regions, end),
      utm: utmTable(S.utm && S.utm.rows),
      beats: beatLift(wish, S.beats, S.versions),
    };
    R.ctrChange = compareRatio(R.ctr, R.ctrBefore);
    R.vtwChange = compareRatio(R.vtw, R.vtwBefore);
    R.delChange = compareRatio(R.del, R.delBefore);
    R.verdict = verdict(R);
    return R;
  }

  /* ---------------- Beat and version logs (ledger rows, owner's choice 26 Nov 2026) ---------------- */

  /**
   * The ledger is append-only. Each beat or version has a stable `id` in meta; an edit appends a new row with
   * the same id, and a delete appends a row with `deleted: true`. Readers keep the latest row per id.
   */
  function beatSignal(b) {
    return { key: "beat", label: "Beat: " + b.type + (b.channel ? " (" + b.channel + ")" : ""), value: 1, unit: "count",
      meta: { kind: "beat", id: b.id, date: b.date, type: b.type, channel: b.channel || null, effort: b.effort || null,
        spend: b.spend == null ? null : b.spend, note: b.note || "", updated: b.updated, deleted: !!b.deleted, source: "studio-entered" } };
  }
  function versionSignal(v) {
    return { key: "creative_version", label: "Store asset change: " + v.asset + " " + v.label, value: v.number, unit: "version",
      meta: { kind: "creative_version", id: v.id, date: v.date, asset: v.asset, label: v.label, note: v.note || "",
        updated: v.updated, deleted: !!v.deleted, source: "studio-entered" } };
  }
  function cleanBeat(m) {
    if (!m || !m.id || !isYmd(m.date)) return null;
    return { id: String(m.id), date: m.date, type: BEAT_TYPES.indexOf(m.type) >= 0 ? m.type : "other", channel: m.channel || "", effort: m.effort === "major" ? "major" : m.effort === "minor" ? "minor" : "",
      spend: typeof m.spend === "number" && isFinite(m.spend) ? m.spend : null, note: String(m.note || "").slice(0, 300), updated: Number(m.updated) || 0, deleted: !!m.deleted };
  }
  function cleanVersion(m, value) {
    if (!m || !m.id || !isYmd(m.date)) return null;
    return { id: String(m.id), date: m.date, asset: ASSETS.indexOf(m.asset) >= 0 ? m.asset : "capsule", label: String(m.label || "").slice(0, 60),
      number: Number(m.number != null ? m.number : value) || 1, note: String(m.note || "").slice(0, 300), updated: Number(m.updated) || 0, deleted: !!m.deleted };
  }
  /** Beats and versions from ledger rows (GET /api/games/:id/signals?all=1), latest row per id. */
  function logsFromLedger(rows) {
    var beats = {}, versions = {};
    (rows || []).forEach(function (r) {
      if (!r || !r.meta) return;
      var t = r.observedAt ? Date.parse(r.observedAt) : 0;
      if (r.key === "beat") { var b = cleanBeat(r.meta); if (b) { b.updated = b.updated || t; if (!beats[b.id] || b.updated >= beats[b.id].updated) beats[b.id] = b; } }
      else if (r.key === "creative_version") { var v = cleanVersion(r.meta, r.value); if (v) { v.updated = v.updated || t; if (!versions[v.id] || v.updated >= versions[v.id].updated) versions[v.id] = v; } }
    });
    return { beats: Object.keys(beats).map(function (k) { return beats[k]; }), versions: Object.keys(versions).map(function (k) { return versions[k]; }) };
  }
  /** Merge two copies of a log by id; the later `updated` wins. Deleted entries are kept so the delete sticks. */
  function mergeLog(a, b) {
    var by = {};
    (a || []).concat(b || []).forEach(function (x) { if (x && x.id && (!by[x.id] || (x.updated || 0) >= (by[x.id].updated || 0))) by[x.id] = x; });
    return Object.keys(by).map(function (k) { return by[k]; }).sort(function (x, y) { return x.date < y.date ? 1 : x.date > y.date ? -1 : 0; });
  }
  /** Next version number for an asset: one more than the highest so far. */
  function nextVersion(versions, asset) {
    var n = 0;
    (versions || []).forEach(function (v) { if (v.asset === asset && !v.deleted && v.number > n) n = v.number; });
    return n + 1;
  }

  /* ---------------- Signals ---------------- */

  function src(csv) { return csv ? "steamworks-export" : "studio-entered"; }
  function win(w) { return w.start + "/" + w.end; }

  /** Ledger rows for "Send to game". Only measures above their minimum are sent. */
  function signals(R) {
    if (!R || R.empty) return [];
    var out = [];
    var a = R.vel28.now;
    if (a.enough) {
      var pr = R.vel28.nowRate;
      out.push({ key: "wishlist_adds_28d", label: "Wishlist adds, last 28 days", value: a.count, unit: "units",
        meta: { half: "reach", source: src(a.csv), method: "poisson95", n: a.count, window: win(a), covered_days: a.covered,
          lo: Math.round(pr.lo * a.covered), hi: Math.round(pr.hi * a.covered), per_day: round1(pr.rate), change: R.vel28.change } });
    }
    if (R.del.enough) {
      out.push({ key: "wishlist_deletes_per_100_adds_28d", label: "Wishlist deletes per 100 adds, last 28 days", value: round1(R.del.value), unit: "ratio",
        meta: { half: "resonance", source: src(R.del.deletes.csv || R.del.adds.csv), method: "poisson95", n: R.del.deletes.count, adds: R.del.adds.count,
          window: win(R.del.adds), lo: round1(R.del.lo), hi: round1(R.del.hi), change: R.delChange } });
    }
    if (R.ctr.enough) {
      out.push({ key: "page_ctr_28d", label: "Store page click-through, last 28 days", value: round1(R.ctr.w.p * 100), unit: "pct",
        meta: { half: "reach", source: src(R.ctr.impressions.csv), method: "wilson95", n: R.ctr.impressions.count, visits: R.ctr.visits.count,
          window: win(R.ctr.impressions), lo: round1(R.ctr.w.lo * 100), hi: round1(R.ctr.w.hi * 100), change: R.ctrChange } });
    }
    if (R.vtw.enough) {
      out.push({ key: "page_visits_to_wishlist_28d", label: "Wishlist adds per 100 page visits, last 28 days", value: round1(R.vtw.value), unit: "ratio",
        meta: { half: "resonance", source: src(R.vtw.adds.csv || R.vtw.visits.csv), method: "poisson95", n: R.vtw.adds.count, visits: R.vtw.visits.count,
          window: win(R.vtw.visits), lo: round1(R.vtw.lo), hi: round1(R.vtw.hi), change: R.vtwChange } });
    }
    if (R.outstanding) {
      out.push({ key: "wishlists_outstanding", label: "Wishlists outstanding", value: R.outstanding.value, unit: "units",
        meta: { half: "reach", source: src(R.outstanding.csv), method: "reported", n: 1, window: R.outstanding.date } });
    }
    return out;
  }

  return {
    DAY: DAY, MIN_COVERAGE: MIN_COVERAGE, MIN_WINDOW_COUNT: MIN_WINDOW_COUNT, MIN_ADDS_FOR_DELETES: MIN_ADDS_FOR_DELETES,
    MIN_IMPRESSIONS: MIN_IMPRESSIONS, MIN_VISITS: MIN_VISITS, MIN_BASELINE_DAYS: MIN_BASELINE_DAYS,
    BEAT_AFTER_DAYS: BEAT_AFTER_DAYS, BEAT_BEFORE_DAYS: BEAT_BEFORE_DAYS, MIN_REGION_ADDS: MIN_REGION_ADDS, MIN_UTM_VISITS: MIN_UTM_VISITS,
    UTM_CHECKED: UTM_CHECKED, UTM_SOURCE: UTM_SOURCE,
    BEAT_TYPES: BEAT_TYPES, CHANNELS: CHANNELS, ASSETS: ASSETS, WISHLIST_FIELDS: WISHLIST_FIELDS, TRAFFIC_FIELDS: TRAFFIC_FIELDS,
    wilson: wilson, poisson: poisson, change: change, median: median,
    ymd: ymd, addDays: addDays, daysBetween: daysBetween, isYmd: isYmd,
    parseCsv: parseCsv, findHeader: findHeader, suggest: suggest, parseDate: parseDate, guessDateOrder: guessDateOrder, parseCount: parseCount,
    tableFromCsv: tableFromCsv, utmFromCsv: utmFromCsv,
    merge: merge, lastDate: lastDate, windowSum: windowSum,
    velocity: velocity, deletesPer100: deletesPer100, ctr: ctr, visitsToWishlist: visitsToWishlist, compareRatio: compareRatio,
    outstanding: outstanding, regionShare: regionShare, utmTable: utmTable, dailyAdds: dailyAdds, beatLift: beatLift,
    verdict: verdict, analyse: analyse, signals: signals,
    beatSignal: beatSignal, versionSignal: versionSignal, cleanBeat: cleanBeat, cleanVersion: cleanVersion,
    logsFromLedger: logsFromLedger, mergeLog: mergeLog, nextVersion: nextVersion,
  };
});
