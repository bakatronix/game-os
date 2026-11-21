/* Thesis Builder — the editor for the current game's Publishing Thesis.
 * Reads and writes the shared game spine (toolkit/spine.js): every save is a
 * new immutable version, and every other tool reads the latest one.
 */
(function () {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function fmtDate(d) {
    try { return new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; }
  }
  var FIELD_NAMES = { audience: "audience", hook: "hook", compSet: "comp set", priceHypothesis: "price", targets: "targets" };
  var SOURCES = { "price-calc": "Pricing Calculator", "thesis-builder": "Thesis Builder", manual: "manual edit" };

  // Comp set <-> textarea: one game per line, "Name — $24.99" (price optional).
  function compToText(list) {
    return (list || []).map(function (c) {
      return c.name + (c.price != null && c.price !== "" ? " — $" + Number(c.price).toFixed(2) : "");
    }).join("\n");
  }
  function textToComp(text) {
    return String(text || "").split(/\n+/).map(function (line) {
      line = line.trim();
      if (!line) return null;
      var m = line.match(/^(.*?)(?:\s*(?:—|--|-|,|\|)\s*\$?\s*(\d+(?:\.\d{1,2})?))?\s*$/);
      var name = (m && m[1] ? m[1] : line).trim();
      var price = m && m[2] ? Number(m[2]) : null;
      return name ? { name: name.slice(0, 80), price: price } : null;
    }).filter(Boolean).slice(0, 25);
  }

  function priceLink(G, t) {
    var s = G.signal("launch_price");
    if (!s) {
      return '<p class="tb-note">No price from the <a href="/game-os/price-calc/">Pricing Calculator</a> yet. Run it and press <em>Send to thesis</em> to link the two.</p>';
    }
    var calc = Number(s.value).toFixed(2);
    var hyp = t && t.priceHypothesis;
    var verdict = !hyp
      ? "Your thesis has no price yet."
      : Math.abs(Number(hyp) - Number(calc)) < 0.005
        ? "Matches your thesis."
        : "Differs from your thesis ($" + esc(hyp) + ").";
    return '<p class="tb-note"><strong>Pricing Calculator’s latest launch price: $' + esc(calc) + "</strong> (" + esc(new Date(s.observedAt).toLocaleDateString()) + "). " + verdict + "</p>";
  }

  function view(G) {
    if (!G.game) {
      return toolHeader(1, "Concept", "Publishing Thesis", "Add your game in the bar above to start its thesis.");
    }
    var t = G.thesis || {};
    var canEdit = G.game.role !== "viewer";
    var h = toolHeader(G.game.stage || 1, G.stageLabel(G.game.stage || 1), "Publishing Thesis",
      "The single versioned record of what " + esc(G.game.title) + " claims, and why. Every tool reads the latest version.");

    h += statGrid([
      { value: t.version ? "v" + t.version : "—", label: "Version", color: "gold" },
      { value: t.priceHypothesis ? "$" + esc(t.priceHypothesis) : "—", label: "Price hypothesis", color: "purple" },
      { value: (t.compSet && t.compSet.length) || 0, label: "Comp set games", color: "teal" },
      { value: Math.max(0, (G.history || []).length - 1), label: "Revisions", color: "coral" },
    ]);

    h += '<form id="tb-form" class="panel" novalidate>';
    h += '<div class="panel-title">' + (t.version ? "Revise thesis" : "Write the first version") + "</div>";
    h += '<label class="tb-field"><span>Positioning (hook)</span><small>One sentence: why someone picks this off the shelf.</small>' +
      '<input name="hook" maxlength="300" value="' + esc(t.hook) + '"' + (canEdit ? "" : " disabled") + "></label>";
    h += '<label class="tb-field"><span>Audience</span><small>Who it’s for, what they already play, where they hang out.</small>' +
      '<textarea name="audience" rows="3" maxlength="2000"' + (canEdit ? "" : " disabled") + ">" + esc(t.audience) + "</textarea></label>";
    h += '<div class="two-col">';
    h += '<label class="tb-field"><span>Comp set</span><small>Which shelf you’re on. One game per line, e.g. <code>Dredge — $24.99</code></small>' +
      '<textarea name="compSet" rows="5"' + (canEdit ? "" : " disabled") + ">" + esc(compToText(t.compSet)) + "</textarea></label>";
    h += '<div><label class="tb-field"><span>Price hypothesis (USD)</span><small>Tentative and gate-revisable; not your final price lock.</small>' +
      '<input name="priceHypothesis" inputmode="decimal" placeholder="19.99" value="' + esc(t.priceHypothesis) + '"' + (canEdit ? "" : " disabled") + "></label>" +
      priceLink(G, t) + "</div>";
    h += "</div>";
    h += '<label class="tb-field"><span>What changed? (optional)</span><input name="note" maxlength="300" placeholder="e.g. Narrowed audience after playtest round 2"' + (canEdit ? "" : " disabled") + "></label>";
    h += '<div class="tb-actions">' +
      (canEdit ? '<button type="submit" class="tb-btn">Save as v' + ((t.version || 0) + 1) + "</button>" : '<span class="tb-note">You have view-only access to this game.</span>') +
      '<span id="tb-msg" class="tb-note" role="status"></span></div>';
    h += "</form>";

    var hist = G.history || [];
    h += '<div class="panel"><div class="panel-title">Revision history</div>';
    if (!hist.length) {
      h += '<p class="tb-note">No versions yet.</p>';
    } else {
      hist.forEach(function (v) {
        var fields = (v.changedFields || []).map(function (f) { return FIELD_NAMES[f] || f; }).join(", ");
        h += '<div class="gate-log-entry"><span class="gate-log-decision decision-revise">v' + v.version + "</span>" +
          '<span style="flex:1">' + (fields ? "Changed " + esc(fields) : "No field changes") +
          " · " + esc(SOURCES[v.source] || v.source || "manual") +
          (v.note ? ' — <em>' + esc(v.note) + "</em>" : "") + "</span>" +
          '<span class="tb-date">' + esc(fmtDate(v.createdAt)) + "</span></div>";
      });
    }
    h += "</div>";
    return h;
  }

  function wire(G, root) {
    var f = root.querySelector("#tb-form");
    if (!f) return;
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var msg = root.querySelector("#tb-msg");
      var fd = new FormData(f);
      var price = String(fd.get("priceHypothesis") || "").replace(/[$,\s]/g, "");
      if (price && !/^\d+(\.\d{1,2})?$/.test(price)) {
        msg.textContent = "Price must be a number like 19.99.";
        return;
      }
      var btn = f.querySelector("button[type=submit]");
      btn.disabled = true;
      msg.textContent = "Saving…";
      G.saveThesis({
        hook: String(fd.get("hook") || ""),
        audience: String(fd.get("audience") || ""),
        compSet: textToComp(fd.get("compSet")),
        priceHypothesis: price,
      }, "thesis-builder", String(fd.get("note") || "")).then(function (res) {
        if (typeof window.gosTrack === "function") {
          window.gosTrack("journey_step", { tool_id: "thesis-builder", step_name: "thesis_saved", step_index: 2 });
        }
        var m = root.querySelector("#tb-msg");
        if (m) m.textContent = res.changed && res.changed.length ? "Saved v" + res.thesis.version + "." : "Nothing changed — no new version.";
      }).catch(function (err) {
        btn.disabled = false;
        msg.textContent = err.message;
      });
    });
  }

  function paint() {
    var root = document.getElementById("widget-root");
    if (!root || !window.GOS) return;
    root.innerHTML = view(window.GOS);
    wire(window.GOS, root);
  }

  // bootWidget() calls this synchronously; return a shell, then paint once
  // the spine has loaded and on every change (game switch, save).
  window.render_thesis_builder = function () {
    if (window.GOS) {
      window.GOS.ready.then(paint, paint);
      window.GOS.onChange(paint);
    }
    return '<p class="tb-note">Loading your thesis…</p>';
  };
})();
