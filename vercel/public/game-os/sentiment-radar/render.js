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
