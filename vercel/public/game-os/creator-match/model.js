/* Creator Match — pure maths over the studio's own data (UMD: window.CreatorModel / module.exports).
 * Twitch footprint from the studio's Twitch Game Developer Analytics CSV (read in the browser), and the
 * studio's outreach log. Nothing from the YouTube or Twitch APIs ever reaches this file's signals (brief §3).
 * Method follows §5.3 of docs/MARKETING-TOOLS-BRIEFS.md. CSV parsing, windows and beats reuse Page Engine's model.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../page-engine/model.js"));
  else root.CreatorModel = factory(root.PageModel);
})(typeof self !== "undefined" ? self : this, function (PM) {
  "use strict";

  var wilson = PM.wilson, poisson = PM.poisson, change = PM.change;

  // The reply rate needs 10 creators contacted; below that one reply moves it by 10 points or more.
  var MIN_CONTACTED = 10;
  // A 28-day Twitch window counts only when 75% of its days have rows (Page Engine's rule), so a gap never reads as a fall.
  var MIN_COVERAGE = PM.MIN_COVERAGE;
  // Broadcaster-days changes need 10 across the two windows compared; fewer and every change reads as noise.
  var MIN_WINDOW_COUNT = 10;

  // Twitch Game Developer Analytics: a daily CSV covering up to 365 days, only for a game the studio has claimed
  // in the Twitch developer console, and only when the game was streamed for at least 300 minutes in the period.
  // From the owner's source check in brief §3 (22 Nov 2026).
  var TWITCH_MIN_MINUTES = 300;
  var TWITCH_CHECKED = "2026-11-22";
  var TWITCH_SOURCE = "https://dev.twitch.tv/docs/insights/";

  var PLATFORMS = ["YouTube", "Twitch", "TikTok", "X", "Instagram", "Bluesky", "Blog or site", "Other"];
  var STATUSES = ["contacted", "replied", "covered", "declined", "no reply"];
  // Declining is a reply too: the creator answered.
  var REPLIED = { replied: 1, covered: 1, declined: 1 };
  // Page Engine's beat channels; platforms not on that list log the beat with no channel.
  var CHANNEL_FOR = { YouTube: "YouTube", Twitch: "Twitch", TikTok: "TikTok", X: "X" };

  var TWITCH_FIELDS = ["hours", "minutes", "viewers", "broadcasters"];

  function isYmd(d) { return PM.isYmd(d); }
  function round1(x) { return Math.round(x * 10) / 10; }
  function str(x, n) { return String(x == null ? "" : x).trim().slice(0, n); }

  /* ---------------- Twitch CSV ---------------- */

  /** Column suggestions for the Twitch export, by keyword. The studio confirms each one on the page. */
  var HINTS = {
    date: [/^date$/, /^day$/, /date/],
    hours: [/hours watched/, /watch hours/, /hours/],
    minutes: [/minutes watched/, /watch minutes/, /minutes/],
    viewers: [/unique viewers/, /viewers/],
    broadcasters: [/unique broadcasters/, /broadcasters/, /streamers/, /channels/],
  };
  function suggest(headers) {
    var used = {}, out = {};
    ["date", "hours", "minutes", "viewers", "broadcasters"].forEach(function (f) {
      var hints = HINTS[f];
      for (var h = 0; h < hints.length && out[f] == null; h++) {
        for (var i = 0; i < headers.length; i++) {
          if (!used[i] && hints[h].test(String(headers[i]).toLowerCase())) { out[f] = i; used[i] = 1; break; }
        }
      }
    });
    // If both an hours and a minutes column exist, hours wins; minutes stays only as a fallback.
    if (out.hours != null && out.minutes != null) delete out.minutes;
    return out;
  }

  /**
   * Daily rows from the Twitch CSV: { from, to, hours, viewers, broadcasters, src: "csv" }.
   * Watch time is stored in hours; a minutes column is divided by 60. Rows on the same date are summed.
   */
  function twitchFromCsv(rows, headerIndex, map, order) {
    var byDate = {}, skipped = 0;
    for (var i = headerIndex + 1; i < rows.length; i++) {
      var r = rows[i], date = PM.parseDate(r[map.date], order);
      if (!date) { skipped++; continue; }
      var hours = map.hours != null ? PM.parseCount(r[map.hours]) : map.minutes != null ? (function (m) { return m == null ? null : m / 60; })(PM.parseCount(r[map.minutes])) : null;
      var viewers = map.viewers != null ? PM.parseCount(r[map.viewers]) : null;
      var bc = map.broadcasters != null ? PM.parseCount(r[map.broadcasters]) : null;
      if (hours == null && viewers == null && bc == null) { skipped++; continue; }
      var o = byDate[date] || (byDate[date] = { from: date, to: date, src: "csv" });
      if (hours != null) o.hours = round1((o.hours || 0) + Math.max(0, hours));
      if (viewers != null) o.viewers = (o.viewers || 0) + Math.max(0, viewers);
      if (bc != null) o.broadcasters = (o.broadcasters || 0) + Math.max(0, bc);
    }
    return { rows: Object.keys(byDate).sort().map(function (d) { return byDate[d]; }), skipped: skipped };
  }

  /* ---------------- Twitch footprint ---------------- */

  /**
   * 28-day footprint ending on the last day of data, against the 28 days before.
   * Hours watched is a total (not a count of events), so it gets no Poisson range and no up/down call.
   * Broadcaster-days (the sum of each day's unique broadcasters) is a count, so it gets a Poisson range and
   * the §2.4 change rule. It is not unique broadcasters over 28 days: one creator on 3 days counts 3 times.
   */
  function footprint(series, end) {
    end = end || PM.lastDate(series);
    if (!end) return { empty: true };
    var prev = PM.addDays(end, -28);
    var h = PM.windowSum(series, "hours", end, 28), hb = PM.windowSum(series, "hours", prev, 28);
    var b = PM.windowSum(series, "broadcasters", end, 28), bb = PM.windowSum(series, "broadcasters", prev, 28);
    var v = PM.windowSum(series, "viewers", end, 28);
    var bRate = b.covered ? poisson(b.count, b.covered) : null, bbRate = bb.covered ? poisson(bb.count, bb.covered) : null;
    var bChange = b.enough && bb.enough && b.count + bb.count >= MIN_WINDOW_COUNT ? change(bRate, bbRate) : null;
    return {
      end: end,
      hours: h, hoursBefore: hb,
      broadcasters: b, broadcastersBefore: bb, bRate: bRate, bbRate: bbRate, bChange: bChange,
      viewers: v,
    };
  }

  /** Daily rows for the chart: date → { hours, broadcasters }, single-day rows only. */
  function daily(series) {
    var out = {};
    (series || []).forEach(function (r) { if (r.from === r.to) out[r.from] = { hours: r.hours, broadcasters: r.broadcasters }; });
    return out;
  }

  /* ---------------- Outreach log ---------------- */

  /** A clean outreach entry, or null. Deleted entries are kept (with `deleted`) so the delete sticks across devices. */
  function cleanContact(c) {
    if (!c || !c.id) return null;
    var name = str(c.creator, 120);
    if (!name && !c.deleted) return null;
    var link = str(c.link, 300), cov = str(c.coverageLink, 300);
    return {
      id: str(c.id, 64),
      creator: name,
      platform: PLATFORMS.indexOf(c.platform) >= 0 ? c.platform : "Other",
      link: /^https?:\/\//i.test(link) ? link : "",
      contacted: isYmd(c.contacted) ? c.contacted : "",
      status: STATUSES.indexOf(c.status) >= 0 ? c.status : (isYmd(c.contacted) ? "contacted" : ""),
      coverageLink: /^https?:\/\//i.test(cov) ? cov : "",
      coverageDate: isYmd(c.coverageDate) ? c.coverageDate : "",
      note: str(c.note, 300),
      source: c.source === "youtube" || c.source === "twitch" ? c.source : "",
      added: Number(c.added) || 0,
      updated: Number(c.updated) || 0,
      deleted: !!c.deleted,
    };
  }

  /** Merge two copies of the list by id; the later `updated` wins. */
  function mergeContacts(a, b) {
    var by = {};
    (a || []).concat(b || []).forEach(function (x) { if (x && x.id && (!by[x.id] || (x.updated || 0) >= (by[x.id].updated || 0))) by[x.id] = x; });
    return Object.keys(by).map(function (k) { return by[k]; });
  }

  /** Is this entry covered? Status "covered", or a coverage link or date logged. */
  function isCovered(c) { return !c.deleted && (c.status === "covered" || !!c.coverageLink || !!c.coverageDate); }

  /**
   * Outreach counts over every live entry with a contact date. Replies are replied, covered or declined.
   * The reply rate gets a 95% Wilson range and is hidden below MIN_CONTACTED.
   */
  function outreach(list) {
    var live = (list || []).filter(function (c) { return c && !c.deleted; });
    var sent = live.filter(function (c) { return !!c.contacted; });
    var replies = sent.filter(function (c) { return REPLIED[c.status] || isCovered(c); }).length;
    var covered = live.filter(isCovered).length;
    var dates = sent.map(function (c) { return c.contacted; }).sort();
    var w = wilson(replies, sent.length);
    var byStatus = {};
    STATUSES.forEach(function (s) { byStatus[s] = 0; });
    sent.forEach(function (c) { var s = isCovered(c) ? "covered" : c.status || "contacted"; byStatus[s] = (byStatus[s] || 0) + 1; });
    return {
      listed: live.length,
      contacted: sent.length,
      replies: replies,
      covered: covered,
      byStatus: byStatus,
      first: dates[0] || null,
      last: dates[dates.length - 1] || null,
      rate: w,
      enough: sent.length >= MIN_CONTACTED,
    };
  }

  /**
   * The Page Engine beat for a covered entry (type "creator coverage"), on the coverage date (or the contact date
   * when no coverage date is set). Its id is fixed per entry, so an edit replaces the beat and a removal deletes it.
   */
  function coverageBeat(c, now) {
    var date = c.coverageDate || c.contacted;
    var live = isCovered(c) && isYmd(date);
    return PM.cleanBeat({
      id: "cm-" + c.id,
      date: isYmd(date) ? date : PM.ymd(now || Date.now()),
      type: "creator coverage",
      channel: CHANNEL_FOR[c.platform] || "",
      effort: "",
      spend: null,
      note: (c.creator + (c.coverageLink ? " " + c.coverageLink : "")).slice(0, 300),
      updated: now || Date.now(),
      deleted: !live,
    });
  }
  function beatRow(c, now) { var b = coverageBeat(c, now); return b ? PM.beatSignal(b) : null; }

  /* ---------------- Signals ---------------- */

  function win(w) { return w.start + "/" + w.end; }

  /** Ledger rows for "Send to game". Only studio-submitted Twitch CSV numbers and the outreach log. */
  function signals(F, O, today) {
    var out = [];
    if (F && !F.empty) {
      if (F.hours.enough) {
        out.push({ key: "twitch_hours_watched_28d", label: "Twitch hours watched, last 28 days", value: round1(F.hours.count), unit: "hours",
          meta: { half: "reach", source: "twitch-dev-analytics", method: "sum", n: F.hours.covered, window: win(F.hours), covered_days: F.hours.covered,
            before: F.hoursBefore.enough ? round1(F.hoursBefore.count) : null } });
      }
      if (F.broadcasters.enough) {
        var r = F.bRate;
        out.push({ key: "twitch_broadcasters_28d", label: "Twitch broadcaster-days, last 28 days", value: F.broadcasters.count, unit: "units",
          meta: { half: "reach", source: "twitch-dev-analytics", method: "poisson95", n: F.broadcasters.count, window: win(F.broadcasters), covered_days: F.broadcasters.covered,
            measure: "broadcaster-days", note: "Sum of daily unique broadcasters: one creator streaming on 3 days counts 3 times.",
            lo: Math.round(r.lo * F.broadcasters.covered), hi: Math.round(r.hi * F.broadcasters.covered), change: F.bChange } });
      }
    }
    if (O && O.contacted > 0) {
      var wnd = O.first + "/" + (today || O.last);
      out.push({ key: "outreach_contacted", label: "Creators contacted", value: O.contacted, unit: "units",
        meta: { half: "reach", source: "studio-entered", method: "count", n: O.contacted, window: wnd } });
      out.push({ key: "outreach_covered", label: "Creators who covered the game", value: O.covered, unit: "units",
        meta: { half: "reach", source: "studio-entered", method: "count", n: O.contacted, window: wnd } });
      if (O.enough) {
        out.push({ key: "outreach_reply_rate", label: "Outreach reply rate", value: round1(O.rate.p * 100), unit: "pct",
          meta: { half: "reach", source: "studio-entered", method: "wilson95", n: O.contacted, replies: O.replies, window: wnd,
            lo: round1(O.rate.lo * 100), hi: round1(O.rate.hi * 100) } });
      }
    }
    return out;
  }

  return {
    MIN_CONTACTED: MIN_CONTACTED, MIN_COVERAGE: MIN_COVERAGE, MIN_WINDOW_COUNT: MIN_WINDOW_COUNT,
    TWITCH_MIN_MINUTES: TWITCH_MIN_MINUTES, TWITCH_CHECKED: TWITCH_CHECKED, TWITCH_SOURCE: TWITCH_SOURCE,
    PLATFORMS: PLATFORMS, STATUSES: STATUSES, TWITCH_FIELDS: TWITCH_FIELDS,
    suggest: suggest, twitchFromCsv: twitchFromCsv, footprint: footprint, daily: daily,
    cleanContact: cleanContact, mergeContacts: mergeContacts, isCovered: isCovered, outreach: outreach,
    coverageBeat: coverageBeat, beatRow: beatRow, signals: signals,
  };
});
