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
