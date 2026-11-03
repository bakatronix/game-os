/* Market Scope — Game OS (Sandstone).
 * Interactive single-page market sizing tool. Designed for real data behind a
 * small data() seam; currently fed by the toolkit demo MARKET_SCOPE.
 */
(function () {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function fmtMoney(n) {
    if (n == null) return "—";
    if (n >= 1e6) return "$" + (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1e3) return "$" + (n / 1e3).toFixed(0) + "K";
    return "$" + n;
  }

  // ---- Data seam (swap for live sources later) ----
  function data() {
    var M = window.MARKET_SCOPE || {};
    var GENRES = ["survival-crafting", "roguelike", "deckbuilder", "metroidvania", "farming-sim", "city-builder", "automation", "horror", "RPG", "action", "strategy", "co-op", "underwater", "space", "fantasy"];
    var RD = M.revenueDistribution || {};
    var SAT = M.saturationIndex || { current: "-18%", detail: "2-year cohort" };
    var PF = M.publisherFunding || { count: 3, detail: "Devolver, Raw Fury, tinyBuild" };
    return {
      tags: GENRES,
      selectedTags: M.selectedTags || [],
      revenue: [
        { label: "Median revenue", value: RD.median || 180000, sub: "2-year cohort" },
        { label: "Top-quartile revenue", value: RD.topQuartile || 450000, sub: "2-year cohort" },
        { label: "Top-decile revenue", value: RD.topDecile || 1200000, sub: "2-year cohort" },
      ],
      saturation: { current: SAT.current, detail: SAT.detail },
      publishers: { count: PF.count, detail: PF.detail },
      blueOcean: M.blueOceanPairs || [],
      comps: M.compFunnels || [],
    };
  }

  // ---- Interactive state ----
  var STORE_KEY = "gameos-market-scope-tags";
  function loadSelected() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null") || null; } catch (e) { return null; }
  }
  function saveSelected(tags) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(tags)); } catch (e) {}
  }

  function toggleTag(tag) {
    var sel = loadSelected();
    var base = data().selectedTags;
    var list = sel ? sel.slice() : base.slice();
    var i = list.indexOf(tag);
    if (i >= 0) list.splice(i, 1); else list.push(tag);
    saveSelected(list);
    window.msRender();
    if (typeof window.gosTrack === "function") {
      window.gosTrack("journey_step", { tool_id: "market-scope", step_name: "tag_toggled", step_index: 2, tag: tag, selected: list.length });
    }
  }

  function kpiTile(label, value, sub, tone) {
    // tone: t (teal), m (mustard), o (orange) -> Sandstone KPI fills
    return (
      '<div class="ss-kpi ' + tone + '">' +
      '<div class="ss-kpi-body">' +
      '<div class="ss-kpi-value">' + esc(value) + '</div>' +
      '<div class="ss-kpi-label">' + esc(label) + '</div>' +
      (sub ? '<div class="ss-kpi-sub">' + esc(sub) + '</div>' : '') +
      '</div></div>'
    );
  }

  window.msRender = function () {
    var d = data();
    var sel = loadSelected() || d.selectedTags;
    var root = document.getElementById("widget-root");
    if (!root) return;

    var kpis =
      d.revenue.map(function (r, i) {
        return kpiTile(r.label, fmtMoney(r.value), r.sub, ["t", "m", "o"][i % 3]);
      }).join("") +
      '<div class="ss-kpi t"><div class="ss-kpi-body"><div class="ss-kpi-value">' + esc(d.saturation.current) + '</div>' +
      '<div class="ss-kpi-label">Saturation index</div><div class="ss-kpi-sub">2-year trend</div></div></div>';

    var tags = d.tags.map(function (t) {
      var on = sel.indexOf(t) >= 0;
      return (
        '<button class="ss-chip' + (on ? " on" : "") + '" data-tag="' + esc(t) + '" aria-pressed="' + on + '">' +
        esc(t) + '</button>'
      );
    }).join("");

    var actions =
      '<div class="ss-card"><h3 class="ms-card-title">Diagnostic actions</h3>' +
      '<div class="ms-action-row"><div class="ms-action-metric">' + esc(d.saturation.current) + '<span>Saturation trend</span></div>' +
      '<div class="ms-action-body"><strong>The space is thinning out.</strong> Fewer releases competing for the same audience — a bullish signal for titles that ship now.</div></div>' +
      '<div class="ms-action-row"><div class="ms-action-metric">' + esc(d.publishers.count) + ' publishers<span>Funding activity</span></div>' +
      '<div class="ms-action-body"><strong>' + esc(d.publishers.detail) + '</strong> actively funding this genre. Publisher capital is a lagging-but-honest demand signal.</div></div>' +
      '</div>';

    var blueOcean = (d.blueOcean.length ? d.blueOcean.map(function (bp) {
      return '<div class="ms-metric-row"><span>' + esc(bp.tags) + '</span><span class="ms-metric-val">' + esc(bp.score) + '/100</span></div>';
    }).join("") : '<p class="ms-muted">No blue-ocean pairs yet.</p>');

    var compRows = (d.comps.length ? d.comps.map(function (c) {
      return '<tr><td class="ms-comp-name">' + esc(c.name) + '</td><td class="num">' + esc(c.wishlistVelocity) + '/day</td>' +
        '<td class="num">' + esc(c.pageConv) + '%</td><td class="num">' + esc(c.demoConv) + '%</td>' +
        '<td class="num">' + Math.round(c.launchUnits / 1000) + 'K</td></tr>';
    }).join("") : '<tr><td colspan="5">No comps yet.</td></tr>');

    root.innerHTML =
      '<div class="ms-hero">' +
      '<div class="ms-kicker">STAGE 1 — CONCEPT</div>' +
      '<h1 class="ms-title">Market Scope</h1>' +
      '<p class="ms-subtitle">Does an audience exist for your game?</p>' +
      '</div>' +

      '<div class="ss-kpis">' + kpis + '</div>' +

      '<section class="ss-card"><div class="ms-card-head"><h3 class="ms-card-title">Genres you are sizing</h3>' +
      '<span class="ss-meta">Click to select · ' + sel.length + ' selected</span></div>' +
      '<div class="ms-tags">' + tags + '</div></section>' +

      actions +

      '<div class="ms-two-col">' +
      '<section class="ss-card"><h3 class="ms-card-title">Verdict</h3>' +
      '<p class="ms-verdict"><strong>Crowded core, underserved co-op adjacency.</strong> Survival-crafting &times; roguelike is competitive at the top but thinning — fewer releases, higher per-title earnings.</p>' +
      '<span class="ss-meta">' + esc(d.publishers.detail) + '</span></section>' +
      '<section class="ss-card"><h3 class="ms-card-title">Blue-ocean pairs</h3>' + blueOcean + '</section>' +
      '</div>' +

      '<section class="ss-card"><h3 class="ms-card-title">Comp funnel benchmarks</h3>' +
      '<div class="ss-table-wrap"><table class="ss-table"><thead><tr><th>Game</th><th class="num">Wishlist velocity</th><th class="num">Page conversion</th><th class="num">Demo conversion</th><th class="num">Launch units</th></tr></thead>' +
      '<tbody>' + compRows + '</tbody></table></div>' +
      '<span class="ss-meta">Source: Steam · demo data</span></section>';

    // wire tag clicks
    root.querySelectorAll(".ss-chip").forEach(function (btn) {
      btn.addEventListener("click", function () { toggleTag(btn.getAttribute("data-tag")); });
    });
  };
})();
