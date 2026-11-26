/* Sentiment Radar — page logic. The maths lives in model.js (window.SentimentModel); data comes from
 * the game's signal ledger (daily Steam snapshot) and /api/sentiment-radar (public Steam reviews). */
(function () {
  "use strict";
  var M = window.SentimentModel;
  var TOOL_ID = "sentiment-radar";
  var LS_KEY = "gos_sentiment_radar_v1";
  var ACCOUNT_URL = "/api/tool-state/" + TOOL_ID;
  var API = "/api/sentiment-radar";
  var SEARCH = "/api/audience-map?part=search&q=";
  var MAX_COMPS = 5;          // comps read in one go; each is a separate set of Steam calls
  var MAX_COMP_REVIEWS = 200; // reviews read per comp

  /* ---------------- State (only settings; review text is never saved) ---------------- */
  function emptyState() { return { gameId: null, comps: [], off: {}, lastRead: 0, savedAt: 0 }; }
  function normalise(s) {
    if (!s || typeof s !== "object") return null;
    var b = emptyState();
    if (Array.isArray(s.comps)) b.comps = s.comps.filter(function (c) { return c && Number(c.appid) > 0; })
      .map(function (c) { return { appid: Number(c.appid), name: String(c.name || "App " + c.appid).slice(0, 80) }; }).slice(0, 12);
    if (s.off && typeof s.off === "object") b.off = s.off;
    b.gameId = s.gameId ? String(s.gameId) : null;
    b.lastRead = Number(s.lastRead) || 0;
    b.savedAt = Number(s.savedAt) || 0;
    return b;
  }
  var S = (function () { try { return normalise(JSON.parse(localStorage.getItem(LS_KEY) || "null")); } catch (e) { return null; } })() || emptyState();
  var saveTimer = null;
  function changed() { if (saveTimer) clearTimeout(saveTimer); saveTimer = setTimeout(persist, 300); }
  function persist() {
    S.savedAt = Date.now();
    try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) {}
    scheduleAccountSave();
  }

  /* ---------------- Formatting ---------------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function pc(p, d) { return p == null || !isFinite(p) ? "—" : (p * 100).toFixed(d || 0) + "%"; }
  function rng(w) { return w && w.lo != null ? pc(w.lo) + "–" + pc(w.hi) : ""; }
  function num(n) { return n == null ? "—" : Math.round(n).toLocaleString("en-US"); }
  function hrs(h) { return h == null ? "—" : h < 10 ? h.toFixed(1) + " h" : Math.round(h) + " h"; }
  function rate(x) { return x == null ? "—" : x < 10 ? x.toFixed(1) : Math.round(x).toString(); }
  function dateLabel(ymd) {
    var p = String(ymd).split("-");
    return +p[2] + " " + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+p[1] - 1];
  }
  function track(name, props) { if (typeof window.gosTrack === "function") window.gosTrack(name, Object.assign({ tool_id: TOOL_ID }, props || {})); }
  function step(name, index, extra) { track("journey_step", Object.assign({ step_name: name, step_index: index }, extra || {})); }

  var out = document.getElementById("out");
  var modeEl = document.getElementById("mode");
  var R = null;           // last result
  var loading = false;
  var runId = 0;
  var findingSeen = false;

  function getJ(url) {
    return fetch(url, { credentials: "same-origin" }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || "HTTP " + r.status); return j; });
    });
  }
  function why(reason) {
    return reason === "rate-limited" ? "Steam is limiting requests right now. Try again in a few minutes."
      : reason === "redirected" ? "Steam turned the request away (it redirected it). We don't work around that; try again later."
        : "Steam didn't answer (" + esc(reason || "unknown") + "). Try again later.";
  }

  /** SteamSpy's daily counts, shown only when Steam refused the reviews. Labelled, and never sent to the game. */
  function spyBlock(spy, heading) {
    var x = M.steamspy(spy);
    if (!x) return "";
    return (heading ? "<h4>" + heading + "</h4>" : "") +
      '<p class="note">From SteamSpy instead (a third-party site; counts refreshed daily): <b>' + pc(x.share.p) + " positive</b> (" + rng(x.share) + ", n = " + num(x.n) + " reviews, all time)" +
      (x.medianHours != null ? "; median playtime across all owners " + hrs(x.medianHours) + " (that&rsquo;s everyone who played, not reviewers, so it isn&rsquo;t playtime at review)" : "") +
      '. <a href="' + esc(x.source) + '" target="_blank" rel="noopener">About SteamSpy</a>. Nothing from SteamSpy is sent to your game.</p>';
  }

  /* ---------------- Run ---------------- */
  function run() {
    if (loading) return;
    var g = window.GOS && GOS.game, ledger = (window.GOS && GOS.ledger) || [];
    var compSet = window.GOS && GOS.thesis && GOS.thesis.compSet;
    var md = M.mode(g, ledger, compSet);
    findingSeen = false;
    step("mode_selected", 1, { mode: md.mode, reason: md.reason || null });
    if (md.mode === "game") return runGame(md, g, ledger);
    return runComps(md);
  }

  function runGame(md, g, ledger) {
    loading = true; var id = ++runId;
    modeEl.innerHTML = '<div class="notice ok"><b>Your game.</b> Reading ' + esc(g.title) + "&rsquo;s public Steam reviews (App " + md.appid + ", " + num(md.reviews) + " reviews all-time).</div>";
    out.innerHTML = '<div class="loading">Reading Steam reviews&hellip;</div>';
    getJ(API + "?appid=" + md.appid).then(function (d) {
      if (id !== runId) return;
      loading = false;
      if (d.unavailable) { out.innerHTML = '<div class="notice warn">' + why(d.reason) + "</div>" + (d.steamspy ? '<section class="card">' + spyBlock(d.steamspy, "While Steam isn&rsquo;t answering") + "</section>" : ""); return; }
      var reviews = d.reviews || [], hist = d.histogram;
      var created = reviews.map(function (r) { return r.created; }).filter(Boolean).sort();
      var readWindow = created.length ? new Date(created[0] * 1000).toISOString().slice(0, 10) + "/" + new Date(created[created.length - 1] * 1000).toISOString().slice(0, 10) : null;
      R = {
        mode: "game", game: g, data: d, readWindow: readWindow,
        decay: M.decay(ledger, d.news, hist && hist.recent),
        velocity: M.velocity(hist, Date.now()),
        playtime: M.playtime(reviews),
        vocab: M.vocabulary(reviews, { name: g.title }),
      };
      S.lastRead = Date.now(); changed();
      step("reviews_loaded", 2, { read: d.read, total: d.total, mode: "game" });
      renderGame();
    }).catch(function (e) {
      if (id !== runId) return;
      loading = false;
      out.innerHTML = '<div class="notice bad">Couldn\'t read Steam reviews: ' + esc(e.message) + "</div>";
    });
  }

  /** Comps from the thesis (names only, mostly), resolved to App IDs with Steam's store search. */
  function resolveThesisComps(md) {
    if (S.comps.length || !md.comps.length) return Promise.resolve();
    var norm = function (s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, ""); };
    return Promise.all(md.comps.slice(0, MAX_COMPS * 2).map(function (c) {
      if (c.appid) return Promise.resolve({ appid: c.appid, name: c.name });
      return getJ(SEARCH + encodeURIComponent(c.name)).then(function (j) {
        var hit = (j.items || []).find(function (i) { return norm(i.name) === norm(c.name); });
        return hit ? { appid: hit.appid, name: hit.name } : null;
      }).catch(function () { return null; });
    })).then(function (list) {
      var seen = {};
      S.comps = list.filter(function (c) { if (!c || seen[c.appid]) return false; seen[c.appid] = 1; return true; });
      if (S.comps.length) changed();
    });
  }

  function activeComps() { return S.comps.filter(function (c) { return !S.off[c.appid]; }).slice(0, MAX_COMPS); }

  function runComps(md) {
    loading = true; var id = ++runId;
    // Comps belong to the game they were picked for.
    var gid = window.GOS && GOS.game ? GOS.game.id : null;
    if (S.gameId !== gid) { S.gameId = gid; S.comps = []; S.off = {}; changed(); }
    var why2 = { "no-game": "Pick or add a game above to read its own reviews.", "no-app-id": "Your game has no Steam App ID yet.",
      "no-snapshot": "There's no Steam snapshot for your game yet.", "too-few-reviews": "Your game has fewer than " + M.MIN_GAME_REVIEWS + " Steam reviews so far." }[md.reason] || "";
    modeEl.innerHTML = '<div class="notice warn"><b>Your comps.</b> ' + esc(why2) + " Until then this reads your comps&rsquo; reviews. Nothing from comps is sent to your game: those numbers describe other games." +
      (md.reason === "no-snapshot" ? ' <button class="link-btn" id="btn-snap" type="button">Record Steam figures now</button>' : "") + "</div>";
    var snap = document.getElementById("btn-snap");
    if (snap) snap.addEventListener("click", recordSnapshot);
    out.innerHTML = '<div class="loading">Finding your comps&hellip;</div>';
    resolveThesisComps(md).then(function () {
      if (id !== runId) return;
      var list = activeComps();
      if (!list.length) { loading = false; R = null; renderComps(null); return; }
      out.innerHTML = '<div class="loading">Reading reviews for ' + list.length + " comp" + (list.length > 1 ? "s" : "") + "&hellip;</div>";
      // One comp at a time, to stay well inside Steam's anonymous rate limit.
      var results = [];
      return list.reduce(function (p, c) {
        return p.then(function () {
          return getJ(API + "?appid=" + c.appid + "&max=" + MAX_COMP_REVIEWS)
            .then(function (d) { results.push({ comp: c, data: d }); })
            .catch(function (e) { results.push({ comp: c, data: { unavailable: true, reason: e.message } }); });
        });
      }, Promise.resolve()).then(function () {
        if (id !== runId) return;
        loading = false;
        var all = [], names = [];
        results.forEach(function (x) {
          names.push(x.comp.name);
          if (x.data.unavailable) return;
          x.playtime = M.playtime(x.data.reviews || []);
          (x.data.reviews || []).forEach(function (r) { all.push(Object.assign({ comp: x.comp.name }, r)); });
        });
        R = { mode: "comps", comps: results, vocab: M.vocabulary(all, { name: names.join(" ") }), read: all.length };
        S.lastRead = Date.now(); changed();
        step("reviews_loaded", 2, { read: all.length, mode: "comps", comps: results.length });
        renderComps(R);
      });
    });
  }

  function recordSnapshot() {
    if (!window.GOS || !GOS.game) return;
    modeEl.querySelector(".notice").insertAdjacentHTML("beforeend", ' <span class="save-status" id="snap-msg">Recording&hellip;</span>');
    fetch("/api/games/" + encodeURIComponent(GOS.game.id) + "/steam-snapshot", { method: "POST", credentials: "same-origin" })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || r.status); return j; }); })
      .then(function () { return GOS.refresh(); })
      .then(function () { run(); })
      .catch(function (e) { var m = document.getElementById("snap-msg"); if (m) { m.className = "save-status error"; m.textContent = "Couldn't record: " + e.message; } });
  }

  /* ---------------- Render: your game ---------------- */
  function answer() {
    var d = R.decay, v = R.velocity, p = R.playtime, lines = [], next = "";
    if (d.status === "alarm") {
      lines.push("<b>Recent reviews are running below your all-time rating</b> (" + d.recentPct + "% vs " + d.allTime + "%, last 30 days, n = " + num(d.n) + "). That gap is bigger than chance." +
        (d.startsAfter ? " It starts after your " + dateLabel(d.startsAfter.date) + " update." : d.updates.length ? " You posted an update on " + dateLabel(d.updates[d.updates.length - 1].date) + " in this window; the chart below shows whether the drop follows it." : ""));
      next = "Next: read the negative phrases below, then fix or answer the top complaint in your next update notes.";
    } else if (d.status === "above") {
      lines.push("<b>Recent reviews are running above your all-time rating</b> (" + d.recentPct + "% vs " + d.allTime + "%, last 30 days, n = " + num(d.n) + "). Whatever changed is landing with players.");
      next = "Next: find what recent players praise below and say more of it on your store page.";
    } else if (d.status === "steady") {
      lines.push("<b>No sign of slipping.</b> Recent reviews are in line with your all-time rating (" + d.recentPct + "% vs " + d.allTime + "%, last 30 days, n = " + num(d.n) + ").");
      next = "Next: use the positive phrases below in your store copy; players' own words sell best.";
    } else if (d.status === "too-few") {
      lines.push("<b>Too few recent reviews to read a trend yet</b> (n = " + num(d.n) + " in 30 days; the alarm needs " + M.MIN_RECENT_N + ").");
      next = "Next: the playtime and phrase sections below still show what reviewers say.";
    } else {
      lines.push("<b>No daily Steam snapshot for this game yet,</b> so the decay alarm can't run. The snapshot runs once a day.");
    }
    var top = R.vocab.neg.enough && R.vocab.neg.phrases[0];
    if (top) lines.push("The most common phrase in negative reviews is &ldquo;" + esc(top.phrase) + "&rdquo; (" + top.count + " of " + R.vocab.neg.n + " reviews read).");
    if (p.early.enough && p.early.p != null) lines.push(pc(p.early.p) + " of negative reviews were written with under 2 hours played (" + rng(p.early) + ", n = " + p.early.n + ").");
    if (v.status === "ok" && v.change && v.change !== "flat") lines.push("Reviews are coming in " + (v.change === "up" ? "faster" : "slower") + " than the four weeks before (" + rate(v.last.rate) + " vs " + rate(v.prior.rate) + " a day).");
    return '<section class="card answer"><h3>The answer</h3>' + lines.map(function (l) { return '<p class="verdict">' + l + "</p>"; }).join("") +
      (next ? '<p class="next">' + next + "</p>" : "") + "</section>";
  }

  function chart(recent, updates) {
    if (!recent || !recent.length) return "";
    var days = recent.map(function (x) { return { t: (x.date < 1e11 ? x.date * 1000 : x.date), up: x.recommendations_up || 0, down: x.recommendations_down || 0 }; })
      .sort(function (a, b) { return a.t - b.t; });
    var W = 640, H = 170, L = 30, B = 22, T = 14, n = days.length, bw = (W - L - 6) / n;
    var max = Math.max.apply(null, days.map(function (d) { return d.up + d.down; }).concat([1]));
    var y = function (v) { return T + (H - T - B) * (1 - v / max); };
    var s = '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Daily positive and negative reviews, last ' + n + ' days">';
    s += '<line class="axis" x1="' + L + '" x2="' + W + '" y1="' + y(0) + '" y2="' + y(0) + '"/>';
    s += '<text x="' + (L - 4) + '" y="' + (y(max) + 4) + '" text-anchor="end">' + max + "</text>";
    s += '<text x="' + (L - 4) + '" y="' + (y(0) + 4) + '" text-anchor="end">0</text>';
    days.forEach(function (d, i) {
      var x = L + i * bw + 1, w = Math.max(1, bw - 2);
      var tip = new Date(d.t).toISOString().slice(0, 10) + ": " + d.up + " positive, " + d.down + " negative";
      s += '<g class="tipped" data-tip="' + esc(tip) + '">';
      s += '<rect class="up" x="' + x + '" y="' + y(d.up) + '" width="' + w + '" height="' + (y(0) - y(d.up)) + '"/>';
      s += '<rect class="down" x="' + x + '" y="' + y(d.up + d.down) + '" width="' + w + '" height="' + (y(d.up) - y(d.up + d.down)) + '"/>';
      s += '<rect class="hit" x="' + (L + i * bw) + '" y="' + T + '" width="' + bw + '" height="' + (H - T - B) + '"/></g>';
    });
    var t0 = days[0].t, t1 = days[n - 1].t + 86400000;
    (updates || []).forEach(function (u, i) {
      if (u.t < t0 || u.t > t1) return;
      var x = L + ((Math.floor(u.t / 86400000) * 86400000 - t0) / 86400000) * bw;
      s += '<g class="tipped" data-tip="' + esc(u.date + ": " + u.title) + '"><line class="mark" x1="' + x + '" x2="' + x + '" y1="' + T + '" y2="' + y(0) + '"/>' +
        '<text class="mark-l" x="' + (x + 3) + '" y="' + (T + 8) + '">' + (i + 1) + "</text><rect class=\"hit\" x=\"" + (x - 5) + '" y="' + T + '" width="10" height="' + (H - T - B) + '"/></g>';
    });
    s += '<text x="' + L + '" y="' + (H - 6) + '">' + dateLabel(new Date(t0).toISOString().slice(0, 10)) + "</text>";
    s += '<text x="' + W + '" y="' + (H - 6) + '" text-anchor="end">' + dateLabel(new Date(days[n - 1].t).toISOString().slice(0, 10)) + "</text></svg>";
    return s + '<div class="legend"><span><i class="up"></i>Positive</span><span><i class="down"></i>Negative</span>' + ((updates || []).length ? '<span><i class="mark"></i>Your update or announcement</span>' : "") + "</div>";
  }

  function decayCard() {
    var d = R.decay, h = R.data.histogram;
    var s = '<section class="card"><h3>Is sentiment slipping?</h3>';
    if (d.status === "no-data") s += '<p class="note">No daily Steam snapshot yet. It runs once a day for games with a Steam App ID.</p>';
    else if (d.status === "too-few") s += '<p class="note">Too few to read yet (n = ' + num(d.n) + " reviews in 30 days; needs " + M.MIN_RECENT_N + "). Below that the range is too wide to call a drop.</p>";
    else {
      var cls = d.status === "alarm" ? "bad" : d.status === "above" ? "ok" : "ok";
      s += '<div class="big"><div class="kpi"><div class="v">' + d.recentPct + "%</div><div class=\"l\">Positive, last 30 days</div><div class=\"s\">" + rng(d.recent) + ", n = " + num(d.n) + "</div></div>" +
        '<div class="kpi"><div class="v">' + d.allTime + '%</div><div class="l">Positive, all time</div><div class="s">Steam&rsquo;s summary</div></div>' +
        '<div class="kpi"><div class="v">' + (d.divergence > 0 ? "+" : "") + d.divergence + '<small>pts</small></div><div class="l">Gap</div><div class="s"><span class="badge ' + (cls === "bad" ? "bad" : "good") + '">' + (d.status === "alarm" ? "Bigger than chance" : d.status === "above" ? "Above, beyond chance" : "Within chance") + "</span></div></div></div>";
      if (d.split && d.startsAfter) s += '<p class="note">Before ' + dateLabel(d.startsAfter.date) + ": " + pc(d.split.before.p) + " positive (" + rng(d.split.before) + ", n = " + d.split.before.n + "). After: " + pc(d.split.after.p) + " (" + rng(d.split.after) + ", n = " + d.split.after.n + "). The ranges don&rsquo;t overlap.</p>";
    }
    if (h && h.recent && h.recent.length) s += chart(h.recent, d.updates || []);
    if (d.updates && d.updates.length) s += '<ol class="plain">' + d.updates.slice().reverse().map(function (u) { return "<li>" + dateLabel(u.date) + ": " + (u.url ? '<a href="' + esc(u.url) + '" target="_blank" rel="noopener">' + esc(u.title) + "</a>" : esc(u.title)) + "</li>"; }).join("") + "</ol>";
    s += '<p class="method">Method: 95% Wilson interval on the 30-day positive share; the alarm fires when the all-time share sits above its upper end (no fixed points threshold). Source: Steam, from the daily snapshot in your game&rsquo;s ledger' + (d.observedAt ? " (" + d.observedAt + ")" : "") + "; daily bars from Steam&rsquo;s review histogram; update dates from your Steam news feed. A drop is said to start after an update only when the before and after ranges don&rsquo;t overlap (at least " + M.MIN_SPLIT_N + " reviews each side).</p>";
    return s + "</section>";
  }

  function velocityCard() {
    var v = R.velocity;
    var s = '<section class="card"><h3>Are reviews still coming in?</h3>';
    if (v.status === "no-data") s += '<p class="note">Steam&rsquo;s review histogram had no daily figures for this game.</p>';
    else {
      s += '<div class="big"><div class="kpi"><div class="v">' + rate(v.last.rate) + '<small>/day</small></div><div class="l">Last ' + v.last.days + ' days</div><div class="s">' + rate(v.last.lo) + "–" + rate(v.last.hi) + ", " + num(v.last.count) + " reviews</div></div>";
      if (v.prior) s += '<div class="kpi"><div class="v">' + rate(v.prior.rate) + '<small>/day</small></div><div class="l">The ' + v.prior.days + ' days before</div><div class="s">' + rate(v.prior.lo) + "–" + rate(v.prior.hi) + ", " + num(v.prior.count) + " reviews</div></div>";
      s += '<div class="kpi"><div class="v">' + (v.status !== "ok" ? "—" : !v.change ? "—" : v.change === "flat" ? "No clear change" : v.change === "up" ? "Up" : "Down") + '</div><div class="l">Change</div><div class="s">' + (v.status !== "ok" ? "Too few to read yet (n = " + (v.last.count + (v.prior ? v.prior.count : 0)) + "; needs " + M.MIN_WINDOW_COUNT + ")" : !v.prior ? (v.priorReason === "monthly" ? "Steam only gives monthly totals before this window for this game" : "Not enough history yet") : "Up or down only when the ranges don&rsquo;t overlap") + "</div></div></div>";
      s += '<p class="note">Review velocity is a Reach signal: it shows whether new players keep arriving, not whether they like the game.</p>';
      s += '<p class="method">Method: reviews per day with exact 95% Poisson ranges. Last window: ' + v.last.from + " to " + v.last.to + " (Steam&rsquo;s daily histogram, complete days only)." +
        (v.prior ? " Earlier window: " + v.prior.from + " to " + v.prior.to + ", built from Steam&rsquo;s weekly totals" + (v.prior.gapDays > 0 ? "; it ends " + v.prior.gapDays + " day" + (v.prior.gapDays > 1 ? "s" : "") + " before the last window starts, because weeks don&rsquo;t line up with it" : "") + "." : "") +
        " The histogram is read with the same settings as the daily snapshot (English).</p>";
    }
    return s + "</section>";
  }

  function playtimeBlock(p, ownGame) {
    var s = '<div class="big"><div class="kpi"><div class="v">' + (p.pos.enough ? hrs(p.pos.median) : "—") + '</div><div class="l">Median, positive reviews</div><div class="s">' + (p.pos.enough ? "n = " + p.pos.n : "Too few to read yet (n = " + p.pos.n + ")") + "</div></div>" +
      '<div class="kpi"><div class="v">' + (p.neg.enough ? hrs(p.neg.median) : "—") + '</div><div class="l">Median, negative reviews</div><div class="s">' + (p.neg.enough ? "n = " + p.neg.n : "Too few to read yet (n = " + p.neg.n + ")") + "</div></div>" +
      '<div class="kpi"><div class="v">' + (p.early.enough ? pc(p.early.p) : "—") + '</div><div class="l">Negative, under 2 hours played</div><div class="s">' + (p.early.enough ? rng(p.early) + ", n = " + p.early.n : "Too few to read yet (n = " + p.early.n + "; needs " + M.MIN_NEG_N + ")") + "</div></div></div>";
    if (ownGame) s += '<p class="note">A high share of early negative reviews means people are leaving in the first two hours. That usually points to the promise or the opening, not the endgame.</p>';
    return s;
  }

  function playtimeCard() {
    return '<section class="card"><h3>How long had they played?</h3>' + playtimeBlock(R.playtime, true) +
      '<p class="method">Method: median playtime when the review was written (Steam&rsquo;s <code>playtime_at_review</code>, minutes shown as hours); the early share has a 95% Wilson range. Two hours is Steam&rsquo;s refund window: refunds within 14 days of purchase and under 2 hours played (<a href="' + M.SOURCE + '" target="_blank" rel="noopener">Steam refunds</a>, checked ' + M.CHECKED + "). An early review isn&rsquo;t necessarily a refund. Read from the " + num(R.data.read) + " most recent reviews" + (R.data.total ? " of " + num(R.data.total) : "") + ", all languages" + (R.readWindow ? " (" + R.readWindow.replace("/", " to ") + ")" : "") + ".</p></section>";
  }

  function phraseList(side, cls, title) {
    var s = '<div class="' + cls + '"><h4>' + title + " <span class=\"range\">(" + side.n + " reviews)</span></h4>";
    if (!side.enough) return s + '<p class="note">Too few to read yet (n = ' + side.n + "; needs " + M.MIN_VOCAB_REVIEWS + ").</p></div>";
    if (!side.phrases.length) return s + '<p class="note">No phrase came up in ' + M.MIN_PHRASE_REVIEWS + " or more reviews.</p></div>";
    s += '<ul class="phr">' + side.phrases.map(function (p) {
      var quotes = p.snippets.map(function (q) {
        return "<blockquote>" + esc(q.before) + "<mark>" + esc(q.match) + "</mark>" + esc(q.after) + (q.url ? ' <a href="' + esc(q.url) + '" target="_blank" rel="noopener">Read review</a>' : "") + (q.comp ? " <span class=\"range\">" + esc(q.comp) + "</span>" : "") + "</blockquote>";
      }).join("");
      return '<li><details><summary><span class="p">' + esc(p.phrase) + '</span><span class="c">' + p.count + " reviews &middot; " + pc(p.share.p) + ' <span class="range">(' + rng(p.share) + ")</span></span></summary>" + quotes + "</details></li>";
    }).join("") + "</ul>";
    return s + "</div>";
  }

  function vocabCard(intro) {
    var v = R.vocab;
    return '<section class="card"><h3>The words players use</h3><p class="note">' + intro + "</p>" +
      '<div class="vocab">' + phraseList(v.pos, "pos", "Positive reviews") + phraseList(v.neg, "neg", "Negative reviews") + "</div>" +
      '<div class="actions"><button class="btn-ghost" id="btn-copy" type="button">Copy phrases</button><span class="feedback" id="copy-msg" role="status"></span></div>' +
      '<p class="method">Method: phrases of one to three words, counted once per review, separately for positive and negative reviews. Common words, your game&rsquo;s name and phrases in fewer than ' + M.MIN_PHRASE_REVIEWS + " reviews are left out; a shorter phrase is folded into a longer one that covers most of its reviews. Share ranges are 95% Wilson. Tap a phrase to see where it came from.</p></section>";
  }

  function sendCard() {
    var list = M.signals(R);
    var all = ["sentiment_divergence", "review_velocity_28d", "playtime_at_review_median", "neg_review_early_share"];
    var have = list.map(function (x) { return x.key; });
    var skipped = all.filter(function (k) { return have.indexOf(k) < 0; });
    return '<section class="card"><h3>Send to ' + esc(R.game.title) + "</h3>" +
      '<p class="note">Records ' + list.length + " figure" + (list.length === 1 ? "" : "s") + " in your game&rsquo;s signal ledger, each with its range, sample size and source." +
      (skipped.length ? " Not sent, because there&rsquo;s too little data: " + skipped.map(esc).join(", ") + "." : "") + "</p>" +
      '<div class="actions"><button class="btn" id="btn-send" type="button"' + (list.length ? "" : " disabled") + ">Send to game</button><span class=\"feedback\" id=\"send-msg\" role=\"status\"></span></div></section>";
  }

  function renderGame() {
    var d = R.data;
    var s = answer();
    if (d.partial) s += '<div class="notice warn">' + (d.read ? "Steam stopped answering part-way, so " + num(d.read) + " reviews were read instead of up to " + num(d.cap) + ". " : "Steam didn&rsquo;t return any review text, so playtime and phrases can&rsquo;t be read. ") + why(d.partial) + "</div>";
    if (d.steamspy) s += '<section class="card">' + spyBlock(d.steamspy, "While Steam isn&rsquo;t answering") + "</section>";
    s += decayCard() + velocityCard() + playtimeCard() +
      vocabCard("Players&rsquo; own words make the best store copy. Use the positive phrases in your description and capsules; treat the negative ones as the list to fix or to answer in update notes.") +
      sendCard();
    out.innerHTML = s;
    wireResults();
    about();
  }

  /* ---------------- Render: your comps ---------------- */
  function compsPicker() {
    var s = '<section class="card accent"><h3>Your comps</h3>';
    s += S.comps.length ? '<div class="comps-list">' + S.comps.map(function (c) {
      return '<span class="chip' + (S.off[c.appid] ? " off" : "") + '"><button type="button" class="nm" data-toggle="' + c.appid + '" title="Tap to switch this comp on or off">' + esc(c.name) + '</button><button type="button" data-rm="' + c.appid + '" aria-label="Remove ' + esc(c.name) + '">&times;</button></span>';
    }).join("") + "</div>" : '<p class="note">No comps yet. Add games from your thesis in Thesis Builder, or search for them here.</p>';
    if (activeComps().length < S.comps.filter(function (c) { return !S.off[c.appid]; }).length) s += '<p class="note">Reading the first ' + MAX_COMPS + " ticked comps. Tap a name to switch it off.</p>";
    s += '<div class="search-row"><div class="inwrap"><input id="comp-q" type="text" autocomplete="off" placeholder="Add a comp: search Steam" aria-label="Search Steam for a comp"></div><button class="btn-small" id="btn-search" type="button">Search</button></div><ul class="results" id="comp-res"></ul>';
    s += '<div class="actions"><button class="btn" id="btn-read" type="button">Read these comps</button></div>';
    return s + "</section>";
  }

  function renderComps(res) {
    var s = compsPicker();
    if (res) {
      var v = res.vocab;
      var lines = [];
      if (v.pos.enough && v.pos.phrases[0]) lines.push("Players of these games praise &ldquo;" + v.pos.phrases.slice(0, 3).map(function (p) { return esc(p.phrase); }).join("&rdquo;, &ldquo;") + "&rdquo;.");
      if (v.neg.enough && v.neg.phrases[0]) lines.push("They complain about &ldquo;" + v.neg.phrases.slice(0, 3).map(function (p) { return esc(p.phrase); }).join("&rdquo;, &ldquo;") + "&rdquo;.");
      if (!lines.length) lines.push("Too few reviews across these comps to read their players yet (" + res.read + " read).");
      s += '<section class="card answer"><h3>What the genre&rsquo;s players feel</h3>' + lines.map(function (l) { return '<p class="verdict">' + l + "</p>"; }).join("") +
        '<p class="next">Next: promise what they praise, and say plainly how your game avoids what they complain about. Unusual games often beat their comps, so treat this as positioning input, not a ceiling.</p></section>';
      s += '<section class="card"><h3>How long had comp players played?</h3>' + res.comps.map(function (x) {
        if (x.data.unavailable) return "<h4>" + esc(x.comp.name) + '</h4><p class="note">' + why(x.data.reason) + "</p>" + spyBlock(x.data.steamspy);
        return "<h4>" + esc(x.comp.name) + ' <span class="range">(' + num(x.data.read) + " recent reviews read" + (x.data.total ? " of " + num(x.data.total) : "") + ")</span></h4>" + playtimeBlock(x.playtime, false) + (x.data.steamspy ? spyBlock(x.data.steamspy) : "");
      }).join("") + '<p class="method">Method: as for your own game; medians of Steam&rsquo;s <code>playtime_at_review</code>, Wilson ranges on the early share (under 2 hours; <a href="' + M.SOURCE + '" target="_blank" rel="noopener">Steam refunds</a>, checked ' + M.CHECKED + "). Up to " + MAX_COMP_REVIEWS + " most recent reviews per comp, all languages.</p></section>";
      s += vocabCard("Phrases across all your comps&rsquo; recent reviews, pooled. Comp names are left out.");
    }
    out.innerHTML = s;
    wireComps();
    if (res) wireResults();
    about();
  }

  function wireComps() {
    var q = document.getElementById("comp-q"), resEl = document.getElementById("comp-res");
    function search() {
      var term = q.value.trim(); if (!term) return;
      resEl.innerHTML = "<li>Searching&hellip;</li>";
      getJ(SEARCH + encodeURIComponent(term)).then(function (j) {
        var items = (j.items || []).slice(0, 6);
        resEl.innerHTML = items.length ? items.map(function (i) {
          return "<li><span>" + esc(i.name) + ' <span class="range">App ' + i.appid + '</span></span><button class="btn-small" type="button" data-add="' + i.appid + '" data-name="' + esc(i.name) + '">Add</button></li>';
        }).join("") : "<li>No Steam games found.</li>";
      }).catch(function () { resEl.innerHTML = "<li>Couldn&rsquo;t search Steam. Try again.</li>"; });
    }
    document.getElementById("btn-search").addEventListener("click", search);
    q.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); search(); } });
    resEl.addEventListener("click", function (e) {
      var b = e.target.closest("[data-add]"); if (!b) return;
      var id = +b.getAttribute("data-add");
      if (!S.comps.some(function (c) { return c.appid === id; }) && S.comps.length < 12) S.comps.push({ appid: id, name: b.getAttribute("data-name") });
      changed(); renderComps(R);
    });
    out.querySelector(".comps-list") && out.querySelector(".comps-list").addEventListener("click", function (e) {
      var rm = e.target.closest("[data-rm]"), tg = e.target.closest("[data-toggle]");
      if (rm) { var id = +rm.getAttribute("data-rm"); S.comps = S.comps.filter(function (c) { return c.appid !== id; }); delete S.off[id]; }
      else if (tg) { var t = +tg.getAttribute("data-toggle"); if (S.off[t]) delete S.off[t]; else S.off[t] = 1; }
      else return;
      changed(); renderComps(R);
    });
    document.getElementById("btn-read").addEventListener("click", function () { var md = M.mode(GOS.game, GOS.ledger, GOS.thesis && GOS.thesis.compSet); runComps(md); });
  }

  /* ---------------- Actions ---------------- */
  function wireResults() {
    if (!findingSeen) { findingSeen = true; step("finding_viewed", 3, { mode: R.mode }); }
    var copy = document.getElementById("btn-copy");
    if (copy) copy.addEventListener("click", function () {
      var v = R.vocab, lines = [];
      if (v.pos.phrases.length) lines.push("Positive reviews:", v.pos.phrases.map(function (p) { return "- " + p.phrase + " (" + p.count + " reviews)"; }).join("\n"));
      if (v.neg.phrases.length) lines.push("Negative reviews:", v.neg.phrases.map(function (p) { return "- " + p.phrase + " (" + p.count + " reviews)"; }).join("\n"));
      var text = lines.join("\n"), msg = document.getElementById("copy-msg");
      var done = function () { msg.textContent = "Copied."; track("output_action", { action: "copy", what: "phrases" }); step("result_actioned", 4, { action: "copy" }); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
      else { fallbackCopy(text); done(); }
    });
    var send = document.getElementById("btn-send");
    if (send) send.addEventListener("click", function () {
      var list = M.signals(R), msg = document.getElementById("send-msg");
      if (!list.length || !window.GOS || !GOS.game) return;
      send.disabled = true; msg.textContent = "Sending to " + GOS.game.title + "…";
      GOS.recordSignals(TOOL_ID, list).then(function () {
        msg.textContent = "Sent " + list.length + " figure" + (list.length === 1 ? "" : "s") + " to " + GOS.game.title + ".";
        track("output_action", { action: "send_signals", count: list.length });
        step("result_actioned", 4, { action: "send_to_game" });
      }).catch(function (e) { send.disabled = false; msg.className = "feedback err"; msg.textContent = "Couldn't send: " + e.message; });
    });
    wireTips();
  }
  function fallbackCopy(text) {
    var ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) {} document.body.removeChild(ta);
  }
  var tip = document.getElementById("chart-tip");
  function wireTips() {
    out.querySelectorAll(".tipped").forEach(function (g) {
      g.addEventListener("mousemove", function (e) { tip.textContent = g.getAttribute("data-tip"); tip.style.display = "block"; tip.style.left = Math.min(e.clientX + 12, innerWidth - 270) + "px"; tip.style.top = e.clientY + 12 + "px"; });
      g.addEventListener("mouseleave", function () { tip.style.display = "none"; });
    });
  }

  /* ---------------- About ---------------- */
  function about() {
    var items = [
      "<b>Sources:</b> public Steam data. If Steam refuses the review request, the page says so and shows SteamSpy&rsquo;s daily all-time counts instead, labelled as third-party and never sent to your game. Reviews from Steam&rsquo;s <code>GetAppReviews</code> (most recent first, all languages); daily and weekly counts from Steam&rsquo;s review histogram; positive shares from the daily Steam snapshot in your game&rsquo;s ledger; update dates from your Steam news feed. Nothing needs a key, and review text is never saved.",
      "<b>Two modes:</b> your game, when it has a Steam App ID and at least " + M.MIN_GAME_REVIEWS + " reviews (Steam shows no score below that); otherwise your comps. Comps mode sends nothing to your game.",
      "<b>Ranges, not single numbers:</b> shares carry 95% Wilson ranges; counts per day carry exact 95% Poisson ranges. A change is called up or down only when the two ranges don&rsquo;t overlap. That is cautious on purpose.",
      "<b>Minimums:</b> decay alarm " + M.MIN_RECENT_N + " reviews in 30 days; velocity " + M.MIN_WINDOW_COUNT + " reviews across both windows; playtime medians " + M.MIN_PLAYTIME_N + " reviews per side; early-exit share " + M.MIN_NEG_N + " negative reviews; phrases " + M.MIN_VOCAB_REVIEWS + " reviews per side and " + M.MIN_PHRASE_REVIEWS + " reviews per phrase. Below these the page says &ldquo;too few to read yet&rdquo; and sends nothing.",
      "<b>Sample:</b> up to 500 most recent reviews for your game and " + MAX_COMP_REVIEWS + " per comp, so playtime and phrases describe recent reviewers, not everyone who ever reviewed.",
      "<b>Known gap:</b> the 30-day share comes from Steam&rsquo;s histogram read in English, while the all-time share is Steam&rsquo;s own summary. If the two count different languages, the gap compares slightly different groups of reviewers.",
      "<b>Reach or Resonance:</b> review velocity is Reach (are new players arriving?). The positive-share gap, playtime at review and early negative reviews are Resonance (do players stick?).",
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
      .then(function (r) { if (!r.ok) throw new Error(r.status); status("Saved to your account", "ok"); })
      .catch(function () { status("Couldn't save to your account; your comps are still in this browser", "error"); });
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
  document.getElementById("btn-reload").addEventListener("click", function () { runId++; loading = false; run(); });
  about();
  if (window.GOS && GOS.mountBar) GOS.mountBar("#gameBar", { toolId: TOOL_ID });
  var booted = false, lastGame = null;
  initAccount().then(start, start);
  function start() {
    booted = true; lastGame = window.GOS && GOS.game ? GOS.game.id : null;
    run();
  }
  if (window.GOS && GOS.onChange) {
    GOS.onChange(function (s) {
      var id = s.game && s.game.id;
      if (!booted || id === lastGame) return;
      lastGame = id; runId++; loading = false; R = null; run();
    });
  }
})();
