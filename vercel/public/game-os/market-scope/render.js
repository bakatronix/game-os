/* Market Scope widget — Game OS.
 * The render function itself lives here (independently editable). It uses the
 * shared toolkit helpers + data loaded before this script. */
function render_market_scope() {
  var h = toolHeader(1, 'Concept', 'Market Scope', 'Map the competitive landscape.');
  h += lineageBar(['Benchmark Pool'], ['Thesis Builder', 'Audience Map', 'Window Planner (S6)']);

  h += panel('Genre Selection', '<div class="tag-cloud">' +
    ['survival-crafting','roguelike','deckbuilder','metroidvania','farming-sim','city-builder','automation','horror','RPG','action','strategy','co-op','underwater','space','fantasy'].map(function(t){
      return '<span class="tag-pill' + (MARKET_SCOPE.selectedTags.indexOf(t) >= 0 ? ' selected' : '') + '">' + t + '</span>';
    }).join('') + '</div>');

  h += statGrid([
    { value: '$180K', label: 'Median Revenue', sub: '2-year cohort', color: 'gold' },
    { value: '$450K', label: 'Top-Quartile Revenue', sub: '2-year cohort', color: 'teal' },
    { value: '$1.2M', label: 'Top-Decile Revenue', sub: '2-year cohort', color: 'purple' },
    { value: MARKET_SCOPE.saturationIndex.current, label: 'Saturation Index', sub: MARKET_SCOPE.saturationIndex.detail, color: 'coral' },
  ]);

  h += '<div class="panel"><div class="panel-title">Diagnostic Actions</div>';
  h += actionRow(MARKET_SCOPE.saturationIndex.current, 'Saturation Trend', 'Declining revenue-per-release = opportunity', '<strong>The space is thinning out — fewer releases competing for the same audience.</strong> This is a bullish signal: the games that do ship are earning more per title. Enter now before the next wave of supply.', 'coral');
  h += actionRow(MARKET_SCOPE.publisherFunding.count + ' publishers', 'Publisher Funding Activity', '', '<strong>3 top-tier indie publishers are actively funding this genre.</strong> Publisher activity is a lagging-but-honest demand signal — they commit capital after seeing the same market data you see here. If publishers are funding, the market exists.', 'teal');
  h += '</div>';

  h += '<div class="two-col">';
  h += panel('Verdict', '<p style="font-size:14px;line-height:1.6;color:var(--text-muted);margin-bottom:0.75rem"><strong style="color:var(--gold)">Crowded core, underserved co-op adjacency.</strong> The survival-crafting &times; roguelike space is competitive at the top but thinning &mdash; fewer releases, higher per-title earnings.</p><p style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim)">3 of the top 10 indie publishers are actively funding this space: Devolver, Raw Fury, tinyBuild.</p>');

  h += '<div>' + panel('Blue Ocean Pairs', MARKET_SCOPE.blueOceanPairs.map(function(bp){
    return '<div class="metric-row"><span class="metric-name">' + bp.tags + '</span><span class="metric-value" style="color:var(--teal)">' + bp.score + '/100</span></div>';
  }).join('')) + '</div>';
  h += '</div>';

  h += panel('Comp Funnel Benchmarks', '<table class="data-table"><thead><tr><th>Game</th><th>Wishlist Vel.</th><th>Page Conv.</th><th>Demo Conv.</th><th>Launch Units</th></tr></thead><tbody>' +
    MARKET_SCOPE.compFunnels.map(function(cf){
      return '<tr><td>' + cf.name + '</td><td>' + cf.wishlistVelocity + '/day</td><td>' + cf.pageConv + '%</td><td>' + cf.demoConv + '%</td><td class="cell-highlight">' + (cf.launchUnits/1000).toFixed(0) + 'K</td></tr>';
    }).join('') + '</tbody></table>');

  h += gateSection(1);
  return h;
}
