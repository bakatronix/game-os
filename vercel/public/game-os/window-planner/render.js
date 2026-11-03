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
