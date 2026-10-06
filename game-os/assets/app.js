(function () {
  'use strict';

  /* ============================================================
     Game OS demo data
     All figures are demo data and are labelled as such on screen.
     ============================================================ */

  var MODULES = {
    community: {
      name: 'Community',
      toolName: 'Chicken Brûlée',
      url: 'https://llamagriffin.com/game-os/chicken-brulee/',
      label: '01 — COMMUNITY',
      kicker: 'before you ship the wrong loop.',
      title: 'Community signal.',
      status: 'watch',
      statusLabel: 'Watch',
      delta: { dir: 'down', text: '41%', note: 'onboarding-flagged · last 7 days' },
      description:
        'Is the playtest community giving useful, directional feedback? Chicken Brûlée scans your Discord playtest channels for recurring patterns, onboarding friction, and flagged comments that need operator attention.',
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
      label: '02 — PRICING',
      kicker: 'before you discount.',
      title: 'Pricing defensibility.',
      status: 'healthy',
      statusLabel: 'Healthy',
      delta: { dir: 'up', text: '$21.41', note: 'required launch price · four-variable score' },
      description:
        'Is our launch price, discount plan, and regional strategy defensible? SEB is the full indie pricing workbook: comparable-game research, four-variable pricing score, score-to-tier mapping, and discount staircase planning.',
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
      url: 'https://llamagriffin.com/game-os/PMF',
      label: '03 — PMF',
      kicker: '30 days after launch.',
      title: 'Product-market fit.',
      status: 'nodata',
      statusLabel: 'No data',
      delta: null,
      description:
        '30 days in, is this game showing PMF signals, and where is the weakness? The MTG PMF Analyzer evaluates three lens scores (acquisition, engagement, satisfaction) on Steam-native public data, with confidence bands and moat features like refund-window playtime analysis.',
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
    community: 'https://llamagriffin.com/game-os/chicken-brulee/',
    pricing: 'https://llamagriffin.com/game-os/price-calc/',
    pmf: 'https://llamagriffin.com/game-os/PMF',
  };

  var DEFAULT_SETTINGS = {
    studioName: '',
    gameTitle: 'Demo Game',
    steamAppId: '',
    discordNickname: '',
    region: 'all',
    period: '30d',
    moduleUrls: Object.assign({}, DEFAULT_MODULE_URLS),
  };

  /* ------------------------------------------------------------
     Dashboard demo series (weekly, 12 weeks). Filters reshape these.
     ------------------------------------------------------------ */

  var DASH = {
    wishlist: {
      label: '04 — WISHLIST',
      title: 'Next Fest drove a 3-week spike; organic adds kept climbing after it',
      meta: 'Source: Steamworks wishlist report \u00b7 demo data \u00b7 weekly totals',
      xLabels: ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8', 'W9', 'W10', 'W11', 'W12'],
      benchmark: { name: 'Genre median', value: 320 },
      series: [
        { name: 'Organic', slot: 1, values: [182, 196, 210, 205, 231, 250, 243, 268, 279, 295, 305, 318] },
        { name: 'Next Fest', slot: 2, values: [0, 0, 0, 0, 96, 620, 830, 410, 190, 130, 110, 100] },
        { name: 'Paid', slot: 3, values: [140, 150, 130, 160, 155, 148, 170, 155, 168, 160, 152, 158] },
      ],
    },
    regional: {
      label: '07 — REGIONAL',
      title: 'Gross revenue by region',
      meta: 'Est. gross before Steam\u2019s 30% \u00b7 last 30 days \u00b7 demo data',
      rows: [
        { name: 'United States', value: 42100, display: '$42.1K' },
        { name: 'Europe (EUR)', value: 18600, display: '$18.6K' },
        { name: 'United Kingdom', value: 7400, display: '$7.4K' },
        { name: 'Saudi Arabia (SAR)', value: 4900, display: '$4.9K' },
        { name: 'MENA-USD bloc', value: 3800, display: '$3.8K' },
        { name: 'Other', value: 7400, display: '$7.4K' },
      ],
    },
  };

  var KPIS = {
    base: [
      { key: 'wishlists', label: 'Wishlists', period: 'last 30 days', value: '48.2K', delta: { dir: 'up', text: '+18%' } },
      { key: 'gross', label: 'Est. gross revenue', period: 'last 30 days', value: '$84.2K', delta: { dir: 'up', text: '+6%' } },
      { key: 'net', label: 'Net to developer', period: 'after 30% Steam share', value: '$58.9K', delta: { dir: 'up', text: '+6%' } },
      { key: 'refund', label: 'Refund rate', period: 'last 30 days', value: '12.4%', delta: { dir: 'down', text: '+3.1 pts' }, status: { kind: 'watch', label: 'Watch' } },
    ],
  };

  /* A small, honest filter effect over the demo data (clearly directional). */
  var REGION_MULT = {
    all: 1,
    na: 0.55,
    eu: 0.3,
    uk: 0.09,
    mena: 0.11,
    other: 0.14,
  };

  var PERIOD_MULT = { '7d': 0.28, '30d': 1, '90d': 2.7 };

  var COMPS = [
    { comp: 'Comp A', released: 'Mar 2025', price: '$14.99', reviews: '4,812', fit: { kind: 'healthy', label: 'Strong' } },
    { comp: 'Comp B', released: 'Nov 2024', price: '$19.99', reviews: '1,207', fit: { kind: 'watch', label: 'Partial' } },
    { comp: 'Comp C', released: 'Jul 2025', price: '$9.99', reviews: '22,340', fit: { kind: 'healthy', label: 'Strong' } },
  ];

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

  function fmtNum(n) {
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /* ============================================================
     Chart marks — design system rules:
     lines 2px straight; markers 8px at last point only;
     bars <=24px, radius-sm on the data end only; gridlines
     horizontal only; benchmark dashed data-other; one y-axis.
     ============================================================ */

  function lineChart(spec, tableId) {
    var W = 1180,
      H = 300,
      padL = 44,
      padR = 150,
      padT = 22,
      padB = 28;
    var plotW = W - padL - padR;
    var plotH = H - padT - padB;
    var n = spec.xLabels.length;
    var maxV = 0;
    spec.series.forEach(function (s) {
      s.values.forEach(function (v) {
        if (v > maxV) maxV = v;
      });
    });
    if (spec.benchmark) maxV = Math.max(maxV, spec.benchmark.value);
    var ticks = niceTicks(maxV, 5);
    var top = ticks[ticks.length - 1];
    function xi(i) {
      return padL + (i / (n - 1)) * plotW;
    }
    function yi(v) {
      return padT + plotH - (v / top) * plotH;
    }

    var grid = '';
    ticks.forEach(function (t) {
      var y = yi(t).toFixed(1);
      grid += '<line class="grid" x1="' + padL + '" x2="' + (padL + plotW) + '" y1="' + y + '" y2="' + y + '"/>';
      grid += '<text class="axis" x="' + (padL - 8) + '" y="' + (Number(y) + 4).toFixed(1) + '" text-anchor="end">' + fmtNum(t) + '</text>';
    });

    var xlabels = '';
    for (var i = 0; i < n; i++) {
      if (i % 2 === 0 || i === n - 1) {
        xlabels += '<text class="axis" x="' + xi(i).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + spec.xLabels[i] + '</text>';
      }
    }

    var marks = '';
    var endLabels = '';
    spec.series.forEach(function (s, si) {
      var pts = s.values
        .map(function (v, i) {
          return xi(i).toFixed(1) + ',' + yi(v).toFixed(1);
        })
        .join(' ');
      var cls = 's' + s.slot;
      marks += '<polyline class="line ' + cls + '" points="' + pts + '"/>';
      var lastV = s.values[n - 1];
      var lx = xi(n - 1);
      var ly = yi(lastV);
      marks += '<circle class="dot f' + s.slot + '" cx="' + lx.toFixed(1) + '" cy="' + ly.toFixed(1) + '" r="4"/>';
      endLabels +=
        '<text class="lbl" x="' + (lx + 10).toFixed(1) + '" y="' + (ly + 4).toFixed(1) + '">' +
        escapeHtml(s.name) +
        ' <tspan class="val">' +
        fmtNum(lastV) +
        '</tspan></text>';
    });

    var bench = '';
    if (spec.benchmark) {
      var by = yi(spec.benchmark.value).toFixed(1);
      bench =
        '<polyline class="bench so" points="' + padL + ',' + by + ' ' + (padL + plotW) + ',' + by + '"/>' +
        '<text class="lbl" x="' + (padL + plotW + 10) + '" y="' + (Number(by) + 4).toFixed(1) + '">' + escapeHtml(spec.benchmark.name) + '</text>';
    }

    var legend = legendHTML(spec.series, spec.benchmark);

    return (
      '<div class="gos-chart" data-chart>' +
      '<div class="chart-toolbar"><button class="gos-btn ghost chart-toggle" data-target="' + tableId + '">View as table</button></div>' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + escapeHtml(spec.title) + '">' +
      grid +
      xlabels +
      bench +
      marks +
      endLabels +
      '</svg>' +
      legend +
      '<span class="gos-meta chart-meta">' + escapeHtml(spec.meta) + '</span>' +
      chartTable(tableId, spec) +
      '</div>'
    );
  }

  function rankedBar(spec, tableId) {
    var rowH = 32,
      barH = 22,
      gap = 10,
      labelW = 150,
      W = 640;
    var maxV = 0;
    spec.rows.forEach(function (r) {
      if (r.value > maxV) maxV = r.value;
    });
    var plotW = W - labelW - 70;
    var H = spec.rows.length * rowH;
    var bars = '';
    spec.rows.forEach(function (r, i) {
      var y = i * rowH;
      var w = (r.value / maxV) * plotW;
      var isOther = r.name === 'Other';
      var cls = isOther ? 'fo' : 'f1';
      var midY = y + gap / 2;
      bars +=
        '<text class="lbl" x="0" y="' + (midY + barH / 2 + 4).toFixed(1) + '">' + escapeHtml(r.name) + '</text>';
      bars +=
        '<path class="' + cls + '" d="M' + labelW + ',' + midY + ' h' + w.toFixed(1) +
        ' a2,2 0 0 1 2,2 v' + (barH - 4) + ' a2,2 0 0 1 -2,2 h-' + w.toFixed(1) + ' z"/>';
      bars +=
        '<text class="val" x="' + (labelW + w + 8).toFixed(1) + '" y="' + (midY + barH / 2 + 4).toFixed(1) + '">' + escapeHtml(r.display) + '</text>';
    });
    return (
      '<div class="gos-chart" data-chart>' +
      '<div class="chart-toolbar"><button class="gos-btn ghost chart-toggle" data-target="' + tableId + '">View as table</button></div>' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + escapeHtml(spec.title) + '">' + bars + '</svg>' +
      '<span class="gos-meta chart-meta">' + escapeHtml(spec.meta) + '</span>' +
      chartTable(tableId, spec) +
      '</div>'
    );
  }

  function legendHTML(series, benchmark) {
    var items = series
      .map(function (s) {
        return '<span><i style="background:var(--data-' + s.slot + ')"></i>' + escapeHtml(s.name) + '</span>';
      })
      .join('');
    if (benchmark) {
      items += '<span><i style="background:var(--data-other)"></i>' + escapeHtml(benchmark.name) + ' (dashed)</span>';
    }
    return '<div class="gos-legend">' + items + '</div>';
  }

  function chartTable(tableId, spec) {
    if (spec.rows) {
      var rhead = '<tr><th>Region</th><th class="num">Value</th></tr>';
      var rbody = spec.rows
        .map(function (r) {
          return '<tr><td>' + escapeHtml(r.name) + '</td><td class="num">' + escapeHtml(r.display) + '</td></tr>';
        })
        .join('');
      return (
        '<div class="chart-table" id="' + tableId + '" hidden>' +
        '<table class="gos-table"><thead>' + rhead + '</thead><tbody>' + rbody + '</tbody></table>' +
        '</div>'
      );
    }
    var head = '<tr><th>Week</th>';
    spec.series.forEach(function (s) {
      head += '<th class="num">' + escapeHtml(s.name) + '</th>';
    });
    head += '</tr>';
    var body = '';
    for (var i = 0; i < spec.xLabels.length; i++) {
      body += '<tr><td>' + spec.xLabels[i] + '</td>';
      spec.series.forEach(function (s) {
        body += '<td class="num">' + fmtNum(s.values[i]) + '</td>';
      });
      body += '</tr>';
    }
    return (
      '<div class="chart-table" id="' + tableId + '" hidden>' +
      '<table class="gos-table"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>' +
      '</div>'
    );
  }

  function niceTicks(max, count) {
    var raw = max / count;
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var norm = raw / mag;
    var step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
    step *= mag;
    var ticks = [];
    for (var v = 0; v <= max + step * 0.001; v += step) ticks.push(v);
    return ticks;
  }

  /* ============================================================
     Component helpers
     ============================================================ */

  function statusBadge(kind, label) {
    var glyphMap = { healthy: '\u25CF', watch: '\u25B2', concern: '\u25A0', demo: '' };
    return '<span class="gos-badge ' + kind + '">' + (glyphMap[kind] ? glyphMap[kind] + ' ' : '') + escapeHtml(label) + '</span>';
  }

  function sectionHeading(label, title, kicker, right) {
    return (
      '<div class="page-head">' +
      '<div class="gos-heading">' +
      '<div class="gos-chevrons" aria-hidden="true"><i></i><i></i><i></i><i></i></div>' +
      '<div class="gos-label heading-label">' + escapeHtml(label) + '</div>' +
      '<h1>' + escapeHtml(title) + '</h1>' +
      '<em>' + escapeHtml(kicker) + '</em>' +
      '</div>' +
      (right || '') +
      '</div>'
    );
  }

  function kpiRow(settings) {
    var region = REGION_MULT[settings.region] != null ? REGION_MULT[settings.region] : 1;
    var period = PERIOD_MULT[settings.period] != null ? PERIOD_MULT[settings.period] : 1;
    var mult = region * period;
    var tiles = KPIS.base
      .map(function (k) {
        var scaled = scaleKpi(k.key, mult);
        var status = k.status ? statusBadge(k.status.kind, k.status.label) : '';
        return (
          '<div class="gos-kpi">' +
          '<div class="gos-label">' + escapeHtml(k.label) + '</div>' +
          '<div class="v">' + scaled + '</div>' +
          '<div class="d">' +
          '<span class="' + (k.delta.dir === 'up' ? 'gos-up' : 'gos-down') + '">' +
          (k.delta.dir === 'up' ? '\u25B2 ' : '\u25BC ') + escapeHtml(k.delta.text) + '</span>' +
          '<span>' + escapeHtml(k.period) + '</span>' +
          status +
          '</div>' +
          '</div>'
        );
      })
      .join('');
    return '<div class="gos-grid kpi-grid">' + tiles + '</div>';
  }

  function scaleKpi(key, mult) {
    if (key === 'wishlists') return fmtNum(Math.round(48200 * mult)).replace(/^/, '') + (Math.round(48200 * mult) >= 1000 ? '' : '');
    if (key === 'gross') return '$' + (84.2 * mult).toFixed(1) + 'K';
    if (key === 'net') return '$' + (58.9 * mult).toFixed(1) + 'K';
    return '12.4%';
  }

  function filterBar(settings) {
    function field(id, label, options) {
      var opts = options
        .map(function (o) {
          return '<option value="' + o.value + '"' + (o.value === settings[id] ? ' selected' : '') + '>' + escapeHtml(o.label) + '</option>';
        })
        .join('');
      return (
        '<div class="gos-field">' +
        '<label class="gos-label" for="f-' + id + '">' + escapeHtml(label) + '</label>' +
        '<select class="gos-input" id="f-' + id + '" data-filter="' + id + '">' + opts + '</select>' +
        '</div>'
      );
    }
    return (
      '<div class="gos-filters filter-bar">' +
      field('period', 'Date range', [
        { value: '7d', label: 'Last 7 days' },
        { value: '30d', label: 'Last 30 days' },
        { value: '90d', label: 'Last 90 days' },
      ]) +
      '<div class="gos-field"><label class="gos-label">Game</label><span class="gos-input static">Demo Game <span aria-hidden="true">\u25BE</span></span></div>' +
      field('region', 'Region', [
        { value: 'all', label: 'All regions' },
        { value: 'na', label: 'North America' },
        { value: 'eu', label: 'Europe' },
        { value: 'uk', label: 'United Kingdom' },
        { value: 'mena', label: 'MENA' },
        { value: 'other', label: 'Other' },
      ]) +
      '<button class="gos-btn ghost push-right" id="downloadCsv">Download CSV</button>' +
      '</div>'
    );
  }

  /* ============================================================
     Page renderers
     ============================================================ */

  function renderOverview() {
    var settings = loadSettings();

    var wishlistSpec = Object.assign({}, DASH.wishlist);
    var regionalSpec = Object.assign({}, DASH.regional);

    var supportLeft =
      '<div class="gos-card gos-chart">' +
      '<div class="gos-label">' + regionalSpec.label + '</div>' +
      '<h3>' + escapeHtml(regionalSpec.title) + '</h3>' +
      '<div class="chart-body">' + rankedBar(regionalSpec, 'tbl-regional') + '</div>' +
      '</div>';

    var compRows = COMPS.map(function (c) {
      return (
        '<tr><td>' + escapeHtml(c.comp) + '</td><td>' + escapeHtml(c.released) + '</td>' +
        '<td class="num">' + escapeHtml(c.price) + '</td>' +
        '<td class="num">' + escapeHtml(c.reviews) + '</td>' +
        '<td>' + statusBadge(c.fit.kind, c.fit.label) + '</td></tr>'
      );
    }).join('');

    var supportRight =
      '<div class="gos-card">' +
      '<div class="gos-label">01 — COMP</div>' +
      '<h3>Comps set your price corridor</h3>' +
      '<div class="chart-body"><table class="gos-table">' +
      '<thead><tr><th>Comp</th><th>Released</th><th class="num">Launch price</th><th class="num">Reviews</th><th>Fit</th></tr></thead>' +
      '<tbody>' + compRows + '</tbody></table>' +
      '<div class="gos-meta table-meta">3 of 8\u201312 comps \u00b7 provisional</div>' +
      '</div></div>';

    var modules = MODULE_KEYS.map(function (key) {
      var m = MODULES[key];
      var url = getModuleUrl(key);
      var delta = m.delta
        ? '<div class="d"><span class="' + (m.delta.dir === 'up' ? 'gos-up' : 'gos-down') + '">' +
          (m.delta.dir === 'up' ? '\u25B2 ' : '\u25BC ') + escapeHtml(m.delta.text) + '</span>' +
          '<span>' + escapeHtml(m.delta.note) + '</span></div>'
        : '';
      return (
        '<div class="gos-card module-card">' +
        '<div class="module-head">' +
        '<div><div class="gos-label">' + m.label + '</div><h3>' + escapeHtml(m.name) + ' \u2014 ' + escapeHtml(m.toolName) + '</h3></div>' +
        statusBadge(m.status === 'nodata' ? 'demo' : m.status, m.statusLabel) +
        '</div>' +
        delta +
        '<div class="card-actions">' +
        '<a class="gos-btn ghost" href="' + url + '" target="_blank" rel="noopener">Open module \u2192</a>' +
        '<a href="#/' + key + '">Detail page \u2192</a>' +
        '</div>' +
        '</div>'
      );
    }).join('');

    return (
      sectionHeading('00 — DASHBOARD', 'Studio health, one screen.', 'Read it before you spend.', statusBadge('demo', 'Demo data')) +
      filterBar(settings) +
      kpiRow(settings) +
      '<div class="gos-card gos-chart">' +
      '<div class="gos-label">' + wishlistSpec.label + '</div>' +
      '<h3>' + escapeHtml(wishlistSpec.title) + '</h3>' +
      '<div class="chart-body">' + lineChart(wishlistSpec, 'tbl-wishlist') + '</div>' +
      '</div>' +
      '<div class="support-grid">' + supportLeft + supportRight + '</div>' +
      '<div class="gos-card watching-panel">' +
      '<h3>What Game OS is watching for you</h3>' +
      '<div class="watching-list">' +
      '<div class="watching-item"><span class="watching-module">Community:</span> Is the playtest community giving useful, directional feedback that surfaces systemic issues before launch?</div>' +
      '<div class="watching-item"><span class="watching-module">Pricing:</span> Is your launch price, discount plan, and regional strategy defensible against comparable titles in the same genre and scope?</div>' +
      '<div class="watching-item"><span class="watching-module">PMF:</span> 30 days post-launch, are acquisition, engagement, and satisfaction signals pointing toward product-market fit?</div>' +
      '</div>' +
      '<div class="sync-note">Last synced: 2m ago (demo)</div>' +
      '</div>' +
      '<div class="gos-grid module-grid">' + modules + '</div>'
    );
  }

  function renderDetailPage(key) {
    var m = MODULES[key];
    var url = getModuleUrl(key);
    var badge = statusBadge(m.status === 'nodata' ? 'demo' : m.status, m.statusLabel);
    return (
      sectionHeading(m.label, m.title, m.kicker, badge) +
      '<p class="detail-intro">' + escapeHtml(m.description) + '</p>' +
      '<div><a class="gos-btn" href="' + url + '" target="_blank" rel="noopener">Open ' + escapeHtml(m.toolName) + ' in full \u2192</a></div>' +
      '<div class="detail-layout">' +
      '<div>' +
      '<div class="gos-card">' +
      '<div class="gos-label">EMBEDDED TOOL</div>' +
      '<h3>' + escapeHtml(m.toolName) + '</h3>' +
      '<div class="chart-body iframe-wrapper">' +
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
      '<div class="gos-card key-readings">' +
      '<h3>Key readings</h3>' +
      '<ul>' + m.keyReadings.map(function (r) { return '<li>' + escapeHtml(r) + '</li>'; }).join('') + '</ul>' +
      '</div>' +
      '</div>'
    );
  }

  function renderSettings() {
    var s = loadSettings();

    var moduleFields = MODULE_KEYS.map(function (key) {
      var m = MODULES[key];
      var url = s.moduleUrls[key] || DEFAULT_MODULE_URLS[key];
      return (
        '<div class="form-group">' +
        '<label class="gos-label" for="url-' + key + '">' + escapeHtml(m.name) + ' (' + escapeHtml(m.toolName) + ') URL</label>' +
        '<input class="form-input" type="text" id="url-' + key + '" value="' + escapeHtml(url) + '">' +
        '<span class="form-help">Live tool URL. Change only if the tool moves.</span>' +
        '</div>'
      );
    }).join('');

    return (
      sectionHeading('04 — SETTINGS', 'Studio profile.', 'stored in this browser.') +
      '<p class="settings-intro">Configure your studio profile and module data sources. All settings are stored locally in your browser.</p>' +
      '<div class="gos-card">' +
      '<h3>Studio profile</h3>' +
      '<div class="form-body">' +
      '<div class="form-group"><label class="gos-label" for="studioName">Studio name</label>' +
      '<input class="form-input" type="text" id="studioName" value="' + escapeHtml(s.studioName) + '" placeholder="Enter studio name"></div>' +
      '<div class="form-group"><label class="gos-label" for="gameTitle">Primary game title</label>' +
      '<input class="form-input" type="text" id="gameTitle" value="' + escapeHtml(s.gameTitle) + '"></div>' +
      '<div class="form-group"><label class="gos-label" for="steamAppId">Steam AppID (optional)</label>' +
      '<input class="form-input" type="text" id="steamAppId" value="' + escapeHtml(s.steamAppId) + '" placeholder="e.g. 1234560"></div>' +
      '<div class="form-group"><label class="gos-label" for="discordNickname">Discord server nickname (display only)</label>' +
      '<input class="form-input" type="text" id="discordNickname" value="' + escapeHtml(s.discordNickname) + '" placeholder="e.g. MyStudio Playtest"></div>' +
      '</div>' +
      '</div>' +
      '<div class="gos-card">' +
      '<h3>Module data sources</h3>' +
      '<div class="form-body">' + moduleFields + '</div>' +
      '</div>' +
      '<div><button class="gos-btn ghost" id="btnReset">Reset to defaults</button></div>'
    );
  }

  function renderAbout() {
    return (
      sectionHeading('05 — ABOUT', 'Game OS.', 'the operator surface.') +
      '<p class="about-para">Game OS is a Llama &amp; Griffin operator surface for indie studio executives. It answers three CXO-level questions on one screen:</p>' +
      '<div class="gos-card">' +
      '<div class="watching-list">' +
      '<div class="watching-item"><span class="watching-module">Are players engaging?</span> \u2014 community and playtest signal (Chicken Br\u00fbl\u00e9e).</div>' +
      '<div class="watching-item"><span class="watching-module">Is the price right?</span> \u2014 pricing, discount, wishlist, and regional strategy (Comp Analysis / SEB).</div>' +
      '<div class="watching-item"><span class="watching-module">Are we hitting product-market fit?</span> \u2014 post-launch 30-day PMF signal (MTG PMF Analyzer).</div>' +
      '</div>' +
      '</div>' +
      '<p class="about-para">Each module links out to a live Llama &amp; Griffin tool that does the actual analysis. Game OS wraps, links, and summarizes so you can scan the studio\u2019s health in one view.</p>' +
      '<div class="support-grid">' +
      '<div class="gos-card about-section"><h3>Credits</h3><p class="about-credits">Abbas Saleem Khan, Sebastian Cardoso, Jay Rooney.</p></div>' +
      '<div class="gos-card about-section"><h3>Links</h3><div class="about-links">' +
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
        bindOverviewEvents();
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
     Events
     ============================================================ */

  function bindOverviewEvents() {
    var content = document.getElementById('content');

    content.querySelectorAll('[data-filter]').forEach(function (el) {
      el.addEventListener('change', function () {
        var s = loadSettings();
        s[el.getAttribute('data-filter')] = el.value;
        saveSettings(s);
        content.innerHTML = renderOverview();
        bindOverviewEvents();
      });
    });

    var csv = document.getElementById('downloadCsv');
    if (csv) {
      csv.addEventListener('click', function () {
        var spec = DASH.wishlist;
        var lines = ['Week,' + spec.series.map(function (s) { return s.name; }).join(',')];
        spec.xLabels.forEach(function (x, i) {
          lines.push(x + ',' + spec.series.map(function (s) { return s.values[i]; }).join(','));
        });
        var blob = new Blob([lines.join('\n')], { type: 'text/csv' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'game-os-wishlist.csv';
        a.click();
        URL.revokeObjectURL(a.href);
      });
    }

    content.querySelectorAll('.chart-toggle').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var t = document.getElementById(btn.getAttribute('data-target'));
        if (!t) return;
        var show = t.hasAttribute('hidden');
        if (show) {
          t.removeAttribute('hidden');
          btn.textContent = 'View as chart';
        } else {
          t.setAttribute('hidden', '');
          btn.textContent = 'View as table';
        }
      });
    });
  }

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

  window.addEventListener('hashchange', route);
  window.addEventListener('DOMContentLoaded', route);
})();
