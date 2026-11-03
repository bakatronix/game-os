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
