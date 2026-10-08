(function () {
  'use strict';

  /* ============================================================
     Game OS — a set of widgets, each linking to a separate live app.
     Community -> Chicken Brûlée · Pricing -> Comp Analysis / SEB ·
     PMF -> MTG PMF Analyzer. Game OS does not rebuild them.

     Styling follows the Game OS Sandstone design system
     (../Design System/design-system). Single theme (sand).
     All figures are demo data.
     ============================================================ */

  var MODULES = {
    community: {
      name: 'Community',
      toolName: 'Chicken Brûlée',
      url: '/game-os/chicken-brulee/',
      cxoQuestion: 'Are players engaging?',
      description:
        'Is the playtest community giving useful, directional feedback? Chicken Brûlée scans your Discord playtest channels for recurring patterns, onboarding friction, and flagged comments that need operator attention.',
      status: 'watch',
      statusLabel: 'Watch',
      metrics: [
        { label: 'Contributors (7d)', value: '12' },
        { label: 'New observations', value: '34' },
        { label: 'Onboarding-flagged', value: '41%' },
      ],
      spark: { type: 'bars', values: [8, 12, 10, 14, 11, 12, 9] },
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
      url: '/game-os/price-calc/',
      cxoQuestion: 'Is the price right?',
      description:
        'Is our launch price, discount plan, and regional strategy defensible? SEB is the full indie pricing workbook: comparable-game research, four-variable pricing score, score-to-tier mapping, and discount staircase planning.',
      status: 'healthy',
      statusLabel: 'Healthy',
      metrics: [
        { label: 'Required launch price', value: '$21.41' },
        { label: 'Wishlist \u2192 Week 1 est.', value: '630 units' },
        { label: 'Net revenue Week 1', value: '$9,443.70' },
      ],
      spark: { type: 'line', values: [18, 19, 19.5, 20, 20.8, 21, 21.4] },
      detailNote:
        'Discount staircase built to 20%+ from first seasonal sale to trigger wishlist emails.',
      keyReadings: [
        'The four-variable pricing score (genre, scope, comp set, production value) maps to a recommended tier and launch price range.',
        'Wishlist conversion estimator projects Week 1 units from live wishlist count using Steam benchmarks.',
        '20%+ discounts trigger wishlist notification emails — build the discount buffer from day one.',
        'Regional pricing strategy uses Steam\u2019s April 2026 recommended matrix as a baseline, adjusted per your comp set.',
        'DLC pricing and Early Access discount recommendations are included as separate workbook sheets.',
      ],
      howToRead:
        'SEB generates a defensible launch price from four variables: genre expectations, content scope, comparable-game pricing, and production value perception. The discount staircase is built so your first seasonal sale at 20%+ triggers Steam wishlist emails. Treat the Wishlist \u2192 Week 1 estimate as a directional range, not a forecast.',
    },
    pmf: {
      name: 'PMF',
      toolName: 'MTG PMF Analyzer',
      url: '/game-os/PMF/',
      cxoQuestion: 'Are we hitting product-market fit?',
      description:
        '30 days in, is this game showing PMF signals, and where is the weakness? The MTG PMF Analyzer evaluates three lens scores (acquisition, engagement, satisfaction) on Steam-native public data, with confidence bands and moat features like refund-window playtime analysis.',
      status: 'nodata',
      statusLabel: 'No data',
      metrics: [
        { label: 'Days since launch', value: '\u2014' },
        { label: 'Acquisition lens', value: '\u2014' },
        { label: 'Engagement lens', value: '\u2014' },
        { label: 'Satisfaction lens', value: '\u2014' },
      ],
      spark: null,
      detailNote: 'Connect a Steam AppID to start the 30-day PMF window.',
      keyReadings: [
        'Three lens scores (acquisition, engagement, satisfaction) with confidence bands — no single headline number.',
        'Refund-window playtime analysis compares median playtime in the first two hours against your genre benchmark.',
        'Update-cadence overlays track whether post-launch patches correlate with review-score recovery.',
        'Explicitly does not use wishlist private data or SteamSpy owner estimates — all inputs are Steam-native and public.',
        'MVP scope is the first 30 days post-launch; the tool is designed for the critical early signal window.',
      ],
      howToRead:
        'MTG PMF Analyzer provides three independent lens scores (acquisition, engagement, satisfaction), each with its own confidence band. There is no single headline number — a game can score high on acquisition but low on satisfaction. The refund-window playtime analysis is a moat feature that surfaces whether players are quitting before Steam\u2019s two-hour refund window closes. Update-cadence overlays help you connect development velocity to review-score trajectory.',
    },
  };

  var MODULE_KEYS = ['community', 'pricing', 'pmf'];

  var DEFAULT_MODULE_URLS = {
    community: '/game-os/chicken-brulee/',
    pricing: '/game-os/price-calc/',
    pmf: '/game-os/PMF/',
  };

  var DEFAULT_SETTINGS = {
    studioName: '',
    gameTitle: 'Demo Game',
    steamAppId: '',
    discordNickname: '',
    moduleUrls: Object.assign({}, DEFAULT_MODULE_URLS),
  };

  /* ============================================================
     Settings
     ============================================================ */

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

  /* ============================================================
     Sparklines — Sandstone marks: data-1 only, monotone-ish straight
     2.5px line with a marker on every point (2px sand ring); bars
     follow the same single-series treatment.
     ============================================================ */

  function sparkLine(values) {
    var W = 150,
      H = 44,
      pad = 6;
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    var range = max - min || 1;
    var pts = values.map(function (v, i) {
      var x = (i / (values.length - 1)) * (W - pad * 2) + pad;
      var y = H - pad - ((v - min) / range) * (H - pad * 2);
      return [x.toFixed(1), y.toFixed(1)];
    });
    var path = pts
      .map(function (p, i) {
        return (i === 0 ? 'M' : 'L') + p[0] + ',' + p[1];
      })
      .join(' ');
    var dots = pts
      .map(function (p) {
        return '<circle class="dot f1" cx="' + p[0] + '" cy="' + p[1] + '" r="3.5"/>';
      })
      .join('');
    return (
      '<svg class="gos-spark" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true">' +
      '<path class="line s1" d="' + path + '"/>' +
      dots +
      '</svg>'
    );
  }

  function sparkBars(values) {
    var W = 150,
      H = 44,
      gap = 4,
      barW = 14;
    var max = Math.max.apply(null, values) || 1;
    var bars = values
      .map(function (v, i) {
        var h = Math.max(3, (v / max) * (H - 4));
        var x = i * (barW + gap);
        return '<rect class="f1" x="' + x + '" y="' + (H - h).toFixed(1) + '" width="' + barW + '" height="' + h.toFixed(1) + '" rx="3"/>';
      })
      .join('');
    return '<svg class="gos-spark" viewBox="0 0 ' + (values.length * (barW + gap) - gap) + ' ' + H + '" aria-hidden="true">' + bars + '</svg>';
  }

  function sparkSVG(spark) {
    if (!spark) return '';
    return spark.type === 'bars' ? sparkBars(spark.values) : sparkLine(spark.values);
  }

  /* ============================================================
     Component helpers
     ============================================================ */

  function statusBadge(kind, label) {
    var glyphMap = { healthy: '\u25CF', watch: '\u25B2', concern: '\u25A0', demo: '' };
    return '<span class="ss-badge ' + kind + '">' + (glyphMap[kind] ? glyphMap[kind] + ' ' : '') + escapeHtml(label) + '</span>';
  }

  function pageHeader(kicker, page, right) {
    return (
      '<div class="ss-header-row">' +
      '<h1 class="ss-header"><span class="k">' + escapeHtml(kicker) + '</span><span class="p">' + escapeHtml(page) + '</span></h1>' +
      '<div class="header-right">' + (right || '') + '</div>' +
      '</div>'
    );
  }

  function renderMetrics(metrics) {
    return metrics
      .map(function (m) {
        var cls = m.value === '\u2014' ? 'metric-value empty' : 'metric-value';
        return (
          '<div class="metric-item">' +
          '<span class="metric-label">' + escapeHtml(m.label) + '</span>' +
          '<span class="' + cls + '">' + escapeHtml(m.value) + '</span>' +
          '</div>'
        );
      })
      .join('');
  }

  function moduleSpark(key) {
    var svg = sparkSVG(MODULES[key].spark);
    return svg ? '<div class="module-spark">' + svg + '</div>' : '';
  }

  /* ============================================================
     Page renderers
     ============================================================ */

  function renderOverview() {
    var s = loadSettings();
    var kicker = 'Game OS \u00b7 ' + (s.gameTitle || 'Demo Game');

    var tiles = MODULE_KEYS.map(function (key) {
      var m = MODULES[key];
      var url = getModuleUrl(key);
      var kind = m.status === 'nodata' ? 'demo' : m.status;
      return (
        '<div class="ss-card">' +
        '<div class="module-head">' +
        '<div>' +
        '<h3>' + escapeHtml(m.name) + ' \u2014 ' + escapeHtml(m.toolName) + '</h3>' +
        '<div class="module-q">' + escapeHtml(m.cxoQuestion) + '</div>' +
        '</div>' +
        statusBadge(kind, m.statusLabel) +
        '</div>' +
        '<div class="metrics-grid">' + renderMetrics(m.metrics) + '</div>' +
        moduleSpark(key) +
        '<div class="card-actions">' +
        '<a class="ss-btn" href="' + url + '" target="_blank" rel="noopener">Open module \u2192</a>' +
        '<a class="ss-btn ghost" href="#/' + key + '">Detail page \u2192</a>' +
        '</div>' +
        '<div class="card-note">' + escapeHtml(m.detailNote) + '</div>' +
        '</div>'
      );
    }).join('');

    return (
      pageHeader(kicker, 'Studio Health', '<span class="ss-demo">Demo data</span>') +
      '<div class="module-grid">' + tiles + '</div>' +
      '<div class="ss-card watching-panel">' +
      '<h3>What Game OS is watching for you</h3>' +
      '<div class="watching-list">' +
      '<div class="watching-item"><span class="watching-module">Community:</span> Is the playtest community giving useful, directional feedback that surfaces systemic issues before launch?</div>' +
      '<div class="watching-item"><span class="watching-module">Pricing:</span> Is your launch price, discount plan, and regional strategy defensible against comparable titles in the same genre and scope?</div>' +
      '<div class="watching-item"><span class="watching-module">PMF:</span> 30 days post-launch, are acquisition, engagement, and satisfaction signals pointing toward product-market fit?</div>' +
      '</div>' +
      '<div class="sync-note">Last synced: 2m ago (demo)</div>' +
      '</div>'
    );
  }

  function renderDetailPage(key) {
    var m = MODULES[key];
    var url = getModuleUrl(key);
    var s = loadSettings();
    var kicker = 'Game OS \u00b7 ' + (s.gameTitle || 'Demo Game');
    var badge = statusBadge(m.status === 'nodata' ? 'demo' : m.status, m.statusLabel);
    return (
      pageHeader(kicker, m.name) +
      '<div>' + badge + '</div>' +
      '<p class="detail-intro">' + escapeHtml(m.description) + '</p>' +
      '<div><a class="ss-btn" href="' + url + '" target="_blank" rel="noopener">Open ' + escapeHtml(m.toolName) + ' in full \u2192</a></div>' +
      '<div class="detail-layout">' +
      '<div>' +
      '<div class="ss-card">' +
      '<h3>' + escapeHtml(m.toolName) + '</h3>' +
      '<div class="ss-meta">Embedded live tool</div>' +
      '<div class="iframe-wrapper ss-chart">' +
      '<iframe src="' + url + '" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" loading="lazy" title="' + escapeHtml(m.toolName) + '"></iframe>' +
      '<div class="iframe-note">Some tools require sign-in and may not load fully here. Use \u201cOpen in full\u201d for the complete experience.</div>' +
      '</div>' +
      '<div class="collapsible">' +
      '<button class="collapsible-toggle" onclick="this.classList.toggle(\'open\'); this.nextElementSibling.classList.toggle(\'open\')">' +
      '<span class="arrow">\u203A</span> How to read this' +
      '</button>' +
      '<div class="collapsible-content">' + escapeHtml(m.howToRead) + '</div>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div class="ss-card key-readings">' +
      '<h3>Key readings</h3>' +
      '<ul>' + m.keyReadings.map(function (r) { return '<li>' + escapeHtml(r) + '</li>'; }).join('') + '</ul>' +
      '</div>' +
      '</div>'
    );
  }

  function renderSettings() {
    var s = loadSettings();
    var kicker = 'Game OS \u00b7 ' + (s.gameTitle || 'Demo Game');

    var moduleFields = MODULE_KEYS.map(function (key) {
      var m = MODULES[key];
      var url = s.moduleUrls[key] || DEFAULT_MODULE_URLS[key];
      return (
        '<div class="form-group">' +
        '<label class="ss-field-label" for="url-' + key + '">' + escapeHtml(m.name) + ' (' + escapeHtml(m.toolName) + ') URL</label>' +
        '<input class="form-input" type="text" id="url-' + key + '" value="' + escapeHtml(url) + '">' +
        '<span class="form-help">Live tool URL. Change only if the tool moves.</span>' +
        '</div>'
      );
    }).join('');

    return (
      pageHeader(kicker, 'Settings') +
      '<p class="settings-intro">Configure your studio profile and module data sources. All settings are stored locally in your browser.</p>' +
      '<div class="ss-card">' +
      '<h3>Studio profile</h3>' +
      '<div class="form-body">' +
      '<div class="form-group"><label class="ss-field-label" for="studioName">Studio name</label>' +
      '<input class="form-input" type="text" id="studioName" value="' + escapeHtml(s.studioName) + '" placeholder="Enter studio name"></div>' +
      '<div class="form-group"><label class="ss-field-label" for="gameTitle">Primary game title</label>' +
      '<input class="form-input" type="text" id="gameTitle" value="' + escapeHtml(s.gameTitle) + '"></div>' +
      '<div class="form-group"><label class="ss-field-label" for="steamAppId">Steam AppID (optional)</label>' +
      '<input class="form-input" type="text" id="steamAppId" value="' + escapeHtml(s.steamAppId) + '" placeholder="e.g. 1234560"></div>' +
      '<div class="form-group"><label class="ss-field-label" for="discordNickname">Discord server nickname (display only)</label>' +
      '<input class="form-input" type="text" id="discordNickname" value="' + escapeHtml(s.discordNickname) + '" placeholder="e.g. MyStudio Playtest"></div>' +
      '</div>' +
      '</div>' +
      '<div class="ss-card">' +
      '<h3>Module data sources</h3>' +
      '<div class="form-body">' + moduleFields + '</div>' +
      '</div>' +
      '<div><button class="ss-btn ghost" id="btnReset">Reset to defaults</button></div>'
    );
  }

  function renderAbout() {
    var s = loadSettings();
    var kicker = 'Game OS \u00b7 ' + (s.gameTitle || 'Demo Game');
    return (
      pageHeader(kicker, 'About') +
      '<p class="about-para">Game OS is a Llama &amp; Griffin operator surface for indie studio executives. It answers three CXO-level questions on one screen:</p>' +
      '<div class="ss-card">' +
      '<div class="watching-list">' +
      '<div class="watching-item"><span class="watching-module">Are players engaging?</span> \u2014 community and playtest signal (Chicken Br\u00fbl\u00e9e).</div>' +
      '<div class="watching-item"><span class="watching-module">Is the price right?</span> \u2014 pricing, discount, wishlist, and regional strategy (Comp Analysis / SEB).</div>' +
      '<div class="watching-item"><span class="watching-module">Are we hitting product-market fit?</span> \u2014 post-launch 30-day PMF signal (MTG PMF Analyzer).</div>' +
      '</div>' +
      '</div>' +
      '<p class="about-para">Each module links out to a live Llama &amp; Griffin tool that does the actual analysis. Game OS wraps, links, and summarizes so you can scan the studio\u2019s health in one view.</p>' +
      '<div class="detail-layout">' +
      '<div class="ss-card about-section"><h3>Credits</h3><p class="about-credits">Abbas Saleem Khan, Sebastian Cardoso, Jay Rooney.</p></div>' +
      '<div class="ss-card about-section"><h3>Links</h3><div class="about-links">' +
      '<a href="https://llamagriffin.com" target="_blank" rel="noopener">llamagriffin.com</a>' +
      '<a href="https://recognizingpatterns.substack.com" target="_blank" rel="noopener">recognizingpatterns.substack.com</a>' +
      '<a href="https://cal.com/llamagriffin/30min" target="_blank" rel="noopener">Book a conversation</a>' +
      '</div></div>' +
      '</div>'
    );
  }

  /* ============================================================
     Router
     ============================================================ */

  function route() {
    var hash = (window.location.hash.replace('#/', '') || 'overview').split('?')[0];
    var content = document.getElementById('content');

    switch (hash) {
      case 'community':
      case 'pricing':
      case 'pmf':
        content.innerHTML = renderDetailPage(hash);
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
      if (item.getAttribute('data-route') === current) {
        item.setAttribute('aria-current', 'page');
      } else {
        item.removeAttribute('aria-current');
      }
    });
  }

  /* ============================================================
     Settings events
     ============================================================ */

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

  /* ============================================================
     Session — unified identity (GET /api/me)
     ============================================================ */

  function loadSession() {
    fetch('/api/me', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.user) return;
        var info = document.getElementById('sessionInfo');
        var acct = document.getElementById('accountLink');
        var label = data.user.studioName || data.user.name || data.user.email || '';
        if (info && label) {
          info.textContent = label;
          info.hidden = false;
        }
        if (acct) acct.hidden = false;
      })
      .catch(function () { /* signed out — header stays as-is */ });
  }

  window.addEventListener('hashchange', route);
  window.addEventListener('DOMContentLoaded', function () {
    route();
    loadSession();
  });
})();
