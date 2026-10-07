// === SEISMIC — Application Logic (v4 — template literals for safe strings) ===

var STATE = {
  currentStage: 1,
  currentScreen: 'dashboard',
  gateLog: JSON.parse(JSON.stringify(GATE_LOG)),
  thesisVersion: 1,
  thesisVersionHistory: [{ version: 1, revisedAt: 'S1 gate', date: '2025-03-15' }],
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

var GAMES_ACTIVE = 14;

// === INIT ===
function init() {
  try {
    updateLifecycleNav();
    updateSidebar();
    navigate('dashboard');
  } catch(e) {
    document.getElementById('main-content').innerHTML = '<div style="padding:2rem"><h3 style="color:var(--coral)">JS Error</h3><pre style="font-size:12px;white-space:pre-wrap">' + e.message + '</pre></div>';
  }
}
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); }
else { setTimeout(init, 20); }

// === NAVIGATION ===
function navigate(screen) {
  STATE.currentScreen = screen;
  renderScreen(screen);
  updateSidebar();
}

function navigateStage(stage) {
  STATE.currentStage = stage;
  updateLifecycleNav();
  updateSidebar();
  var tools = getToolsForStage(stage);
  if (tools.length > 0) navigate(tools[0].id);
  else navigate('dashboard');
}

function getToolsForStage(stage) {
  var map = {
    1: [{ id: 'market-scope', label: 'Market Scope' }, { id: 'thesis-builder', label: 'Thesis Builder' }],
    2: [{ id: 'audience-map', label: 'Audience Map' }],
    3: [{ id: 'page-engine', label: 'Page Engine' }, { id: 'community-scaffold', label: 'Community Scaffold' }],
    4: [{ id: 'test-loop', label: 'Test Loop' }, { id: 'festival-radar', label: 'Festival Radar' }, { id: 'playtest-pipeline', label: 'Playtest Pipeline' }],
    5: [{ id: 'creator-match', label: 'Creator Match' }, { id: 'sentiment-radar', label: 'Sentiment Radar' }],
    6: [{ id: 'demo-command', label: 'Demo Command' }, { id: 'window-planner', label: 'Window Planner' }],
    7: [{ id: 'launch-runbook', label: 'Launch Runbook' }],
    8: [{ id: 'long-tail-engine', label: 'Long Tail Engine' }, { id: 'sequel-signal', label: 'Sequel Signal' }],
  };
  return map[stage] || [];
}

function getStageLabel(s) {
  var labels = { 1: 'Concept', 2: 'Pre-production', 3: 'First Playable', 4: 'Pre-Alpha', 5: 'Closed Beta', 6: 'Open Beta/EA', 7: 'Launch', 8: 'Post-Launch' };
  return labels[s] || '';
}

// === SIDEBAR ===
function updateSidebar() {
  var sb = document.getElementById('sidebar');
  var h = '';
  h += `<div class="sidebar-section"><a class="sidebar-link${STATE.currentScreen==='dashboard'?' active':''}" onclick="navigate('dashboard')"><span class="dot current"></span>Dashboard</a></div>`;

  h += '<div class="sidebar-section"><div class="sidebar-section-title">Shared Objects</div>';
  h += `<a class="sidebar-link${STATE.currentScreen==='thesis-view'?' active':''}" onclick="navigate('thesis-view')"><span class="dot current"></span>Publishing Thesis</a>`;
  h += `<a class="sidebar-link${STATE.currentScreen==='ledger-view'?' active':''}" onclick="navigate('ledger-view')"><span class="dot current"></span>Signal Ledger</a>`;
  h += `<a class="sidebar-link${STATE.currentScreen==='gate-log'?' active':''}" onclick="navigate('gate-log')"><span class="dot current"></span>Gate History</a>`;
  h += '</div>';

  for (var s = 1; s <= 8; s++) {
    var tools = getToolsForStage(s);
    var decided = STATE.gateDecisions[s];
    h += `<div class="sidebar-section"><div class="sidebar-section-title">Stage ${s} &mdash; ${getStageLabel(s)}</div>`;
    tools.forEach(function(t) {
      var isActive = STATE.currentScreen === t.id;
      var dotClass = isActive ? 'current' : (STATE.gateDecisions[s] === 'proceed' ? 'completed' : 'pending');
      h += `<a class="sidebar-link${isActive?' active':''}" onclick="STATE.currentStage=${s};navigate('${t.id}');updateLifecycleNav();updateSidebar();"><span class="dot ${dotClass}"></span>${t.label}`;
      if (STATE.stalenessMap[t.id] && STATE.stalenessMap[t.id].stale) h += ' <span class="notify-dot" title="Thesis changed"></span>';
      h += '</a>';
    });
    if (s !== 7 && decided) {
      var cls = decided === 'proceed' ? 'var(--teal)' : decided === 'revise' ? 'var(--amber)' : 'var(--coral)';
      h += `<a class="sidebar-link" style="font-size:10px;opacity:0.6" onclick="showGate(${s})"><span class="dot" style="background:${cls}"></span>Gate ${s} &rarr; ${decided.toUpperCase()}</a>`;
    } else if (s !== 7 && STATE.currentStage >= s) {
      h += `<a class="sidebar-link" style="font-size:10px" onclick="showGate(${s})"><span class="dot pending"></span>Gate ${s} &rarr; decide</a>`;
    }
    h += '</div>';
  }
  sb.innerHTML = h;
}

function updateLifecycleNav() {
  var stages = document.querySelectorAll('.lc-stage');
  stages.forEach(function(el) {
    var s = parseInt(el.dataset.stage);
    el.classList.remove('active', 'completed');
    if (s === STATE.currentStage) el.classList.add('active');
    if (STATE.gateDecisions[s] === 'proceed') el.classList.add('completed');
  });
}

// === SCREEN ROUTER ===
function renderScreen(screen) {
  var mc = document.getElementById('main-content');
  var fn = window['render_' + screen.replace(/-/g, '_')];
  if (typeof fn === 'function') {
    mc.innerHTML = fn();
  } else {
    mc.innerHTML = `<div class="empty-state"><h3>${screen}</h3><p>Screen not found</p></div>`;
  }
  mc.scrollTop = 0;
}

// === GATE FUNCTIONS ===
function showGate(stage) {
  var g = GATES.find(function(x) { return x.stage === stage; });
  if (!g) return;
  var decided = STATE.gateDecisions[stage];
  var score = MOMENTUM_HISTORY[stage - 1];
  var h = '<div class="modal" onclick="event.stopPropagation()">';
  h += '<h2>Gate ' + stage + ': ' + g.title + '</h2>';
  h += '<div class="stage-badge current">Reach: ' + QUADRANT.reachScore + ' &middot; Resonance: ' + QUADRANT.resonanceScore + '</div>';
  h += '<div style="margin:0.75rem 0">' + renderQuadrant(QUADRANT, true) + '</div>';
  h += '<p class="gate-question" style="margin-top:0.5rem">' + g.question + '</p>';
  h += '<div class="gate-evidence"><h4>Evidence Snapshot</h4>';
  g.evidence.forEach(function(e) {
    h += '<div class="metric-row"><span class="metric-name">' + e.label + '</span><span class="metric-value">' + e.value + '</span></div>';
  });
  h += '</div>';

  if (decided) {
    var decClass = 'decision-' + decided;
    var ts = (STATE.gateLog.find(function(l){return l.stage===stage;}) || {}).timestamp || '';
    h += '<div class="alert alert-success"><span class="alert-icon">&#10003;</span><div>Decision: <strong>' + decided.toUpperCase() + '</strong> &mdash; logged ' + ts + '</div></div>';
    h += '<div class="modal-actions"><button class="btn btn-outline" onclick="closeGate()">Close</button></div>';
  } else if (stage === 8) {
    h += '<div class="modal-actions">';
    h += '<button class="btn btn-success" onclick="handleTerminalGate(\'dlc\')">DLC</button>';
    h += '<button class="btn btn-primary" onclick="handleTerminalGate(\'sequel\')">Sequel</button>';
    h += '<button class="btn btn-outline" onclick="handleTerminalGate(\'port\')">Port</button>';
    h += '<button class="btn btn-danger" onclick="handleTerminalGate(\'pivot\')">Pivot</button>';
    h += '</div>';
  } else {
    h += '<div class="modal-actions">';
    h += '<button class="btn btn-success" onclick="handleGateDecision(' + stage + ', \'proceed\')">Proceed</button>';
    h += '<button class="btn btn-primary" onclick="handleGateDecision(' + stage + ', \'revise\')">Revise Thesis</button>';
    h += '<button class="btn btn-danger" onclick="handleGateDecision(' + stage + ', \'stop\')">Stop</button>';
    h += '</div>';
  }
  h += '</div>';

  var modal = document.getElementById('gate-modal');
  modal.innerHTML = h;
  modal.style.display = 'flex';
  modal.onclick = closeGate;
}

function closeGate() {
  document.getElementById('gate-modal').style.display = 'none';
}

function handleGateDecision(stage, decision) {
  var now = new Date().toISOString().split('T')[0];
  var score = MOMENTUM_HISTORY[stage - 1] || { score: 0 };
  STATE.gateLog.push({
    stage: stage, decision: decision, score: score.score, timestamp: now,
    note: decision === 'proceed' ? 'Gate passed.' : decision === 'revise' ? 'Thesis revision required.' : 'Project stopped.'
  });
  STATE.gateDecisions[stage] = decision;
  if (decision === 'proceed' && stage < 8) STATE.currentStage = stage + 1;
  if (decision === 'revise') {
    var gateFields = { 1: ['audience','compSet'], 2: ['audience'], 3: ['hook','targets'], 4: ['price','compSet','targets'], 5: ['hook','audience'], 6: ['price','targets'] };
    var fields = gateFields[stage] || [];
    STATE.thesisVersion++;
    STATE.thesisRevisionCount++;
    STATE.thesisVersionHistory.push({ version: STATE.thesisVersion, revisedAt: 'S' + stage + ' gate', date: now, changedFields: fields });
    fields.forEach(function(f) { STATE.thesisFields[f].lastModified = STATE.thesisVersion; });
    runStalenessCheck();
    closeGate();
    updateLifecycleNav();
    updateSidebar();
    navigate('thesis-builder');
    return;
  }
  closeGate();
  updateLifecycleNav();
  updateSidebar();
  navigate('dashboard');
}

function handleTerminalGate(decision) {
  var now = new Date().toISOString().split('T')[0];
  STATE.gateLog.push({ stage: 8, decision: decision, score: 94, timestamp: now, note: 'Terminal gate via Sequel Signal.' });
  STATE.gateDecisions[8] = decision;
  closeGate();
  updateLifecycleNav();
  updateSidebar();
  if (decision === 'sequel') alert('New Thesis created for: Echoes of the Abyss: Deep Trench');
  navigate('sequel-signal');
}

function runStalenessCheck() {
  var TOOL_DEPENDENCIES = {
    'audience-map': ['audience','compSet'], 'page-engine': ['compSet','price'], 'community-scaffold': ['audience'],
    'test-loop': ['hook'], 'creator-match': ['audience'], 'sentiment-radar': ['audience'],
    'demo-command': ['price'], 'window-planner': ['compSet','price'], 'launch-runbook': ['compSet','price','hook'],
    'long-tail-engine': ['price'], 'sequel-signal': ['audience']
  };
  var changedFields = STATE.thesisVersionHistory[STATE.thesisVersionHistory.length - 1] ? STATE.thesisVersionHistory[STATE.thesisVersionHistory.length - 1].changedFields || [] : [];
  for (var tid in TOOL_DEPENDENCIES) {
    var deps = TOOL_DEPENDENCIES[tid];
    var overlap = deps.filter(function(f) { return changedFields.indexOf(f) >= 0; });
    if (overlap.length > 0) STATE.stalenessMap[tid] = { stale: true, changedFields: overlap };
  }
}

// === SEISMOGRAPH ===
function drawSeismograph(cid) {
  var canvas = document.getElementById(cid);
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var W = canvas.width = canvas.offsetWidth;
  var H = canvas.height = canvas.offsetHeight;
  var data = MOMENTUM_HISTORY;
  ctx.clearRect(0, 0, W, H);

  for (var i = 0; i < 5; i++) {
    var y = 30 + (H - 60) * i / 4;
    ctx.strokeStyle = '#eae7e0'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(W - 20, y); ctx.stroke();
    ctx.fillStyle = '#b5b0a5'; ctx.font = '9px IBM Plex Mono';
    ctx.fillText(Math.round(100 - i * 25), 8, y + 4);
  }
  var stageW = (W - 60) / 7;
  var stages = ['S1','S2','S3','S4','S5','S6','S7','S8'];
  stages.forEach(function(s, i) { ctx.fillStyle = '#b5b0a5'; ctx.font = '9px IBM Plex Mono'; ctx.fillText(s, 40 + i * stageW, H - 8); });

  var points = [];
  for (var j = 0; j < data.length; j++) {
    var x = 40 + j * stageW;
    var py = 30 + (H - 60) * (1 - data[j].score / 100);
    var amp = (data[j].score / 100) * 12;
    points.push({ x: x, y: py, amp: amp });
  }

  ctx.strokeStyle = '#c3a55f'; ctx.lineWidth = 2; ctx.beginPath();
  for (var k = 0; k < points.length; k++) {
    var p = points[k];
    var segW = stageW / 20;
    for (var m = 0; m < 20; m++) {
      var sx = p.x - stageW / 2 + m * segW;
      var sy = p.y + Math.sin(m * 0.8) * p.amp;
      if (k === 0 && m === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
  }
  ctx.stroke();

  ctx.strokeStyle = 'rgba(195, 165, 95, 0.15)'; ctx.lineWidth = 8; ctx.beginPath();
  for (var kk = 0; kk < points.length; kk++) {
    var pp = points[kk];
    var segW2 = stageW / 20;
    for (var mm = 0; mm < 20; mm++) {
      var sx2 = pp.x - stageW / 2 + mm * segW2;
      var sy2 = pp.y + Math.sin(mm * 0.8) * pp.amp;
      if (kk === 0 && mm === 0) ctx.moveTo(sx2, sy2);
      else ctx.lineTo(sx2, sy2);
    }
  }
  ctx.stroke();

  points.forEach(function(pt) {
    ctx.fillStyle = '#c3a55f'; ctx.beginPath(); ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fdfcf9'; ctx.beginPath(); ctx.arc(pt.x, pt.y, 2, 0, Math.PI * 2); ctx.fill();
  });
}

// === UTILITY HELPERS ===
function statGrid(metrics) {
  var h = '<div class="stat-grid">';
  metrics.forEach(function(m) {
    h += '<div class="stat-cell"><div class="stat-val ' + (m.color||'gold') + '">' + m.value + '</div><div class="stat-lbl">' + m.label + '</div>';
    if (m.sub) h += '<div class="stat-sub">' + m.sub + '</div>';
    h += '</div>';
  });
  h += '</div>';
  return h;
}

function toolHeader(stage, stageLabel, title, subtitle) {
  var h = '<div class="tool-header">';
  h += '<div class="tool-breadcrumb">Stage ' + stage + ' &middot; ' + stageLabel + ' &rarr; <span>' + title + '</span></div>';
  h += '<h1 class="tool-title">' + title + '</h1>';
  if (subtitle) h += '<p class="tool-subtitle">' + subtitle + '</p>';
  h += '</div>';
  return h;
}

function lineageBar(draws, feeds) {
  var h = '<div class="lineage-bar"><span class="lineage-label">Draws from:</span> ';
  draws.forEach(function(d, i) { h += '<span>' + d + '</span>'; if (i < draws.length - 1) h += ' <span class="lineage-arrow">&rarr;</span> '; });
  h += ' &nbsp;&nbsp; <span class="lineage-label">Feeds:</span> ';
  feeds.forEach(function(f, i) { h += '<span>' + f + '</span>'; if (i < feeds.length - 1) h += ' <span class="lineage-arrow">&rarr;</span> '; });
  h += '</div>';
  return h;
}

function panel(title, body) {
  return '<div class="panel"><div class="panel-title">' + title + '</div>' + body + '</div>';
}

function gateSection(stage) {
  if (stage === 7) return '<div class="gate-banner"><div class="gate-banner-icon" style="background:var(--blue-dim);color:var(--blue)">&#9881;</div><div class="gate-banner-body"><div class="gate-banner-title">Stage 7 &mdash; Operational Checkpoint</div><p class="gate-banner-question">No strategic gate at this stage. Launch Runbook provides continuous monitoring.</p></div></div>';
  var g = GATES.find(function(x) { return x.stage === stage; });
  if (!g) return '';
  var dec = STATE.gateDecisions[stage];
  if (dec) return '<div class="gate-banner"><div class="gate-banner-icon" style="background:var(--teal-dim);color:var(--teal)">&#10003;</div><div class="gate-banner-body"><div class="gate-banner-title">Gate ' + stage + ' &mdash; <span class="gate-log-decision decision-' + dec + '">' + dec.toUpperCase() + '</span></div><p class="gate-banner-question">' + g.question + '</p><button class="btn btn-outline btn-sm" onclick="showGate(' + stage + ')">View Decision</button></div></div>';
  return '<div class="gate-banner"><div class="gate-banner-icon">&#9888;</div><div class="gate-banner-body"><div class="gate-banner-title">Gate ' + stage + ' &mdash; ' + g.title + '</div><p class="gate-banner-question">' + g.question + '</p><div class="gate-banner-actions"><button class="btn btn-primary" onclick="showGate(' + stage + ')">Open Gate</button></div></div></div>';
}

var _EL = function(tag, cls, html) {
  return '<' + tag + ' class="' + cls + '">' + html + '</' + tag + '>';
};

// === REACH × RESONANCE QUADRANT RENDERER ===
function renderQuadrant(data, compact) {
  var zones = data.zones;
  var zone = data.zone;
  var qh = '';
  qh += '<div id="quadrant-container" style="position:relative;' + (compact ? 'min-height:auto' : '') + '">';
  var positions = [
    { cls: 'high-reach-low-resonance', rl: 'reach-high', rs: 'resonance-low' },
    { cls: 'high-reach-high-resonance', rl: 'reach-high', rs: 'resonance-high' },
    { cls: 'low-reach-low-resonance', rl: 'reach-low', rs: 'resonance-low' },
    { cls: 'low-reach-high-resonance', rl: 'reach-low', rs: 'resonance-high' },
  ];
  positions.forEach(function(pos) {
    var z = zones[pos.cls];
    var isActive = pos.cls === zone;
    qh += '<div class="quadrant-zone' + (isActive ? ' active' : '') + '">';
    qh += '<div class="quadrant-zone-label ' + pos.rl + '">' + (pos.rl === 'reach-high' ? 'High Reach' : 'Low Reach') + '</div>';
    qh += '<div class="quadrant-zone-label ' + pos.rs + '">' + (pos.rs === 'resonance-high' ? 'High Resonance' : 'Low Resonance') + '</div>';
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
}

// === ACTION ROW (reusable metric → action component) ===
function actionRow(metricValue, metricLabel, benchmark, recommendation, valueColor) {
  var h = '<div class="action-row">';
  h += '<div class="action-metric">';
  h += '<div class="action-value ' + (valueColor || '') + '">' + metricValue + '</div>';
  h += '<div class="action-label">' + metricLabel + '</div>';
  if (benchmark) h += '<div class="action-benchmark">' + benchmark + '</div>';
  h += '</div>';
  h += '<div class="action-body"><div class="action-recommendation">' + recommendation + '</div></div>';
  h += '</div>';
  return h;
}

// === BENCHMARK HINT ===
function benchmarkHint(value, benchmarkKey) {
  var b = BENCHMARKS[benchmarkKey];
  if (!b) return value;
  return value + ' <span class="benchmark-hint">' + b.genre + ' range: ' + b.min + '–' + b.max + b.unit + '</span>';
}

// === AMBIENT FOOTPRINT RENDERER ===
function renderAmbientFootprint() {
  var h = '<div class="panel"><div class="panel-title">Creator Ambient Footprint <span class="card-badge active">organic</span></div>';
  h += '<div class="action-row"><div class="action-metric"><div class="action-value purple">' + AMBIENT_FOOTPRINT.twitchHoursWatched.reduce(function(a,b){return a+b;},0).toLocaleString() + '</div><div class="action-label">Twitch Hours Watched (total)</div></div><div class="action-body"><div class="action-recommendation">' + AMBIENT_FOOTPRINT.interpretation + ' Twitch: ' + AMBIENT_FOOTPRINT.trend + '</div></div></div>';
  h += '<div class="action-row"><div class="action-metric"><div class="action-value coral">' + AMBIENT_FOOTPRINT.youtubeViews.reduce(function(a,b){return a+b;},0).toLocaleString() + '</div><div class="action-label">YouTube Views (total)</div></div><div class="action-body"><div class="action-recommendation"><strong>' + AMBIENT_FOOTPRINT.youtubeVideoCount.reduce(function(a,b){return a+b;},0) + ' videos</strong> across channels. Organic interest before coordinated outreach. This is a leading indicator: creators are finding you.</div></div></div>';
  h += '<div class="ambient-bar">' + AMBIENT_FOOTPRINT.weekLabels.map(function(w,i){
    var tw = AMBIENT_FOOTPRINT.twitchHoursWatched[i];
    var yt = AMBIENT_FOOTPRINT.youtubeViews[i];
    var maxH = 40;
    var twH = Math.max(4, (tw / 2100) * maxH);
    var ytH = Math.max(4, (yt / 45000) * maxH);
    return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px"><div class="ambient-bar-segment youtube" style="height:' + ytH + 'px" title="YT: ' + yt.toLocaleString() + '"></div><div class="ambient-bar-segment twitch" style="height:' + twH + 'px" title="Twitch: ' + tw + '"></div><span style="font-size:8px;color:var(--text-dim)">' + w + '</span></div>';
  }).join('') + '</div>';
  h += '<div style="font-size:10px;color:var(--text-dim);margin-top:6px"><span style="color:var(--purple)">&#9632; Twitch</span> <span style="color:var(--coral);margin-left:12px">&#9632; YouTube</span></div>';
  h += '</div>';
  return h;
}

// === MARKETING BEAT LOG ===
function renderBeatLog() {
  var h = '<div class="secondary-chart"><div class="secondary-chart-label">Marketing Beat Log &mdash; correlates lift events to the seismograph</div>';
  h += '<div class="beat-timeline">';
  MARKETING_BEATS.forEach(function(beat) {
    h += '<div class="beat-entry ' + beat.type + '">';
    h += '<span class="beat-date">' + beat.date + '</span>' + beat.action;
    h += '<span class="beat-tag ' + beat.type + '">' + beat.type + '</span>';
    h += '<span class="beat-meta">';
    if (beat.channel) h += '<span class="channel-tag">' + beat.channel + '</span>';
    if (beat.effort) h += '<span class="effort-tag effort-' + beat.effort + '">' + beat.effort + '</span>';
    if (beat.spend) h += '<span class="spend-tag">' + beat.spend + '</span>';
    if (beat.creativeVersion) h += '<span class="creative-ref" title="Creative live at this beat">' + beat.creativeVersion + '</span>';
    if (beat.outreachStatus) h += '<span class="outreach-tag outreach-' + beat.outreachStatus + '">' + beat.outreachStatus + '</span>';
    h += '</span>';
    h += '</div>';
  });
  h += '</div></div>';
  return h;
}

// =========================================================================
// DASHBOARD
// =========================================================================
function render_dashboard() {
  var h = '<h1 class="tool-title" style="font-size:2rem;margin-bottom:0.5rem">Echoes of the Abyss</h1>';
  h += '<div class="stage-badge current" style="margin-bottom:1.5rem">Stage ' + STATE.currentStage + ' &middot; ' + getStageLabel(STATE.currentStage) + ' &middot; Abyss Studio</div>';

  // Reach × Resonance Quadrant (HEADLINE)
  h += '<div class="dashboard-card full" style="margin-bottom:1.5rem">';
  h += '<div class="card-header"><div class="card-title">Reach &times; Resonance Quadrant</div><div class="card-badge active">Primary Diagnostic</div></div>';
  h += renderQuadrant(QUADRANT, false);
  h += '<div style="font-size:11px;color:var(--text-dim);margin-top:0.5rem">Reach: ' + QUADRANT.reachScore + ' &middot; Resonance: ' + QUADRANT.resonanceScore + ' &middot; Zone: <strong>' + QUADRANT.zones[QUADRANT.zone].label + '</strong></div>';
  h += '</div>';

  // Signal breakdown
  h += '<div class="two-col">';
  h += '<div class="dashboard-card"><div class="card-header"><div class="card-title">Reach Signals</div></div>';
  QUADRANT.reachSignals.forEach(function(sig) {
    var pct = sig.percentile;
    var color = pct >= 75 ? 'var(--teal)' : pct >= 50 ? 'var(--gold)' : 'var(--coral)';
    h += '<div class="metric-row"><span class="metric-name">' + sig.name + ' <span style="font-size:9px;color:var(--text-dim)">[' + sig.weight + ']</span></span><span><span class="metric-value" style="color:' + color + '">' + sig.value + ' ' + sig.label + '</span> <span class="metric-delta" style="font-size:10px">' + pct + 'th pctl</span></span></div>';
    if (sig.family === 'wishlist') {
      h += '<div class="family-note">Same metric family as <span class="opposite">Wishlist-to-Sale Rate</span> — this is the <strong>reach</strong> half (raw accumulation).</div>';
    }
  });
  h += '</div>';

  h += '<div class="dashboard-card"><div class="card-header"><div class="card-title">Resonance Signals</div></div>';
  QUADRANT.resonanceSignals.forEach(function(sig) {
    var pct = sig.percentile;
    var color = pct >= 75 ? 'var(--teal)' : pct >= 50 ? 'var(--gold)' : 'var(--coral)';
    h += '<div class="metric-row"><span class="metric-name">' + sig.name + ' <span style="font-size:9px;color:var(--text-dim)">[' + sig.weight + ']</span>' + (sig.dualTag ? ' <span class="dual-tag-badge" title="' + sig.dualNote + '">dual-tag</span>' : '') + '</span><span><span class="metric-value" style="color:' + color + '">' + sig.value + ' ' + sig.label + '</span> <span class="metric-delta" style="font-size:10px">' + pct + 'th pctl</span></span></div>';
    if (sig.family === 'wishlist') {
      h += '<div class="family-note">Same metric family as <span class="opposite">Wishlist Velocity</span> — this is the <strong>resonance</strong> half (what actually converts).</div>';
    }
    if (sig.dualTag) {
      h += '<div class="signal-note">' + sig.dualNote + '</div>';
    }
  });
  h += '</div></div>';

  // Lifecycle progress
  h += '<div class="dashboard-card" style="margin-top:1.5rem"><div class="card-header"><div class="card-title">Lifecycle Progress</div></div>';
  for (var s = 1; s <= 8; s++) {
    var dec = STATE.gateDecisions[s];
    var tools = getToolsForStage(s);
    var icon = '<span style="color:var(--border)">&#9675;</span>';
    var label = 'Locked';
    if (s === STATE.currentStage) { icon = '<span style="color:var(--gold)">&#9679;</span>'; label = 'Active'; }
    if (dec === 'proceed') { icon = '<span style="color:var(--teal)">&#10003;</span>'; label = 'Passed'; }
    if (dec === 'stop') { icon = '<span style="color:var(--coral)">&#10007;</span>'; label = 'Stopped'; }
    if (dec === 'revise') { icon = '<span style="color:var(--amber)">&#8635;</span>'; label = 'Revised'; }
    h += '<div class="metric-row" style="cursor:pointer" onclick="navigateStage(' + s + ')"><span class="metric-name">' + icon + ' Stage ' + s + ': ' + getStageLabel(s) + '</span><span><span class="metric-value" style="font-size:10px;color:var(--text-dim)">' + tools.map(function(t){return t.label;}).join(', ') + '</span><span class="metric-delta" style="color:' + (dec==='proceed'?'var(--teal)':dec==='revise'?'var(--amber)':'var(--text-dim)') + '">' + label + '</span></span></div>';
  }
  h += '</div>';

  // Secondary: Momentum Seismograph + Beat Log (DEMOTED)
  h += '<div class="two-col" style="margin-top:1.5rem">';
  h += '<div class="dashboard-card"><div class="card-header"><div class="card-title">Momentum Seismograph</div><div class="card-badge" style="font-size:8px">secondary</div></div>';
  h += '<div id="seismograph-container" style="height:140px"><canvas id="seismograph-canvas" width="600" height="140"></canvas></div>';
  h += '<div style="font-size:10px;color:var(--text-dim);margin-top:0.25rem">Signal amplitude — correlates to beat log below</div>';
  h += renderBeatLog();
  h += '</div>';

  // Gate history
  h += '<div class="dashboard-card"><div class="card-header"><div class="card-title">Gate Decision History</div></div>';
  if (STATE.gateLog.length === 0) {
    h += '<div class="empty-state" style="padding:1rem"><p style="font-size:13px">No gate decisions yet.</p></div>';
  } else {
    STATE.gateLog.forEach(function(gl) {
      h += '<div class="gate-log-entry"><span class="gate-log-decision decision-' + gl.decision + '">' + gl.decision + '</span><span style="font-size:13px;flex:1">Gate S' + gl.stage + ' &mdash; Score: ' + gl.score + '</span><span style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim)">' + gl.timestamp + '</span></div>';
    });
  }
  if (STATE.gateLog.length > 0) h += '<div style="margin-top:0.75rem"><a onclick="navigate(\'gate-log\')" style="cursor:pointer;font-family:var(--font-mono);font-size:10px">View full gate log &rarr;</a></div>';
  h += '</div></div>';

  setTimeout(function() { drawSeismograph('seismograph-canvas'); }, 100);
  return h;
}

// =========================================================================
// RENDER FUNCTIONS FOR EACH TOOL
// =========================================================================

function render_market_scope() {
  var h = toolHeader(1, 'Concept', 'Market Scope', 'Map the competitive landscape.');
  h += lineageBar(['Benchmark Pool'], ['Thesis Builder', 'Audience Map', 'Window Planner (S6)']);

  h += panel('Genre Selection', '<div class="tag-cloud">' +
    ['survival-crafting','roguelike','deckbuilder','metroidvania','farming-sim','city-builder','automation','horror','RPG','action','strategy','co-op','underwater','space','fantasy'].map(function(t){
      return '<span class="tag-pill' + (MARKET_SCOPE.selectedTags.indexOf(t) >= 0 ? ' selected' : '') + '">' + t + '</span>';
    }).join('') + '</div>');

  h += statGrid([
    { value: '$180K', label: 'Median Revenue', sub: '2-year cohort', color: 'gold' },
    { value: '$450K', label: 'Top-Quartile Revenue', sub: '2-year cohort', color: 'teal' },
    { value: '$1.2M', label: 'Top-Decile Revenue', sub: '2-year cohort', color: 'purple' },
    { value: MARKET_SCOPE.saturationIndex.current, label: 'Saturation Index', sub: MARKET_SCOPE.saturationIndex.detail, color: 'coral' },
  ]);

  // Action rows with benchmarks
  h += '<div class="panel"><div class="panel-title">Diagnostic Actions</div>';
  h += actionRow(MARKET_SCOPE.saturationIndex.current, 'Saturation Trend', 'Declining revenue-per-release = opportunity', '<strong>The space is thinning out — fewer releases competing for the same audience.</strong> This is a bullish signal: the games that do ship are earning more per title. Enter now before the next wave of supply.', 'coral');
  h += actionRow(MARKET_SCOPE.publisherFunding.count + ' publishers', 'Publisher Funding Activity', '', '<strong>3 top-tier indie publishers are actively funding this genre.</strong> Publisher activity is a lagging-but-honest demand signal — they commit capital after seeing the same market data you see here. If publishers are funding, the market exists.', 'teal');
  h += '</div>';

  h += '<div class="two-col">';
  h += panel('Verdict', '<p style="font-size:14px;line-height:1.6;color:var(--text-muted);margin-bottom:0.75rem"><strong style="color:var(--gold)">Crowded core, underserved co-op adjacency.</strong> The survival-crafting &times; roguelike space is competitive at the top but thinning &mdash; fewer releases, higher per-title earnings.</p><p style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim)">3 of the top 10 indie publishers are actively funding this space: Devolver, Raw Fury, tinyBuild.</p>');

  h += '<div>' + panel('Blue Ocean Pairs', MARKET_SCOPE.blueOceanPairs.map(function(bp){
    return '<div class="metric-row"><span class="metric-name">' + bp.tags + '</span><span class="metric-value" style="color:var(--teal)">' + bp.score + '/100</span></div>';
  }).join('')) + '</div>';
  h += '</div>';

  h += panel('Comp Funnel Benchmarks', '<table class="data-table"><thead><tr><th>Game</th><th>Wishlist Vel.</th><th>Page Conv.</th><th>Demo Conv.</th><th>Launch Units</th></tr></thead><tbody>' +
    MARKET_SCOPE.compFunnels.map(function(cf){
      return '<tr><td>' + cf.name + '</td><td>' + cf.wishlistVelocity + '/day</td><td>' + cf.pageConv + '%</td><td>' + cf.demoConv + '%</td><td class="cell-highlight">' + (cf.launchUnits/1000).toFixed(0) + 'K</td></tr>';
    }).join('') + '</tbody></table>');

  h += gateSection(1);
  return h;
}

function render_thesis_builder() {
  var h = toolHeader(1, 'Concept', 'Publishing Thesis', 'Single versioned record per game. Every tool reads from it; every gate can revise it.');
  h += lineageBar(['Market Scope', 'Benchmark Pool'], ['Every tool']);

  h += statGrid([
    { value: 'v' + STATE.thesisVersion, label: 'Version', color: 'gold' },
    { value: STATE.thesisCompleteness + '%', label: 'Completeness', color: 'teal' },
    { value: STATE.thesisRevisionCount, label: 'Gate Revisions', color: 'coral' },
    { value: THESIS.price + '', label: 'Price Hypothesis', color: 'purple' },
  ]);

  h += '<div class="two-col">';
  h += '<div class="panel"><div class="panel-title">Audience Statement <span style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-left:8px">v' + STATE.thesisFields.audience.lastModified + '</span></div><p style="font-size:14px;line-height:1.6;color:var(--text-muted)">' + THESIS.audience + '</p></div>';
  h += '<div class="panel"><div class="panel-title">Comp Set <span style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-left:8px">v' + STATE.thesisFields.compSet.lastModified + '</span> <span class="card-badge" style="font-size:8px">benchmark filter</span></div><div style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);margin-bottom:0.5rem">Criteria: price &plusmn;$5, scope &plusmn;40%, age &lt;4yr</div><table class="data-table"><thead><tr><th>Game</th><th>Price</th><th>Reviews</th><th>Revenue</th></tr></thead><tbody>';
  THESIS.compSet.forEach(function(c) {
    h += '<tr><td class="cell-highlight">' + c.name + '</td><td>$' + c.price.toFixed(2) + '</td><td>' + (c.reviews/1000).toFixed(0) + 'K</td><td>' + c.revenue + '</td></tr>';
  });
  h += '</tbody></table>';
  h += '<div style="font-size:10px;color:var(--text-dim);margin-top:0.5rem;font-style:italic"><strong>Comp set = which shelf you\'re on.</strong> Positioning = why someone picks you off it.</div></div></div>';

  h += '<div class="panel"><div class="panel-title">Positioning (Hook) <span style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-left:8px">v' + STATE.thesisFields.hook.lastModified + '</span> <span class="card-badge active" style="font-size:8px">version-controlled</span></div><p style="font-size:16px;line-height:1.4;color:var(--text);font-style:italic;font-family:var(--font-display)">"' + THESIS.hook + '"</p>';
  h += '<div style="font-size:10px;color:var(--text-dim);margin-top:0.5rem;font-style:italic">This is a positioning statement, not a one-time assertion &mdash; it is revision-controlled like the POSITIONING_VARIANTS in Test Loop. Gates can force a re-hook (revision tracked in history below).</div></div>';

  h += '<div class="panel"><div class="panel-title">Price Hypothesis</div><p style="font-size:14px;line-height:1.6;color:var(--text-muted)">' + THESIS.priceHypothesis + '</p>';
  h += '<div style="font-size:10px;color:var(--text-dim);margin-top:0.5rem;font-style:italic">Terminology alignment: Seismic uses "Price Hypothesis" (tentative, gate-revisable) to distinguish from "Baseline Price" (Price Calc\'s initial regional anchor) and "Price Lock" (Window Planner\'s final, irreversible commitment at Stage 6). These are three distinct pricing moments in the lifecycle.</div></div>';

  h += '<div class="panel"><div class="panel-title">Per-Stage Targets <span style="font-family:var(--font-mono);font-size:10px;color:var(--gold);margin-left:8px">auto-set from Benchmark Pool</span></div><table class="data-table"><thead><tr><th>Stage</th><th>Metric</th><th>Target</th><th>Benchmark</th></tr></thead><tbody>';
  for (var s in THESIS.targets) {
    var t = THESIS.targets[s];
    var keys = Object.keys(t).filter(function(k){return k !== 'desc';});
    var hint = '';
    if (keys.indexOf('wishlists') >= 0) hint = 'Genre norm: 1.5–3.5K at this stage';
    if (keys.indexOf('demoConv') >= 0) hint = 'Genre norm: 6–16%';
    h += '<tr><td>S' + s.replace('s','') + '</td><td class="cell-highlight">' + keys.join(', ') + '</td><td class="cell-highlight">' + keys.map(function(k){return t[k];}).join(' / ') + '</td><td style="font-size:10px;color:var(--text-dim)">' + hint + '</td></tr>';
  }
  h += '</tbody></table></div>';

  if (STATE.thesisVersionHistory.length > 0) {
    h += '<div class="panel"><div class="panel-title">Revision History</div>';
    STATE.thesisVersionHistory.forEach(function(vh) {
      h += '<div class="gate-log-entry"><span class="gate-log-decision decision-revise">v' + vh.version + '</span><span style="font-size:13px;flex:1">Revised at ' + vh.revisedAt + (vh.changedFields ? ' &mdash; ' + vh.changedFields.join(', ') : '') + '</span><span style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim)">' + vh.date + '</span></div>';
    });
    h += '</div>';
  }
  h += gateSection(1);
  return h;
}

function render_audience_map() {
  var h = toolHeader(2, 'Pre-production', 'Audience Map', 'Locate the actual communities and extract their language.');
  h += lineageBar(['Thesis (comp set)', 'Benchmark Pool'], ['Page Engine', 'Community Scaffold', 'Test Loop', 'Creator Match', 'Sentiment Radar']);

  h += '<div class="two-col">';
  h += '<div>' + panel('Channel Rankings', AUDIENCE_MAP.channels.map(function(ch){
    return '<div class="metric-row"><span class="metric-name">' + ch.name + ' <span style="font-size:10px;color:var(--text-dim)">(' + ch.type + ')</span></span><span><span style="font-family:var(--font-mono);font-size:11px">' + (ch.size>=1000?(ch.size/1000).toFixed(0)+'K':ch.size) + ' members</span> <span class="metric-value" style="color:' + (ch.fit>=85?'var(--teal)':'var(--amber)') + '">Fit: ' + ch.fit + '</span></span></div>';
  }).join('')) + '</div>';

  h += '<div>';
  h += panel('Primary Channels Selected', '<div style="font-family:var(--font-mono);font-size:13px;margin-bottom:0.5rem">' + AUDIENCE_MAP.primaryChannels.map(function(c){return '&#10003; ' + c;}).join('<br>') + '</div><div style="font-size:12px;color:var(--text-dim)">Maximum 2 primary channels &mdash; evidence-based.</div>');
  h += panel('Brand Check', '<table class="data-table"><tbody>' +
    Object.keys(AUDIENCE_MAP.brandCheck).map(function(k){return '<tr><td>' + k + '</td><td class="cell-highlight">' + AUDIENCE_MAP.brandCheck[k] + '</td></tr>';}).join('') +
    '</tbody></table>');
  h += '</div></div>';

  h += panel('Extracted Vocabulary', '<div style="margin-bottom:0.5rem;font-size:12px;color:var(--text-dim)">Consumed by Page Engine for copywriting.</div><div style="display:flex;flex-wrap:wrap;gap:8px">' +
    AUDIENCE_MAP.vocabulary.map(function(v){
      return '<div style="background:var(--bg);border:1px solid var(--border);padding:6px 12px;border-radius:6px"><span style="font-size:13px">' + v.phrase + '</span> <span style="font-family:var(--font-mono);font-size:10px;color:var(--gold)">&times;' + v.frequency + '</span></div>';
    }).join('') + '</div>');

  h += gateSection(2);
  return h;
}

function render_page_engine() {
  var h = toolHeader(3, 'First Playable', 'Page Engine', 'Build, audit, and optimize the Steam store page.');
  h += lineageBar(['Thesis', 'Audience Map', 'Benchmark Pool'], ['Signal Ledger', 'Test Loop', 'Window Planner', 'Launch Runbook']);

  h += statGrid([
    { value: PAGE_ENGINE.wishlistData.total.toLocaleString(), label: 'Cumulative Wishlists', color: 'gold' },
    { value: PAGE_ENGINE.wishlistData.velocity30Day + '/day', label: 'Wishlist Velocity (30-day)', sub: PAGE_ENGINE.wishlistData.velocityPercentile + 'th percentile', color: 'teal' },
    { value: PAGE_ENGINE.auditScore + '/100', label: 'Page Audit Score', sub: '3 items flagged', color: 'coral' },
    { value: '+12%', label: 'Velocity Trend', color: 'teal' },
  ]);

  // Continuous signal tracking (elevated from checklist)
  h += '<div class="panel"><div class="panel-title">Continuously Tracked Performance Signals</div>';
  h += actionRow(CAPSULE_TRACKING.currentCtr, 'Capsule CTR', benchmarkHint('', 'ctr'), '<strong>Capsule is converting above the genre median.</strong> Continue monitoring — if CTR dips below 3.2% (bottom quartile), reprioritize capsule testing.', 'teal');
  h += actionRow(CAPSULE_TRACKING.trailerRetention6s, 'Trailer 6-Second Retention', 'Indie genre range: 50–80%', '<strong>Trailer hook is strong.</strong> Viewers are staying past the first 6 seconds — well above the ' + CAPSULE_TRACKING.trailerRetentionComp + ' comp average. Your opening frames are working.', 'teal');
  h += actionRow(CAPSULE_TRACKING.trailerAvgWatch, 'Trailer Avg. Watch Time', '', '<strong>48 seconds avg. watch time</strong> on a 90-second trailer — 53% completion. Consider tightening to 60 seconds to land the hook before the drop-off point.', 'gold');
  h += '<div style="font-size:10px;color:var(--text-dim);margin-top:0.5rem">These signals update continuously from Stage 3 through launch. The one-time structural checklist (below) validates fundamentals at page creation time.</div></div>';

  // Creative Version History (versioned, scored asset)
  h += '<div class="panel"><div class="panel-title">Creative Version History <span class="card-badge active">versioned</span></div>';
  h += '<table class="data-table"><thead><tr><th>Version</th><th>Type</th><th>Live</th><th>Description</th><th>CTR</th><th>CTR &Delta;</th><th>Trailer 6s</th><th>Trailer &Delta;</th></tr></thead><tbody>';
  CREATIVE_VERSIONS.forEach(function(cv) {
    var ctrDeltaCls = cv.ctrDelta === 'baseline' ? 'creative-delta-baseline' : (String(cv.ctrDelta).charAt(0) === '+' ? 'creative-delta-up' : 'creative-delta-down');
    var trlDeltaCls = cv.trailerDelta === 'baseline' ? 'creative-delta-baseline' : (String(cv.trailerDelta).charAt(0) === '+' ? 'creative-delta-up' : 'creative-delta-down');
    h += '<tr>';
    h += '<td class="cell-highlight">' + cv.versionId + '</td>';
    h += '<td>' + cv.assetType + '</td>';
    h += '<td style="font-family:var(--font-mono);font-size:11px">' + cv.dateLive + '</td>';
    h += '<td style="font-size:12px">' + cv.description + '</td>';
    h += '<td>' + (cv.ctr !== null ? cv.ctr + '%' : '&mdash;') + '</td>';
    h += '<td class="' + ctrDeltaCls + '">' + (cv.ctrDelta || '&mdash;') + '</td>';
    h += '<td>' + (cv.trailerRetention !== null ? cv.trailerRetention + '%' : '&mdash;') + '</td>';
    h += '<td class="' + trlDeltaCls + '">' + (cv.trailerDelta || '&mdash;') + '</td>';
    h += '</tr>';
  });
  h += '</tbody></table>';
  h += '<div style="font-size:10px;color:var(--text-dim);margin-top:0.5rem;font-style:italic">Feasibility note: CTR is partner-portal CSV (studio-submitted); trailer analytics read cleaner from the YouTube upload than Steam &mdash; both studio-submitted metrics, same bucket as wishlist conversion.</div></div>';

  h += '<div class="two-col">';
  // One-time structural checklist (demoted)
  h += '<div>' + panel('Structural Audit (one-time check)', '<ul class="checklist">' + PAGE_ENGINE.auditItems.map(function(item){
    return '<li><span class="check-icon check-' + item.status + '">' + (item.status==='pass'?'&#10003;':item.status==='fail'?'&#10007;':'!') + '</span><div><span class="check-text">' + item.item + '</span><span class="check-action">' + item.action + '</span></div></li>';
  }).join('') + '</ul>') + '</div>';

  h += '<div>' + panel('Wishlist Performance', '<div class="metric-row"><span class="metric-name">Daily Average (30-day)</span><span class="metric-value">' + PAGE_ENGINE.wishlistData.dailyAvg + '/day</span></div><div class="metric-row"><span class="metric-name">Week-over-Week</span><span class="metric-value" style="color:var(--teal)">' + PAGE_ENGINE.wishlistData.trend + '</span></div><div class="metric-row"><span class="metric-name">Percentile vs. Cohort</span><span class="metric-value" style="color:var(--teal)">' + PAGE_ENGINE.wishlistData.velocityPercentile + 'th</span></div>') +
    panel('UTM Attribution', '<table class="data-table"><thead><tr><th>Source</th><th>Clicks</th></tr></thead><tbody>' +
    PAGE_ENGINE.utmLinks.map(function(u){return '<tr><td>' + u.source + '</td><td class="cell-highlight">' + u.clicks + '</td></tr>';}).join('') + '</tbody></table>') + '</div></div>';

  h += gateSection(3);
  return h;
}

function render_community_scaffold() {
  var h = toolHeader(3, 'First Playable', 'Community Scaffold', 'An owned audience is immune to algorithm changes.');
  h += lineageBar(['Audience Map'], ['Playtest Pipeline', 'Sentiment Radar', 'Launch Runbook']);

  h += '<div class="two-col"><div>';
  h += panel('Discord Server', statGrid([
    { value: COMMUNITY_SCAFFOLD.discord.members, label: 'Total Members', color: 'gold' },
    { value: COMMUNITY_SCAFFOLD.discord.activeWeekly, label: 'Active Weekly', color: 'teal' },
  ]) + '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);margin-bottom:0.5rem">CHANNELS</div>' +
    COMMUNITY_SCAFFOLD.discord.channels.map(function(c){return '<span style="display:inline-block;background:var(--bg);border:1px solid var(--border);padding:3px 8px;border-radius:3px;font-size:11px;margin:2px">#' + c + '</span>';}).join(' ') +
    '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);margin-top:0.75rem;margin-bottom:0.5rem">ROLES</div>' +
    COMMUNITY_SCAFFOLD.discord.roles.map(function(r){return '<div style="font-size:12px;margin:2px 0">' + r + '</div>';}).join(''));
  h += '</div><div>';
  h += panel('Structured Feedback (v1 &mdash; /feedback)', '<div class="feedback-form"><div style="margin-bottom:0.5rem"><select><option>Category</option>' + COMMUNITY_SCAFFOLD.discord.feedbackForm.categories.map(function(c){return '<option>' + c + '</option>';}).join('') + '</select></div><textarea placeholder="Describe your feedback..."></textarea><button class="btn btn-primary btn-sm" style="margin-top:0.5rem">Submit to Ledger</button></div><div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-top:0.5rem">All feedback writes structured signal to the Signal Ledger.</div>');
  h += panel('Recent Feedback', COMMUNITY_SCAFFOLD.discord.feedbackForm.recent.map(function(fb){
    return '<div class="metric-row"><span class="metric-name"><span class="stage-badge" style="font-size:8px;background:var(--bg);border:1px solid var(--border);padding:1px 6px">' + fb.category + '</span> ' + fb.text + '</span><span style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim)">' + fb.user + ' &middot; ' + fb.time + '</span></div>';
  }).join(''));
  h += '</div></div>';

  // Ambient footprint (S3+)
  if (STATE.currentStage >= 3) {
    h += renderAmbientFootprint();
  }

  h += gateSection(3);
  return h;
}

function render_test_loop() {
  var h = toolHeader(4, 'Pre-Alpha', 'Test Loop', 'A/B test capsule art, copy, and positioning against wishlist velocity.');
  h += lineageBar(['Page Engine', 'Audience Map', 'Benchmark Pool'], ['Signal Ledger', 'Creator Match', 'Demo Command']);

  // Capsule/Copy testing (existing)
  h += '<div class="two-col"><div>' + panel('Capsule Variants', '<div style="font-size:13px;color:var(--text-dim)">Control Capsule: ' + TEST_LOOP.control.capsule + '</div><div style="font-size:13px;color:var(--text-dim);margin-top:4px">Control Copy: "' + TEST_LOOP.control.copy + '"</div><div style="margin-top:0.75rem"><span class="stat-val teal" style="font-size:1.2rem">' + TEST_LOOP.control.conversionRate + '%</span> <span class="stat-lbl">Conversion Rate</span></div>');

  h += '<div>';
  TEST_LOOP.variants.forEach(function(v){
    h += '<div class="panel" style="' + (v.winner?'border-color:var(--teal)':'') + '"><div class="panel-title">Variant ' + v.id + (v.winner?' <span class="card-badge success">WINNER</span>':'') + '</div><div style="font-size:13px;color:var(--text-dim)">Capsule: ' + v.capsule + '</div><div style="font-size:13px;color:var(--text-dim);margin-top:4px">Copy: "' + v.copy + '"</div><div style="margin-top:0.75rem"><span class="stat-val teal" style="font-size:1.2rem">' + v.conversionRate + '%</span> <span class="metric-delta up">' + v.lift + '</span></div></div>';
  });
  h += '</div></div>';

  // Positioning variants (NEW)
  h += '<div class="panel" style="margin-top:1rem"><div class="panel-title">Positioning Statement Variants <span class="card-badge active">new</span></div>';
  h += '<p style="font-size:13px;color:var(--text-muted);margin-bottom:1rem">Positioning framings test the game\'s market narrative — who this game is for and why — measured on wishlist velocity lift. Distinct from page copy testing which tests wording, not framing.</p>';
  POSITIONING_VARIANTS.forEach(function(pos) {
    var cls = pos.isControl ? 'selected' : '';
    h += '<div class="positioning-card">';
    h += '<div class="pos-label">Positioning ' + pos.id + (pos.isControl ? ' (Control)' : '') + '</div>';
    h += '<div class="pos-framing">' + pos.framing + '</div>';
    h += '<div class="pos-lift" style="color:' + (pos.isControl ? 'var(--text-dim)' : 'var(--teal)') + '">Wishlist Velocity Lift: ' + pos.conversionLift + '</div>';
    h += '</div>';
  });
  h += '</div>';

  h += '<div class="panel"><div class="panel-title">Lift Context</div><div class="metric-row"><span class="metric-name">Genre Average Lift</span><span class="metric-value">' + TEST_LOOP.liftNorm.genreAvg + '</span></div><div class="metric-row"><span class="metric-name">Top-Quartile Lift</span><span class="metric-value">' + TEST_LOOP.liftNorm.topQuartile + '</span></div><div class="metric-row"><span class="metric-name">Your Best Variant (copy)</span><span class="metric-value" style="color:var(--teal)">+23% &mdash; above top quartile</span></div><div class="metric-row"><span class="metric-name">Your Best Variant (positioning)</span><span class="metric-value" style="color:var(--teal)">+12% &mdash; above median</span></div></div>';
  h += gateSection(4);
  return h;
}

function render_festival_radar() {
  var h = toolHeader(4, 'Pre-Alpha', 'Festival Radar', 'Submission deadlines run months ahead. Don\'t miss them.');
  h += lineageBar(['Benchmark Pool'], ['Demo Command', 'Long Tail Engine']);

  h += '<div class="two-col">';
  h += panel('Upcoming Festivals', '<table class="data-table"><thead><tr><th>Festival</th><th>Deadline</th><th>Status</th><th>Est. Lift</th></tr></thead><tbody>' +
    FESTIVAL_RADAR.upcoming.map(function(f){
      return '<tr><td class="cell-highlight">' + f.name + '</td><td>' + f.deadline + '</td><td><span class="card-badge ' + (f.status==='accepted'?'success':f.status==='submitted'?'active':'') + '">' + f.status.toUpperCase() + '</span></td><td>' + f.liftAvg + '</td></tr>';
    }).join('') + '</tbody></table>');
  h += panel('Past Festivals', FESTIVAL_RADAR.past.map(function(f){
    return '<div class="metric-row"><span class="metric-name">' + f.name + '</span><span class="metric-value">+' + f.lift + ' wishlists</span></div>';
  }).join(''));
  h += '</div>';

  h += gateSection(4);
  return h;
}

function render_playtest_pipeline() {
  var h = toolHeader(4, 'Pre-Alpha', 'Playtest Pipeline', 'Surface the gap between intended and experienced game.');
  h += lineageBar(['Community Scaffold'], ['Creator Match', 'Demo Command']);

  h += '<div class="two-col">';
  h += panel('Test Sessions', PLAYTEST_PIPELINE.sessions.map(function(s){
    return '<div class="metric-row"><span class="metric-name">Session ' + s.id + '</span><span>' + s.date + ' &middot; ' + s.players + ' players &middot; ' + s.duration + '</span></div><div style="font-size:11px;color:var(--text-dim);margin:-4px 0 8px">Focus: ' + s.focus + '</div>';
  }).join(''));
  h += panel('Demo Scope', '<div style="font-family:var(--font-mono);font-size:10px;color:var(--teal);margin-bottom:4px">INCLUDE</div>' +
    PLAYTEST_PIPELINE.demoScope.include.map(function(i){return '<div style="font-size:13px;margin-bottom:2px">&#10003; ' + i + '</div>';}).join('') +
    '<div style="font-family:var(--font-mono);font-size:10px;color:var(--coral);margin-top:10px;margin-bottom:4px">CUT</div>' +
    PLAYTEST_PIPELINE.demoScope.cut.map(function(c){return '<div style="font-size:13px;margin-bottom:2px">&#10007; ' + c + '</div>';}).join(''));
  h += '</div>';

  h += panel('Key Findings', PLAYTEST_PIPELINE.findings.map(function(f){
    return '<div class="metric-row"><span class="metric-name" style="color:' + (f.sentiment==='positive'?'var(--teal)':f.sentiment==='negative'?'var(--coral)':'var(--text-dim)') + '">' + f.insight + '</span><span class="metric-value">' + f.frequency + '</span></div>';
  }).join(''));
  h += gateSection(4);
  return h;
}

function render_creator_match() {
  var h = toolHeader(5, 'Closed Beta', 'Creator Match', 'Score creators on audience overlap. Research automates; the send stays human.');
  h += lineageBar(['Audience Map', 'Benchmark Pool'], ['Festival Radar', 'Launch Runbook', 'Long Tail Engine']);

  h += statGrid([
    { value: CREATOR_MATCH.coverageResponseRate + '%', label: 'Coverage Response Rate', sub: '82nd percentile', color: 'gold' },
    { value: '+' + CREATOR_MATCH.avgLiftPerEvent, label: 'Avg. Wishlist Lift/Event', color: 'teal' },
    { value: '56', label: 'Total Targets Researched', color: 'purple' },
  ]);

  h += panel('Creator Rankings', '<table class="data-table"><thead><tr><th>Creator</th><th>Platform</th><th>Reach</th><th>Overlap</th><th>Status</th></tr></thead><tbody>' +
    CREATOR_MATCH.creators.map(function(cr){
      return '<tr><td class="cell-highlight">' + cr.name + '</td><td>' + cr.platform + '</td><td>' + (cr.subs ? (cr.subs/1000).toFixed(0)+'K subs' : cr.reach) + '</td><td><div class="score-bar-bg" style="width:60px;display:inline-block;vertical-align:middle;margin-right:6px"><div class="score-bar-fill" style="width:' + cr.overlapScore + '%;background:' + (cr.overlapScore>=85?'var(--teal)':'var(--gold)') + '"></div></div>' + cr.overlapScore + '</td><td><span class="card-badge ' + (cr.response==='interested'?'success':cr.response==='pending'?'active':'') + '">' + cr.status.toUpperCase() + (cr.response?' &middot; '+cr.response:'') + '</span></td></tr>';
    }).join('') + '</tbody></table>');
  h += '<div style="font-size:12px;color:var(--text-dim);margin-top:0.75rem">Trust does not automate. Outreach stays human-sent.</div>';
  h += gateSection(5);
  return h;
}

function render_sentiment_radar() {
  var h = toolHeader(5, 'Closed Beta', 'Sentiment Radar', 'Track what strangers think, not just your community.');
  h += lineageBar(['Audience Map', 'Playtest Pipeline'], ['Launch Runbook', 'Sequel Signal']);

  h += statGrid([
    { value: SENTIMENT_RADAR.currentIndex + '/100', label: 'Current Sentiment', sub: 'Comp avg: ' + SENTIMENT_RADAR.baseline.comps, color: 'gold' },
    { value: SENTIMENT_RADAR.baseline.ownCommunity + '/100', label: 'Owned Community', color: 'teal' },
    { value: SENTIMENT_RADAR.baseline.comps + '/100', label: 'Comp Baseline', color: 'purple' },
  ]);

  // Decay alarm (NEW)
  if (SENTIMENT_EXTENDED.decayAlarm.active) {
    h += '<div class="decay-alarm"><span class="alarm-icon">&#9888;</span><div><strong>Sentiment Decay Alert:</strong> Recent sentiment (' + SENTIMENT_EXTENDED.decayAlarm.recentWindow + '/100) trending below all-time average (' + SENTIMENT_EXTENDED.decayAlarm.allTime + '/100). Divergence: ' + SENTIMENT_EXTENDED.decayAlarm.divergence + ' points. <br>' + SENTIMENT_EXTENDED.decayAlarm.message + '</div></div>';
  }

  h += '<div class="two-col">';
  h += panel('Sentiment Timeline', SENTIMENT_RADAR.timeline.map(function(t){
    return '<div class="metric-row"><span class="metric-name">' + t.week + (t.event?' <span style="color:var(--gold);font-size:10px;margin-left:8px">' + t.event + '</span>':'') + '</span><span class="metric-value">' + t.index + '/100</span></div>';
  }).join(''));

  h += panel('Theme Analysis', SENTIMENT_RADAR.themes.map(function(th){
    return '<div class="metric-row"><span class="metric-name">' + th.theme + '</span><span><span style="color:' + (th.sentiment==='positive'?'var(--teal)':th.sentiment==='negative'?'var(--coral)':'var(--amber)') + '">' + th.sentiment + '</span> <span class="metric-value">' + th.mentions + '</span></span></div>';
  }).join(''));
  h += '</div>';

  // Player vocabulary / copy-mining panel (NEW)
  h += '<div class="panel" style="margin-top:1rem"><div class="panel-title">Player Vocabulary <span class="card-badge active">copy-mining</span></div>';
  h += '<p style="font-size:12px;color:var(--text-dim);margin-bottom:0.75rem">Frequent phrases from community + reviews. Flagged terms feed into Page Engine and Test Loop copy variants. Reusable as marketing language.</p>';
  h += '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:0.75rem">';
  SENTIMENT_EXTENDED.playerVocabulary.forEach(function(v){
    var sc = v.sentiment === 'positive' ? 'var(--teal)' : v.sentiment === 'negative' ? 'var(--coral)' : 'var(--text-dim)';
    h += '<span class="vocab-pill" style="border-color:' + sc + '">' + v.phrase + '<span class="freq" style="color:' + sc + '"> &times;' + v.freq + '</span><span style="font-size:8px;color:var(--text-dim);margin-left:4px">' + v.source + '</span></span>';
  });
  h += '</div>';
  h += '<div style="font-size:10px;color:var(--text-dim)">This vocabulary panel is the same data source consumed by Page Engine copy and Test Loop copy-testing screens.</div></div>';

  h += gateSection(5);
  return h;
}

function render_demo_command() {
  var h = toolHeader(6, 'Open Beta/EA', 'Demo Command', 'Demo conversion is the closest thing to ground truth pre-launch.');
  h += lineageBar(['Playtest Pipeline', 'Festival Radar', 'Benchmark Pool'], ['Gate S6', 'Window Planner', 'Launch Runbook', 'Benchmark Pool']);

  h += statGrid([
    { value: benchmarkHint(DEMO_COMMAND.conversionRate + '%', 'demoConversion'), label: 'Demo Conversion', sub: DEMO_COMMAND.conversionPercentile + 'th percentile', color: 'gold' },
    { value: DEMO_COMMAND.totalPlayers.toLocaleString(), label: 'Total Demo Players', color: 'teal' },
    { value: DEMO_COMMAND.wishlisted.toLocaleString(), label: 'Wishlisted After Demo', color: 'purple' },
    { value: '+' + DEMO_COMMAND.nextFest.wishlists.toLocaleString(), label: 'Next Fest Wishlists', sub: DEMO_COMMAND.nextFest.rank, color: 'coral' },
  ]);

  h += '<div class="panel"><div class="panel-title">Conversion Diagnostic</div>';
  h += actionRow(DEMO_COMMAND.conversionRate + '%', 'Demo Conversion Rate', 'Genre range: 6–16%', '<strong>Your demo is converting in the 87th percentile.</strong> The hook is landing within the first 20 minutes. The demo scope decisions made at Stage 4 were correct. This is the single strongest signal the system has before launch &mdash; it feeds the gate decision, price lock, and Phase 2 underwriting.', 'teal');
  h += '</div>';

  h += panel('Conversion Time Series', '<table class="data-table"><thead><tr><th>Period</th><th>Players</th><th>Conversions</th><th>Rate</th></tr></thead><tbody>' +
    DEMO_COMMAND.timeSeries.map(function(d){
      return '<tr><td>' + d.day + '</td><td>' + d.players + '</td><td class="cell-highlight">' + d.conversions + '</td><td class="cell-highlight">' + d.rate + '%</td></tr>';
    }).join('') + '</tbody></table>');
  h += gateSection(6);
  return h;
}

function render_window_planner() {
  var h = toolHeader(6, 'Open Beta/EA', 'Window Planner', 'Pick a launch date against congestion data. Price is the least reversible decision.');
  h += lineageBar(['Thesis', 'Demo Command', 'Page Engine'], ['Gate S6', 'Launch Runbook', 'Long Tail Engine']);

  h += '<div class="alert alert-success"><span class="alert-icon">&#10003;</span><div><strong>Recommended: ' + WINDOW_PLANNER.recommendedWeek + '</strong><br>' + WINDOW_PLANNER.rationale + '</div></div>';

  h += panel('Congestion Analysis', '<table class="data-table"><thead><tr><th>Week</th><th>Conflicts</th><th>Comp Overlap</th><th>Status</th></tr></thead><tbody>' +
    WINDOW_PLANNER.congestionTable.map(function(w){
      return '<tr><td>' + w.week + '</td><td>' + w.conflicts + '</td><td>' + w.compOverlap + '</td><td><span class="card-badge ' + (w.status==='RECOMMENDED'?'success':w.status==='AVOID'?'warning':w.status==='CAUTION'?'active':'') + '">' + w.status + '</span></td></tr>';
    }).join('') + '</tbody></table>');

  h += '<div class="panel" style="border-color:var(--teal);background:var(--teal-dim)"><div class="panel-title">Price Lock <span class="card-badge success">LOCKED</span></div><div class="stat-val teal" style="font-size:2rem">$' + WINDOW_PLANNER.priceLock.price.toFixed(2) + '</div><div style="font-size:13px;color:var(--text-muted);margin-bottom:0.5rem">Comps: ' + WINDOW_PLANNER.priceLock.comps.join(', ') + '</div><div style="font-size:12px;color:var(--text-dim)">' + WINDOW_PLANNER.priceLock.rationale + '</div></div>';

  // Wishlist geography → price-lock connection (NEW)
  h += '<div class="panel" style="margin-top:1rem"><div class="panel-title">Wishlist Geography &rarr; Price Input <span class="card-badge active">pricing signal</span></div>';
  h += '<p style="font-size:13px;color:var(--text-muted);margin-bottom:0.75rem">Geographic wishlist breakdown directly informs the pricing recommendation. Regions with high wishlist share but low conversion-to-price expectations signal pricing headroom or risk.</p>';
  h += '<table class="data-table"><thead><tr><th>Region</th><th>Wishlist Share</th><th>Avg. Price Paid</th><th>Conv. Rate</th><th>Signal</th></tr></thead><tbody>';
  WISHLIST_GEOGRAPHY.breakdown.forEach(function(geo){
    var sig = geo.conversionRate >= 8 ? '<span style="color:var(--teal)">Strong</span>' : geo.conversionRate >= 5 ? '<span style="color:var(--amber)">Moderate</span>' : '<span style="color:var(--coral)">Weak</span>';
    h += '<tr><td>' + geo.region + '</td><td class="cell-highlight">' + geo.share + '%</td><td>$' + geo.avgPricePaid.toFixed(2) + '</td><td>' + geo.conversionRate + '%</td><td>' + sig + '</td></tr>';
  });
  h += '</tbody></table>';
  h += '<div style="margin-top:0.75rem">';
  h += actionRow(WISHLIST_GEOGRAPHY.wishlistToSaleBenchmark, 'Wishlist-to-Sale Benchmark', 'Survival-crafting range: 5–14%', '<strong>At ~0.15x wishlist-to-first-week-sales,</strong> your wishlist base of 24,800 translates to ~3,700 first-week units. This is the single most important multiplier for launch-week revenue modeling. <strong>Wishlist churn is at 4.2%</strong> — within normal range (2–6% for genre). No resonance alarm triggered.', 'gold');
  h += '<div class="family-note" style="margin-top:0.5rem">Note: <strong>Wishlist Velocity</strong> (reach &mdash; raw accumulation rate) and <strong>Wishlist-to-Sale Rate</strong> (resonance &mdash; what actually converts) are the same metric family on opposite halves of the quadrant. Track both: high velocity with low conversion is a resonance warning, not a launch signal.</div>';
  h += '</div></div>';
  h += gateSection(6);
  return h;
}

function render_launch_runbook() {
  var h = toolHeader(7, 'Launch', 'Launch Runbook', 'Sequenced launch checklist with continuous anomaly monitoring.');
  h += lineageBar(['Every upstream tool'], ['Long Tail Engine', 'Sequel Signal', 'Benchmark Pool']);

  h += statGrid([
    { value: '$' + LAUNCH_RUNBOOK.funnel.revenue.toLocaleString(), label: 'Revenue (Day 1)', sub: LAUNCH_RUNBOOK.funnel.unitsSold.toLocaleString() + ' units', color: 'gold' },
    { value: LAUNCH_RUNBOOK.funnel.ccu.peak.toLocaleString(), label: 'Peak CCU', sub: 'Current: ' + LAUNCH_RUNBOOK.funnel.ccu.current, color: 'teal' },
    { value: LAUNCH_RUNBOOK.funnel.refundRate, label: 'Refund Rate', color: 'coral' },
    { value: LAUNCH_RUNBOOK.funnel.wishlistsConverted.toLocaleString(), label: 'Wishlists Converted', color: 'purple' },
  ]);

  LAUNCH_RUNBOOK.alerts.forEach(function(a){
    h += '<div class="alert alert-' + a.severity + '"><span class="alert-icon">' + (a.severity==='warn'?'&#9888;':'&#8505;') + '</span><div><strong>' + a.time + '</strong>: ' + a.message + '<span class="alert-action">Action: ' + a.action + '</span></div></div>';
  });

  h += '<div class="two-col">';
  h += panel('Launch Checklist', '<ul class="checklist">' + LAUNCH_RUNBOOK.checklist.map(function(ch){
    return '<li><span class="check-icon ' + (ch.status==='done'?'check-pass':ch.status==='in-progress'?'check-fix':'') + '">' + (ch.status==='done'?'&#10003;':ch.status==='in-progress'?'&#9678;':'&#9675;') + '</span><div><span class="check-text">' + ch.time + ' &mdash; ' + ch.task + '</span><span class="check-action">' + ch.status.toUpperCase() + '</span></div></li>';
  }).join('') + '</ul>');
  h += panel('Funnel Snapshot', '<div class="metric-row"><span class="metric-name">Store Impressions</span><span class="metric-value">' + LAUNCH_RUNBOOK.funnel.impressions.toLocaleString() + '</span></div><div class="metric-row"><span class="metric-name">Page Visits</span><span class="metric-value">' + LAUNCH_RUNBOOK.funnel.pageVisits.toLocaleString() + '</span></div><div class="metric-row"><span class="metric-name">Units Sold</span><span class="metric-value" style="color:var(--gold)">' + LAUNCH_RUNBOOK.funnel.unitsSold.toLocaleString() + '</span></div><div class="metric-row"><span class="metric-name">Revenue</span><span class="metric-value" style="color:var(--teal)">$' + LAUNCH_RUNBOOK.funnel.revenue.toLocaleString() + '</span></div>');
  h += '</div>';

  h += '<div class="gate-banner" style="margin-top:1.5rem"><div class="gate-banner-icon" style="background:var(--blue-dim);color:var(--blue)">&#9881;</div><div class="gate-banner-body"><div class="gate-banner-title">Stage 7 &mdash; Operational Checkpoint</div><p class="gate-banner-question">No strategic gate. Continuous anomaly monitoring via daily + proxy signals.</p></div></div>';

  // Expectation-Delivery Gap (NEW)
  var gapCls = EXPECTATION_GAP.gapVerdict === 'wide' ? 'wide' : 'tight';
  var gapColor = EXPECTATION_GAP.gapVerdict === 'wide' ? 'var(--coral)' : 'var(--teal)';
  h += '<div class="panel" style="margin-top:1.5rem"><div class="panel-title">Expectation-Delivery Gap <span class="card-badge ' + (EXPECTATION_GAP.gapVerdict === 'wide' ? 'warning' : 'success') + '">' + (EXPECTATION_GAP.gapVerdict === 'wide' ? 'WIDE' : 'TIGHT') + '</span></div>';
  h += '<div class="gap-indicator ' + gapCls + '"><div class="gap-num" style="color:' + gapColor + '">' + EXPECTATION_GAP.refundRate + '</div><div><strong>Refund Rate</strong> vs. genre norm of ' + EXPECTATION_GAP.refundRateComp + '<br><span style="font-size:12px;color:var(--text-dim)">Review mismatch phrases: ' + EXPECTATION_GAP.mismatchPhrases + ' flagged</span></div></div>';
  h += '<div class="metric-row"><span class="metric-name">Pre-Launch Sentiment</span><span class="metric-value" style="color:var(--teal)">' + EXPECTATION_GAP.preLaunchSentiment + '/100</span></div>';
  h += '<div class="metric-row"><span class="metric-name">Post-Launch Sentiment</span><span class="metric-value" style="color:var(--coral)">' + EXPECTATION_GAP.postLaunchSentiment + '/100 <span class="metric-delta down">' + EXPECTATION_GAP.sentimentShift + ' pts</span></span></div>';
  h += '<div class="metric-row"><span class="metric-name">Top Mismatch Terms</span><span style="font-size:11px;color:var(--coral)">' + EXPECTATION_GAP.topMismatchTerms.join(', ') + '</span></div>';
  h += actionRow(EXPECTATION_GAP.sentimentShift + ' pts', 'Sentiment Divergence', '', '<strong>' + EXPECTATION_GAP.recommendation + '</strong>', 'coral');
  h += '<div style="font-size:10px;color:var(--text-dim);margin-top:0.5rem">This gap metric feeds directly into the Stage 8 Sequel Signal as a DLC/sequel scope input.</div></div>';
  return h;
}

function render_long_tail_engine() {
  var h = toolHeader(8, 'Post-Launch', 'Long Tail Engine', 'Nearly pure margin &mdash; every point of lift comes from decisions, not development.');
  h += lineageBar(['Launch Runbook', 'Window Planner', 'Benchmark Pool'], ['Sequel Signal', 'Benchmark Pool']);

  h += statGrid([
    { value: '$387K', label: 'First-Year Revenue (net)', sub: '91st percentile', color: 'gold' },
    { value: LONG_TAIL.decayCurve.actual + '%', label: 'Tail Retention', sub: 'Comp avg: ' + LONG_TAIL.decayCurve.compAvg + '%', color: 'teal' },
    { value: '$112K', label: 'Projected Tail Revenue', sub: 'Months 13-24', color: 'purple' },
  ]);

  h += '<div class="two-col"><div>';
  h += panel('Revenue by Quarter', LONG_TAIL.revenueByQuarter.map(function(q){
    return '<div class="metric-row"><span class="metric-name">' + q.q + (q.events.length?' <span style="font-size:9px;color:var(--gold)">' + q.events.join(', ') + '</span>':'') + '</span><span class="metric-value">$' + (q.revenue/1000).toFixed(1) + 'K</span></div>';
  }).join(''));
  h += panel('Discount Ladder', LONG_TAIL.discountLadder.map(function(d){
    return '<div class="metric-row"><span class="metric-name">' + d.depth + ' Discount</span><span><span class="metric-value">' + d.revenueLift + '</span><span class="metric-delta" style="font-size:10px;color:var(--text-dim)">comp avg ' + d.compAvg + '</span></span></div>';
  }).join(''));
  h += '</div><div>';
  h += panel('Update-Beat Planner', '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-bottom:0.5rem">Sequence: PATCH &rarr; ANNOUNCEMENT &rarr; VISIBILITY ROUND</div><div class="metric-row"><span class="metric-name">Bioluminescence Update (Q3) &rarr; +$8K</span></div><div class="metric-row"><span class="metric-name">Deep Trench DLC (Q5) &rarr; +$12K</span></div><div class="metric-row"><span class="metric-name">Co-op Update (Q7) &rarr; +$15K</span></div>');
  h += panel('Localization ROI', '<table class="data-table"><thead><tr><th>Market</th><th>Wishlists</th><th>Localized</th><th>Est. Revenue</th></tr></thead><tbody>' +
    LONG_TAIL.localizationROI.map(function(l){
      return '<tr><td>' + l.market + '</td><td>' + l.wishlistsShare + '</td><td>' + (l.localized?'<span class="card-badge success">YES</span>':'<span class="card-badge warning">NO</span>') + '</td><td class="cell-highlight">$' + (l.revenue||l.estRevenue).toLocaleString() + '</td></tr>';
    }).join('') + '</tbody></table>');
  h += '</div></div>';
  h += gateSection(8);
  return h;
}

function render_sequel_signal() {
  var h = toolHeader(8, 'Post-Launch', 'Sequel Signal', 'DLC, sequel, port, or pivot? Closes the loop back into Stage 1.');
  h += lineageBar(['Full Signal Ledger', 'Sentiment Radar', 'Benchmark Pool'], ['Next game Thesis (Stage 1)']);

  // Expectation-Delivery Gap feeds into decision
  h += '<div class="panel"><div class="panel-title">Expectation-Delivery Gap &rarr; Sequel Scope Input</div>';
  h += '<div class="metric-row"><span class="metric-name">Refund Rate vs. Norm</span><span class="metric-value" style="color:var(--coral)">' + EXPECTATION_GAP.refundRate + ' (norm: ' + EXPECTATION_GAP.refundRateComp + ')</span></div>';
  h += '<div class="metric-row"><span class="metric-name">Sentiment Shift (pre→post)</span><span class="metric-value" style="color:var(--coral)">' + EXPECTATION_GAP.sentimentShift + ' pts</span></div>';
  h += '<div class="metric-row"><span class="metric-name">Verdict</span><span><strong style="color:' + (EXPECTATION_GAP.gapVerdict==='wide'?'var(--coral)':'var(--teal)') + '">' + (EXPECTATION_GAP.gapVerdict==='wide'?'WIDE GAP — fix positioning before sequel':'TIGHT GAP — audience got what they expected') + '</strong></span></div>';
  h += '<div style="font-size:11px;color:var(--text-dim);margin-top:0.5rem">A wide gap favors DLC (fixable scope) over sequel (inherits the gap). A tight gap strengthens the sequel case with validated audience expectation alignment.</div></div>';

  h += '<div class="alert alert-success"><span class="alert-icon">&#10003;</span><div><strong>Recommendation: DLC</strong> &mdash; Strong franchise appetite (82/100), 60% margin vs. full sequel risk.</div></div>';

  h += '<div class="scenario-cards">';
  SEQUEL_SIGNAL.paths.forEach(function(p){
    var cls = SEQUEL_SIGNAL.recommendation === p.path ? ' selected' : '';
    var barColor = p.score < 50 ? 'var(--coral)' : p.score < 70 ? 'var(--amber)' : 'var(--teal)';
    h += '<div class="scenario-card' + cls + '"><div class="scenario-label">' + p.path + '</div><div class="scenario-score">' + p.score + '</div><div class="progress-bar" style="margin-bottom:0.75rem"><div class="progress-fill" style="width:' + p.score + '%;background:' + barColor + '"></div></div><div class="scenario-detail">' + p.evidence.map(function(e){return '&#8226; ' + e;}).join('<br>') + '</div></div>';
  });
  h += '</div>';

  h += '<div class="panel" style="margin-top:1.5rem"><div class="panel-title">Drafted Next-Game Thesis <span class="card-badge active">auto-generated</span></div>';
  h += '<div style="font-size:14px;line-height:1.6;color:var(--text-muted);margin-bottom:1rem"><strong>Audience:</strong> ' + SEQUEL_SIGNAL.nextThesisDraft.audience + '</div>';
  h += '<div style="font-size:14px;line-height:1.6;color:var(--text-muted);margin-bottom:1rem"><strong>Hook:</strong> ' + SEQUEL_SIGNAL.nextThesisDraft.hook + '</div>';
  h += '<div style="font-size:14px;line-height:1.6;color:var(--text-muted)"><strong>Price:</strong> ' + SEQUEL_SIGNAL.nextThesisDraft.price + '</div>';
  h += '<div style="margin-top:1rem"><button class="btn btn-primary" onclick="alert(\'New game project created: Echoes of the Abyss: Deep Trench\')">Create New Game from This Thesis</button></div></div>';
  h += gateSection(8);
  return h;
}

// ===== SHARED OBJECT VIEWS =====

function render_thesis_view() {
  return '<div class="tool-header"><div class="tool-breadcrumb">Shared Objects &rarr; <span>Publishing Thesis</span></div><h1 class="tool-title">Publishing Thesis</h1></div>' + render_thesis_builder();
}

function render_ledger_view() {
  var h = '<div class="tool-header"><div class="tool-breadcrumb">Shared Objects &rarr; <span>Signal Ledger</span></div><h1 class="tool-title">Signal Ledger &amp; Momentum Score</h1><p class="tool-subtitle">Every metric from every tool, normalized against stage-and-genre benchmarks.</p></div>';

  h += statGrid([
    { value: (MOMENTUM_HISTORY[STATE.currentStage - 1] || {}).score || '&mdash;', label: 'Current Momentum Score', color: 'gold' },
    { value: GAMES_ACTIVE, label: 'Active Signals', color: 'teal' },
    { value: POOL_SUMMARY.totalGames.toLocaleString(), label: 'Games in Benchmark Pool', color: 'purple' },
  ]);

  var signals = [
    { name: 'Publishing Thesis', born: 'S1', updates: 'S1-S7', consumed: 'All tools', dest: '&mdash;' },
    { name: 'Market Norms', born: 'Pool', updates: 'Continuous', consumed: '10 tools', dest: 'Pool' },
    { name: 'Audience Vocabulary', born: 'S2', updates: '&mdash;', consumed: '5 tools', dest: '&mdash;' },
    { name: 'Wishlist Velocity', born: 'S3', updates: 'S4-S6', consumed: 'S7-S8', dest: 'Pool' },
    { name: 'Page Conversion/CTR', born: 'S3', updates: 'S4', consumed: 'S6-S7', dest: 'Pool' },
    { name: 'Community Health', born: 'S3', updates: 'S4-S5', consumed: 'S6-S8', dest: '&mdash;' },
    { name: 'Playtest Findings', born: 'S4', updates: '&mdash;', consumed: 'S5-S6', dest: '&mdash;' },
    { name: 'Test Lift / Message', born: 'S4', updates: '&mdash;', consumed: 'S5-S7', dest: 'Pool' },
    { name: 'Festival Lift', born: 'S4', updates: 'S6', consumed: 'S8', dest: 'Pool' },
    { name: 'Coverage Response', born: 'S5', updates: 'S6', consumed: 'S7-S8', dest: 'Pool' },
    { name: 'Sentiment Index', born: 'S4', updates: 'S5 (cont.)', consumed: 'S6-S8', dest: '&mdash;' },
    { name: 'Demo Conversion', born: 'S6', updates: '&mdash;', consumed: 'S7', dest: 'Pool' },
    { name: 'Launch Funnel', born: 'S7', updates: '&mdash;', consumed: 'S8', dest: 'Pool' },
    { name: 'Tail Curve', born: 'S8', updates: '&mdash;', consumed: 'Sequel', dest: 'Pool' },
    { name: 'Momentum Score', born: 'S3', updates: 'S4-S7', consumed: 'S8', dest: '&mdash;' },
  ];

  h += '<div class="panel"><div class="panel-title">Signal Lifecycle by Stage</div><table class="data-table"><thead><tr><th>Signal</th><th>Born</th><th>Updates</th><th>Consumed</th><th>Dest.</th><th>State</th></tr></thead><tbody>';
  signals.forEach(function(sig){
    var stageNum = parseInt(sig.born.replace('S','')) || 0;
    var isActive = stageNum <= STATE.currentStage;
    var isBorn = stageNum === STATE.currentStage;
    h += '<tr><td class="cell-highlight">' + sig.name + '</td><td>' + sig.born + '</td><td>' + sig.updates + '</td><td>' + sig.consumed + '</td><td>' + sig.dest + '</td><td><span class="card-badge ' + (isBorn?'active':isActive?'success':'') + '" style="font-size:8px">' + (isBorn?'born':isActive?'updating':'pending') + '</span></td></tr>';
  });
  h += '</tbody></table></div>';

  h += '<div id="seismograph-container" style="height:200px"><canvas id="ledger-seismograph" width="600" height="200"></canvas></div>';
  setTimeout(function() { drawSeismograph('ledger-seismograph'); }, 100);
  return h;
}

function render_gate_log() {
  var h = '<div class="tool-header"><div class="tool-breadcrumb">Shared Objects &rarr; <span>Gate History</span></div><h1 class="tool-title">Gate Decision Log</h1><p class="tool-subtitle">Seven strategic gates plus one operational checkpoint.</p></div>';

  if (STATE.gateLog.length === 0) {
    h += '<div class="empty-state"><h3>No gate decisions yet</h3></div>';
  } else {
    h += '<table class="data-table"><thead><tr><th>Stage</th><th>Gate</th><th>Decision</th><th>Score</th><th>Timestamp</th></tr></thead><tbody>';
    STATE.gateLog.forEach(function(gl){
      var g = GATES.find(function(x){return x.stage===gl.stage;});
      h += '<tr><td>S' + gl.stage + '</td><td class="cell-highlight">' + (g?g.title:'') + '</td><td><span class="gate-log-decision decision-' + gl.decision + '">' + gl.decision.toUpperCase() + '</span></td><td>' + gl.score + '</td><td style="font-family:var(--font-mono);font-size:11px">' + gl.timestamp + '</td></tr>';
    });
    h += '</tbody></table>';
  }

  h += '<div class="panel" style="margin-top:1.5rem"><div class="panel-title">Remaining Gates</div>';
  for (var s = 1; s <= 8; s++) {
    if (!STATE.gateDecisions[s] && s !== 7) {
      var g = GATES.find(function(x){return x.stage===s;});
      if (g) h += '<div class="metric-row"><span class="metric-name">Gate S' + s + ': ' + g.title + '</span><span><span class="card-badge active">PENDING</span> <button class="btn btn-primary btn-sm" style="margin-left:8px" onclick="showGate(' + s + ')">Open</button></span></div>';
    }
  }
  h += '</div>';
  return h;
}
