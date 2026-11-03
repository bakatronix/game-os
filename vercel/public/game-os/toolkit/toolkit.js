/* Game OS — Seismic widget toolkit.
 * Shared baseline for all standalone Seismic-tool widgets. Provides the demo
 * data (data.js, loaded before this file), default app state, the shared
 * render helpers, and a boot() entrypoint.
 *
 * Each widget page can, after loading this, override any helper/global before
 * calling boot(), so tools remain independently editable while sharing the
 * baseline.
 */

(function () {
  "use strict";

  // ---- Default app state (subsumes Seismic's STATE) ----
  window.STATE = window.STATE || {
    currentStage: 1,
    currentScreen: "dashboard",
    gateLog: (window.GATE_LOG && JSON.parse(JSON.stringify(window.GATE_LOG))) || [],
    thesisVersion: 1,
    thesisVersionHistory: [{ version: 1, revisedAt: "S1 gate", date: "2025-03-15" }],
    thesisCompleteness: 85,
    thesisRevisionCount: 0,
    thesisFields: {
      audience: { lastModified: 1 },
      compSet: { lastModified: 1 },
      hook: { lastModified: 1 },
      price: { lastModified: 1 },
      targets: { lastModified: 1 },
    },
    gateDecisions: {},
    stalenessMap: {},
  };

  window.GAMES_ACTIVE = 14;

  // ---- Shared render helpers (extracted from Seismic app.js) ----
  window.statGrid = function (metrics) {
    var h = '<div class="stat-grid">';
    metrics.forEach(function (m) {
      h += '<div class="stat-cell"><div class="stat-val ' + (m.color || "gold") + '">' + m.value + '</div><div class="stat-lbl">' + m.label + '</div>';
      if (m.sub) h += '<div class="stat-sub">' + m.sub + '</div>';
      h += '</div>';
    });
    h += '</div>';
    return h;
  };

  window.toolHeader = function (stage, stageLabel, title, subtitle) {
    var h = '<div class="tool-header">';
    h += '<div class="tool-breadcrumb">Stage ' + stage + ' &middot; ' + stageLabel + ' &rarr; <span>' + title + '</span></div>';
    h += '<h1 class="tool-title">' + title + '</h1>';
    if (subtitle) h += '<p class="tool-subtitle">' + subtitle + '</p>';
    h += '</div>';
    return h;
  };

  window.lineageBar = function (draws, feeds) {
    var h = '<div class="lineage-bar"><span class="lineage-label">Draws from:</span> ';
    draws.forEach(function (d, i) { h += '<span>' + d + '</span>'; if (i < draws.length - 1) h += ' <span class="lineage-arrow">&rarr;</span> '; });
    h += ' &nbsp;&nbsp; <span class="lineage-label">Feeds:</span> ';
    feeds.forEach(function (f, i) { h += '<span>' + f + '</span>'; if (i < feeds.length - 1) h += ' <span class="lineage-arrow">&rarr;</span> '; });
    h += '</div>';
    return h;
  };

  window.panel = function (title, body) {
    return '<div class="panel"><div class="panel-title">' + title + '</div>' + body + '</div>';
  };

  window.actionRow = function (metricValue, metricLabel, benchmark, recommendation, valueColor) {
    var h = '<div class="action-row">';
    h += '<div class="action-metric">';
    h += '<div class="action-value ' + (valueColor || "") + '">' + metricValue + '</div>';
    h += '<div class="action-label">' + metricLabel + '</div>';
    if (benchmark) h += '<div class="action-benchmark">' + benchmark + '</div>';
    h += '</div>';
    h += '<div class="action-body"><div class="action-recommendation">' + recommendation + '</div></div>';
    h += '</div>';
    return h;
  };

  window.benchmarkHint = function (value, benchmarkKey) {
    var b = (window.BENCHMARKS || {})[benchmarkKey];
    if (!b) return value;
    return value + ' <span class="benchmark-hint">' + b.genre + ' range: ' + b.min + "–" + b.max + b.unit + '</span>';
  };

  window.renderQuadrant = function (data, compact) {
    var zones = data.zones, zone = data.zone;
    var qh = '<div class="quadrant-container" style="position:relative;">';
    var positions = [
      { cls: "high-reach-low-resonance", rl: "reach-high", rs: "resonance-low" },
      { cls: "high-reach-high-resonance", rl: "reach-high", rs: "resonance-high" },
      { cls: "low-reach-low-resonance", rl: "reach-low", rs: "resonance-low" },
      { cls: "low-reach-high-resonance", rl: "reach-low", rs: "resonance-high" },
    ];
    positions.forEach(function (pos) {
      var z = zones[pos.cls], isActive = pos.cls === zone;
      qh += '<div class="quadrant-zone' + (isActive ? " active" : "") + '">';
      qh += '<div class="quadrant-zone-label ' + pos.rl + '">' + (pos.rl === "reach-high" ? "High Reach" : "Low Reach") + '</div>';
      qh += '<div class="quadrant-zone-label ' + pos.rs + '">' + (pos.rs === "resonance-high" ? "High Resonance" : "Low Resonance") + '</div>';
      if (isActive && !compact) {
        qh += '<div class="quadrant-interpretation">' + z.interpretation + '</div>';
        qh += '<div class="quadrant-action"><strong>Action:</strong> ' + z.action + '</div>';
      }
      qh += '</div>';
    });
    qh += '<div class="quadrant-axis-top">HIGH REACH</div>';
    qh += '<div class="quadrant-axis-bottom">LOW REACH</div>';
    qh += '<div class="quadrant-axis-left">HIGH RESONANCE</div>';
    qh += '<div class="quadrant-axis-right">LOW RESONANCE</div>';
    qh += '</div>';
    return qh;
  };

  // gate banner (standalone widgets don't run the full gate loop, but render
  // the stage banner as context).
  window.gateSection = function (stage) {
    var g = ((window.GATES || []).find(function (x) { return x.stage === stage; })) || null;
    if (!g) return "";
    return '<div class="gate-banner"><div class="gate-banner-icon">&#9888;</div><div class="gate-banner-body"><div class="gate-banner-title">Gate ' + stage + " &mdash; " + g.title + '</div><p class="gate-banner-question">' + g.question + '</p></div></div>';
  };

  // ---- Bootstrap ----
  // Renders a widget (by tool id, matching Seismic's render_<tool>) into
  // #widget-root, then fires the per-tool journey events.
  window.bootWidget = function (toolId) {
    if (typeof window.gosTrack === "function") {
      window.gosTrack("tool_session_start", { tool_id: toolId, entry_source: document.referrer || null });
      window.gosTrack("journey_step", { tool_id: toolId, step_name: "tool_opened", step_index: 1 });
    }

    var fnName = "render_" + String(toolId).replace(/-/g, "_");
    var fn = window[fnName];
    var root = document.getElementById("widget-root") || document.body;
    if (typeof fn === "function") {
      try {
        root.innerHTML = fn();
      } catch (e) {
        root.innerHTML = '<div class="panel"><div class="panel-title">Error</div><p>' + e.message + "</p></div>";
      }
    } else {
      root.innerHTML = '<div class="panel"><div class="panel-title">Tool not found</div><p>' + toolId + "</p></div>";
    }
  };
})();
