/* Market Scope — page logic. The math lives in model.js (window.MarketModel); data comes from /api/market-scope. */
(function () {
  "use strict";
  var M = window.MarketModel;
  var TOOL_ID = "market-scope";
  var LS_KEY = "gos_market_scope_v3";
  var ACCOUNT_URL = "/api/tool-state/" + TOOL_ID;
  var API = "/api/market-scope";
  var MAX_TAGS = 5;
  var MAX_COMPS = 25;

  /* ---------------- State ---------------- */
  function emptyState() { return { tags: [], mult: M.DEFAULTS.mult, share: M.DEFAULTS.share, picked: {}, savedAt: 0 }; }
  function normalise(s) {
    if (!s || typeof s !== "object") return null;
    var b = emptyState();
    if (Array.isArray(s.tags)) b.tags = s.tags.map(Number).filter(function (n) { return n > 0; }).slice(0, MAX_TAGS);
    if (Number(s.mult) > 0) b.mult = Number(s.mult);
    if (Number(s.share) > 0) b.share = Number(s.share);
    if (s.picked && typeof s.picked === "object") b.picked = s.picked;
    b.savedAt = Number(s.savedAt) || 0;
    return b;
  }
  var S = (function () { try { return normalise(JSON.parse(localStorage.getItem(LS_KEY) || "null")); } catch (e) { return null; } })() || emptyState();

  var TAGS = [];          // [{id, name}]
  var TAG_NAME = {};      // id -> name
  var DATA = null;        // last API payload
  var R = null;           // last analysis
  var loading = false;

  var saveTimer = null;
  function changed() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 300);
  }
  function persist() {
    S.savedAt = Date.now();
    try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) {}
    scheduleAccountSave();
  }

  /* ---------------- Formatting ---------------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function usdShort(n) {
    if (n == null || !isFinite(n)) return "—";
    var a = Math.abs(n);
    if (a >= 1e6) return "$" + (n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
    if (a >= 1e3) return "$" + (n / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, "") + "K";
    return "$" + Math.round(n);
  }
  function pct(x, d) { return x == null || !isFinite(x) ? "—" : (x * 100).toFixed(d || 0) + "%"; }
  function num(n) { return n == null ? "—" : Math.round(n).toLocaleString("en-US"); }
  function tagName(id) { return TAG_NAME[id] || ("Tag " + id); }
  function tagList(ids) { return ids.map(tagName).join(" + "); }
  function monthYear(ymd) {
    var p = String(ymd).split("-");
    return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+p[1] - 1] + " " + p[0];
  }
  function oneIn(x) { return x > 0 ? "about 1 in " + Math.max(1, Math.round(1 / x)) : "none"; }

  /* ---------------- Tag picker ---------------- */
  var chipsEl = document.getElementById("chips");
  var qEl = document.getElementById("tag-q");
  var listEl = document.getElementById("tag-list");
  var runBtn = document.getElementById("btn-run");
  var runMsg = document.getElementById("run-msg");
  var active = -1, shown = [];

  function renderChips() {
    chipsEl.innerHTML = S.tags.length
      ? S.tags.map(function (id) {
        return '<span class="chip">' + esc(tagName(id)) + '<button type="button" data-rm="' + id + '" aria-label="Remove ' + esc(tagName(id)) + '">&times;</button></span>';
      }).join("")
      : '<span class="empty">No tags yet. Search below to add one.</span>';
    runBtn.disabled = !S.tags.length || loading;
    var stale = DATA && DATA.tags.join(",") !== S.tags.slice().sort(function (a, b) { return a - b; }).join(",");
    runBtn.textContent = stale ? "Size this market again" : "Size this market";
  }
  chipsEl.addEventListener("click", function (e) {
    var b = e.target.closest("[data-rm]"); if (!b) return;
    var id = +b.getAttribute("data-rm");
    S.tags = S.tags.filter(function (t) { return t !== id; });
    renderChips(); changed();
  });

  function norm(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
  function search(q) {
    q = norm(q);
    if (!q) return [];
    var starts = [], has = [];
    TAGS.forEach(function (t) {
      if (S.tags.indexOf(t.id) >= 0) return;
      var n = norm(t.name);
      if (n.indexOf(q) === 0) starts.push(t); else if (n.indexOf(q) > 0) has.push(t);
    });
    return starts.concat(has).slice(0, 12);
  }
  function renderList() {
    var q = qEl.value;
    shown = search(q);
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
    if (window.gosTrack) gosTrack("journey_step", { tool_id: TOOL_ID, step_name: "tag_added", step_index: 1, tags: S.tags.length });
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

  function say(text, err) { runMsg.textContent = text || ""; runMsg.className = "feedback" + (err ? " err" : ""); }

  /* ---------------- Assumptions ---------------- */
  var multEl = document.getElementById("a-mult"), shareEl = document.getElementById("a-share");
  function syncAssumptions() { multEl.value = S.mult; shareEl.value = S.share; }
  function onAssume() {
    var m = Number(multEl.value), s = Number(shareEl.value);
    if (m >= 1 && m <= 200) S.mult = m;
    if (s >= 1 && s <= 100) S.share = s;
    changed(); analyse();
  }
  multEl.addEventListener("input", onAssume);
  shareEl.addEventListener("input", onAssume);

  /* ---------------- Fetch + analyse ---------------- */
  var out = document.getElementById("out");
  function run() {
    if (!S.tags.length || loading) return;
    loading = true; renderChips();
    var key = S.tags.slice().sort(function (a, b) { return a - b; }).join(",");
    say("Reading Steam releases for " + tagList(S.tags) + "… this can take up to a minute for broad tags.");
    if (!DATA) out.innerHTML = '<div class="loading">Reading Steam&hellip;</div>';
    var t0 = Date.now();
    fetch(API + "?tags=" + key, { credentials: "same-origin" })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || ("Error " + r.status)); return j; }); })
      .then(function (j) {
        DATA = j; say(""); analyse();
        if (window.gosTrack) gosTrack("journey_step", { tool_id: TOOL_ID, step_name: "market_sized", step_index: 2, tags: S.tags.length, games: j.rows.length, ms: Date.now() - t0 });
      })
      .catch(function (err) { say("Couldn't read Steam: " + err.message + ". Try again in a minute.", true); if (!DATA) out.innerHTML = ""; })
      .then(function () { loading = false; renderChips(); });
  }
  runBtn.addEventListener("click", run);

  function analyse() {
    if (!DATA) return;
    R = M.analyse(DATA, { mult: S.mult, share: S.share });
    renderResults();
  }

  /* ---------------- Charts ---------------- */
  function spreadBars(bins, total) {
    var max = Math.max.apply(null, bins.map(function (b) { return b.n; }).concat([1]));
    return '<div class="hbars">' + bins.map(function (b, i) {
      var w = (b.n / max) * 100;
      return '<div class="hb"><span class="hb-l">' + esc(b.label) + '</span><span class="hb-track"><span class="hb-bar' + (i < 2 ? " small" : "") + '" style="width:' + w.toFixed(1) + '%"></span></span>' +
        '<span class="hb-n">' + b.n + ' <span class="muted">(' + pct(total ? b.n / total : 0) + ")</span></span></div>";
    }).join("") + "</div>";
  }

  function crowdChart(qs, width) {
    var W = Math.max(300, Math.min(1000, width)), H = 260, padL = 40, padR = 52, padT = 18, padB = 34;
    var iw = W - padL - padR, ih = H - padT - padB, n = qs.length, slot = iw / n, bw = Math.max(6, slot * 0.6);
    var maxRel = Math.max.apply(null, qs.map(function (q) { return q.releases; }).concat([1]));
    var meds = qs.map(function (q) { return q.median; }).filter(function (v) { return v != null; });
    var maxRev = Math.max.apply(null, meds.concat([1]));
    function niceMax(v) { var p = Math.pow(10, Math.floor(Math.log10(v))); var m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; }
    var yRel = niceMax(maxRel), yRev = niceMax(maxRev);
    var s = '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Releases per quarter and median revenue per release">';
    for (var g = 0; g <= 4; g++) {
      var y = padT + ih - (ih * g) / 4;
      s += '<line class="grid" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + y + '" y2="' + y + '"/>';
      s += '<text x="' + (padL - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + Math.round((yRel * g) / 4) + "</text>";
      s += '<text x="' + (W - padR + 6) + '" y="' + (y + 4) + '">' + usdShort((yRev * g) / 4) + "</text>";
    }
    var every = slot < 34 ? (slot < 20 ? 4 : 2) : 1, pts = [];
    qs.forEach(function (q, i) {
      var cx = padL + slot * i + slot / 2, h = (q.releases / yRel) * ih;
      var tip = esc(q.label) + (q.partial ? " (part quarter)" : "") + "<br>" + q.releases + " releases<br>Median revenue " + usdShort(q.median) + (q.maturing ? "<br><i>Still maturing</i>" : "");
      s += '<rect class="b-rel' + (q.maturing ? " mat" : "") + '" x="' + (cx - bw / 2) + '" y="' + (padT + ih - h) + '" width="' + bw + '" height="' + Math.max(0, h) + '"/>';
      if (q.median != null) pts.push({ x: cx, y: padT + ih - (q.median / yRev) * ih, m: q.maturing });
      if (i % every === 0) s += '<text x="' + cx + '" y="' + (H - padB + 16) + '" text-anchor="middle">' + esc(q.key.slice(2).replace("-", " ")) + "</text>";
      s += '<rect class="hit" data-tip="' + tip + '" x="' + (padL + slot * i) + '" y="' + padT + '" width="' + slot + '" height="' + ih + '"/>';
    });
    if (pts.length > 1) s += '<polyline class="l-rev" points="' + pts.map(function (p) { return p.x.toFixed(1) + "," + p.y.toFixed(1); }).join(" ") + '"/>';
    pts.forEach(function (p) { s += '<circle class="d-rev' + (p.m ? " mat" : "") + '" cx="' + p.x + '" cy="' + p.y + '" r="4" pointer-events="none"/>'; });
    s += '<line class="axis" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + (padT + ih) + '" y2="' + (padT + ih) + '"/>';
    s += '<text x="' + padL + '" y="11">Releases</text><text x="' + (W - padR + 50) + '" y="11" text-anchor="end">Median revenue</text>';
    return s + "</svg>";
  }

  var tip = document.getElementById("chart-tip");
  document.addEventListener("mousemove", function (e) {
    var t = e.target && e.target.getAttribute && e.target.getAttribute("data-tip");
    if (!t) { tip.style.display = "none"; return; }
    tip.innerHTML = t; tip.style.display = "block";
    var x = e.clientX + 14, y = e.clientY + 14;
    if (x + tip.offsetWidth > window.innerWidth - 8) x = e.clientX - tip.offsetWidth - 14;
    tip.style.left = x + "px"; tip.style.top = y + "px";
  });

  /* ---------------- Results ---------------- */
  function verdict() {
    var sp = R.spread, cr = R.crowding, parts = [];
    if (!sp.n) return "Too few paid games released 6 to 36 months ago to say anything. Try broader tags.";
    parts.push("Of " + sp.n + " paid games released here 6 to 36 months ago, the middle one earned about <b>" + usdShort(sp.median) + "</b> gross, and <b>" + oneIn(sp.overHit) + "</b> passed $100K.");
    if (sp.underSmall != null) parts.push(pct(sp.underSmall) + " earned under $10K.");
    if (cr.change != null) {
      var c = cr.change;
      parts.push(c > 0.2 ? "The space is <b>getting more crowded</b>: " + cr.lastYear + " releases in the last 12 months, up " + pct(c) + " on the year before."
        : c < -0.1 ? "The space is <b>thinning out</b>: " + cr.lastYear + " releases in the last 12 months, down " + pct(-c) + " on the year before."
        : "Release numbers are <b>steady</b>: " + cr.lastYear + " in the last 12 months against " + cr.prevYear + " the year before.");
    }
    var open = R.gaps.filter(function (g) { return g.verdict === "opening"; }).slice(0, 3);
    if (open.length) parts.push("Possible openings: " + open.map(function (g) { return "<b>+ " + esc(tagName(g.tag)) + "</b>"; }).join(", ") + ".");
    return parts.join(" ");
  }

  function renderResults() {
    var sp = R.spread, cr = R.crowding, d = DATA;
    var h = "";
    var shown = S.tags.slice().sort(function (a, b) { return a - b; }).join(",") === d.tags.join(",") ? S.tags : d.tags;
    h += '<h2>' + esc(tagList(shown)) + "</h2>";
    h += '<p class="sub">' + num(R.total) + " games released " + monthYear(d.from) + " to " + monthYear(d.to) + " (" + num(R.paid) + " paid, " + num(sp.free) + " free). Read from Steam " +
      new Date(d.fetchedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) + ". Estimates use " + S.mult + " copies per review at " + S.share + "% of list price.</p>";
    if (d.truncated) h += '<div class="notice warn"><b>Too many games to read them all.</b> Steam listed more releases than this tool reads at once, so only games back to ' + monthYear(d.reached) + " are counted. Older games are missing, so the revenue spread leans on recent releases and the year-on-year change is left out. Add a tag to narrow the space.</div>";
    if (sp.n && sp.n < 30) h += '<div class="notice warn"><b>Small sample.</b> Only ' + sp.n + " paid games are old enough to count. Read the figures as a rough guide.</div>";

    h += '<div class="kpis">' +
      kpi("hero", usdShort(sp.median), "Median revenue", "Gross, games 6–36 months old") +
      kpi("", usdShort(sp.p75), "Top quarter", "75th percentile earns at least") +
      kpi("", usdShort(sp.p90), "Top tenth", "90th percentile earns at least") +
      kpi("", pct(sp.underSmall), "Under $10K", "Share of those games") +
      kpi("", num(cr.lastYear), "Releases, last 12 months", cr.change == null ? (d.truncated ? "Change not shown: list cut short" : "No earlier year to compare") : (cr.change >= 0 ? "Up " : "Down ") + pct(Math.abs(cr.change)) + " on the year before") +
      "</div>";
    h += '<section class="card accent"><h3>Verdict</h3><p class="verdict">' + verdict() + "</p></section>";

    h += '<div class="grid-2">';
    h += '<section class="card"><h3>Revenue spread</h3><p class="note">How many paid games 6–36 months old reached each band of estimated gross revenue.</p>' + spreadBars(sp.bins, sp.n) + "</section>";
    h += '<section class="card"><h3>Crowding trend</h3><p class="note">Bars: releases per quarter. Line: median revenue of that quarter&rsquo;s paid games. Faded bars and hollow dots are still maturing; their revenue will rise.</p><div id="crowd"></div>' +
      '<div class="legend"><span><i style="background:var(--c-rel)"></i>Releases</span><span><i style="background:var(--c-rev);height:3px;vertical-align:middle"></i>Median revenue</span></div></section>';
    h += "</div>";

    h += '<section class="card"><h3>Tag-pair gaps</h3><p class="note">Games in your space that also carry one more tag. <b>Hit rate</b> is the share that passed $100K; across your whole space it is ' + pct(sp.overHit, 1) +
      '. An <b>opening</b> has few games but at least twice your space&rsquo;s hit rate. <b>Crowded</b> means many games for no better hit rate. Steam lists only each game&rsquo;s top tags, and popular games collect more tags, so small groups lean towards hits: treat an opening as a lead to check. Click a tag to add it to your space.</p>';
    if (!R.gaps.length) h += '<p class="muted">Not enough games share extra tags to compare. Try broader tags.</p>';
    else {
      h += '<div class="tbl-wrap"><table class="t"><thead><tr><th class="name">Add this tag</th><th>Games</th><th class="sm-hide">Of your space</th><th>Hit rate</th><th class="sm-hide">Median</th><th></th></tr></thead><tbody>';
      R.gaps.slice(0, gapsShown).forEach(function (g) {
        var badge = g.verdict === "opening" ? '<span class="badge good">Opening</span>' : g.verdict === "crowded" ? '<span class="badge bad">Crowded</span>' : "";
        h += '<tr><td class="name"><button type="button" class="link-btn" data-add="' + g.tag + '">+ ' + esc(tagName(g.tag)) + "</button></td><td>" + g.n + "</td><td class=\"sm-hide\">" + pct(g.share) + "</td><td>" + pct(g.hit) + "</td><td class=\"sm-hide\">" + usdShort(g.median) + "</td><td>" + badge + "</td></tr>";
      });
      h += "</tbody></table></div>";
      if (R.gaps.length > gapsShown) h += '<div class="actions"><button type="button" class="btn-small" id="more-gaps">Show all ' + R.gaps.length + " tags</button></div>";
    }
    h += "</section>";

    h += '<section class="card"><h3>Top earners: your comp candidates</h3><p class="note">The 25 paid games with the highest estimated gross revenue in this space, any age. Tick the ones closest to your game in scope and price, then send them to your thesis.</p>';
    h += '<div class="tbl-wrap"><table class="t"><thead><tr><th class="ck"></th><th class="name">Game</th><th class="sm-hide">Released</th><th>Price</th><th>Reviews</th><th>Est. revenue</th></tr></thead><tbody>';
    R.comps.forEach(function (c) {
      var on = !!S.picked[c.appid];
      h += '<tr><td class="ck"><input type="checkbox" data-pick="' + c.appid + '"' + (on ? " checked" : "") + ' aria-label="Use ' + esc(c.name) + ' as a comp"></td>' +
        '<td class="name"><a href="https://store.steampowered.com/app/' + c.appid + '/" target="_blank" rel="noopener">' + esc(c.name) + "</a></td>" +
        "<td class=\"sm-hide\">" + monthYear(c.date) + "</td><td>$" + c.price.toFixed(2) + "</td><td>" + (c.reviews == null ? "&lt;10" : num(c.reviews) + (c.pct != null ? ' <span class="muted">' + c.pct + "%</span>" : "")) + "</td><td>" + usdShort(c.rev) + "</td></tr>";
    });
    h += "</tbody></table></div>";
    h += '<div class="actions"><button type="button" class="btn" id="send-comps">Send ticked comps to thesis</button><button type="button" class="btn-ghost" id="send-signals">Send market figures to your game</button><span class="feedback" id="send-msg" role="status"></span></div>';
    h += "</section>";

    out.innerHTML = h;
    drawCrowd();
    renderChips();
  }
  var gapsShown = 15;
  function kpi(cls, v, l, s) { return '<div class="kpi ' + cls + '"><div class="v">' + v + '</div><div class="l">' + esc(l) + '</div><div class="s">' + esc(s) + "</div></div>"; }
  function drawCrowd() {
    var el = document.getElementById("crowd");
    if (el && R) el.innerHTML = crowdChart(R.quarters, el.clientWidth || 480);
  }
  var rT = null;
  window.addEventListener("resize", function () { clearTimeout(rT); rT = setTimeout(drawCrowd, 150); });

  out.addEventListener("click", function (e) {
    var add = e.target.closest("[data-add]");
    if (add) { addTag(+add.getAttribute("data-add")); document.getElementById("picker").scrollIntoView({ behavior: "smooth" }); run(); return; }
    if (e.target.id === "more-gaps") { gapsShown = 1000; renderResults(); return; }
    if (e.target.id === "send-comps") return sendComps();
    if (e.target.id === "send-signals") return sendSignals();
  });
  out.addEventListener("change", function (e) {
    var p = e.target.getAttribute && e.target.getAttribute("data-pick");
    if (!p) return;
    if (e.target.checked) S.picked[p] = 1; else delete S.picked[p];
    changed();
  });

  /* ---------------- Send to Game OS ---------------- */
  function sendMsg(text, err) { var el = document.getElementById("send-msg"); if (el) { el.textContent = text; el.className = "feedback" + (err ? " err" : ""); } }
  function withGame(fn) {
    if (!window.GOS || !GOS.ready) { sendMsg("Game OS isn't available on this page.", true); return; }
    GOS.ready.then(function () {
      if (!GOS.user) { sendMsg("Sign in to send this to a game.", true); return; }
      if (!GOS.game) { sendMsg("Pick or add a game in the bar at the top first.", true); return; }
      fn();
    }, function () { sendMsg("Couldn't reach Game OS.", true); });
  }
  function sendComps() {
    var picked = R.comps.filter(function (c) { return S.picked[c.appid]; });
    if (!picked.length) { sendMsg("Tick at least one game first.", true); return; }
    withGame(function () {
      var existing = (GOS.thesis && Array.isArray(GOS.thesis.compSet)) ? GOS.thesis.compSet.slice() : [];
      var have = {}; existing.forEach(function (c) { have[String(c.name).toLowerCase()] = 1; });
      var added = picked.filter(function (c) { return !have[c.name.toLowerCase()]; })
        .map(function (c) { return { name: c.name.slice(0, 80), price: c.price }; });
      if (!added.length) { sendMsg("Those games are already in " + GOS.game.title + "'s comp set."); return; }
      var room = MAX_COMPS - existing.length;
      if (room <= 0) { sendMsg("The comp set already has " + MAX_COMPS + " games. Remove some in Thesis Builder first.", true); return; }
      var list = existing.concat(added.slice(0, room));
      sendMsg("Saving to " + GOS.game.title + "…");
      GOS.saveThesis({ compSet: list }, TOOL_ID, "Added " + Math.min(room, added.length) + " comps from Market Scope (" + tagList(DATA.tags) + ")")
        .then(function () {
          sendMsg("Added " + Math.min(room, added.length) + " to " + GOS.game.title + "'s comp set" + (added.length > room ? " (" + (added.length - room) + " left out: the set is full)" : "") + ".");
          if (window.gosTrack) gosTrack("output_action", { action: "send_comps", count: added.length });
        })
        .catch(function (err) { sendMsg("Could not save: " + err.message, true); });
    });
  }
  function sendSignals() {
    withGame(function () {
      var sp = R.spread, cr = R.crowding;
      var meta = { tags: DATA.tags.map(tagName), from: DATA.from, to: DATA.to, games: R.total, mature_paid: sp.n, copies_per_review: S.mult, price_paid_pct: S.share, truncated: !!DATA.truncated };
      var list = [
        { key: "market_median_revenue", label: "Median gross revenue, " + tagList(DATA.tags), value: sp.median, unit: "usd", meta: meta },
        { key: "market_p75_revenue", label: "Top-quarter gross revenue", value: sp.p75, unit: "usd" },
        { key: "market_p90_revenue", label: "Top-tenth gross revenue", value: sp.p90, unit: "usd" },
        { key: "market_hit_rate", label: "Share of games over $100K", value: sp.overHit == null ? null : sp.overHit * 100, unit: "pct" },
        { key: "market_share_under_10k", label: "Share of games under $10K", value: sp.underSmall == null ? null : sp.underSmall * 100, unit: "pct" },
        { key: "market_releases_last_year", label: "Releases in the last 12 months", value: cr.lastYear, unit: "units" },
      ];
      if (cr.change != null) list.push({ key: "market_release_change", label: "Change in releases vs the year before", value: cr.change * 100, unit: "pct" });
      list = list.filter(function (s) { return s.value != null && isFinite(s.value); });
      sendMsg("Sending to " + GOS.game.title + "…");
      GOS.recordSignals(TOOL_ID, list)
        .then(function () { sendMsg("Sent " + list.length + " market figures to " + GOS.game.title + "."); if (window.gosTrack) gosTrack("output_action", { action: "send_signals" }); })
        .catch(function (err) { sendMsg("Could not send: " + err.message, true); });
    });
  }

  /* ---------------- Toolbar ---------------- */
  document.getElementById("btn-print").addEventListener("click", function () { window.print(); });
  document.getElementById("btn-clear").addEventListener("click", function () {
    if (!confirm("Clear your tags and ticked comps?")) return;
    S = emptyState(); DATA = null; R = null; out.innerHTML = ""; syncAssumptions(); renderChips(); say(""); persist();
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
    var body = JSON.stringify({ state: S });
    fetch(ACCOUNT_URL, { method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: body, keepalive: !!keepalive })
      .then(function (r) { if (!r.ok) throw new Error(r.status); status("Saved to your account", "ok"); })
      .catch(function () { status("Couldn't save to your account; your work is still in this browser", "error"); });
  }
  function prefillFromGame() {
    if (S.tags.length || !window.GOS || !GOS.game || !GOS.game.genre || !TAGS.length) return false;
    var byName = {}; TAGS.forEach(function (t) { byName[norm(t.name)] = t.id; });
    var ids = [];
    String(GOS.game.genre).split(/[,/|×+&]| x | and /i).forEach(function (part) {
      var n = norm(part), id = byName[n] || byName[n.replace(/ /g, "")] || byName[n.replace(/ /g, "-")];
      if (id && ids.indexOf(id) < 0) ids.push(id);
    });
    if (!ids.length) return false;
    S.tags = ids.slice(0, MAX_TAGS); renderChips(); changed();
    say("Tags filled in from " + GOS.game.title + "'s genre. Adjust them, then size the market.");
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
            S = server; syncAssumptions(); renderChips();
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
  syncAssumptions();
  renderChips();
  if (window.GOS && GOS.mountBar) GOS.mountBar("#gameBar", { toolId: TOOL_ID });
  var tagsReady = fetch(API + "?list=tags")
    .then(function (r) { return r.ok ? r.json() : { tags: [] }; })
    .then(function (j) { TAGS = (j.tags || []).slice().sort(function (a, b) { return a.name.localeCompare(b.name); }); TAGS.forEach(function (t) { TAG_NAME[t.id] = t.name; }); renderChips(); renderList(); })
    .catch(function () { say("Couldn't load Steam's tag list. Reload to try again.", true); });
  Promise.all([tagsReady, initAccount()]).then(function () {
    if (!prefillFromGame() && S.tags.length) run();
  });
  if (window.GOS && GOS.onChange) {
    var lastGame = null;
    GOS.onChange(function (s) { var id = s.game && s.game.id; if (id !== lastGame) { lastGame = id; prefillFromGame(); } });
  }
})();
