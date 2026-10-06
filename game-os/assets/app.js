(function () {
  'use strict';

  const MODULES = {
    community: {
      name: 'Community',
      toolName: 'Chicken Brûlée',
      url: 'https://llamagriffin.com/game-os/chicken-brulee/',
      cxoQuestion: 'Are players engaging?',
      kicker: 'before you ship the wrong loop.',
      label: '01 — COMMUNITY',
      description:
        'Is the playtest community giving useful, directional feedback? Chicken Brûlée scans your Discord playtest channels for recurring patterns, onboarding friction, and flagged comments that need operator attention.',
      status: 'watch',
      statusLabel: 'Watch',
      delta: { dir: 'down', text: '+3.1 pts', note: 'onboarding-flagged' },
      metrics: [
        { label: 'Contributors (7d)', value: '12' },
        { label: 'New observations', value: '34' },
        { label: 'Onboarding-flagged', value: '41%' },
      ],
      chart: { type: 'bars', values: [8, 12, 10, 14, 11, 12, 9], title: 'Weekly observations', source: 'Source: Chicken Brûlée · demo data · weekly totals' },
      detailNote:
        'Early-game clarity remains the dominant issue: first-quest, healing depletion, XP pacing.',
      keyReadings: [
        'Track playtest contributor count week-over-week as a leading indicator of community health.',
        'Monitor onboarding-flagged comments — a sustained rate above 35% suggests the new-player experience needs intervention.',
        'New observations per week measure the volume of actionable signal, not just noise.',
        'Directional evidence, not representative sentiment — playtesters are self-selected and vocal.',
      ],
      howToRead:
        'Chicken Brûlée provides directional evidence from your Discord playtest channels, not representative player sentiment. Focus on recurring themes across multiple contributors rather than any single comment. The onboarding-flagged rate helps you spot systemic new-player friction before launch.',
    },
    pricing: {
      name: 'Pricing',
      toolName: 'Comp Analysis / SEB',
      url: 'https://llamagriffin.com/game-os/price-calc/',
      cxoQuestion: 'Is the price right?',
      kicker: 'before you discount.',
      label: '02 — PRICING',
      description:
        'Is our launch price, discount plan, and regional strategy defensible? SEB is the full indie pricing workbook: comparable-game research, four-variable pricing score, score-to-tier mapping, and discount staircase planning.',
      status: 'healthy',
      statusLabel: 'Healthy',
      delta: { dir: 'up', text: '+6%', note: 'net vs prior period' },
      metrics: [
        { label: 'Required launch price', value: '$21.41' },
        { label: 'Wishlist → Week 1 est.', value: '630 units' },
        { label: 'Net revenue Week 1', value: '$9,443.70' },
      ],
      chart: { type: 'line', values: [18, 19, 19.5, 20, 20.8, 21, 21.4], title: 'Recommended price by stage', source: 'Source: SEB workbook · demo data · four-variable score' },
      detailNote:
        'Discount staircase built to 20%+ from first seasonal sale to trigger wishlist emails.',
      keyReadings: [
        'The four-variable pricing score (genre, scope, comp set, production value) maps to a recommended tier and launch price range.',
        'Wishlist conversion estimator projects Week 1 units from live wishlist count using Steam bench-marks.',
        '20%+ discounts trigger wishlist notification emails — build the discount buffer from day one.',
        'Regional pricing strategy uses Steam’s April 2026 recommended matrix as a baseline, adjusted per your comp set.',
        'DLC pricing and Early Access discount recommendations are included as separate workbook sheets.',
      ],
      howToRead:
        'SEB generates a defensible launch price from four variables: genre expectations, content scope, comparable-game pricing, and production value perception. The discount staircase is built so your first seasonal sale at 20%+ triggers Steam wishlist emails. Treat the Wishlist → Week 1 estimate as a directional range, not a forecast.',
    },
    pmf: {
      name: 'PMF',
      toolName: 'MTG PMF Analyzer',
      url: 'https://llamagriffin.com/game-os/PMF',
      cxoQuestion: 'Are we hitting product-market fit?',
      kicker: '30 days after launch.',
      label: '03 — PMF',
      description:
        '30 days in, is this game showing PMF signals, and where is the weakness? The MTG PMF Analyzer evaluates three lens scores (acquisition, engagement, satisfaction) on Steam-native public data, with confidence bands and moat features like refund-window playtime analysis.',
      status: 'nodata',
      statusLabel: 'No data',
      delta: null,
      metrics: [
        { label: 'Days since launch', value: '\u2014' },
        { label: 'Acquisition lens', value: '\u2014' },
        { label: 'Engagement lens', value: '\u2014' },
        { label: 'Satisfaction lens', value: '\u2014' },
      ],
      chart: null,
      detailNote: 'Connect a Steam AppID to start the 30-day PMF window.',
      keyReadings: [
        'Three lens scores (acquisition, engagement, satisfaction) with confidence bands — no single headline number.',
        'Refund-window playtime analysis compares median playtime in the first two hours against your genre benchmark.',
        'Update-cadence overlays track whether post-launch patches correlate with review-score recovery.',
        'Explicitly does not use wishlist private data or SteamSpy owner estimates — all inputs are Steam-native and public.',
        'MVP scope is the first 30 days post-launch; the tool is designed for the critical early signal window.',
      ],
      howToRead:
        'MTG PMF Analyzer provides three independent lens scores (acquisition, engagement, satisfaction), each with its own confidence band. There is no single headline number — a game can score high on acquisition but low on satisfaction. The refund-window playtime analysis is a moat feature that surfaces whether players are quitting before Steam’s two-hour refund window closes. Update-cadence overlays help you connect development velocity to review-score trajectory.',
    },
  };

  const MODULE_KEYS = ['community', 'pricing', 'pmf'];

  const DEFAULT_MODULE_URLS = {
    community: 'https://llamagriffin.com/game-os/chicken-brulee/',
    pricing: 'https://llamagriffin.com/game-os/price-calc/',
    pmf: 'https://llamagriffin.com/game-os/PMF',
  };

  const DEFAULT_SETTINGS = {
    studioName: '',
    gameTitle: 'Demo Game',
    steamAppId: '',
    discordNickname: '',
    moduleUrls: { ...DEFAULT_MODULE_URLS },
  };

  function loadSettings() {
    try {
      var raw = localStorage.getItem('gameos-settings');
      if (raw) {
        var parsed = JSON.parse(raw);
        return Object.assign({}, DEFAULT_SETTINGS, parsed, {
          moduleUrls: Object.assign({}, DEFAULT_MODULE_URLS, parsed.moduleUrls),
        });
      }
    } catch (e) {
      /* ignore corrupt settings */
    }
    return Object.assign({}, DEFAULT_SETTINGS, { moduleUrls: Object.assign({}, DEFAULT_MODULE_URLS) });
  }

  function saveSettings(settings) {
    try {
      localStorage.setItem('gameos-settings', JSON.stringify(settings));
    } catch (e) {
      /* quota exceeded, ignore */
    }
  }

  function getModuleUrl(moduleKey) {
    var s = loadSettings();
    return s.moduleUrls[moduleKey] || DEFAULT_MODULE_URLS[moduleKey];
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ---- Chart marks (design system: straight 2px lines, data-* slots) ---- */

  function lineChartSVG(data, width, height, seriesClass) {
    if (!data || data.length < 2) return '';
    var min = Math.min.apply(null, data);
    var max = Math.max.apply(null, data);
    var range = max - min || 1;
    var pad = 4;
    var pts = data.map(function (v, i) {
      var x = (i / (data.length - 1)) * (width - pad * 2) + pad;
      var y = height - pad - ((v - min) / range) * (height - pad * 2);
      return x.toFixed(1) + ',' + y.toFixed(1);
    });
    var last = pts[pts.length - 1].split(',');
    return (
      '<svg viewBox="0 0 ' + width + ' ' + height + '" class="gos-chart-svg" role="img" aria-hidden="true">' +
      '<polyline class="line ' + seriesClass + '" points="' + pts.join(' ') + '"/>' +
      '<circle class="dot ' + seriesClass.replace('s', 'f') + '" cx="' + last[0] + '" cy="' + last[1] + '" r="4"/>' +
      '</svg>'
    );
  }

  function barChartSVG(values, seriesClass) {
    if (!values || !values.length) return '';
    var max = Math.max.apply(null, values) || 1;
    var count = values.length;
    var barW = 10;
    var gap = 4;
    var width = count * barW + (count - 1) * gap;
    var height = 40;
    var bars = values
      .map(function (v, i) {
        var h = Math.max(2, (v / max) * height);
        var x = i * (barW + gap);
        var y = height - h;
        return '<rect class="' + seriesClass.replace('s', 'f') + '" x="' + x + '" y="' + y.toFixed(1) + '" width="' + barW + '" height="' + h.toFixed(1) + '" rx="2"/>';
      })
      .join('');
    return '<svg viewBox="0 0 ' + width + ' ' + height + '" class="gos-chart-svg" role="img" aria-hidden="true">' + bars + '</svg>';
  }

  /* ---- Component helpers ---- */

  function statusBadge(key) {
    var m = MODULES[key];
    var glyph = m.status === 'healthy' ? '\u25CF ' : m.status === 'watch' ? '\u25B2 ' : '\u25A0 ';
    var cls = m.status === 'healthy' ? 'healthy' : m.status === 'watch' ? 'watch' : m.status === 'nodata' ? 'demo' : 'concern';
    return '<span class="gos-badge ' + cls + '">' + glyph + m.statusLabel + '</span>';
  }

  function sectionHeading(label, title, kicker, rightBadge) {
    return (
      '<div class="page-head">' +
      '<div class="gos-heading">' +
      '<div class="gos-chevrons" aria-hidden="true"><i></i><i></i><i></i><i></i></div>' +
      '<div class="gos-label" style="margin-bottom:8px">' + label + '</div>' +
      '<h1>' + title + '</h1>' +
      '<em>' + kicker + '</em>' +
      '</div>' +
      (rightBadge || '') +
      '</div>'
    );
  }

  function renderMetrics(metrics) {
    return metrics
      .map(function (m) {
        var cls = m.value === '\u2014' ? 'metric-value empty' : 'metric-value';
        return (
          '<div class="metric-item">' +
          '<span class="metric-label">' + m.label + '</span>' +
          '<span class="' + cls + '">' + m.value + '</span>' +
          '</div>'
        );
      })
      .join('');
  }

  function tileChart(chart) {
    if (!chart) return '';
    var svg = chart.type === 'bars' ? barChartSVG(chart.values, 's1') : lineChartSVG(chart.values, 120, 40, 's1');
    return (
      '<div class="tile-chart" style="margin-top:16px">' +
      svg +
      '<span class="gos-meta" style="display:block;margin-top:12px">' + chart.source + '</span>' +
      '</div>'
    );
  }

  function deltaLine(delta) {
    if (!delta) return '';
    var cls = delta.dir === 'up' ? 'gos-up' : 'gos-down';
    var arrow = delta.dir === 'up' ? '\u25B2 ' : '\u25BC ';
    return '<div class="d"><span class="' + cls + '">' + arrow + delta.text + '</span><span>' + delta.note + '</span></div>';
  }

  /* ---- Page renderers ---- */

  function renderOverview() {
    var tiles = MODULE_KEYS
      .map(function (key) {
        var m = MODULES[key];
        var url = getModuleUrl(key);
        return (
          '<div class="gos-card">' +
          '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">' +
          '<div>' +
          '<div class="gos-label">' + m.label + '</div>' +
          '<h3 style="margin-top:4px">' + m.name + ' \u2014 ' + m.toolName + '</h3>' +
          '</div>' +
          statusBadge(key) +
          '</div>' +
          '<div class="gos-meta" style="display:block;margin-top:8px">' + m.cxoQuestion + '</div>' +
          deltaLine(m.delta) +
          '<div class="metrics-grid">' + renderMetrics(m.metrics) + '</div>' +
          tileChart(m.chart) +
          '<div class="card-actions">' +
          '<a class="gos-btn ghost" href="' + url + '" target="_blank" rel="noopener">Open module \u2192</a>' +
          '<a href="#/' + key + '">Detail page \u2192</a>' +
          '</div>' +
          '<div class="card-note">' + m.detailNote + '</div>' +
          '</div>'
        );
      })
      .join('');

    return (
      sectionHeading('00 — DASHBOARD', 'Studio health, one screen.', 'Read it before you spend.', '<span class="gos-badge demo">Demo data</span>') +
      '<div class="tile-grid">' + tiles + '</div>' +
      '<div class="gos-card watching-panel">' +
      '<h3>What Game OS is watching for you</h3>' +
      '<div class="watching-list" style="margin-top:16px">' +
      '<div class="watching-item"><span class="watching-chevron">\u203A</span><span><span class="watching-module">Community:</span> Is the playtest community giving useful, directional feedback that surfaces systemic issues before launch?</span></div>' +
      '<div class="watching-item"><span class="watching-chevron">\u203A</span><span><span class="watching-module">Pricing:</span> Is your launch price, discount plan, and regional strategy defensible against comparable titles in the same genre and scope?</span></div>' +
      '<div class="watching-item"><span class="watching-chevron">\u203A</span><span><span class="watching-module">PMF:</span> 30 days post-launch, are acquisition, engagement, and satisfaction signals pointing toward product-market fit?</span></div>' +
      '</div>' +
      '<div class="sync-note">Last synced: 2m ago (demo)</div>' +
      '</div>'
    );
  }

  function renderDetailPage(key) {
    var m = MODULES[key];
    var url = getModuleUrl(key);
    var chartBlock = '';
    if (m.chart) {
      var svg = m.chart.type === 'bars' ? barChartSVG(m.chart.values, 's1') : lineChartSVG(m.chart.values, 640, 160, 's1');
      chartBlock =
        '<div class="gos-card gos-chart">' +
        '<div class="gos-label">' + m.label + '</div>' +
        '<h3>' + m.chart.title + '</h3>' +
        '<div style="margin-top:16px">' + svg + '</div>' +
        '<span class="gos-meta" style="display:block;margin-top:12px">' + m.chart.source + '</span>' +
        '</div>';
    }
    return (
      sectionHeading(m.label, m.name + '.', m.kicker, statusBadge(key)) +
      '<p class="detail-intro">' + m.description + '</p>' +
      '<div><a class="gos-btn" href="' + url + '" target="_blank" rel="noopener">Open ' + m.toolName + ' in full \u2192</a></div>' +
      '<div class="detail-layout">' +
      '<div>' +
      chartBlock +
      '<div class="iframe-wrapper" style="margin-top:16px">' +
      '<iframe src="' + url + '" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" loading="lazy"></iframe>' +
      '<div class="iframe-note">Some tools require sign-in and may not load fully here. Use "Open in full" for the complete experience.</div>' +
      '</div>' +
      '<div class="collapsible">' +
      '<button class="collapsible-toggle" onclick="this.classList.toggle(\'open\'); this.nextElementSibling.classList.toggle(\'open\')">' +
      '<span class="arrow">\u203A</span> How to read this' +
      '</button>' +
      '<div class="collapsible-content">' + m.howToRead + '</div>' +
      '</div>' +
      '</div>' +
      '<div class="gos-card key-readings">' +
      '<h3>Key readings</h3>' +
      '<ul>' + m.keyReadings.map(function (r) { return '<li>' + r + '</li>'; }).join('') + '</ul>' +
      '</div>' +
      '</div>'
    );
  }

  function renderSettings() {
    var s = loadSettings();

    var moduleFields = MODULE_KEYS
      .map(function (key) {
        var m = MODULES[key];
        var url = s.moduleUrls[key] || DEFAULT_MODULE_URLS[key];
        return (
          '<div class="form-group">' +
          '<label class="gos-label" for="url-' + key + '">' + m.name + ' (' + m.toolName + ') URL</label>' +
          '<input class="form-input" type="text" id="url-' + key + '" value="' + escapeHtml(url) + '">' +
          '<span class="form-help">Live tool URL. Change only if the tool moves.</span>' +
          '</div>'
        );
      })
      .join('');

    return (
      sectionHeading('04 — SETTINGS', 'Studio profile.', 'stored in this browser.') +
      '<p class="settings-intro">Configure your studio profile and module data sources. All settings are stored locally in your browser.</p>' +
      '<div class="gos-card">' +
      '<h3>Studio Profile</h3>' +
      '<div style="margin-top:16px">' +
      '<div class="form-group">' +
      '<label class="gos-label" for="studioName">Studio Name</label>' +
      '<input class="form-input" type="text" id="studioName" value="' + escapeHtml(s.studioName) + '" placeholder="Enter studio name">' +
      '</div>' +
      '<div class="form-group">' +
      '<label class="gos-label" for="gameTitle">Primary Game Title</label>' +
      '<input class="form-input" type="text" id="gameTitle" value="' + escapeHtml(s.gameTitle) + '">' +
      '</div>' +
      '<div class="form-group">' +
      '<label class="gos-label" for="steamAppId">Steam AppID (optional)</label>' +
      '<input class="form-input" type="text" id="steamAppId" value="' + escapeHtml(s.steamAppId) + '" placeholder="e.g. 1234560">' +
      '</div>' +
      '<div class="form-group">' +
      '<label class="gos-label" for="discordNickname">Discord Server Nickname (display only)</label>' +
      '<input class="form-input" type="text" id="discordNickname" value="' + escapeHtml(s.discordNickname) + '" placeholder="e.g. MyStudio Playtest">' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div class="gos-card">' +
      '<h3>Module Data Sources</h3>' +
      '<div style="margin-top:16px">' + moduleFields + '</div>' +
      '</div>' +
      '<div><button class="gos-btn ghost" id="btnReset">Reset to Defaults</button></div>'
    );
  }

  function renderAbout() {
    return (
      sectionHeading('05 — ABOUT', 'Game OS.', 'the operator surface.') +
      '<p class="about-para">Game OS is a Llama &amp; Griffin operator surface for indie studio executives. It answers three CXO-level questions on one screen:</p>' +
      '<div class="gos-card">' +
      '<div class="watching-list">' +
      '<div class="watching-item"><span class="watching-chevron">\u203A</span><span><span class="watching-module">Are players engaging?</span> \u2014 community and playtest signal (Chicken Br\u00fbl\u00e9e).</span></div>' +
      '<div class="watching-item"><span class="watching-chevron">\u203A</span><span><span class="watching-module">Is the price right?</span> \u2014 pricing, discount, wishlist, and regional strategy (Comp Analysis / SEB).</span></div>' +
      '<div class="watching-item"><span class="watching-chevron">\u203A</span><span><span class="watching-module">Are we hitting product-market fit?</span> \u2014 post-launch 30-day PMF signal (MTG PMF Analyzer).</span></div>' +
      '</div>' +
      '</div>' +
      '<p class="about-para">Each module links out to a live Llama &amp; Griffin tool that does the actual analysis. Game OS wraps, links, and summarizes so you can scan the studio\u2019s health in one view.</p>' +
      '<div class="gos-card about-section">' +
      '<h3>Credits</h3>' +
      '<p class="about-credits">Abbas Saleem Khan, Sebastian Cardoso, Jay Rooney.</p>' +
      '</div>' +
      '<div class="gos-card about-section">' +
      '<h3>Links</h3>' +
      '<div class="about-links">' +
      '<a href="https://llamagriffin.com" target="_blank" rel="noopener">llamagriffin.com</a>' +
      '<a href="https://recognizingpatterns.substack.com" target="_blank" rel="noopener">recognizingpatterns.substack.com</a>' +
      '<a href="https://cal.com/llamagriffin/30min" target="_blank" rel="noopener">Book a Conversation</a>' +
      '</div>' +
      '</div>'
    );
  }

  /* ---- Router ---- */

  function route() {
    var hash = window.location.hash.replace('#/', '') || 'overview';
    var content = document.getElementById('content');

    switch (hash) {
      case 'community':
        content.innerHTML = renderDetailPage('community');
        break;
      case 'pricing':
        content.innerHTML = renderDetailPage('pricing');
        break;
      case 'pmf':
        content.innerHTML = renderDetailPage('pmf');
        break;
      case 'settings':
        content.innerHTML = renderSettings();
        bindSettingsEvents();
        break;
      case 'about':
        content.innerHTML = renderAbout();
        break;
      case 'overview':
      default:
        content.innerHTML = renderOverview();
        break;
    }

    updateActiveNav(hash);
    window.scrollTo(0, 0);
  }

  function updateActiveNav(current) {
    var items = document.querySelectorAll('#appNav a');
    items.forEach(function (item) {
      var r = item.getAttribute('data-route');
      if (r === current) {
        item.setAttribute('aria-current', 'page');
      } else {
        item.removeAttribute('aria-current');
      }
    });
  }

  /* ---- Settings events ---- */

  function bindSettingsEvents() {
    var inputs = ['studioName', 'gameTitle', 'steamAppId', 'discordNickname'];
    var urlKeys = MODULE_KEYS;

    function collectAndSave() {
      var s = loadSettings();
      inputs.forEach(function (id) {
        var el = document.getElementById(id);
        if (el) s[id] = el.value;
      });
      urlKeys.forEach(function (key) {
        var el = document.getElementById('url-' + key);
        if (el) s.moduleUrls[key] = el.value;
      });
      saveSettings(s);
    }

    var allFields = inputs.concat(urlKeys.map(function (k) { return 'url-' + k; }));
    allFields.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('input', collectAndSave);
    });

    var btnReset = document.getElementById('btnReset');
    if (btnReset) {
      btnReset.addEventListener('click', function () {
        localStorage.removeItem('gameos-settings');
        document.getElementById('content').innerHTML = renderSettings();
        bindSettingsEvents();
      });
    }
  }

  /* ---- Init ---- */

  window.addEventListener('hashchange', route);
  window.addEventListener('DOMContentLoaded', route);
})();
