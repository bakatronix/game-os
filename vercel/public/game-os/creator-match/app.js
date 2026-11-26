/* Creator Match — page logic. The maths lives in model.js (window.CreatorModel).
 * Studio data: the Twitch Game Developer Analytics CSV (parsed in this browser; the raw file is never uploaded or kept)
 * and the studio's own creator list and outreach log, saved per game to the account.
 * Live data: YouTube and Twitch results are shown on request and never stored, summed, ranked or sent to the ledger (brief §3).
 * Coverage logged here is also written to the ledger as a Page Engine beat ("creator coverage"). */
(function () {
  "use strict";
  var M = window.CreatorModel, PM = window.PageModel;
  var TOOL_ID = "creator-match";
  var LS_KEY = "gos_creator_match_v1";
  var PE_LS_KEY = "gos_page_engine_v1";
  var ACCOUNT_URL = "/api/tool-state/" + TOOL_ID;
  var CHART_DAYS = 90;          // days drawn on the Twitch chart
  var FOLLOW_UP_DAYS = 14;      // a contact with no answer after this many days is suggested for a follow-up
  var MAX_CONTACTS = 1000;      // keeps the saved list well under the 512 KB tool-state limit
  var MAX_COMPS = 8;            // comps offered for live searches

  /* ---------------- State: per game, the Twitch daily table and the creator list ---------------- */
  function emptyGame() { return { twitch: [], contacts: [] }; }
  function emptyState() { return { games: {}, savedAt: 0 }; }
  function cleanTwitch(list) {
    return (Array.isArray(list) ? list : []).filter(function (r) { return r && PM.isYmd(r.from) && PM.isYmd(r.to) && r.from <= r.to; }).map(function (r) {
      var o = { from: r.from, to: r.to, src: "csv" };
      ["hours", "viewers", "broadcasters"].forEach(function (f) { if (typeof r[f] === "number" && isFinite(r[f])) o[f] = r[f]; });
      return o;
    });
  }
  function normalise(s) {
    if (!s || typeof s !== "object") return null;
    var b = emptyState();
    b.savedAt = Number(s.savedAt) || 0;
    Object.keys(s.games || {}).forEach(function (id) {
      var g = s.games[id] || {}, o = emptyGame();
      o.twitch = cleanTwitch(g.twitch);
      o.contacts = (g.contacts || []).map(M.cleanContact).filter(Boolean).slice(-MAX_CONTACTS);
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
  function pc(p) { return p == null || !isFinite(p) ? "—" : (p * 100).toFixed(0) + "%"; }
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function dl(ymd) { if (!ymd) return "—"; var p = String(ymd).split("-"); return +p[2] + " " + MONTHS[+p[1] - 1] + " " + p[0]; }
  function ds(ymd) { var p = String(ymd).split("-"); return +p[2] + " " + MONTHS[+p[1] - 1]; }
  function today() { var d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function track(name, props) { if (typeof window.gosTrack === "function") window.gosTrack(name, Object.assign({ tool_id: TOOL_ID }, props || {})); }
  function step(name, index, extra) { track("journey_step", Object.assign({ step_name: name, step_index: index }, extra || {})); }
  function safeUrl(u) { return /^https:\/\//i.test(String(u || "")) ? String(u) : ""; }
  function half() { return '<span class="half reach">Reach</span>'; }
  function statusBadge(c) {
    var s = M.isCovered(c) ? "covered" : c.contacted ? (c.status || "contacted") : "not contacted";
    return '<span class="status ' + s.replace(/ /g, "-") + '">' + esc(s) + "</span>";
  }

  var out = document.getElementById("out");
  var twitchCard = document.getElementById("twitch-card");
  var liveCard = document.getElementById("live-card");
  var outreachCard = document.getElementById("outreach-card");
  var F = null, O = null;
  var viewed = false;
  var ledgerLogs = { beats: [], versions: [] };   // all beats and versions in the game's ledger (any tool)
  var pageWishlists = null;                        // Page Engine's daily wishlist table for this game, if any

  /* ---------------- Beats: the game's ledger plus coverage logged here ---------------- */
  function allBeats() {
    var local = G().contacts.map(function (c) { return M.coverageBeat(c, c.updated); }).filter(function (b) { return b && !b.deleted; });
    return PM.mergeLog(ledgerLogs.beats, local).filter(function (b) { return !b.deleted; });
  }

  /* ---------------- Render: the answer and results ---------------- */
  function render() {
    var g = G();
    F = M.footprint(g.twitch);
    O = M.outreach(g.contacts);
    if (F.empty && !O.listed) {
      out.innerHTML = '<section class="card answer"><h3>The answer</h3><p class="verdict">Nothing to read yet. Creator Match needs your Twitch numbers, or a list of the creators you&rsquo;re talking to.</p>' +
        '<p class="next">Next: search below for videos and streams about your game and your comps, and add the creators worth contacting to your list. If your game has been streamed, upload your Twitch developer analytics too.</p></section>';
      return;
    }
    out.innerHTML = answer() + footprintCard() + coverageCard() + sendCard();
    wireResults();
    if (!viewed && !F.empty) { viewed = true; step("footprint_viewed", 1, { source: "twitch_csv" }); }
  }

  function followUps() {
    var cut = PM.addDays(today(), -FOLLOW_UP_DAYS);
    return G().contacts.filter(function (c) { return !c.deleted && c.contacted && c.contacted <= cut && (c.status === "contacted" || !c.status) && !M.isCovered(c); });
  }

  function answer() {
    var lines = [], next;
    if (!F.empty && F.hours.enough) {
      var b = F.broadcasters;
      lines.push("Your game had <b>" + one(F.hours.count) + " hours watched</b> on Twitch in the 28 days to " + dl(F.end) +
        (b.enough ? ", across <b>" + num(b.count) + " broadcaster-days</b>" + (F.bChange === "up" ? ", more than the 28 days before, beyond chance" : F.bChange === "down" ? ", fewer than the 28 days before, beyond chance" : F.bChange === "flat" ? ", with no clear change on the 28 days before" : "") : "") + ".");
    } else if (!F.empty) lines.push("Your Twitch export doesn&rsquo;t cover enough of the last 28 days to read yet (data on " + F.hours.covered + " of 28 days; needs " + Math.ceil(28 * M.MIN_COVERAGE) + ").");
    if (O.contacted) {
      var r = O.rate;
      lines.push("You&rsquo;ve contacted <b>" + num(O.contacted) + " creator" + (O.contacted === 1 ? "" : "s") + "</b>. " + num(O.replies) + " replied and <b>" + num(O.covered) + " covered</b> the game." +
        (O.enough ? " Reply rate: " + pc(r.p) + " (" + pc(r.lo) + "–" + pc(r.hi) + ", n = " + O.contacted + ")." : " The reply rate shows once " + M.MIN_CONTACTED + " are contacted."));
    } else if (O.listed) lines.push("You have " + num(O.listed) + " creator" + (O.listed === 1 ? "" : "s") + " on your list and none contacted yet.");
    var lifts = coverageLifts().filter(function (x) { return x.enough; });
    var rises = lifts.filter(function (x) { return x.verdict === "rise"; }).length;
    if (lifts.length) lines.push(rises + " of " + lifts.length + " coverage beat" + (lifts.length === 1 ? "" : "s") + " with enough wishlist data " + (lifts.length === 1 ? "was" : "were") + " associated with a rise in wishlist adds.");
    var fu = followUps();
    if (fu.length) next = "Next: " + fu.length + " creator" + (fu.length === 1 ? " hasn&rsquo;t" : "s haven&rsquo;t") + " answered in " + FOLLOW_UP_DAYS + " days or more. A short, personal follow-up is worth sending, or mark them &ldquo;no reply&rdquo; so the rate stays honest.";
    else if (!O.contacted && O.listed) next = "Next: write to the creators on your list. Personal notes to people who already cover games like yours do better than a mass mailing. Log each one here when you send it.";
    else if (O.covered && !lifts.length) next = "Next: import daily wishlists in Page Engine so each coverage can be read against wishlist adds.";
    else if (F.empty) next = "Next: if your game has been streamed, upload your Twitch developer analytics below to see who is already playing it on stream.";
    else next = "Next: keep logging every contact and every piece of coverage. Each coverage date goes on Page Engine&rsquo;s chart as a beat, so you can see whether it moved wishlists.";
    return '<section class="card answer"><h3>The answer</h3>' + lines.map(function (l) { return '<p class="verdict">' + l + "</p>"; }).join("") + '<p class="next">' + next + "</p>" +
      '<p class="method">Every figure here comes from your own data: your Twitch export and your outreach log. Nothing is compared with other studios, because there&rsquo;s no shared benchmark yet. YouTube and Twitch search results are shown live and never counted into these numbers.</p></section>';
  }

  function tooFew(text) { return '<div class="s">Too few to read yet (' + text + ")</div>"; }

  function footprintCard() {
    if (F.empty) return "";
    var h = F.hours, b = F.broadcasters, v = F.viewers;
    var s = '<section class="card"><h3>Your Twitch footprint</h3><div class="kpis three">';
    s += '<div class="kpi"><div class="v">' + (h.enough ? one(h.count) : "—") + '</div><div class="l">Hours watched, 28 days ' + half() + "</div>" +
      (h.enough ? '<div class="s">' + dl(h.start) + " to " + dl(h.end) + "</div>" + '<div class="s">28 days before: ' + (F.hoursBefore.enough ? one(F.hoursBefore.count) : "not enough data") + "</div>"
        : tooFew("data on " + h.covered + " of 28 days")) + "</div>";
    s += '<div class="kpi"><div class="v">' + (b.enough ? num(b.count) : "—") + '</div><div class="l">Broadcaster-days, 28 days ' + half() + "</div>" +
      (b.enough ? '<div class="s">' + num(Math.round(F.bRate.lo * b.covered)) + "–" + num(Math.round(F.bRate.hi * b.covered)) + " (95% range)</div>" +
        '<div class="s">vs ' + (F.broadcastersBefore.enough ? num(F.broadcastersBefore.count) : "—") + " before: " + (F.bChange === "up" ? "&uarr; up" : F.bChange === "down" ? "&darr; down" : F.bChange === "flat" ? "no clear change" : "not enough to compare") + "</div>"
        : tooFew("data on " + b.covered + " of 28 days")) + "</div>";
    s += '<div class="kpi"><div class="v">' + (v.enough ? num(v.count) : "—") + '</div><div class="l">Viewer-days, 28 days</div><div class="s">' + (v.enough ? "Sum of daily unique viewers; shown, not sent" : "Not in your data") + "</div></div>";
    s += "</div>" + twitchChart();
    s += '<p class="method">Source: your Twitch Game Developer Analytics export. Broadcaster-days adds up each day&rsquo;s unique broadcasters, so one creator streaming on three days counts three times; it is not the number of different creators. It has an exact 95% Poisson range and is called up or down only when the two 28-day ranges don&rsquo;t overlap. Hours watched is a total of watch time, not a count of events, so it gets no range and no up/down call. A 28-day window counts only when ' + Math.round(M.MIN_COVERAGE * 100) + "% of its days are in your export.</p></section>";
    return s;
  }

  function twitchChart() {
    var daily = M.daily(G().twitch), end = F.end, start = PM.addDays(end, -(CHART_DAYS - 1));
    var first = Object.keys(daily).sort().filter(function (d) { return d >= start && d <= end; })[0];
    if (!first) return "";
    if (PM.daysBetween(first, end) >= 13) start = first;
    var span = PM.daysBetween(start, end) + 1, max = 0, dates = [];
    for (var i = 0; i < span; i++) { var d = PM.addDays(start, i); dates.push(d); if (daily[d] && daily[d].hours > max) max = daily[d].hours; }
    max = Math.max(1, max);
    var W = 720, H = 236, L = 40, T = 36, B = 22, bw = (W - L) / span;
    var y = function (v) { return H - B - (v / max) * (H - T - B); };
    var s = '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Daily Twitch hours watched, last ' + span + ' days, with marketing beats marked">';
    [0, 0.5, 1].forEach(function (f) { var v = max * f; s += '<line class="grid" x1="' + L + '" x2="' + W + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text x="' + (L - 4) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + one(v) + "</text>"; });
    dates.forEach(function (d, i) {
      var x = L + i * bw, r = daily[d];
      if (r && r.hours != null) s += '<g class="tipped" data-tip="' + esc(dl(d) + ": " + one(r.hours) + " hours watched" + (r.broadcasters != null ? ", " + num(r.broadcasters) + " broadcasters" : "")) + '"><rect class="b-hrs" x="' + (x + 0.5) + '" y="' + y(r.hours) + '" width="' + Math.max(1, bw - 1) + '" height="' + (y(0) - y(r.hours)) + '"/><rect class="hit" x="' + x + '" y="' + T + '" width="' + bw + '" height="' + (H - T - B) + '"/></g>';
      if (i % Math.max(7, Math.round(span / 6)) === 0) s += '<text x="' + x + '" y="' + (H - 6) + '">' + ds(d) + "</text>";
    });
    var n = 0;
    allBeats().filter(function (b) { return b.date >= start && b.date <= end; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; }).forEach(function (b) {
      n++;
      var x = L + (PM.daysBetween(start, b.date) + 0.5) * bw;
      s += '<g class="tipped" data-tip="' + esc(n + ". " + dl(b.date) + ": " + b.type + (b.channel ? " on " + b.channel : "") + (b.note ? " (" + b.note + ")" : "")) + '"><line class="m-beat" x1="' + x + '" x2="' + x + '" y1="' + T + '" y2="' + y(0) + '"/><text class="m-beat-l" x="' + x + '" y="' + (T - 20) + '" text-anchor="middle">' + n + '</text><rect class="hit" x="' + (x - 5) + '" y="' + T + '" width="10" height="' + (H - T - B) + '"/></g>';
    });
    s += "</svg>";
    return s + '<div class="legend"><span><i class="hrs"></i>Hours watched a day</span><span><i class="beat"></i>Beat from your game&rsquo;s log (numbered)</span></div>';
  }

  /** Coverage beats read against Page Engine's daily wishlist adds (same method as Page Engine's beat table). */
  function coverageLifts() {
    if (!pageWishlists || !pageWishlists.length) return [];
    return PM.beatLift(pageWishlists, allBeats(), ledgerLogs.versions).filter(function (r) { return r.beat.type === "creator coverage"; });
  }

  function coverageCard() {
    var covered = G().contacts.filter(M.isCovered);
    if (!covered.length) return "";
    var s = '<section class="card"><h3>Is coverage bringing players?</h3>';
    var rows = coverageLifts();
    if (!pageWishlists || !pageWishlists.length) {
      s += '<p class="note">Each piece of coverage you log is saved to your game as a &ldquo;creator coverage&rdquo; beat. To read it against wishlist adds, import your daily wishlists in <a href="/game-os/page-engine">Page Engine</a>; the coverage then shows on its beat chart too.</p></section>';
      return s;
    }
    var byBeat = {};
    covered.forEach(function (c) { byBeat["cm-" + c.id] = c; });
    s += '<div class="tbl-wrap"><table class="t beats"><thead><tr><th>Coverage</th><th>Read</th><th>7 days from coverage</th><th>Usual 7 days</th></tr></thead><tbody>';
    rows.forEach(function (r) {
      var b = r.beat, c = byBeat[b.id], cov = c && safeUrl(c.coverageLink);
      var who = c ? (cov ? '<a href="' + esc(cov) + '" target="_blank" rel="noopener">' + esc(c.creator) + "</a>" : esc(c.creator)) : esc(b.note || "coverage");
      var name = dl(b.date) + ": " + who + (b.channel ? " on " + esc(b.channel) : "");
      if (!r.enough) { s += '<tr><td class="name">' + name + '</td><td colspan="3">Too few days of daily adds to read (' + r.beforeDays + " of " + PM.BEAT_BEFORE_DAYS + " days before, needs " + PM.MIN_BASELINE_DAYS + "; " + r.afterDays + " of " + PM.BEAT_AFTER_DAYS + " days from the coverage, needs all)</td></tr>"; return; }
      var read = r.verdict === "rise" ? '<span class="badge good">Associated with a rise</span>' : r.verdict === "fall" ? '<span class="badge bad">Associated with a fall</span>' : '<span class="badge warn">No clear change</span>';
      if (r.overlaps.length) read += '<div class="s">Can&rsquo;t be separated from ' + r.overlaps.map(function (o) { return esc(o.label) + " (" + ds(o.date) + ")"; }).join(", ") + "</div>";
      s += '<tr><td class="name">' + name + '</td><td class="read">' + read + '</td><td data-l="7 days from coverage">' + num(r.after) + ' <span class="range">(' + num(r.lo) + "–" + num(r.hi) + ')</span></td><td data-l="Usual 7 days">' + num(r.expected) + "</td></tr>";
    });
    s += "</tbody></table></div>";
    s += '<p class="method">Wishlist adds come from your Page Engine data. Method, as in Page Engine: adds on the coverage day and the six days after, against 7 &times; the median day in the ' + PM.BEAT_BEFORE_DAYS + " days before, with an exact 95% Poisson range. &ldquo;Associated with&rdquo;, not &ldquo;caused by&rdquo;. Coverage within " + PM.BEAT_AFTER_DAYS + " days of another beat can&rsquo;t be told apart from it. Some coverage brings players long after it goes up, which this week-long read misses.</p></section>";
    return s;
  }

  function sendCard() {
    var list = M.signals(F, O, today());
    var have = list.map(function (x) { return x.key; });
    var skipped = ["twitch_hours_watched_28d", "twitch_broadcasters_28d", "outreach_contacted", "outreach_covered", "outreach_reply_rate"].filter(function (k) { return have.indexOf(k) < 0; });
    var g = window.GOS && GOS.game;
    return '<section class="card"><h3>Send to ' + (g ? esc(g.title) : "your game") + "</h3>" +
      '<p class="note">Records ' + list.length + " figure" + (list.length === 1 ? "" : "s") + " in your game&rsquo;s signal ledger, each with its sample size, window and source. Only your own Twitch export and outreach log are sent; nothing from YouTube or the Twitch API." +
      (skipped.length ? " Not sent, because there&rsquo;s no data or too little: " + skipped.map(esc).join(", ") + "." : "") + (g ? "" : " Pick a game above first.") + "</p>" +
      '<div class="actions"><button class="btn" id="btn-send" type="button"' + (list.length && g ? "" : " disabled") + '>Send to game</button><span class="feedback" id="send-msg" role="status"></span></div></section>';
  }

  function wireResults() {
    var send = document.getElementById("btn-send");
    if (send) send.addEventListener("click", function () {
      var list = M.signals(F, O, today()), msg = document.getElementById("send-msg");
      if (!list.length || !window.GOS || !GOS.game) return;
      send.disabled = true; msg.textContent = "Sending to " + GOS.game.title + "…";
      GOS.recordSignals(TOOL_ID, list).then(function () {
        msg.textContent = "Sent " + list.length + " figure" + (list.length === 1 ? "" : "s") + " to " + GOS.game.title + ".";
        track("output_action", { action: "send_signals", count: list.length });
      }).catch(function (e) { send.disabled = false; msg.className = "feedback err"; msg.textContent = "Couldn't send: " + e.message; });
    });
    wireTips(out);
  }
  var tip = document.getElementById("chart-tip");
  function wireTips(root) {
    root.querySelectorAll(".tipped").forEach(function (g) {
      g.addEventListener("mousemove", function (e) { tip.textContent = g.getAttribute("data-tip"); tip.style.display = "block"; tip.style.left = Math.min(e.clientX + 12, innerWidth - 270) + "px"; tip.style.top = e.clientY + 12 + "px"; });
      g.addEventListener("mouseleave", function () { tip.style.display = "none"; });
    });
  }

  /* ---------------- Part A: Twitch CSV import with a column picker ---------------- */
  var csv = null; // { name, rows, headerIndex, header, map, order, orderNote } — in memory only
  var FIELD_LABELS = { date: "Date", hours: "Hours watched", minutes: "Minutes watched (if there's no hours column)", viewers: "Unique viewers", broadcasters: "Unique broadcasters" };

  function renderTwitch() {
    var g = G(), s = "<h3>Your Twitch numbers</h3>";
    var t = g.twitch;
    s += '<p class="note">Twitch gives the studio a daily CSV of hours watched, unique viewers and unique broadcasters for its game, covering up to the past year. The file is read in this browser and never uploaded: only the daily totals are saved, to your account.</p>';
    if (!t.length) s += '<div class="notice warn"><b>No Twitch export yet.</b> To get one, claim your game in the <a href="https://dev.twitch.tv/console" target="_blank" rel="noopener">Twitch developer console</a> (under Games), then download its analytics. Twitch only offers the export once the game has been streamed for at least ' + M.TWITCH_MIN_MINUTES + " minutes in the period. If it isn&rsquo;t there, your game hasn&rsquo;t been streamed enough yet; the live lists below still work.</div>";
    else s += '<p class="note"><b>Saved:</b> ' + t.length + " days, " + dl(t[0].from) + " to " + dl(PM.lastDate(t)) + ' &middot; <button type="button" class="link-btn" id="btn-clear-tw">Clear</button></p>';
    s += '<div class="file-row"><input type="file" id="tw-file" accept=".csv,.tsv,.txt,text/csv" aria-label="Twitch analytics CSV"></div><div id="tw-map"></div><span class="feedback" id="tw-msg" role="status"></span>';
    twitchCard.innerHTML = s;
    if (csv) renderMap();
    var f = document.getElementById("tw-file");
    f.addEventListener("change", function () { readFile(f.files && f.files[0]); f.value = ""; });
    var clr = document.getElementById("btn-clear-tw");
    if (clr) clr.addEventListener("click", function () { G().twitch = []; changed(); renderTwitch(); twMsg("Cleared."); render(); });
  }
  function twMsg(text, err) { var m = document.getElementById("tw-msg"); if (m) { m.className = "feedback" + (err ? " err" : ""); m.textContent = text; } }

  function renderMap() {
    var el = document.getElementById("tw-map");
    if (!el || !csv) return;
    var opts = function (f) {
      return '<option value="">(not in this file)</option>' + csv.header.map(function (h, i) { return '<option value="' + i + '"' + (csv.map[f] === i ? " selected" : "") + ">" + esc(h || "Column " + (i + 1)) + "</option>"; }).join("");
    };
    var s = '<p class="note">Read <b>' + esc(csv.name) + "</b>: " + (csv.rows.length - csv.headerIndex - 1) + " data rows. Check each column below. The suggestions are a guess from the column names; nothing is imported until you confirm.</p>";
    s += '<div class="tbl-wrap"><table class="t preview"><thead><tr>' + csv.header.map(function (h) { return "<th>" + esc(h) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      csv.rows.slice(csv.headerIndex + 1, csv.headerIndex + 4).map(function (r) { return "<tr>" + csv.header.map(function (_, i) { return "<td>" + esc(r[i]) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>";
    s += '<div class="map">' + ["date", "hours", "minutes", "viewers", "broadcasters"].map(function (f) { return "<label>" + FIELD_LABELS[f] + '<select data-field="' + f + '">' + opts(f) + "</select></label>"; }).join("");
    s += '<label>Date format<select id="tw-order"><option value="ymd"' + (csv.order === "ymd" ? " selected" : "") + '>Year first (2026-11-03)</option><option value="mdy"' + (csv.order === "mdy" ? " selected" : "") + '>Month first (11/03/2026)</option><option value="dmy"' + (csv.order === "dmy" ? " selected" : "") + ">Day first (03/11/2026)</option></select></label></div>";
    if (csv.orderNote) s += '<p class="note">' + csv.orderNote + "</p>";
    s += '<div class="actions"><button class="btn" id="btn-tw-import" type="button">Import</button><button class="btn-ghost" id="btn-tw-cancel" type="button">Cancel</button></div>';
    el.innerHTML = s;
    el.querySelectorAll("select[data-field]").forEach(function (sel) {
      sel.addEventListener("change", function () { var f = sel.getAttribute("data-field"); if (sel.value === "") delete csv.map[f]; else csv.map[f] = +sel.value; });
    });
    document.getElementById("tw-order").addEventListener("change", function (e) { csv.order = e.target.value; });
    document.getElementById("btn-tw-cancel").addEventListener("click", function () { csv = null; renderTwitch(); });
    document.getElementById("btn-tw-import").addEventListener("click", doImport);
  }

  function readFile(file) {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { twMsg("That file is over 20 MB. Export a shorter date range.", true); return; }
    var fr = new FileReader();
    fr.onload = function () {
      var p = PM.parseCsv(fr.result);
      if (p.rows.length < 2) { twMsg("Couldn't find a table in that file.", true); return; }
      var hi = PM.findHeader(p.rows), header = p.rows[hi], map = M.suggest(header), order = "ymd", note = "";
      if (map.date != null) {
        var g = PM.guessDateOrder(p.rows.slice(hi + 1).map(function (r) { return r[map.date]; }));
        if (g === "dmy" || g === "mdy") order = g;
        else if (g === "ambiguous") { order = "mdy"; note = "The dates could be month-first or day-first. Check the format above before importing."; }
        else if (g === null) note = "The dates mix formats. Check the date column.";
      }
      csv = { name: file.name, rows: p.rows, headerIndex: hi, header: header, map: map, order: order, orderNote: note };
      renderMap();
    };
    fr.onerror = function () { twMsg("Couldn't read that file.", true); };
    fr.readAsText(file);
  }

  function doImport() {
    if (csv.map.date == null) { twMsg("Pick the date column.", true); return; }
    if (csv.map.hours == null && csv.map.minutes == null && csv.map.broadcasters == null && csv.map.viewers == null) { twMsg("Pick at least one number column.", true); return; }
    var t = M.twitchFromCsv(csv.rows, csv.headerIndex, csv.map, csv.order);
    if (!t.rows.length) { twMsg("No dated rows found. Check the date column and format.", true); return; }
    var g = G();
    g.twitch = PM.merge(g.twitch, t.rows);
    csv = null; changed();
    renderTwitch();
    twMsg("Imported " + t.rows.length + " days, " + dl(t.rows[0].from) + " to " + dl(t.rows[t.rows.length - 1].to) + (t.skipped ? "; skipped " + t.skipped + (t.skipped === 1 ? " row" : " rows") + " without a date or numbers (totals rows, for example)" : "") + ".");
    render();
  }

  /* ---------------- Parts A and B: live YouTube and Twitch (shown, never stored) ---------------- */
  var live = {}; // key → { state: "loading" | "done", body } — this page view only

  function comps() {
    var list = (window.GOS && GOS.thesis && Array.isArray(GOS.thesis.compSet) ? GOS.thesis.compSet : []).filter(function (c) { return c && c.name; });
    var seen = {};
    return list.map(function (c) { return String(c.name).trim().slice(0, 100); }).filter(function (n) { var k = n.toLowerCase(); if (!n || seen[k]) return false; seen[k] = 1; return true; }).slice(0, MAX_COMPS);
  }

  function renderLive() {
    var g = window.GOS && GOS.game, s = "<h3>Who is covering your game and your comps</h3>";
    s += '<p class="note">Live results from YouTube and Twitch, fetched when you press a button. They&rsquo;re shown as the platforms return them: nothing here is stored, added up, scored or sent to your game. To keep someone, add them to your list.</p>';
    if (g) s += liveRow("Your game", g.title, false);
    else s += '<p class="note">Pick a game above to search for it.</p>';
    var cs = comps();
    if (cs.length) cs.forEach(function (n) { s += liveRow("Comp", n, true); });
    else s += '<p class="note">No comps on your game&rsquo;s thesis yet. Add a few in <a href="/game-os/thesis-builder">Thesis Builder</a> to see who covers games like yours.</p>';
    liveCard.innerHTML = s;
    liveCard.querySelectorAll("[data-yt]").forEach(function (b) { b.addEventListener("click", function () { runYouTube(b.getAttribute("data-yt"), b.getAttribute("data-recent") === "1"); }); });
    liveCard.querySelectorAll("[data-tw]").forEach(function (b) { b.addEventListener("click", function () { runTwitch(b.getAttribute("data-tw")); }); });
    liveCard.querySelectorAll("[data-add]").forEach(function (b) { b.addEventListener("click", function () { addFromLive(b); }); });
  }

  function liveRow(kind, name, recent) {
    var yk = "yt|" + name.toLowerCase() + "|" + (recent ? 1 : 0), tk = "tw|" + name.toLowerCase();
    var s = '<div class="comp-row"><div class="hd"><b>' + esc(kind) + ": " + esc(name) + "</b>" +
      '<button class="btn-small" type="button" data-yt="' + esc(name) + '" data-recent="' + (recent ? 1 : 0) + '">' + (recent ? "YouTube, last year" : "YouTube videos") + "</button>" +
      '<button class="btn-small" type="button" data-tw="' + esc(name) + '">Live on Twitch now</button></div>';
    s += liveResult(live[yk], "yt", name) + liveResult(live[tk], "tw", name);
    return s + "</div>";
  }

  function apiError(body, src) {
    if (!body) return "Couldn&rsquo;t reach " + src + ". Try again later.";
    if (body.status === 401) return "Sign in to Game OS to search " + src + ".";
    if (body.status === 429) return "Too many searches in the last minute. Try again shortly.";
    if (body.configured === false) return src + " search isn&rsquo;t set up on this Game OS yet. Your list and outreach log work without it.";
    if (body.error === "budget" || body.error === "quota") return "Today&rsquo;s YouTube search allowance is used up. Try again tomorrow; results you&rsquo;ve already seen are kept for a few hours.";
    if (body.error) return src + " didn&rsquo;t answer just now. Try again later.";
    return "";
  }

  function liveResult(L, kind, name) {
    if (!L) return "";
    if (L.state === "loading") return '<p class="note">Loading…</p>';
    var b = L.body, err = apiError(b, kind === "yt" ? "YouTube" : "Twitch");
    if (err) return '<p class="note">' + err + "</p>";
    if (kind === "yt") {
      if (!b.videos.length) return '<p class="note">No YouTube videos found for &ldquo;' + esc(name) + "&rdquo;" + (b.recentDays ? " in the last year" : "") + ".</p>";
      return '<ul class="vids">' + b.videos.map(function (v) {
        var u = safeUrl(v.url), cu = safeUrl(v.channelUrl);
        return '<li><span class="t"><a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(v.title) + '</a><br><span class="m">' + (cu ? '<a href="' + esc(cu) + '" target="_blank" rel="noopener">' + esc(v.channel) + "</a>" : esc(v.channel)) +
          (v.publishedAt ? " &middot; " + dl(String(v.publishedAt).slice(0, 10)) : "") + (v.views != null ? " &middot; " + esc(Number(v.views).toLocaleString("en-US")) + " views" : "") + "</span></span>" +
          '<span class="x"><button class="btn-small" type="button" data-add="youtube" data-name="' + esc(v.channel) + '" data-link="' + esc(cu || u) + '">Add to my list</button></span></li>';
      }).join("") + '</ul><p class="attrib">Results from <a href="https://www.youtube.com" target="_blank" rel="noopener">YouTube</a>, searched for &ldquo;' + esc(name) + "&rdquo; in quotes" + (b.recentDays ? ", last " + b.recentDays + " days" : "") + ", " + (b.fetchedAt ? "fetched " + new Date(b.fetchedAt).toLocaleString() : "") + ". In YouTube&rsquo;s order; not ranked by Game OS.</p>";
    }
    if (!b.found) return '<p class="note">Twitch has no category called &ldquo;' + esc(name) + "&rdquo;.</p>";
    if (!b.streams.length) return '<p class="note">Nobody is streaming ' + esc(b.category || name) + " on Twitch right now.</p>";
    return '<ul class="vids">' + b.streams.map(function (st) {
      return '<li><span class="t"><a href="' + esc(safeUrl(st.url)) + '" target="_blank" rel="noopener">' + esc(st.user) + '</a> <span class="m">' + esc(st.title) + "</span><br><span class=\"m\">" + (st.viewers != null ? esc(st.viewers.toLocaleString("en-US")) + " watching now" : "") + (st.language ? " &middot; " + esc(st.language) : "") + "</span></span>" +
        '<span class="x"><button class="btn-small" type="button" data-add="twitch" data-name="' + esc(st.user) + '" data-link="' + esc(safeUrl(st.url)) + '">Add to my list</button></span></li>';
    }).join("") + '</ul><p class="attrib">Live from <a href="https://www.twitch.tv" target="_blank" rel="noopener">Twitch</a>, ' + esc(b.category || name) + ", " + (b.fetchedAt ? "fetched " + new Date(b.fetchedAt).toLocaleString() : "") + ". Not stored.</p>";
  }

  function fetchJson(url) {
    return fetch(url, { credentials: "same-origin" }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) j.status = r.status; return j; });
    }).catch(function () { return null; });
  }
  function runYouTube(name, recent) {
    var k = "yt|" + name.toLowerCase() + "|" + (recent ? 1 : 0);
    live[k] = { state: "loading" }; renderLive();
    fetchJson("/api/creator-match/youtube?q=" + encodeURIComponent(name) + (recent ? "&recent=1" : "")).then(function (j) {
      live[k] = { state: "done", body: j }; renderLive();
      if (j && j.videos && j.videos.length) step("footprint_viewed", 1, { source: "youtube", comp: recent });
    });
  }
  function runTwitch(name) {
    var k = "tw|" + name.toLowerCase();
    live[k] = { state: "loading" }; renderLive();
    fetchJson("/api/creator-match/twitch?name=" + encodeURIComponent(name)).then(function (j) { live[k] = { state: "done", body: j }; renderLive(); });
  }

  function addFromLive(btn) {
    var name = btn.getAttribute("data-name"), link = btn.getAttribute("data-link"), src = btn.getAttribute("data-add");
    var g = G();
    var dup = g.contacts.find(function (c) { return !c.deleted && (c.link && c.link === link || c.creator.toLowerCase() === String(name).toLowerCase()); });
    if (dup) { btn.textContent = "Already on your list"; btn.disabled = true; return; }
    var c = M.cleanContact({ id: uid(), creator: name, platform: src === "twitch" ? "Twitch" : "YouTube", link: link, source: src, added: Date.now(), updated: Date.now() });
    if (!c) return;
    g.contacts = M.mergeContacts(g.contacts, [c]);
    changed();
    btn.textContent = "Added"; btn.disabled = true;
    step("creator_added", 2, { source: src });
    renderOutreach(); render();
  }

  /* ---------------- Part C: creator list and outreach log ---------------- */
  var editing = null, filter = "all";
  function renderOutreach() {
    var g = G(), t = today();
    var e = editing ? g.contacts.find(function (c) { return c.id === editing; }) : null;
    var opt = function (list, cur, blank) { return (blank ? '<option value="">' + blank + "</option>" : "") + list.map(function (x) { return '<option value="' + esc(x) + '"' + (x === cur ? " selected" : "") + ">" + esc(x.charAt(0).toUpperCase() + x.slice(1)) + "</option>"; }).join(""); };
    var s = "<h3>Your creators and outreach log</h3>";
    s += '<p class="note">Your own list: the creators you&rsquo;ve chosen, and what happened when you wrote to them. Game OS never emails or messages anyone; you send every note yourself, then log it here. When you log coverage, it&rsquo;s also saved to your game as a &ldquo;creator coverage&rdquo; beat, so it shows on Page Engine&rsquo;s wishlist chart.</p>';
    s += '<form class="form" id="f-contact">' +
      '<label>Creator<input name="creator" required maxlength="120" value="' + esc(e ? e.creator : "") + '" placeholder="Channel or name"></label>' +
      '<label>Platform<select name="platform">' + opt(M.PLATFORMS, e ? e.platform : "YouTube") + "</select></label>" +
      '<label class="wide">Link<input name="link" type="url" maxlength="300" value="' + esc(e ? e.link : "") + '" placeholder="https://"></label>' +
      '<label>Date contacted<input name="contacted" type="date" max="' + t + '" value="' + esc(e ? e.contacted : "") + '"></label>' +
      '<label>Status<select name="status">' + opt(M.STATUSES, e ? e.status : "", "(not contacted yet)") + "</select></label>" +
      '<label>Coverage date<input name="coverageDate" type="date" value="' + esc(e ? e.coverageDate : "") + '"></label>' +
      '<label class="wide">Coverage link<input name="coverageLink" type="url" maxlength="300" value="' + esc(e ? e.coverageLink : "") + '" placeholder="Link to the video, stream or article"></label>' +
      '<label class="wide">Note<input name="note" maxlength="300" value="' + esc(e ? e.note : "") + '" placeholder="e.g. Sent a key, asked about a February slot"></label>' +
      '<div><button class="btn" type="submit">' + (e ? "Save changes" : "Add creator") + "</button>" + (e ? ' <button class="btn-ghost" type="button" data-cancel>Cancel</button>' : "") + "</div></form>";
    s += '<span class="feedback" id="c-msg" role="status"></span>';
    var list = g.contacts.filter(function (c) { return !c.deleted; });
    if (list.length) {
      var counts = { all: list.length, todo: 0, waiting: 0, covered: 0 };
      list.forEach(function (c) { var k = bucket(c); counts[k]++; });
      s += '<div class="filters" role="group" aria-label="Filter the list">' + [["all", "All"], ["todo", "Not contacted"], ["waiting", "Waiting or answered"], ["covered", "Covered"]].map(function (f) {
        return '<button type="button" data-filter="' + f[0] + '" aria-pressed="' + (filter === f[0]) + '">' + f[1] + " (" + counts[f[0]] + ")</button>";
      }).join("") + "</div>";
      var shown = list.filter(function (c) { return filter === "all" || bucket(c) === filter; }).sort(function (a, b) {
        var x = a.contacted || "9999", y = b.contacted || "9999"; return x < y ? 1 : x > y ? -1 : (b.added || 0) - (a.added || 0);
      });
      s += '<ul class="log-list">' + shown.map(function (c) {
        var link = safeUrl(c.link), cov = safeUrl(c.coverageLink);
        return '<li><span class="d">' + (c.contacted ? dl(c.contacted) : "—") + '</span><span class="t">' + (link ? '<a href="' + esc(link) + '" target="_blank" rel="noopener"><b>' + esc(c.creator) + "</b></a>" : "<b>" + esc(c.creator) + "</b>") +
          " &middot; " + esc(c.platform) + " " + statusBadge(c) + (cov ? ' &middot; <a href="' + esc(cov) + '" target="_blank" rel="noopener">coverage</a>' : "") + (c.coverageDate ? " " + dl(c.coverageDate) : "") + (c.note ? " &middot; " + esc(c.note) : "") +
          '</span><span class="x">' + (!c.contacted ? '<button class="btn-small" type="button" data-sent="' + esc(c.id) + '">Sent today</button>' : "") + '<button class="btn-small" type="button" data-edit="' + esc(c.id) + '">Edit</button><button class="btn-small" type="button" data-del="' + esc(c.id) + '">Delete</button></span></li>';
      }).join("") + "</ul>";
      s += '<div class="actions"><button class="btn-small" type="button" id="btn-copy">Copy list as text</button><span class="feedback" id="copy-msg" role="status"></span></div>';
    } else s += '<p class="note">No creators yet. Add one above, or use &ldquo;Add to my list&rdquo; on a search result.</p>';
    outreachCard.innerHTML = s;
    wireOutreach();
  }
  function bucket(c) { return M.isCovered(c) ? "covered" : c.contacted ? "waiting" : "todo"; }

  /** Save the entry locally, then write (or remove) its coverage beat in the game's ledger when coverage is involved. */
  function saveContact(c, old, okText) {
    var g = G();
    g.contacts = M.mergeContacts(g.contacts, [c]);
    editing = null; changed(); renderOutreach(); render();
    var m = document.getElementById("c-msg");
    if (m) { m.className = "feedback"; m.textContent = okText; }
    var touchesBeat = M.isCovered(c) || (old && M.isCovered(old));
    if (!touchesBeat) return;
    var before = old ? M.coverageBeat(old, old.updated) : null, after = M.coverageBeat(c, c.updated);
    if (before && after && before.deleted === after.deleted && before.date === after.date && before.channel === after.channel && before.note === after.note) return;
    if (!window.GOS || !GOS.game) { if (m) m.textContent = okText + " Pick a game to add the coverage to its beat log."; return; }
    var row = M.beatRow(c, c.updated);
    GOS.recordSignals(TOOL_ID, [row]).then(function () {
      var m2 = document.getElementById("c-msg"); if (m2) m2.textContent = okText + (row.meta.deleted ? " Removed the coverage beat from " : " Coverage beat saved to ") + GOS.game.title + ".";
      ledgerLogs.beats = PM.mergeLog(ledgerLogs.beats, [PM.cleanBeat(row.meta)]); render();
    }).catch(function (e) {
      var m2 = document.getElementById("c-msg"); if (m2) { m2.className = "feedback err"; m2.textContent = okText + " Saved here, but the coverage beat didn't reach the game ledger: " + e.message; }
    });
  }

  function wireOutreach() {
    var f = document.getElementById("f-contact");
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var fd = new FormData(f), g = G();
      var old = editing ? g.contacts.find(function (c) { return c.id === editing; }) : null;
      var status = String(fd.get("status") || ""), contacted = String(fd.get("contacted") || ""), cov = String(fd.get("coverageLink") || "").trim(), covDate = String(fd.get("coverageDate") || "");
      if (status && !contacted) contacted = today();
      if ((cov || covDate) && !status) status = "covered";
      var link = String(fd.get("link") || "").trim();
      if ((link && !/^https?:\/\//i.test(link)) || (cov && !/^https?:\/\//i.test(cov))) { var mm = document.getElementById("c-msg"); mm.className = "feedback err"; mm.textContent = "Links need to start with https://"; return; }
      var c = M.cleanContact({ id: old ? old.id : uid(), creator: fd.get("creator"), platform: fd.get("platform"), link: link, contacted: contacted, status: status,
        coverageLink: cov, coverageDate: covDate, note: fd.get("note"), source: old ? old.source : "", added: old ? old.added : Date.now(), updated: Date.now() });
      if (!c) return;
      saveContact(c, old, old ? "Updated." : "Added.");
      if (!old) step("creator_added", 2, { source: "form" });
      if (c.contacted && (!old || !old.contacted)) step("outreach_logged", 3, { status: c.status });
      else if (old && c.status !== old.status) step("outreach_logged", 3, { status: c.status });
    });
    outreachCard.querySelectorAll("[data-cancel]").forEach(function (b) { b.addEventListener("click", function () { editing = null; renderOutreach(); }); });
    outreachCard.querySelectorAll("[data-filter]").forEach(function (b) { b.addEventListener("click", function () { filter = b.getAttribute("data-filter"); renderOutreach(); }); });
    outreachCard.querySelectorAll("[data-edit]").forEach(function (b) {
      b.addEventListener("click", function () { editing = b.getAttribute("data-edit"); renderOutreach(); document.getElementById("f-contact").scrollIntoView({ block: "center" }); });
    });
    outreachCard.querySelectorAll("[data-sent]").forEach(function (b) {
      b.addEventListener("click", function () {
        var old = G().contacts.find(function (c) { return c.id === b.getAttribute("data-sent"); });
        if (!old) return;
        saveContact(Object.assign({}, old, { contacted: today(), status: "contacted", updated: Date.now() }), old, "Logged as contacted today.");
        step("outreach_logged", 3, { status: "contacted" });
      });
    });
    outreachCard.querySelectorAll("[data-del]").forEach(function (b) {
      b.addEventListener("click", function () {
        var old = G().contacts.find(function (c) { return c.id === b.getAttribute("data-del"); });
        if (!old) return;
        saveContact(Object.assign({}, old, { deleted: true, updated: Date.now() }), old, "Deleted.");
      });
    });
    var copy = document.getElementById("btn-copy");
    if (copy) copy.addEventListener("click", function () {
      var rows = G().contacts.filter(function (c) { return !c.deleted; }).map(function (c) {
        return [c.creator, c.platform, c.link, c.contacted || "", M.isCovered(c) ? "covered" : c.status || "not contacted", c.coverageLink, c.coverageDate, c.note].join("\t");
      });
      var text = ["Creator\tPlatform\tLink\tContacted\tStatus\tCoverage link\tCoverage date\tNote"].concat(rows).join("\n");
      var done = function (ok) { var m = document.getElementById("copy-msg"); if (m) m.textContent = ok ? "Copied " + rows.length + " rows. Paste into a spreadsheet." : "Couldn't copy."; if (ok) track("output_action", { action: "copy", count: rows.length }); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
      else done(false);
    });
  }

  /* ---------------- Other tools' data: ledger beats and Page Engine's wishlists ---------------- */
  function syncLedger() {
    if (!window.GOS || !GOS.game) { ledgerLogs = { beats: [], versions: [] }; return Promise.resolve(); }
    var id = GOS.game.id;
    return fetch("/api/games/" + encodeURIComponent(id) + "/signals?all=1&days=365", { credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !window.GOS || !GOS.game || GOS.game.id !== id) return;
        ledgerLogs = PM.logsFromLedger((j.rows || []).filter(function (r) { return r.key === "beat" || r.key === "creative_version"; }));
        render();
      }).catch(function () {});
  }
  /** Page Engine keeps daily wishlists in its own saved state (this browser, or the account). Read-only here. */
  function loadPageEngine() {
    var id = gid(), local = null;
    try { local = JSON.parse(localStorage.getItem(PE_LS_KEY) || "null"); } catch (e) {}
    var pick = function (st) { var g = st && st.games && st.games[id]; return g && Array.isArray(g.wishlists) ? g.wishlists.filter(function (r) { return r && PM.isYmd(r.from) && PM.isYmd(r.to); }) : null; };
    pageWishlists = pick(local);
    if (!accountUser) return Promise.resolve();
    return fetch("/api/tool-state/page-engine", { credentials: "same-origin" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      var st = j && j.state;
      if (st && (!local || (Number(st.savedAt) || 0) > (Number(local.savedAt) || 0))) { var w = pick(st); if (w) { pageWishlists = w; render(); } }
    }).catch(function () {});
  }

  /* ---------------- About ---------------- */
  function about() {
    var items = [
      "<b>Your Twitch footprint</b> comes from the Game Developer Analytics CSV that Twitch gives the studio. It&rsquo;s read in your browser and never uploaded; only the daily totals are saved, to your account. Twitch only offers the export once the game has been streamed for " + M.TWITCH_MIN_MINUTES + " minutes in the period (<a href=\"" + M.TWITCH_SOURCE + "\" target=\"_blank\" rel=\"noopener\">Twitch developer docs</a>, checked " + M.TWITCH_CHECKED + ").",
      "<b>Column mapping:</b> you confirm which column is which. The page only suggests a first guess from the column names.",
      "<b>YouTube and Twitch searches are live only.</b> Their developer terms don&rsquo;t allow storing other people&rsquo;s video and stream statistics, or combining them into new scores, so results are shown as returned and never stored, summed, ranked or sent to your game. YouTube searches are limited to a small daily allowance, so they run only when you press the button and are kept for a few hours.",
      "<b>Your creator list and outreach log</b> are your own data, saved to your account per game. Game OS never contacts a creator.",
      "<b>Reply rate</b> is replies (replied, covered or declined) &divide; creators contacted, with a 95% Wilson range. It&rsquo;s hidden until " + M.MIN_CONTACTED + " are contacted, because below that one reply moves it by 10 points or more.",
      "<b>Broadcaster-days</b> adds up each day&rsquo;s unique broadcasters from the export, so a creator streaming on three days counts three times. Daily unique counts can&rsquo;t be added into a 28-day unique count.",
      "<b>Coverage and wishlists:</b> coverage you log becomes a &ldquo;creator coverage&rdquo; beat in your game&rsquo;s ledger. Read against Page Engine&rsquo;s daily wishlist adds, it says &ldquo;associated with&rdquo;, never &ldquo;caused&rdquo;.",
      "<b>All Reach:</b> every figure here is about whether marketing found an audience, not whether the audience stuck.",
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
      .catch(function (e) { status(e.message === "too large" ? "Too much data to save to your account; clear older Twitch imports" : "Couldn't save to your account; your list is still in this browser", "error"); });
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
  function all() { render(); renderTwitch(); renderLive(); renderOutreach(); }
  initAccount().then(start, start);
  function start() {
    booted = true; lastGame = gid();
    all(); syncLedger(); loadPageEngine();
  }
  if (window.GOS && GOS.onChange) {
    GOS.onChange(function () {
      if (!booted) return;
      var id = gid();
      if (id === lastGame) { renderLive(); return; } // thesis or ledger refreshed: comps may have changed
      lastGame = id; editing = null; csv = null; viewed = false; live = {}; filter = "all";
      ledgerLogs = { beats: [], versions: [] }; pageWishlists = null;
      all(); syncLedger(); loadPageEngine();
    });
  }
})();
