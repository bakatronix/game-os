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
