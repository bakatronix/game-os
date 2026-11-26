/* Mobile Calculator — page logic. The math lives in model.js (window.MobileModel). */
(function () {
  "use strict";
  var M = window.MobileModel;
  var TOOL_ID = "mobile-calc";
  var LS_KEY = "gos_mobile_calc_v1";
  var ACCOUNT_URL = "/api/tool-state/" + TOOL_ID;
  var CASES = M.CASES;
  var CASE_NAME = { stress: "Stress case", base: "Base case", upside: "Upside case" };

  /* ---------------- Field definitions ---------------- */
  // kind: usd | pct | count | mult | days | month | local | text | fx
  var F = {
    cpi: { kind: "usd", label: "Paid cost per install (CPI)", help: "Total spend ÷ installs from paid campaigns in your soft launch, from your ad network or mediation dashboard.", step: "0.01" },
    organic: { kind: "pct", label: "Organic share of installs", help: "Installs with no paid campaign ÷ all installs, from App Store Connect, Google Play Console or your attribution tool. Enter 0 if you buy every install." },
    d1: { kind: "pct", label: "Day 1 retention", help: "Share of a cohort that opens the game the day after install. Your analytics cohort report (Firebase, GameAnalytics or similar)." },
    d7: { kind: "pct", label: "Day 7 retention (cross-check only)", help: "Same report, day 7. Not used in the result: it checks that your day 1 and day 30 make sense together." },
    d30: { kind: "pct", label: "Day 30 retention", help: "Same report, day 30. Must be lower than day 1." },
    iapArpdau: { kind: "usd", label: "In-app purchase revenue per daily active user", help: "In-app purchase revenue ÷ daily active users, before the store's cut. From your analytics tool or the store console.", step: "0.001" },
    adImps: { kind: "count", label: "Ad impressions per active user per day", help: "Impressions ÷ daily active users, from your ad mediation dashboard. Enter 0 if you show no ads.", step: "0.1" },
    ecpm: { kind: "usd", label: "eCPM (revenue per 1,000 impressions)", help: "Ad revenue ÷ impressions × 1,000, from your mediation dashboard. Use your own blended figure.", step: "0.1" },
    adKeep: { kind: "pct", label: "Share of ad revenue kept after network and mediation fees", help: "If your dashboard already shows net revenue, enter 100%." },
    subShare: { kind: "pct", label: "Share of installs that subscribe", help: "Subscribers ÷ installs, from your store console. Enter 0 if you have no subscription.", step: "0.1" },
    subPrice: { kind: "usd", label: "Subscription price per month", help: "Your monthly price in USD. For weekly or annual plans, convert to a monthly figure.", step: "0.01" },
    subRenew: { kind: "pct", label: "Monthly renewal rate", help: "Share of subscribers who renew each month, from your store console or subscription tool." },
    paidPrice: { kind: "usd", label: "Upfront price per copy", help: "Your upfront price in USD. Enter 0 for a free game.", step: "0.01" },
    storeFee: { kind: "pct", label: "Store fee on in-app purchases and paid downloads", help: "Apple and Google both list 15% on the first US$1M a year and 30% above it. Rates differ in some regions." },
    subFee: { kind: "pct", label: "Store fee on subscriptions", help: "Google lists 15% on subscriptions. Apple reduces its rate after a subscriber's first year." },
    taxKeep: { kind: "pct", label: "Share of the price left after sales tax and VAT", help: "If your revenue figures already exclude tax, enter 100%. Otherwise estimate it from where your players are." },
    refunds: { kind: "pct", label: "Refunds and chargebacks", help: "Share of store revenue returned, from the refund report in the store console." },
    varCost: { kind: "usd", label: "Variable cost per active user per day", help: "Servers and support: cloud and support bill ÷ total active user-days. Enter 0 if you have none.", step: "0.001" },
    horizon: { kind: "days", label: "Horizon: days of player life to count", help: "A shorter horizon is stricter." },
    target: { kind: "mult", label: "Target ratio: lifetime value to cost per install", help: "Your plan decides this. 1.00× only breaks even; say how far above 1 you need to be and why.", step: "0.05" },
    stressRet: { kind: "mult", label: "Retention multiplier", help: "How much worse retention could be at scale. 0.80 means 20% lower.", step: "0.05" },
    stressMon: { kind: "mult", label: "Monetisation multiplier", help: "How much worse spend and ad revenue per player could be.", step: "0.05" },
    stressCpi: { kind: "mult", label: "CPI multiplier", help: "How much more expensive installs could get. 1.25 means 25% more.", step: "0.05" },
    upRet: { kind: "mult", label: "Retention multiplier", help: "How much better retention could be.", step: "0.05" },
    upMon: { kind: "mult", label: "Monetisation multiplier", help: "How much better spend and ad revenue per player could be.", step: "0.05" },
    upCpi: { kind: "mult", label: "CPI multiplier", help: "How much cheaper installs could get. 0.90 means 10% less.", step: "0.05" },
    // Funding
    currency: { kind: "text", label: "Your currency", help: "Three-letter code for the money the studio spends and raises, such as SAR. Acquisition budget stays in USD.", group: "fund" },
    fx: { kind: "fx", label: "Your currency per US dollar", help: "SAR is pegged at 3.75. Change only if your money is in another currency.", step: "0.01", group: "fund" },
    start: { kind: "month", label: "Model starts", help: "The month you are in now.", group: "fund" },
    launch: { kind: "month", label: "Launch month: paid user acquisition starts", help: "Your plan, usually global launch after soft launch.", group: "fund" },
    oneOffMonth: { kind: "month", label: "One-off cost paid in", help: "The month the one-off cost below is paid.", group: "fund" },
    roundMonth: { kind: "month", label: "Round received in", help: "Planned first close.", group: "fund" },
    uaBudget: { kind: "usd", label: "User acquisition budget per month", help: "What you plan to spend on paid installs each month after launch, in USD. It is spent whether or not it pays back.", step: "100", group: "fund" },
    uaMonths: { kind: "count", label: "Months of user acquisition spend", help: "How many months the budget runs, 0 to 36.", suffix: "months", step: "1", group: "fund" },
    running: { kind: "local", label: "Monthly running cost", help: "Team size × cost per person + other costs, per month. Use your real team's cost.", step: "1000", group: "fund" },
    oneOff: { kind: "local", label: "One-off cost (soft launch, localisation, tools)", help: "Any single large cost outside the monthly run rate. Enter 0 if none.", step: "1000", group: "fund" },
    cash: { kind: "local", label: "Cash in the bank at the model start", help: "From your bank account.", step: "1000", group: "fund" },
    round: { kind: "local", label: "This round", help: "The amount you are raising.", step: "10000", group: "fund" },
    preMoney: { kind: "local", label: "Pre-money valuation", help: "What you say the studio is worth before the round.", step: "10000", group: "fund" },
  };
  var STEPS = [
    { id: "players", el: "step-players" },
    { id: "money", el: "step-money" },
    { id: "costs", el: "step-costs" },
    { id: "cases", el: "step-cases" },
    { id: "unit-economics", el: "step-ue", result: true },
    { id: "funding", el: "step-fund" },
    { id: "runway", el: "step-run", result: true },
    { id: "about", el: "step-about", about: true },
  ];

  /* ---------------- State ---------------- */
  function emptyState() {
    var ue = {}, fund = {};
    M.UE_KEYS.forEach(function (k) { ue[k] = ""; });
    M.FUND_KEYS.forEach(function (k) { fund[k] = ""; });
    fund.fx = 3.75;
    return { v: 1, ue: ue, fund: fund, currency: "SAR", sources: {}, savedAt: 0 };
  }
  var S = load() || emptyState();
  var R = { ue: null, fund: null };
  var current = "players";

  function load() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      return normalise(JSON.parse(raw));
    } catch (e) { return null; }
  }
  function normalise(s) {
    if (!s || typeof s !== "object" || !s.ue || !s.fund) return null;
    var base = emptyState();
    M.UE_KEYS.forEach(function (k) { if (s.ue[k] !== undefined) base.ue[k] = s.ue[k]; });
    M.FUND_KEYS.forEach(function (k) { if (s.fund[k] !== undefined) base.fund[k] = s.fund[k]; });
    if (typeof s.currency === "string") base.currency = s.currency.slice(0, 6);
    if (s.sources && typeof s.sources === "object") base.sources = s.sources;
    base.savedAt = s.savedAt || 0;
    return base;
  }
  function isBlank(v) { return v === "" || v === null || v === undefined; }
  function anyFilled() {
    return M.UE_KEYS.some(function (k) { return !isBlank(S.ue[k]); }) ||
      M.FUND_KEYS.some(function (k) { return k !== "fx" && !isBlank(S.fund[k]); });
  }
  function getVal(k) {
    if (k === "currency") return S.currency;
    return F[k].group === "fund" ? S.fund[k] : S.ue[k];
  }
  function setVal(k, v) {
    if (k === "currency") { S.currency = v; return; }
    if (F[k].group === "fund") S.fund[k] = v; else S.ue[k] = v;
  }

  var saveTimer = null;
  function persist() {
    S.savedAt = Date.now();
    try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) {}
    scheduleAccountSave();
  }
  function changed() {
    compute();
    renderLive();
    renderStepsNav();
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 300);
  }

  /* ---------------- Formatting ---------------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function usd(x, d) {
    if (x === null || x === undefined || !isFinite(x)) return "—";
    if (d === undefined) d = Math.abs(x) < 10 ? 2 : 0;
    var s = Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
    return (x < 0 ? "−$" : "$") + s;
  }
  function cur() { return (S.currency || "").toUpperCase() || "local"; }
  function money(x) {
    if (x === null || x === undefined || !isFinite(x)) return "—";
    var s = Math.round(Math.abs(x)).toLocaleString("en-US");
    return (x < 0 ? "−" : "") + cur() + " " + s;
  }
  function moneyShort(x) {
    var a = Math.abs(x), s;
    if (a >= 1e6) s = (a / 1e6).toFixed(a >= 1e7 ? 0 : 1) + "M";
    else if (a >= 1e3) s = (a / 1e3).toFixed(0) + "k";
    else s = String(Math.round(a));
    return (x < 0 ? "−" : "") + s;
  }
  function pct(x, d) { return x === null || !isFinite(x) ? "—" : (x * 100).toFixed(d === undefined ? 1 : d) + "%"; }
  function ratio(x) { return x === null || x === undefined || !isFinite(x) ? "No paid installs" : x.toFixed(2) + "×"; }
  function num(x, d) { return x === null || !isFinite(x) ? "—" : x.toLocaleString("en-US", { maximumFractionDigits: d || 0, minimumFractionDigits: d || 0 }); }
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function monthName(s) { if (!s) return "—"; var n = M.ym(s); return MON[n % 12] + " " + Math.floor(n / 12); }
  function cls(x) { return x < 0 ? ' class="neg"' : ""; }

  function displayValue(k, v) {
    if (isBlank(v)) return "";
    var f = F[k];
    if (f.kind === "pct") return String(+(v * 100).toPrecision(10));
    return String(v);
  }
  function exampleText(k) {
    var v = k === "currency" ? M.EXAMPLE.currency : (F[k].group === "fund" ? M.EXAMPLE.fund[k] : M.EXAMPLE.ue[k]);
    var f = F[k], s;
    if (f.kind === "pct") s = +(v * 100).toPrecision(6) + "%";
    else if (f.kind === "usd") s = "$" + v.toLocaleString("en-US", { maximumFractionDigits: 3 });
    else if (f.kind === "mult") s = v.toFixed(2) + "×";
    else if (f.kind === "days") s = v + " days";
    else if (f.kind === "month") s = monthName(v);
    else if (f.kind === "local") s = "SAR " + v.toLocaleString("en-US");
    else s = String(v) + (f.suffix ? " " + f.suffix : "");
    var src = M.EXAMPLE.sources[k];
    return "<b>Studio Falak:</b> " + esc(s) + (src ? " · " + esc(src) : "");
  }

  /* ---------------- Inputs ---------------- */
  function fieldHTML(k) {
    var f = F[k], id = "in-" + k, v = getVal(k), ctl;
    var cl = "inwrap" + (isBlank(v) ? " empty" : "");
    if (f.kind === "days") {
      ctl = '<div class="' + cl + '"><select id="' + id + '" data-k="' + k + '"><option value="">Choose…</option>' +
        M.HORIZONS.map(function (h) { return '<option value="' + h + '"' + (v === h ? " selected" : "") + ">" + h + " days</option>"; }).join("") +
        "</select></div>";
    } else if (f.kind === "month") {
      ctl = '<div class="' + cl + '"><input type="month" id="' + id + '" data-k="' + k + '" value="' + esc(v) + '"></div>';
    } else if (f.kind === "text") {
      ctl = '<div class="inwrap"><input type="text" id="' + id + '" data-k="' + k + '" value="' + esc(v) + '" maxlength="6" autocomplete="off"></div>';
    } else {
      var pre = f.kind === "usd" ? "$" : f.kind === "local" ? '<span data-cur>' + esc(cur()) + "</span>" : "";
      var suf = f.kind === "pct" ? "%" : f.kind === "mult" ? "×" : f.kind === "fx" ? '<span data-cur>' + esc(cur()) + "</span> per $1" : (f.suffix || "");
      ctl = '<div class="' + cl + '">' + (pre ? '<span class="affix">' + pre + "</span>" : "") +
        '<input type="number" inputmode="decimal" id="' + id + '" data-k="' + k + '" step="' + (f.step || "any") + '" value="' + esc(displayValue(k, v)) + '">' +
        (suf ? '<span class="affix">' + suf + "</span>" : "") + "</div>";
    }
    var src = k === "currency" ? "" : '<input class="src" type="text" data-src="' + k + '" placeholder="Your source or reasoning" value="' + esc(S.sources[k] || "") + '" aria-label="Source for ' + esc(f.label) + '">';
    return '<div class="field"><div><label class="name" for="' + id + '">' + esc(f.label) + '</label><div class="help">' + esc(f.help) +
      '</div><div class="ex">' + exampleText(k) + '</div></div><div class="ctl">' + ctl + src + "</div></div>";
  }
  function renderInputs() {
    document.querySelectorAll("[data-fields]").forEach(function (box) {
      var keys = box.getAttribute("data-fields").split(/\s+/);
      var head = box.querySelector("h3");
      box.innerHTML = (head ? head.outerHTML : "") + keys.map(fieldHTML).join("");
    });
  }
  function readInput(el) {
    var k = el.getAttribute("data-k"), f = F[k], raw = el.value, v;
    if (f.kind === "text") v = raw.trim().toUpperCase();
    else if (f.kind === "month") v = raw || "";
    else if (raw === "" || raw === null) v = "";
    else {
      v = Number(raw);
      if (!isFinite(v)) v = "";
      else if (f.kind === "pct") v = v / 100;
    }
    setVal(k, v);
    var wrap = el.closest(".inwrap");
    if (wrap && f.kind !== "text") wrap.classList.toggle("empty", isBlank(v));
    if (k === "currency") document.querySelectorAll("[data-cur]").forEach(function (n) { n.textContent = cur(); });
    changed();
    renderStepExtras();
  }
  document.addEventListener("input", function (e) {
    var t = e.target;
    if (t.matches && t.matches("[data-k]")) readInput(t);
    else if (t.matches && t.matches("[data-src]")) { S.sources[t.getAttribute("data-src")] = t.value; changed(); }
  });
  document.addEventListener("change", function (e) {
    if (e.target.matches && e.target.matches("select[data-k], input[type=month][data-k]")) readInput(e.target);
  });

  /* ---------------- Compute ---------------- */
  function compute() {
    var ue = {};
    M.UE_KEYS.forEach(function (k) { ue[k] = isBlank(S.ue[k]) ? "" : S.ue[k]; });
    R.ue = M.unitEconomics(ue);
    var fund = {};
    M.FUND_KEYS.forEach(function (k) { fund[k] = isBlank(S.fund[k]) ? "" : S.fund[k]; });
    R.fund = M.funding(fund, isBlank(S.ue.organic) ? "" : S.ue.organic, R.ue);
  }
  function stepFields(stepEl) {
    var keys = [];
    stepEl.querySelectorAll("[data-fields]").forEach(function (b) { keys = keys.concat(b.getAttribute("data-fields").split(/\s+/)); });
    return keys;
  }
  function stepDone(st) {
    var el = document.getElementById(st.el);
    if (st.about) return false;
    if (st.result) return st.id === "unit-economics" ? !!(R.ue && R.ue.cases) : !!(R.fund && R.fund.months);
    var keys = stepFields(el);
    return keys.length > 0 && keys.every(function (k) { return !isBlank(getVal(k)); });
  }

  /* ---------------- Navigation ---------------- */
  function renderStepsNav() {
    var nav = document.getElementById("steps");
    var n = 0;
    nav.innerHTML = STEPS.map(function (st, i) {
      var el = document.getElementById(st.el);
      var title = el.getAttribute("data-title");
      var label = st.about ? "" : '<span class="n">' + (++n) + "</span>";
      var c = (st.id === current ? "active " : "") + (stepDone(st) ? "done " : "") + (st.result ? "result" : "");
      return (st.about ? '<span class="sep" aria-hidden="true"></span>' : "") +
        '<button type="button" class="' + c + '" data-go="' + st.id + '"' + (st.id === current ? ' aria-current="step"' : "") + ">" + label + title + "</button>";
    }).join("");
  }
  function go(id, opts) {
    var st = STEPS.filter(function (s) { return s.id === id; })[0] || STEPS[0];
    current = st.id;
    STEPS.forEach(function (s) { document.getElementById(s.el).classList.toggle("active", s.id === current); });
    renderStepsNav();
    renderStepExtras();
    renderStepNav();
    var h = "#/" + current;
    if (location.hash !== h) { try { history[opts && opts.replace ? "replaceState" : "pushState"]({}, "", h); } catch (e) {} }
    if (!(opts && opts.noScroll)) window.scrollTo(0, 0);
    if (st.result && typeof window.gosTrack === "function") window.gosTrack("result_viewed", { step: st.id });
  }
  function renderStepNav() {
    var i = STEPS.findIndex(function (s) { return s.id === current; });
    var prev = i > 0 ? STEPS[i - 1] : null;
    var next = i < STEPS.length - 2 ? STEPS[i + 1] : null; // About is not part of the flow
    var title = function (s) { return document.getElementById(s.el).getAttribute("data-title"); };
    document.getElementById("step-nav").innerHTML =
      (prev && !STEPS[i].about ? '<button class="btn-ghost" type="button" data-go="' + prev.id + '">&larr; ' + title(prev) + "</button>" : "<span></span>") +
      (next && !STEPS[i].about ? '<button class="btn" type="button" data-go="' + next.id + '">' + title(next) + " &rarr;</button>" : "");
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-go]");
    if (b) { e.preventDefault(); go(b.getAttribute("data-go")); }
  });
  window.addEventListener("popstate", function () { go(hashStep(), { replace: true, noScroll: true }); });
  function hashStep() { var m = /^#\/([\w-]+)/.exec(location.hash); return m ? m[1] : "players"; }

  /* ---------------- Live strip ---------------- */
  function renderLive() {
    var el = document.getElementById("live");
    var ue = R.ue, fu = R.fund;
    if (!ue.cases) {
      el.innerHTML = '<span class="todo">' + ue.empty + " of " + ue.total + " unit-economics inputs to go</span>" +
        '<span class="muted">Fill the yellow fields, or load the Studio Falak example to see how it works.</span>';
      return;
    }
    var b = ue.cases.base;
    var parts = [
      '<span><span class="lbl">Base LTV</span><b>' + usd(b.ltv) + "</b></span>",
      '<span><span class="lbl">Blended CPI</span><b>' + usd(b.blended) + "</b></span>",
      '<span><span class="lbl">LTV : CPI</span><b>' + ratio(b.ratio) + "</b> <span class=\"muted\">target " + S.ue.target.toFixed(2) + "×</span></span>",
      '<span><span class="lbl">Payback</span><b>' + (b.payback === null ? "not within " + S.ue.horizon + " days" : "day " + b.payback) + "</b></span>",
    ];
    if (fu && fu.cases) {
      var rw = fu.cases.base.runway;
      parts.push('<span><span class="lbl">Base runway</span><b>' + (rw === null ? "36+ months" : rw + " months") + "</b></span>");
    } else {
      parts.push('<span class="muted">' + (fu.empty ? fu.empty + " funding inputs to go" : "Funding plan incomplete") + "</span>");
    }
    el.innerHTML = parts.join("");
  }

  /* ---------------- Step extras (checks on input steps) ---------------- */
  function checkHTML(label, msg) {
    var c = msg === "OK" ? "ok" : (/^Fill|^Finish|^—/.test(msg) ? "wait" : "bad");
    return '<div class="check ' + c + '"><span class="dot" aria-hidden="true"></span><span><b>' + esc(label) + ":</b> " + esc(msg === "OK" ? "OK" : msg) + "</span></div>";
  }
  function renderStepExtras() {
    if (current === "players") {
      var ue = R.ue;
      document.getElementById("ret-check").innerHTML = checkHTML("Retention", ue.checks.retention);
      document.getElementById("ret-derived").innerHTML = ue.impliedD7 === null ? "" :
        "<div><span>Decay between day 1 and day 30</span><b>" + ue.decay.toFixed(3) + "</b></div>" +
        "<div><span>Day 7 implied by the curve</span><b>" + pct(ue.impliedD7) + "</b></div>" +
        (ue.d7Diff === null ? "" : "<div><span>Your day 7 minus implied</span><b>" + (ue.d7Diff >= 0 ? "+" : "") + ue.d7Diff.toFixed(1) + " pts</b></div>");
    } else if (current === "unit-economics") renderUE();
    else if (current === "runway") renderRunway();
  }

  /* ---------------- Charts ---------------- */
  function lineChart(o) {
    var W = o.w || 640, H = o.h || 260, L = 56, Rr = 16, T = 14, B = 30;
    var xs = o.xMax - o.xMin || 1;
    var ys = [];
    o.series.forEach(function (s) { s.pts.forEach(function (p) { ys.push(p[1]); }); });
    (o.hlines || []).forEach(function (h) { ys.push(h.y); });
    var yMin = Math.min(o.yMin === undefined ? Infinity : o.yMin, Math.min.apply(null, ys));
    var yMax = Math.max.apply(null, ys);
    if (yMax === yMin) yMax = yMin + 1;
    var ticks = niceTicks(yMin, yMax, 5);
    yMin = Math.min(yMin, ticks[0]); yMax = Math.max(yMax, ticks[ticks.length - 1]);
    var X = function (x) { return L + (x - o.xMin) / xs * (W - L - Rr); };
    var Y = function (y) { return T + (1 - (y - yMin) / (yMax - yMin)) * (H - T - B); };
    var g = "";
    ticks.forEach(function (t) {
      g += '<line class="' + (t === 0 ? "zero" : "grid") + '" x1="' + L + '" x2="' + (W - Rr) + '" y1="' + Y(t) + '" y2="' + Y(t) + '"/>' +
        '<text x="' + (L - 6) + '" y="' + (Y(t) + 4) + '" text-anchor="end">' + esc(o.yFmt(t)) + "</text>";
    });
    (o.xTicks || []).forEach(function (t) {
      g += '<text x="' + X(t.x) + '" y="' + (H - 10) + '" text-anchor="middle">' + esc(t.label) + "</text>" +
        '<line class="axis" x1="' + X(t.x) + '" x2="' + X(t.x) + '" y1="' + (H - B) + '" y2="' + (H - B + 4) + '"/>';
    });
    (o.vlines || []).forEach(function (v) {
      g += '<line class="axis" stroke-dasharray="3 3" x1="' + X(v.x) + '" x2="' + X(v.x) + '" y1="' + T + '" y2="' + (H - B) + '"/>' +
        '<text x="' + (X(v.x) + 4) + '" y="' + (T + 10) + '">' + esc(v.label) + "</text>";
    });
    (o.hlines || []).forEach(function (h) {
      g += '<line class="l-' + h.k + '" stroke-width="1.5" stroke-dasharray="5 4" x1="' + L + '" x2="' + (W - Rr) + '" y1="' + Y(h.y) + '" y2="' + Y(h.y) + '"/>';
    });
    o.series.forEach(function (s) {
      var d = s.pts.map(function (p, i) { return (i ? "L" : "M") + X(p[0]).toFixed(1) + " " + Y(p[1]).toFixed(1); }).join("");
      g += '<path class="l-' + s.k + '" fill="none" stroke-width="2.5" stroke-linejoin="round" d="' + d + '"/>';
    });
    g += '<line class="axis" x1="' + L + '" x2="' + (W - Rr) + '" y1="' + (H - B) + '" y2="' + (H - B) + '"/>';
    g += '<line class="hover-line axis" x1="0" x2="0" y1="' + T + '" y2="' + (H - B) + '" style="display:none"/>';
    var id = "ch" + Math.random().toString(36).slice(2, 8);
    CHARTS[id] = { o: o, X: X, L: L, W: W, Rr: Rr };
    return '<svg class="chart" id="' + id + '" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(o.label) + '">' + g + "</svg>";
  }
  var CHARTS = {};
  function niceTicks(a, b, n) {
    var span = b - a, step = Math.pow(10, Math.floor(Math.log10(span / n)));
    var err = span / n / step;
    if (err >= 7.5) step *= 10; else if (err >= 3.5) step *= 5; else if (err >= 1.5) step *= 2;
    var out = [], t = Math.floor(a / step) * step;
    for (; t <= b + step * 0.5; t += step) out.push(Math.abs(t) < step / 1e6 ? 0 : +t.toPrecision(12));
    return out;
  }
  function legend(extra) {
    return '<div class="legend">' + CASES.map(function (c) {
      return '<span><i style="background:var(--c-' + c + ')"></i>' + CASE_NAME[c] + "</span>";
    }).join("") + (extra || "") + "</div>";
  }
  var tip = document.getElementById("chart-tip");
  document.addEventListener("mousemove", function (e) {
    var svg = e.target.closest && e.target.closest("svg.chart");
    if (!svg || !CHARTS[svg.id]) { tip.style.display = "none"; return; }
    var c = CHARTS[svg.id], r = svg.getBoundingClientRect();
    var px = (e.clientX - r.left) / r.width * c.W;
    if (px < c.L || px > c.W - c.Rr) { tip.style.display = "none"; return; }
    var x = c.o.xMin + (px - c.L) / (c.W - c.L - c.Rr) * (c.o.xMax - c.o.xMin);
    var s0 = c.o.series[0].pts, best = 0;
    for (var i = 1; i < s0.length; i++) if (Math.abs(s0[i][0] - x) < Math.abs(s0[best][0] - x)) best = i;
    var line = svg.querySelector(".hover-line");
    var lx = c.X(s0[best][0]);
    line.setAttribute("x1", lx); line.setAttribute("x2", lx); line.style.display = "";
    tip.innerHTML = "<b>" + esc(c.o.xFmt(s0[best][0])) + "</b><br>" + c.o.series.map(function (s) {
      return CASE_NAME[s.k] + ": " + esc(c.o.tipFmt(s.pts[best][1]));
    }).join("<br>");
    tip.style.display = "block";
    tip.style.left = Math.min(e.clientX + 14, window.innerWidth - 220) + "px";
    tip.style.top = (e.clientY + 14) + "px";
  });
  document.addEventListener("mouseleave", function () { tip.style.display = "none"; }, true);

  /* ---------------- Unit economics results ---------------- */
  function pendingNotice(res, what) {
    return '<div class="notice warn">' + res.empty + " of " + res.total + " " + what + " inputs are still empty. " +
      "Fill them in, or load the Studio Falak example from the toolbar to see a finished result.</div>";
  }
  function renderUE() {
    var box = document.getElementById("ue-out"), ue = R.ue;
    CHARTS = {};
    if (!ue.cases) {
      box.innerHTML = ue.empty ? pendingNotice(ue, "unit-economics") :
        '<div class="notice bad">' + esc(ue.checks.horizon !== "OK" ? ue.checks.horizon : ue.checks.retention) + "</div>";
      return;
    }
    var H = S.ue.horizon, t = S.ue.target, cs = ue.cases, h = "";
    if (!ue.ready) h += '<div class="notice bad">Fix the checks before you rely on this: ' + esc(ue.checks.retention) + ".</div>";

    h += '<div class="cases">' + CASES.map(function (c) {
      var x = cs[c];
      var badge = x.verdict === "none" ? '<span class="badge warn">No paid installs</span>' :
        x.verdict === "meets" ? '<span class="badge good">Meets your ' + t.toFixed(2) + "× target</span>" :
        '<span class="badge ' + (x.ratio < 1 ? "bad" : "warn") + '">Below your ' + t.toFixed(2) + "× target</span>";
      return '<div class="case ' + c + '"><div class="cname">' + CASE_NAME[c] + '</div><div class="big">' + ratio(x.ratio) +
        '</div><div class="sub">LTV ' + usd(x.ltv) + " vs blended CPI " + usd(x.blended) + '</div><div class="rows">' +
        "<span>Profit per install</span><b" + cls(x.profit) + ">" + usd(x.profit) + "</b>" +
        "<span>Payback</span><b>" + (x.payback === null ? "Not within " + H + " days" : "Day " + x.payback) + "</b>" +
        "<span>Max CPI at target</span><b>" + usd(x.targetCpi) + "</b>" +
        "<span>Break-even CPI</span><b>" + usd(x.breakEvenCpi) + "</b></div>" + badge + "</div>";
    }).join("") + "</div>";

    // Charts
    var step = H > 365 ? 5 : H > 180 ? 3 : 1;
    var cumSeries = CASES.map(function (c) {
      var pts = [];
      for (var d = 0; d <= H; d += step) pts.push([d, cs[c].cum[d]]);
      if (pts[pts.length - 1][0] !== H) pts.push([H, cs[c].cum[H]]);
      return { k: c, pts: pts };
    });
    var xt = [0, 30, 60, 90, 180, 365, 730].filter(function (d) { return d <= H; }).map(function (d) { return { x: d, label: "Day " + d }; });
    if (H <= 90) xt = [0, 7, 14, 30, 60, 90].map(function (d) { return { x: d, label: "Day " + d }; });
    var retSeries = CASES.map(function (c) {
      var pts = [];
      for (var d = 1; d <= 90; d++) pts.push([d, cs[c].retCurve[d] * 100]);
      return { k: c, pts: pts };
    });
    h += '<div class="grid-2">' +
      '<div class="card"><h3>Cumulative profit per install</h3>' +
      lineChart({ label: "Cumulative profit per install by day", w: 420, h: 280, series: cumSeries, xMin: 0, xMax: H, yMin: 0, xTicks: xt,
        hlines: CASES.map(function (c) { return { k: c, y: cs[c].blended }; }),
        yFmt: function (v) { return "$" + v.toFixed(2); }, xFmt: function (d) { return "Day " + d; }, tipFmt: function (v) { return usd(v); } }) +
      legend('<span><i style="background:repeating-linear-gradient(90deg,var(--ink-muted) 0 5px,transparent 5px 9px)"></i>Blended CPI (payback when a line crosses its own)</span>') + "</div>" +
      '<div class="card"><h3>Retention, first 90 days</h3>' +
      lineChart({ label: "Share of installs still playing by day", w: 420, h: 280, series: retSeries, xMin: 1, xMax: 90, yMin: 0,
        xTicks: [1, 7, 14, 30, 60, 90].map(function (d) { return { x: d, label: "Day " + d }; }),
        yFmt: function (v) { return v.toFixed(0) + "%"; }, xFmt: function (d) { return "Day " + d; }, tipFmt: function (v) { return v.toFixed(1) + "%"; } }) +
      legend() + '<p class="note">Beyond day 30 the curve is an extension, not data.</p></div></div>';

    // Full table
    var row = function (label, fn, why, extra) {
      return "<tr" + (extra ? ' class="' + extra + '"' : "") + "><td>" + label + "</td>" + CASES.map(function (c) {
        var v = fn(cs[c]); return "<td" + (typeof v === "string" && v.charAt(0) === "−" ? ' class="neg"' : "") + ">" + v + "</td>";
      }).join("") + '<td class="why">' + (why || "") + "</td></tr>";
    };
    var sec = function (t) { return '<tr class="sec"><td colspan="5">' + t + "</td></tr>"; };
    h += '<div class="card"><h3>All results</h3><div class="tbl-wrap"><table class="t"><thead><tr><th>Result</th>' +
      CASES.map(function (c) { return '<th class="' + c + '">' + CASE_NAME[c].replace(" case", "") + "</th>"; }).join("") + "<th>What it means</th></tr></thead><tbody>" +
      sec("Retention the curve implies") +
      row("Day 1", function (x) { return pct(x.retention.d1); }, "Share of installs still playing the day after install.") +
      row("Day 7", function (x) { return pct(x.retention.d7); }) +
      row("Day 30", function (x) { return pct(x.retention.d30); }) +
      row("Day 90", function (x) { return pct(x.retention.d90); }, "Beyond day 30 this is the curve's extension, not data.") +
      row("Day 180", function (x) { return pct(x.retention.d180); }) +
      row("Day 365", function (x) { return pct(x.retention.d365); }) +
      row("Days played per install within " + H + " days", function (x) { return num(x.days, 2); }, "Install day counts as one.") +
      sec("Revenue per install within " + H + " days, after store fees, tax and refunds") +
      row("Paid download", function (x) { return usd(x.rev.paid, 3); }, "Zero for a free game.") +
      row("In-app purchases", function (x) { return usd(x.rev.iap, 3); }) +
      row("Ads", function (x) { return usd(x.rev.ads, 3); }) +
      row("Subscriptions", function (x) { return usd(x.rev.subs, 3); }, "Charged at day 0 and every 30 days, with renewals applied.") +
      row("Total revenue per install", function (x) { return usd(x.rev.total, 3); }, "", "total") +
      row("Variable cost per install", function (x) { return usd(x.varCost, 3); }, "Servers and support.") +
      row("<b>Lifetime value (LTV) per install</b>", function (x) { return "<b>" + usd(x.ltv, 3) + "</b>"; }, "Profit per install before you pay to acquire it.", "total") +
      sec("Acquisition and payback") +
      row("Paid cost per install", function (x) { return usd(x.cpi, 3); }, "Your CPI in this case.") +
      row("Blended cost per install", function (x) { return usd(x.blended, 3); }, "Organic installs count as zero.") +
      row("Profit per install after acquisition", function (x) { return usd(x.profit, 3); }, "Negative means each install loses money within the horizon.") +
      row("LTV to cost per install ratio", function (x) { return ratio(x.ratio); }, "Compare with your " + t.toFixed(2) + "× target.") +
      row("Highest paid CPI that still breaks even", function (x) { return usd(x.breakEvenCpi, 3); }, "Above this you lose money within the horizon.") +
      row("Highest paid CPI at your target ratio", function (x) { return usd(x.targetCpi, 3); }, "The CPI to give your acquisition team.") +
      row("Payback day", function (x) { return x.payback === null ? "Not within " + H + " days" : String(x.payback); }, "First day on which cumulative profit covers the blended cost.") +
      sec("Per 1,000 installs (USD)") +
      row("Cost to acquire", function (x) { return usd(x.per1000.cost, 0); }) +
      row("Profit before acquisition (LTV)", function (x) { return usd(x.per1000.ltv, 0); }) +
      row("Profit after acquisition", function (x) { return usd(x.per1000.profit, 0); }) +
      "</tbody></table></div></div>";

    // Monthly curve feeding the funding plan
    h += '<div class="card"><details class="more"><summary>Monthly profit curve used by the funding plan</summary>' +
      '<p class="note">Cumulative profit per install to the end of each month of its life, before acquisition cost. Always 12 months, whatever horizon you chose. The funding plan uses these directly; there is nothing to copy across.</p>' +
      '<div class="tbl-wrap"><table class="t compact"><thead><tr><th>Month of life</th>' + CASES.map(function (c) { return '<th class="' + c + '">' + CASE_NAME[c].replace(" case", "") + "</th>"; }).join("") +
      "</tr></thead><tbody>" + cs.base.curve.map(function (_, m) {
        return "<tr><td>Month " + (m + 1) + "</td>" + CASES.map(function (c) { return "<td>" + usd(cs[c].curve[m], 4) + "</td>"; }).join("") + "</tr>";
      }).join("") + "</tbody></table></div></details></div>";

    h += sendCard();
    box.innerHTML = h;
  }

  /* ---------------- Runway results ---------------- */
  function renderRunway() {
    var box = document.getElementById("run-out"), fu = R.fund;
    CHARTS = {};
    if (!R.ue.cases) { box.innerHTML = '<div class="notice warn">Finish the unit economics first: the funding plan runs on its results.</div>'; return; }
    if (!fu.months) {
      box.innerHTML = fu.empty ? pendingNotice(fu, "funding-plan") : '<div class="notice bad">' + esc(fu.checks.dates) + "</div>";
      return;
    }
    var h = "", cs = fu.cases;
    var bad = ["curve", "dates", "uaMonths", "cash"].filter(function (k) { return fu.checks[k] !== "OK"; });
    if (bad.length) h += '<div class="notice bad">Fix before you rely on this: ' + bad.map(function (k) { return esc(fu.checks[k]); }).join(" · ") + ".</div>";

    h += '<div class="cases">' + CASES.map(function (c) {
      var x = cs[c];
      var badge = x.runOut ? (x.runway < 18 ? '<span class="badge bad">Under 18 months from the round</span>' : '<span class="badge warn">Runs out ' + monthName(x.runOut) + "</span>") :
        '<span class="badge good">Never runs out in 36 months</span>';
      return '<div class="case ' + c + '"><div class="cname">' + CASE_NAME[c] + '</div><div class="big">' + (x.runOut ? x.runway + " months" : "36+ months") +
        '</div><div class="sub">of runway from the round (' + monthName(S.fund.roundMonth) + ')</div><div class="rows">' +
        "<span>Lowest cash</span><b" + cls(x.minCash) + ">" + money(x.minCash) + "</b>" +
        "<span>Installs, first 12 months</span><b>" + num(x.installs12) + "</b>" +
        "<span>Net revenue, first 12 months</span><b>" + money(x.revenue12) + "</b>" +
        "<span>Payback month</span><b>" + (x.paybackMonth === null ? "Not within 12" : "Month " + x.paybackMonth) + "</b></div>" + badge + "</div>";
    }).join("") + "</div>";

    var start = M.ym(S.fund.start);
    var series = CASES.map(function (c) { return { k: c, pts: fu.months.map(function (r, j) { return [j, r.cash[c]]; }) }; });
    var xt = fu.months.map(function (r, j) { return j; }).filter(function (j) { return j % 6 === 0 || j === 35; })
      .map(function (j) { return { x: j, label: monthName(fu.months[j].month).replace(/ (\d\d)(\d\d)$/, " ’$2") }; });
    var vl = [];
    var rIdx = M.ym(S.fund.roundMonth) - start, lIdx = M.ym(S.fund.launch) - start;
    if (rIdx >= 0 && rIdx < 36) vl.push({ x: rIdx, label: "Round" });
    if (lIdx >= 0 && lIdx < 36) vl.push({ x: lIdx, label: "Launch" });
    h += '<div class="card"><h3>Cash at the end of each month (' + esc(cur()) + ")</h3>" +
      lineChart({ label: "Cash by month for each case", w: 900, h: 320, series: series, xMin: 0, xMax: 35, xTicks: xt, vlines: vl,
        yFmt: moneyShort, xFmt: function (j) { return monthName(fu.months[j].month); }, tipFmt: money }) + legend() + "</div>";

    // Slide 9: per install
    var row = function (label, fn) { return "<tr><td>" + label + "</td>" + CASES.map(function (c) { var v = fn(cs[c]); return "<td" + (/^−/.test(v) ? ' class="neg"' : "") + ">" + v + "</td>"; }).join("") + "</tr>"; };
    var head = "<thead><tr><th></th>" + CASES.map(function (c) { return '<th class="' + c + '">' + CASE_NAME[c].replace(" case", "") + "</th>"; }).join("") + "</tr></thead>";
    h += '<div class="grid-2"><div class="card"><h3>Per install <span class="muted">· slide 9</span></h3><div class="tbl-wrap"><table class="t compact">' + head + "<tbody>" +
      row("Paid cost per install", function (x) { return usd(x.cpi); }) +
      row("Blended cost per install", function (x) { return usd(x.blended); }) +
      row("Profit earned per install in 12 months", function (x) { return usd(x.profit12); }) +
      row("Profit per install after acquisition", function (x) { return usd(x.afterAcq); }) +
      row("Profit earned to cost ratio", function (x) { return ratio(x.ratio); }) +
      row("Payback month", function (x) { return x.paybackMonth === null ? "Not within 12" : String(x.paybackMonth); }) +
      row("Per 1,000 installs: cost", function (x) { return money(x.per1000Cost); }) +
      row("Per 1,000 installs: profit in 12 months", function (x) { return money(x.per1000Profit); }) +
      "</tbody></table></div></div>";
    h += '<div class="card"><h3>Cash and runway <span class="muted">· slides 10–11</span></h3><div class="tbl-wrap"><table class="t compact">' + head + "<tbody>" +
      row("Installs in the first 12 months after launch", function (x) { return num(x.installs12); }) +
      row("Net revenue in the first 12 months", function (x) { return money(x.revenue12); }) +
      row("Lowest cash in the model", function (x) { return money(x.minCash); }) +
      row("Cash runs out in", function (x) { return x.runOut ? monthName(x.runOut) : "Not within 36 months"; }) +
      row("Months of runway from the round", function (x) { return x.runOut ? String(x.runway) : "36+"; }) +
      "</tbody></table></div></div></div>";

    // Slide 13: use of funds
    var u = fu.useOfFunds;
    h += '<div class="grid-2"><div class="card"><h3>Use of funds <span class="muted">· slide 13</span></h3>' +
      '<p class="note">From the model start to ' + (u.runsOut ? "the base-case run-out, " : "the last model month, ") + monthName(u.windowEnd) + ".</p>" +
      '<div class="bar" role="img" aria-label="Spend split">' +
      '<span style="width:' + (u.shares.team * 100) + '%;background:var(--slate)"></span>' +
      '<span style="width:' + (u.shares.ua * 100) + '%;background:var(--orange)"></span>' +
      '<span style="width:' + (u.shares.oneOff * 100) + '%;background:var(--mustard)"></span></div>' +
      '<div class="bar-legend"><span><i style="background:var(--slate)"></i>Team and running</span><span><i style="background:var(--orange)"></i>User acquisition</span><span><i style="background:var(--mustard)"></i>One-off</span></div>' +
      '<table class="t compact" style="margin-top:10px"><tbody>' +
      "<tr><td>Team and running costs</td><td>" + money(u.team) + "</td><td>" + pct(u.shares.team, 0) + "</td></tr>" +
      "<tr><td>User acquisition</td><td>" + money(u.ua) + "</td><td>" + pct(u.shares.ua, 0) + "</td></tr>" +
      "<tr><td>One-off cost</td><td>" + money(u.oneOff) + "</td><td>" + pct(u.shares.oneOff, 0) + "</td></tr>" +
      '<tr class="total"><td>Total spend in the window</td><td>' + money(u.total) + "</td><td></td></tr></tbody></table></div>";

    // Slide 12 + 14
    var a = fu.ask, cp = fu.cap;
    h += '<div class="card"><h3>The ask <span class="muted">· slide 12</span></h3><table class="t compact"><tbody>' +
      "<tr><td>This round</td><td>" + money(a.round) + "</td></tr>" +
      "<tr><td>Founder cash at the model start</td><td>" + money(a.founderCash) + "</td></tr>" +
      "<tr><td>Base-case net revenue in the window</td><td>" + money(a.baseRevenue) + "</td></tr>" +
      '<tr class="total"><td>Total funding available</td><td>' + money(a.available) + "</td></tr>" +
      "<tr><td>Total spend in the window</td><td>" + money(a.spend) + "</td></tr>" +
      '<tr class="total"><td>' + (a.leftover < 0 ? "Short at the end of the window" : "Left over at the end of the window") + "</td><td" + cls(a.leftover) + ">" + money(a.leftover) + "</td></tr></tbody></table>" +
      '<p class="note">Equals base-case cash at the end of the window. Negative means the money ran out in that month.</p>' +
      '<h3 style="margin-top:18px">Capital structure <span class="muted">· slide 14</span></h3><table class="t compact"><tbody>' +
      "<tr><td>Pre-money valuation</td><td>" + money(cp.pre) + "</td></tr>" +
      "<tr><td>Post-money valuation</td><td>" + money(cp.post) + "</td></tr>" +
      "<tr><td>Share of the studio the round buys</td><td>" + pct(cp.roundShare) + "</td></tr>" +
      "<tr><td>Share that stays with founders and existing holders</td><td>" + pct(cp.founderShare) + "</td></tr></tbody></table>" +
      '<p class="note">Shares by holder go on the slide from your cap table. These are the totals to match.</p></div></div>';

    // Monthly table
    h += '<div class="card"><details class="more"><summary>Month-by-month cash flow</summary><div class="tbl-wrap"><table class="t compact"><thead><tr>' +
      "<th>Month</th><th>Running</th><th>User acq.</th><th>One-off</th><th>Round</th><th>Installs (base)</th><th>Revenue (base)</th>" +
      CASES.map(function (c) { return '<th class="' + c + '">Cash · ' + c + "</th>"; }).join("") + "</tr></thead><tbody>" +
      fu.months.map(function (r) {
        return "<tr><td>" + monthName(r.month) + "</td><td>" + moneyShort(r.running) + "</td><td>" + moneyShort(r.ua) + "</td><td>" + (r.oneOff ? moneyShort(r.oneOff) : "") +
          "</td><td>" + (r.round ? moneyShort(r.round) : "") + "</td><td>" + num(r.installs.base) + "</td><td>" + moneyShort(r.revenue.base) + "</td>" +
          CASES.map(function (c) { return "<td" + cls(r.cash[c]) + ">" + moneyShort(r.cash[c]) + "</td>"; }).join("") + "</tr>";
      }).join("") + "</tbody></table></div><p class=\"note\">Amounts in " + esc(cur()) + ".</p></details></div>";

    h += sendCard();
    box.innerHTML = h;
  }

  /* ---------------- Send to Game OS ---------------- */
  function sendCard() {
    return '<div class="card no-print"><h3>Send to Game OS</h3><p class="note">Record the base-case results as signals on your current game, so other Game OS tools can see them.</p>' +
      '<button class="btn" type="button" data-send>Send results to my game</button><div class="feedback" data-feedback></div></div>';
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-send]");
    if (!b) return;
    var fb = b.parentNode.querySelector("[data-feedback]");
    var say = function (m, err) { fb.textContent = m; fb.style.color = err ? "var(--status-concern)" : ""; };
    if (!window.GOS || !GOS.ready) { say("Game OS isn't available on this page.", true); return; }
    GOS.ready.then(function () {
      if (!GOS.user) { say("Sign in to send results to your game.", true); return; }
      if (!GOS.game) { say("Add your game in the bar at the top of this page first.", true); window.scrollTo(0, 0); return; }
      var b0 = R.ue.cases && R.ue.cases.base;
      if (!b0) { say("Finish the unit economics first.", true); return; }
      var list = [
        { key: "mobile_ltv_per_install", label: "LTV per install (base, " + S.ue.horizon + " days)", value: b0.ltv, unit: "usd" },
        { key: "mobile_blended_cpi", label: "Blended cost per install (base)", value: b0.blended, unit: "usd" },
        { key: "mobile_ltv_cpi_ratio", label: "LTV to CPI ratio (base)", value: b0.ratio, unit: "ratio", meta: { target: S.ue.target } },
        { key: "mobile_max_cpi_target", label: "Max paid CPI at target ratio (base)", value: b0.targetCpi, unit: "usd" },
      ];
      if (b0.payback !== null) list.push({ key: "mobile_payback_day", label: "Payback day (base)", value: b0.payback, unit: "days" });
      var fc = R.fund.cases && R.fund.cases.base;
      if (fc && fc.runway !== null) list.push({ key: "mobile_runway_months", label: "Runway from the round (base)", value: fc.runway, unit: "months" });
      list = list.filter(function (s) { return s.value !== null && isFinite(s.value); });
      b.disabled = true; say("Sending to " + GOS.game.title + "…");
      GOS.recordSignals(TOOL_ID, list)
        .then(function () { say("Sent " + list.length + " signals to " + GOS.game.title + "."); if (window.gosTrack) gosTrack("output_action", { action: "send_signals" }); })
        .catch(function (err) { say("Could not send: " + err.message, true); })
        .then(function () { b.disabled = false; });
    }, function () { say("Couldn't reach Game OS.", true); });
  });

  /* ---------------- Toolbar ---------------- */
  function rerenderAll() { compute(); renderInputs(); renderLive(); go(current, { replace: true, noScroll: true }); }
  document.getElementById("btn-example").addEventListener("click", function () {
    if (anyFilled() && !confirm("Replace your inputs with the Studio Falak example? Save your workbook first if you want to keep it.")) return;
    var ex = M.EXAMPLE;
    S.ue = JSON.parse(JSON.stringify(ex.ue));
    S.fund = JSON.parse(JSON.stringify(ex.fund));
    S.currency = ex.currency;
    S.sources = JSON.parse(JSON.stringify(ex.sources));
    rerenderAll(); persist();
    if (window.gosTrack) gosTrack("example_loaded", {});
  });
  document.getElementById("btn-clear").addEventListener("click", function () {
    if (!confirm("Clear every input? This can't be undone unless you saved the workbook.")) return;
    S = emptyState(); rerenderAll(); persist(); go("players");
  });
  document.getElementById("btn-print").addEventListener("click", function () {
    // Render both result steps so print shows them.
    var keep = current;
    current = "unit-economics"; renderUE(); current = "runway"; renderRunway(); current = keep;
    window.print();
  });
  document.getElementById("btn-save").addEventListener("click", function () {
    var blob = new Blob([JSON.stringify({ tool: TOOL_ID, version: 1, state: S }, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "mobile-calculator-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });
  var fileIn = document.getElementById("file-open");
  document.getElementById("btn-open").addEventListener("click", function () { fileIn.click(); });
  fileIn.addEventListener("change", function () {
    var file = fileIn.files && fileIn.files[0];
    if (!file) return;
    file.text().then(function (txt) {
      var j = JSON.parse(txt);
      var st = normalise(j && j.state ? j.state : j);
      if (!st) throw new Error("not a Mobile Calculator workbook");
      S = st; rerenderAll(); persist();
    }).catch(function (e) { alert("Couldn't open that file: " + e.message); })
      .then(function () { fileIn.value = ""; });
  });

  /* ---------------- Account save ---------------- */
  var accountReady = false, accountUser = false, accountTimer = null;
  function status(text, kind) {
    var el = document.getElementById("save-status");
    if (!el) {
      el = document.createElement("span"); el.id = "save-status"; el.setAttribute("role", "status");
      document.querySelector(".toolbar").appendChild(el);
    }
    el.className = "save-status " + (kind || ""); el.textContent = text;
  }
  function scheduleAccountSave() {
    if (!accountReady || !accountUser) return;
    if (accountTimer) clearTimeout(accountTimer);
    accountTimer = setTimeout(function () { accountTimer = null; saveToAccount(); }, 2000);
    status("Saving…");
  }
  function saveToAccount(keepalive) {
    var body = JSON.stringify({ state: S });
    fetch(ACCOUNT_URL, { method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: body, keepalive: !!keepalive && body.length < 60000 })
      .then(function (r) { if (!r.ok) throw new Error(r.status); status("Saved to your account", "ok"); })
      .catch(function () { status("Couldn't save to your account; your work is still in this browser", "error"); });
  }
  function initAccount() {
    if (!window.GOS || !GOS.ready) { status("Saved in this browser"); return; }
    GOS.ready.then(function () {
      accountUser = !!GOS.user;
      if (!accountUser) { status("Not signed in: saved in this browser only", "error"); return; }
      return fetch(ACCOUNT_URL, { credentials: "same-origin" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          var server = j && j.state ? normalise(j.state) : null;
          if (server && (server.savedAt || 0) > (S.savedAt || 0) + 1000) {
            S = server; rerenderAll();
            try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) {}
          }
          accountReady = true;
          if (server) status("Saved to your account", "ok");
          else if (anyFilled()) saveToAccount();
        });
    }).catch(function () { status("Saved in this browser"); });
    window.addEventListener("pagehide", function () { if (accountReady && accountTimer) { clearTimeout(accountTimer); saveToAccount(true); } });
  }

  /* ---------------- Boot ---------------- */
  compute();
  renderInputs();
  renderLive();
  go(hashStep(), { replace: true, noScroll: true });
  if (window.GOS && GOS.mountBar) GOS.mountBar("#gameBar", { toolId: TOOL_ID });
  initAccount();
})();
