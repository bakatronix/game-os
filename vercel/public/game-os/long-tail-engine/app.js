/* Long Tail Engine — page logic. The maths lives in model.js (window.TailModel).
 * Reads: public Steam data through /api/long-tail-engine (nothing stored), the game's daily Steam snapshots in the
 * ledger, and Page Engine's sale and update beats and regional split (read-only). Revenue the studio adds is kept in
 * this tool's state only; it never goes to the ledger. */
(function () {
  "use strict";
  var M = window.TailModel, PM = window.PageModel;
  var TOOL_ID = "long-tail-engine";
  var LS_KEY = "gos_long_tail_v1";
  var PE_LS_KEY = "gos_page_engine_v1";
  var ACCOUNT_URL = "/api/tool-state/" + TOOL_ID;
  var API = "/api/long-tail-engine";
  var MAX_MONTHS = 240;

  /* ---------------- State: per game, a release-date override, Boxleiter assumptions and revenue months ---------------- */
  function emptyGame() { return { release: null, box: { lo: M.BOX_DEFAULTS.lo, hi: M.BOX_DEFAULTS.hi, share: M.BOX_DEFAULTS.share }, months: [] }; }
  function emptyState() { return { games: {}, savedAt: 0 }; }
  function num0(x, d) { var n = Number(x); return isFinite(n) && n > 0 ? n : d; }
  function normalise(s) {
    if (!s || typeof s !== "object") return null;
    var b = emptyState();
    b.savedAt = Number(s.savedAt) || 0;
    Object.keys(s.games || {}).forEach(function (id) {
      var g = s.games[id] || {}, o = emptyGame();
      o.release = PM.isYmd(g.release) ? g.release : null;
      var bx = g.box || {};
      o.box = { lo: num0(bx.lo, M.BOX_DEFAULTS.lo), hi: num0(bx.hi, M.BOX_DEFAULTS.hi), share: Math.min(100, num0(bx.share, M.BOX_DEFAULTS.share)) };
      o.months = M.mergeMonths([], Array.isArray(g.months) ? g.months : []).slice(-MAX_MONTHS);
      b.games[String(id).slice(0, 64)] = o;
    });
    return b;
  }
  var S = (function () { try { return normalise(JSON.parse(localStorage.getItem(LS_KEY) || "null")); } catch (e) { return null; } })() || emptyState();
  function gid() { return window.GOS && GOS.game ? String(GOS.game.id) : "_none"; }
  function G() { var id = gid(); return S.games[id] || (S.games[id] = emptyGame()); }
  var saveTimer = null;
  function changed() { if (saveTimer) clearTimeout(saveTimer); saveTimer = setTimeout(persist, 300); }
  function persist() {
    S.savedAt = Date.now();
    try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) {}
    scheduleAccountSave();
  }

  /* ---------------- Formatting ---------------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function num(n) { return n == null || !isFinite(n) ? "—" : Math.round(n).toLocaleString("en-US"); }
  function one(x) { return x == null || !isFinite(x) ? "—" : (Math.round(x * 10) / 10).toFixed(1); }
  function two(x) { return x == null || !isFinite(x) ? "—" : (Math.round(x * 100) / 100).toFixed(2); }
  function pct(x) { return x == null || !isFinite(x) ? "—" : Math.round(x * 100) + "%"; }
  function money(x) {
    if (x == null || !isFinite(x)) return "—";
    var a = Math.abs(x), s = x < 0 ? "−$" : "$";
    if (a >= 1e6) return s + (a / 1e6).toFixed(a >= 1e7 ? 0 : 1) + "M";
    if (a >= 1e4) return s + Math.round(a / 1000) + "K";
    return s + Math.round(a).toLocaleString("en-US");
  }
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function dl(ymd) { if (!ymd) return "—"; var p = String(ymd).split("-"); return +p[2] + " " + MONTHS[+p[1] - 1] + " " + p[0]; }
  function ds(ymd) { var p = String(ymd).split("-"); return +p[2] + " " + MONTHS[+p[1] - 1]; }
  function ml(m) { var p = String(m).split("-"); return MONTHS[+p[1] - 1] + " " + p[0]; }
  function range(a, b) { return a === b ? dl(a) : (a.slice(0, 4) === b.slice(0, 4) ? ds(a) : dl(a)) + " – " + dl(b); }
  function half(h) { return '<span class="half ' + h + '">' + (h === "reach" ? "Reach" : "Resonance") + "</span>"; }
  function today() { var d = new Date(); return d.toISOString().slice(0, 10); } // UTC, like the snapshot cron and Steam's dates
  function plural(n, w) { return num(n) + " " + w + (Math.round(n) === 1 ? "" : "s"); }
  function track(name, props) { if (typeof window.gosTrack === "function") window.gosTrack(name, Object.assign({ tool_id: TOOL_ID }, props || {})); }
  function step(name, index, extra) { track("journey_step", Object.assign({ step_name: name, step_index: index }, extra || {})); }
  function getJ(url) { return fetch(url, { credentials: "same-origin" }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || "HTTP " + r.status); e.status = r.status; throw e; } return j; }); }); }

  var out = document.getElementById("out");
  var revCard = document.getElementById("revenue-card");
  var tip = document.getElementById("tip");
  var DATA = null, LEDGER = [], PE = { beats: [], regions: {}, wishlists: [] }, R = null, loadErr = null;
  var viewed = {}, beatViewed = {}, sentNote = "";

  /* ---------------- Main render ---------------- */
  function gate() {
    var g = window.GOS && GOS.game;
    if (!g) return '<section class="card answer"><h3>The answer</h3><p class="verdict">Pick or add your game in the bar above. Long Tail Engine reads a released game&rsquo;s Steam data.</p></section>';
    var id = Number(g.steamAppId);
    if (!(Number.isInteger(id) && id > 0)) return '<section class="card answer"><h3>The answer</h3><p class="verdict">' + esc(g.title) + " has no Steam App ID yet, so there&rsquo;s no Steam data to read.</p><p class=\"next\">Next: add the App ID in the game bar above. The daily Steam snapshot starts the next morning.</p></section>";
    return null;
  }

  function render() {
    var g = gate();
    if (g) { out.innerHTML = g; R = null; return; }
    if (loadErr) { out.innerHTML = '<section class="card answer"><h3>The answer</h3><p class="verdict">' + esc(loadErr) + "</p></section>"; return; }
    if (!DATA) { out.innerHTML = '<p class="loading">Reading Steam data&hellip;</p>'; return; }
    var d = DATA.details || {};
    if (d.comingSoon) { out.innerHTML = '<section class="card answer"><h3>The answer</h3><p class="verdict">Steam lists ' + esc(d.name || GOS.game.title) + " as coming soon. Long Tail Engine reads a game after release.</p><p class=\"next\">Next: before launch, <a href=\"/game-os/page-engine\">Page Engine</a> and <a href=\"/game-os/festival-radar\">Festival Radar</a> are the tools to use.</p></section>"; R = null; return; }
    var st = G();
    R = M.analyse({ hist: DATA.histogram, details: d, news: DATA.news, ledger: LEDGER, release: st.release, today: today(),
      pe: { beats: PE.beats, regionShare: PE.wishlists.length ? PM.regionShare(PE.regions, PM.lastDate(PE.wishlists)) : null },
      revenue: st.months, box: st.box });
    out.innerHTML = missingNote() + answer() + legsCard() + floorCard() + beatsCard() + regionalCard();
    wire();
    renderRevenue();
    var key = gid();
    if ((R.legs.status === "ok" || R.floor.status === "ok") && !viewed[key]) { viewed[key] = 1; step("tail_viewed", 1, { legs: R.legs.status === "ok", floor: R.floor.status === "ok" }); }
    if (R.beats.some(function (b) { return b.reviews.enough || b.players.enough; }) && !beatViewed[key]) { beatViewed[key] = 1; step("beat_reviewed", 2, { beats: R.beats.length }); }
  }

  var PART = { histogram: "the review histogram", details: "the store details (release date, price, languages)", news: "the developer announcements" };
  var WHYNOT = { "rate-limited": "Steam asked us to slow down", redirected: "Steam redirected the request", unreachable: "Steam didn't answer", "not-json": "Steam sent something other than data", empty: "Steam had nothing for this app" };
  function missingNote() {
    var m = (DATA && DATA.missing) || [];
    if (!m.length) return "";
    return '<div class="notice warn">Couldn&rsquo;t read ' + m.map(function (x) { return PART[x.part] + " (" + (WHYNOT[x.reason] || x.reason) + ")"; }).join("; ") + ". The page uses what did come back. We don&rsquo;t retry in a loop; reload in a few minutes to try again.</div>";
  }

  /* ---------------- The answer ---------------- */
  function legsLine(L) {
    if (L.status !== "ok") return null;
    var r = L.ratio;
    return "Reviews are arriving at <b>" + pct(r) + " of the launch pace</b> (" + one(L.last.rate) + " a day in the last 28 days against " + one(L.first.rate) + " a day after release; 95% bounds " + pct(L.lo) + " to " + pct(L.hi) + ").";
  }
  function floorLine(F) {
    if (F.status !== "ok") return null;
    return "Players at snapshot time are at <b>" + pct(F.ratio) + " of launch week</b> (median " + num(F.recent.median) + " over the last " + F.recent.n + " snapshots against " + num(F.launch.median) + " in launch week).";
  }
  function answer() {
    var lines = [], L = R.legs, F = R.floor;
    var l1 = legsLine(L), l2 = floorLine(F);
    if (l1) lines.push(l1 + " " + half("reach"));
    if (l2) lines.push(l2 + " " + half("resonance"));
    if (!l1 && !l2) lines.push(L.status === "too-young" ? "It&rsquo;s too early to read the tail: the game has been out " + plural(L.age, "day") + ", and legs needs " + M.MIN_AGE_DAYS + " so the first and last 28 days don&rsquo;t overlap." : "There isn&rsquo;t enough data to read the tail yet. Each section below says what it needs.");
    var rv = R.revenue, bx = R.box;
    if (rv.status === "ok" && rv.compare && rv.compare.ratio != null) lines.push("Your " + rv.field + " revenue in the last " + M.REVENUE_MONTHS + " full months averaged <b>" + money(rv.compare.last.avg) + " a month</b>, " + pct(rv.compare.ratio) + " of the first " + M.REVENUE_MONTHS + " (" + money(rv.compare.first.avg) + ").");
    else if (rv.status === "ok") lines.push("Your figures add up to <b>" + money(rv.total) + "</b> " + rv.field + " across " + plural(rv.months.length, "month") + ".");
    else if (bx.status === "ok") lines.push("Without your own revenue figures, a rough estimate from " + num(bx.reviews) + " reviews is <b>" + money(bx.lo) + " to " + money(bx.hi) + "</b> to date. That&rsquo;s a rule of thumb, not a measurement.");
    var risen = R.beats.filter(function (b) { return b.reviews.enough && b.reviews.verdict === "rise" && !b.overlaps.length; });
    var next;
    if (risen.length) {
      var b = risen[0];
      next = "Next: reviews rose after your " + esc(b.beat.type) + " on " + dl(b.beat.date) + " (associated with it, not proven to be caused by it). That&rsquo;s the kind of beat to plan again; log the next one in <a href=\"/game-os/page-engine\">Page Engine</a> so its effect can be read too.";
    } else if (R.beats.length) next = "Next: none of your logged updates or sales has a clear rise in reviews yet. Look at the table below; at indie volumes &ldquo;no clear change&rdquo; is common. Space beats apart so each one can be read on its own.";
    else next = "Next: log each update and sale in <a href=\"/game-os/page-engine\">Page Engine</a> as a beat. Then this page can show what happened to reviews and players around each one, which is how you find out what moves the tail.";
    if (L.status === "ok" && F.status !== "ok" && F.status === "no-launch") next += " The player floor needs launch-week snapshots, which this game doesn&rsquo;t have; it can still be read against later weeks once more snapshots build up.";
    var sigs = M.signals(R), game = window.GOS && GOS.game;
    var s = '<section class="card answer"><h3>The answer</h3>' + lines.map(function (l) { return '<p class="verdict">' + l + "</p>"; }).join("") + '<p class="next">' + next + "</p>";
    s += '<div class="actions"><button class="btn" id="btn-send" type="button"' + (sigs.length && game ? "" : " disabled") + ">Send to " + (game ? esc(game.title) : "your game") + "</button>" +
      '<button class="btn-ghost" id="btn-copy" type="button">Copy summary</button><span class="feedback" id="msg-send" role="status">' + esc(sentNote) + "</span></div>";
    if (!sigs.length) s += '<p class="note">Nothing to send until legs or the player floor has enough data.</p>';
    s += '<p class="method">These numbers describe what has happened. They don&rsquo;t say what the game will earn next; unusual games often break their own trend after an update, a sale or a port.</p>';
    return s + "</section>";
  }

  /* ---------------- Legs ---------------- */
  function legsCard() {
    var L = R.legs, s = '<section class="card"><h3>Legs: are reviews still coming? ' + half("reach") + "</h3>";
    s += '<div class="assumptions"><label class="inline-field">Release date<input id="in-release" type="date" max="' + today() + '" value="' + esc(R.release || "") + '"></label>' +
      (R.releaseOverridden ? '<button class="link-btn" id="btn-release-reset" type="button">Use Steam&rsquo;s date (' + dl(R.steamRelease) + ")</button>" : "") + "</div>";
    s += '<p class="note">' + (R.steamRelease ? "Steam lists the release as " + dl(R.steamRelease) + "." : "Steam&rsquo;s release date couldn&rsquo;t be read; enter it above.") +
      (DATA.details && DATA.details.earlyAccess ? " This game is in Early Access, so Steam&rsquo;s date is when Early Access began." : "") + " If the game left Early Access later, set the full release date to measure from it.</p>";
    if (L.status === "ok") {
      s += '<div class="kpis two"><div class="kpi hero"><div class="l">Legs ratio</div><div class="v">' + two(L.ratio) + '<small>last 28 days &divide; first</small></div><div class="s">95% bounds ' + two(L.lo) + " to " + two(L.hi) + "</div></div>" +
        '<div class="kpi"><div class="l">Reviews a day</div><div class="v">' + one(L.last.rate) + '<small>now</small></div><div class="s">' + one(L.first.rate) + " a day after release (" + num(L.first.count) + " reviews, " + range(L.first.from, L.first.to) + ")</div><div class=\"s\">Now: " + num(L.last.count) + " reviews, " + range(L.last.from, L.last.to) + "</div></div></div>";
    } else {
      var why = { "no-data": "Steam&rsquo;s review histogram didn&rsquo;t come back, so legs can&rsquo;t be read.",
        "too-young": "Too early to read: " + plural(L.age, "day") + " since release, and legs needs " + M.MIN_AGE_DAYS + ".",
        "no-first": "The histogram has no reviews from the first 28 days after " + dl(R.release) + ". Check the release date above.",
        "too-few": "Too few to read yet (n = " + num(L.first && L.first.count) + " reviews in the first window; needs " + M.MIN_FIRST_REVIEWS + ")." }[L.status] || "Not enough data yet.";
      s += '<p class="verdict">' + why + "</p>";
    }
    if (L.curve && L.curve.length) s += curveSvg(L) + '<div class="legend"><span><i class="curve"></i>Reviews a day, ' + (L.curve[0].type === "week" ? "by week" : "by month") + '</span><span><i class="first"></i>First window</span><span><i class="last"></i>Last 28 days</span><span><i class="up"></i>Update</span><span><i class="sale"></i>Sale</span></div>';
    s += '<p class="method">Method: reviews per day in the last 28 complete days (Steam&rsquo;s daily counts) divided by reviews per day in the first 28 days after release (Steam&rsquo;s ' + (L.rollupType === "month" ? "monthly totals: Steam only gives monthly totals for this game, so the first window is the whole first month or two, dates shown above" : "weekly totals, so the first window runs to the end of the fourth week") + "). Each rate has an exact 95% Poisson range; the bounds on the ratio pair the low end of one with the high end of the other, so they&rsquo;re wide on purpose. Minimum: " + M.MIN_FIRST_REVIEWS + " reviews in the first window and " + M.MIN_AGE_DAYS + " days since release. Source: <a href=\"" + M.HIST_SOURCE + (DATA.appid || "") + '" target="_blank" rel="noopener">Steam&rsquo;s review histogram</a>, the data behind the chart on the store page. It counts reviews that still exist, in every language.</p>';
    return s + "</section>";
  }

  function curveSvg(L) {
    var B = L.curve, W = 720, H = 210, P = { l: 38, r: 10, t: 14, b: 28 };
    var x0 = PM.isYmd(B[0].start) ? Date.parse(B[0].start) : 0, x1 = Date.parse(PM.addDays(B[B.length - 1].end, 1));
    var max = Math.max(L.last.rate, B.reduce(function (m, b) { return Math.max(m, b.perDay); }, 0)) || 1;
    var x = function (d) { return P.l + (Date.parse(d) - x0) / (x1 - x0) * (W - P.l - P.r); };
    var y = function (v) { return H - P.b - v / max * (H - P.t - P.b); };
    var s = '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Reviews a day since release">';
    [0, 0.5, 1].forEach(function (f) { var v = max * f; s += '<line class="grid" x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text x="' + (P.l - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + one(v) + "</text>"; });
    B.forEach(function (b) {
      var inFirst = L.first && b.start <= L.first.to && b.end >= L.first.from;
      var xa = x(b.start), xb = x(PM.addDays(b.end, 1));
      s += '<rect class="' + (inFirst ? "b-first" : "b-curve") + '" x="' + (xa + 0.5) + '" y="' + y(b.perDay) + '" width="' + Math.max(1, xb - xa - 1) + '" height="' + (H - P.b - y(b.perDay)) + '"><title>' + range(b.start, b.end) + ": " + num(b.count) + " reviews, " + one(b.perDay) + " a day</title></rect>";
    });
    if (L.last && Date.parse(L.last.from) >= x0) s += '<line class="l-last" x1="' + x(L.last.from) + '" x2="' + x(PM.addDays(L.last.to, 1)) + '" y1="' + y(L.last.rate) + '" y2="' + y(L.last.rate) + '"><title>Last 28 days: ' + one(L.last.rate) + " a day</title></line>";
    R.beats.forEach(function (bt) {
      var d = bt.beat.date; if (Date.parse(d) < x0 || Date.parse(d) > x1) return;
      s += '<line class="' + (bt.beat.type === "sale" ? "m-sale" : "m-up") + '" x1="' + x(d) + '" x2="' + x(d) + '" y1="' + P.t + '" y2="' + (H - P.b) + '"><title>' + esc(bt.beat.type + " " + dl(d) + (bt.beat.note ? ": " + bt.beat.note : "")) + "</title></line>";
    });
    var first = B[0].start, last = B[B.length - 1].end;
    s += '<line class="axis" x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + (H - P.b) + '" y2="' + (H - P.b) + '"/>';
    s += '<text x="' + P.l + '" y="' + (H - 8) + '">' + ml(first.slice(0, 7)) + '</text><text x="' + (W - P.r) + '" y="' + (H - 8) + '" text-anchor="end">' + ml(last.slice(0, 7)) + "</text>";
    return s + "</svg>";
  }

  /* ---------------- Player floor ---------------- */
  function floorCard() {
    var F = R.floor, s = '<section class="card"><h3>Player floor: are players staying? ' + half("resonance") + "</h3>";
    if (F.status === "ok") {
      s += '<div class="kpis two"><div class="kpi hero"><div class="l">Floor ratio</div><div class="v">' + two(F.ratio) + '<small>now &divide; launch week</small></div><div class="s">No range: each snapshot is a single reading, not a sample.</div></div>' +
        '<div class="kpi"><div class="l">Players at snapshot time</div><div class="v">' + num(F.recent.median) + '<small>median now</small></div><div class="s">Last ' + F.recent.n + " snapshots, " + range(F.recent.from, F.recent.to) + "</div><div class=\"s\">Launch week: median " + num(F.launch.median) + " over " + F.launch.n + " snapshots, " + range(F.launch.from, F.launch.to) + "</div></div></div>";
    } else {
      var why = {
        "no-release": "Needs a release date (above).",
        "too-young": "Too early to read: " + plural(F.age, "day") + " since release; the floor is read from day " + M.MIN_FLOOR_AGE_DAYS + " on.",
        "no-launch": "Game OS has " + (F.launch.n ? "only " + plural(F.launch.n, "snapshot") : "no snapshots") + " from launch week (" + range(F.launch.from, F.launch.to) + "); the floor needs " + F.min + ". " + (F.first ? "Snapshots for this game start on " + dl(F.first) + "." : "") + " Steam&rsquo;s public API gives only the player count right now, with no history, so launch week can&rsquo;t be filled in afterwards.",
        "few-recent": "Too few recent snapshots (" + F.recent.n + " since day " + M.MIN_FLOOR_AGE_DAYS + "; needs " + F.min + ").",
        "stale": "The newest snapshot is from " + dl(F.newest) + ". The daily snapshot may have stopped for this game; check that its Steam App ID is right.",
        "zero-launch": "The launch-week median is 0 players, so there&rsquo;s nothing to compare against.",
      }[F.status] || "Not enough data yet.";
      s += '<p class="verdict">' + why + "</p>";
    }
    s += '<p class="method">Method: the median of the last ' + M.RECENT_SNAPSHOTS + " daily snapshots (at least " + M.MIN_RECENT_SNAPSHOTS + ", the newest from the last " + M.MAX_SNAPSHOT_AGE_DAYS + " days) divided by the median of the snapshots in launch week (release day and the six days after; at least " + M.MIN_LAUNCH_SNAPSHOTS + "). Each snapshot is Steam&rsquo;s count of people playing at the moment the daily job runs (" + M.SNAPSHOT_TIME + "), not a daily peak, so it&rsquo;s labelled &ldquo;players at snapshot time&rdquo;. Source: the <code>steam_players</code> readings in your game&rsquo;s ledger.</p>";
    return s + "</section>";
  }

  /* ---------------- Around updates and sales ---------------- */
  function beatsCard() {
    var s = "<section class=\"card\"><h3>Around each update and sale</h3>";
    if (!R.beats.length) return s + '<p class="note">No updates or sales since release yet. Log them as beats in <a href="/game-os/page-engine">Page Engine</a> (type &ldquo;update&rdquo; or &ldquo;sale&rdquo;). Steam announcements tagged as patch notes are picked up on their own.</p></section>';
    s += '<div class="tbl-wrap"><table class="t beats"><thead><tr><th class="name">Beat</th><th>Reviews, 7 days from it</th><th>Players at snapshot time</th></tr></thead><tbody>';
    R.beats.slice(0, 24).forEach(function (b) {
      var bt = b.beat, rv = b.reviews, pl = b.players;
      var name = "<b>" + dl(bt.date) + "</b> " + esc(bt.type) + (bt.channel ? " (" + esc(bt.channel) + ")" : "") + (bt.note ? '<div class="s">' + (bt.url ? '<a href="' + esc(bt.url) + '" target="_blank" rel="noopener">' + esc(bt.note) + "</a>" : esc(bt.note)) + "</div>" : "") +
        '<div class="s">' + (bt.from === "steam" ? "From Steam patch notes" : "From Page Engine") + "</div>";
      var rr = rv.enough ? (rv.verdict === "rise" ? '<span class="badge good">Rose</span> ' : rv.verdict === "fall" ? '<span class="badge bad">Fell</span> ' : '<span class="badge warn">No clear change</span> ') +
          num(rv.after) + " vs " + one(rv.expected) + ' expected <span class="range">(95% range ' + one(rv.lo) + "–" + one(rv.hi) + ")</span>"
        : '<span class="muted">' + (rv.few ? "Too few reviews to read (needs " + M.MIN_BEAT_REVIEWS + " across both windows)" : "Needs daily review counts on " + PM.MIN_BASELINE_DAYS + " of the 14 days before and all 7 days from it (" + rv.beforeDays + " and " + rv.afterDays + ")") + "</span>";
      var pr = pl.enough ? num(pl.medBefore) + " &rarr; " + num(pl.medAfter) + (pl.change != null ? ' <span class="range">(' + (pl.change >= 0 ? "+" : "&minus;") + Math.round(Math.abs(pl.change) * 100) + "%, median)</span>" : "")
        : '<span class="muted">Needs snapshots on ' + M.MIN_PLAYER_BEFORE + " of the 14 days before and " + M.MIN_PLAYER_AFTER + " of the 7 from it (" + pl.before + " and " + pl.after + ")</span>";
      s += '<tr><td class="name">' + name + '</td><td class="read" data-l="Reviews">' + rr + (b.overlaps.length ? '<div class="s">Overlaps ' + b.overlaps.map(function (o) { return esc(o.label) + " on " + dl(o.date); }).join(", ") + ", so they can&rsquo;t be separated.</div>" : "") + '</td><td class="read" data-l="Players">' + pr + "</td></tr>";
    });
    s += "</tbody></table></div>";
    var src = R.reviewSource || {}, hasLedger = Object.keys(src).some(function (k) { return src[k] === "ledger"; });
    s += '<p class="method">Method (Page Engine&rsquo;s beat method): reviews on the beat day and the six days after, against seven times the median day in the 14 days before, with an exact 95% Poisson range on the seven-day count. &ldquo;Rose&rdquo; or &ldquo;fell&rdquo; only when the expected count sits outside that range. Players compare the median snapshot in the same windows, without a range. Results are &ldquo;associated with&rdquo; a beat, never proof it caused them. Daily reviews come from Steam&rsquo;s exact counts for the last 30 days' + (hasLedger ? ", and before that from the day-to-day change in the review total in your snapshots (a deleted review can hide a new one)" : "") + ".</p>";
    return s + "</section>";
  }

  /* ---------------- Regional ---------------- */
  function regionalCard() {
    var G2 = R.regional, s = "<section class=\"card\"><h3>Regions and languages</h3>";
    if (G2.status === "none") return s + '<p class="note">Needs wishlist adds by region from <a href="/game-os/page-engine">Page Engine</a> (a wishlist export with a region column).</p></section>';
    if (G2.status === "no-languages") return s + '<p class="note">Steam&rsquo;s list of supported languages didn&rsquo;t come back, so regions can&rsquo;t be checked against it.</p></section>';
    if (G2.questions.length) {
      s += '<p class="verdict">Questions worth looking into:</p><ul class="q-list">' + G2.questions.map(function (q) {
        return "<li><b>" + esc(q.region) + "</b> gave " + pct(q.w.p) + ' of wishlist adds <span class="range">(95% range ' + pct(q.w.lo) + "–" + pct(q.w.hi) + ", " + num(q.count) + " adds)</span>, and the game doesn&rsquo;t list " + esc(q.language) + ". Would a translation of the store page, or of the game, serve these players?</li>";
      }).join("") + "</ul>";
    } else s += '<p class="verdict">Every region with ' + pct(M.MIN_REGION_SHARE) + " or more of your wishlist adds speaks a language the game already lists.</p>";
    if (G2.unmatched.length) s += '<p class="note">Not matched to one language: ' + G2.unmatched.map(function (r) { return esc(r.region) + " (" + pct(r.w.p) + ")"; }).join(", ") + ". These are regions or countries with several main languages, so the page doesn&rsquo;t guess.</p>";
    s += '<p class="method">Method: regions with at least ' + pct(M.MIN_REGION_SHARE) + " of wishlist adds from " + dl(G2.start) + " to " + dl(G2.end) + " (n = " + num(G2.n) + ", Wilson 95% ranges), from Page Engine, checked against the languages on the game&rsquo;s Steam page. Each country maps to its main language as Steam names it. No dollar figures: there&rsquo;s no sourced figure for what a translation earns.</p>";
    return s + "</section>";
  }

  /* ---------------- Wiring ---------------- */
  function wire() {
    var rel = document.getElementById("in-release");
    if (rel) rel.addEventListener("change", function () {
      var v = rel.value;
      G().release = PM.isYmd(v) && v !== R.steamRelease ? v : null; sentNote = ""; changed(); render();
    });
    var rr = document.getElementById("btn-release-reset");
    if (rr) rr.addEventListener("click", function () { G().release = null; sentNote = ""; changed(); render(); });
    var send = document.getElementById("btn-send");
    if (send) send.addEventListener("click", function () {
      var sigs = M.signals(R), m = document.getElementById("msg-send");
      if (!sigs.length || !window.GOS || !GOS.game) return;
      send.disabled = true; m.className = "feedback"; m.textContent = "Sending to " + GOS.game.title + "…";
      GOS.recordSignals(TOOL_ID, sigs).then(function () {
        sentNote = "Sent " + plural(sigs.length, "signal") + " to " + GOS.game.title + ".";
        var m2 = document.getElementById("msg-send"); if (m2) m2.textContent = sentNote;
        track("output_action", { action: "send_signals", count: sigs.length });
        step("result_actioned", 3, { action: "send_to_game" });
      }).catch(function (e) { send.disabled = false; m.className = "feedback err"; m.textContent = "Couldn't send: " + e.message; });
    });
    var copy = document.getElementById("btn-copy");
    if (copy) copy.addEventListener("click", function () {
      var tmp = document.createElement("div"), parts = [];
      tmp.innerHTML = document.querySelector(".answer").innerHTML;
      tmp.querySelectorAll(".verdict, .next").forEach(function (p) { parts.push(p.textContent.replace(/\s+/g, " ").trim()); });
      var text = (GOS.game ? GOS.game.title + ", long tail (" + dl(today()) + ")\n\n" : "") + parts.join("\n\n");
      var m = document.getElementById("msg-send");
      (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () {
        m.className = "feedback"; m.textContent = "Copied.";
        track("output_action", { action: "copy" });
        step("result_actioned", 3, { action: "copy" });
      }, function () { m.className = "feedback err"; m.textContent = "Couldn't copy here; select the text instead."; });
    });
  }

  /* ---------------- Revenue ---------------- */
  var csv = null;   // { name, rows, header, map, order } while mapping an upload
  function renderRevenue() {
    var st = G(), rv = R ? R.revenue : M.revenue(st.months, null, today()), bx = R ? R.box : null;
    var s = "<h3>Revenue</h3>";
    if (rv.status === "ok") {
      s += '<p class="note">From your own figures (' + (rv.csv ? "Steamworks export" : "entered by hand") + "), in " + rv.field + " revenue" + (rv.field === "gross" ? " because not every month has a net figure" : "") + ". Kept in this tool only: revenue isn&rsquo;t sent to the ledger.</p>";
      if (rv.compare) s += '<p class="verdict">Last ' + M.REVENUE_MONTHS + " full months (" + ml(rv.compare.last.from) + " – " + ml(rv.compare.last.to) + "): <b>" + money(rv.compare.last.avg) + "</b> a month, " + pct(rv.compare.ratio) + " of the first " + M.REVENUE_MONTHS + " full months (" + money(rv.compare.first.avg) + ").</p>";
      else s += '<p class="note">Comparing the first and last ' + M.REVENUE_MONTHS + " full months needs " + rv.need + " full months after the release month (" + rv.full + " so far).</p>";
      s += monthsSvg(rv);
    } else if (bx && bx.status === "ok") {
      s += '<div class="kpis two"><div class="kpi hero"><div class="l">Estimated revenue to date</div><div class="v">' + money(bx.lo) + " – " + money(bx.hi) + '</div><div class="s">An estimate, not a measurement. Add your own figures below to replace it.</div></div>' +
        '<div class="kpi"><div class="l">Built from</div><div class="s">' + num(bx.reviews) + " reviews &times; " + num(bx.mult.lo) + "–" + num(bx.mult.hi) + " copies per review &times; $" + bx.price.toFixed(2) + " list price &times; " + bx.share + "% of list price received</div><div class=\"s\">" + num(bx.unitsLo) + "–" + num(bx.unitsHi) + " copies</div></div></div>";
    } else if (bx) {
      s += '<p class="note">' + ({ free: "The game is free on Steam, so a reviews-based sales estimate doesn&rsquo;t apply.", "no-price": "Steam didn&rsquo;t give a US list price, so there&rsquo;s no estimate. Add your own figures below.", "no-reviews": "No review count yet, so there&rsquo;s no estimate.", "no-assumptions": "Set both multipliers and the price share to see an estimate." }[bx.status] || "") + "</p>";
    }
    if (rv.status !== "ok" && bx && bx.status !== "free") {
      s += '<div class="assumptions"><label class="inline-field">Copies per review, low<input id="in-lo" type="number" min="1" max="200" step="1" value="' + st.box.lo + '"></label>' +
        '<label class="inline-field">Copies per review, high<input id="in-hi" type="number" min="1" max="200" step="1" value="' + st.box.hi + '"></label>' +
        '<label class="inline-field">Share of list price, %<input id="in-share" type="number" min="1" max="100" step="1" value="' + st.box.share + '"></label></div>';
      s += '<p class="method">Method: the Boxleiter rule of thumb, through Market Scope&rsquo;s model: reviews &times; copies per review &times; US list price &times; the share of list price you actually receive after discounts, refunds and Steam&rsquo;s cut. Starts at ' + M.BOX_DEFAULTS.lo + " and " + M.BOX_DEFAULTS.hi + " copies per review at " + M.BOX_DEFAULTS.share + "%, which are assumptions to edit, not measurements (Market Scope uses 30 and 65%). The ratio varies a lot between games, which is why it&rsquo;s a range.</p>";
    }
    s += "<h4>Add your figures</h4>";
    s += '<div class="file-row"><input id="in-csv" type="file" accept=".csv,text/csv,text/plain"><span class="note">Upload the sales CSV you export from Steamworks. It&rsquo;s read in your browser; only the monthly totals are saved.</span></div>';
    if (csv) s += mappingHtml();
    s += '<form id="f-month" class="form" style="margin-top:12px"><label>Month<input name="month" type="month" max="' + today().slice(0, 7) + '" required></label><label>Gross revenue, $<input name="gross" type="number" min="0" step="0.01"></label><label>Net revenue, $<input name="net" type="number" min="0" step="0.01"></label><label><button class="btn-ghost" type="submit">Add month</button></label></form>';
    s += '<span class="feedback" id="msg-rev" role="status"></span>';
    if (st.months.length) {
      s += '<details class="more"><summary>Your months (' + st.months.length + ")</summary><ul class=\"log-list\">" + st.months.slice().reverse().map(function (m) {
        return '<li><span class="d">' + ml(m.month) + '</span><span class="t">Gross ' + money(m.gross) + " &middot; Net " + money(m.net) + ' <span class="range">' + (m.src === "csv" ? "export" : "typed") + '</span></span><span class="x"><button class="btn-small" type="button" data-del="' + m.month + '">Delete</button></span></li>';
      }).join("") + "</ul></details>";
    }
    revCard.innerHTML = s;
    wireRevenue();
  }

  function monthsSvg(rv) {
    var list = rv.months, W = 720, H = 180, P = { l: 52, r: 10, t: 12, b: 26 }, f = rv.field;
    var max = list.reduce(function (m, x) { return Math.max(m, x[f] || 0); }, 0) || 1, bw = (W - P.l - P.r) / list.length;
    var y = function (v) { return H - P.b - Math.max(0, v) / max * (H - P.t - P.b); };
    var s = '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Revenue by month">';
    [0, 0.5, 1].forEach(function (k) { s += '<line class="grid" x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + y(max * k) + '" y2="' + y(max * k) + '"/><text x="' + (P.l - 6) + '" y="' + (y(max * k) + 4) + '" text-anchor="end">' + money(max * k) + "</text>"; });
    list.forEach(function (m, i) { var v = m[f] || 0; s += '<rect class="b-curve" x="' + (P.l + i * bw + 1) + '" y="' + y(v) + '" width="' + Math.max(1, bw - 2) + '" height="' + (H - P.b - y(v)) + '"><title>' + ml(m.month) + ": " + money(m[f]) + "</title></rect>"; });
    s += '<text x="' + P.l + '" y="' + (H - 6) + '">' + ml(list[0].month) + '</text>' + (list.length > 1 ? '<text x="' + (W - P.r) + '" y="' + (H - 6) + '" text-anchor="end">' + ml(list[list.length - 1].month) + "</text>" : "");
    return s + "</svg>";
  }

  function mappingHtml() {
    var h = csv.rows[csv.header] || [];
    var opt = function (field, label, req) {
      return "<label>" + label + '<select data-map="' + field + '"><option value="">' + (req ? "Pick a column" : "None") + "</option>" + h.map(function (c, i) { return '<option value="' + i + '"' + (csv.map[field] === i ? " selected" : "") + ">" + esc(c || "Column " + (i + 1)) + "</option>"; }).join("") + "</select></label>";
    };
    var s = '<div class="notice warn" style="margin-top:10px"><b>' + esc(csv.name) + "</b>: pick which column holds each figure. We haven&rsquo;t seen a Steamworks sales export yet, so the page doesn&rsquo;t guess column names.</div>";
    s += '<div class="map">' + opt("date", "Date or month", true) + opt("gross", "Gross revenue", false) + opt("net", "Net revenue", false) +
      '<label>Date order<select data-order><option value="ymd"' + (csv.order === "ymd" ? " selected" : "") + ">Year first / month names</option><option value=\"dmy\"" + (csv.order === "dmy" ? " selected" : "") + ">Day/month/year</option><option value=\"mdy\"" + (csv.order === "mdy" ? " selected" : "") + ">Month/day/year</option></select></label></div>";
    s += '<div class="tbl-wrap"><table class="t preview"><thead><tr>' + h.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      csv.rows.slice(csv.header + 1, csv.header + 4).map(function (r) { return "<tr>" + h.map(function (_, i) { return "<td>" + esc(r[i] || "") + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>";
    s += '<div class="actions"><button class="btn" id="btn-import" type="button">Import months</button><button class="btn-ghost" id="btn-cancel-csv" type="button">Cancel</button></div>';
    return s;
  }

  function wireRevenue() {
    var m = document.getElementById("msg-rev");
    var say = function (t, err) { m.className = "feedback" + (err ? " err" : ""); m.textContent = t; };
    ["lo", "hi", "share"].forEach(function (k) {
      var el = document.getElementById("in-" + k);
      if (el) el.addEventListener("change", function () { var v = Number(el.value); if (v > 0 && v <= (k === "share" ? 100 : 200)) { G().box[k] = v; changed(); render(); } });
    });
    var file = document.getElementById("in-csv");
    file.addEventListener("change", function () {
      var f = file.files && file.files[0];
      if (!f) return;
      if (f.size > 5 * 1024 * 1024) return say("That file is over 5 MB; export a shorter period.", true);
      f.text().then(function (text) {
        var P = PM.parseCsv(text), hi = PM.findHeader(P.rows);
        if (P.rows.length < hi + 2) return say("Couldn't find any rows in that file.", true);
        var hdr = P.rows[hi], g = PM.guessDateOrder(P.rows.slice(hi + 1, hi + 60).map(function (r) { return r[0]; }));
        csv = { name: f.name, rows: P.rows, header: hi, map: {}, order: g === "dmy" || g === "mdy" ? g : "ymd" };
        hdr.forEach(function (c, i) { var l = String(c).toLowerCase(); if (csv.map.date == null && /^(date|day|month|period)/.test(l)) csv.map.date = i; });
        renderRevenue();
      }).catch(function () { say("Couldn't read that file.", true); });
    });
    revCard.querySelectorAll("[data-map]").forEach(function (sel) { sel.addEventListener("change", function () { csv.map[sel.getAttribute("data-map")] = sel.value === "" ? null : Number(sel.value); }); });
    var ord = revCard.querySelector("[data-order]"); if (ord) ord.addEventListener("change", function () { csv.order = ord.value; });
    var imp = document.getElementById("btn-import");
    if (imp) imp.addEventListener("click", function () {
      if (csv.map.date == null) return say("Pick the date column.", true);
      if (csv.map.gross == null && csv.map.net == null) return say("Pick a gross or a net revenue column.", true);
      var res = M.revenueFromCsv(csv.rows, csv.header, csv.map, csv.order);
      if (!res.months.length) return say("No rows could be read with those columns.", true);
      G().months = M.mergeMonths(G().months, res.months).slice(-MAX_MONTHS); changed();
      csv = null;
      render(); renderRevenue();
      say("Imported " + plural(res.months.length, "month") + (res.skipped ? "; skipped " + plural(res.skipped, "row") + " without a date or figure" : "") + ".");
    });
    var cancel = document.getElementById("btn-cancel-csv"); if (cancel) cancel.addEventListener("click", function () { csv = null; renderRevenue(); });
    document.getElementById("f-month").addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(e.target), row = M.cleanMonth({ month: String(fd.get("month") || ""), gross: fd.get("gross") === "" ? null : Number(fd.get("gross")), net: fd.get("net") === "" ? null : Number(fd.get("net")), src: "form" });
      if (!row) return say("Enter a month and at least one figure.", true);
      G().months = M.mergeMonths(G().months, [row]).slice(-MAX_MONTHS); changed();
      render(); renderRevenue(); say("Saved " + ml(row.month) + ".");
    });
    revCard.querySelectorAll("[data-del]").forEach(function (b) {
      b.addEventListener("click", function () { var k = b.getAttribute("data-del"); G().months = G().months.filter(function (x) { return x.month !== k; }); changed(); render(); renderRevenue(); });
    });
  }

  /* ---------------- Loading ---------------- */
  function pickPE(st, id) {
    var g = st && st.games && st.games[id];
    if (!g) return null;
    var rows = function (list) { return (Array.isArray(list) ? list : []).filter(function (r) { return r && PM.isYmd(r.from) && PM.isYmd(r.to); }); };
    return { wishlists: rows(g.wishlists), regions: g.regions && typeof g.regions === "object" ? g.regions : {},
      beats: (g.beats || []).map(function (b) { return PM.cleanBeat(b); }).filter(Boolean) };
  }
  var loadSeq = 0;
  function load() {
    var seq = ++loadSeq;
    DATA = null; LEDGER = []; loadErr = null; PE = { beats: [], regions: {}, wishlists: [] };
    if (gate()) { render(); return; }
    render();
    var id = gid(), game = GOS.game, local = null;
    try { local = JSON.parse(localStorage.getItem(PE_LS_KEY) || "null"); } catch (e) {}
    PE = pickPE(local, id) || PE;
    var steam = getJ(API + "?appid=" + encodeURIComponent(game.steamAppId)).catch(function (e) {
      if (e.status === 429) throw new Error("Too many requests from this account in the last minute. Try again shortly.");
      if (e.status === 401) throw new Error("Sign in to Game OS to read Steam data here.");
      throw new Error("Couldn't reach Game OS's Steam reader. Try again in a minute.");
    });
    // Two years of ledger rows: launch week for the player floor, and beats logged by teammates.
    var ledger = getJ("/api/games/" + encodeURIComponent(game.id) + "/signals?all=1&days=730").catch(function () { return { rows: [] }; });
    var peState = accountUser ? getJ("/api/tool-state/page-engine").catch(function () { return null; }) : Promise.resolve(null);
    Promise.all([steam, ledger, peState]).then(function (res) {
      if (seq !== loadSeq) return;
      DATA = res[0];
      LEDGER = (res[1] && res[1].rows) || [];
      var st = res[2] && res[2].state;
      if (st && (!local || (Number(st.savedAt) || 0) > (Number(local.savedAt) || 0))) { var p = pickPE(st, id); if (p) PE = p; }
      var logs = PM.logsFromLedger(LEDGER.filter(function (r) { return r.key === "beat"; }));
      PE.beats = PM.mergeLog(PE.beats, logs.beats);
      render();
    }).catch(function (e) { if (seq !== loadSeq) return; loadErr = e.message; render(); renderRevenue(); });
  }

  /* ---------------- About ---------------- */
  function about() {
    var items = [
      "<b>Steam data</b> (the review histogram, release date, list price, supported languages and patch-note dates) comes from Steam&rsquo;s public, keyless endpoints through Game OS, for signed-in users only. Game OS caches it for a few hours and stores none of it.",
      "<b>Players and review totals</b> come from the daily Steam snapshot in your game&rsquo;s ledger (" + M.SNAPSHOT_TIME + "). Snapshots start when the game is added to Game OS with its App ID, and Steam has no public player history, so earlier days can&rsquo;t be filled in.",
      "<b>Updates and sales</b> are the beats you log in <a href=\"/game-os/page-engine\">Page Engine</a>, plus Steam announcements tagged as patch notes. Long Tail Engine only reads them.",
      "<b>Revenue</b> is what you upload or type here. It stays in this tool, saved to your account, and isn&rsquo;t written to the ledger. Without it, the page shows a reviews-based estimate as a range, labelled as an estimate.",
      "<b>What&rsquo;s sent to your game:</b> the legs ratio (Reach) and the player floor ratio (Resonance), each with its window, sample size and method, only when each has enough data.",
      "<b>No outside benchmarks:</b> there&rsquo;s no pool of other studios&rsquo; tails yet, so the game is compared only with its own launch.",
    ];
    document.getElementById("about-list").innerHTML = items.map(function (x) { return "<li>" + x + "</li>"; }).join("");
  }

  /* ---------------- Account sync ---------------- */
  var accountReady = false, accountUser = false, accountTimer = null;
  function status(text, kind) {
    var el = document.getElementById("save-status");
    if (!el) { el = document.createElement("span"); el.id = "save-status"; el.setAttribute("role", "status"); document.querySelector(".toolbar").appendChild(el); }
    el.className = "save-status " + (kind || ""); el.textContent = text;
  }
  function scheduleAccountSave() {
    if (!accountReady || !accountUser) return;
    if (accountTimer) clearTimeout(accountTimer);
    accountTimer = setTimeout(function () { accountTimer = null; saveToAccount(); }, 2000);
  }
  function saveToAccount(keepalive) {
    fetch(ACCOUNT_URL, { method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state: S }), keepalive: !!keepalive })
      .then(function (r) { if (r.status === 413) throw new Error("too large"); if (!r.ok) throw new Error(r.status); status("Saved to your account", "ok"); })
      .catch(function (e) { status(e.message === "too large" ? "Too much to save to your account; delete older months" : "Couldn't save to your account; your figures are still in this browser", "error"); });
  }
  function initAccount() {
    if (!window.GOS || !GOS.ready) return Promise.resolve();
    return GOS.ready.then(function () {
      accountUser = !!GOS.user;
      if (!accountUser) { status("Not signed in: saved in this browser only", "error"); return; }
      return fetch(ACCOUNT_URL, { credentials: "same-origin" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
        var server = j && j.state ? normalise(j.state) : null;
        if (server && (server.savedAt || 0) > (S.savedAt || 0) + 1000) {
          S = server;
          try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) {}
        }
        accountReady = true;
      });
    }).catch(function () {});
  }
  window.addEventListener("pagehide", function () { if (accountReady && accountTimer) { clearTimeout(accountTimer); saveToAccount(true); } });

  /* ---------------- Boot ---------------- */
  document.getElementById("btn-print").addEventListener("click", function () { window.print(); });
  about();
  if (window.GOS && GOS.mountBar) GOS.mountBar("#gameBar", { toolId: TOOL_ID });
  var booted = false, lastGame = null;
  initAccount().then(start, start);
  function start() {
    booted = true; lastGame = gid(); lastAppId = window.GOS && GOS.game ? String(GOS.game.steamAppId || "") : "";
    renderRevenue();
    load();
  }
  if (window.GOS && GOS.onChange) {
    GOS.onChange(function () {
      if (!booted) return;
      var id = gid(), appid = window.GOS && GOS.game ? String(GOS.game.steamAppId || "") : "";
      if (id === lastGame && appid === lastAppId) { render(); return; }
      lastGame = id; lastAppId = appid; sentNote = ""; csv = null;
      renderRevenue(); load();
    });
  }
  var lastAppId = "";
})();
