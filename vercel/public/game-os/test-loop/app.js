/* Test Loop — page logic. The maths lives in model.js (window.TestModel).
 * Store tests read Page Engine's saved daily traffic and wishlist tables and its version and beat logs (read-only).
 * Off-Steam tests are the studio's own impressions and clicks per variant, saved in this tool's state. */
(function () {
  "use strict";
  var M = window.TestModel, PM = window.PageModel;
  var TOOL_ID = "test-loop";
  var LS_KEY = "gos_test_loop_v1";
  var PE_LS_KEY = "gos_page_engine_v1";
  var ACCOUNT_URL = "/api/tool-state/" + TOOL_ID;
  var MAX_TESTS = 60;   // per game; each test is a few hundred bytes, far under the 512 KB tool-state limit

  /* ---------------- State: per game, the off-Steam tests and the store test picked ---------------- */
  function emptyGame() { return { tests: [], change: null, days: M.DEFAULT_DAYS }; }
  function emptyState() { return { games: {}, savedAt: 0 }; }
  function normalise(s) {
    if (!s || typeof s !== "object") return null;
    var b = emptyState();
    b.savedAt = Number(s.savedAt) || 0;
    Object.keys(s.games || {}).forEach(function (id) {
      var g = s.games[id] || {}, o = emptyGame();
      o.tests = (Array.isArray(g.tests) ? g.tests : []).map(M.cleanTest).filter(Boolean).slice(0, MAX_TESTS);
      o.change = g.change ? String(g.change).slice(0, 64) : null;
      o.days = M.clampDays(g.days);
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
  function signed(x) { return x == null || !isFinite(x) ? "—" : (x > 0.049 ? "+" : x < -0.049 ? "&minus;" : "") + one(Math.abs(x)); }
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function dl(ymd) { if (!ymd) return "—"; var p = String(ymd).split("-"); return +p[2] + " " + MONTHS[+p[1] - 1] + " " + p[0]; }
  function ds(ymd) { var p = String(ymd).split("-"); return +p[2] + " " + MONTHS[+p[1] - 1]; }
  function range(a, b) { return a === b ? dl(a) : ds(a) + " – " + dl(b); }
  function half(h) { return '<span class="half ' + h + '">' + (h === "reach" ? "Reach" : "Resonance") + "</span>"; }
  function today() { var d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function plural(n, w) { return num(n) + " " + w + (Math.round(n) === 1 ? "" : "s"); }
  function track(name, props) { if (typeof window.gosTrack === "function") window.gosTrack(name, Object.assign({ tool_id: TOOL_ID }, props || {})); }
  function step(name, index, extra) { track("journey_step", Object.assign({ step_name: name, step_index: index }, extra || {})); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function verdictBadge(v) {
    if (v === "better") return '<span class="badge good">Better</span>';
    if (v === "worse") return '<span class="badge bad">Worse</span>';
    return '<span class="badge warn">Can&rsquo;t tell</span>';
  }

  /** A small picture of the 95% range against zero. Values are in points. */
  function ciSvg(r, v) {
    var lo = Math.min(r.lo, 0), hi = Math.max(r.hi, 0), pad = Math.max((hi - lo) * 0.12, 0.2);
    lo -= pad; hi += pad;
    var W = 320, H = 34, L = 8, Rt = 8, x = function (val) { return L + (val - lo) / (hi - lo) * (W - L - Rt); };
    var cls = v === "better" ? "better" : v === "worse" ? "worse" : "tell";
    return '<svg class="ci" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="95% range ' + one(r.lo) + " to " + one(r.hi) + ' points, zero marked">' +
      '<line class="zero" x1="' + x(0) + '" x2="' + x(0) + '" y1="4" y2="22"/><text x="' + x(0) + '" y="32" text-anchor="middle">0</text>' +
      '<line class="rng ' + cls + '" x1="' + x(r.lo) + '" x2="' + x(r.hi) + '" y1="13" y2="13"/><circle class="pt" cx="' + x(r.diff) + '" cy="13" r="4"/></svg>';
  }

  var out = document.getElementById("out");
  var variantsCard = document.getElementById("variants-card");
  var newCard = document.getElementById("new-card");
  var PE = { wishlists: [], traffic: [], beats: [], versions: [] };   // Page Engine's data for this game (read-only)
  var T = null;            // the current store read
  var viewedStore = {}, viewedTest = {};
  var sentNote = {};       // feedback that survives the re-render after a send

  /* ---------------- Store test ---------------- */
  function currentChange() {
    var list = M.changes(PE.versions), g = G();
    if (!list.length) return null;
    var hit = list.filter(function (v) { return v.id === g.change; })[0];
    if (hit) return hit;
    // Default: the newest change whose after-window has had time to finish, else the newest.
    var last = PM.lastDate(PE.traffic);
    return list.filter(function (v) { return last && PM.addDays(v.date, g.days - 1) <= last; })[0] || list[0];
  }

  var WHY = {
    gaps: function (R) { return "Needs numbers on every day of both windows (" + R.before.den.covered + " and " + R.after.den.covered + " of " + R.days + " days). Weekly totals that cross a window&rsquo;s edge can&rsquo;t be split, so import daily figures in Page Engine."; },
    few: function (R) { return "Too few to read yet (n = " + num(R.before.den.count) + " and " + num(R.after.den.count) + " " + (R.metric === "ctr" ? "impressions" : "visits") + "; needs " + num(R.min) + " in each window)."; },
    running: function (R) { return R.daysIn > 0 ? "Still running: " + R.daysIn + " of " + R.days + " days after the change have numbers. Import Page Engine figures to " + dl(R.windows.after.end) + " to read it." : "No " + (R.metric === "ctr" ? "traffic" : "traffic and wishlist") + " numbers from Page Engine cover the days after this change yet."; },
  };

  function render() {
    var list = M.changes(PE.versions);
    var hasTraffic = PE.traffic.length > 0;
    var s = "";
    var steamNote = '<p class="method">Steamworks doesn&rsquo;t offer split testing of store assets: its documentation (<a href="' + M.STEAM_AB_SOURCES[0] + '" target="_blank" rel="noopener">store page</a>, <a href="' + M.STEAM_AB_SOURCES[1] + '" target="_blank" rel="noopener">traffic reports</a>, checked ' + dl(M.STEAM_AB_CHECKED) + ") describes a preview mode, not a way to show two versions to different players. So a store test here is a before/after comparison: the same number of days either side of the change.</p>";
    if (!list.length) {
      out.innerHTML = '<section class="card answer"><h3>The answer</h3><p class="verdict">No store page changes logged yet, so there&rsquo;s nothing to compare.</p>' +
        '<p class="next">Next: log every capsule, header, trailer, screenshot or short description change in <a href="/game-os/page-engine">Page Engine</a>, with the day it went live' + (hasTraffic ? "" : ", and import your daily traffic and wishlist numbers there") + ". You can test ads, posts and positioning lines off Steam below meanwhile.</p>" + steamNote + "</section>";
      T = null; return;
    }
    var c = currentChange(), g = G();
    T = M.storeTest(PE, c, g.days);
    s += answer(steamNote) + storeCard(list);
    out.innerHTML = s;
    wireStore();
    if ((T.ctr.enough || T.v2w.enough) && !viewedStore[c.id + ":" + T.days]) { viewedStore[c.id + ":" + T.days] = 1; step("result_viewed", 2, { kind: "before_after", asset: c.asset }); }
  }

  function readLine(R) {
    var r = R.result;
    if (R.metric === "ctr") return "Click-through went from <b>" + one(r.a.p) + "%</b> to <b>" + one(r.b.p) + "%</b>, " + signed(r.diff) + " points (95% range " + signed(r.lo) + " to " + signed(r.hi) + ").";
    return "Wishlist adds per 100 visits went from <b>" + one(r.a.p) + "</b> to <b>" + one(r.b.p) + "</b>, " + signed(r.diff) + " (95% range " + signed(r.lo) + " to " + signed(r.hi) + ").";
  }

  function answer(steamNote) {
    var c = T.change, lines = [], next;
    lines.push("Your <b>" + esc(c.asset) + " change (" + esc(c.label) + ")</b> went live on " + dl(c.date) + ". Comparing the " + T.days + " days before it with the " + T.days + " days from it:");
    ["ctr", "v2w"].forEach(function (k) {
      var R = T[k];
      if (R.enough) lines.push(R.name + ": <b>" + (R.verdict === "better" ? "better" : R.verdict === "worse" ? "worse" : "can&rsquo;t tell") + "</b>. " + readLine(R));
      else lines.push(R.name + ": " + WHY[R.reason](R));
    });
    var V = [T.ctr.verdict, T.v2w.verdict];
    if (T.confounders.length && (V[0] === "better" || V[0] === "worse" || V[1] === "better" || V[1] === "worse")) lines.push("Other things happened in these days too (listed below), so the change may not be the only cause.");
    if (!T.ctr.enough && !T.v2w.enough) next = T.ctr.reason === "running" ? "Next: wait until " + dl(T.windows.after.end) + ", then import Page Engine&rsquo;s numbers to that day." : "Next: import daily traffic and wishlist numbers covering " + range(T.windows.before.start, T.windows.after.end) + " in <a href=\"/game-os/page-engine\">Page Engine</a>.";
    else if (V[0] === "better" && V[1] === "worse") next = "Next: more people clicked through, but fewer of them wishlisted. The new " + esc(c.asset) + " may be drawing people the page doesn&rsquo;t convince. Check that the page delivers what the " + esc(c.asset) + " promises before keeping it.";
    else if (V[0] === "worse" && V[1] === "better") next = "Next: fewer people clicked through, but more of them wishlisted. The " + esc(c.asset) + " may now filter for the right players. Judge it on total wishlist adds in Page Engine.";
    else if (V.indexOf("worse") >= 0) next = "Next: the change did worse than what it replaced. Consider switching back, and log that as a new version in Page Engine so the switch can be read too.";
    else if (V.indexOf("better") >= 0) next = "Next: keep it, and record the result to your game. Test one change at a time so the next result can be read as cleanly.";
    else next = "Next: &ldquo;can&rsquo;t tell&rdquo; is the usual answer at indie traffic levels, and it isn&rsquo;t a failure. It means any difference is smaller than this much traffic can show. Keep whichever version you prefer, or try a bigger change, or a longer window.";
    return '<section class="card answer"><h3>The answer</h3>' + lines.map(function (l) { return '<p class="verdict">' + l + "</p>"; }).join("") + '<p class="next">' + next + "</p>" + steamNote + "</section>";
  }

  function metricBox(R) {
    var head = '<div class="l">' + R.name + " " + half(R.half) + "</div>";
    if (!R.enough) return '<div class="kpi">' + head + '<div class="v">—</div><div class="s">' + WHY[R.reason](R) + "</div></div>";
    var r = R.result;
    return '<div class="kpi' + (R.verdict !== "can't tell" ? " hero" : "") + '">' + head +
      '<div class="v">' + signed(r.diff) + "<small>" + (R.metric === "ctr" ? "points" : "per 100 visits") + "</small></div>" +
      '<div class="s">95% range ' + signed(r.lo) + " to " + signed(r.hi) + "</div>" + ciSvg(r, R.verdict) +
      '<div class="s">Before: ' + one(r.a.p) + (R.metric === "ctr" ? "%" : "") + " (" + num(r.a.k) + " of " + num(r.a.n) + (R.metric === "ctr" ? " impressions" : " visits") + ")</div>" +
      '<div class="s">After: ' + one(r.b.p) + (R.metric === "ctr" ? "%" : "") + " (" + num(r.b.k) + " of " + num(r.b.n) + (R.metric === "ctr" ? " impressions" : " visits") + ")</div>" +
      '<div class="vd">' + verdictBadge(R.verdict) + "</div></div>";
  }

  function storeCard(list) {
    var g = G(), c = T.change, w = T.windows;
    var s = '<section class="card"><h3>Store page: before and after a change</h3>';
    s += '<div class="pick"><label>Change<select id="sel-change">' + list.map(function (v) {
      return '<option value="' + esc(v.id) + '"' + (v.id === c.id ? " selected" : "") + ">" + esc(dl(v.date) + ": " + v.asset + " " + v.label) + "</option>";
    }).join("") + '</select></label><label>Days each side<input id="in-days" type="number" min="' + M.MIN_DAYS + '" max="' + M.MAX_DAYS + '" step="1" value="' + T.days + '"></label></div>';
    if (c.note) s += '<p class="note">Note on this change: ' + esc(c.note) + "</p>";
    s += '<p class="note">Before: ' + range(w.before.start, w.before.end) + ". After: " + range(w.after.start, w.after.end) + ".</p>";
    s += '<div class="kpis two">' + metricBox(T.ctr) + metricBox(T.v2w) + "</div>";
    if (T.confounders.length) {
      s += '<div class="warns"><b>Other things in these days</b> can move traffic on their own, so they cloud the comparison:<ul>' + T.confounders.map(function (x) {
        return "<li>" + (x.kind === "event" ? "Steam event: " + esc(x.name) + " (" + range(x.date, x.end) + ")" : x.kind === "version" ? "Another store change: " + esc(x.name) + " (" + dl(x.date) + ")" : "Beat: " + esc(x.name) + " (" + dl(x.date) + ")" + (x.note ? ", " + esc(x.note) : "")) + "</li>";
      }).join("") + "</ul></div>";
    }
    s += '<p class="note">Click-through is Reach: is the asset getting people onto the page? Visits to wishlists is Resonance: does the page convince the people who arrive? A change can help one and hurt the other, so they&rsquo;re never merged.</p>';
    s += '<p class="method">Method: click-through is visits &divide; impressions in each window; the difference gets a 95% range by Newcombe&rsquo;s method, built from each window&rsquo;s Wilson range. Visits to wishlists is wishlist adds per 100 visits. It&rsquo;s a ratio, not a true share (some adds don&rsquo;t come through a tracked visit), so each window&rsquo;s adds get an exact Poisson range with visits held fixed, combined the same way (Zou and Donner&rsquo;s MOVER). &ldquo;Better&rdquo; or &ldquo;worse&rdquo; only when the whole range is on one side of zero. Steam counts an impression when the game is on screen, whether or not anyone noticed it. Minimums: ' + num(M.MIN_IMPRESSIONS) + " impressions and " + num(M.MIN_VISITS) + " visits in each window, with numbers on every day; " + M.MIN_DAYS + " to " + M.MAX_DAYS + " days each side. Numbers come from <a href=\"/game-os/page-engine\">Page Engine</a>.</p>";
    var sigs = ["ctr", "v2w"].map(function (k) { return M.storeSignal(T, k); }).filter(Boolean), game = window.GOS && GOS.game;
    s += '<div class="actions"><button class="btn" id="btn-send-store" type="button"' + (sigs.length && game ? "" : " disabled") + ">Record result to " + (game ? esc(game.title) : "your game") + '</button><span class="feedback" id="msg-store" role="status">' + esc(sentNote.store || "") + "</span></div>";
    if (!sigs.length) s += '<p class="note">Nothing to record until at least one measure has enough data.</p>';
    return s + "</section>";
  }

  function wireStore() {
    var sel = document.getElementById("sel-change"), d = document.getElementById("in-days");
    if (sel) sel.addEventListener("change", function () { G().change = sel.value; sentNote.store = ""; changed(); step("test_set_up", 1, { kind: "before_after" }); render(); });
    if (d) d.addEventListener("change", function () { G().days = M.clampDays(d.value); sentNote.store = ""; changed(); render(); });
    var b = document.getElementById("btn-send-store");
    if (b) b.addEventListener("click", function () {
      var sigs = ["ctr", "v2w"].map(function (k) { return M.storeSignal(T, k); }).filter(Boolean);
      send(sigs, b, "msg-store", "store", { kind: "before_after" });
    });
  }

  function send(sigs, btn, msgId, noteKey, extra) {
    var m = document.getElementById(msgId);
    if (!sigs.length || !window.GOS || !GOS.game) return;
    btn.disabled = true; m.className = "feedback"; m.textContent = "Recording to " + GOS.game.title + "…";
    GOS.recordSignals(TOOL_ID, sigs).then(function () {
      sentNote[noteKey] = "Recorded " + plural(sigs.length, "result") + " to " + GOS.game.title + ".";
      var m2 = document.getElementById(msgId); if (m2) m2.textContent = sentNote[noteKey];
      track("output_action", { action: "send_signals", count: sigs.length });
      step("result_actioned", 3, Object.assign({ action: "send_to_game" }, extra || {}));
    }).catch(function (e) { btn.disabled = false; m.className = "feedback err"; m.textContent = "Couldn't record: " + e.message; });
  }

  /* ---------------- Off-Steam tests ---------------- */
  function renderVariants() {
    var tests = G().tests, s = "<h3>Off-Steam tests and positioning lines</h3>";
    s += '<p class="note">Ads, posts, landing pages and positioning lines, where you can show different versions to different people and count impressions and clicks for each. The first variant is the control; every other one is compared with it. Click rate is Reach.</p>';
    if (!tests.length) { variantsCard.innerHTML = s + '<p class="note">No tests yet. Set one up below.</p>'; return; }
    tests.forEach(function (t) { s += testHtml(t); });
    variantsCard.innerHTML = s;
    wireVariants();
  }

  function testHtml(t) {
    var V = M.variantTest(t), game = window.GOS && GOS.game, pos = t.kind === "positioning";
    var s = '<div class="test" data-id="' + esc(t.id) + '"><div class="test-head"><h4>' + esc(t.name || (pos ? "Positioning lines" : "Off-Steam test")) + "</h4>" +
      '<div class="x"><button class="btn-small" data-act="edit" type="button">Edit</button><button class="btn-small" data-act="del" type="button">Delete</button></div></div>';
    s += '<p class="note">' + (pos ? "Positioning" : "Off-Steam") + (t.channel ? " &middot; " + esc(t.channel) : "") + (t.from && t.to ? " &middot; " + range(t.from, t.to) : "") + (t.note ? " &middot; " + esc(t.note) : "") + "</p>";
    s += '<div class="tbl-wrap"><table class="t beats"><thead><tr><th class="name">Variant</th><th>Click rate</th><th>vs control</th></tr></thead><tbody>';
    var ctl = V.control, cr = V.controlRate;
    s += '<tr><td class="name"><b>' + esc(ctl.label || "A") + "</b> (control)" + (ctl.text ? '<div class="line">' + esc(ctl.text) + "</div>" : "") + '</td><td data-l="Click rate">' +
      (cr && ctl.clicks != null ? one(cr.p * 100) + '% <span class="range">' + num(ctl.clicks) + " of " + num(ctl.impressions) + "</span>" : '<span class="muted">No numbers yet</span>') + '</td><td class="read">' + (V.winner === 0 ? '<span class="badge good">Best</span>' : "") + "</td></tr>";
    V.rows.forEach(function (r) {
      var v = r.variant, name = '<b>' + esc(v.label || String.fromCharCode(65 + r.index)) + "</b>" + (v.text ? '<div class="line">' + esc(v.text) + "</div>" : "");
      var rate = v.impressions > 0 && v.clicks != null ? one(v.clicks / v.impressions * 100) + '% <span class="range">' + num(v.clicks) + " of " + num(v.impressions) + "</span>" : '<span class="muted">No numbers yet</span>';
      var read = r.enough ? verdictBadge(r.verdict) + " " + signed(r.result.diff) + ' points <span class="range">(' + signed(r.result.lo) + " to " + signed(r.result.hi) + ")</span>" + ciSvg(r.result, r.verdict)
        : '<span class="muted">' + (r.reason === "few" ? "Too few to read yet (needs " + num(M.MIN_VARIANT_IMPRESSIONS) + " impressions for this variant and the control)" : "Add impressions and clicks to read it") + "</span>";
      s += '<tr><td class="name">' + name + '</td><td data-l="Click rate">' + rate + '</td><td class="read" data-l="vs control">' + read + "</td></tr>";
    });
    s += "</tbody></table></div>";
    var anyRead = V.rows.some(function (r) { return r.enough; });
    if (anyRead) {
      var allTell = V.rows.filter(function (r) { return r.enough; }).every(function (r) { return r.verdict === "can't tell"; });
      if (allTell) s += '<p class="note">&ldquo;Can&rsquo;t tell&rdquo; is the usual result on small budgets. Any difference between these versions is smaller than this many impressions can show. Run it longer, or test versions that differ more.</p>';
      else if (V.winner != null) s += '<p class="note"><b>' + esc((V.winner === 0 ? ctl : V.rows[V.winner - 1].variant).label || "This variant") + "</b> did best on click rate. A click is interest, not a wishlist; use the winner where you can track what happens next, such as a UTM link to your store page.</p>";
      if (V.comparisons > 1) s += '<p class="method">With ' + (V.comparisons + 1) + " variants, each range is widened (z = " + V.z.toFixed(2) + ") so that the chance of any false &ldquo;better&rdquo; across the " + V.comparisons + " comparisons stays at 5%.</p>";
    }
    var sigs = M.variantSignals(V);
    s += '<div class="actions"><button class="btn-ghost" data-act="send" type="button"' + (sigs.length && game ? "" : " disabled") + ">Record result to " + (game ? esc(game.title) : "your game") + "</button>";
    if (pos && V.winner != null) {
      var win = V.winner === 0 ? ctl : V.rows[V.winner - 1].variant;
      if (win.text) s += '<button class="btn" data-act="hook" type="button"' + (game ? "" : " disabled") + ">Use the winning line as the game&rsquo;s hook</button>";
    }
    s += '<span class="feedback" data-msg role="status">' + esc(sentNote["t:" + t.id] || "") + "</span></div>";
    if (pos && V.winner != null) s += '<p class="hook-now">Current hook in the thesis: ' + (window.GOS && GOS.thesis && GOS.thesis.hook ? "&ldquo;" + esc(GOS.thesis.hook) + "&rdquo;" : "none yet") + ". A positioning line is a hypothesis to keep testing, not a field to fill once.</p>";
    if (anyRead && !viewedTest[t.id]) { viewedTest[t.id] = 1; step("result_viewed", 2, { kind: t.kind }); }
    return s + "</div>";
  }

  function wireVariants() {
    variantsCard.querySelectorAll(".test").forEach(function (el) {
      var id = el.getAttribute("data-id"), t = G().tests.filter(function (x) { return x.id === id; })[0];
      if (!t) return;
      var m = el.querySelector("[data-msg]");
      el.querySelector('[data-act="del"]').addEventListener("click", function () {
        G().tests = G().tests.filter(function (x) { return x.id !== id; }); changed(); renderVariants();
        if (draft && draft.id === id) { draft = null; renderNew(); }
      });
      el.querySelector('[data-act="edit"]').addEventListener("click", function () { draft = JSON.parse(JSON.stringify(t)); newKind = t.kind; renderNew(); newCard.scrollIntoView({ behavior: "smooth", block: "start" }); });
      var sb = el.querySelector('[data-act="send"]');
      if (sb) sb.addEventListener("click", function () {
        var sigs = M.variantSignals(M.variantTest(t));
        if (!sigs.length || !window.GOS || !GOS.game) return;
        sb.disabled = true; m.className = "feedback"; m.textContent = "Recording…";
        GOS.recordSignals(TOOL_ID, sigs).then(function () {
          sentNote["t:" + id] = "Recorded " + plural(sigs.length, "result") + " to " + GOS.game.title + ".";
          m.textContent = sentNote["t:" + id];
          track("output_action", { action: "send_signals", count: sigs.length });
          step("result_actioned", 3, { action: "send_to_game", kind: t.kind });
        }).catch(function (e) { sb.disabled = false; m.className = "feedback err"; m.textContent = "Couldn't record: " + e.message; });
      });
      var hb = el.querySelector('[data-act="hook"]');
      if (hb) hb.addEventListener("click", function () {
        var V = M.variantTest(t), win = V.winner === 0 ? V.control : V.rows[V.winner - 1].variant, row = V.winner > 0 ? V.rows[V.winner - 1] : null;
        if (!window.GOS || !GOS.game || !win.text) return;
        var note = "Positioning line from Test Loop" + (t.name ? " (" + t.name + ")" : "") + ": " +
          (row ? "beat the control on click rate by " + one(row.result.diff) + " points (95% range " + one(row.result.lo) + " to " + one(row.result.hi) + "), " + num(row.result.a.n + row.result.b.n) + " impressions"
            : "the control; every other line did worse on click rate");
        hb.disabled = true; m.className = "feedback"; m.textContent = "Saving to the thesis…";
        GOS.saveThesis({ hook: win.text.slice(0, 2000) }, TOOL_ID, note.slice(0, 300)).then(function () {
          sentNote["t:" + id] = "Saved as the hook in " + GOS.game.title + "'s thesis.";
          track("output_action", { action: "send_to_thesis", field: "hook" });
          step("result_actioned", 3, { action: "send_to_thesis", kind: t.kind });
          renderVariants();
        }).catch(function (e) { hb.disabled = false; m.className = "feedback err"; m.textContent = "Couldn't save: " + e.message; });
      });
    });
  }

  /* ---------------- Set up or edit a test ---------------- */
  var draft = null, newKind = "offsteam";   // the test in the form; draft.id is set for a saved test
  function blankVariants(kind) { return [0, 1].map(function (i) { return { label: String.fromCharCode(65 + i), text: "", anchor: "", twist: "", want: "", impressions: null, clicks: null }; }); }

  function renderNew() {
    var t = draft || { id: null, kind: newKind, name: "", channel: "", from: "", to: "", note: "", variants: blankVariants(newKind) };
    var pos = t.kind === "positioning";
    var s = "<h3>" + (t.id ? "Edit test" : "Set up a test") + "</h3>";
    s += '<div class="tabs" role="tablist">' + [["offsteam", "Ad, post or landing page"], ["positioning", "Positioning lines"]].map(function (x) {
      return '<button type="button" role="tab" data-kind="' + x[0] + '" aria-selected="' + (t.kind === x[0]) + '">' + x[1] + "</button>";
    }).join("") + "</div>";
    s += pos ? '<p class="note">Write each line as &ldquo;[a game players know] meets [your twist], for players who [want something]&rdquo;. Run them as ads or posts with the same budget, audience and dates, then enter what each one got.</p>'
      : '<p class="note">Show each version to a similar audience over the same dates, for example as an ad platform&rsquo;s split test, then enter the impressions and clicks each one got.</p>';
    s += '<form id="f-test"><div class="form"><label class="wide">Name<input name="name" maxlength="80" value="' + esc(t.name) + '" placeholder="' + (pos ? "Hook lines, Reddit ads" : "Capsule art on X ads") + '"></label>' +
      '<label>Where it ran<input name="channel" maxlength="40" value="' + esc(t.channel) + '" placeholder="Reddit, X, TikTok…"></label>' +
      '<label>From<input name="from" type="date" max="' + today() + '" value="' + esc(t.from || "") + '"></label><label>To<input name="to" type="date" max="' + today() + '" value="' + esc(t.to || "") + '"></label></div>';
    s += '<div class="variant-grid">' + t.variants.map(function (v, i) {
      var h = '<div class="vbox" data-i="' + i + '"><div class="vt">' + (i === 0 ? "Control" : "Variant") + "</div>";
      h += '<label>Label<input data-f="label" maxlength="60" value="' + esc(v.label) + '"></label>';
      if (pos) h += '<label>Familiar anchor<input data-f="anchor" maxlength="80" value="' + esc(v.anchor || "") + '" placeholder="Slay the Spire"></label><label>meets (your twist)<input data-f="twist" maxlength="80" value="' + esc(v.twist || "") + '" placeholder="a fishing village"></label><label>for players who<input data-f="want" maxlength="120" value="' + esc(v.want || "") + '" placeholder="want short, calm runs"></label>';
      else h += '<label>What changed (optional)<input data-f="text" maxlength="300" value="' + esc(v.text || "") + '" placeholder="Red capsule, close-up hero"></label>';
      h += '<div class="two"><label>Impressions<input data-f="impressions" type="number" min="0" step="1" value="' + (v.impressions == null ? "" : v.impressions) + '"></label><label>Clicks<input data-f="clicks" type="number" min="0" step="1" value="' + (v.clicks == null ? "" : v.clicks) + '"></label></div>';
      if (i > 1) h += '<button class="link-btn" type="button" data-rm="' + i + '">Remove</button>';
      return h + "</div>";
    }).join("") + "</div>";
    s += '<div class="actions">' + (t.variants.length < M.MAX_VARIANTS ? '<button class="btn-ghost" id="btn-add-v" type="button">Add a variant</button>' : "") +
      '<button class="btn" type="submit">' + (t.id ? "Save changes" : "Save test") + "</button>" + (t.id ? '<button class="btn-ghost" id="btn-cancel" type="button">Cancel</button>' : "") +
      '<span class="feedback" id="new-msg" role="status"></span></div></form>';
    s += '<p class="note">Up to ' + M.MAX_VARIANTS + " variants. Each needs " + num(M.MIN_VARIANT_IMPRESSIONS) + " impressions before it&rsquo;s read. You can save a test before the numbers are in and add them later.</p>";
    newCard.innerHTML = s;
    draft = t;
    wireNew();
  }

  function readForm() {
    var f = document.getElementById("f-test"), fd = new FormData(f), t = draft;
    t.name = String(fd.get("name") || "").trim(); t.channel = String(fd.get("channel") || "").trim();
    t.from = String(fd.get("from") || ""); t.to = String(fd.get("to") || "");
    newCard.querySelectorAll(".vbox").forEach(function (box) {
      var v = t.variants[+box.getAttribute("data-i")];
      box.querySelectorAll("[data-f]").forEach(function (inp) {
        var k = inp.getAttribute("data-f");
        if (k === "impressions" || k === "clicks") v[k] = inp.value === "" ? null : Number(inp.value);
        else v[k] = inp.value;
      });
    });
    return t;
  }

  function wireNew() {
    newCard.querySelectorAll(".tabs button").forEach(function (b) {
      b.addEventListener("click", function () {
        var k = b.getAttribute("data-kind");
        if (k === draft.kind) return;
        readForm(); draft.kind = k; newKind = k; renderNew();
      });
    });
    var add = document.getElementById("btn-add-v");
    if (add) add.addEventListener("click", function () { readForm(); draft.variants.push({ label: String.fromCharCode(65 + draft.variants.length), text: "", anchor: "", twist: "", want: "", impressions: null, clicks: null }); renderNew(); });
    newCard.querySelectorAll("[data-rm]").forEach(function (b) { b.addEventListener("click", function () { readForm(); draft.variants.splice(+b.getAttribute("data-rm"), 1); renderNew(); }); });
    var cancel = document.getElementById("btn-cancel");
    if (cancel) cancel.addEventListener("click", function () { draft = null; renderNew(); });
    document.getElementById("f-test").addEventListener("submit", function (e) {
      e.preventDefault();
      var t = readForm(), m = document.getElementById("new-msg"), err = function (x) { m.className = "feedback err"; m.textContent = x; };
      var pos = t.kind === "positioning";
      if (t.from && t.to && t.from > t.to) return err("Check the dates: From must be on or before To.");
      for (var i = 0; i < t.variants.length; i++) {
        var v = t.variants[i], name = v.label || (i === 0 ? "the control" : "variant " + (i + 1));
        if (pos && !M.positioningLine(v)) return err("Fill in all three parts of the line for " + name + ".");
        if ((v.impressions == null) !== (v.clicks == null)) return err("Enter both impressions and clicks for " + name + ", or neither.");
        if (v.impressions != null && (v.impressions < 0 || v.clicks < 0 || !isFinite(v.impressions) || !isFinite(v.clicks))) return err("Impressions and clicks for " + name + " must be zero or more.");
        if (v.clicks != null && v.clicks > v.impressions) return err("Clicks can't be more than impressions for " + name + ".");
      }
      var isNew = !t.id;
      if (isNew) { t.id = uid(); t.created = Date.now(); }
      t.updated = Date.now();
      var clean = M.cleanTest(t);
      if (!clean) return err("A test needs at least two variants.");
      var g = G();
      g.tests = [clean].concat(g.tests.filter(function (x) { return x.id !== clean.id; })).slice(0, MAX_TESTS);
      sentNote["t:" + clean.id] = "";
      changed();
      if (isNew) step("test_set_up", 1, { kind: clean.kind, variants: clean.variants.length });
      draft = null; renderNew(); renderVariants();
      var m2 = document.getElementById("new-msg"); if (m2) m2.textContent = isNew ? "Saved. It’s listed above." : "Saved changes.";
    });
  }

  /* ---------------- Page Engine's data (read-only) ---------------- */
  function rows(list) { return (Array.isArray(list) ? list : []).filter(function (r) { return r && PM.isYmd(r.from) && PM.isYmd(r.to) && r.from <= r.to; }); }
  function pickPE(st, id) {
    var g = st && st.games && st.games[id];
    if (!g) return null;
    return { wishlists: rows(g.wishlists), traffic: rows(g.traffic),
      beats: (g.beats || []).map(function (b) { return PM.cleanBeat(b); }).filter(Boolean),
      versions: (g.versions || []).map(function (v) { return PM.cleanVersion(v, v && v.number); }).filter(Boolean) };
  }
  function loadPageEngine() {
    var id = gid(), local = null;
    try { local = JSON.parse(localStorage.getItem(PE_LS_KEY) || "null"); } catch (e) {}
    PE = pickPE(local, id) || { wishlists: [], traffic: [], beats: [], versions: [] };
    render();
    if (!accountUser) return Promise.resolve();
    var fromState = fetch("/api/tool-state/page-engine", { credentials: "same-origin" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      var st = j && j.state;
      if (id !== gid()) return;
      if (st && (!local || (Number(st.savedAt) || 0) > (Number(local.savedAt) || 0))) { var p = pickPE(st, id); if (p) PE = p; }
    }).catch(function () {});
    // Beats and versions logged by teammates or on another device live in the ledger; merge them in (latest row per id).
    var fromLedger = !window.GOS || !GOS.game ? Promise.resolve(null) : fetch("/api/games/" + encodeURIComponent(GOS.game.id) + "/signals?all=1&days=365", { credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    return Promise.all([fromState, fromLedger]).then(function (res) {
      if (id !== gid()) return;
      var j = res[1];
      if (j && j.rows) {
        var logs = PM.logsFromLedger(j.rows.filter(function (r) { return r.key === "beat" || r.key === "creative_version"; }));
        PE.beats = PM.mergeLog(PE.beats, logs.beats); PE.versions = PM.mergeLog(PE.versions, logs.versions);
      }
      render();
    });
  }

  /* ---------------- About ---------------- */
  function about() {
    var items = [
      "<b>No split testing on Steam:</b> Steamworks&rsquo; documentation, checked " + dl(M.STEAM_AB_CHECKED) + ", has no way to show two versions of a store asset to different players. So store tests compare the days before a change with the same number of days after it. Anything else that changed in those days, from a festival to a big creator video, can move the numbers too; the page lists what it knows about.",
      "<b>Store numbers</b> come from <a href=\"/game-os/page-engine\">Page Engine</a>: your daily traffic (impressions and visits) and wishlist adds from Steamworks, and the log of store changes and beats. Test Loop only reads them.",
      "<b>Off-Steam numbers</b> are the impressions and clicks you type in for each variant. They&rsquo;re saved to your account with the test.",
      "<b>Ranges:</b> click-through and click rate are shares, so the difference gets Newcombe&rsquo;s 95% range from two Wilson ranges. Wishlist adds per 100 visits isn&rsquo;t a share, so it gets exact Poisson ranges combined the same way. &ldquo;Better&rdquo; or &ldquo;worse&rdquo; only when the whole range sits on one side of zero; otherwise &ldquo;can&rsquo;t tell&rdquo;, which is the usual answer at indie traffic levels.",
      "<b>Minimums:</b> " + num(M.MIN_IMPRESSIONS) + " impressions and " + num(M.MIN_VISITS) + " visits in each store window, at least " + M.MIN_DAYS + " days a side (fewer and the weekday mix alone can swing it), and " + num(M.MIN_VARIANT_IMPRESSIONS) + " impressions per off-Steam variant. Below that, the page says &ldquo;too few to read yet&rdquo; and records nothing.",
      "<b>Several variants:</b> with three or four, each one&rsquo;s range is widened so the chance of a false &ldquo;better&rdquo; across all the comparisons stays at 5%.",
      "<b>No outside benchmarks:</b> there&rsquo;s no shared pool of other studios&rsquo; tests yet, so there&rsquo;s no &ldquo;typical lift&rdquo;. A change is compared only with what it replaced.",
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
      .catch(function (e) { status(e.message === "too large" ? "Too much to save to your account; delete older tests" : "Couldn't save to your account; your tests are still in this browser", "error"); });
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
    renderVariants(); renderNew();
    loadPageEngine();
  }
  if (window.GOS && GOS.onChange) {
    GOS.onChange(function () {
      if (!booted) return;
      var id = gid();
      if (id === lastGame) { render(); renderVariants(); return; }
      lastGame = id; draft = null; viewedStore = {}; viewedTest = {}; sentNote = {};
      renderVariants(); renderNew(); loadPageEngine();
    });
  }
})();
