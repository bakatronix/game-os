/* Signal Ledger & Momentum — page logic. Scoring lives in /game-os/toolkit/momentum.js (window.Momentum). */
(function () {
  "use strict";
  var MO = window.Momentum;
  var TOOL_ID = "ledger-view";
  var DAY = 86400000;
  var TOOLS = {
    "price-calc": { name: "Pricing Calculator", path: "/game-os/price-calc" },
    "steam-page-audit": { name: "Steam Page Audit", path: "/game-os/steam-page-audit" },
    "pmf": { name: "PMF Analyzer", path: "/game-os/PMF" },
    "market-scope": { name: "Market Scope", path: "/game-os/market-scope" },
    "mobile-calc": { name: "Mobile Calculator", path: "/game-os/mobile-calc" },
    "chicken-brulee": { name: "Chicken Brûlée", path: "/game-os/chicken-brulee" },
    "thesis-builder": { name: "Thesis Builder", path: "/game-os/thesis-builder" },
    "steam": { name: "Daily Steam snapshot", path: null },
    "audience-map": { name: "Audience Map", path: "/game-os/audience-map" },
  };
  var out = document.getElementById("out");
  var ROWS = [], LAST_GAME = null, filter = "all", loadId = 0;

  /* ---------------- Formatting ---------------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fmt(v, unit) {
    if (v == null || !isFinite(v)) return "—";
    switch (unit) {
      case "usd": return Math.abs(v) >= 1000 ? "$" + Math.round(v).toLocaleString("en-US") : "$" + v.toFixed(2);
      case "pct": return (Math.round(v * 10) / 10) + "%";
      case "score": return Math.round(v) + "/100";
      case "units": return Math.round(v).toLocaleString("en-US");
      case "hours": return v.toFixed(1) + " h";
      case "ratio": return v.toFixed(2) + "×";
      case "days": return Math.round(v) + " days";
      case "months": return Math.round(v) + " months";
      default: return String(Math.round(v * 100) / 100);
    }
  }
  function when(d) {
    try {
      var x = new Date(d), same = x.getFullYear() === new Date().getFullYear();
      return x.toLocaleDateString(undefined, same ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
    } catch (e) { return ""; }
  }
  function color(s) { return s == null ? "var(--ink-muted)" : s >= 75 ? "var(--status-healthy)" : s >= 55 ? "#2c6aa0" : s >= 35 ? "#a97a08" : "var(--status-concern)"; }
  function toolName(id) { return (TOOLS[id] && TOOLS[id].name) || id; }
  function toolLink(id) { var t = TOOLS[id]; return t && t.path ? '<a href="' + t.path + '">' + esc(t.name) + "</a>" : esc(toolName(id)); }
  function stageName(n) { return window.GOS && GOS.stageLabel ? GOS.stageLabel(n) : "Stage " + n; }

  /* ---------------- Load ---------------- */
  function load() {
    var G = window.GOS;
    if (!G.user) { out.innerHTML = '<section class="card"><p>Sign in to see your games&rsquo; signals.</p></section>'; return; }
    if (!G.game) { out.innerHTML = '<section class="card"><h3>No game yet</h3><p>Add a game in the bar above. Then send figures to it from any Game OS tool, and they&rsquo;ll appear here.</p></section>'; return; }
    var my = ++loadId, gid = G.game.id;
    out.innerHTML = '<div class="loading">Reading the ledger for ' + esc(G.game.title) + '&hellip;</div>';
    fetch("/api/games/" + encodeURIComponent(gid) + "/signals?all=1&days=730", { credentials: "same-origin" })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "Error " + r.status); return j; }); })
      .then(function (j) { if (my !== loadId) return; ROWS = j.rows || []; render(); })
      .catch(function (err) { if (my !== loadId) return; out.innerHTML = '<div class="notice bad">Couldn&rsquo;t read the ledger: ' + esc(err.message) + "</div>"; });
  }

  /* ---------------- Render ---------------- */
  function render() {
    var G = window.GOS, stage = G.game.stage || 1;
    var byKey = MO.latest(ROWS);
    var M = MO.compute(byKey, stage);
    var hist = MO.history(ROWS, stage);
    var ago = MO.scoreAt(ROWS, stage, 30 * DAY);
    var h = heroHtml(M, ago, stage) + pillarsHtml(M) + historyHtml(hist) + snapshotHtml() + ledgerHtml(byKey);
    out.innerHTML = h;
    var c = document.getElementById("ch-mom"); if (c && hist.length) c.innerHTML = momChart(hist, Math.max(300, Math.min(1000, c.clientWidth || 600)));
    document.getElementById("weights").innerHTML = weightsHtml(stage);
  }

  function ring(score) {
    var r = 74, c = 2 * Math.PI * r, off = score == null ? c : c * (1 - score / 100);
    return '<div class="ring"><svg viewBox="0 0 180 180" role="img" aria-label="Momentum ' + (score == null ? "no data" : Math.round(score) + " out of 100") + '">' +
      '<circle class="track" cx="90" cy="90" r="' + r + '"/><circle class="val" cx="90" cy="90" r="' + r + '" stroke="' + color(score) + '" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '" transform="rotate(-90 90 90)"/>' +
      '<text class="num" x="90" y="100" text-anchor="middle">' + (score == null ? "—" : Math.round(score)) + '</text><text class="of" x="90" y="122" text-anchor="middle">MOMENTUM</text></svg></div>';
  }
  function heroHtml(M, ago, stage) {
    var b = MO.band(M.score), have = M.pillars.filter(function (p) { return p.score != null && p.weight > 0; }).length;
    var counted = M.pillars.filter(function (p) { return p.weight > 0; }).length;
    var delta = "";
    if (M.score != null && ago != null) {
      var d = M.score - ago, cls = Math.abs(d) < 1 ? "flat" : d > 0 ? "up" : "down";
      delta = '<p><span class="delta ' + cls + '">' + (cls === "flat" ? "No change" : (d > 0 ? "▲ " : "▼ ") + Math.abs(Math.round(d)) + " points") + "</span> in the last 30 days</p>";
    } else if (M.score != null) delta = '<p class="note">Not enough history yet to show a 30-day change.</p>';
    var text = M.score == null
      ? "No scored figures yet. Send results to " + esc(window.GOS.game.title) + " from Market Scope, Steam Page Audit, the PMF Analyzer or Chicken Brûlée, or add a Steam App ID for the daily snapshot."
      : "Scored at the <b>" + esc(stageName(stage)) + "</b> stage, from " + have + " of " + counted + " pillars that count at this stage.";
    return '<section class="card accent"><div class="mom">' + ring(M.score) + "<div>" +
      '<span class="band ' + b.key + '">' + esc(b.label) + "</span><h2>" + esc(window.GOS.game.title) + "</h2>" +
      "<p>" + text + "</p>" + delta +
      (M.score != null ? '<div class="note">Coverage ' + Math.round(M.coverage * 100) + '%</div><div class="cover"><span style="width:' + Math.round(M.coverage * 100) + '%"></span></div>' : "") +
      "</div></div></section>";
  }

  function pillarsHtml(M) {
    return '<div class="pillars">' + M.pillars.map(function (p) {
      var body;
      if (p.score == null) {
        body = '<p class="empty-p">No figures yet. ' + (p.tools.length ? "Send results from " + p.tools.map(function (t) { return '<a href="/game-os/' + t.id + '">' + esc(t.name) + "</a>"; }).join(" or ") + "." : "") +
          (p.id === "traction" ? " Or add the game&rsquo;s Steam App ID for the daily snapshot." : "") + "</p>";
      } else {
        body = p.items.map(function (it) {
          var s = it.signal;
          return '<div class="sig"><div class="k">' + esc(s.label || s.key) + "<small>" + esc(it.bench) + " · " + esc(toolName(s.toolId)) + ", " + esc(when(s.observedAt)) + '</small></div><div class="v">' + esc(fmt(s.value, s.unit)) + '</div><div class="sc" style="background:' + color(it.score) + '">' + Math.round(it.score) + "</div></div>";
        }).join("");
      }
      var wTxt = p.weight === 0 ? "Not counted at this stage" : p.score == null ? "Would count " + Math.round(p.weight * 100) + "% at this stage" : Math.round(p.share * 100) + "% of the score";
      return '<section class="card pillar' + (p.weight === 0 ? " off" : "") + '"><div class="ph"><h3>' + esc(p.name) + '</h3><span class="ps" style="color:' + color(p.score) + '">' + (p.score == null ? "—" : Math.round(p.score)) + "</span></div>" +
        '<p class="note" style="margin:0">' + esc(p.q) + '</p><div class="pw">' + wTxt + "</div>" +
        '<div class="pbar"><span style="width:' + (p.score == null ? 0 : Math.round(p.score)) + "%;background:" + color(p.score) + '"></span></div>' + body + "</section>";
    }).join("") + "</div>";
  }

  function historyHtml(hist) {
    if (hist.length < 2) return "";
    return '<section class="card"><h3>Momentum over time</h3><p class="note">Recalculated at each point from the figures known then. Dashed lines mark the bands: 35 Watch, 55 Building, 75 Strong.</p><div id="ch-mom"></div></section>';
  }
  function momChart(pts, W) {
    var H = 220, pl = 34, pr = 14, pt = 12, pb = 28, iw = W - pl - pr, ih = H - pt - pb;
    var t0 = pts[0].t, t1 = pts[pts.length - 1].t, span = Math.max(1, t1 - t0);
    var x = function (t) { return pl + ((t - t0) / span) * iw; }, y = function (v) { return pt + ih - (v / 100) * ih; };
    var s = '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Momentum Score over time">';
    [0, 25, 50, 75, 100].forEach(function (g) { s += '<line class="grid" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(g) + '" y2="' + y(g) + '"/><text x="' + (pl - 6) + '" y="' + (y(g) + 4) + '" text-anchor="end">' + g + "</text>"; });
    [35, 55, 75].forEach(function (g) { s += '<line class="band-line" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(g) + '" y2="' + y(g) + '"/>'; });
    var line = pts.map(function (p) { return x(p.t).toFixed(1) + "," + y(p.score).toFixed(1); }).join(" ");
    s += '<polygon class="a-mom" points="' + x(t0) + "," + y(0) + " " + line + " " + x(t1) + "," + y(0) + '"/><polyline class="l-mom" points="' + line + '"/>';
    var labels = Math.min(6, pts.length);
    for (var i = 0; i < labels; i++) { var p = pts[Math.round((i * (pts.length - 1)) / Math.max(1, labels - 1))]; s += '<text x="' + x(p.t) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(new Date(p.t).toLocaleDateString(undefined, { day: "numeric", month: "short" })) + "</text>"; }
    pts.forEach(function (p) { s += '<circle class="d-mom" cx="' + x(p.t).toFixed(1) + '" cy="' + y(p.score).toFixed(1) + '" r="3" data-tip="' + esc(when(p.t)) + "<br>Momentum " + Math.round(p.score) + " · coverage " + Math.round(p.coverage * 100) + '%"/>'; });
    return s + "</svg>";
  }

  function snapshotHtml() {
    var G = window.GOS, app = G.game.steamAppId;
    var snaps = ROWS.filter(function (r) { return r.toolId === "steam"; });
    var last = snaps.length ? snaps[snaps.length - 1].observedAt : null;
    var body = app
      ? '<p class="note">Steam App ID <b>' + esc(app) + "</b>. Game OS records its Steam reviews, last-30-day reviews and players every day at 06:00 UTC." + (last ? " Last snapshot: " + esc(when(last)) + "." : " No snapshot yet.") + '</p><div class="snap"><button class="btn-ghost" type="button" id="snap-now">Record now</button><span class="feedback" id="snap-msg" role="status"></span></div>'
      : '<p class="note">Add this game&rsquo;s Steam App ID (the number in its store link) and Game OS will record its Steam reviews and players every day.</p><form class="snap" id="app-form"><span class="inwrap" style="max-width:220px"><input id="app-input" inputmode="numeric" placeholder="e.g. 1794680" aria-label="Steam App ID"></span><button class="btn-ghost" type="submit">Save App ID</button><span class="feedback" id="snap-msg" role="status"></span></form>';
    return '<section class="card no-print"><h3>Daily Steam snapshot</h3>' + body + "</section>";
  }

  function spark(hist) {
    var v = hist.map(function (h) { return h.value; }).filter(function (x) { return x != null && isFinite(x); });
    if (v.length < 2) return "";
    var mn = Math.min.apply(null, v), mx = Math.max.apply(null, v), W = 84, H = 22;
    var pts = v.map(function (val, i) { return ((i / (v.length - 1)) * (W - 4) + 2).toFixed(1) + "," + (mx === mn ? H / 2 : H - 3 - ((val - mn) / (mx - mn)) * (H - 6)).toFixed(1); }).join(" ");
    return '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" aria-hidden="true"><polyline points="' + pts + '" fill="none" stroke="var(--teal-deep)" stroke-width="1.6"/></svg>';
  }
  function ledgerHtml(byKey) {
    var keys = Object.keys(byKey);
    if (!keys.length) return '<section class="card"><h3>Every signal</h3><p class="empty-p">Nothing recorded for this game yet.</p></section>';
    var tools = {}; keys.forEach(function (k) { tools[byKey[k].toolId] = 1; });
    var list = keys.map(function (k) { return byKey[k]; }).filter(function (s) { return filter === "all" || s.toolId === filter; })
      .sort(function (a, b) { return toolName(a.toolId).localeCompare(toolName(b.toolId)) || String(a.label || a.key).localeCompare(String(b.label || b.key)); });
    var h = '<section class="card"><h3>Every signal</h3><div class="ledger-tools"><label>Source <select id="filter"><option value="all">All tools (' + keys.length + " signals)</option>" +
      Object.keys(tools).sort().map(function (t) { return '<option value="' + esc(t) + '"' + (filter === t ? " selected" : "") + ">" + esc(toolName(t)) + "</option>"; }).join("") +
      '</select></label><span class="note" style="margin:0">' + ROWS.length + " readings in the last two years</span></div>";
    h += '<div class="tbl-wrap"><table class="t"><thead><tr><th class="name">Signal</th><th>Latest</th><th class="sm-hide">Trend</th><th>Score</th><th class="sm-hide">Source</th><th>Updated</th></tr></thead><tbody>';
    list.forEach(function (s) {
      var rule = MO.RULES[s.key], sc = rule ? rule.score(s.value, s) : null;
      var hist = ROWS.filter(function (r) { return r.key === s.key; }).slice(-20);
      h += '<tr><td class="name">' + esc(s.label || s.key) + "</td><td>" + esc(fmt(s.value, s.unit)) + '</td><td class="spark sm-hide">' + spark(hist) + "</td>" +
        "<td>" + (sc == null ? '<span class="muted-cell" title="No benchmark yet: shown for reference, not scored">—</span>' : '<span class="scpill" style="background:' + color(sc) + '" title="' + esc(rule.bench) + '">' + Math.round(sc) + "</span>") + "</td>" +
        '<td class="sm-hide">' + toolLink(s.toolId) + "</td><td>" + esc(when(s.observedAt)) + "</td></tr>";
    });
    return h + "</tbody></table></div></section>";
  }

  function weightsHtml(stage) {
    var h = '<h3 style="margin-top:16px;font-size:14px">Pillar weights by stage</h3><div class="tbl-wrap"><table class="t compact weights"><thead><tr><th>Pillar</th>';
    for (var i = 1; i <= 8; i++) h += "<th" + (i === stage ? ' class="on"' : "") + ' title="' + esc(stageName(i)) + '">' + i + "</th>";
    h += "</tr></thead><tbody>";
    MO.PILLARS.forEach(function (p) {
      h += "<tr><td>" + esc(p.name) + "</td>";
      for (var i = 1; i <= 8; i++) h += '<td' + (i === stage ? ' class="on"' : "") + ">" + Math.round(MO.WEIGHTS[p.id][i] * 100) + "%</td>";
      h += "</tr>";
    });
    h += '</tbody></table></div><p class="note" style="margin-top:6px">Stages: ' + [1, 2, 3, 4, 5, 6, 7, 8].map(function (i) { return i + " " + esc(stageName(i)); }).join(" · ") + ".</p>";
    h += '<h3 style="margin-top:16px;font-size:14px">Benchmarks</h3><ul class="plain">' + Object.keys(MO.RULES).map(function (k) { return "<li><code>" + esc(k) + "</code>: " + esc(MO.RULES[k].bench) + "</li>"; }).join("") + "</ul>";
    return h;
  }

  /* ---------------- Actions ---------------- */
  function snapMsg(t, err) { var el = document.getElementById("snap-msg"); if (el) { el.textContent = t; el.className = "feedback" + (err ? " err" : ""); } }
  out.addEventListener("change", function (e) { if (e.target.id === "filter") { filter = e.target.value; render(); } });
  out.addEventListener("click", function (e) {
    if (e.target.id !== "snap-now") return;
    e.target.disabled = true; snapMsg("Reading Steam…");
    fetch("/api/games/" + encodeURIComponent(GOS.game.id) + "/steam-snapshot", { method: "POST", credentials: "same-origin" })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "Error " + r.status); return j; }); })
      .then(function (j) { snapMsg("Recorded " + j.recorded + " Steam figures."); if (window.gosTrack) gosTrack("journey_step", { tool_id: TOOL_ID, step_name: "snapshot_now" }); return GOS.refresh().then(load); })
      .catch(function (err) { snapMsg(err.message, true); e.target.disabled = false; });
  });
  out.addEventListener("submit", function (e) {
    if (e.target.id !== "app-form") return;
    e.preventDefault();
    var v = String(document.getElementById("app-input").value || "").trim(), m = v.match(/\/app\/(\d+)/) || v.match(/^(\d{1,9})$/);
    if (!m) { snapMsg("Enter the number from the game's Steam store link.", true); return; }
    snapMsg("Saving…");
    GOS.updateGame({ steamAppId: m[1] }).then(function () { snapMsg("Saved. Press Record now for the first snapshot."); })
      .catch(function (err) { snapMsg(err.message, true); });
  });

  var tip = document.getElementById("chart-tip");
  document.addEventListener("mousemove", function (e) {
    var t = e.target && e.target.getAttribute && e.target.getAttribute("data-tip");
    if (!t) { tip.style.display = "none"; return; }
    tip.innerHTML = t; tip.style.display = "block";
    var x = e.clientX + 14; if (x + tip.offsetWidth > window.innerWidth - 8) x = e.clientX - tip.offsetWidth - 14;
    tip.style.left = x + "px"; tip.style.top = e.clientY + 14 + "px";
  });
  var rT = null;
  window.addEventListener("resize", function () { clearTimeout(rT); rT = setTimeout(function () { if (ROWS.length && GOS.game) render(); }, 200); });
  document.getElementById("btn-print").addEventListener("click", function () { window.print(); });

  /* ---------------- Boot ---------------- */
  if (window.GOS && GOS.mountBar) GOS.mountBar("#gameBar", { toolId: TOOL_ID });
  if (window.GOS && GOS.ready) {
    GOS.ready.then(function () {
      LAST_GAME = GOS.game && GOS.game.id + ":" + GOS.game.stage + ":" + GOS.game.steamAppId;
      load();
      GOS.onChange(function () {
        var k = GOS.game && GOS.game.id + ":" + GOS.game.stage + ":" + GOS.game.steamAppId;
        if (k !== LAST_GAME) { LAST_GAME = k; load(); }
      });
    }, function () { out.innerHTML = '<div class="notice bad">Couldn&rsquo;t reach Game OS.</div>'; });
  }
})();
