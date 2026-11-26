/* Sequel Signal — page logic. The logic lives in model.js (window.SequelModel).
 * Reads: the game's ledger (GOS.ledger), and Market Scope's existing /api/market-scope route when the studio asks for
 * today's market. Writes: no signals. "Start the next game" calls POST /api/games, then POST /api/games/:id/thesis. */
(function () {
  "use strict";
  var M = window.SequelModel, MM = window.MarketModel;
  var TOOL_ID = M.TOOL_ID;
  var LS_KEY = "gos_sequel_signal_v1";
  var MARKET_API = "/api/market-scope";

  /* ---------------- Formatting ---------------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function dl(ymd) { if (!ymd) return "—"; var p = String(ymd).slice(0, 10).split("-"); return +p[2] + " " + MONTHS[+p[1] - 1] + " " + p[0]; }
  function when(ts) { if (!ts) return ""; var d = new Date(ts); return isNaN(d) ? "" : dl(d.toISOString()); }
  function win(w) { if (!w) return ""; var p = String(w).split("/"); return p.length === 2 && /^\d{4}-\d\d-\d\d$/.test(p[0]) && /^\d{4}-\d\d-\d\d$/.test(p[1]) ? dl(p[0]) + " – " + dl(p[1]) : String(w); }
  function halfTag(h) { return h === "reach" || h === "resonance" ? '<span class="half ' + h + '">' + (h === "reach" ? "Reach" : "Resonance") + "</span>" : ""; }
  function track(name, props) { if (typeof window.gosTrack === "function") window.gosTrack(name, Object.assign({ tool_id: TOOL_ID }, props || {})); }
  function step(name, index, extra) { track("journey_step", Object.assign({ step_name: name, step_index: index }, extra || {})); }
  function api(method, url, body) {
    return fetch(url, { method: method, credentials: "same-origin", headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) {
        return r.text().then(function (t) {
          var j = null; try { j = JSON.parse(t); } catch (e) {}
          if (!r.ok || !j) { var e = new Error((j && j.error) || (r.status === 504 ? "the server took too long" : "the server had a problem (error " + r.status + ")")); e.status = r.status; throw e; }
          return j;
        });
      }, function () { throw new Error("couldn't reach the server. Check your connection"); });
  }

  /* ---------------- Draft state: per game, in this browser only ---------------- */
  var S = (function () { try { var s = JSON.parse(localStorage.getItem(LS_KEY) || "null"); return s && typeof s === "object" && s.games ? s : null; } catch (e) { return null; } })() || { games: {} };
  function gid() { return window.GOS && GOS.game ? String(GOS.game.id) : "_none"; }
  function persist() { try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) {} }
  function D() {
    var id = gid(), d = S.games[id];
    if (!d || !d.form) {
      var f = M.draft(GOS.game, GOS.thesis, "sequel");
      d = S.games[id] = { form: f, off: {}, touched: {} };
    }
    return d;
  }

  var out = document.getElementById("out");
  var nextCard = document.getElementById("next-card");
  var A = null, MARKET = { state: "idle", rows: null, msg: "", now: null, tagsMissing: [] }, TAGS = null;
  var viewed = {}, busy = false, created = null;

  /* ---------------- Main render ---------------- */
  function gate() {
    if (!window.GOS) return "Game OS isn't available on this page.";
    if (!GOS.user) return "Sign in to see your game&rsquo;s evidence. Sequel Signal reads the signals your other tools have recorded.";
    if (!GOS.game) return "Pick or add your game in the bar above. Sequel Signal reads the signals your other tools have recorded for it.";
    return null;
  }

  function render() {
    var g = gate();
    if (g) { out.innerHTML = '<section class="card answer"><h3>The evidence</h3><p class="verdict">' + g + "</p></section>"; nextCard.hidden = true; return; }
    nextCard.hidden = false;
    A = M.analyse({ ledger: GOS.ledger });
    out.innerHTML = summary() + '<div class="board">' + reachPanel() + resonancePanel() + gapPanel() + marketPanel() + "</div>" + unlabelled();
    wireBoard();
    renderNext();
    var key = gid();
    if (!viewed[key]) {
      viewed[key] = 1;
      step("evidence_viewed", 1, { reach: A.groups.reach.length, resonance: A.groups.resonance.length, gap: A.gap.status, market: !!A.market });
    }
  }

  function summary() {
    var gd = A.guidance;
    var none = !A.groups.reach.length && !A.groups.resonance.length && A.gap.status === "not-measured" && !A.market;
    var h = '<section class="card answer"><h3>The evidence for ' + esc(GOS.game.title) + "</h3>";
    if (none) {
      h += '<p class="verdict">There&rsquo;s nothing in ' + esc(GOS.game.title) + "&rsquo;s ledger yet for this page to read.</p>" +
        '<p class="next">Next: run <a href="/game-os/sentiment-radar">Sentiment Radar</a>, <a href="/game-os/page-engine">Page Engine</a> and <a href="/game-os/long-tail-engine">Long Tail Engine</a> and send their results to the game. Add the Steam App ID in the bar above so the daily snapshot starts.</p>';
    } else {
      h += '<ul class="plain">' + gd.facts.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
      h += '<h4>How to read it</h4><div class="guide">' + gd.rules.map(function (x) { return '<p class="note" style="margin:0">' + esc(x) + "</p>"; }).join("") + "</div>";
      h += '<p class="next">Next: read the four panels below, then pick a path in &ldquo;Start the next game&rdquo;.</p>';
    }
    return h + "</section>";
  }

  function sigItem(r) {
    var val = M.fmt(r.value, r.unit, r.points);
    var rng = r.lo != null && r.hi != null ? " (" + M.fmt(r.lo, r.unit, r.points) + " to " + M.fmt(r.hi, r.unit, r.points) + ")" : "";
    var bits = [];
    if (r.n != null) bits.push("n = " + Math.round(r.n).toLocaleString("en-US"));
    if (r.window) bits.push(esc(win(r.window)));
    if (r.observedAt) bits.push("recorded " + when(r.observedAt));
    var from = r.tool.path ? '<a href="' + esc(r.tool.path) + '">' + esc(r.tool.name) + "</a>" : esc(r.tool.name);
    bits.push("from " + from);
    if (r.labelledBy === "map") bits.push("labelled " + (r.half === "reach" ? "Reach" : "Resonance") + " by this page");
    var flag = "";
    if (r.change === "up" || r.change === "down") flag = ' <span class="badge ' + (r.change === "up" ? "good" : "warn") + '">' + (r.change === "up" ? "up" : "down") + " vs the window before</span>";
    else if (r.change === "flat") flag = ' <span class="badge">no clear change</span>';
    if (r.alarm) flag += ' <span class="badge bad">alarm</span>';
    if (r.verdict) flag += ' <span class="badge">' + esc(r.verdict) + "</span>";
    if (r.outdated) flag += ' <span class="badge warn">out of date</span>';
    return '<li><span class="lbl">' + esc(r.label) + flag + '</span><span class="val">' + esc(val) + '</span><span class="meta">' + esc(rng.trim()) + (rng ? " · " : "") + bits.join(" · ") + "</span></li>";
  }
  function sigList(list, emptyHtml) { return list.length ? '<ul class="sig">' + list.map(sigItem).join("") + "</ul>" : '<p class="empty">' + emptyHtml + "</p>"; }

  function reachPanel() {
    var list = A.groups.reach.concat(A.groups.both);
    return '<section class="card" id="p-reach"><span class="panel-n">1 of 4</span><h3>Did marketing find the audience?' + halfTag("reach") + "</h3>" +
      '<p class="note">Discovery, creator coverage, wishlist adds, traffic, click-through, festival lift and review velocity. The latest value of each.</p>' +
      sigList(list, 'No Reach signals yet. <a href="/game-os/page-engine">Page Engine</a> (wishlist adds), <a href="/game-os/sentiment-radar">Sentiment Radar</a> (review velocity) and <a href="/game-os/creator-match">Creator Match</a> write them.') + "</section>";
  }
  function resonancePanel() {
    return '<section class="card" id="p-resonance"><span class="panel-n">2 of 4</span><h3>Did the audience stick?' + halfTag("resonance") + "</h3>" +
      '<p class="note">Review sentiment and its trend, playtime, wishlist deletes, visit-to-wishlist and demo rates, and the player floor after launch.</p>' +
      sigList(A.groups.resonance, 'No Resonance signals yet. <a href="/game-os/sentiment-radar">Sentiment Radar</a> and <a href="/game-os/long-tail-engine">Long Tail Engine</a> write them.') + "</section>";
  }

  function gapPanel() {
    var G = A.gap;
    var h = '<section class="card" id="p-gap"><span class="panel-n">3 of 4</span><h3>Expectation gap</h3>' +
      '<p class="note">Does the store page promise what players say they got? A wide gap favours DLC or a fix over a sequel, because a sequel inherits the gap.</p>';
    if (G.status === "flags") {
      h += '<p class="note">From <a href="/game-os/sentiment-radar">Sentiment Radar</a>, recorded ' + when(G.observedAt) + (G.window ? " for " + esc(win(G.window)) : "") + (G.read != null ? ", " + Math.round(G.read).toLocaleString("en-US") + " reviews read" : "") + ".</p>";
      h += G.flags.map(function (f) {
        var share = f.count != null && f.n ? Math.round(f.count).toLocaleString("en-US") + " of " + Math.round(f.n).toLocaleString("en-US") + " negative reviews" : "";
        var rng = f.lo != null && f.hi != null ? " (" + M.fmt(f.lo, "pct") + " to " + M.fmt(f.hi, "pct") + ")" : "";
        return '<div class="flag">' + (f.claim ? '<div class="claim">Store page: &ldquo;' + esc(f.claim) + "&rdquo;</div>" : "") +
          "<div>" + (f.complaint ? "Players say: " + esc(f.complaint) : "") + (share ? ". " + share + rng + "." : "") + "</div>" +
          f.quotes.map(function (q) { return "<blockquote>&ldquo;" + esc(q.text) + "&rdquo;" + (q.url ? ' <a href="' + esc(q.url) + '" target="_blank" rel="noopener">review</a>' : "") + "</blockquote>"; }).join("") + "</div>";
      }).join("");
    } else if (G.status === "none-found") {
      h += '<p class="empty">Sentiment Radar checked on ' + when(G.observedAt) + (G.window ? " (" + esc(win(G.window)) + ")" : "") + " and found no store-page claim that negative reviews contradict. On its own that&rsquo;s a tight gap.</p>";
    } else {
      h += '<p class="empty">Not measured yet. <a href="/game-os/sentiment-radar">Sentiment Radar</a> writes this when it matches the store page&rsquo;s claims against complaints in negative reviews.</p>';
    }
    if (G.nearest.length) {
      h += "<h4>Nearest evidence (not the gap itself)</h4>" + '<ul class="sig">' + G.nearest.map(sigItem).join("") + "</ul>" +
        '<p class="note">A high share of negative reviews under 2 hours played usually points to the promise or the opening, not the endgame.</p>';
    }
    return h + "</section>";
  }

  function marketPanel() {
    var B = A.market;
    var h = '<section class="card" id="p-market"><span class="panel-n">4 of 4</span><h3>The market now</h3>';
    if (!B) {
      return h + '<p class="empty">No Market Scope figures on record for this game. Size the market in <a href="/game-os/market-scope">Market Scope</a> and send the figures to the game; this panel then re-runs the same tags today.</p></section>';
    }
    h += '<p class="note">Market Scope for <b>' + esc(B.tags.join(" + ")) + "</b>. Recorded " + when(B.observedAt) + (B.from && B.to ? " for releases " + esc(dl(B.from)) + " – " + esc(dl(B.to)) : "") + ". Estimates from reviews" +
      (B.mult ? " at " + B.mult + " copies per review" : "") + (B.share ? " and " + B.share + "% of list price" : "") + ", the same assumptions today.</p>";
    var rows = MARKET.rows || M.marketCompare(B.then, null);
    h += '<div class="tbl-wrap"><table class="t"><thead><tr><th>Figure</th><th>Then</th><th>Today</th></tr></thead><tbody>' + rows.map(function (r) {
      var chg = "";
      if (r.diff != null) chg = r.unit === "pct" ? M.fmt(r.diff, "pct", true) : r.rel != null ? (r.rel >= 0 ? "+" : "−") + Math.abs(Math.round(r.rel * 100)) + "%" : "";
      return '<tr><td class="name">' + esc(r.label) + "</td><td>" + esc(M.fmt(r.then, r.unit)) + "</td><td>" + (MARKET.rows ? esc(M.fmt(r.now, r.unit)) + (chg ? ' <span class="chg">(' + esc(chg) + ")</span>" : "") : "—") + "</td></tr>";
    }).join("") + "</tbody></table></div>";
    if (MARKET.tagsMissing.length) h += '<p class="note">Steam no longer lists ' + esc(MARKET.tagsMissing.join(", ")) + " as a tag, so today&rsquo;s run leaves it out. The two columns aren&rsquo;t like for like.</p>";
    if (MARKET.now && MARKET.now.truncated) h += '<p class="note">Steam&rsquo;s search stopped early for these tags today, so the release counts are a floor.</p>';
    h += '<div class="actions"><button type="button" class="btn-ghost" id="btn-market"' + (MARKET.state === "loading" ? " disabled" : "") + ">" + (MARKET.rows ? "Run again" : "Re-run for today") + '</button><span class="feedback' + (MARKET.state === "error" ? " err" : "") + '" id="market-msg" role="status">' + esc(MARKET.msg) + "</span></div>";
    h += '<p class="method">Market Scope reads Steam&rsquo;s search for games released under all these tags in the last 36 months. Revenue figures are estimates from review counts, shown for games at least a year old. A market that has grown more crowded since launch weighs on a sequel in the same space.</p>';
    return h + "</section>";
  }

  function unlabelled() {
    var list = A.groups.unlabelled;
    if (!list.length) return "";
    return '<details class="more card board-foot"><summary>Other signals without a Reach or Resonance label (' + list.length + ")</summary>" +
      '<p class="note">These were recorded before the Reach/Resonance split, or measure something that is neither, such as players online at snapshot time. They aren&rsquo;t counted in either panel.</p>' +
      '<ul class="sig">' + list.map(sigItem).join("") + "</ul></details>";
  }

  function wireBoard() {
    var b = document.getElementById("btn-market");
    if (b) b.addEventListener("click", runMarket);
  }

  /* ---------------- Panel 4: re-run Market Scope today ---------------- */
  function marketMsg(text, err) { MARKET.msg = text; MARKET.state = err ? "error" : MARKET.state; var el = document.getElementById("market-msg"); if (el) { el.textContent = text; el.className = "feedback" + (err ? " err" : ""); } }
  function runMarket() {
    var B = A && A.market;
    if (!B || MARKET.state === "loading") return;
    var forGame = gid();
    MARKET.state = "loading"; MARKET.msg = "Reading Steam for " + B.tags.join(" + ") + "… this can take up to a minute for broad tags."; render();
    var tagsP = TAGS ? Promise.resolve(TAGS) : api("GET", MARKET_API + "?list=tags").then(function (j) { TAGS = j.tags || []; return TAGS; });
    tagsP.then(function (list) {
      var m = M.tagIds(B.tags, list);
      if (!m.ids.length) throw new Error("none of the recorded tags are on Steam's tag list any more");
      MARKET.tagsMissing = m.missing;
      var key = m.ids.slice().sort(function (a, b) { return a - b; }).join(",");
      return api("GET", MARKET_API + "?tags=" + key);
    }).then(function (data) {
      if (forGame !== gid()) return;
      var res = MM.analyse(data, { mult: B.mult || MM.DEFAULTS.mult, share: B.share || MM.DEFAULTS.share });
      MARKET.now = { truncated: !!data.truncated };
      MARKET.rows = M.marketCompare(B.then, M.marketNow(res));
      MARKET.state = "done"; MARKET.msg = "Read today, " + when(data.fetchedAt || Date.now()) + ".";
      track("journey_step", { step_name: "market_rerun", step_index: 1, tags: B.tags.length });
      render();
    }).catch(function (e) {
      if (forGame !== gid()) return;
      MARKET.state = "error"; MARKET.msg = "Couldn't read Steam: " + e.message + "."; render();
    });
  }

  /* ---------------- Start the next game ---------------- */
  function renderNext() {
    if (!GOS.game) { nextCard.innerHTML = ""; return; }
    var d = D(), f = d.form;
    var h = '<h3>Start the next game<span class="draft-badge">Draft</span></h3>';
    if (created && created.from === gid()) {
      h += '<div class="notice ' + (created.thesisError ? "warn" : "ok") + '">' + esc(created.title) + " is in Game OS at the Concept stage." +
        (created.thesisError ? " Its draft thesis didn&rsquo;t save (" + esc(created.thesisError) + "). Add it in Thesis Builder." : " Its draft thesis is saved as version 1, marked as a draft from Sequel Signal.") +
        ' <a href="/game-os/thesis-builder?game=' + encodeURIComponent(created.id) + '">Open it in Thesis Builder</a>. You&rsquo;re still looking at ' + esc(GOS.game.title) + " here.</div>";
    }
    var role = (GOS.games || []).filter(function (g) { return String(g.id) === gid(); })[0];
    if (role && role.role === "viewer") {
      nextCard.innerHTML = h + '<p class="empty">You have view-only access to this studio, so you can&rsquo;t add a game to it. Ask an editor or owner.</p>';
      return;
    }
    h += '<p class="note">Pick a path, then edit the draft. It creates a new game at the Concept stage in the same studio and saves this as its first thesis, marked as a draft. Nothing changes on ' + esc(GOS.game.title) + ".</p>";
    h += '<form id="next-form" novalidate><fieldset class="paths"><legend>What is the next game?</legend>' + M.PATHS.map(function (p) {
      return '<label><input type="radio" name="path" value="' + p.id + '"' + (f.path === p.id ? " checked" : "") + "> " + esc(p.label) + "</label>";
    }).join("") + "</fieldset>";
    h += '<div class="form-grid">' +
      '<label class="fld"><span>Working title</span><input type="text" name="title" maxlength="' + M.MAX_TITLE + '" value="' + esc(f.title) + '" required></label>' +
      '<label class="fld"><span>Genre</span><input type="text" name="genre" maxlength="80" value="' + esc(f.genre) + '"></label>' +
      '<label class="fld wide"><span>Audience</span><small>Copied from ' + esc(GOS.game.title) + "&rsquo;s thesis. Edit it for the next game.</small>" +
      '<textarea name="audience" maxlength="2000">' + esc(f.audience) + "</textarea></label>" +
      '<label class="fld"><span>Price hypothesis (USD)</span><small>Copied from ' + esc(GOS.game.title) + "&rsquo;s thesis. Leave blank if you don&rsquo;t know yet.</small>" +
      '<input type="text" name="priceHypothesis" inputmode="decimal" placeholder="19.99" value="' + esc(f.priceHypothesis) + '"></label>' +
      '<div class="fld"><span>Comps</span><small>' + esc(GOS.game.title) + " is now a comp for its successor. Untick any that don&rsquo;t fit.</small>" +
      '<ul class="comps">' + f.comps.map(function (c, i) {
        return '<li><input type="checkbox" id="comp-' + i + '" data-comp="' + i + '"' + (d.off[i] ? "" : " checked") + '><label for="comp-' + i + '">' + esc(c.name) + (c.price != null ? ' <span class="muted">$' + Number(c.price).toFixed(2) + "</span>" : "") + "</label></li>";
      }).join("") + "</ul>" +
      (f.comps.length < M.MAX_COMPS ? '<div class="add-comp"><input type="text" id="comp-add" maxlength="80" placeholder="Add a comp by name" aria-label="Add a comp by name"><button type="button" class="btn-small" id="btn-add-comp">Add</button></div>' : "") +
      "</div></div>";
    h += '<div class="actions"><button type="submit" class="btn" id="btn-create"' + (busy ? " disabled" : "") + '>Start the next game</button><button type="button" class="btn-ghost" id="btn-reset">Reset the draft</button><span class="feedback" id="next-msg" role="status"></span></div></form>';
    nextCard.innerHTML = h;
    wireNext();
  }

  function nextMsg(t, err) { var el = document.getElementById("next-msg"); if (el) { el.textContent = t; el.className = "feedback" + (err ? " err" : ""); } }
  function readForm() {
    var form = document.getElementById("next-form"), d = D(), fd = new FormData(form);
    d.form.title = String(fd.get("title") || "");
    d.form.genre = String(fd.get("genre") || "");
    d.form.audience = String(fd.get("audience") || "");
    d.form.priceHypothesis = String(fd.get("priceHypothesis") || "");
    d.form.path = String(fd.get("path") || d.form.path);
    persist();
    return d;
  }
  function wireNext() {
    var form = document.getElementById("next-form");
    if (!form) return;
    form.addEventListener("input", function (e) {
      if (e.target.name === "path") return; // handled on change, so the title can follow the path
      var d = readForm();
      if (e.target.name === "title") d.touched.title = 1;
    });
    form.addEventListener("change", function (e) {
      var d = D();
      if (e.target.name === "path") {
        var prev = d.form.path; readForm();
        // Re-suggest the title for the new path unless the studio has typed its own.
        if (!d.touched.title && prev !== d.form.path) { d.form.title = M.draft(GOS.game, GOS.thesis, d.form.path).title; persist(); renderNext(); }
      }
      if (e.target.dataset && e.target.dataset.comp != null) {
        if (e.target.checked) delete d.off[e.target.dataset.comp]; else d.off[e.target.dataset.comp] = 1;
        persist();
      }
    });
    var add = document.getElementById("btn-add-comp"), addIn = document.getElementById("comp-add");
    function addComp() {
      var name = String(addIn.value || "").trim();
      if (!name) return;
      readForm();
      var d = D(), list = M.dedupeComps(d.form.comps.concat([{ name: name }]));
      if (list.length === d.form.comps.length) { nextMsg(name + " is already in the list."); return; }
      d.form.comps = list; persist(); renderNext();
    }
    if (add) add.addEventListener("click", addComp);
    if (addIn) addIn.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); addComp(); } });
    document.getElementById("btn-reset").addEventListener("click", function () {
      delete S.games[gid()]; persist(); created = null; renderNext();
    });
    form.addEventListener("submit", function (e) { e.preventDefault(); create(); });
  }

  function create() {
    if (busy) return;
    var d = readForm();
    var comps = d.form.comps.filter(function (c, i) { return !d.off[i]; });
    var b = M.buildCreate(Object.assign({}, d.form, { comps: comps }), GOS.game);
    if (b.errors) { nextMsg(b.errors.join(" "), true); return; }
    var from = GOS.game, fromId = gid();
    busy = true; document.getElementById("btn-create").disabled = true; nextMsg("Creating " + b.game.title + "…");
    var body = Object.assign({}, b.game, from.studioId ? { studioId: from.studioId } : {});
    var gameId = null;
    api("POST", "/api/games", body).then(function (j) {
      gameId = j.game && j.game.id;
      if (!gameId) throw new Error("the server didn't return the new game");
      if (!b.hasThesis) return null;
      return api("POST", "/api/games/" + encodeURIComponent(gameId) + "/thesis", b.thesis).then(function () { return null; }, function (e) { return e.message; });
    }).then(function (thesisError) {
      created = { id: gameId, title: b.game.title, from: fromId, thesisError: b.hasThesis ? thesisError : null };
      step("next_game_started", 2, { path: d.form.path, comps: comps.length, thesis: b.hasThesis && !thesisError });
      track("output_action", { action: "start_next_game", path: d.form.path });
      delete S.games[fromId]; persist();
      // Refresh the game list so the bar shows the new game, without switching away from this one.
      return api("GET", "/api/games").then(function (l) { GOS.games = l.games || GOS.games; }, function () {}).then(function () { return GOS.refresh(); });
    }).catch(function (e) {
      nextMsg("Couldn't create the game: " + e.message + ".", true);
    }).then(function () { busy = false; if (created) renderNext(); else { var bt = document.getElementById("btn-create"); if (bt) bt.disabled = false; } });
  }

  /* ---------------- About ---------------- */
  function about() {
    var items = [
      "<b>Panels 1 and 2</b> show the latest value of each signal your other tools have sent to this game, with its range, sample size, window and the tool that made it. Each tool labels its own signals Reach or Resonance. The daily Steam snapshot predates that label, so this page labels review counts Reach and positive shares Resonance; anything else unlabelled is listed separately.",
      "<b>Panel 3</b> reads the expectation-gap flags that Sentiment Radar records when it matches the store page&rsquo;s claims against negative reviews.",
      "<b>Panel 4</b> re-runs Market Scope for the tags on the last market figures sent to this game, with the same assumptions. It only runs when you press the button.",
      "<b>No score, no verdict.</b> The page lays out the evidence and the rules of thumb from the brief. The decision is yours, and unusual games often beat their comps.",
      "<b>What it writes:</b> no signals. &ldquo;Start the next game&rdquo; creates a game and its first thesis version, marked as a draft from Sequel Signal. The draft form is kept in this browser until you use it.",
    ];
    document.getElementById("about-list").innerHTML = items.map(function (x) { return "<li>" + x + "</li>"; }).join("");
  }

  /* ---------------- Boot ---------------- */
  document.getElementById("btn-print").addEventListener("click", function () { window.print(); });
  about();
  if (window.GOS && GOS.mountBar) GOS.mountBar("#gameBar", { toolId: TOOL_ID });
  var lastGame = null;
  function onChange() {
    var id = gid();
    if (id !== lastGame) { lastGame = id; MARKET = { state: "idle", rows: null, msg: "", now: null, tagsMissing: [] }; }
    if (!busy) render();
  }
  if (window.GOS && GOS.ready) {
    GOS.ready.then(onChange, function () { out.innerHTML = '<section class="card answer"><h3>The evidence</h3><p class="verdict">Couldn&rsquo;t reach Game OS. Reload to try again.</p></section>'; nextCard.hidden = true; });
    GOS.onChange(function () { if (lastGame !== null) onChange(); });
  } else {
    render();
  }
})();
