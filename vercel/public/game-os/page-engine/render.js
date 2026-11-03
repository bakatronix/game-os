function render_page_engine() {
  var h = toolHeader(3, 'First Playable', 'Page Engine', 'Build, audit, and optimize the Steam store page.');
  h += lineageBar(['Thesis', 'Audience Map', 'Benchmark Pool'], ['Signal Ledger', 'Test Loop', 'Window Planner', 'Launch Runbook']);

  h += statGrid([
    { value: PAGE_ENGINE.wishlistData.total.toLocaleString(), label: 'Cumulative Wishlists', color: 'gold' },
    { value: PAGE_ENGINE.wishlistData.velocity30Day + '/day', label: 'Wishlist Velocity (30-day)', sub: PAGE_ENGINE.wishlistData.velocityPercentile + 'th percentile', color: 'teal' },
    { value: PAGE_ENGINE.auditScore + '/100', label: 'Page Audit Score', sub: '3 items flagged', color: 'coral' },
    { value: '+12%', label: 'Velocity Trend', color: 'teal' },
  ]);

  // Continuous signal tracking (elevated from checklist)
  h += '<div class="panel"><div class="panel-title">Continuously Tracked Performance Signals</div>';
  h += actionRow(CAPSULE_TRACKING.currentCtr, 'Capsule CTR', benchmarkHint('', 'ctr'), '<strong>Capsule is converting above the genre median.</strong> Continue monitoring — if CTR dips below 3.2% (bottom quartile), reprioritize capsule testing.', 'teal');
  h += actionRow(CAPSULE_TRACKING.trailerRetention6s, 'Trailer 6-Second Retention', 'Indie genre range: 50–80%', '<strong>Trailer hook is strong.</strong> Viewers are staying past the first 6 seconds — well above the ' + CAPSULE_TRACKING.trailerRetentionComp + ' comp average. Your opening frames are working.', 'teal');
  h += actionRow(CAPSULE_TRACKING.trailerAvgWatch, 'Trailer Avg. Watch Time', '', '<strong>48 seconds avg. watch time</strong> on a 90-second trailer — 53% completion. Consider tightening to 60 seconds to land the hook before the drop-off point.', 'gold');
  h += '<div style="font-size:10px;color:var(--text-dim);margin-top:0.5rem">These signals update continuously from Stage 3 through launch. The one-time structural checklist (below) validates fundamentals at page creation time.</div></div>';

  // Creative Version History (versioned, scored asset)
  h += '<div class="panel"><div class="panel-title">Creative Version History <span class="card-badge active">versioned</span></div>';
  h += '<table class="data-table"><thead><tr><th>Version</th><th>Type</th><th>Live</th><th>Description</th><th>CTR</th><th>CTR &Delta;</th><th>Trailer 6s</th><th>Trailer &Delta;</th></tr></thead><tbody>';
  CREATIVE_VERSIONS.forEach(function(cv) {
    var ctrDeltaCls = cv.ctrDelta === 'baseline' ? 'creative-delta-baseline' : (String(cv.ctrDelta).charAt(0) === '+' ? 'creative-delta-up' : 'creative-delta-down');
    var trlDeltaCls = cv.trailerDelta === 'baseline' ? 'creative-delta-baseline' : (String(cv.trailerDelta).charAt(0) === '+' ? 'creative-delta-up' : 'creative-delta-down');
    h += '<tr>';
    h += '<td class="cell-highlight">' + cv.versionId + '</td>';
    h += '<td>' + cv.assetType + '</td>';
    h += '<td style="font-family:var(--font-mono);font-size:11px">' + cv.dateLive + '</td>';
    h += '<td style="font-size:12px">' + cv.description + '</td>';
    h += '<td>' + (cv.ctr !== null ? cv.ctr + '%' : '&mdash;') + '</td>';
    h += '<td class="' + ctrDeltaCls + '">' + (cv.ctrDelta || '&mdash;') + '</td>';
    h += '<td>' + (cv.trailerRetention !== null ? cv.trailerRetention + '%' : '&mdash;') + '</td>';
    h += '<td class="' + trlDeltaCls + '">' + (cv.trailerDelta || '&mdash;') + '</td>';
    h += '</tr>';
  });
  h += '</tbody></table>';
  h += '<div style="font-size:10px;color:var(--text-dim);margin-top:0.5rem;font-style:italic">Feasibility note: CTR is partner-portal CSV (studio-submitted); trailer analytics read cleaner from the YouTube upload than Steam &mdash; both studio-submitted metrics, same bucket as wishlist conversion.</div></div>';

  h += '<div class="two-col">';
  // One-time structural checklist (demoted)
  h += '<div>' + panel('Structural Audit (one-time check)', '<ul class="checklist">' + PAGE_ENGINE.auditItems.map(function(item){
    return '<li><span class="check-icon check-' + item.status + '">' + (item.status==='pass'?'&#10003;':item.status==='fail'?'&#10007;':'!') + '</span><div><span class="check-text">' + item.item + '</span><span class="check-action">' + item.action + '</span></div></li>';
  }).join('') + '</ul>') + '</div>';

  h += '<div>' + panel('Wishlist Performance', '<div class="metric-row"><span class="metric-name">Daily Average (30-day)</span><span class="metric-value">' + PAGE_ENGINE.wishlistData.dailyAvg + '/day</span></div><div class="metric-row"><span class="metric-name">Week-over-Week</span><span class="metric-value" style="color:var(--teal)">' + PAGE_ENGINE.wishlistData.trend + '</span></div><div class="metric-row"><span class="metric-name">Percentile vs. Cohort</span><span class="metric-value" style="color:var(--teal)">' + PAGE_ENGINE.wishlistData.velocityPercentile + 'th</span></div>') +
    panel('UTM Attribution', '<table class="data-table"><thead><tr><th>Source</th><th>Clicks</th></tr></thead><tbody>' +
    PAGE_ENGINE.utmLinks.map(function(u){return '<tr><td>' + u.source + '</td><td class="cell-highlight">' + u.clicks + '</td></tr>';}).join('') + '</tbody></table>') + '</div></div>';

  h += gateSection(3);
  return h;
}
