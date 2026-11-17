/* PMF Analyzer — page logic. Scoring lives in model.js (window.PmfModel); data comes from /api/pmf. */
(function () {
  "use strict";
  var M = window.PmfModel;
  var TOOL_ID = "pmf";
  var LS_KEY = "gos_pmf_v3";
  var ACCOUNT_URL = "/api/tool-state/" + TOOL_ID;
  var API = "/api/pmf";

  /* ---------------- State ---------------- */
  function emptyState() { return { recent: [], survey: {}, last: null, savedAt: 0 }; }
  function normalise(s) {
    if (!s || typeof s !== "object") return null;
    var b = emptyState();
    if (Array.isArray(s.recent)) b.recent = s.recent.filter(function (r) { return r && r.appid; }).slice(0, 8);
    if (s.survey && typeof s.survey === "object") b.survey = s.survey;
    if (s.last) b.last = Number(s.last) || null;
    b.savedAt = Number(s.savedAt) || 0;
    return b;
  }
  var S = (function () { try { return normalise(JSON.parse(localStorage.getItem(LS_KEY) || "null")); } catch (e) { return null; } })() || emptyState();
  var D = null, P = null, R = null, peersState = "idle";
  var saveTimer = null;
  function changed() { if (saveTimer) clearTimeout(saveTimer); saveTimer = setTimeout(persist, 300); }
  function persist() {
    S.savedAt = Date.now();
    try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) {}
    scheduleAccountSave();
  }
  function track(name, props) { if (typeof window.gosTrack === "function") window.gosTrack(name, Object.assign({ tool_id: TOOL_ID }, props || {})); }

  /* ---------------- Formatting ---------------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function num(n) { return n == null || !isFinite(n) ? "—" : Math.round(n).toLocaleString("en-US"); }
  function short(n) {
    if (n == null || !isFinite(n)) return "—";
    var a = Math.abs(n);
    if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
    if (a >= 1e3) return (n / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, "") + "K";
    return String(Math.round(n));
  }
  function hours(h) { return h == null ? "—" : h < 1 ? Math.round(h * 60) + " min" : h.toFixed(h < 10 ? 1 : 0) + " h"; }
  function pct(x, d) { return x == null || !isFinite(x) ? "—" : x.toFixed(d || 0) + "%"; }
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function dateLong(ymd) { if (!ymd) return "—"; var p = ymd.split("-"); return (+p[2] || "") + " " + MONTHS[+p[1] - 1] + " " + p[0]; }
  function monthShort(ym) { var p = ym.split("-"); return MONTHS[+p[1] - 1] + " " + p[0].slice(2); }
  function scoreColor(v) { return v == null ? "var(--ink-muted)" : v >= 75 ? "var(--status-healthy)" : v >= 50 ? "var(--mustard)" : "var(--status-concern)"; }
  function today() { return new Date().toISOString().slice(0, 10); }

  /* ---------------- Search ---------------- */
  var form = document.getElementById("search-form"), input = document.getElementById("appid"), msgEl = document.getElementById("msg");
  var out = document.getElementById("out"), mineBtn = document.getElementById("btn-mine");
  function say(t, err) { msgEl.textContent = t || ""; msgEl.className = "feedback" + (err ? " err" : ""); }
  function parseAppId(v) {
    v = String(v || "").trim();
    var m = v.match(/\/app\/(\d+)/) || v.match(/^(\d{1,9})$/);
    return m ? Number(m[1]) : null;
  }
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var id = parseAppId(input.value);
    if (!id) { say("Enter a Steam App ID (the number in the store link) or paste the store link.", true); return; }
    track("journey_step", { step_name: "app_id_entered", step_index: 1, app_id: id });
    run(id);
  });
  function renderRecent() {
    var el = document.getElementById("recent");
    el.innerHTML = S.recent.length ? "Recent: " + S.recent.map(function (r) { return '<button type="button" data-app="' + r.appid + '">' + esc(r.name) + "</button>"; }).join("") : "";
  }
  document.getElementById("recent").addEventListener("click", function (e) {
    var b = e.target.closest("[data-app]"); if (b) run(+b.getAttribute("data-app"));
  });

  /* ---------------- Fetch ---------------- */
  var runId = 0;
  function run(appid) {
    var my = ++runId;
    input.value = appid;
    say("Reading Steam…");
    D = P = R = null; peersState = "idle";
    out.innerHTML = '<div class="skeleton"></div><div class="skeleton" style="height:180px"></div>';
    try { history.replaceState(null, "", "#" + appid); } catch (e) {}
    track("analysis_run", { app_id: appid });
    fetch(API + "?appid=" + appid)
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "Error " + r.status); return j; }); })
      .then(function (j) {
        if (my !== runId) return;
        D = j; say("");
        S.last = appid;
        S.recent = [{ appid: appid, name: j.name }].concat(S.recent.filter(function (r) { return r.appid !== appid; })).slice(0, 8);
        renderRecent(); changed();
        R = M.analyse(D, null);
        renderAll();
        track("journey_step", { step_name: "report_viewed", step_index: 3, app_id: appid, reviews: D.reviews.total });
        loadPeers(my);
      })
      .catch(function (err) { if (my !== runId) return; out.innerHTML = ""; say("Couldn't analyse that game: " + err.message, true); });
  }
  function loadPeers(my) {
    var tags = M.peerTags(D.tags), win = M.peerWindow(D, today());
    if (!tags.length || !win) { peersState = "none"; renderBody(); return; }
    peersState = "loading"; renderBody();
    fetch(API + "?part=peers&tags=" + tags.join(",") + "&from=" + win.from + "&to=" + win.to)
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "Error " + r.status); return j; }); })
      .then(function (j) { if (my !== runId) return; P = j; peersState = "ok"; R = M.analyse(D, P); renderBody(); })
      .catch(function () { if (my !== runId) return; peersState = "failed"; renderBody(); });
  }

  /* ---------------- Render ---------------- */
  function renderAll() {
    out.innerHTML = '<div id="res-hero"></div><div id="res-body"></div>';
    document.getElementById("res-hero").innerHTML = heroHtml();
    renderBody();
  }
  function renderBody() {
    var el = document.getElementById("res-body");
    if (!el || !D) return;
    el.innerHTML = verdictHtml() + mediaHtml() + satHtml() + engHtml() + reachHtml() + momentumHtml() + recsHtml() + surveyHtml() + sendHtml();
    drawCharts();
    wireSurvey();
  }

  function heroHtml() {
    var m = D.media, r = D.reviews;
    var revCls = r.pct == null ? "" : r.pct >= 80 ? "good" : r.pct >= 70 ? "mid" : "bad";
    var bg = m.hero || m.background || m.header;
    var tags = D.tags.filter(function (t) { return t.name; }).slice(0, 8).map(function (t) { return "<span>" + esc(t.name) + "</span>"; }).join("");
    var by = D.developers.join(", ");
    if (D.publishers.length && D.publishers.join() !== D.developers.join()) by += " · published by " + D.publishers.join(", ");
    var rel = D.firstReleased && D.firstReleased !== D.released
      ? "<span>Early access <b>" + dateLong(D.firstReleased) + "</b></span><span>Full release <b>" + dateLong(D.released) + "</b></span>"
      : "<span>Released <b>" + dateLong(D.released) + "</b></span>";
    var trailer = m.trailer && (m.trailer.mp4 || m.trailer.webm)
      ? '<div class="media-frame"><video autoplay muted loop playsinline preload="metadata"' + (m.trailer.poster ? ' poster="' + esc(m.trailer.poster) + '"' : "") + ">" +
        (m.trailer.webm ? '<source src="' + esc(m.trailer.webm) + '" type="video/webm">' : "") +
        (m.trailer.mp4 ? '<source src="' + esc(m.trailer.mp4) + '" type="video/mp4">' : "") +
        '</video><span class="cap">' + esc(m.trailer.name) + " · preview</span></div>"
      : m.capsule || m.header ? '<div class="media-frame"><img src="' + esc(m.capsule || m.header) + '" alt=""></div>' : "";
    return '<section class="hero" style="background-image:url(\'' + esc(bg) + '\')"><div class="hero-in"><div>' +
      "<h2>" + esc(D.name) + "</h2>" +
      (by ? '<div class="by">' + esc(by) + "</div>" : "") +
      (D.description ? '<p class="desc">' + esc(D.description) + "</p>" : "") +
      '<div class="facts">' + rel + "<span>Price <b>" + esc(D.priceLabel || "—") + "</b></span></div>" +
      (r.label ? '<div class="rev ' + revCls + '"><b>' + pct(r.pct) + "</b> " + esc(r.label) + " · " + num(r.total) + " reviews</div>" : "") +
      '<div class="tags">' + tags + "</div>" +
      '<a class="btn-light" href="' + esc(D.url) + '" target="_blank" rel="noopener">Open on Steam &rarr;</a>' +
      "</div><div>" + trailer + "</div></div></section>";
  }

  function gauge(name, v, sub) {
    var r = 46, c = 2 * Math.PI * r, off = v == null ? c : c * (1 - Math.max(0, Math.min(100, v)) / 100);
    return '<div class="gauge"><svg viewBox="0 0 120 120" role="img" aria-label="' + esc(name) + " " + (v == null ? "no data" : Math.round(v) + " out of 100") + '">' +
      '<circle class="g-track" cx="60" cy="60" r="' + r + '"/>' +
      '<circle class="g-val" cx="60" cy="60" r="' + r + '" stroke="' + scoreColor(v) + '" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '" transform="rotate(-90 60 60)"/>' +
      '<text class="g-num" x="60" y="69" text-anchor="middle">' + (v == null ? "—" : Math.round(v)) + "</text></svg>" +
      '<div class="g-name">' + esc(name) + '</div><div class="g-sub">' + esc(sub) + "</div></div>";
  }
  function verdictHtml() {
    var v = R.verdict;
    return '<section class="card accent verdict-card"><div><h3>Verdict</h3><div class="v-label ' + v.key + '">' + esc(v.label) + '</div><p class="verdict">' + esc(v.text) + "</p>" +
      (peersState === "loading" ? '<p class="note">Comparing with similar games…</p>' : "") + "</div>" +
      '<div class="gauges">' +
      gauge("Satisfaction", R.satisfaction.score, R.satisfaction.peerPct != null ? "beats " + Math.round(R.satisfaction.peerPct) + "% of peers" : "% positive") +
      gauge("Engagement", R.engagement.score, R.engagement.medianHours != null ? hours(R.engagement.medianHours) + " median" : "achievements") +
      gauge("Reach", R.reach.score, R.reach.method === "peers" ? "vs " + R.reach.peerN + " peers" : num(R.reach.total) + " reviews") +
      "</div></section>";
  }

  function mediaHtml() {
    var shots = D.media.screenshots || [];
    if (!shots.length) return "";
    return '<section class="card"><h3>Screenshots</h3><p class="note">What the store page shows players. Click to enlarge.</p><div class="gallery">' +
      shots.map(function (s, i) { return '<button type="button" data-shot="' + i + '" aria-label="Open screenshot ' + (i + 1) + '"><img loading="lazy" src="' + esc(s.thumb) + '" alt="Screenshot ' + (i + 1) + " of " + esc(D.name) + '"></button>'; }).join("") +
      "</div></section>";
  }

  function lensHead(title, q, score) {
    return '<div class="lens-head"><h3>' + esc(title) + '</h3><span class="score" style="color:' + scoreColor(score) + '">' + (score == null ? "—" : Math.round(score) + "/100") + "</span></div>" +
      '<p class="note">' + esc(q) + "</p>";
  }
  function fact(v, l) { return '<div class="fact"><div class="v">' + v + '</div><div class="l">' + esc(l) + "</div></div>"; }

  function satHtml() {
    var s = R.satisfaction;
    var h = lensHead("Satisfaction", "Are buyers glad they bought it?", s.score) + '<div class="facts-grid">' +
      fact(pct(s.pct), "Positive, all time") +
      fact(s.recent3 == null ? "—" : pct(s.recent3), "Positive, last 3 months" + (s.recent3n ? " (" + num(s.recent3n) + ")" : "")) +
      fact(s.recent30 == null ? "—" : pct(s.recent30), "Positive, last 30 days" + (s.recent30n ? " (" + num(s.recent30n) + ")" : "")) +
      fact(s.peerPct == null ? (peersState === "loading" ? "…" : "—") : "Top " + Math.max(1, Math.round(100 - s.peerPct)) + "%", s.peerPct == null ? "Rank among peers" : "Among " + s.peerN + " peers with 50+ reviews") +
      "</div>";
    if ((D.history || []).length) h += '<div id="ch-history"></div><div class="legend"><span><i style="background:var(--status-healthy)"></i>Positive reviews</span><span><i style="background:var(--status-concern)"></i>Negative reviews</span><span><i style="background:var(--data-3);height:3px;vertical-align:middle"></i>% positive that month</span></div>';
    return '<section class="card">' + h + "</section>";
  }

  function engHtml() {
    var e = R.engagement;
    var h = lensHead("Engagement", "Do players keep playing?", e.score) + '<div class="facts-grid">' +
      fact(hours(e.medianHours), "Median playtime") +
      fact(hours(e.avgHours), "Average playtime") +
      fact(hours(e.median2wHours), "Median, last 2 weeks (active players)") +
      fact(e.hoursPerDollar == null ? "—" : e.hoursPerDollar.toFixed(1), "Median hours per dollar") +
      "</div>";
    if (e.refundRisk) h += '<div class="notice bad">The median player has played under two hours, inside Steam&rsquo;s refund window.</div>';
    if (e.achCount) {
      h += '<h3 style="margin-top:8px;font-size:14px">Achievement drop-off</h3><p class="note">Each point is one of the ' + e.achCount + " achievements, sorted from most to least earned. A steep early fall means players stop early. " +
        Math.round(e.achFirst) + "% earned the easiest one; the median achievement is held by " + pct(e.achMedian, 1) + ".</p><div id=\"ch-ach\"></div>";
    } else h += '<p class="note">This game has no Steam achievements, so engagement uses playtime only.</p>';
    return '<section class="card">' + h + "</section>";
  }

  function reachHtml() {
    var r = R.reach;
    var h = lensHead("Reach", "Is it finding an audience?", r.score) + '<div class="facts-grid">' +
      fact(num(r.total), "Steam reviews") +
      fact(short(r.estCopies), "Copies, estimated (30 per review)") +
      fact(r.owners ? esc(r.owners.replace(/,000,000/g, "M").replace(/,000/g, "K").replace(" .. ", "–")) : "—", "Owners (SteamSpy range)") +
      fact(num(r.current), "Playing right now") +
      "</div>";
    var tagNames = M.peerTags(D.tags).map(function (id) { var t = D.tags.find(function (x) { return x.id === id; }); return t && t.name ? t.name : "tag " + id; }).join(" + ");
    var win = M.peerWindow(D, today());
    if (peersState === "loading") h += '<p class="loading">Finding peers: games tagged ' + esc(tagNames) + " released " + (win ? dateLong(win.from) + " to " + dateLong(win.to) : "") + "…</p>";
    else if (peersState === "failed") h += '<div class="notice warn">Steam didn&rsquo;t answer the peer search in time, so Reach uses a fixed scale instead. Try again in a few minutes.</div>';
    else if (peersState === "ok" && R.reach.method === "peers") {
      h += '<p class="note"><b>Peers:</b> ' + num(r.peerN) + " games tagged " + esc(tagNames) + " released " + dateLong(P.from) + " to " + dateLong(P.to) +
        ". " + (r.peerPct >= 99.5 ? "No peer has as many reviews" : "This game has more reviews than " + Math.round(r.peerPct) + "% of them") + " (peer median: " + num(r.peerMedian) + ")." +
        (P.truncated ? " Steam listed more peers than we read, so the oldest are missing." : "") + "</p><div id=\"ch-peers\"></div>" +
        '<div class="legend"><span><i style="background:var(--slate);opacity:.4;border-radius:50%"></i>Peer game</span><span><i style="background:var(--orange);border-radius:50%"></i>' + esc(D.name) + "</span></div>";
    } else if (peersState === "ok" && P && P.truncated) h += '<p class="note">Steam lists too many newer games tagged ' + esc(tagNames) + " to reach back to this game&rsquo;s release, so Reach uses a fixed scale instead.</p>";
    else if (peersState === "ok") h += '<p class="note">Too few peers (' + ((P && P.rows.length) || 0) + ") to compare, so Reach uses a fixed scale.</p>";
    return '<section class="card">' + h + "</section>";
  }

  function momentumHtml() {
    var m = R.momentum, news = (D.news || []).slice(0, 8);
    var h = '<h3>Momentum and updates</h3><div class="facts-grid">' +
      fact(num(m.last3), "Reviews, last 3 months") +
      fact(m.change == null ? "—" : (m.change >= 0 ? "+" : "−") + Math.abs(Math.round(m.change * 100)) + "%", "vs the 3 months before") +
      fact(String(m.patches90), "Update posts, last 90 days") +
      fact(String(m.patches365), "Update posts, last year") + "</div>";
    if (news.length) h += '<ul class="news">' + news.map(function (n) {
      return '<li><span class="d">' + esc(dateLong(n.date)) + '</span><span><a href="' + esc(n.url) + '" target="_blank" rel="noopener">' + esc(n.title) + "</a>" + (n.patch ? '<span class="pt">Update</span>' : "") + "</span></li>";
    }).join("") + "</ul>";
    return '<section class="card">' + h + "</section>";
  }

  function recsHtml() {
    return '<section class="card"><h3>What to do next</h3><div class="recs">' + R.recs.map(function (r) {
      return '<div class="rec ' + r.pri + '"><div><span class="p">' + esc(r.pri) + '</span><span class="t">' + esc(r.title) + "</span></div><p>" + esc(r.detail) + "</p>" +
        (r.tool ? '<a href="/game-os/' + r.tool.id + '">Open ' + esc(r.tool.name) + " &rarr;</a>" : "") + "</div>";
    }).join("") + "</div></section>";
  }

  function surveyHtml() {
    var v = S.survey[D.appid] || {};
    return '<section class="card"><h3>Your own players: the Sean Ellis test</h3><p class="note">Steam data shows behaviour. This shows feeling. Ask your players &ldquo;How would you feel if you could no longer play ' + esc(D.name) + '?&rdquo; and enter the counts. 40% or more &ldquo;very disappointed&rdquo; is a common sign of product-market fit.</p>' +
      '<div class="survey">' +
      '<label>Very disappointed<span class="inwrap"><input type="number" min="0" data-sv="very" value="' + esc(v.very == null ? "" : v.very) + '"></span></label>' +
      '<label>Somewhat disappointed<span class="inwrap"><input type="number" min="0" data-sv="somewhat" value="' + esc(v.somewhat == null ? "" : v.somewhat) + '"></span></label>' +
      '<label>Not disappointed<span class="inwrap"><input type="number" min="0" data-sv="not" value="' + esc(v.not == null ? "" : v.not) + '"></span></label>' +
      '</div><div id="sv-out" style="margin-top:12px"></div></section>';
  }
  function surveyResult() {
    var v = S.survey[D.appid] || {}, r = M.seanEllis(+v.very || 0, +v.somewhat || 0, +v.not || 0), el = document.getElementById("sv-out");
    if (!el) return;
    if (!r) { el.innerHTML = ""; return; }
    el.innerHTML = '<div class="notice ' + (r.pass ? "ok" : "warn") + '"><b>' + pct(r.share) + " very disappointed</b> out of " + r.n + " answers. " +
      (r.pass ? "That passes the 40% line." : "That is under the 40% line.") + (r.small ? " With fewer than 40 answers, treat it as a rough read." : "") + "</div>";
  }
  function wireSurvey() {
    document.querySelectorAll("[data-sv]").forEach(function (inp) {
      inp.addEventListener("input", function () {
        var k = inp.getAttribute("data-sv"), cur = S.survey[D.appid] || {};
        cur[k] = inp.value === "" ? null : Math.max(0, Math.round(+inp.value));
        S.survey[D.appid] = cur; changed(); surveyResult();
      });
    });
    surveyResult();
  }

  function sendHtml() {
    return '<section class="card no-print"><h3>Send to your game</h3><p class="note">Saves the three scores and the main figures to the game picked at the top, so they show on your dashboard. If that game has no Steam App ID yet, this one is linked to it.</p>' +
      '<div class="actions"><button type="button" class="btn" id="send">Send PMF figures</button><span class="feedback" id="send-msg" role="status"></span></div></section>';
  }

  /* ---------------- Charts ---------------- */
  function widthOf(id) { var el = document.getElementById(id); return el ? Math.max(300, Math.min(1000, el.clientWidth || 600)) : 600; }
  function drawCharts() {
    var a = document.getElementById("ch-history"); if (a) a.innerHTML = historyChart(D.history, widthOf("ch-history"));
    var b = document.getElementById("ch-ach"); if (b && D.achievements) b.innerHTML = achChart(D.achievements.percents, widthOf("ch-ach"));
    var c = document.getElementById("ch-peers"); if (c && P) c.innerHTML = peerChart(P.rows, widthOf("ch-peers"));
  }
  var rT = null;
  window.addEventListener("resize", function () { clearTimeout(rT); rT = setTimeout(function () { if (D) drawCharts(); }, 150); });

  function niceMax(v) { if (v <= 0) return 1; var p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; }

  function historyChart(rows, W) {
    rows = rows.slice(-36);
    var H = 240, pl = 44, pr = 40, pt = 14, pb = 30, iw = W - pl - pr, ih = H - pt - pb, n = rows.length, slot = iw / n, bw = Math.max(2, slot * 0.7);
    var maxV = niceMax(Math.max.apply(null, rows.map(function (r) { return r.up + r.down; }).concat([1])));
    var s = '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Reviews per month, positive and negative">';
    for (var g = 0; g <= 4; g++) {
      var y = pt + ih - (ih * g) / 4;
      s += '<line class="grid" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y + '" y2="' + y + '"/><text x="' + (pl - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + short((maxV * g) / 4) + '</text>';
      s += '<text x="' + (W - pr + 6) + '" y="' + (y + 4) + '">' + (50 + g * 12.5) + "%</text>";
    }
    var every = Math.ceil(n / Math.max(4, Math.floor(iw / 60))), pts = [];
    rows.forEach(function (r, i) {
      var x = pl + slot * i + (slot - bw) / 2, hu = (r.up / maxV) * ih, hd = (r.down / maxV) * ih, base = pt + ih;
      s += '<rect class="b-up" x="' + x.toFixed(1) + '" y="' + (base - hu).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hu.toFixed(1) + '"/>';
      s += '<rect class="b-down" x="' + x.toFixed(1) + '" y="' + (base - hu - hd).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hd.toFixed(1) + '"/>';
      var tot = r.up + r.down, p = tot ? (r.up / tot) * 100 : null;
      if (p != null && tot >= 5) pts.push((pl + slot * i + slot / 2).toFixed(1) + "," + (pt + ih - ((Math.max(50, p) - 50) / 50) * ih).toFixed(1));
      if (i % every === 0) s += '<text x="' + (pl + slot * i + slot / 2) + '" y="' + (H - 10) + '" text-anchor="middle">' + monthShort(r.m) + "</text>";
      s += '<rect class="hit" data-tip="' + esc(monthShort(r.m)) + "<br>" + num(r.up) + " positive, " + num(r.down) + " negative" + (p != null ? "<br>" + p.toFixed(1) + "% positive" : "") + '" x="' + (pl + slot * i) + '" y="' + pt + '" width="' + slot + '" height="' + ih + '"/>';
    });
    if (pts.length > 1) s += '<polyline class="l-pct" pointer-events="none" points="' + pts.join(" ") + '"/>';
    return s + '<line class="axis" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + (pt + ih) + '" y2="' + (pt + ih) + '"/></svg>';
  }

  function achChart(list, W) {
    var H = 200, pl = 40, pr = 12, pt = 10, pb = 26, iw = W - pl - pr, ih = H - pt - pb, n = list.length;
    var x = function (i) { return pl + (n === 1 ? iw / 2 : (iw * i) / (n - 1)); }, y = function (v) { return pt + ih - (v / 100) * ih; };
    var s = '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Share of players holding each achievement">';
    [0, 25, 50, 75, 100].forEach(function (g) { s += '<line class="grid" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(g) + '" y2="' + y(g) + '"/><text x="' + (pl - 6) + '" y="' + (y(g) + 4) + '" text-anchor="end">' + g + "%</text>"; });
    var line = list.map(function (v, i) { return x(i).toFixed(1) + "," + y(v).toFixed(1); }).join(" ");
    s += '<polygon class="a-ach" points="' + x(0) + "," + y(0) + " " + line + " " + x(n - 1) + "," + y(0) + '"/><polyline class="l-ach" points="' + line + '"/>';
    s += '<text x="' + pl + '" y="' + (H - 6) + '">Most earned</text><text x="' + (W - pr) + '" y="' + (H - 6) + '" text-anchor="end">Least earned (' + n + ")</text>";
    var step = Math.max(1, Math.floor(n / 60));
    for (var i = 0; i < n; i += step) s += '<rect class="hit" data-tip="Achievement ' + (i + 1) + " of " + n + "<br>" + list[i].toFixed(1) + '% of players" x="' + (x(i) - iw / n / 2 * step) + '" y="' + pt + '" width="' + Math.max(2, (iw / n) * step) + '" height="' + ih + '"/>';
    return s + "</svg>";
  }

  function peerChart(rows, W) {
    var H = 280, pl = 44, pr = 16, pt = 12, pb = 34, iw = W - pl - pr, ih = H - pt - pb;
    var pts = rows.filter(function (r) { return r[4] != null && r[4] >= 10 && r[5] != null; });
    var me = { reviews: D.reviews.total || 0, pct: D.reviews.pct };
    var maxR = Math.max.apply(null, pts.map(function (r) { return r[4]; }).concat([me.reviews, 100]));
    var lmax = Math.ceil(Math.log10(maxR));
    var x = function (v) { return pl + (Math.log10(Math.max(10, v)) - 1) / (lmax - 1) * iw; };
    var y = function (p) { return pt + ih - (Math.max(30, p) - 30) / 70 * ih; };
    var s = '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Peers by review count and percent positive">';
    [30, 50, 70, 90, 100].forEach(function (g) { s += '<line class="grid" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(g) + '" y2="' + y(g) + '"/><text x="' + (pl - 6) + '" y="' + (y(g) + 4) + '" text-anchor="end">' + g + "%</text>"; });
    for (var e = 1; e <= lmax; e++) s += '<line class="grid" x1="' + x(Math.pow(10, e)) + '" x2="' + x(Math.pow(10, e)) + '" y1="' + pt + '" y2="' + (pt + ih) + '"/><text x="' + x(Math.pow(10, e)) + '" y="' + (H - 16) + '" text-anchor="middle">' + short(Math.pow(10, e)) + "</text>";
    s += '<text x="' + (pl + iw / 2) + '" y="' + (H - 2) + '" text-anchor="middle">Reviews (log scale)</text>';
    s += '<line class="ref" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(70) + '" y2="' + y(70) + '"/>';
    pts.forEach(function (r) {
      if (r[0] === D.appid) return;
      s += '<circle class="d-peer" cx="' + x(r[4]).toFixed(1) + '" cy="' + y(r[5]).toFixed(1) + '" r="4" data-tip="' + esc(r[1]) + "<br>" + num(r[4]) + " reviews, " + r[5] + '% positive"/>';
    });
    if (me.pct != null && me.reviews >= 10) {
      var mx = x(me.reviews), my = y(me.pct);
      s += '<circle class="d-me" cx="' + mx.toFixed(1) + '" cy="' + my.toFixed(1) + '" r="8" data-tip="' + esc(D.name) + "<br>" + num(me.reviews) + " reviews, " + me.pct + '% positive"/>';
      s += '<text class="lab-me" x="' + (mx > W - 160 ? mx - 12 : mx + 12) + '" y="' + (my + 4) + '"' + (mx > W - 160 ? ' text-anchor="end"' : "") + ">" + esc(D.name.length > 24 ? D.name.slice(0, 22) + "…" : D.name) + "</text>";
    }
    return s + "</svg>";
  }

  var tip = document.getElementById("chart-tip");
  document.addEventListener("mousemove", function (e) {
    var t = e.target && e.target.getAttribute && e.target.getAttribute("data-tip");
    if (!t) { tip.style.display = "none"; return; }
    tip.innerHTML = t; tip.style.display = "block";
    var x = e.clientX + 14;
    if (x + tip.offsetWidth > window.innerWidth - 8) x = e.clientX - tip.offsetWidth - 14;
    tip.style.left = x + "px"; tip.style.top = e.clientY + 14 + "px";
  });

  /* ---------------- Lightbox ---------------- */
  var lb = document.getElementById("lightbox"), lbImg = lb.querySelector("img"), lbIdx = 0;
  function openShot(i) {
    var shots = D.media.screenshots; lbIdx = (i + shots.length) % shots.length;
    lbImg.src = shots[lbIdx].full; lbImg.alt = "Screenshot " + (lbIdx + 1) + " of " + D.name;
    lb.querySelector(".lb-count").textContent = (lbIdx + 1) + " / " + shots.length;
    if (!lb.classList.contains("open")) { lb.classList.add("open"); lb.querySelector(".lb-close").focus(); }
  }
  function closeShot() { lb.classList.remove("open"); lbImg.src = ""; }
  lb.querySelector(".lb-close").addEventListener("click", closeShot);
  lb.querySelector(".lb-prev").addEventListener("click", function () { openShot(lbIdx - 1); });
  lb.querySelector(".lb-next").addEventListener("click", function () { openShot(lbIdx + 1); });
  lb.addEventListener("click", function (e) { if (e.target === lb) closeShot(); });
  document.addEventListener("keydown", function (e) {
    if (!lb.classList.contains("open")) return;
    if (e.key === "Escape") closeShot(); else if (e.key === "ArrowLeft") openShot(lbIdx - 1); else if (e.key === "ArrowRight") openShot(lbIdx + 1);
  });

  out.addEventListener("click", function (e) {
    var shot = e.target.closest("[data-shot]");
    if (shot) { openShot(+shot.getAttribute("data-shot")); return; }
    if (e.target.id === "send") sendToGame();
  });

  /* ---------------- Send to Game OS ---------------- */
  function sendMsg(t, err) { var el = document.getElementById("send-msg"); if (el) { el.textContent = t; el.className = "feedback" + (err ? " err" : ""); } }
  function sendToGame() {
    if (!window.GOS || !GOS.ready) { sendMsg("Game OS isn't available on this page.", true); return; }
    GOS.ready.then(function () {
      if (!GOS.user) { sendMsg("Sign in to send this to a game.", true); return; }
      if (!GOS.game) { sendMsg("Pick or add a game in the bar at the top first.", true); return; }
      var meta = { appid: D.appid, name: D.name, peers: R.reach.method === "peers" ? R.reach.peerN : 0 };
      var list = [
        { key: "pmf_satisfaction", label: "PMF satisfaction (" + D.name + ")", value: R.satisfaction.score, unit: "score", meta: meta },
        { key: "pmf_engagement", label: "PMF engagement", value: R.engagement.score, unit: "score" },
        { key: "pmf_reach", label: "PMF reach", value: R.reach.score, unit: "score" },
        { key: "pmf_review_pct", label: "Steam reviews positive", value: D.reviews.pct, unit: "pct" },
        { key: "pmf_reviews", label: "Steam reviews", value: D.reviews.total, unit: "units" },
        { key: "pmf_median_hours", label: "Median playtime (hours)", value: R.engagement.medianHours, unit: "hours" },
      ];
      var sv = S.survey[D.appid] && M.seanEllis(+S.survey[D.appid].very || 0, +S.survey[D.appid].somewhat || 0, +S.survey[D.appid].not || 0);
      if (sv) list.push({ key: "pmf_sean_ellis", label: "Sean Ellis: very disappointed", value: sv.share, unit: "pct", meta: { answers: sv.n } });
      list = list.filter(function (s) { return s.value != null && isFinite(s.value); });
      sendMsg("Sending to " + GOS.game.title + "…");
      var link = !GOS.game.steamAppId && GOS.updateGame ? GOS.updateGame({ steamAppId: String(D.appid) }) : Promise.resolve();
      link.then(function () { return GOS.recordSignals(TOOL_ID, list); })
        .then(function () {
          sendMsg("Sent " + list.length + " figures to " + GOS.game.title + ".");
          track("journey_step", { step_name: "report_actioned", step_index: 4, action: "send_signals" });
        })
        .catch(function (err) { sendMsg("Could not send: " + err.message, true); });
    }, function () { sendMsg("Couldn't reach Game OS.", true); });
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
      .then(function (r) { if (!r.ok) throw new Error(r.status); status("Saved to your account", "ok"); })
      .catch(function () { status("Couldn't save to your account; your work is still in this browser", "error"); });
  }
  function initAccount() {
    if (!window.GOS || !GOS.ready) return Promise.resolve();
    return GOS.ready.then(function () {
      accountUser = !!GOS.user;
      if (!accountUser) { status("Not signed in: saved in this browser only", "error"); return; }
      return fetch(ACCOUNT_URL, { credentials: "same-origin" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          var server = j && j.state ? normalise(j.state) : null;
          if (server && (server.savedAt || 0) > (S.savedAt || 0) + 1000) {
            S = server; renderRecent();
            try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) {}
          }
          accountReady = true;
          if (server) status("Saved to your account", "ok");
        });
    }).catch(function () {});
  }
  window.addEventListener("pagehide", function () { if (accountReady && accountTimer) { clearTimeout(accountTimer); saveToAccount(true); } });

  function syncMine() {
    var id = window.GOS && GOS.game && parseAppId(GOS.game.steamAppId);
    mineBtn.hidden = !id;
    if (id) mineBtn.textContent = "Use " + GOS.game.title;
    return id;
  }
  mineBtn.addEventListener("click", function () { var id = syncMine(); if (id) run(id); });

  /* ---------------- Boot ---------------- */
  document.getElementById("btn-print").addEventListener("click", function () { window.print(); });
  renderRecent();
  if (window.GOS && GOS.mountBar) GOS.mountBar("#gameBar", { toolId: TOOL_ID });
  if (window.GOS && GOS.onChange) GOS.onChange(syncMine);
  var hashId = parseAppId(location.hash.replace("#", ""));
  window.addEventListener("hashchange", function () {
    var id = parseAppId(location.hash.replace("#", ""));
    if (id && (!D || D.appid !== id)) run(id);
  });
  initAccount().then(function () {
    var mine = syncMine();
    var start = hashId || S.last || mine;
    if (start) run(start);
  });
})();
