/* Steam Page Audit -> shared game spine.
 * Audits of the current game's own store page are written to its Signal
 * Ledger. Auditing any other App ID (a competitor, a comp) is never recorded
 * unless the user explicitly says it is their game's page.
 */
(function () {
  "use strict";
  if (!window.GOS) return;
  var G = window.GOS;
  G.mountBar("#gameBar", { toolId: "steam-page-audit" });

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function note(html) {
    var el = document.getElementById("ledgerNote");
    if (el) el.innerHTML = html;
  }

  function record(appId, r) {
    var list = [{
      key: "page_audit_overall",
      label: "Store page score",
      value: r.overall,
      unit: "score",
      meta: { appId: String(appId), grade: r.grade, game_name: r.game_name },
    }];
    (r.criteria || []).forEach(function (c) {
      if (c && c.key && typeof c.score === "number") {
        list.push({ key: "page_audit_" + c.key, label: "Page: " + c.label, value: c.score, unit: "score" });
      }
    });
    note("Saving to " + esc(G.game.title) + "’s Signal Ledger…");
    return G.recordSignals("steam-page-audit", list).then(function () {
      note("Saved to <strong>" + esc(G.game.title) + "</strong>’s Signal Ledger. <a href=\"/game-os\">See it on the dashboard →</a>");
    }).catch(function (err) {
      note('<span class="error">Could not save to the ledger: ' + esc(err.message) + "</span>");
    });
  }

  window.gosAfterAudit = function (appId, r) {
    G.ready.then(function () {
      var g = G.game;
      if (!g) { note("Add your game in the bar above to keep audit scores in its Signal Ledger."); return; }
      if (g.role === "viewer") { note(""); return; }
      if (g.steamAppId && String(g.steamAppId) === String(appId)) { record(appId, r); return; }
      if (g.steamAppId) {
        note("This App ID isn’t " + esc(g.title) + "’s page (" + esc(g.steamAppId) + "), so it wasn’t added to the ledger.");
        return;
      }
      note('Is this <strong>' + esc(g.title) + '</strong>’s store page? ' +
        '<button type="button" class="btn" id="claimPage">Yes, save to ' + esc(g.title) + "</button>");
      var b = document.getElementById("claimPage");
      if (b) b.addEventListener("click", function () {
        b.disabled = true;
        G.updateGame({ steamAppId: String(appId) }).then(function () { return record(appId, r); })
          .catch(function (err) { b.disabled = false; note('<span class="error">' + esc(err.message) + "</span>"); });
      });
    });
  };
})();
