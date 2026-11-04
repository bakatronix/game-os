/* Game OS — shared game spine (client).
 *
 * One script every tool loads to work on the studio's *current game*:
 *   GOS.ready            Promise<{ user, games, game, thesis, history, ledger }>
 *   GOS.game / thesis / ledger / history   (current snapshot; null until ready)
 *   GOS.signal(key)      latest ledger entry for a key, or null
 *   GOS.setGame(id)      switch current game (persists, re-fetches, notifies)
 *   GOS.createGame(data) create + switch to it
 *   GOS.updateGame(patch)
 *   GOS.saveThesis(patch, source, note)   write a new thesis version
 *   GOS.recordSignals(toolId, [{key, value, label, unit, meta}])
 *   GOS.onChange(fn)     called with the snapshot whenever it changes
 *   GOS.mountBar(elOrSelector, {toolId})  render the game picker bar
 *
 * The current game comes from ?game=<id>, else localStorage, else the
 * user's first game. Vanilla JS, no build step, safe to load on any page.
 */
(function () {
  "use strict";
  if (window.GOS) return;

  var KEY = "gos_game_id";
  var STAGES = ["", "Concept", "Pre-production", "First Playable", "Pre-Alpha", "Closed Beta", "Open Beta / EA", "Launch", "Post-launch"];
  var listeners = [];

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }

  function api(method, url, body) {
    return fetch(url, {
      method: method,
      credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.error || ("HTTP " + r.status)); e.status = r.status; throw e; }
        return j;
      });
    });
  }

  var GOS = {
    STAGES: STAGES,
    user: null,
    games: [],
    game: null,
    thesis: null,
    history: [],
    ledger: [],
    error: null,
  };

  function snapshot() {
    return { user: GOS.user, games: GOS.games, game: GOS.game, thesis: GOS.thesis, history: GOS.history, ledger: GOS.ledger };
  }
  function notify() {
    var s = snapshot();
    listeners.forEach(function (fn) { try { fn(s); } catch (e) { console.error(e); } });
    try { document.dispatchEvent(new CustomEvent("gos:change", { detail: s })); } catch (e) {}
  }

  function pickGameId() {
    var q = null;
    try { q = new URLSearchParams(location.search).get("game"); } catch (e) {}
    var ids = GOS.games.map(function (g) { return g.id; });
    if (q && ids.indexOf(q) >= 0) return q;
    var saved = lsGet(KEY);
    if (saved && ids.indexOf(saved) >= 0) return saved;
    return ids[0] || null;
  }

  function loadGame(id) {
    if (!id) {
      GOS.game = null; GOS.thesis = null; GOS.history = []; GOS.ledger = [];
      return Promise.resolve();
    }
    return api("GET", "/api/games/" + encodeURIComponent(id)).then(function (d) {
      GOS.game = d.game; GOS.thesis = d.thesis; GOS.history = d.thesisHistory || []; GOS.ledger = d.ledger || [];
      lsSet(KEY, id);
    });
  }

  function loadAll() {
    return Promise.all([
      api("GET", "/api/me").catch(function () { return {}; }),
      api("GET", "/api/games").catch(function (e) { GOS.error = e; return { games: [] }; }),
    ]).then(function (res) {
      GOS.user = (res[0] && res[0].user) || null;
      GOS.games = (res[1] && res[1].games) || [];
      return loadGame(pickGameId());
    }).then(function () { notify(); return snapshot(); });
  }

  GOS.ready = loadAll();

  GOS.signal = function (key) {
    for (var i = 0; i < GOS.ledger.length; i++) if (GOS.ledger[i].key === key) return GOS.ledger[i];
    return null;
  };
  GOS.stageLabel = function (n) { return STAGES[n] || ""; };
  GOS.onChange = function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; };

  GOS.refresh = function () {
    return loadGame(GOS.game && GOS.game.id).then(function () { notify(); return snapshot(); });
  };

  GOS.setGame = function (id) {
    return loadGame(id).then(function () {
      try {
        var u = new URL(location.href);
        if (u.searchParams.has("game")) { u.searchParams.set("game", id); history.replaceState(null, "", u.toString()); }
      } catch (e) {}
      track("journey_step", { step_name: "game_switched" });
      notify();
      return snapshot();
    });
  };

  GOS.createGame = function (data) {
    return api("POST", "/api/games", data).then(function (d) {
      return api("GET", "/api/games").then(function (l) {
        GOS.games = l.games || [];
        track("game_created", { has_app_id: !!(data && data.steamAppId) });
        return GOS.setGame(d.game.id);
      });
    });
  };

  GOS.updateGame = function (patch) {
    if (!GOS.game) return Promise.reject(new Error("No game selected"));
    return api("PATCH", "/api/games/" + GOS.game.id, patch).then(function () {
      return api("GET", "/api/games").then(function (l) { GOS.games = l.games || []; return GOS.refresh(); });
    });
  };

  GOS.saveThesis = function (patch, source, note) {
    if (!GOS.game) return Promise.reject(new Error("No game selected"));
    var body = Object.assign({}, patch, { source: source || "manual", note: note || null });
    return api("POST", "/api/games/" + GOS.game.id + "/thesis", body).then(function (res) {
      if (res.changed && res.changed.length) {
        track("thesis_revised", { source: body.source, fields: res.changed.join(","), version: res.thesis && res.thesis.version });
      }
      return GOS.refresh().then(function () { return res; });
    });
  };

  GOS.recordSignals = function (toolId, list) {
    if (!GOS.game) return Promise.reject(new Error("No game selected"));
    return api("POST", "/api/games/" + GOS.game.id + "/signals", { toolId: toolId, signals: list }).then(function (res) {
      track("signals_recorded", { tool_id: toolId, count: res.recorded });
      return GOS.refresh().then(function () { return res; });
    });
  };

  function track(name, props) {
    if (typeof window.gosTrack === "function") window.gosTrack(name, props || {});
  }

  /* ---------------- Game bar ---------------- */

  function injectStyles() {
    if (document.getElementById("gos-spine-css")) return;
    var css =
      ".gos-bar{color-scheme:light;display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:10px 14px;margin:0 0 16px;" +
      "background:#fbf1dc;border:1px solid #e6d6b7;border-radius:8px;" +
      "font-family:'Source Sans 3',system-ui,sans-serif;font-size:14px;color:#2f2a20}" +
      ".gos-bar *{box-sizing:border-box}" +
      ".gos-bar-label{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#655e4b}" +
      ".gos-bar select,.gos-bar input{font:inherit;color:inherit;background:#fff;border:1px solid #e6d6b7;" +
      "border-radius:3px;padding:6px 8px;min-height:34px;max-width:100%}" +
      ".gos-bar-stage{display:inline-block;padding:2px 10px;border-radius:999px;background:#dfe5c8;" +
      "color:#2c6a5a;font-size:12px;font-weight:700}" +
      ".gos-bar-spacer{flex:1 1 auto}" +
      ".gos-bar button{font:inherit;font-weight:700;cursor:pointer;border-radius:3px;padding:6px 12px;min-height:34px;" +
      "border:1.5px solid #304d4f;background:transparent;color:#304d4f}" +
      ".gos-bar button.primary{background:#304d4f;color:#fff}" +
      ".gos-bar button:focus-visible,.gos-bar select:focus-visible,.gos-bar input:focus-visible{outline:2px solid #304d4f;outline-offset:2px}" +
      ".gos-bar-form{display:flex;flex-wrap:wrap;gap:8px;width:100%;align-items:center}" +
      ".gos-bar-form input[name=title]{flex:2 1 200px}.gos-bar-form input[name=steamAppId]{flex:1 1 130px}" +
      ".gos-bar-msg{font-size:13px;color:#655e4b}.gos-bar-msg.err{color:#963226}" +
      "@media (max-width:560px){.gos-bar select{flex:1 1 100%}.gos-bar-spacer{display:none}}";
    var s = document.createElement("style");
    s.id = "gos-spine-css";
    s.textContent = css;
    document.head.appendChild(s);
  }

  function addForm(prefill) {
    var stages = STAGES.map(function (l, i) {
      return i ? '<option value="' + i + '">' + i + " · " + esc(l) + "</option>" : "";
    }).join("");
    return (
      '<form class="gos-bar-form" data-gos="add-form">' +
      '<input name="title" required maxlength="120" placeholder="Game title" aria-label="Game title" value="' + esc(prefill || "") + '">' +
      '<input name="steamAppId" inputmode="numeric" pattern="[0-9]*" maxlength="10" placeholder="Steam App ID (optional)" aria-label="Steam App ID">' +
      '<select name="stage" aria-label="Lifecycle stage">' + stages + "</select>" +
      '<button type="submit" class="primary">Add game</button>' +
      (GOS.games.length ? '<button type="button" data-gos="cancel">Cancel</button>' : "") +
      '<span class="gos-bar-msg" data-gos="msg" role="status"></span>' +
      "</form>"
    );
  }

  GOS.mountBar = function (target, opts) {
    opts = opts || {};
    var el = typeof target === "string" ? document.querySelector(target) : target;
    if (!el) return;
    injectStyles();
    el.classList.add("gos-bar");
    el.setAttribute("aria-label", "Current game");
    var adding = false;

    function render() {
      if (GOS.error && GOS.error.status === 401) {
        el.innerHTML = '<span class="gos-bar-msg">Sign in to save work to your game.</span>';
        return;
      }
      if (!GOS.games.length || adding) {
        el.innerHTML =
          '<span class="gos-bar-label">' + (GOS.games.length ? "New game" : "Add your game to start") + "</span>" +
          addForm();
        wireForm();
        return;
      }
      var g = GOS.game || {};
      var opts2 = GOS.games.map(function (x) {
        return '<option value="' + esc(x.id) + '"' + (x.id === g.id ? " selected" : "") + ">" + esc(x.title) + "</option>";
      }).join("");
      el.innerHTML =
        '<span class="gos-bar-label">Game</span>' +
        '<select data-gos="pick" aria-label="Current game">' + opts2 + "</select>" +
        (g.stage ? '<span class="gos-bar-stage">Stage ' + g.stage + " · " + esc(GOS.stageLabel(g.stage)) + "</span>" : "") +
        (GOS.thesis ? '<span class="gos-bar-msg">Thesis v' + GOS.thesis.version + "</span>" : '<span class="gos-bar-msg">No thesis yet</span>') +
        '<span class="gos-bar-spacer"></span>' +
        '<button type="button" data-gos="add">+ Add game</button>';
      el.querySelector('[data-gos="pick"]').addEventListener("change", function (e) { GOS.setGame(e.target.value); });
      el.querySelector('[data-gos="add"]').addEventListener("click", function () { adding = true; render(); });
    }

    function wireForm() {
      var f = el.querySelector('[data-gos="add-form"]');
      var msg = el.querySelector('[data-gos="msg"]');
      var cancel = el.querySelector('[data-gos="cancel"]');
      if (cancel) cancel.addEventListener("click", function () { adding = false; render(); });
      f.addEventListener("submit", function (e) {
        e.preventDefault();
        var fd = new FormData(f);
        msg.className = "gos-bar-msg"; msg.textContent = "Saving…";
        GOS.createGame({
          title: String(fd.get("title") || "").trim(),
          steamAppId: String(fd.get("steamAppId") || "").trim() || null,
          stage: Number(fd.get("stage") || 1),
        }).then(function () { adding = false; render(); })
          .catch(function (err) { msg.className = "gos-bar-msg err"; msg.textContent = err.message; });
      });
    }

    el.innerHTML = '<span class="gos-bar-msg">Loading your games…</span>';
    GOS.ready.then(render, render);
    GOS.onChange(function () { if (!adding) render(); });
  };

  window.GOS = GOS;
})();
