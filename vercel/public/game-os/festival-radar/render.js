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
