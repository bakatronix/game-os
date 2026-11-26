/* Demo Command — page logic. The maths lives in model.js (window.DemoModel). Data is studio-submitted: the demo's
 * Steamworks numbers as a CSV parsed in this browser (the raw file is never uploaded or kept) or typed into a form.
 * Full-game wishlist adds are read, never written, from Page Engine's saved daily table for the same game. */
(function () {
  "use strict";
  var M = window.DemoModel, PM = window.PageModel, WM = window.WindowModel;
  var TOOL_ID = "demo-command";
  var LS_KEY = "gos_demo_command_v1";
  var PE_LS_KEY = "gos_page_engine_v1";
  var ACCOUNT_URL = "/api/tool-state/" + TOOL_ID;
  var MAX_ROWS = 1500;     // about four years of daily rows per game, far under the 512 KB tool-state limit
  var CHART_DAYS = 90;

  /* ---------------- State: per game, only the derived daily demo table ---------------- */
  function emptyGame() { return { demo: [] }; }
  function emptyState() { return { games: {}, savedAt: 0 }; }
  function cleanRows(list) {
    return (Array.isArray(list) ? list : []).filter(function (r) { return r && PM.isYmd(r.from) && PM.isYmd(r.to) && r.from <= r.to; }).map(function (r) {
      var o = { from: r.from, to: r.to, src: r.src === "csv" ? "csv" : "form" };
      M.DEMO_FIELDS.forEach(function (f) { if (typeof r[f] === "number" && isFinite(r[f]) && r[f] >= 0) o[f] = r[f]; });
      return o;
    }).slice(-MAX_ROWS);
  }
  function normalise(s) {
    if (!s || typeof s !== "object") return null;
    var b = emptyState();
    b.savedAt = Number(s.savedAt) || 0;
    Object.keys(s.games || {}).forEach(function (id) {
      var g = s.games[id] || {}, o = emptyGame();
      o.demo = cleanRows(g.demo);
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
  function one(x) { return x == null || !isFinite(x) ? "—" : x < 10 ? x.toFixed(1) : Math.round(x).toLocaleString("en-US"); }
  function pc(p) { return p == null || !isFinite(p) ? "—" : (p * 100).toFixed(1) + "%"; }
  function mins(m) { if (m == null || !isFinite(m)) return "—"; if (m < 90) return one(m) + " min"; var h = Math.floor(m / 60), r = Math.round(m - h * 60); return h + " h " + r + " min"; }
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function dl(ymd) { if (!ymd) return "—"; var p = String(ymd).split("-"); return +p[2] + " " + MONTHS[+p[1] - 1] + " " + p[0]; }
  function ds(ymd) { var p = String(ymd).split("-"); return +p[2] + " " + MONTHS[+p[1] - 1]; }
  function range(a, b) { return a === b ? dl(a) : ds(a) + " – " + dl(b); }
  function half(h) { return '<span class="half ' + h + '">' + (h === "reach" ? "Reach" : "Resonance") + "</span>"; }
  function today() { var d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function plural(n, w) { return num(n) + " " + w + (Math.round(n) === 1 ? "" : "s"); }
  function chg(c) { return c === "up" ? " &uarr; up" : c === "down" ? " &darr; down" : c === "flat" ? " no clear change" : ""; }
  function track(name, props) { if (typeof window.gosTrack === "function") window.gosTrack(name, Object.assign({ tool_id: TOOL_ID }, props || {})); }
  function step(name, index, extra) { track("journey_step", Object.assign({ step_name: name, step_index: index }, extra || {})); }
  function srcLabel(w) { return w && w.csv ? "Steamworks export" : "typed in"; }
  function tooFew(text) { return '<div class="s">Too few to read yet (' + text + ")</div>"; }

  var out = document.getElementById("out");
  var dataCard = document.getElementById("data-card");
  var pageWishlists = [];   // Page Engine's daily wishlist table for this game (read-only)
  var R = null;
  var viewed = false;
  var sentNote = "";        // survives the re-render that follows a send (the ledger refresh redraws the page)

  function analyse() { return M.analyse({ demo: G().demo, wishlists: pageWishlists }); }

  /* ---------------- Render: results ---------------- */
  function render() {
    R = analyse();
    if (R.empty) {
      out.innerHTML = '<section class="card answer"><h3>The answer</h3><p class="verdict">No demo numbers yet. Add your demo&rsquo;s player numbers below, from a Steamworks CSV or typed in by hand.</p>' +
        '<p class="next">Next: in Steamworks, open the reports for your demo&rsquo;s own App ID and export its daily players, or note how many new players it had this week.' +
        (R.wishEmpty ? " Then import the full game&rsquo;s daily wishlists in <a href=\"/game-os/page-engine\">Page Engine</a>, so the two can be read together." : "") + "</p></section>";
      return;
    }
    out.innerHTML = answer() + kpiCard() + chartCard() + festCard() + sendCard();
    wireResults();
    if (!viewed) { viewed = true; step("demo_viewed", 2, { end: R.end }); }
  }

  var RATIO_WHY = {
    players_days: function (r) { return "demo players on " + r.players.covered + " of 28 days; needs " + Math.ceil(28 * M.MIN_COVERAGE); },
    adds_days: function (r) { return "full-game wishlist adds on " + r.adds.covered + " of 28 days; needs " + Math.ceil(28 * M.MIN_COVERAGE) + ", from Page Engine"; },
    players_few: function (r) { return "n = " + num(r.players.count) + " demo players; needs " + M.MIN_PLAYERS; },
    adds_few: function (r) { return "n = " + num(r.adds.count) + " wishlist adds; needs " + M.MIN_ADDS; },
  };

  /** A Next Fest edition overlapping the current 28 days or the 28 before them, if any. */
  function festInBefore() {
    var e = R.end, s = PM.addDays(e, -(2 * M.WINDOW_DAYS - 1));
    return M.nextFests().filter(function (f) { return f.start <= e && f.end >= s; })[0] || null;
  }
  function upcomingFest() {
    var t = today();
    return M.nextFests().filter(function (f) { return f.start >= t; })[0] || null;
  }

  function answer() {
    var lines = [], P = R.players, r = R.ratio, a = R.attr, pt = R.playtime;
    if (P.enough) lines.push("Your demo had <b>" + num(P.now.count) + " new players</b> in the 28 days to " + dl(R.end) + " (" + num(P.now.lo) + "–" + num(P.now.hi) + ")." +
      (P.change === "up" ? " That&rsquo;s up on the 28 days before, beyond chance." : P.change === "down" ? " That&rsquo;s down on the 28 days before, beyond chance." : P.change === "flat" ? " No clear change on the 28 days before." : ""));
    else lines.push("Your demo numbers cover only " + P.now.w.covered + " of the 28 days to " + dl(R.end) + ". It needs at least " + Math.ceil(28 * M.MIN_COVERAGE) + " to read.");
    if (r.enough) lines.push("The full game gained <b>" + one(r.value) + " wishlists per 100 demo players</b> over the same days (" + one(r.lo) + "–" + one(r.hi) + "; " + num(r.adds.count) + " adds, " + num(r.players.count) + " demo players)." +
      (R.ratioChange === "up" ? " That&rsquo;s up on the 28 days before, beyond chance." : R.ratioChange === "down" ? " That&rsquo;s down on the 28 days before, beyond chance." : R.ratioChange === "flat" ? " No clear change on the 28 days before." : "") +
      " Not every one of those wishlists came from a demo player, so this is a ratio, not a conversion rate.");
    else if (r.reason === "adds_days") lines.push(R.wishEmpty ? "Wishlists per demo player needs the full game&rsquo;s daily wishlist adds, which you import in Page Engine. None for this game yet." : "Page Engine&rsquo;s wishlist adds don&rsquo;t cover enough of the same 28 days" + (R.wishEnd ? " (they end on " + dl(R.wishEnd) + ")" : "") + ", so wishlists per demo player can&rsquo;t be read yet.");
    else if (r.reason) lines.push("Too few to read wishlists per demo player yet (" + RATIO_WHY[r.reason](r) + ").");
    if (a.enough) lines.push("Steam attributes <b>" + pc(a.w.p) + "</b> of demo players as wishlisting the full game (" + pc(a.w.lo) + "–" + pc(a.w.hi) + ")." +
      (R.attrChange === "up" ? " Up on the 28 days before." : R.attrChange === "down" ? " Down on the 28 days before." : ""));
    if (pt.enough) lines.push("Median demo playtime was <b>" + mins(pt.value) + "</b>" + (pt.exact ? ", as reported." : " (the middle of the reported daily medians, weighted by players).") +
      (R.playtimeBefore.enough ? " The 28 days before: " + mins(R.playtimeBefore.value) + "." : ""));

    var fb = festInBefore(), nf = upcomingFest(), next;
    if (fb) lines.push(esc(fb.name) + " (" + range(fb.start, fb.end) + ") falls inside the 56 days being compared, so the comparison mixes fest days with ordinary ones. The fest is read on its own below.");
    var ratioDown = R.ratioChange === "down" || R.attrChange === "down", playersDown = P.change === "down";
    if (R.wishEmpty) next = "Next: import the full game&rsquo;s daily wishlists in <a href=\"/game-os/page-engine\">Page Engine</a>. Without them this page can count demo players but can&rsquo;t say whether they wishlist.";
    else if (r.reason === "adds_days") next = "Next: import Page Engine wishlists up to " + dl(R.end) + ", so both series cover the same days.";
    else if (fb && (playersDown || ratioDown || P.change === "up" || R.ratioChange === "up")) next = "Next: compare like with like. The change is measured across Steam Next Fest, so read the fest in the table below, and judge the ordinary weeks against each other as more data comes in.";
    else if (playersDown && ratioDown) next = "Next: both halves slipped. Fewer people are trying the demo (Reach) and fewer of them wishlist (Resonance). They need different fixes, so start with whichever fell further.";
    else if (playersDown) next = "Next: this is a Reach problem. Fewer people are finding the demo, while those who play it wishlist at the same rate. Look at where players find it: the store page&rsquo;s demo button, festivals, creators and your own channels.";
    else if (ratioDown) next = "Next: this is a Resonance problem. People still try the demo, but fewer go on to wishlist. Look at what the demo shows and how it ends, including whether it asks players to wishlist.";
    else if (P.change === "up" || R.ratioChange === "up") next = "Next: something is working. Log what changed as a beat in Page Engine, so the rise can be traced to its cause.";
    else next = "Next: no clear change either way. Keep importing weekly, and log every demo update as a beat in Page Engine so its effect can be read.";
    if (nf) next += " The next Steam Next Fest starts on " + dl(nf.start) + ".";
    return '<section class="card answer"><h3>The answer</h3>' + lines.map(function (l) { return '<p class="verdict">' + l + "</p>"; }).join("") + '<p class="next">' + next + "</p>" +
      '<p class="method">Every comparison here is with your own previous 28 days, never with other games: there is no shared benchmark yet. &ldquo;Up&rdquo; or &ldquo;down&rdquo; only when the two 95% ranges don&rsquo;t overlap.</p></section>';
  }

  function kpiCard() {
    var P = R.players, r = R.ratio, a = R.attr, pt = R.playtime;
    var k = [];
    k.push('<div class="kpi"><div class="v">' + (P.enough ? num(P.now.count) : "—") + '</div><div class="l">Demo players, 28 days ' + half("reach") + "</div>" +
      (P.enough ? '<div class="s">' + num(P.now.lo) + "–" + num(P.now.hi) + ", " + one(P.now.rate.rate) + " a day</div><div class=\"s\">vs previous 28 days:" + (P.change ? chg(P.change) : " not enough to compare") + "</div>"
        : tooFew("data on " + P.now.w.covered + " of 28 days; needs " + Math.ceil(28 * M.MIN_COVERAGE))) + "</div>");
    k.push('<div class="kpi hero"><div class="v">' + (r.enough ? one(r.value) : "—") + '</div><div class="l">Wishlists per 100 demo players ' + half("resonance") + "</div>" +
      (r.enough ? '<div class="s">' + one(r.lo) + "–" + one(r.hi) + ", " + num(r.adds.count) + " adds</div><div class=\"s\">vs previous 28 days:" + (R.ratioChange ? chg(R.ratioChange) : " not enough to compare") + "</div>"
        : tooFew(RATIO_WHY[r.reason](r))) + "</div>");
    k.push('<div class="kpi"><div class="v">' + (pt.enough ? mins(pt.value) : "—") + '</div><div class="l">Median demo playtime ' + half("resonance") + "</div>" +
      (pt.enough ? '<div class="s">' + (pt.exact ? "As reported" : "Weighted middle of " + pt.rows + " reported medians") + ", " + num(pt.n) + " players</div>"
        : pt.rows ? tooFew("playtime on " + pt.covered + " of 28 days, " + num(pt.n) + " players") : '<div class="s">Not in your data. Map it from the export if it has one.</div>') + "</div>");
    if (a.wishlisted.rows) k.push('<div class="kpi"><div class="v">' + (a.enough ? pc(a.w.p) : "—") + '</div><div class="l">Demo players who wishlisted ' + half("resonance") + "</div>" +
      (a.enough ? '<div class="s">' + pc(a.w.lo) + "–" + pc(a.w.hi) + ", " + num(a.wishlisted.count) + " of " + num(a.players.count) + "</div>" : tooFew("needs " + M.MIN_PLAYERS + " players, with both columns on the same days")) + "</div>");
    var s = '<section class="card"><h3>How the demo is doing</h3><div class="kpis ' + (k.length === 4 ? "four" : "three") + '">' + k.join("") + "</div>";
    s += '<p class="note">Reach: are people finding and trying the demo? Resonance: do the people who play it want the full game? They need opposite fixes, so they&rsquo;re never merged into one score.</p>';
    s += '<p class="method">Method: demo players are summed over the 28 days to ' + dl(R.end) + " (the last day of demo data), with an exact 95% Poisson range, and compared per day with the 28 days before. A window counts only when at least " + Math.round(M.MIN_COVERAGE * 100) + "% of its days have data. " +
      "Wishlists per 100 demo players is the full game&rsquo;s wishlist adds (from Page Engine) &divide; demo players over the same days &times; 100, with the adds&rsquo; Poisson range. It&rsquo;s a ratio, not a conversion rate: some of those wishlists came from people who never played the demo." +
      (a.wishlisted.rows ? " &ldquo;Demo players who wishlisted&rdquo; uses the export&rsquo;s own attribution, so it is a true share and gets a 95% Wilson range." : "") +
      " Playtime is shown only when your data has it; Steamworks reports a median, and medians can&rsquo;t be added, so a window of daily medians shows their middle, weighted by players. Source: " + srcLabel(P.now.w) + " for demo players.</p></section>";
    return s;
  }

  /* Daily chart: demo players (bars), full-game wishlist adds (line, own scale), Next Fest windows shaded */
  function chartCard() {
    var g = G(), end = R.end, start = PM.addDays(end, -(CHART_DAYS - 1));
    var players = {}, adds = PM.dailyAdds(pageWishlists);
    g.demo.forEach(function (r) { if (r.from === r.to && r.players != null) players[r.from] = r.players; });
    var first = Object.keys(players).sort().filter(function (d) { return d >= start && d <= end; })[0];
    if (!first) return '<section class="card"><h3>Day by day</h3><p class="note">The chart needs daily demo players. Weekly totals typed into the form count towards the 28-day figures but can&rsquo;t be placed on a day.</p></section>';
    if (PM.daysBetween(first, end) >= 13) start = first;
    var span = PM.daysBetween(start, end) + 1, dates = [], maxP = 0, maxA = 0;
    for (var i = 0; i < span; i++) { var d = PM.addDays(start, i); dates.push(d); if (players[d] > maxP) maxP = players[d]; if (adds[d] > maxA) maxA = adds[d]; }
    maxP = Math.max(1, maxP); maxA = Math.max(1, maxA);
    var W = 720, H = 236, L = 40, Rt = 40, T = 26, B = 22, bw = (W - L - Rt) / span;
    var y = function (v) { return H - B - (v / maxP) * (H - T - B); };
    var ya = function (v) { return H - B - (v / maxA) * (H - T - B); };
    var s = '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Daily demo players and full-game wishlist adds, with Steam Next Fest marked">';
    M.nextFests().forEach(function (f) {
      if (f.end < start || f.start > end) return;
      var a = f.start < start ? start : f.start, b = f.end > end ? end : f.end;
      var x = L + PM.daysBetween(start, a) * bw, w = (PM.daysBetween(a, b) + 1) * bw;
      s += '<rect class="fest" x="' + x + '" y="' + T + '" width="' + w + '" height="' + (H - T - B) + '"/><text class="fest-l" x="' + (x + 3) + '" y="' + (T - 8) + '">Next Fest</text>';
    });
    [0, 0.5, 1].forEach(function (f) {
      s += '<line class="grid" x1="' + L + '" x2="' + (W - Rt) + '" y1="' + y(maxP * f) + '" y2="' + y(maxP * f) + '"/><text x="' + (L - 4) + '" y="' + (y(maxP * f) + 4) + '" text-anchor="end">' + Math.round(maxP * f) + "</text>";
      if (Object.keys(adds).length) s += '<text x="' + (W - Rt + 4) + '" y="' + (ya(maxA * f) + 4) + '">' + Math.round(maxA * f) + "</text>";
    });
    var pts = [];
    dates.forEach(function (d, i) {
      var x = L + i * bw;
      var tipText = dl(d) + ": " + (players[d] != null ? num(players[d]) + " demo players" : "no demo data") + (adds[d] != null ? ", " + num(adds[d]) + " wishlist adds" : "");
      if (players[d] != null) s += '<rect class="b-play" x="' + (x + 0.5) + '" y="' + y(players[d]) + '" width="' + Math.max(1, bw - 1) + '" height="' + (y(0) - y(players[d])) + '"/>';
      if (adds[d] != null) pts.push((x + bw / 2).toFixed(1) + "," + ya(adds[d]).toFixed(1));
      else if (pts.length) { s += '<polyline class="l-wish" points="' + pts.join(" ") + '"/>'; pts = []; }
      s += '<rect class="hit tipped" data-tip="' + esc(tipText) + '" x="' + x + '" y="' + T + '" width="' + bw + '" height="' + (H - T - B) + '"/>';
      if (i % Math.max(7, Math.round(span / 6)) === 0) s += '<text x="' + x + '" y="' + (H - 6) + '">' + ds(d) + "</text>";
    });
    if (pts.length) s += '<polyline class="l-wish" points="' + pts.join(" ") + '"/>';
    s += "</svg>";
    return '<section class="card"><h3>Day by day</h3>' + s + '<div class="legend"><span><i class="play"></i>Demo players a day (left scale)</span>' +
      (Object.keys(adds).length ? '<span><i class="wish"></i>Full-game wishlist adds a day (right scale)</span>' : "<span>No daily wishlist adds from Page Engine yet</span>") +
      '<span><i class="fest"></i>Steam Next Fest</span></div></section>';
  }

  /* Next Fest reads */
  var FEST_WHY = {
    future: "Hasn&rsquo;t happened yet, or is after your latest demo data.",
    nodata: "No demo data around this fest.",
    fest_days: "Needs demo players on every fest day.",
    before_days: "Needs demo players on " + Math.ceil(28 * M.MIN_COVERAGE) + " of the 28 days before the fest.",
  };
  function festCard() {
    var F = R.fests;
    var s = '<h3>Around Steam Next Fest</h3>';
    if (!F.length) return '<section class="card">' + s + '<p class="note">None of the Next Fest editions on record falls inside your demo data. Past editions listed: ' + M.PAST_NEXT_FESTS.map(function (f) { return range(f.start, f.end); }).join(", ") + ".</p></section>";
    s += '<div class="tbl-wrap"><table class="t beats"><thead><tr><th>Edition</th><th>Demo players a day</th><th>Wishlists per 100 demo players</th></tr></thead><tbody>';
    s += F.map(function (r) {
      var name = "<b>" + esc(r.fest.name) + '</b><div class="s muted">' + range(r.fest.start, r.fest.end) + "</div>";
      if (!r.enough) return '<tr><td class="name">' + name + '</td><td class="read" colspan="2">' + FEST_WHY[r.reason] + "</td></tr>";
      var ratio = r.ratio.enough ? "<b>" + one(r.ratio.value) + '</b> <span class="range">' + one(r.ratio.lo) + "–" + one(r.ratio.hi) + "</span>" +
        (r.ratioBefore.enough ? '<div class="s muted">' + one(r.ratioBefore.value) + " in the 28 days before:" + chg(r.ratioChange) + "</div>" : '<div class="s muted">Too few to compare with the 28 days before</div>')
        : '<span class="muted">' + (r.ratio.reason === "adds_days" ? "Needs Page Engine wishlist adds for these days" : "Too few to read (n = " + num(r.ratio.adds.count) + " adds, " + num(r.ratio.players.count) + " demo players)") + "</span>";
      return '<tr><td class="name">' + name + '</td><td data-l="Demo players a day"><b>' + one(r.playersPerDay) + '</b> <span class="range">vs ' + one(r.beforePerDay) + " before:" + chg(r.playersChange) + '</span></td><td class="read" data-l="Per 100 demo players">' + ratio + "</td></tr>";
    }).join("") + "</tbody></table></div>";
    s += '<p class="method">Each edition&rsquo;s days against the 28 days before it, with the same 95% ranges as above. Wishlists from Next Fest can arrive after it ends, which this read misses. Upcoming editions come from Window Planner&rsquo;s calendar (<a href="' + WM.SOURCE + '" target="_blank" rel="noopener">Steamworks</a>, checked ' + dl(WM.CHECKED) + '); past ones from <a href="' + M.PAST_NEXT_FESTS[0].source + '" target="_blank" rel="noopener">Valve&rsquo;s 2026 events list</a>, checked ' + dl(M.PAST_CHECKED) + ".</p>";
    return '<section class="card">' + s + "</section>";
  }

  function sendCard() {
    var list = M.signals(R), g = window.GOS && GOS.game;
    var all = ["demo_players_28d", "demo_wishlists_per_100", "demo_median_playtime"];
    var have = list.map(function (x) { return x.key; }), skipped = all.filter(function (k) { return have.indexOf(k) < 0; });
    return '<section class="card"><h3>Send to ' + (g ? esc(g.title) : "your game") + "</h3>" +
      '<p class="note">Records ' + plural(list.length, "figure") + " in your game&rsquo;s signal ledger, each with its range, sample size, window and source." +
      (skipped.length ? " Not sent, because there&rsquo;s too little data or it isn&rsquo;t in your numbers: " + skipped.map(esc).join(", ") + "." : "") + (g ? "" : " Pick a game above first.") + "</p>" +
      '<div class="actions"><button class="btn" id="btn-send" type="button"' + (list.length && g ? "" : " disabled") + '>Send to game</button><span class="feedback" id="send-msg" role="status">' + esc(sentNote) + "</span></div></section>";
  }

  function wireResults() {
    var send = document.getElementById("btn-send");
    if (send) send.addEventListener("click", function () {
      var list = M.signals(R), m = document.getElementById("send-msg");
      if (!list.length || !window.GOS || !GOS.game) return;
      send.disabled = true; m.className = "feedback"; m.textContent = "Sending to " + GOS.game.title + "…";
      GOS.recordSignals(TOOL_ID, list).then(function () {
        sentNote = "Sent " + list.length + " figure" + (list.length === 1 ? "" : "s") + " to " + GOS.game.title + ".";
        var m2 = document.getElementById("send-msg"); if (m2) m2.textContent = sentNote;
        track("output_action", { action: "send_signals", count: list.length });
        step("result_actioned", 3, { action: "send_to_game" });
      }).catch(function (e) { send.disabled = false; m.className = "feedback err"; m.textContent = "Couldn't send: " + e.message; });
    });
    var tip = document.getElementById("chart-tip");
    out.querySelectorAll(".tipped").forEach(function (el) {
      el.addEventListener("mousemove", function (e) { tip.textContent = el.getAttribute("data-tip"); tip.style.display = "block"; tip.style.left = Math.min(e.clientX + 12, innerWidth - 270) + "px"; tip.style.top = e.clientY + 12 + "px"; });
      el.addEventListener("mouseleave", function () { tip.style.display = "none"; });
    });
  }

  /* ---------------- Data in: CSV import with a column picker, or a form ---------------- */
  var csv = null; // { name, rows, headerIndex, header, map, order, unit } — in memory only; the file itself is never stored
  var FIELDS = ["date", "players", "wishlisted", "playtime"];
  var FIELD_LABELS = { date: "Date", players: "New demo players a day", wishlisted: "Demo players who wishlisted (if the export has it)", playtime: "Median playtime (if the export has it)" };

  function renderData() {
    var g = G(), list = g.demo, s = "<h3>Your demo&rsquo;s numbers</h3>";
    s += '<p class="note">Your demo has its own App ID in Steamworks, with its own reports. Those numbers aren&rsquo;t public, so you bring them in: export a CSV and map its columns, or type the numbers in. The file is read in this browser and never uploaded; only the daily totals are saved, to your account. Never share your Steamworks login or API key with any tool, this one included.</p>';
    var csvN = 0, formN = 0;
    list.forEach(function (r) { if (r.src === "csv") csvN++; else formN++; });
    s += '<p class="note"><b>Saved:</b> ' + (list.length ? list.length + " rows, " + dl(list[0].from) + " to " + dl(PM.lastDate(list)) + " (" + csvN + " from exports, " + formN + " typed in) &middot; " + '<button type="button" class="link-btn" id="btn-clear">Clear these</button>' : "nothing yet") + "</p>";
    s += '<p class="note"><b>Full-game wishlists:</b> ' + (pageWishlists.length ? pageWishlists.length + " rows from Page Engine, to " + dl(PM.lastDate(pageWishlists)) + "." : "none yet.") + ' They&rsquo;re imported in <a href="/game-os/page-engine">Page Engine</a> and read from there.</p>';
    s += "<h4>Import a CSV</h4>";
    s += '<p class="note">Map a column that counts <b>new</b> demo players each day. Summing a &ldquo;daily active users&rdquo; column counts returning players again every day they play, and a lifetime total isn&rsquo;t a daily count at all.</p>';
    s += '<div class="file-row"><input type="file" id="csv-file" accept=".csv,.tsv,.txt,text/csv"></div><div id="csv-map"></div>';
    s += "<h4>Or type the numbers in</h4>" + formHtml();
    s += '<span class="feedback" id="data-msg" role="status"></span>';
    dataCard.innerHTML = s;
    if (csv) renderMap();
    wireData();
  }

  function formHtml() {
    var t = today();
    return '<form class="form" id="f-data"><label>From<input name="from" type="date" required max="' + t + '" value="' + t + '"></label><label>To<input name="to" type="date" required max="' + t + '" value="' + t + '"></label>' +
      '<label>New demo players<input name="players" type="number" min="0" step="1" required></label>' +
      '<label>Who wishlisted (optional)<input name="wishlisted" type="number" min="0" step="1"></label>' +
      '<label>Median playtime, minutes (optional)<input name="playtime" type="number" min="0" step="any"></label>' +
      '<div><button class="btn" type="submit">Save</button></div></form><p class="note">One day, or a week&rsquo;s total (set From and To). A total replaces any days it overlaps. Weekly totals count towards the 28-day figures but can&rsquo;t go on the daily chart. Only fill in &ldquo;who wishlisted&rdquo; if Steamworks reports it for demo players specifically.</p>';
  }

  function renderMap() {
    var el = document.getElementById("csv-map");
    if (!el || !csv) return;
    var opts = function (f) {
      return '<option value="">(not in this file)</option>' + csv.header.map(function (h, i) { return '<option value="' + i + '"' + (csv.map[f] === i ? " selected" : "") + ">" + esc(h || "Column " + (i + 1)) + "</option>"; }).join("");
    };
    var s = '<p class="note">Read <b>' + esc(csv.name) + "</b>: " + (csv.rows.length - csv.headerIndex - 1) + " data rows. Pick each column below. Nothing is guessed and nothing is imported until you confirm.</p>";
    s += '<div class="tbl-wrap"><table class="t preview"><thead><tr>' + csv.header.map(function (h) { return "<th>" + esc(h) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      csv.rows.slice(csv.headerIndex + 1, csv.headerIndex + 4).map(function (r) { return "<tr>" + csv.header.map(function (_, i) { return "<td>" + esc(r[i]) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>";
    s += '<div class="map">' + FIELDS.map(function (f) { return "<label>" + FIELD_LABELS[f] + '<select data-field="' + f + '">' + opts(f) + "</select></label>"; }).join("");
    s += '<label>Date format<select id="csv-order"><option value="ymd"' + (csv.order === "ymd" ? " selected" : "") + '>Year first (2026-11-03)</option><option value="mdy"' + (csv.order === "mdy" ? " selected" : "") + '>Month first (11/03/2026)</option><option value="dmy"' + (csv.order === "dmy" ? " selected" : "") + ">Day first (03/11/2026)</option></select></label>";
    s += '<label>Playtime is in<select id="csv-unit">' + ["minutes", "hours", "seconds"].map(function (u) { return '<option value="' + u + '"' + (csv.unit === u ? " selected" : "") + ">" + u.charAt(0).toUpperCase() + u.slice(1) + "</option>"; }).join("") + "</select></label></div>";
    if (csv.orderNote) s += '<p class="note">' + csv.orderNote + "</p>";
    s += '<div class="actions"><button class="btn" id="btn-import" type="button">Import</button><button class="btn-ghost" id="btn-cancel" type="button">Cancel</button></div>';
    el.innerHTML = s;
    el.querySelectorAll("select[data-field]").forEach(function (sel) {
      sel.addEventListener("change", function () { var f = sel.getAttribute("data-field"); if (sel.value === "") delete csv.map[f]; else csv.map[f] = +sel.value; if (f === "date") guessOrder(); });
    });
    document.getElementById("csv-order").addEventListener("change", function (e) { csv.order = e.target.value; });
    document.getElementById("csv-unit").addEventListener("change", function (e) { csv.unit = e.target.value; });
    document.getElementById("btn-cancel").addEventListener("click", function () { csv = null; renderData(); });
    document.getElementById("btn-import").addEventListener("click", doImport);
  }

  function guessOrder() {
    csv.order = "ymd"; csv.orderNote = "";
    if (csv.map.date == null) return;
    var g = PM.guessDateOrder(csv.rows.slice(csv.headerIndex + 1).map(function (r) { return r[csv.map.date]; }));
    if (g === "dmy" || g === "mdy") csv.order = g;
    else if (g === "ambiguous") { csv.order = "mdy"; csv.orderNote = "The dates could be month-first or day-first. Check the format above before importing."; }
    else if (g === null) csv.orderNote = "The dates mix formats. Check the date column.";
    renderMap();
  }

  function msg(text, err) { var m = document.getElementById("data-msg"); if (m) { m.className = "feedback" + (err ? " err" : ""); m.textContent = text; } }

  function readFile(file) {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { msg("That file is over 20 MB. Export a shorter date range.", true); return; }
    var fr = new FileReader();
    fr.onload = function () {
      var p = PM.parseCsv(fr.result);
      if (p.rows.length < 2) { msg("Couldn't find a table in that file.", true); return; }
      var hi = PM.findHeader(p.rows);
      // Only the date column is suggested (its name is unambiguous); every count column is the studio's pick (brief §2.6).
      var map = PM.suggest(p.rows[hi], ["date"]);
      csv = { name: file.name, rows: p.rows, headerIndex: hi, header: p.rows[hi], map: map, order: "ymd", unit: "minutes", orderNote: "" };
      guessOrder();
    };
    fr.onerror = function () { msg("Couldn't read that file.", true); };
    fr.readAsText(file);
  }

  function doImport() {
    if (csv.map.date == null) { msg("Pick the date column.", true); return; }
    if (csv.map.players == null) { msg("Pick the column with new demo players a day.", true); return; }
    var t = M.tableFromCsv(csv.rows, csv.headerIndex, csv.map, csv.order, csv.unit);
    if (!t.rows.length) { msg("No dated rows found. Check the date column and format.", true); return; }
    if (t.cumulative) { msg("That players column only ever goes up, so it looks like a running total rather than new players a day. Pick a daily column, or type weekly totals into the form.", true); return; }
    t.rows.forEach(function (r) { r.src = "csv"; });
    G().demo = PM.merge(G().demo, t.rows).slice(-MAX_ROWS);
    done("Imported " + t.rows.length + " days, " + dl(t.rows[0].from) + " to " + dl(t.rows[t.rows.length - 1].to) +
      (t.skipped ? "; skipped " + plural(t.skipped, "row") + " without a date or numbers (totals rows, for example)" : "") +
      (t.playtimeDropped ? "; left out playtime on " + plural(t.playtimeDropped, "day") + " with more than one row, because medians can't be added" : "") + ".", "csv");
  }

  function done(text, how) {
    csv = null; sentNote = ""; changed();
    step("data_entered", 1, { how: how });
    renderData(); msg(text); render();
  }

  function wireData() {
    var f = document.getElementById("csv-file");
    if (f) f.addEventListener("change", function () { readFile(f.files && f.files[0]); f.value = ""; });
    var clr = document.getElementById("btn-clear");
    if (clr) clr.addEventListener("click", function () { G().demo = []; changed(); renderData(); msg("Cleared."); render(); });
    var form = document.getElementById("f-data");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(form);
      var n = function (k) { var v = fd.get(k); return v === null || v === "" ? null : Number(v); };
      var from = String(fd.get("from")), to = String(fd.get("to"));
      if (!PM.isYmd(from) || !PM.isYmd(to) || from > to) { msg("Check the dates: From must be on or before To.", true); return; }
      var r = { from: from, to: to, src: "form" };
      M.DEMO_FIELDS.forEach(function (k) { var v = n(k); if (v != null && isFinite(v) && v >= 0) r[k] = v; });
      if (r.players == null) { msg("Enter the number of new demo players.", true); return; }
      if (r.wishlisted != null && r.wishlisted > r.players) { msg("Players who wishlisted can't be more than the players.", true); return; }
      G().demo = PM.merge(G().demo, [r]).slice(-MAX_ROWS);
      done("Saved " + (from === to ? dl(from) : dl(from) + " to " + dl(to)) + ".", "form");
    });
  }

  /* ---------------- Page Engine's wishlists (read-only) ---------------- */
  function loadPageEngine() {
    var id = gid(), local = null;
    try { local = JSON.parse(localStorage.getItem(PE_LS_KEY) || "null"); } catch (e) {}
    var pick = function (st) { var g = st && st.games && st.games[id]; return g && Array.isArray(g.wishlists) ? g.wishlists.filter(function (r) { return r && PM.isYmd(r.from) && PM.isYmd(r.to) && r.from <= r.to; }) : null; };
    pageWishlists = pick(local) || [];
    render(); renderData();
    if (!accountUser) return Promise.resolve();
    return fetch("/api/tool-state/page-engine", { credentials: "same-origin" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      var st = j && j.state;
      if (id !== gid()) return;
      if (st && (!local || (Number(st.savedAt) || 0) > (Number(local.savedAt) || 0))) { var w = pick(st); if (w) { pageWishlists = w; render(); renderData(); } }
    }).catch(function () {});
  }

  /* ---------------- About ---------------- */
  function about() {
    var items = [
      "<b>Demo players</b> come from your demo&rsquo;s own Steamworks reports, imported as a CSV or typed in. They&rsquo;re Reach: whether people are finding and trying the demo.",
      "<b>Wishlists per 100 demo players</b> divides the full game&rsquo;s wishlist adds (from Page Engine) by demo players over the same days. It&rsquo;s Resonance, and it&rsquo;s a ratio, not a conversion rate, because not every wishlist came from a demo player. If the export attributes wishlists to demo players, that share is shown too, with a 95% Wilson range.",
      "<b>Minimums:</b> " + M.MIN_PLAYERS + " demo players and " + M.MIN_ADDS + " wishlist adds in 28 days, with data on at least " + Math.round(M.MIN_COVERAGE * 100) + "% of the days. Below that, one wishlist moves the ratio by more than 1 per 100 and the range is wider than the count, so the page says &ldquo;too few to read yet&rdquo; and sends nothing.",
      "<b>Ranges:</b> counts get an exact 95% Poisson range. &ldquo;Up&rdquo; or &ldquo;down&rdquo; is said only when this period&rsquo;s range and the last period&rsquo;s don&rsquo;t overlap; otherwise &ldquo;no clear change&rdquo;.",
      "<b>Steam Next Fest</b> windows come from Window Planner&rsquo;s calendar for upcoming editions and from a sourced list here for past ones (2026 so far). Each edition is read against the 28 days before it.",
      "<b>No outside benchmarks:</b> there&rsquo;s no shared pool of other studios&rsquo; numbers yet, so there&rsquo;s no &ldquo;typical demo&rdquo; figure. The demo is compared with its own earlier periods only.",
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
      .catch(function (e) { status(e.message === "too large" ? "Too much to save to your account; clear older rows" : "Couldn't save to your account; your numbers are still in this browser", "error"); });
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
    booted = true; lastGame = gid();
    loadPageEngine();
  }
  if (window.GOS && GOS.onChange) {
    GOS.onChange(function () {
      if (!booted) return;
      var id = gid();
      if (id === lastGame) { render(); return; }
      lastGame = id; csv = null; viewed = false; pageWishlists = []; sentNote = "";
      loadPageEngine();
    });
  }
})();
