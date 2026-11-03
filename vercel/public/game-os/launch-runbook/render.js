function render_launch_runbook() {
  var h = toolHeader(7, 'Launch', 'Launch Runbook', 'Sequenced launch checklist with continuous anomaly monitoring.');
  h += lineageBar(['Every upstream tool'], ['Long Tail Engine', 'Sequel Signal', 'Benchmark Pool']);

  h += statGrid([
    { value: '$' + LAUNCH_RUNBOOK.funnel.revenue.toLocaleString(), label: 'Revenue (Day 1)', sub: LAUNCH_RUNBOOK.funnel.unitsSold.toLocaleString() + ' units', color: 'gold' },
    { value: LAUNCH_RUNBOOK.funnel.ccu.peak.toLocaleString(), label: 'Peak CCU', sub: 'Current: ' + LAUNCH_RUNBOOK.funnel.ccu.current, color: 'teal' },
    { value: LAUNCH_RUNBOOK.funnel.refundRate, label: 'Refund Rate', color: 'coral' },
    { value: LAUNCH_RUNBOOK.funnel.wishlistsConverted.toLocaleString(), label: 'Wishlists Converted', color: 'purple' },
  ]);

  LAUNCH_RUNBOOK.alerts.forEach(function(a){
    h += '<div class="alert alert-' + a.severity + '"><span class="alert-icon">' + (a.severity==='warn'?'&#9888;':'&#8505;') + '</span><div><strong>' + a.time + '</strong>: ' + a.message + '<span class="alert-action">Action: ' + a.action + '</span></div></div>';
  });

  h += '<div class="two-col">';
  h += panel('Launch Checklist', '<ul class="checklist">' + LAUNCH_RUNBOOK.checklist.map(function(ch){
    return '<li><span class="check-icon ' + (ch.status==='done'?'check-pass':ch.status==='in-progress'?'check-fix':'') + '">' + (ch.status==='done'?'&#10003;':ch.status==='in-progress'?'&#9678;':'&#9675;') + '</span><div><span class="check-text">' + ch.time + ' &mdash; ' + ch.task + '</span><span class="check-action">' + ch.status.toUpperCase() + '</span></div></li>';
  }).join('') + '</ul>');
  h += panel('Funnel Snapshot', '<div class="metric-row"><span class="metric-name">Store Impressions</span><span class="metric-value">' + LAUNCH_RUNBOOK.funnel.impressions.toLocaleString() + '</span></div><div class="metric-row"><span class="metric-name">Page Visits</span><span class="metric-value">' + LAUNCH_RUNBOOK.funnel.pageVisits.toLocaleString() + '</span></div><div class="metric-row"><span class="metric-name">Units Sold</span><span class="metric-value" style="color:var(--gold)">' + LAUNCH_RUNBOOK.funnel.unitsSold.toLocaleString() + '</span></div><div class="metric-row"><span class="metric-name">Revenue</span><span class="metric-value" style="color:var(--teal)">$' + LAUNCH_RUNBOOK.funnel.revenue.toLocaleString() + '</span></div>');
  h += '</div>';

  h += '<div class="gate-banner" style="margin-top:1.5rem"><div class="gate-banner-icon" style="background:var(--blue-dim);color:var(--blue)">&#9881;</div><div class="gate-banner-body"><div class="gate-banner-title">Stage 7 &mdash; Operational Checkpoint</div><p class="gate-banner-question">No strategic gate. Continuous anomaly monitoring via daily + proxy signals.</p></div></div>';

  // Expectation-Delivery Gap (NEW)
  var gapCls = EXPECTATION_GAP.gapVerdict === 'wide' ? 'wide' : 'tight';
  var gapColor = EXPECTATION_GAP.gapVerdict === 'wide' ? 'var(--coral)' : 'var(--teal)';
  h += '<div class="panel" style="margin-top:1.5rem"><div class="panel-title">Expectation-Delivery Gap <span class="card-badge ' + (EXPECTATION_GAP.gapVerdict === 'wide' ? 'warning' : 'success') + '">' + (EXPECTATION_GAP.gapVerdict === 'wide' ? 'WIDE' : 'TIGHT') + '</span></div>';
  h += '<div class="gap-indicator ' + gapCls + '"><div class="gap-num" style="color:' + gapColor + '">' + EXPECTATION_GAP.refundRate + '</div><div><strong>Refund Rate</strong> vs. genre norm of ' + EXPECTATION_GAP.refundRateComp + '<br><span style="font-size:12px;color:var(--text-dim)">Review mismatch phrases: ' + EXPECTATION_GAP.mismatchPhrases + ' flagged</span></div></div>';
  h += '<div class="metric-row"><span class="metric-name">Pre-Launch Sentiment</span><span class="metric-value" style="color:var(--teal)">' + EXPECTATION_GAP.preLaunchSentiment + '/100</span></div>';
  h += '<div class="metric-row"><span class="metric-name">Post-Launch Sentiment</span><span class="metric-value" style="color:var(--coral)">' + EXPECTATION_GAP.postLaunchSentiment + '/100 <span class="metric-delta down">' + EXPECTATION_GAP.sentimentShift + ' pts</span></span></div>';
  h += '<div class="metric-row"><span class="metric-name">Top Mismatch Terms</span><span style="font-size:11px;color:var(--coral)">' + EXPECTATION_GAP.topMismatchTerms.join(', ') + '</span></div>';
  h += actionRow(EXPECTATION_GAP.sentimentShift + ' pts', 'Sentiment Divergence', '', '<strong>' + EXPECTATION_GAP.recommendation + '</strong>', 'coral');
  h += '<div style="font-size:10px;color:var(--text-dim);margin-top:0.5rem">This gap metric feeds directly into the Stage 8 Sequel Signal as a DLC/sequel scope input.</div></div>';
  return h;
}
