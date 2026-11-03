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
