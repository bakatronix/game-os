/* Window Planner — page logic. The scoring lives in model.js (window.WindowModel).
 * Data: /api/window-planner (upcoming releases) + /api/market-scope (past releases, same tags). */
(function () {
  "use strict";
  var M = window.WindowModel;
  var TOOL_ID = "window-planner";
  var LS_KEY = "gos_window_planner_v1";
  var MS_KEY = "gos_market_scope_v3"; // Market Scope's saved tags, to start from the same space
  var ACCOUNT_URL = "/api/tool-state/" + TOOL_ID;
  var MAX_TAGS = 5;

  /* ---------------- State ---------------- */
  function emptyState() { return { tags: [], weeks: 26, chosen: null, savedAt: 0 }; }
  function normalise(s) {
    if (!s || typeof s !== "object") return null;
    var b = emptyState();
    if (Array.isArray(s.tags)) b.tags = s.tags.map(Number).filter(function (n) { return n > 0; }).slice(0, MAX_TAGS);
    if ([13, 26, 39].indexOf(Number(s.weeks)) >= 0) b.weeks = Number(s.weeks);
    if (typeof s.chosen === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.chosen)) b.chosen = s.chosen;
    b.savedAt = Number(s.savedAt) || 0;
    return b;
  }
  function lsRead(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
  var S = normalise(lsRead(LS_KEY)) || emptyState();

  var TAGS = [], TAG_NAME = {};
  var UP = null, HIST = null, R = null, loading = false;

  var saveTimer = null;
  function changed() { if (saveTimer) clearTimeout(saveTimer); saveTimer = setTimeout(persist, 300); }
  function persist() {
    S.savedAt = Date.now();
    try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) {}
    scheduleAccountSave();
  }

  /* ---------------- Formatting ---------------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function tagName(id) { return TAG_NAME[id] || ("Tag " + id); }
  function tagList(ids) { return ids.map(tagName).join(" + "); }
  function n1(x) { return x == null ? "—" : x < 10 ? (Math.round(x * 10) / 10).toString() : Math.round(x).toString(); }
  function weekOf(w, year) { return "Week of " + M.fmt(w.start, year); }
  function scoreClass(s) { return s >= 75 ? "good" : s >= 55 ? "ok" : s >= 40 ? "warn" : "bad"; }
  function crowdBadge(w) {
    var c = w.crowd === "quiet" ? "good" : w.crowd === "busy" ? "bad" : "neutral";
    return '<span class="badge ' + c + '">' + (w.crowd === "quiet" ? "Quiet" : w.crowd === "busy" ? "Busy" : "Normal") + "</span>";
  }
  var KIND = { sale: "Seasonal sale", nextfest: "Next Fest", holiday: "Holiday", promo: "Discount event", fest: "Themed fest" };

  /* ---------------- Tag picker ---------------- */
  var chipsEl = document.getElementById("chips"), qEl = document.getElementById("tag-q"), listEl = document.getElementById("tag-list");
  var runBtn = document.getElementById("btn-run"), runMsg = document.getElementById("run-msg"), weeksEl = document.getElementById("weeks");
  var active = -1, shown = [];

  function key(tags) { return tags.slice().sort(function (a, b) { return a - b; }).join(","); }
  function renderChips() {
    chipsEl.innerHTML = S.tags.length
      ? S.tags.map(function (id) { return '<span class="chip">' + esc(tagName(id)) + '<button type="button" data-rm="' + id + '" aria-label="Remove ' + esc(tagName(id)) + '">&times;</button></span>'; }).join("")
      : '<span class="empty">No tags yet. Search below to add one.</span>';
    runBtn.disabled = !S.tags.length || loading;
    var stale = UP && (key(UP.tags) !== key(S.tags) || UP.weeks !== S.weeks);
    runBtn.textContent = stale ? "Plan again with these tags" : "Plan my launch window";
  }
  chipsEl.addEventListener("click", function (e) {
    var b = e.target.closest("[data-rm]"); if (!b) return;
    var id = +b.getAttribute("data-rm");
    S.tags = S.tags.filter(function (t) { return t !== id; });
    renderChips(); changed();
  });
  function norm(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
  function search(q) {
    q = norm(q); if (!q) return [];
    var starts = [], has = [];
    TAGS.forEach(function (t) {
      if (S.tags.indexOf(t.id) >= 0) return;
      var n = norm(t.name);
      if (n.indexOf(q) === 0) starts.push(t); else if (n.indexOf(q) > 0) has.push(t);
    });
    return starts.concat(has).slice(0, 12);
  }
  function renderList() {
    var q = qEl.value; shown = search(q);
    if (!q.trim()) { listEl.hidden = true; qEl.setAttribute("aria-expanded", "false"); return; }
    listEl.innerHTML = shown.length
      ? shown.map(function (t, i) { return '<li role="option" id="opt-' + i + '" data-id="' + t.id + '"' + (i === active ? ' class="on" aria-selected="true"' : "") + ">" + esc(t.name) + "</li>"; }).join("")
      : '<li class="none">' + (TAGS.length ? "No Steam tag matches that." : "Loading Steam tags…") + "</li>";
    listEl.hidden = false; qEl.setAttribute("aria-expanded", "true");
    if (active >= 0) qEl.setAttribute("aria-activedescendant", "opt-" + active); else qEl.removeAttribute("aria-activedescendant");
  }
  function addTag(id) {
    if (S.tags.indexOf(id) >= 0) return;
    if (S.tags.length >= MAX_TAGS) { say("Five tags at most. Remove one first.", true); return; }
    S.tags.push(id); qEl.value = ""; active = -1; renderList(); renderChips(); changed();
  }
  qEl.addEventListener("input", function () { active = -1; renderList(); });
  qEl.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown") { active = Math.min(shown.length - 1, active + 1); renderList(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { active = Math.max(0, active - 1); renderList(); e.preventDefault(); }
    else if (e.key === "Enter") { var t = shown[active >= 0 ? active : 0]; if (t) addTag(t.id); e.preventDefault(); }
    else if (e.key === "Escape") { qEl.value = ""; renderList(); }
  });
  listEl.addEventListener("mousedown", function (e) {
    var li = e.target.closest("[data-id]"); if (!li) return;
    e.preventDefault(); addTag(+li.getAttribute("data-id")); qEl.focus();
  });
  qEl.addEventListener("blur", function () { setTimeout(function () { listEl.hidden = true; qEl.setAttribute("aria-expanded", "false"); }, 120); });
  weeksEl.addEventListener("change", function () { S.weeks = Number(weeksEl.value) || 26; renderChips(); changed(); });

  function say(text, err) { runMsg.textContent = text || ""; runMsg.className = "feedback" + (err ? " err" : ""); }

  /* ---------------- Fetch ---------------- */
  var out = document.getElementById("out");
  function getJSON(url) {
    return fetch(url, { credentials: "same-origin" }).then(function (r) {
      return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || ("Error " + r.status)); return j; });
    });
  }
  function run() {
    if (!S.tags.length || loading) return;
    loading = true; renderChips();
    var k = key(S.tags), t0 = Date.now();
    say("Reading Steam’s upcoming and past releases for " + tagList(S.tags) + "… broad tags can take up to a minute.");
    if (!R) out.innerHTML = '<div class="loading">Reading Steam&hellip;</div>';
    Promise.all([
      getJSON("/api/window-planner?tags=" + k + "&weeks=" + S.weeks),
      getJSON("/api/market-scope?tags=" + k + "&months=36").catch(function () { return null; }), // history is a bonus, not a blocker
    ]).then(function (res) {
      UP = res[0]; HIST = res[1]; say(HIST ? "" : "Couldn’t read past releases, so “usual for that week” is missing. Try again later.", !HIST);
      analyse();
      if (window.gosTrack) gosTrack("journey_step", { tool_id: TOOL_ID, step_name: "window_planned", step_index: 2, tags: S.tags.length, upcoming: UP.rows.length, ms: Date.now() - t0 });
    }).catch(function (err) {
      say("Couldn't read Steam: " + err.message + ". Try again in a minute.", true);
      if (!R) out.innerHTML = "";
    }).then(function () { loading = false; renderChips(); });
  }
  runBtn.addEventListener("click", run);

  function analyse() {
    if (!UP) return;
    R = M.analyse(UP, HIST, { weeks: UP.weeks, tagNames: UP.tags.map(tagName) });
    if (S.chosen && !R.weeks.some(function (w) { return w.start === S.chosen; })) S.chosen = null;
    render();
  }

  /* ---------------- Render ---------------- */
  function chosenWeek() {
    var c = S.chosen && R.weeks.filter(function (w) { return w.start === S.chosen; })[0];
    return c || R.picks[0] || R.weeks[0];
  }

  function render() {
    var h = "";
    h += '<h2>Best weeks to launch</h2><p class="sub">For ' + esc(tagList(UP.tags)) + ", over the next " + R.weeks.length + " weeks (from " + M.fmt(R.first, true) + "). " +
      R.upcomingTotal + " upcoming games under these tags have a date or month on Steam" + (R.undated ? "; " + R.undated + " more say only “coming soon”" : "") + ".</p>";
    if (R.truncated) h += '<div class="notice warn">These tags are very broad, so Steam only returned part of the upcoming list. Add a tag to narrow it.</div>';
    h += '<div class="picks">' + R.picks.map(function (w, i) {
      var on = chosenWeek().start === w.start;
      return '<div class="pick' + (on ? " on" : "") + '">' +
        '<div class="pick-head"><span class="rank">' + (i + 1) + '</span><div><div class="pick-week">' + esc(weekOf(w, true)) + '</div>' +
        '<div class="pick-sub">Tuesday launch: ' + esc(M.fmt(w.launch)) + "</div></div>" +
        '<div class="score ' + scoreClass(w.score) + '" title="Week score out of 100">' + w.score + "</div></div>" +
        reasons(w) +
        '<button class="btn-ghost" type="button" data-choose="' + w.start + '">' + (S.chosen === w.start ? "Planned for this week" : on ? "Shown below" : "Look at this week") + "</button></div>";
    }).join("") + "</div>";

    h += '<div class="card"><h3>Week by week</h3>' +
      '<p class="note">Bars: games under your tags coming out that week (dark: exact date announced; light: listed only by month). Dots: how many usually come out that week. Shaded: Steam events. The strip underneath is each week&rsquo;s score. Click a week to look at it.</p>' +
      '<div id="wchart"></div>' +
      '<div class="legend"><span><i style="background:var(--c-ann)"></i>Announced date</span><span><i style="background:var(--c-month)"></i>Month only</span>' +
      '<span><i class="dot"></i>Usual for that week</span><span><i style="background:var(--c-sale)"></i>Seasonal sale</span><span><i style="background:var(--c-fest)"></i>Next Fest</span><span><i style="background:var(--c-hol)"></i>Holiday or other</span></div></div>';

    h += '<div id="detail"></div>';

    h += '<details class="card more-table"><summary>All weeks as a table</summary><div class="tbl-wrap"><table class="t"><thead><tr><th>Week of</th><th>Score</th><th>Crowding</th><th>Announced</th><th class="sm-hide">Usual</th><th class="name">Steam events</th></tr></thead><tbody>' +
      R.weeks.map(function (w) {
        return '<tr><td><button class="link-btn" type="button" data-choose="' + w.start + '">' + esc(M.fmt(w.start, true)) + "</button></td>" +
          '<td><span class="score sm ' + scoreClass(w.score) + '">' + w.score + "</span></td><td>" + crowdBadge(w) + "</td>" +
          "<td>" + w.announced + (w.monthShare >= 0.05 ? ' <span class="muted">+' + n1(w.monthShare) + "</span>" : "") + "</td>" +
          '<td class="sm-hide">' + (w.typical == null ? "—" : n1(w.typical)) + "</td>" +
          '<td class="name">' + (w.events.length ? w.events.map(function (e) { return esc(e.name); }).join(", ") : '<span class="muted">—</span>') + "</td></tr>";
      }).join("") + "</tbody></table></div></details>";

    out.innerHTML = h;
    drawChart();
    renderDetail();
    renderCalendar();
  }

  function reasons(w) {
    return '<ul class="why">' + w.why.map(function (r) {
      return '<li class="' + (r.good ? "good" : r.neutral ? "neutral" : "bad") + '">' + esc(r.text) + "</li>";
    }).join("") + "</ul>";
  }

  function drawChart() {
    var el = document.getElementById("wchart"); if (!el) return;
    var weeks = R.weeks, n = weeks.length;
    var W = Math.max(320, Math.min(1000, el.clientWidth || 960)), H = 250;
    var padL = 34, padR = 10, padT = 22, padB = 46, iw = W - padL - padR, ih = H - padT - padB;
    var slot = iw / n, bw = Math.max(4, slot * 0.62);
    var maxV = Math.max.apply(null, weeks.map(function (w) { return Math.max(w.announced + w.monthShare, w.typical || 0); }).concat([1]));
    var top = maxV <= 5 ? 5 : maxV <= 10 ? 10 : Math.ceil(maxV / 10) * 10;
    var y = function (v) { return padT + ih - (v / top) * ih; };
    var s = '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Upcoming releases and Steam events per week">';
    // Event bands
    weeks.forEach(function (w, i) {
      var ev = w.events.filter(function (e) { return e.kind !== "fest"; })[0];
      if (!ev) return;
      var cls = ev.kind === "sale" ? "ev-sale" : ev.kind === "nextfest" ? "ev-fest" : "ev-hol";
      s += '<rect class="' + cls + '" x="' + (padL + slot * i) + '" y="' + padT + '" width="' + slot + '" height="' + ih + '"/>';
    });
    // Label each event run once
    // Label each sale / Next Fest once; skip a label that would run into the previous one.
    var lastId = null, labelEnd = -1;
    weeks.forEach(function (w, i) {
      var ev = w.events.filter(function (e) { return e.kind === "sale" || e.kind === "nextfest"; })[0];
      if (ev && ev.id !== lastId) {
        var text = ev.kind === "sale" ? ev.name.replace("Steam ", "") : "Next Fest", x = padL + slot * i + 2;
        if (x > labelEnd) { s += '<text class="ev-l" x="' + x + '" y="' + (padT - 6) + '">' + esc(text) + "</text>"; labelEnd = x + text.length * 5.6 + 6; }
      }
      lastId = ev ? ev.id : null;
    });
    for (var g = 0; g <= 4; g++) {
      var gy = padT + ih - (ih * g) / 4;
      s += '<line class="grid" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + gy + '" y2="' + gy + '"/>';
      s += '<text x="' + (padL - 6) + '" y="' + (gy + 4) + '" text-anchor="end">' + Math.round((top * g) / 4) + "</text>";
    }
    var chosen = chosenWeek().start;
    var every = slot < 26 ? (slot < 16 ? 4 : 2) : 1;
    weeks.forEach(function (w, i) {
      var cx = padL + slot * i + slot / 2;
      if (w.start === chosen) s += '<rect class="sel" x="' + (padL + slot * i + 1) + '" y="' + (padT - 2) + '" width="' + (slot - 2) + '" height="' + (ih + 4) + '"/>';
      var a = w.announced, m = w.monthShare;
      if (a > 0) s += '<rect class="b-ann" x="' + (cx - bw / 2) + '" y="' + y(a) + '" width="' + bw + '" height="' + (padT + ih - y(a)) + '"/>';
      if (m > 0.02) s += '<rect class="b-month" x="' + (cx - bw / 2) + '" y="' + y(a + m) + '" width="' + bw + '" height="' + (y(a) - y(a + m)) + '"/>';
      if (w.typical != null) s += '<circle class="d-typ" cx="' + cx + '" cy="' + y(w.typical) + '" r="3.5"/>';
      // Score strip
      s += '<rect class="strip ' + scoreClass(w.score) + '" x="' + (padL + slot * i + 1) + '" y="' + (padT + ih + 6) + '" width="' + Math.max(1, slot - 2) + '" height="8"/>';
      if (i % every === 0) s += '<text x="' + cx + '" y="' + (H - 12) + '" text-anchor="middle">' + esc(M.fmt(w.start)) + "</text>";
      var tip = esc(weekOf(w, true)) + "<br>Score " + w.score + " · " + w.crowd + "<br>" + w.announced + " announced" + (m >= 0.05 ? " + " + n1(m) + " month-only" : "") +
        "<br>Usual: " + (w.typical == null ? "—" : n1(w.typical)) + (w.events.length ? "<br>" + w.events.map(function (e) { return esc(e.name); }).join(", ") : "");
      s += '<rect class="hit" data-tip="' + tip + '" data-choose="' + w.start + '" x="' + (padL + slot * i) + '" y="' + padT + '" width="' + slot + '" height="' + (ih + 16) + '"/>';
    });
    s += "</svg>";
    el.innerHTML = s;
  }

  function renderDetail() {
    var el = document.getElementById("detail"); if (!el) return;
    var w = chosenWeek(), r = M.RULES;
    var games = w.games.slice().sort(function (a, b) { return a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : a[1].localeCompare(b[1]); });
    var near = R.weeks.filter(function (x) { return Math.abs(x.i - w.i) === 1; });
    var nearCount = near.reduce(function (a, x) { return a + x.announced; }, 0);
    var h = '<div class="card accent detail"><div class="detail-head"><div><h3>' + esc(weekOf(w, true)) + "</h3>" +
      '<p class="note">' + esc(M.fmtRange(w.start, w.end)) + " · " + (S.chosen === w.start ? "your planned week" : "the best-scoring week; pick another above or in the chart") + "</p></div>" +
      '<div class="score big ' + scoreClass(w.score) + '">' + w.score + "<span>/100</span></div></div>";
    h += '<div class="grid-2"><div><h4>Why this score</h4>' + reasons(w) + "</div>";
    h += "<div><h4>Steam rules for this date</h4><ul class=\"plain\">" +
      "<li>Launch discount: " + r.launchDiscountMin + "–" + r.launchDiscountMax + "% off, running " + r.launchDiscountDays[0] + " to " + r.launchDiscountDays[1] + " days from launch. Set it up before release.</li>" +
      (w.joinableSale
        ? "<li>First seasonal sale you can join: the <b>" + esc(w.joinableSale.name) + "</b> (" + esc(M.fmtRange(w.joinableSale.start, w.joinableSale.end)) + "). You need to be on sale 30 days before it starts.</li>"
        : "<li>No announced seasonal sale you could join yet. The next ones aren&rsquo;t dated.</li>") +
      (w.nextSale && !w.canJoinNext ? (function () {
        var by = M.addDays(w.nextSale.start, -r.saleGapDays);
        return "<li>You&rsquo;d miss the <b>" + esc(w.nextSale.name) + "</b>" + (by >= R.today
          ? ": launch by " + esc(M.fmt(by, true)) + " to join it.</li>"
          : ". It&rsquo;s too late to launch in time for it (the cut-off was " + esc(M.fmt(by, true)) + ").</li>");
      })() : "") +
      "<li>No other discount for 30 days after launch, and no price rise in the first 30 days.</li>" +
      "<li>Next Fest is only for unreleased games: if you want a Next Fest, launch after it ends.</li>" +
      "</ul></div></div>";

    h += "<h4>Games under your tags with a date this week (" + games.length + ")</h4>";
    if (games.length) {
      h += '<ul class="games">' + games.slice(0, 40).map(function (g) {
        return '<li><a href="https://store.steampowered.com/app/' + g[0] + '/" target="_blank" rel="noopener">' + esc(g[1]) + '</a> <span class="muted">' + esc(M.fmt(g[2])) + "</span></li>";
      }).join("") + "</ul>" + (games.length > 40 ? '<p class="note">And ' + (games.length - 40) + " more.</p>" : "");
    } else {
      h += '<p class="note">None announced yet. ' + (w.typical != null ? "Usually about " + n1(w.typical) + " come out this week." : "") + "</p>";
    }
    if (games.length || nearCount) h += '<p class="note">' + (nearCount ? nearCount + " more are dated in the weeks either side. " : "") + "Most are small releases: open the ones that look big and check their following on Steam before you worry.</p>";

    h += '<div class="actions"><button class="btn" type="button" id="btn-plan">' + (S.chosen === w.start ? "Planned for this week" : "Plan for this week") + "</button>" +
      '<button class="btn-ghost" type="button" id="btn-send">Send to my game</button><span class="feedback" id="send-msg" role="status"></span></div>';
    h += "</div>";
    el.innerHTML = h;
  }

  function renderCalendar() {
    var el = document.getElementById("calendar"); if (!el) return;
    var from = R ? R.first : M.nextMonday(new Date().toISOString().slice(0, 10));
    var to = R ? R.weeks[R.weeks.length - 1].end : M.addDays(from, 26 * 7);
    var list = (R ? R.fests : M.EVENTS.filter(function (e) { return e.kind !== "fest"; }))
      .filter(function (e) { return e.end >= from && e.start <= to; })
      .sort(function (a, b) { return a.start < b.start ? -1 : a.start > b.start ? 1 : 0; });
    el.innerHTML = "<h3>Steam&rsquo;s calendar for this window</h3>" +
      '<p class="note">From <a href="' + M.SOURCE + '" target="_blank" rel="noopener">Steamworks upcoming events</a>, checked ' + esc(M.fmt(M.CHECKED, true)) + ". Themed fests show only when one matches your tags.</p>" +
      (list.length ? '<div class="tbl-wrap"><table class="t"><thead><tr><th class="name">Event</th><th>Type</th><th>Dates</th></tr></thead><tbody>' +
        list.map(function (e) { return '<tr><td class="name">' + esc(e.name) + "</td><td>" + esc(KIND[e.kind]) + "</td><td>" + esc(M.fmtRange(e.start, e.end)) + "</td></tr>"; }).join("") +
        "</tbody></table></div>" : '<p class="note">No announced events in this window.</p>') +
      (to > M.KNOWN_UNTIL ? '<p class="note">Steam hasn&rsquo;t announced events after ' + esc(M.fmt(M.KNOWN_UNTIL, true)) + " yet (the Autumn Sale and an October Next Fest usually follow).</p>" : "");
  }

  /* ---------------- Interaction ---------------- */
  function choose(start) {
    if (!R) return;
    S.chosen = start; changed(); render();
    var d = document.getElementById("detail"); if (d && d.scrollIntoView) d.scrollIntoView({ behavior: "smooth", block: "start" });
    if (window.gosTrack) gosTrack("journey_step", { tool_id: TOOL_ID, step_name: "week_chosen", step_index: 3 });
  }
  out.addEventListener("click", function (e) {
    var c = e.target.closest("[data-choose]"); if (c) { choose(c.getAttribute("data-choose")); return; }
    if (e.target.closest("#btn-plan")) { choose(chosenWeek().start); return; }
    if (e.target.closest("#btn-send")) sendSignals();
  });

  var tipEl = document.getElementById("chart-tip");
  out.addEventListener("mousemove", function (e) {
    var t = e.target.closest && e.target.closest("[data-tip]");
    if (!t) { tipEl.style.display = "none"; return; }
    tipEl.innerHTML = t.getAttribute("data-tip"); tipEl.style.display = "block";
    var x = e.clientX + 14, y = e.clientY + 14, r = tipEl.getBoundingClientRect();
    if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - 14;
    if (y + r.height > window.innerHeight - 8) y = e.clientY - r.height - 14;
    tipEl.style.left = x + "px"; tipEl.style.top = y + "px";
  });
  out.addEventListener("mouseleave", function () { tipEl.style.display = "none"; });
  var rz = null;
  window.addEventListener("resize", function () { if (rz) clearTimeout(rz); rz = setTimeout(function () { if (R) drawChart(); }, 150); });

  /* ---------------- Send to game ---------------- */
  function sendMsg(text, err) { var el = document.getElementById("send-msg"); if (el) { el.textContent = text; el.className = "feedback" + (err ? " err" : ""); } }
  function sendSignals() {
    if (!window.GOS || !GOS.ready) { sendMsg("Game OS isn't available on this page.", true); return; }
    GOS.ready.then(function () {
      if (!GOS.user) { sendMsg("Sign in to send this to a game.", true); return; }
      if (!GOS.game) { sendMsg("Pick or add a game in the bar at the top first.", true); return; }
      var w = chosenWeek();
      var meta = { week: w.start, launch: w.launch, tags: UP.tags.map(tagName), announced: w.announced, typical: w.typical, events: w.events.map(function (e) { return e.name; }), sale: w.joinableSale ? w.joinableSale.name : null };
      var list = [
        { key: "window_launch_score", label: "Launch week: " + M.fmt(w.start, true), value: w.score, unit: "score", meta: meta },
        { key: "window_competing_releases", label: "Releases under your tags expected that week", value: Math.round(w.expected * 10) / 10, unit: "units" },
        { key: "window_days_to_launch", label: "Days from today to the planned launch", value: M.daysBetween(new Date().toISOString().slice(0, 10), w.launch), unit: "units" },
      ];
      sendMsg("Sending to " + GOS.game.title + "…");
      GOS.recordSignals(TOOL_ID, list)
        .then(function () { sendMsg("Sent the week of " + M.fmt(w.start, true) + " to " + GOS.game.title + "."); if (window.gosTrack) gosTrack("output_action", { action: "send_signals" }); })
        .catch(function (err) { sendMsg("Could not send: " + err.message, true); });
    }, function () { sendMsg("Couldn't reach Game OS.", true); });
  }

  /* ---------------- Toolbar ---------------- */
  document.getElementById("btn-print").addEventListener("click", function () { window.print(); });
  document.getElementById("btn-clear").addEventListener("click", function () {
    if (!confirm("Clear your tags and planned week?")) return;
    S = emptyState(); UP = HIST = R = null; out.innerHTML = ""; weeksEl.value = "26"; renderChips(); renderCalendar(); say(""); persist();
  });

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
    status("Saving…");
  }
  function saveToAccount(keepalive) {
    fetch(ACCOUNT_URL, { method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state: S }), keepalive: !!keepalive })
      .then(function (r) { if (!r.ok) throw new Error(r.status); status("Saved to your account", "ok"); })
      .catch(function () { status("Couldn't save to your account; your work is still in this browser", "error"); });
  }
  /* Start from Market Scope's tags, else the game's genre. */
  function prefill() {
    if (S.tags.length || !TAGS.length) return false;
    var ms = lsRead(MS_KEY);
    if (ms && Array.isArray(ms.tags) && ms.tags.length) {
      S.tags = ms.tags.map(Number).filter(function (n) { return TAG_NAME[n]; }).slice(0, MAX_TAGS);
      if (S.tags.length) { renderChips(); changed(); say("Tags taken from your Market Scope. Adjust them, then plan."); return true; }
    }
    if (!window.GOS || !GOS.game || !GOS.game.genre) return false;
    var byName = {}; TAGS.forEach(function (t) { byName[norm(t.name)] = t.id; });
    var ids = [];
    String(GOS.game.genre).split(/[,/|×+&]| x | and /i).forEach(function (part) {
      var n = norm(part), id = byName[n] || byName[n.replace(/ /g, "")];
      if (id && ids.indexOf(id) < 0) ids.push(id);
    });
    if (!ids.length) return false;
    S.tags = ids.slice(0, MAX_TAGS); renderChips(); changed();
    say("Tags filled in from " + GOS.game.title + "'s genre. Adjust them, then plan.");
    return true;
  }
  function initAccount() {
    if (!window.GOS || !GOS.ready) { status("Saved in this browser"); return Promise.resolve(); }
    return GOS.ready.then(function () {
      accountUser = !!GOS.user;
      if (!accountUser) { status("Not signed in: saved in this browser only", "error"); return; }
      return fetch(ACCOUNT_URL, { credentials: "same-origin" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          var server = j && j.state ? normalise(j.state) : null;
          if (server && (server.savedAt || 0) > (S.savedAt || 0) + 1000) {
            S = server; weeksEl.value = String(S.weeks); renderChips();
            try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) {}
          }
          accountReady = true;
          if (server) status("Saved to your account", "ok");
          else if (S.tags.length) saveToAccount();
        });
    }).catch(function () { status("Saved in this browser"); });
  }
  window.addEventListener("pagehide", function () { if (accountReady && accountTimer) { clearTimeout(accountTimer); saveToAccount(true); } });

  /* ---------------- Boot ---------------- */
  document.getElementById("checked").textContent = M.fmt(M.CHECKED, true);
  document.getElementById("known").textContent = M.fmt(M.KNOWN_UNTIL, true);
  weeksEl.value = String(S.weeks);
  renderChips();
  renderCalendar();
  if (window.GOS && GOS.mountBar) GOS.mountBar("#gameBar", { toolId: TOOL_ID });
  var tagsReady = fetch("/api/market-scope?list=tags")
    .then(function (r) { return r.ok ? r.json() : { tags: [] }; })
    .then(function (j) { TAGS = (j.tags || []).slice().sort(function (a, b) { return a.name.localeCompare(b.name); }); TAGS.forEach(function (t) { TAG_NAME[t.id] = t.name; }); renderChips(); renderList(); })
    .catch(function () { say("Couldn't load Steam's tag list. Reload to try again.", true); });
  Promise.all([tagsReady, initAccount()]).then(function () {
    if (!prefill() && S.tags.length) run();
  });
  if (window.GOS && GOS.onChange) {
    var lastGame = null;
    GOS.onChange(function (s) { var id = s.game && s.game.id; if (id !== lastGame) { lastGame = id; prefill(); } });
  }
})();
