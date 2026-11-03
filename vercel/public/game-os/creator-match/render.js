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
