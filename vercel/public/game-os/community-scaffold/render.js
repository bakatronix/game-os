function render_community_scaffold() {
  var h = toolHeader(3, 'First Playable', 'Community Scaffold', 'An owned audience is immune to algorithm changes.');
  h += lineageBar(['Audience Map'], ['Playtest Pipeline', 'Sentiment Radar', 'Launch Runbook']);

  h += '<div class="two-col"><div>';
  h += panel('Discord Server', statGrid([
    { value: COMMUNITY_SCAFFOLD.discord.members, label: 'Total Members', color: 'gold' },
    { value: COMMUNITY_SCAFFOLD.discord.activeWeekly, label: 'Active Weekly', color: 'teal' },
  ]) + '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);margin-bottom:0.5rem">CHANNELS</div>' +
    COMMUNITY_SCAFFOLD.discord.channels.map(function(c){return '<span style="display:inline-block;background:var(--bg);border:1px solid var(--border);padding:3px 8px;border-radius:3px;font-size:11px;margin:2px">#' + c + '</span>';}).join(' ') +
    '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);margin-top:0.75rem;margin-bottom:0.5rem">ROLES</div>' +
    COMMUNITY_SCAFFOLD.discord.roles.map(function(r){return '<div style="font-size:12px;margin:2px 0">' + r + '</div>';}).join(''));
  h += '</div><div>';
  h += panel('Structured Feedback (v1 &mdash; /feedback)', '<div class="feedback-form"><div style="margin-bottom:0.5rem"><select><option>Category</option>' + COMMUNITY_SCAFFOLD.discord.feedbackForm.categories.map(function(c){return '<option>' + c + '</option>';}).join('') + '</select></div><textarea placeholder="Describe your feedback..."></textarea><button class="btn btn-primary btn-sm" style="margin-top:0.5rem">Submit to Ledger</button></div><div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-top:0.5rem">All feedback writes structured signal to the Signal Ledger.</div>');
  h += panel('Recent Feedback', COMMUNITY_SCAFFOLD.discord.feedbackForm.recent.map(function(fb){
    return '<div class="metric-row"><span class="metric-name"><span class="stage-badge" style="font-size:8px;background:var(--bg);border:1px solid var(--border);padding:1px 6px">' + fb.category + '</span> ' + fb.text + '</span><span style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim)">' + fb.user + ' &middot; ' + fb.time + '</span></div>';
  }).join(''));
  h += '</div></div>';

  // Ambient footprint (S3+)
  if (STATE.currentStage >= 3) {
    h += renderAmbientFootprint();
  }

  h += gateSection(3);
  return h;
}
