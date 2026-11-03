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
