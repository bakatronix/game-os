function render_audience_map() {
  var h = toolHeader(2, 'Pre-production', 'Audience Map', 'Locate the actual communities and extract their language.');
  h += lineageBar(['Thesis (comp set)', 'Benchmark Pool'], ['Page Engine', 'Community Scaffold', 'Test Loop', 'Creator Match', 'Sentiment Radar']);

  h += '<div class="two-col">';
  h += '<div>' + panel('Channel Rankings', AUDIENCE_MAP.channels.map(function(ch){
    return '<div class="metric-row"><span class="metric-name">' + ch.name + ' <span style="font-size:10px;color:var(--text-dim)">(' + ch.type + ')</span></span><span><span style="font-family:var(--font-mono);font-size:11px">' + (ch.size>=1000?(ch.size/1000).toFixed(0)+'K':ch.size) + ' members</span> <span class="metric-value" style="color:' + (ch.fit>=85?'var(--teal)':'var(--amber)') + '">Fit: ' + ch.fit + '</span></span></div>';
  }).join('')) + '</div>';

  h += '<div>';
  h += panel('Primary Channels Selected', '<div style="font-family:var(--font-mono);font-size:13px;margin-bottom:0.5rem">' + AUDIENCE_MAP.primaryChannels.map(function(c){return '&#10003; ' + c;}).join('<br>') + '</div><div style="font-size:12px;color:var(--text-dim)">Maximum 2 primary channels &mdash; evidence-based.</div>');
  h += panel('Brand Check', '<table class="data-table"><tbody>' +
    Object.keys(AUDIENCE_MAP.brandCheck).map(function(k){return '<tr><td>' + k + '</td><td class="cell-highlight">' + AUDIENCE_MAP.brandCheck[k] + '</td></tr>';}).join('') +
    '</tbody></table>');
  h += '</div></div>';

  h += panel('Extracted Vocabulary', '<div style="margin-bottom:0.5rem;font-size:12px;color:var(--text-dim)">Consumed by Page Engine for copywriting.</div><div style="display:flex;flex-wrap:wrap;gap:8px">' +
    AUDIENCE_MAP.vocabulary.map(function(v){
      return '<div style="background:var(--bg);border:1px solid var(--border);padding:6px 12px;border-radius:6px"><span style="font-size:13px">' + v.phrase + '</span> <span style="font-family:var(--font-mono);font-size:10px;color:var(--gold)">&times;' + v.frequency + '</span></div>';
    }).join('') + '</div>');

  h += gateSection(2);
  return h;
}
