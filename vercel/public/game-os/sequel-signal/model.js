/* Sequel Signal — pure logic for the evidence board (UMD: window.SequelModel / module.exports).
 * Method follows §5.8 of docs/MARKETING-TOOLS-BRIEFS.md. There is no score and no computed verdict:
 *   1. Did marketing find the audience?  The game's latest Reach signals from the ledger.
 *   2. Did the audience stick?           The game's latest Resonance signals.
 *   3. Expectation gap.                  Sentiment Radar's expectation_gap_flag rows, when they exist.
 *   4. The market now.                   Market Scope re-run today for the tags on the game's last market row.
 * "Start the next game" builds the bodies for POST /api/games and POST /api/games/:id/thesis. Nothing here writes a signal.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SequelModel = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var TOOL_ID = "sequel-signal";

  // The daily Steam snapshot predates meta.half, so its keys are labelled here (agreed with Jay, 26 Nov 2026).
  // Review counts measure reach; positive shares measure resonance. steam_players stays unlabelled on purpose.
  var SNAPSHOT_HALF = {
    steam_reviews: "reach",
    steam_reviews_30d: "reach",
    steam_review_pct: "resonance",
    steam_review_pct_30d: "resonance",
  };
  var HALVES = { reach: 1, resonance: 1, both: 1, market: 1 };

  // The Sentiment Radar phase 2 key, and the two phase 1 signals that sit closest to it.
  var GAP_KEY = "expectation_gap_flag";
  var GAP_NEAREST = ["neg_review_early_share", "sentiment_divergence"];

  // Signals measured in percentage points rather than as a share.
  var POINTS = { sentiment_divergence: 1 };

  // Where each tool lives, so every row can link back to the tool that made it.
  var TOOLS = {
    steam: { name: "Daily Steam snapshot", path: "/game-os/ledger-view" },
    "sentiment-radar": { name: "Sentiment Radar", path: "/game-os/sentiment-radar" },
    "page-engine": { name: "Page Engine", path: "/game-os/page-engine" },
    "creator-match": { name: "Creator Match", path: "/game-os/creator-match" },
    "festival-radar": { name: "Festival Radar", path: "/game-os/festival-radar" },
    "demo-command": { name: "Demo Command", path: "/game-os/demo-command" },
    "test-loop": { name: "Test Loop", path: "/game-os/test-loop" },
    "long-tail-engine": { name: "Long Tail Engine", path: "/game-os/long-tail-engine" },
    "market-scope": { name: "Market Scope", path: "/game-os/market-scope" },
    "audience-map": { name: "Audience Map", path: "/game-os/audience-map" },
    "window-planner": { name: "Window Planner", path: "/game-os/window-planner" },
    "launch-runbook": { name: "Launch Runbook", path: "/game-os/launch-runbook" },
    "steam-page-audit": { name: "Steam Page Audit", path: "/game-os/steam-page-audit" },
    "price-calc": { name: "Pricing Calculator", path: "/game-os/price-calc" },
  };
  function tool(id) {
    var t = TOOLS[id];
    if (t) return { id: id, name: t.name, path: t.path };
    var name = String(id || "unknown").replace(/[-_]+/g, " ").replace(/^\w/, function (c) { return c.toUpperCase(); });
    return { id: id || null, name: name, path: id && /^[a-z0-9-]{1,64}$/.test(id) ? "/game-os/" + id : null };
  }

  // The next-game paths. The studio picks one; the page never picks for them.
  var PATHS = [
    { id: "dlc", label: "DLC or expansion", title: function (t) { return t + ": DLC"; } },
    { id: "sequel", label: "Sequel", title: function (t) { return t + " 2"; } },
    { id: "port", label: "Port", title: function (t) { return t + " (port)"; } },
    { id: "new", label: "Something new", title: function () { return ""; } },
  ];
  function path(id) { for (var i = 0; i < PATHS.length; i++) if (PATHS[i].id === id) return PATHS[i]; return null; }

  var MAX_TITLE = 120;     // POST /api/games cuts titles at 120 characters.
  var MAX_GENRE = 80;      // and genres at 80.
  var MAX_TEXT = 2000;     // POST /api/games/:id/thesis cuts audience and hook at 2,000.
  var MAX_COMPS = 25;      // Market Scope's comp-set cap, kept the same here.
  var MAX_PRICE = 1000;    // The thesis route accepts a USD amount from 0 to 1,000.
  var CONCEPT_STAGE = 1;   // A next game starts at Concept.

  function num(x) { return typeof x === "number" && isFinite(x) ? x : null; }
  function str(x) { return x == null ? null : String(x); }
  function meta(e) { return e && e.meta && typeof e.meta === "object" ? e.meta : {}; }

  /** Which half a ledger entry belongs to: meta.half, the snapshot map, or null (unlabelled). */
  function halfOf(e) {
    var h = meta(e).half;
    if (HALVES[h]) return h;
    if (e && SNAPSHOT_HALF[e.key]) return SNAPSHOT_HALF[e.key];
    // Market Scope puts meta (and so meta.half) only on its first row; the rest are still market facts.
    if (e && MARKET_KEYS[e.key]) return "market";
    return null;
  }

  /** One display row for a ledger entry: value, range, n, window, date and the tool that made it. */
  function row(e) {
    var m = meta(e);
    var hist = Array.isArray(e.history) ? e.history.map(function (h) { return num(h && h.value); }).filter(function (v) { return v != null; }) : [];
    return {
      key: e.key, label: str(e.label) || e.key, value: num(e.value), unit: str(e.unit),
      points: !!POINTS[e.key],
      lo: num(m.lo), hi: num(m.hi), n: num(m.n), window: str(m.window),
      source: str(m.source), method: str(m.method), change: str(m.change), verdict: str(m.verdict), alarm: m.alarm === true,
      observedAt: e.observedAt || null, outdated: !!e.outdated,
      half: halfOf(e), labelledBy: m.half ? "tool" : SNAPSHOT_HALF[e.key] ? "map" : null,
      tool: tool(e.toolId), history: hist,
    };
  }

  function newestFirst(a, b) {
    var ta = Date.parse(a.observedAt || "") || 0, tb = Date.parse(b.observedAt || "") || 0;
    return tb - ta || (a.key < b.key ? -1 : 1);
  }

  /**
   * Sort the ledger into the board's groups. Log records (meta.kind: beats, creative versions) are not measurements
   * and are left out. The expectation-gap flag gets its own panel. Market facts go to panel 4, not to Reach.
   */
  function classify(ledger) {
    var g = { reach: [], resonance: [], both: [], market: [], unlabelled: [], gap: null };
    (Array.isArray(ledger) ? ledger : []).forEach(function (e) {
      if (!e || typeof e.key !== "string") return;
      if (meta(e).kind) return;
      if (e.key === GAP_KEY) { g.gap = e; return; }
      var h = halfOf(e);
      g[h || "unlabelled"].push(row(e));
    });
    ["reach", "resonance", "both", "market", "unlabelled"].forEach(function (k) { g[k].sort(newestFirst); });
    return g;
  }

  /* ---------------- Panel 3: expectation gap ---------------- */

  function quote(q) {
    if (typeof q === "string") return q.trim() ? { text: q.trim().slice(0, 400), url: null } : null;
    if (q && typeof q === "object" && q.text) {
      var url = typeof q.url === "string" && /^https:\/\/(store\.)?steamcommunity\.com\/|^https:\/\/store\.steampowered\.com\//.test(q.url) ? q.url : null;
      return { text: String(q.text).trim().slice(0, 400), url: url };
    }
    return null;
  }
  function oneFlag(m) {
    if (!m || typeof m !== "object") return null;
    var claim = str(m.claim), complaint = str(m.complaint || m.theme);
    if (!claim && !complaint) return null;
    return {
      claim: claim, complaint: complaint,
      count: num(m.count), n: num(m.n), lo: num(m.lo), hi: num(m.hi), window: str(m.window),
      quotes: (Array.isArray(m.quotes) ? m.quotes : []).map(quote).filter(Boolean).slice(0, 3),
    };
  }
  /** The expectation-gap flags in the game's latest expectation_gap_flag row: one flag, or meta.flags as a list. */
  function gapFlags(entry) {
    if (!entry) return [];
    var m = meta(entry);
    // Sentiment Radar phase 2 writes one row per run: value = flags found (0 too), meta.flags = [{claim, complaint, count, n, lo, hi, quotes}].
    var list = Array.isArray(m.flags) ? m.flags.map(function (f) { return oneFlag(Object.assign({ window: m.window }, f)); }) : [oneFlag(m)];
    return list.filter(Boolean);
  }
  /** Panel 3: the flags if Sentiment Radar has written any, plus the nearest phase 1 evidence, labelled as such. */
  function gap(ledger) {
    var list = Array.isArray(ledger) ? ledger : [];
    var entry = null, near = [];
    list.forEach(function (e) {
      if (!e) return;
      if (e.key === GAP_KEY) entry = e;
      else if (GAP_NEAREST.indexOf(e.key) >= 0 && !meta(e).kind) near.push(row(e));
    });
    near.sort(function (a, b) { return GAP_NEAREST.indexOf(a.key) - GAP_NEAREST.indexOf(b.key); });
    var flags = gapFlags(entry);
    return {
      status: entry ? (flags.length ? "flags" : "none-found") : "not-measured",
      flags: flags, read: num(meta(entry || {}).read), window: entry ? str(meta(entry).window) : null, observedAt: entry ? entry.observedAt || null : null, earlier: entry && Array.isArray(entry.history) ? Math.max(0, entry.history.length - 1) : 0,
      nearest: near,
    };
  }

  /* ---------------- Panel 4: the market now ---------------- */

  var MARKET_KEYS = {
    market_median_revenue: "median",
    market_p75_revenue: "p75",
    market_p90_revenue: "p90",
    market_hit_rate: "hit",
    market_share_under_10k: "under",
    market_releases_last_year: "releases",
    market_release_change: "change",
  };
  var MARKET_ROWS = [
    { id: "median", label: "Median gross revenue", unit: "usd" },
    { id: "p75", label: "Top-quarter gross revenue", unit: "usd" },
    { id: "p90", label: "Top-tenth gross revenue", unit: "usd" },
    { id: "hit", label: "Share of games over $100K", unit: "pct" },
    { id: "under", label: "Share of games under $10K", unit: "pct" },
    { id: "releases", label: "Releases in the last 12 months", unit: "units" },
    { id: "change", label: "Change in releases vs the year before", unit: "pct" },
  ];

  /**
   * What Market Scope last sent to this game: the tags (by name), the assumptions used, and the figures.
   * Only the median row carries the tags and assumptions, so it is required.
   */
  function marketBaseline(ledger) {
    var list = Array.isArray(ledger) ? ledger : [];
    var by = {};
    list.forEach(function (e) { if (e && MARKET_KEYS[e.key]) by[e.key] = e; });
    var head = by.market_median_revenue;
    if (!head) return null;
    var m = meta(head);
    var tags = Array.isArray(m.tags) ? m.tags.map(String).filter(Boolean).slice(0, 5) : [];
    if (!tags.length) return null;
    var then = {};
    Object.keys(MARKET_KEYS).forEach(function (k) { then[MARKET_KEYS[k]] = by[k] ? num(by[k].value) : null; });
    return {
      tags: tags, from: str(m.from), to: str(m.to), games: num(m.games), maturePaid: num(m.mature_paid),
      mult: num(m.copies_per_review), share: num(m.price_paid_pct), truncated: !!m.truncated,
      observedAt: head.observedAt || null, then: then,
    };
  }

  /** Map tag names to Steam tag ids using Market Scope's tag list. Names that aren't found are returned in `missing`. */
  function tagIds(names, tagList) {
    var byName = {};
    (Array.isArray(tagList) ? tagList : []).forEach(function (t) { if (t && t.name) byName[String(t.name).toLowerCase()] = Number(t.id); });
    var ids = [], missing = [];
    (names || []).forEach(function (n) {
      var id = byName[String(n).toLowerCase()];
      if (id > 0) ids.push(id); else missing.push(n);
    });
    return { ids: ids, missing: missing };
  }

  /** Today's figures from MarketModel.analyse, in the same shape as the baseline. */
  function marketNow(analysis) {
    var sp = (analysis && analysis.spread) || {}, cr = (analysis && analysis.crowding) || {};
    return {
      median: num(sp.median), p75: num(sp.p75), p90: num(sp.p90),
      hit: sp.overHit == null ? null : num(sp.overHit * 100),
      under: sp.underSmall == null ? null : num(sp.underSmall * 100),
      releases: num(cr.lastYear),
      change: cr.change == null ? null : num(cr.change * 100),
      maturePaid: num(sp.n), games: num(analysis && analysis.total),
    };
  }

  /** Then against now, row by row. Revenue and counts get a relative change; shares get a points change. */
  function marketCompare(then, now) {
    return MARKET_ROWS.map(function (r) {
      var a = then ? num(then[r.id]) : null, b = now ? num(now[r.id]) : null;
      var diff = null, rel = null;
      if (a != null && b != null) {
        if (r.unit === "pct") diff = b - a;
        else { diff = b - a; rel = a !== 0 ? (b - a) / Math.abs(a) : null; }
      }
      return { id: r.id, label: r.label, unit: r.unit, then: a, now: b, diff: diff, rel: rel };
    }).filter(function (r) { return r.then != null || r.now != null; });
  }

  /* ---------------- Guidance (text, not a verdict) ---------------- */

  /** Plain statements of what the board holds, plus the brief's fixed guidance. Nothing here weighs the evidence. */
  function guidance(groups, gp, market) {
    var lines = [];
    var r = groups.reach.length, s = groups.resonance.length;
    lines.push(r ? r + " Reach signal" + (r === 1 ? "" : "s") + " on record." : "No Reach signals on record yet.");
    lines.push(s ? s + " Resonance signal" + (s === 1 ? "" : "s") + " on record." : "No Resonance signals on record yet.");
    if (gp.status === "flags") lines.push(gp.flags.length + " expectation-gap flag" + (gp.flags.length === 1 ? "" : "s") + " from Sentiment Radar.");
    else if (gp.status === "none-found") lines.push("Sentiment Radar checked for an expectation gap and flagged nothing.");
    else lines.push("The expectation gap hasn't been measured for this game yet.");
    lines.push(market ? "Market Scope figures on record for " + market.tags.join(" + ") + "." : "No Market Scope figures on record for this game.");
    return {
      facts: lines,
      rules: [
        "A wide expectation gap favours DLC or a fix over a sequel, because a sequel inherits the gap.",
        "A tight gap with strong resonance strengthens the case for a sequel.",
        "Reach and Resonance need opposite fixes. Weak reach with strong resonance points to marketing; weak resonance points to the game or its promise.",
        "These are prompts for the decision, not a recommendation. Unusual games often beat their comps.",
      ],
    };
  }

  /* ---------------- Start the next game ---------------- */

  function cleanComp(c) {
    if (!c || !c.name) return null;
    var name = String(c.name).trim().slice(0, 80);
    if (!name) return null;
    var out = { name: name };
    var id = Number(c.appId || c.appid);
    if (Number.isInteger(id) && id > 0) out.appId = id;
    var p = c.price === "" || c.price == null ? null : Number(String(c.price).replace(/[$,\s]/g, ""));
    if (p != null && isFinite(p) && p >= 0 && p <= MAX_PRICE) out.price = Math.round(p * 100) / 100;
    return out;
  }
  function dedupeComps(list) {
    var seen = {}, out = [];
    list.forEach(function (c) {
      c = cleanComp(c);
      if (!c) return;
      var k = c.appId ? "id:" + c.appId : "n:" + c.name.toLowerCase();
      var kn = "n:" + c.name.toLowerCase();
      if (seen[k] || seen[kn]) return;
      seen[k] = seen[kn] = 1;
      out.push(c);
    });
    return out.slice(0, MAX_COMPS);
  }

  /** The pre-filled draft: this game first in the comps, then its current comps; audience and price from its thesis. */
  function draft(game, thesis, pathId) {
    game = game || {}; thesis = thesis || {};
    var p = path(pathId) || PATHS[1];
    var title = String(game.title || "").trim();
    var self = { name: title, appId: game.steamAppId, price: thesis.priceHypothesis };
    var comps = dedupeComps([self].concat(Array.isArray(thesis.compSet) ? thesis.compSet : []));
    return {
      path: p.id,
      title: p.title(title).slice(0, MAX_TITLE),
      genre: game.genre ? String(game.genre).slice(0, MAX_GENRE) : "",
      audience: thesis.audience ? String(thesis.audience).slice(0, MAX_TEXT) : "",
      priceHypothesis: thesis.priceHypothesis != null && thesis.priceHypothesis !== "" ? String(thesis.priceHypothesis) : "",
      comps: comps,
    };
  }

  function note(pathId, fromTitle) {
    var p = path(pathId);
    return ("Draft from Sequel Signal" + (p ? " (" + p.label + ")" : "") + ", based on " + (fromTitle || "the previous game") +
      ". Every field is a draft: review it before relying on it.").slice(0, 500);
  }

  /**
   * Check the form and build the two request bodies. Returns { errors } or { game, thesis }.
   * game → POST /api/games; thesis → POST /api/games/:id/thesis.
   */
  function buildCreate(form, fromGame) {
    form = form || {};
    var errors = [];
    var title = String(form.title || "").trim();
    if (!title) errors.push("Give the next game a working title.");
    if (title.length > MAX_TITLE) errors.push("Keep the title to " + MAX_TITLE + " characters.");
    if (!path(form.path)) errors.push("Pick what the next game is: DLC, sequel, port or something new.");
    var price = String(form.priceHypothesis == null ? "" : form.priceHypothesis).replace(/[$,\s]/g, "");
    var priceN = null;
    if (price !== "") {
      priceN = Number(price);
      if (!isFinite(priceN) || priceN < 0 || priceN > MAX_PRICE) errors.push("Enter the price as a USD amount from 0 to " + MAX_PRICE + ", or leave it blank.");
    }
    if (errors.length) return { errors: errors };
    var comps = dedupeComps(Array.isArray(form.comps) ? form.comps : []);
    var thesis = { source: TOOL_ID, note: note(form.path, fromGame && fromGame.title) };
    var audience = String(form.audience || "").trim();
    if (audience) thesis.audience = audience.slice(0, MAX_TEXT);
    if (comps.length) thesis.compSet = comps;
    if (priceN != null) thesis.priceHypothesis = priceN.toFixed(2);
    var genre = String(form.genre || "").trim().slice(0, MAX_GENRE);
    return {
      game: { title: title.slice(0, MAX_TITLE), genre: genre || null, stage: CONCEPT_STAGE },
      thesis: thesis,
      hasThesis: !!(thesis.audience || thesis.compSet || thesis.priceHypothesis),
    };
  }

  /* ---------------- Formatting shared with the page ---------------- */

  function fmt(v, unit, points) {
    if (v == null || !isFinite(v)) return "—";
    if (points) return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(Math.round(v * 10) / 10) + " pts";
    switch (unit) {
      case "usd": {
        var a = Math.abs(v), s = v < 0 ? "−$" : "$";
        if (a >= 1e6) return s + (a / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
        if (a >= 1e4) return s + Math.round(a / 1000) + "K";
        return s + Math.round(a).toLocaleString("en-US");
      }
      case "pct": return (Math.round(v * 10) / 10) + "%";
      case "units": case "count": return Math.round(v).toLocaleString("en-US");
      case "per_day": return (Math.round(v * 100) / 100) + " a day";
      case "hours": return (Math.round(v * 10) / 10) + " h";
      case "minutes": return Math.round(v) + " min";
      case "days": return Math.round(v) + " days";
      case "months": return Math.round(v) + " months";
      default: return String(Math.round(v * 100) / 100);
    }
  }

  function analyse(input) {
    input = input || {};
    var groups = classify(input.ledger);
    var gp = gap(input.ledger);
    var market = marketBaseline(input.ledger);
    return { groups: groups, gap: gp, market: market, guidance: guidance(groups, gp, market) };
  }

  return {
    TOOL_ID: TOOL_ID, SNAPSHOT_HALF: SNAPSHOT_HALF, GAP_KEY: GAP_KEY, GAP_NEAREST: GAP_NEAREST, TOOLS: TOOLS, PATHS: PATHS,
    MAX_TITLE: MAX_TITLE, MAX_COMPS: MAX_COMPS, MAX_PRICE: MAX_PRICE, CONCEPT_STAGE: CONCEPT_STAGE, MARKET_ROWS: MARKET_ROWS,
    tool: tool, path: path, halfOf: halfOf, row: row, classify: classify, gapFlags: gapFlags, gap: gap,
    marketBaseline: marketBaseline, tagIds: tagIds, marketNow: marketNow, marketCompare: marketCompare,
    guidance: guidance, draft: draft, note: note, buildCreate: buildCreate, dedupeComps: dedupeComps, fmt: fmt, analyse: analyse,
  };
});
