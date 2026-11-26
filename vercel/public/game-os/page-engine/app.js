/* Page Engine — page logic. The maths lives in model.js (window.PageModel). Data is studio-submitted:
 * Steamworks CSVs parsed in this browser (the raw file is never uploaded or kept) or numbers typed into a form.
 * Beats and creative versions are also written to the game's signal ledger so other tools can read them. */
(function () {
  "use strict";
  var M = window.PageModel;
  var TOOL_ID = "page-engine";
  var LS_KEY = "gos_page_engine_v1";
  var ACCOUNT_URL = "/api/tool-state/" + TOOL_ID;
  var REGION_DAYS = 120;   // per-region daily split kept for this many days, to keep saved state small
  var CHART_DAYS = 90;     // days drawn on the beat chart

  /* ---------------- State: per game, only derived daily tables and the logs ---------------- */
  function emptyGame() { return { wishlists: [], traffic: [], regions: {}, utm: { rows: [], window: "", importedAt: 0 }, beats: [], versions: [] }; }
  function emptyState() { return { games: {}, savedAt: 0 }; }
  function cleanRows(list, fields) {
    return (Array.isArray(list) ? list : []).filter(function (r) { return r && M.isYmd(r.from) && M.isYmd(r.to) && r.from <= r.to; }).map(function (r) {
      var o = { from: r.from, to: r.to, src: r.src === "csv" ? "csv" : "form" };
      fields.forEach(function (f) { if (typeof r[f] === "number" && isFinite(r[f])) o[f] = r[f]; });
      return o;
    });
  }
  function normalise(s) {
    if (!s || typeof s !== "object") return null;
    var b = emptyState();
    b.savedAt = Number(s.savedAt) || 0;
    Object.keys(s.games || {}).forEach(function (id) {
      var g = s.games[id] || {}, o = emptyGame();
      o.wishlists = cleanRows(g.wishlists, M.WISHLIST_FIELDS);
      o.traffic = cleanRows(g.traffic, M.TRAFFIC_FIELDS);
      if (g.regions && typeof g.regions === "object") Object.keys(g.regions).forEach(function (d) { if (M.isYmd(d) && g.regions[d] && typeof g.regions[d] === "object") o.regions[d] = g.regions[d]; });
      if (g.utm && Array.isArray(g.utm.rows)) o.utm = { rows: g.utm.rows.slice(0, 500), window: String(g.utm.window || "").slice(0, 60), importedAt: Number(g.utm.importedAt) || 0 };
      o.beats = (g.beats || []).map(M.cleanBeat).filter(Boolean);
      o.versions = (g.versions || []).map(function (v) { return M.cleanVersion(v); }).filter(Boolean);
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
    // Trim the regional split to recent days so the saved workbook stays well under the 512 KB limit.
    Object.keys(S.games).forEach(function (id) {
      var g = S.games[id], end = M.lastDate(g.wishlists);
      if (!end) return;
      var cut = M.addDays(end, -REGION_DAYS);
      Object.keys(g.regions).forEach(function (d) { if (d < cut) delete g.regions[d]; });
    });
    S.savedAt = Date.now();
    try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) {}
    scheduleAccountSave();
  }

  /* ---------------- Formatting ---------------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function num(n) { return n == null || !isFinite(n) ? "—" : Math.round(n).toLocaleString("en-US"); }
  function one(x) { return x == null || !isFinite(x) ? "—" : x < 10 ? x.toFixed(1) : Math.round(x).toLocaleString("en-US"); }
  function pc(p, d) { return p == null || !isFinite(p) ? "—" : (p * 100).toFixed(d == null ? 1 : d) + "%"; }
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function dl(ymd) { if (!ymd) return "—"; var p = String(ymd).split("-"); return +p[2] + " " + MONTHS[+p[1] - 1] + " " + p[0]; }
  function ds(ymd) { var p = String(ymd).split("-"); return +p[2] + " " + MONTHS[+p[1] - 1]; }
  function half(h) { return '<span class="half ' + h + '">' + (h === "reach" ? "Reach" : "Resonance") + "</span>"; }
  function today() { var d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function track(name, props) { if (typeof window.gosTrack === "function") window.gosTrack(name, Object.assign({ tool_id: TOOL_ID }, props || {})); }
  function step(name, index, extra) { track("journey_step", Object.assign({ step_name: name, step_index: index }, extra || {})); }
  function srcLabel(w) { return w && w.csv ? "Steamworks export" : "typed in"; }

  var out = document.getElementById("out");
  var dataCard = document.getElementById("data-card");
  var logsCard = document.getElementById("logs-card");
  var R = null;
  var viewed = false;

  /* ---------------- Render: results ---------------- */
  function render() {
    R = M.analyse(G());
    if (R.empty) {
      out.innerHTML = '<section class="card answer"><h3>The answer</h3><p class="verdict">No numbers yet. Add your Steamworks wishlist and traffic figures below, from a CSV export or typed in by hand.</p>' +
        '<p class="next">Next: in Steamworks, open your game&rsquo;s Wishlists report and export it, or note this week&rsquo;s adds and deletes. Then log your recent marketing beats so later changes can be read against them.</p></section>' + auditLine();
      return;
    }
    out.innerHTML = answer() + auditLine() + kpiCard() + beatCard() + regionCard() + utmCard() + sendCard();
    wireResults();
    if (!viewed) { viewed = true; step("performance_viewed", 2, { end: R.end }); }
  }

  function auditLine() {
    var a = null, l = (window.GOS && GOS.ledger) || [];
    for (var i = 0; i < l.length; i++) if (l[i] && l[i].key === "page_audit_overall") { a = l[i]; break; }
    var t = a && a.value != null ? "Steam Page Audit last scored this page <b>" + Math.round(a.value) + "/100</b>" + (a.observedAt ? " (" + dl(String(a.observedAt).slice(0, 10)) + ")" : "") + ". That checks how the public page looks; this page measures how it performs."
      : "Steam Page Audit checks how the public page looks. This page measures how it performs. No audit score for this game yet.";
    return '<p class="note">' + t + ' <a href="/game-os/steam-page-audit">Open Steam Page Audit</a></p>';
  }

  function answer() {
    var lines = [], v = R.verdict, vtw = R.vtw, c = R.ctr, v28 = R.vel28;
    if (vtw.enough) lines.push("Your store page turned <b>" + one(vtw.value) + " of every 100 visits</b> into a wishlist in the 28 days to " + dl(R.end) + " (" + one(vtw.lo) + "–" + one(vtw.hi) + ", " + num(vtw.visits.count) + " visits)." +
      (R.vtwChange === "up" ? " That&rsquo;s up on the 28 days before, beyond chance." : R.vtwChange === "down" ? " That&rsquo;s down on the 28 days before, beyond chance." : R.vtwChange === "flat" ? " No clear change on the 28 days before." : ""));
    else lines.push("Not enough traffic data to say how many visitors wishlist yet. It needs at least " + num(M.MIN_VISITS) + " page visits in the last 28 days, alongside daily wishlist adds.");
    if (v28.enough) lines.push("Wishlist adds ran at <b>" + one(v28.nowRate.rate) + " a day</b> (" + one(v28.nowRate.lo) + "–" + one(v28.nowRate.hi) + ")" +
      (v28.change === "up" ? ", up on the previous 28 days." : v28.change === "down" ? ", down on the previous 28 days." : v28.change === "flat" ? ", with no clear change on the previous 28 days." : "."));
    if (c.enough && R.ctrChange && R.ctrChange !== "flat") lines.push("Click-through from impressions to visits is " + (R.ctrChange === "up" ? "up" : "down") + " on the previous 28 days (" + pc(c.w.p) + " now).");
    if (R.delChange === "up") lines.push("Deletes per 100 adds rose on the previous 28 days.");
    var next = {
      both: "Next: both halves slipped. Reach (fewer people finding the page) and Resonance (fewer visitors wishlisting) need different fixes, so start with whichever fell further, and check the beat log for what changed around the drop.",
      reach: "Next: this is a Reach problem. Fewer people are finding or clicking the page, while visitors still wishlist at the same rate. Look at the capsule (what people see before they click) and at whether your beats have slowed. Log any capsule change below so its effect can be read.",
      resonance: "Next: this is a Resonance problem. People reach the page but fewer wishlist, or more remove the game. Look at what visitors see on the page: the trailer, screenshots and short description. Log every change below so you can tell which one helped.",
      up: "Next: something is working. Check the beat log for what lines up with the rise, and log the next change as its own beat so the two don&rsquo;t blur together.",
      steady: "Next: no clear change in either direction. Keep importing weekly and log every beat and store asset change, so the next move can be traced to its cause.",
    }[v.next];
    return '<section class="card answer"><h3>The answer</h3>' + lines.map(function (l) { return '<p class="verdict">' + l + "</p>"; }).join("") + '<p class="next">' + next + "</p>" +
      '<p class="method">Every comparison here is with your own previous 28 days, never with other games: there is no shared benchmark yet. &ldquo;Up&rdquo; or &ldquo;down&rdquo; only when the two 95% ranges don&rsquo;t overlap.</p></section>';
  }

  function tooFew(text) { return '<div class="s">Too few to read yet (' + text + ")</div>"; }
  function chg(c) { return c === "up" ? " &uarr; up" : c === "down" ? " &darr; down" : c === "flat" ? " no clear change" : ""; }

  function velKpi(v, label) {
    if (!v.enough) return '<div class="kpi"><div class="v">—</div><div class="l">' + label + " " + half("reach") + "</div>" + tooFew("data on " + v.now.covered + " of " + v.days + " days; needs " + Math.ceil(v.days * M.MIN_COVERAGE)) + "</div>";
    return '<div class="kpi"><div class="v">' + one(v.nowRate.rate) + '<small>/day</small></div><div class="l">' + label + " " + half("reach") + '</div><div class="s">' + one(v.nowRate.lo) + "–" + one(v.nowRate.hi) + ", " + num(v.now.count) + " adds</div>" +
      '<div class="s">vs ' + one(v.beforeRate ? v.beforeRate.rate : null) + "/day before:" + (v.change ? chg(v.change) : " not enough to compare") + "</div></div>";
  }

  function kpiCard() {
    var d = R.del, c = R.ctr, t = R.vtw, o = R.outstanding;
    var s = '<section class="card"><h3>How the page is doing</h3><div class="kpis four">';
    s += velKpi(R.vel7, "Wishlist adds, 7 days") + velKpi(R.vel28, "Wishlist adds, 28 days");
    s += '<div class="kpi"><div class="v">' + (c.enough ? pc(c.w.p) : "—") + '</div><div class="l">Click-through ' + half("reach") + "</div>" +
      (c.enough ? '<div class="s">' + pc(c.w.lo) + "–" + pc(c.w.hi) + ", " + num(c.visits.count) + " visits of " + num(c.impressions.count) + " impressions</div><div class=\"s\">vs previous 28 days:" + (R.ctrChange ? chg(R.ctrChange) : " not enough to compare") + "</div>"
        : tooFew("n = " + num(c.impressions.count) + " impressions; needs " + num(M.MIN_IMPRESSIONS) + " over 28 days, with visits on the same days")) + "</div>";
    s += '<div class="kpi"><div class="v">' + (t.enough ? one(t.value) : "—") + '</div><div class="l">Wishlists per 100 visits ' + half("resonance") + "</div>" +
      (t.enough ? '<div class="s">' + one(t.lo) + "–" + one(t.hi) + ", " + num(t.adds.count) + " adds, " + num(t.visits.count) + " visits</div><div class=\"s\">vs previous 28 days:" + (R.vtwChange ? chg(R.vtwChange) : " not enough to compare") + "</div>"
        : tooFew("n = " + num(t.visits.count) + " visits; needs " + num(M.MIN_VISITS) + " over 28 days")) + "</div>";
    s += '<div class="kpi"><div class="v">' + (d.enough ? one(d.value) : "—") + '</div><div class="l">Deletes per 100 adds ' + half("resonance") + "</div>" +
      (d.enough ? '<div class="s">' + one(d.lo) + "–" + one(d.hi) + ", " + num(d.deletes.count) + " deletes, " + num(d.adds.count) + " adds</div><div class=\"s\">vs previous 28 days:" + (R.delChange ? chg(R.delChange) : " not enough to compare") + "</div>"
        : tooFew("n = " + num(d.adds.count) + " adds; needs " + M.MIN_ADDS_FOR_DELETES + " over 28 days, with deletes")) + "</div>";
    s += '<div class="kpi"><div class="v">' + (o ? num(o.value) : "—") + '</div><div class="l">Wishlists outstanding ' + half("reach") + '</div><div class="s">' + (o ? "As of " + dl(o.date) + ", as reported" : "Not in your data. Add it from the export or the form.") + "</div></div>";
    s += "</div>";
    s += '<p class="note">Reach: are people finding the page (impressions, click-through, adds)? Resonance: do the people who arrive want the game (wishlists per visit, deletes)? They need opposite fixes, so they&rsquo;re never merged into one score.</p>';
    s += '<p class="method">Method: adds per day with exact 95% Poisson ranges, over the 7 and 28 days to ' + dl(R.end) + ' (the last day in your data), against the same number of days before. A window counts only when at least ' + Math.round(M.MIN_COVERAGE * 100) + "% of its days have data. Click-through is visits &divide; impressions with a 95% Wilson range; Steam counts an impression whenever the game appears on screen, whether or not the player noticed it. " +
      "Wishlists per 100 visits is a ratio, not a conversion rate, because some adds don&rsquo;t come through a tracked visit; its range comes from the adds&rsquo; Poisson range. Deletes per 100 adds is also a ratio, not a churn rate: deletes can come from wishlists added long ago. " +
      "Source: " + srcLabel(R.vel28.now) + " for wishlists, " + srcLabel(c.impressions) + " for traffic.</p></section>";
    return s;
  }

  /* Beat chart and table */
  function chart() {
    var daily = M.dailyAdds(G().wishlists), end = R.end, start = M.addDays(end, -(CHART_DAYS - 1));
    // Start at the first day with data when that's inside the 90 days, so the bars fill the width.
    var first = Object.keys(daily).sort().filter(function (d) { return d >= start && d <= end; })[0];
    if (first && M.daysBetween(first, end) >= 13) start = first;
    var span = M.daysBetween(start, end) + 1;
    var dates = [], max = 0;
    for (var i = 0; i < span; i++) { var d = M.addDays(start, i); dates.push(d); if (daily[d] > max) max = daily[d]; }
    if (!Object.keys(daily).some(function (d) { return d >= start && d <= end; })) return '<p class="note">The chart needs daily wishlist adds. Weekly totals typed into the form count towards the 28-day figures but can&rsquo;t be placed on a day.</p>';
    max = Math.max(1, max);
    var W = 720, H = 236, L = 34, T = 36, B = 22, bw = (W - L) / span;
    var y = function (v) { return H - B - (v / max) * (H - T - B); };
    var s = '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Daily wishlist adds, last ' + span + ' days, with beats and store asset changes marked">';
    [0, 0.5, 1].forEach(function (f) { var v = Math.round(max * f); s += '<line class="grid" x1="' + L + '" x2="' + W + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text x="' + (L - 4) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + v + "</text>"; });
    dates.forEach(function (d, i) {
      var x = L + i * bw;
      if (daily[d] != null) s += '<g class="tipped" data-tip="' + esc(dl(d) + ": " + num(daily[d]) + " adds") + '"><rect class="b-add" x="' + (x + 0.5) + '" y="' + y(daily[d]) + '" width="' + Math.max(1, bw - 1) + '" height="' + (y(0) - y(daily[d])) + '"/><rect class="hit" x="' + x + '" y="' + T + '" width="' + bw + '" height="' + (H - T - B) + '"/></g>';
      if (i % Math.max(7, Math.round(span / 6)) === 0) s += '<text x="' + x + '" y="' + (H - 6) + '">' + ds(d) + "</text>";
    });
    var g = G(), n = 0;
    g.versions.filter(function (v) { return !v.deleted && v.date >= start && v.date <= end; }).forEach(function (v) {
      var x = L + (M.daysBetween(start, v.date) + 0.5) * bw;
      s += '<g class="tipped" data-tip="' + esc(dl(v.date) + ": " + v.asset + " " + v.label + (v.note ? " (" + v.note + ")" : "")) + '"><line class="m-ver" x1="' + x + '" x2="' + x + '" y1="' + T + '" y2="' + y(0) + '"/><text class="m-ver-l" x="' + x + '" y="' + (T - 6) + '" text-anchor="middle">V</text><rect class="hit" x="' + (x - 5) + '" y="' + T + '" width="10" height="' + (H - T - B) + '"/></g>';
    });
    g.beats.filter(function (b) { return !b.deleted && b.date >= start && b.date <= end; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; }).forEach(function (b) {
      n++;
      var x = L + (M.daysBetween(start, b.date) + 0.5) * bw;
      s += '<g class="tipped" data-tip="' + esc(n + ". " + dl(b.date) + ": " + b.type + (b.channel ? " on " + b.channel : "") + (b.note ? " (" + b.note + ")" : "")) + '"><line class="m-beat" x1="' + x + '" x2="' + x + '" y1="' + T + '" y2="' + y(0) + '"/><text class="m-beat-l" x="' + x + '" y="' + (T - 20) + '" text-anchor="middle">' + n + '</text><rect class="hit" x="' + (x - 5) + '" y="' + T + '" width="10" height="' + (H - T - B) + '"/></g>';
    });
    s += "</svg>";
    return s + '<div class="legend"><span><i class="add"></i>Wishlist adds a day</span><span><i class="beat"></i>Beat (numbered)</span><span><i class="ver"></i>Store asset change</span></div>';
  }

  function beatCard() {
    var s = '<section class="card"><h3>Which beats moved wishlists?</h3>' + chart();
    var rows = R.beats.slice(0, 20);
    if (!rows.length) s += '<p class="note">No beats logged yet. Log each announcement, trailer, festival, sale or creator video below, with its date, and this table shows how wishlist adds moved after it.</p>';
    else {
      s += '<div class="tbl-wrap"><table class="t beats"><thead><tr><th>Beat</th><th>Read</th><th>7 days from beat</th><th>Usual 7 days</th></tr></thead><tbody>';
      rows.forEach(function (r) {
        var b = r.beat, name = dl(b.date) + ": " + esc(b.type) + (b.channel ? " on " + esc(b.channel) : "") + (b.effort ? " (" + esc(b.effort) + ")" : "");
        if (!r.enough) { s += '<tr><td class="name">' + name + '</td><td colspan="3">Too few days of daily adds to read (' + r.beforeDays + " of " + M.BEAT_BEFORE_DAYS + " days before, needs " + M.MIN_BASELINE_DAYS + "; " + r.afterDays + " of " + M.BEAT_AFTER_DAYS + " days from the beat, needs all)</td></tr>"; return; }
        var read = r.verdict === "rise" ? '<span class="badge good">Associated with a rise</span>' : r.verdict === "fall" ? '<span class="badge bad">Associated with a fall</span>' : '<span class="badge warn">No clear change</span>';
        if (r.overlaps.length) read += '<div class="s">Can&rsquo;t be separated from ' + r.overlaps.map(function (o) { return esc(o.label) + " (" + ds(o.date) + ")"; }).join(", ") + "</div>";
        s += '<tr><td class="name">' + name + '</td><td class="read">' + read + '</td><td data-l="7 days from beat">' + num(r.after) + ' <span class="range">(' + num(r.lo) + "–" + num(r.hi) + ')</span></td><td data-l="Usual 7 days">' + num(r.expected) + "</td></tr>";
      });
      s += "</tbody></table></div>";
    }
    s += '<p class="method">Method: adds on the beat day and the six days after, against 7 &times; the median day in the ' + M.BEAT_BEFORE_DAYS + " days before, with an exact 95% Poisson range on the 7-day count. A rise or fall is named only when the usual figure sits outside that range. &ldquo;Associated with&rdquo;, not &ldquo;caused by&rdquo;: other things happen in the same week. When two beats or asset changes fall within " + M.BEAT_AFTER_DAYS + " days of each other, their effects can&rsquo;t be told apart.</p></section>";
    return s;
  }

  function regionCard() {
    var r = R.regions;
    if (!r) return "";
    return '<section class="card"><h3>Where wishlists come from</h3><div class="tbl-wrap"><table class="t"><thead><tr><th>Region</th><th>Adds</th><th>Share</th></tr></thead><tbody>' +
      r.rows.map(function (x) { return "<tr><td>" + esc(x.region) + "</td><td>" + num(x.count) + "</td><td>" + pc(x.w.p) + ' <span class="range">(' + pc(x.w.lo) + "–" + pc(x.w.hi) + ")</span></td></tr>"; }).join("") +
      "</tbody></table></div>" + '<p class="method">Method: share of the ' + num(r.n) + " wishlist adds from " + dl(r.start) + " to " + dl(r.end) + " with a 95% Wilson range; regions with fewer than " + M.MIN_REGION_ADDS + " adds are pooled. Source: the region column in your wishlist export.</p></section>";
  }

  function utmCard() {
    var u = G().utm, rows = R.utm;
    if (!rows.length) return "";
    var s = '<section class="card"><h3>Which links bring wishlists?</h3>' + (u.window ? '<p class="note">Period: ' + esc(u.window) + "</p>" : "");
    s += '<div class="tbl-wrap"><table class="t"><thead><tr><th>Source / medium / campaign</th><th>Visits</th><th>Wishlists</th><th>Purchases</th><th>Wishlists per 100 visits</th></tr></thead><tbody>';
    rows.slice(0, 40).forEach(function (r) {
      var nm = [r.source, r.medium, r.campaign, r.content, r.term].filter(Boolean).map(esc).join(" / ");
      s += '<tr><td class="name">' + nm + "</td><td>" + num(r.visits) + "</td><td>" + num(r.wishlists) + "</td><td>" + num(r.purchases) + "</td><td>" +
        (r.ratio ? one(r.ratio.value) + ' <span class="range">(' + one(r.ratio.lo) + "–" + one(r.ratio.hi) + ")</span>" : '<span class="range">Too few visits (needs ' + M.MIN_UTM_VISITS + ")</span>") + "</td></tr>";
    });
    s += "</tbody></table></div>";
    s += '<p class="method">Steam&rsquo;s UTM Analytics only counts wishlists and purchases within 72 hours of a click, and only for visitors logged into Steam, and it hides rows below a visit threshold. So these numbers undercount, and the totals won&rsquo;t match your wishlist report. Wishlists per 100 visits is a ratio with the wishlists&rsquo; 95% Poisson range. (<a href="' + M.UTM_SOURCE + '" target="_blank" rel="noopener">Steamworks UTM docs</a>, checked ' + M.UTM_CHECKED + ".)</p></section>";
    return s;
  }

  function sendCard() {
    var list = M.signals(R);
    var all = ["wishlist_adds_28d", "wishlist_deletes_per_100_adds_28d", "page_ctr_28d", "page_visits_to_wishlist_28d", "wishlists_outstanding"];
    var have = list.map(function (x) { return x.key; });
    var skipped = all.filter(function (k) { return have.indexOf(k) < 0; });
    var g = window.GOS && GOS.game;
    return '<section class="card"><h3>Send to ' + (g ? esc(g.title) : "your game") + "</h3>" +
      '<p class="note">Records ' + list.length + " figure" + (list.length === 1 ? "" : "s") + " in your game&rsquo;s signal ledger, each with its range, sample size, window and source." +
      (skipped.filter(function (k) { return k !== "wishlists_outstanding"; }).length ? " Not sent, because there&rsquo;s too little data: " + skipped.filter(function (k) { return k !== "wishlists_outstanding"; }).map(esc).join(", ") + "." : "") +
      (skipped.indexOf("wishlists_outstanding") >= 0 ? " Wishlists outstanding isn&rsquo;t in your data, so it isn&rsquo;t sent." : "") + (g ? "" : " Pick a game above first.") + "</p>" +
      '<div class="actions"><button class="btn" id="btn-send" type="button"' + (list.length && g ? "" : " disabled") + '>Send to game</button><span class="feedback" id="send-msg" role="status"></span></div></section>';
  }

  function wireResults() {
    var send = document.getElementById("btn-send");
    if (send) send.addEventListener("click", function () {
      var list = M.signals(R), msg = document.getElementById("send-msg");
      if (!list.length || !window.GOS || !GOS.game) return;
      send.disabled = true; msg.textContent = "Sending to " + GOS.game.title + "…";
      GOS.recordSignals(TOOL_ID, list).then(function () {
        msg.textContent = "Sent " + list.length + " figure" + (list.length === 1 ? "" : "s") + " to " + GOS.game.title + ".";
        track("output_action", { action: "send_signals", count: list.length });
        step("result_actioned", 3, { action: "send_to_game" });
      }).catch(function (e) { send.disabled = false; msg.className = "feedback err"; msg.textContent = "Couldn't send: " + e.message; });
    });
    wireTips();
  }
  var tip = document.getElementById("chart-tip");
  function wireTips() {
    out.querySelectorAll(".tipped").forEach(function (g) {
      g.addEventListener("mousemove", function (e) { tip.textContent = g.getAttribute("data-tip"); tip.style.display = "block"; tip.style.left = Math.min(e.clientX + 12, innerWidth - 270) + "px"; tip.style.top = e.clientY + 12 + "px"; });
      g.addEventListener("mouseleave", function () { tip.style.display = "none"; });
    });
  }

  /* ---------------- Data in: CSV import with a column picker, or a form ---------------- */
  var tab = "wishlists";
  var csv = null; // { series, name, rows, header, map, order } — in memory only; the file itself is never stored
  var FIELD_LABELS = {
    date: "Date", adds: "Wishlist adds", deletes: "Wishlist deletes", purchases: "Purchases", outstanding: "Wishlists outstanding (balance)", region: "Region or country",
    impressions: "Impressions", visits: "Visits", source: "UTM source", medium: "UTM medium", campaign: "UTM campaign", content: "UTM content", term: "UTM term", wishlists: "Wishlists",
  };
  var CSV_FIELDS = {
    wishlists: ["date", "adds", "deletes", "purchases", "outstanding", "region"],
    traffic: ["date", "impressions", "visits"],
    utm: ["source", "medium", "campaign", "content", "term", "visits", "wishlists", "purchases"],
  };

  function renderData() {
    var g = G(), s = '<h3>Your Steamworks numbers</h3>';
    s += '<p class="note">Steamworks figures aren&rsquo;t public, so you bring them in. Export a CSV from Steamworks and map its columns, or type the numbers in. The file is read in this browser and never uploaded: only the daily totals are saved, to your account. Never share your Steamworks login or API key with any tool, this one included.</p>';
    s += '<div class="tabs" role="tablist">' + [["wishlists", "Wishlists"], ["traffic", "Traffic"], ["utm", "UTM links"]].map(function (t) {
      return '<button type="button" role="tab" aria-selected="' + (tab === t[0]) + '" data-tab="' + t[0] + '">' + t[1] + "</button>";
    }).join("") + "</div>";
    var have = tab === "utm" ? g.utm.rows.length + " UTM rows" + (g.utm.window ? " (" + esc(g.utm.window) + ")" : "")
      : (function (list) { var csvN = 0, formN = 0; list.forEach(function (r) { if (r.src === "csv") csvN++; else formN++; }); return list.length ? list.length + " rows, " + dl(list[0].from) + " to " + dl(M.lastDate(list)) + " (" + csvN + " from exports, " + formN + " typed in)" : "nothing yet"; })(g[tab]);
    s += '<p class="note"><b>Saved:</b> ' + have + (have !== "nothing yet" && have.indexOf("0 UTM rows") !== 0 ? ' &middot; <button type="button" class="link-btn" id="btn-clear">Clear these</button>' : "") + "</p>";

    s += "<h4>Import a CSV</h4>";
    if (tab === "wishlists") s += '<p class="note">In Steamworks: your game&rsquo;s <b>Wishlists</b> report. Daily rows work best; a region column is used if you map it. Steamworks doesn&rsquo;t document whether every report exports, so if yours doesn&rsquo;t, use the form.</p>';
    if (tab === "traffic") s += '<p class="note">In Steamworks: the <b>Traffic Breakdown</b> report, with impressions and visits by day.</p>';
    if (tab === "utm") s += '<p class="note">In Steamworks: <b>UTM Analytics</b>, which has a CSV download. Steam counts wishlists and purchases there only within 72 hours of a click and only for logged-in visitors, and hides rows below a visit threshold.</p>';
    s += '<div class="file-row"><input type="file" id="csv-file" accept=".csv,.tsv,.txt,text/csv"></div><div id="csv-map"></div>';

    s += "<h4>Or type the numbers in</h4>" + formHtml();
    s += '<span class="feedback" id="data-msg" role="status"></span>';
    dataCard.innerHTML = s;
    if (csv && csv.series === tab) renderMap();
    wireData();
  }

  function formHtml() {
    var t = today();
    if (tab === "utm") return '<form class="form" id="f-data">' +
      '<label>UTM source<input name="source" required maxlength="80"></label><label>UTM medium<input name="medium" maxlength="80"></label><label>UTM campaign<input name="campaign" maxlength="80"></label>' +
      '<label>Visits<input name="visits" type="number" min="0" step="1" required></label><label>Wishlists<input name="wishlists" type="number" min="0" step="1"></label><label>Purchases<input name="purchases" type="number" min="0" step="1"></label>' +
      '<label class="wide">Period these cover<input name="window" maxlength="60" placeholder="e.g. 1–28 Nov 2026" value="' + esc(G().utm.window) + '"></label>' +
      '<div><button class="btn" type="submit">Add row</button></div></form>';
    var f = tab === "traffic" ? [["impressions", "Impressions"], ["visits", "Visits"]] : [["adds", "Adds"], ["deletes", "Deletes"], ["purchases", "Purchases"], ["outstanding", "Outstanding (optional)"]];
    return '<form class="form" id="f-data"><label>From<input name="from" type="date" required max="' + t + '" value="' + t + '"></label><label>To<input name="to" type="date" required max="' + t + '" value="' + t + '"></label>' +
      f.map(function (x) { return "<label>" + x[1] + '<input name="' + x[0] + '" type="number" min="0" step="1"></label>'; }).join("") +
      '<div><button class="btn" type="submit">Save</button></div></form><p class="note">One day, or a week&rsquo;s total (set From and To). A total replaces any days it overlaps. Weekly totals count towards the 28-day figures but can&rsquo;t go on the daily chart or into the beat reads.</p>';
  }

  function renderMap() {
    var el = document.getElementById("csv-map");
    if (!el || !csv) return;
    var fields = CSV_FIELDS[csv.series];
    var opts = function (f) {
      return '<option value="">(not in this file)</option>' + csv.header.map(function (h, i) { return '<option value="' + i + '"' + (csv.map[f] === i ? " selected" : "") + ">" + esc(h || "Column " + (i + 1)) + "</option>"; }).join("");
    };
    var s = '<p class="note">Read <b>' + esc(csv.name) + "</b>: " + (csv.rows.length - csv.headerIndex - 1) + " data rows. Check each column below. Suggestions are a guess from the column names; nothing is imported until you confirm.</p>";
    s += '<div class="tbl-wrap"><table class="t preview"><thead><tr>' + csv.header.map(function (h) { return "<th>" + esc(h) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      csv.rows.slice(csv.headerIndex + 1, csv.headerIndex + 4).map(function (r) { return "<tr>" + csv.header.map(function (_, i) { return "<td>" + esc(r[i]) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>";
    s += '<div class="map">' + fields.map(function (f) { return "<label>" + FIELD_LABELS[f] + '<select data-field="' + f + '">' + opts(f) + "</select></label>"; }).join("");
    if (csv.series !== "utm") s += '<label>Date format<select id="csv-order"><option value="ymd"' + (csv.order === "ymd" ? " selected" : "") + '>Year first (2026-11-03)</option><option value="mdy"' + (csv.order === "mdy" ? " selected" : "") + '>Month first (11/03/2026)</option><option value="dmy"' + (csv.order === "dmy" ? " selected" : "") + ">Day first (03/11/2026)</option></select></label>";
    s += "</div>";
    if (csv.series !== "utm" && csv.orderNote) s += '<p class="note">' + csv.orderNote + "</p>";
    if (csv.series === "utm") s += '<div class="form"><label class="wide">Period this export covers<input id="csv-window" maxlength="60" placeholder="e.g. 1–28 Nov 2026"></label></div>';
    s += '<div class="actions"><button class="btn" id="btn-import" type="button">Import</button><button class="btn-ghost" id="btn-cancel" type="button">Cancel</button></div>';
    el.innerHTML = s;
    el.querySelectorAll("select[data-field]").forEach(function (sel) {
      sel.addEventListener("change", function () { var f = sel.getAttribute("data-field"); if (sel.value === "") delete csv.map[f]; else csv.map[f] = +sel.value; });
    });
    var ord = document.getElementById("csv-order");
    if (ord) ord.addEventListener("change", function () { csv.order = ord.value; });
    document.getElementById("btn-cancel").addEventListener("click", function () { csv = null; renderData(); });
    document.getElementById("btn-import").addEventListener("click", doImport);
  }

  function msg(text, err) { var m = document.getElementById("data-msg"); if (m) { m.className = "feedback" + (err ? " err" : ""); m.textContent = text; } }

  function readFile(file) {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { msg("That file is over 20 MB. Export a shorter date range.", true); return; }
    var fr = new FileReader();
    fr.onload = function () {
      var p = M.parseCsv(fr.result);
      if (p.rows.length < 2) { msg("Couldn't find a table in that file.", true); return; }
      var hi = M.findHeader(p.rows), header = p.rows[hi];
      var map = M.suggest(header, CSV_FIELDS[tab]);
      var order = "ymd", note = "";
      if (map.date != null) {
        var cells = p.rows.slice(hi + 1).map(function (r) { return r[map.date]; });
        var g = M.guessDateOrder(cells);
        if (g === "dmy" || g === "mdy") order = g;
        else if (g === "ambiguous") note = "The dates could be month-first or day-first. Check the format above before importing.";
        else if (g === null) note = "The dates mix formats. Check the date column.";
        if (g === "ambiguous") order = "mdy";
      }
      csv = { series: tab, name: file.name, rows: p.rows, headerIndex: hi, header: header, map: map, order: order, orderNote: note };
      renderMap();
    };
    fr.onerror = function () { msg("Couldn't read that file.", true); };
    fr.readAsText(file);
  }

  function doImport() {
    var g = G();
    if (csv.series === "utm") {
      if (csv.map.visits == null && csv.map.wishlists == null) { msg("Pick at least the visits or wishlists column.", true); return; }
      var u = M.utmFromCsv(csv.rows, csv.headerIndex, csv.map);
      if (!u.rows.length) { msg("No UTM rows found with those columns.", true); return; }
      g.utm = { rows: u.rows.slice(0, 500), window: (document.getElementById("csv-window").value || "").trim().slice(0, 60), importedAt: Date.now() };
      done("Imported " + u.rows.length + " UTM rows" + (u.skipped ? "; skipped " + u.skipped + " that had no UTM values or numbers" : "") + ".", "csv");
      return;
    }
    if (csv.map.date == null) { msg("Pick the date column.", true); return; }
    var need = csv.series === "traffic" ? ["impressions", "visits"] : ["adds", "deletes", "purchases", "outstanding"];
    if (!need.some(function (f) { return csv.map[f] != null; })) { msg("Pick at least one number column.", true); return; }
    var t = M.tableFromCsv(csv.rows, csv.headerIndex, csv.map, csv.series, csv.order);
    if (!t.rows.length) { msg("No dated rows found. Check the date column and format.", true); return; }
    t.rows.forEach(function (r) { r.src = "csv"; });
    g[csv.series] = M.merge(g[csv.series], t.rows);
    if (csv.series === "wishlists") Object.keys(t.regions).forEach(function (d) { g.regions[d] = t.regions[d]; });
    done("Imported " + t.rows.length + " days, " + dl(t.rows[0].from) + " to " + dl(t.rows[t.rows.length - 1].to) + (t.skipped ? "; skipped " + t.skipped + " rows without a date or numbers (totals rows, for example)" : "") + ".", "csv");
  }

  function done(text, how) {
    csv = null; changed();
    step("data_entered", 1, { series: tab, how: how });
    renderData(); msg(text); render();
  }

  function wireData() {
    dataCard.querySelectorAll("[data-tab]").forEach(function (b) { b.addEventListener("click", function () { tab = b.getAttribute("data-tab"); if (csv && csv.series !== tab) csv = null; renderData(); }); });
    var f = document.getElementById("csv-file");
    if (f) f.addEventListener("change", function () { readFile(f.files && f.files[0]); f.value = ""; });
    var clr = document.getElementById("btn-clear");
    if (clr) clr.addEventListener("click", function () {
      var g = G();
      if (tab === "utm") g.utm = { rows: [], window: "", importedAt: 0 };
      else { g[tab] = []; if (tab === "wishlists") g.regions = {}; }
      changed(); renderData(); msg("Cleared."); render();
    });
    var form = document.getElementById("f-data");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(form), g = G();
      var n = function (k) { var v = fd.get(k); return v === null || v === "" ? null : Math.max(0, Number(v)); };
      if (tab === "utm") {
        var row = { source: String(fd.get("source") || "").trim().slice(0, 80), medium: String(fd.get("medium") || "").trim().slice(0, 80), campaign: String(fd.get("campaign") || "").trim().slice(0, 80), content: "", term: "",
          visits: n("visits"), wishlists: n("wishlists"), purchases: n("purchases") };
        g.utm.rows = g.utm.rows.filter(function (r) { return !(r.source === row.source && r.medium === row.medium && r.campaign === row.campaign); }).concat([row]).slice(-500);
        g.utm.window = String(fd.get("window") || "").trim().slice(0, 60);
        done("Added " + row.source + ".", "form");
        return;
      }
      var from = String(fd.get("from")), to = String(fd.get("to"));
      if (!M.isYmd(from) || !M.isYmd(to) || from > to) { msg("Check the dates: From must be on or before To.", true); return; }
      var r = { from: from, to: to, src: "form" }, any = false;
      (tab === "traffic" ? M.TRAFFIC_FIELDS : M.WISHLIST_FIELDS).forEach(function (k) { var v = n(k); if (v != null && isFinite(v)) { r[k] = v; any = true; } });
      if (!any) { msg("Enter at least one number.", true); return; }
      g[tab] = M.merge(g[tab], [r]);
      done("Saved " + (from === to ? dl(from) : dl(from) + " to " + dl(to)) + ".", "form");
    });
  }

  /* ---------------- Logs: beats and creative versions (also written to the ledger) ---------------- */
  var editing = null; // { kind, id }
  function renderLogs() {
    var g = G(), t = today();
    var eb = editing && editing.kind === "beat" ? g.beats.find(function (b) { return b.id === editing.id; }) : null;
    var ev = editing && editing.kind === "version" ? g.versions.find(function (v) { return v.id === editing.id; }) : null;
    var opt = function (list, cur) { return list.map(function (x) { return '<option value="' + esc(x) + '"' + (x === cur ? " selected" : "") + ">" + esc(x.charAt(0).toUpperCase() + x.slice(1)) + "</option>"; }).join(""); };
    var s = "<h3>Beat log</h3>";
    s += '<p class="note">Every dated marketing action: announcements, trailers, festivals, demo launches, sales, updates, creator coverage, press embargoes. This log is what turns &ldquo;wishlists jumped&rdquo; into &ldquo;wishlists jumped after the trailer&rdquo;. Each beat is also saved to your game&rsquo;s ledger, so Festival Radar, Test Loop and Creator Match can read it.</p>';
    s += '<form class="form" id="f-beat"><label>Date<input name="date" type="date" required value="' + esc(eb ? eb.date : t) + '"></label>' +
      '<label>Type<select name="type">' + opt(M.BEAT_TYPES, eb && eb.type) + "</select></label>" +
      '<label>Channel<select name="channel"><option value="">(none)</option>' + opt(M.CHANNELS, eb && eb.channel) + "</select></label>" +
      '<label>Effort<select name="effort"><option value="">(not set)</option><option value="major"' + (eb && eb.effort === "major" ? " selected" : "") + '>Major</option><option value="minor"' + (eb && eb.effort === "minor" ? " selected" : "") + ">Minor</option></select></label>" +
      '<label>Spend (optional)<input name="spend" type="number" min="0" step="any" value="' + (eb && eb.spend != null ? eb.spend : "") + '"></label>' +
      '<label class="wide">Note<input name="note" maxlength="300" value="' + esc(eb ? eb.note : "") + '" placeholder="e.g. Gameplay trailer on IGN"></label>' +
      '<div><button class="btn" type="submit">' + (eb ? "Save changes" : "Log beat") + "</button>" + (eb ? ' <button class="btn-ghost" type="button" data-cancel>Cancel</button>' : "") + "</div></form>";
    s += '<span class="feedback" id="beat-msg" role="status"></span>';
    var beats = g.beats.filter(function (b) { return !b.deleted; });
    s += beats.length ? '<ul class="log-list">' + beats.map(function (b) {
      return '<li><span class="d">' + dl(b.date) + '</span><span class="t"><b>' + esc(b.type) + "</b>" + (b.channel ? " on " + esc(b.channel) : "") + (b.effort ? " &middot; " + esc(b.effort) : "") + (b.spend != null ? " &middot; spend " + num(b.spend) : "") + (b.note ? " &middot; " + esc(b.note) : "") +
        '</span><span class="x"><button class="btn-small" type="button" data-edit="beat:' + esc(b.id) + '">Edit</button><button class="btn-small" type="button" data-del="beat:' + esc(b.id) + '">Delete</button></span></li>';
    }).join("") + "</ul>" : '<p class="note">No beats yet.</p>';

    s += '<h3 style="margin-top:24px">Store asset versions</h3>';
    s += '<p class="note">Every change to the capsule, header, trailer, screenshots or short description gets a row with the date it went live. Without this, no lift can ever be put down to a change.</p>';
    s += '<form class="form" id="f-ver"><label>Live from<input name="date" type="date" required value="' + esc(ev ? ev.date : t) + '"></label>' +
      '<label>Asset<select name="asset">' + opt(M.ASSETS, ev && ev.asset) + "</select></label>" +
      '<label>Version label<input name="label" required maxlength="60" value="' + esc(ev ? ev.label : "") + '" placeholder="e.g. Capsule v3"></label>' +
      '<label class="wide">Note<input name="note" maxlength="300" value="' + esc(ev ? ev.note : "") + '" placeholder="What changed"></label>' +
      '<div><button class="btn" type="submit">' + (ev ? "Save changes" : "Log change") + "</button>" + (ev ? ' <button class="btn-ghost" type="button" data-cancel>Cancel</button>' : "") + "</div></form>";
    s += '<span class="feedback" id="ver-msg" role="status"></span>';
    var vers = g.versions.filter(function (v) { return !v.deleted; });
    s += vers.length ? '<ul class="log-list">' + vers.map(function (v) {
      return '<li><span class="d">' + dl(v.date) + '</span><span class="t"><b>' + esc(v.asset) + "</b> " + esc(v.label) + ' <span class="range">(version ' + v.number + ")</span>" + (v.note ? " &middot; " + esc(v.note) : "") +
        '</span><span class="x"><button class="btn-small" type="button" data-edit="version:' + esc(v.id) + '">Edit</button><button class="btn-small" type="button" data-del="version:' + esc(v.id) + '">Delete</button></span></li>';
    }).join("") + "</ul>" : '<p class="note">No asset changes logged yet.</p>';
    logsCard.innerHTML = s;
    wireLogs();
  }

  /** Save locally first, then append the row to the ledger. A failed ledger write is reported, and the local copy kept. */
  function saveLog(kind, entry, msgId, okText) {
    var g = G();
    if (kind === "beat") g.beats = M.mergeLog(g.beats, [entry]); else g.versions = M.mergeLog(g.versions, [entry]);
    editing = null; changed(); renderLogs(); render();
    var m = document.getElementById(msgId);
    if (!window.GOS || !GOS.game) { if (m) m.textContent = okText + " Saved in this browser; pick a game to share it with other tools."; return; }
    if (m) m.textContent = okText + " Saving to " + GOS.game.title + "…";
    var row = kind === "beat" ? M.beatSignal(entry) : M.versionSignal(entry);
    GOS.recordSignals(TOOL_ID, [row]).then(function () {
      var m2 = document.getElementById(msgId); if (m2) m2.textContent = okText + " Saved to " + GOS.game.title + ".";
    }).catch(function (e) {
      var m2 = document.getElementById(msgId); if (m2) { m2.className = "feedback err"; m2.textContent = okText + " Saved here, but not to the game ledger: " + e.message; }
    });
  }

  function wireLogs() {
    var fb = document.getElementById("f-beat"), fv = document.getElementById("f-ver");
    fb.addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(fb), date = String(fd.get("date"));
      if (!M.isYmd(date)) return;
      var old = editing && editing.kind === "beat" ? G().beats.find(function (b) { return b.id === editing.id; }) : null;
      var spend = fd.get("spend") === "" ? null : Math.max(0, Number(fd.get("spend")));
      var b = M.cleanBeat({ id: old ? old.id : uid(), date: date, type: fd.get("type"), channel: fd.get("channel"), effort: fd.get("effort"), spend: isFinite(spend) ? spend : null, note: fd.get("note"), updated: Date.now() });
      saveLog("beat", b, "beat-msg", old ? "Updated." : "Logged.");
      if (!old) step("beat_logged", 3, { type: b.type });
    });
    fv.addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(fv), date = String(fd.get("date")), asset = String(fd.get("asset"));
      if (!M.isYmd(date)) return;
      var old = editing && editing.kind === "version" ? G().versions.find(function (v) { return v.id === editing.id; }) : null;
      var number = old && old.asset === asset ? old.number : M.nextVersion(G().versions, asset);
      var v = M.cleanVersion({ id: old ? old.id : uid(), date: date, asset: asset, label: fd.get("label"), number: number, note: fd.get("note"), updated: Date.now() });
      saveLog("version", v, "ver-msg", old ? "Updated." : "Logged.");
      if (!old) step("beat_logged", 3, { type: "creative_version", asset: asset });
    });
    logsCard.querySelectorAll("[data-cancel]").forEach(function (b) { b.addEventListener("click", function () { editing = null; renderLogs(); }); });
    logsCard.querySelectorAll("[data-edit]").forEach(function (b) {
      b.addEventListener("click", function () { var p = b.getAttribute("data-edit").split(":"); editing = { kind: p[0], id: p.slice(1).join(":") }; renderLogs(); logsCard.querySelector(p[0] === "beat" ? "#f-beat" : "#f-ver").scrollIntoView({ block: "center" }); });
    });
    logsCard.querySelectorAll("[data-del]").forEach(function (b) {
      b.addEventListener("click", function () {
        var p = b.getAttribute("data-del").split(":"), kind = p[0], id = p.slice(1).join(":"), g = G();
        var list = kind === "beat" ? g.beats : g.versions, x = list.find(function (y) { return y.id === id; });
        if (!x) return;
        saveLog(kind, Object.assign({}, x, { deleted: true, updated: Date.now() }), kind === "beat" ? "beat-msg" : "ver-msg", "Deleted.");
      });
    });
  }

  /** Pull beats and versions from the game's ledger (logged by teammates or on another device) and merge them in. */
  function syncLogs() {
    if (!window.GOS || !GOS.game) return Promise.resolve();
    var id = GOS.game.id;
    return fetch("/api/games/" + encodeURIComponent(id) + "/signals?all=1&days=365", { credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !window.GOS || !GOS.game || GOS.game.id !== id) return;
        var logs = M.logsFromLedger((j.rows || []).filter(function (r) { return r.key === "beat" || r.key === "creative_version"; }));
        var g = G(), nb = M.mergeLog(g.beats, logs.beats), nv = M.mergeLog(g.versions, logs.versions);
        if (JSON.stringify(nb) !== JSON.stringify(g.beats) || JSON.stringify(nv) !== JSON.stringify(g.versions)) { g.beats = nb; g.versions = nv; changed(); renderLogs(); render(); }
      }).catch(function () {});
  }

  /* ---------------- About ---------------- */
  function about() {
    var items = [
      "<b>Sources:</b> studio-submitted Steamworks numbers. CSVs are read in your browser and never uploaded; only the daily totals (and the regional split for the last " + REGION_DAYS + " days) are saved to your account. Numbers you type in are marked as typed in. Each figure sent to your game says which it came from.",
      "<b>Column mapping:</b> Steamworks doesn&rsquo;t publish its export formats, so you confirm which column is which. Nothing is assumed from the column names beyond a first suggestion.",
      "<b>Ranges, not single numbers:</b> counts carry exact 95% Poisson ranges; click-through carries a 95% Wilson range. A change is called up or down only when the two ranges don&rsquo;t overlap. That&rsquo;s cautious on purpose.",
      "<b>Minimums:</b> a window needs data on " + Math.round(M.MIN_COVERAGE * 100) + "% of its days; velocity changes need " + M.MIN_WINDOW_COUNT + " adds across both windows; deletes per 100 adds needs " + M.MIN_ADDS_FOR_DELETES + " adds; click-through needs " + num(M.MIN_IMPRESSIONS) + " impressions; wishlists per 100 visits needs " + M.MIN_VISITS + " visits; a beat read needs " + M.MIN_BASELINE_DAYS + " of the " + M.BEAT_BEFORE_DAYS + " days before it and all " + M.BEAT_AFTER_DAYS + " days from it. Below these the page says &ldquo;too few to read yet&rdquo; and sends nothing.",
      "<b>No outside benchmarks:</b> there&rsquo;s no shared pool of other studios&rsquo; numbers yet, so every comparison is with your own earlier weeks.",
      "<b>Reach or Resonance:</b> impressions, click-through, wishlist adds and outstanding wishlists are Reach. Wishlists per 100 visits and deletes per 100 adds are Resonance.",
      "<b>Beats and asset versions</b> are saved to your game&rsquo;s signal ledger as their own rows (not measurements), so other Game OS tools can line their numbers up against them.",
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
      .catch(function (e) { status(e.message === "too large" ? "Too much data to save to your account; clear older imports" : "Couldn't save to your account; your numbers are still in this browser", "error"); });
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
  function all() { render(); renderData(); renderLogs(); }
  initAccount().then(start, start);
  function start() {
    booted = true; lastGame = gid();
    all(); syncLogs();
  }
  if (window.GOS && GOS.onChange) {
    GOS.onChange(function () {
      if (!booted) return;
      var id = gid();
      if (id === lastGame) { render(); return; } // ledger refreshed (e.g. after a send): redraw the audit line
      lastGame = id; editing = null; csv = null; viewed = false; all(); syncLogs();
    });
  }
})();
