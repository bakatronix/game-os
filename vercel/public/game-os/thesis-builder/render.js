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
