/* Audience Map — page logic. Analysis lives in model.js (window.AudienceModel); data comes from /api/audience-map. */
(function () {
  "use strict";
  var A = window.AudienceModel;
  var TOOL_ID = "audience-map";
  var LS_KEY = "gos_audience_map_v3";
  var ACCOUNT_URL = "/api/tool-state/" + TOOL_ID;
  var API = "/api/audience-map";
  var MAX = 8;
  var GENERIC = { 492: 1, 4182: 1, 3871: 1, 4191: 1, 3859: 1, 1756: 1, 493: 1, 113: 1, 19: 1, 21: 1, 597: 1, 9: 1, 599: 1, 122: 1, 4305: 1, 4726: 1, 7481: 1, 3834: 1, 1742: 1, 4166: 1, 4136: 1, 3964: 1, 5611: 1, 1708: 1, 1774: 1 };
  var PLAT = { discord: "Discord", reddit: "Reddit", youtube: "YouTube", x: "X (Twitter)", tiktok: "TikTok", twitch: "Twitch", instagram: "Instagram", bluesky: "Bluesky" };

  /* ---------------- State ---------------- */
  function emptyState() { return { comps: [], picks: {}, savedAt: 0 }; }
  function normalise(s) {
    if (!s || typeof s !== "object") return null;
    var b = emptyState();
    if (Array.isArray(s.comps)) b.comps = s.comps.filter(function (c) { return c && c.appid; }).slice(0, MAX);
    if (s.picks && typeof s.picks === "object") b.picks = s.picks;
    b.savedAt = Number(s.savedAt) || 0;
    return b;
  }
  var S = (function () { try { return normalise(JSON.parse(localStorage.getItem(LS_KEY) || "null")); } catch (e) { return null; } })() || emptyState();
  var DATA = null, NB = null, loading = false, saveTimer = null;
  function changed() { if (saveTimer) clearTimeout(saveTimer); saveTimer = setTimeout(persist, 300); }
  function persist() { S.savedAt = Date.now(); try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) {} scheduleAccountSave(); }
  function track(n, p) { if (window.gosTrack) gosTrack(n, Object.assign({ tool_id: TOOL_ID }, p || {})); }

  /* ---------------- Formatting ---------------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function num(n) { return n == null ? "—" : Math.round(n).toLocaleString("en-US"); }
  function short(n) { if (n == null) return "—"; return n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, "") + "K" : String(n); }
  function getJ(url) { return fetch(url).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "Error " + r.status); return j; }); }); }

  /* ---------------- Comps ---------------- */
  var compsEl = document.getElementById("comps"), resEl = document.getElementById("results"), msg = document.getElementById("msg"), out = document.getElementById("out");
  function say(t, err) { msg.textContent = t || ""; msg.className = "feedback" + (err ? " err" : ""); }
  function renderComps() {
    compsEl.innerHTML = S.comps.length ? S.comps.map(function (c) {
      return '<span class="comp-chip">' + (c.img ? '<img src="' + esc(c.img) + '" alt="">' : "") + esc(c.name) + '<button type="button" data-rm="' + c.appid + '" aria-label="Remove ' + esc(c.name) + '">&times;</button></span>';
    }).join("") : '<span class="note">No comps yet. Search for games like yours below.</span>';
    document.getElementById("btn-map").disabled = !S.comps.length || loading;
  }
  compsEl.addEventListener("click", function (e) {
    var b = e.target.closest("[data-rm]"); if (!b) return;
    var id = +b.getAttribute("data-rm"); S.comps = S.comps.filter(function (c) { return c.appid !== id; }); renderComps(); changed();
  });
  document.getElementById("add-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var q = document.getElementById("add-q").value.trim(); if (!q) return;
    resEl.hidden = false; resEl.innerHTML = '<li class="note">Searching Steam…</li>';
    getJ(API + "?part=search&q=" + encodeURIComponent(q)).then(function (j) {
      resEl.innerHTML = j.items.length ? j.items.map(function (i) { return '<li data-add="' + i.appid + '" data-name="' + esc(i.name) + '" data-img="' + esc(i.img || "") + '">' + (i.img ? '<img src="' + esc(i.img) + '" alt="">' : "") + esc(i.name) + "</li>"; }).join("") : '<li class="note">No Steam game found.</li>';
    }).catch(function (err) { resEl.innerHTML = '<li class="note">' + esc(err.message) + "</li>"; });
  });
  resEl.addEventListener("click", function (e) {
    var li = e.target.closest("[data-add]"); if (!li) return;
    var id = +li.getAttribute("data-add");
    if (S.comps.some(function (c) { return c.appid === id; })) { resEl.hidden = true; return; }
    if (S.comps.length >= MAX) { say("Eight comps at most. Remove one first.", true); return; }
    S.comps.push({ appid: id, name: li.getAttribute("data-name"), img: li.getAttribute("data-img") || null });
    resEl.hidden = true; document.getElementById("add-q").value = ""; renderComps(); changed();
    track("journey_step", { step_name: "comp_added", step_index: 1, comps: S.comps.length });
  });
  /** Fill comps from the thesis comp set (names only) by searching Steam for each. */
  function compsFromThesis() {
    var cs = window.GOS && GOS.thesis && Array.isArray(GOS.thesis.compSet) ? GOS.thesis.compSet : [];
    if (S.comps.length || !cs.length) return Promise.resolve(false);
    say("Finding your thesis comps on Steam…");
    var norm = function (s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, ""); };
    return Promise.all(cs.slice(0, MAX).map(function (c) {
      return getJ(API + "?part=search&q=" + encodeURIComponent(c.name)).then(function (j) {
        var hit = j.items.find(function (i) { return norm(i.name) === norm(c.name); }) || j.items[0];
        return hit ? { appid: hit.appid, name: hit.name, img: hit.img } : null;
      }).catch(function () { return null; });
    })).then(function (list) {
      var seen = {};
      S.comps = list.filter(function (c) { if (!c || seen[c.appid]) return false; seen[c.appid] = 1; return true; });
      renderComps(); changed(); say(S.comps.length ? "Comps loaded from " + GOS.game.title + "'s thesis." : "");
      return S.comps.length > 0;
    });
  }

  /* ---------------- Map ---------------- */
  document.getElementById("btn-map").addEventListener("click", run);
  function run() {
    if (!S.comps.length || loading) return;
    loading = true; renderComps(); NB = null;
    say("Reading Steam and Discord for " + S.comps.length + " games…");
    out.innerHTML = '<div class="loading">Mapping where these players gather&hellip;</div>';
    getJ(API + "?part=comps&ids=" + S.comps.map(function (c) { return c.appid; }).join(","))
      .then(function (j) {
        DATA = j; say(""); render();
        track("journey_step", { step_name: "audience_mapped", step_index: 2, comps: j.comps.length });
        var nb = A.neighbours(j.comps, 12);
        if (!nb.length) return;
        return getJ(API + "?part=games&ids=" + nb.map(function (n) { return n.appid; }).join(",")).then(function (g) {
          var by = {}; g.games.forEach(function (x) { by[x.appid] = x; });
          NB = nb.map(function (n) { return Object.assign({}, by[n.appid] || { appid: n.appid, name: "App " + n.appid }, { sharedWith: n.comps }); }).filter(function (n) { return n.name; });
          renderNeighbours();
        });
      })
      .catch(function (err) { say("Couldn't map the audience: " + err.message, true); out.innerHTML = ""; })
      .then(function () { loading = false; renderComps(); });
  }

  function render() {
    var comps = DATA.comps, com = A.communities(comps), tags = A.tagVocabulary(comps), talk = A.phrases(comps, 24);
    var h = "";
    h += '<div class="kpis four">' +
      kpi("hero", short(com.totalMembers), "Members across comp Discords", com.servers.length + " servers") +
      kpi("", short(com.totalOnline), "Online in them now", "Live from Discord") +
      kpi("", String(comps.length), "Comps mapped", com.compsWithDiscord + " with a Discord") +
      kpi("", String(tags.filter(function (t) { return t.comps.length >= 2; }).length), "Tags shared by 2+ comps", "Player-voted on Steam") + "</div>";

    // Communities
    var maxM = Math.max.apply(null, com.servers.map(function (s) { return s.members || 0; }).concat([1]));
    h += '<section class="card"><h3>Where their players gather</h3><p class="note">Official communities listed on each comp&rsquo;s Steam page. Tick up to two as your primary channels; they go into your thesis.</p>';
    if (com.servers.length) {
      h += '<div class="servers">' + com.servers.map(function (s) {
        var on = !!S.picks[s.server];
        return '<div class="server"><div class="ico">' + esc((s.server || "?").charAt(0)) + '</div><div><div class="nm"><a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.server) + '</a><label><input type="checkbox" data-pick="' + esc(s.server) + '"' + (on ? " checked" : "") + "> Primary</label></div>" +
          '<div class="sub">Discord · ' + esc(s.comps.join(", ")) + "</div></div>" +
          '<div class="ct">' + num(s.members) + "<small>" + (s.online != null ? num(s.online) + " online" : "") + "</small></div>" +
          '<div class="bar"><span style="width:' + Math.round(((s.members || 0) / maxM) * 100) + '%"></span></div></div>';
      }).join("") + "</div>";
    } else h += '<p class="note">None of these comps link a Discord server on Steam.</p>';
    var byPlat = {};
    com.other.forEach(function (o) { (byPlat[o.type] = byPlat[o.type] || []).push(o); });
    var plats = Object.keys(byPlat);
    if (plats.length) h += '<div class="platforms">' + plats.map(function (p) {
      return '<div class="plat"><h4>' + esc(PLAT[p] || p) + "</h4>" + byPlat[p].map(function (o) { return '<a href="' + esc(o.url) + '" target="_blank" rel="noopener">' + esc(o.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")) + " <small>" + esc(o.comp) + "</small></a>"; }).join("") + "</div>";
    }).join("") + "</div>";
    h += "</section>";

    h += '<section class="card"><h3>Neighbouring games</h3><p class="note">Games Steam recommends alongside several of your comps. Their players are your players&rsquo; neighbours: their communities and creators are the next places to look.</p><div id="nb">' + (NB ? "" : '<p class="loading">Finding neighbouring games&hellip;</p>') + "</div></section>";

    // Vocabulary
    h += '<section class="card"><h3>How players describe these games</h3><p class="note">Tags players voted onto your comps. Bigger means more comps carry it. Grey tags are generic; the green ones are the words worth using on your store page.</p><div class="cloud">' +
      tags.slice(0, 40).map(function (t) {
        var size = 12 + Math.min(10, t.comps.length * 2 + t.score);
        return '<span class="' + (GENERIC[t.id] ? "generic" : "") + '" style="font-size:' + size.toFixed(0) + 'px" title="' + esc(t.comps.join(", ")) + '">' + esc(t.name) + "<i>" + t.comps.length + "</i></span>";
      }).join("") + "</div></section>";
    h += '<section class="card"><h3>What players raise in discussions</h3><p class="note">Words and phrases from the newest threads in each comp&rsquo;s Steam forum (about ' + Math.round(comps.reduce(function (a, c) { return a + c.discussions.length; }, 0) / Math.max(1, comps.length)) + " threads per game). Useful for what players care about and ask for.</p>";
    h += talk.length ? '<div class="topics">' + talk.map(function (t) {
      return '<div class="topic"><b>' + esc(t.phrase) + "</b> · " + t.threads + " threads" + (t.comps.length > 1 ? ", " + t.comps.length + " games" : "") + '<div class="ex">&ldquo;' + esc(t.examples[0].title) + "&rdquo; (" + esc(t.examples[0].comp) + ")</div></div>";
    }).join("") + "</div>" : '<p class="note">Not enough discussion threads to find repeated topics.</p>';
    h += "</section>";

    h += '<section class="card no-print"><h3>Send to your game</h3><p class="note">Adds this summary to the audience part of your thesis (your existing text stays), and records the Discord reach as signals.</p><textarea class="sum" id="sum" aria-label="Audience summary">' + esc(A.summary(comps, com, tags.filter(function (t) { return !GENERIC[t.id]; }), talk, Object.keys(S.picks))) + '</textarea><div class="actions"><button class="btn" id="send" type="button">Add to thesis</button><span class="feedback" id="send-msg" role="status"></span></div></section>';
    out.innerHTML = h;
    if (NB) renderNeighbours();
  }
  function kpi(c, v, l, s) { return '<div class="kpi ' + c + '"><div class="v">' + esc(v) + '</div><div class="l">' + esc(l) + '</div><div class="s">' + esc(s) + "</div></div>"; }
  function renderNeighbours() {
    var el = document.getElementById("nb"); if (!el) return;
    el.innerHTML = NB && NB.length ? '<div class="nb-grid">' + NB.map(function (g) {
      var d = (g.links || []).find(function (l) { return l.type === "discord"; });
      return '<div class="nb">' + (g.capsule ? '<img loading="lazy" src="' + esc(g.capsule) + '" alt="">' : "") + '<div class="b"><div class="n">' + esc(g.name) + "</div>" +
        '<div class="shared">With ' + esc(g.sharedWith.join(", ")) + "</div>" +
        "<div>" + (g.reviews != null ? num(g.reviews) + " reviews" + (g.pct != null ? ", " + g.pct + "% positive" : "") : "No reviews yet") + "</div>" +
        (d && d.discord ? "<div>Discord: " + num(d.discord.members) + " members</div>" : "") +
        '<div class="acts"><a href="https://store.steampowered.com/app/' + g.appid + '/" target="_blank" rel="noopener">Steam</a>' + (d ? '<a href="' + esc(d.url) + '" target="_blank" rel="noopener">Discord</a>' : "") +
        '<button type="button" class="link-btn" data-addnb="' + g.appid + '" data-name="' + esc(g.name) + '" data-img="' + esc(g.capsule || "") + '">+ Add as comp</button></div></div></div>';
    }).join("") + "</div>" : '<p class="note">Steam has no shared recommendations for these comps.</p>';
  }

  out.addEventListener("change", function (e) {
    var p = e.target.getAttribute && e.target.getAttribute("data-pick"); if (p == null) return;
    if (e.target.checked) {
      if (Object.keys(S.picks).length >= 2) { e.target.checked = false; say("Two primary channels at most: focus beats spread.", true); return; }
      S.picks[p] = 1;
    } else delete S.picks[p];
    changed();
    var sum = document.getElementById("sum");
    if (sum && DATA) { var c = DATA.comps, tags = A.tagVocabulary(c); sum.value = A.summary(c, A.communities(c), tags.filter(function (t) { return !GENERIC[t.id]; }), A.phrases(c, 24), Object.keys(S.picks)); }
  });
  out.addEventListener("click", function (e) {
    var a = e.target.closest("[data-addnb]");
    if (a) {
      var id = +a.getAttribute("data-addnb");
      if (S.comps.length >= MAX) { say("Eight comps at most. Remove one first.", true); return; }
      if (!S.comps.some(function (c) { return c.appid === id; })) { S.comps.push({ appid: id, name: a.getAttribute("data-name"), img: a.getAttribute("data-img") || null }); renderComps(); changed(); }
      a.textContent = "Added"; a.disabled = true; say("Added. Press Map the audience to include it.");
      return;
    }
    if (e.target.id === "send") send();
  });

  /* ---------------- Send to Game OS ---------------- */
  function sendMsg(t, err) { var el = document.getElementById("send-msg"); if (el) { el.textContent = t; el.className = "feedback" + (err ? " err" : ""); } }
  function send() {
    if (!window.GOS || !GOS.ready) { sendMsg("Game OS isn't available on this page.", true); return; }
    GOS.ready.then(function () {
      if (!GOS.user) { sendMsg("Sign in to send this to a game.", true); return; }
      if (!GOS.game) { sendMsg("Pick or add a game in the bar at the top first.", true); return; }
      var text = document.getElementById("sum").value.trim();
      var prev = (GOS.thesis && GOS.thesis.audience) || "";
      var audience = prev ? prev.replace(/\s+$/, "") + "\n\n" + text : text;
      var com = A.communities(DATA.comps);
      sendMsg("Saving to " + GOS.game.title + "…");
      GOS.saveThesis({ audience: audience.slice(0, 4000) }, TOOL_ID, "Audience map from " + DATA.comps.length + " comps")
        .then(function () {
          return GOS.recordSignals(TOOL_ID, [
            { key: "audience_discord_members", label: "Members across comp Discords", value: com.totalMembers, unit: "units", meta: { servers: com.servers.map(function (s) { return s.server; }) } },
            { key: "audience_discord_online", label: "Online in comp Discords", value: com.totalOnline, unit: "units" },
            { key: "audience_comps_mapped", label: "Comps mapped", value: DATA.comps.length, unit: "units" },
          ]);
        })
        .then(function () { sendMsg("Added to " + GOS.game.title + "'s thesis, with the Discord reach as signals."); track("output_action", { action: "send_thesis" }); })
        .catch(function (err) { sendMsg("Could not save: " + err.message, true); });
    }, function () { sendMsg("Couldn't reach Game OS.", true); });
  }

  /* ---------------- Name check ---------------- */
  var nameOut = document.getElementById("name-out");
  document.getElementById("name-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var q = document.getElementById("name-q").value.trim(); if (!q) return;
    nameOut.innerHTML = '<p class="note">Checking…</p>';
    getJ(API + "?part=name&q=" + encodeURIComponent(q)).then(function (j) {
      var exact = j.steam.filter(function (x) { return x.exact; }), close = j.steam.filter(function (x) { return !x.exact; }).slice(0, 4);
      var h = '<div class="check-row"><span class="dot ' + (exact.length ? "bad" : "ok") + '"></span><span><b>Steam:</b> ' +
        (exact.length ? exact.length + " game" + (exact.length > 1 ? "s" : "") + " already called &ldquo;" + esc(j.name) + "&rdquo;: " + exact.map(function (x) { return '<a href="https://store.steampowered.com/app/' + x.appid + '/" target="_blank" rel="noopener">' + esc(x.name) + "</a>"; }).join(", ") + "."
          : "no game with exactly this name.") + (close.length ? ' <span class="note">Similar: ' + close.map(function (x) { return esc(x.name); }).join(", ") + ".</span>" : "") + "</span></div>";
      var d = j.domain;
      h += '<div class="check-row"><span class="dot ' + (d.status === "available" ? "ok" : d.status === "registered" ? "bad" : "wait") + '"></span><span><b>' + esc(d.name || "Domain") + ":</b> " +
        (d.status === "available" ? "not registered: you can likely buy it." : d.status === "registered" ? "already registered." : "couldn&rsquo;t check.") + "</span></div>";
      nameOut.innerHTML = h;
      track("journey_step", { step_name: "name_checked" });
    }).catch(function (err) { nameOut.innerHTML = '<p class="feedback err">' + esc(err.message) + "</p>"; });
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
      return fetch(ACCOUNT_URL, { credentials: "same-origin" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
        var server = j && j.state ? normalise(j.state) : null;
        if (server && (server.savedAt || 0) > (S.savedAt || 0) + 1000) { S = server; renderComps(); try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) {} }
        accountReady = true;
        if (server) status("Saved to your account", "ok");
      });
    }).catch(function () {});
  }
  window.addEventListener("pagehide", function () { if (accountReady && accountTimer) { clearTimeout(accountTimer); saveToAccount(true); } });

  /* ---------------- Boot ---------------- */
  document.getElementById("btn-print").addEventListener("click", function () { window.print(); });
  renderComps();
  if (window.GOS && GOS.mountBar) GOS.mountBar("#gameBar", { toolId: TOOL_ID });
  initAccount().then(function () {
    var nq = document.getElementById("name-q");
    if (window.GOS && GOS.game && !nq.value) nq.value = GOS.game.title;
    return compsFromThesis();
  }).then(function () { if (S.comps.length) run(); });
})();
