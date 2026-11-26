/* Mobile Calculator — model.
 *
 * A straight port of the two Llama & Griffin workbooks:
 *   1 Mobile Unit Economics  (Inputs / Cohort / Outputs)
 *   2 Mobile Funding Model   (Inputs / Cash flow / Cohorts / Outputs)
 * The funding model reads the unit-economics results directly, so the
 * "paste values into From calculator" step of the workbooks is gone.
 *
 * Percentages are fractions (0.35 = 35%). Money in the unit economics is
 * USD; the funding model works in the studio's local currency via `fx`
 * (local units per USD, 3.75 for SAR). Dates are "YYYY-MM" month strings.
 *
 * Pure functions, no DOM. Works in the browser (window.MobileModel) and in
 * Node (module.exports) so it can be tested against the Excel results.
 */
(function (root) {
  "use strict";

  var MAX_DAY = 730;
  var HORIZONS = [90, 180, 365, 730];
  var MONTHS = 36;
  var CASES = ["stress", "base", "upside"];

  /* Input keys, in workbook order. */
  var UE_KEYS = [
    "cpi", "organic", "d1", "d7", "d30", "iapArpdau", "adImps", "ecpm", "adKeep",
    "subShare", "subPrice", "subRenew", "paidPrice", "storeFee", "subFee", "taxKeep",
    "refunds", "varCost", "horizon", "target",
    "stressRet", "stressMon", "stressCpi", "upRet", "upMon", "upCpi",
  ];
  var FUND_KEYS = [
    "fx", "start", "launch", "uaBudget", "uaMonths", "running", "oneOff", "oneOffMonth",
    "cash", "round", "roundMonth", "preMoney",
  ];

  function blank(v) { return v === null || v === undefined || v === "" || (typeof v === "number" && !isFinite(v)); }
  function countBlank(obj, keys) { var n = 0; keys.forEach(function (k) { if (blank(obj[k])) n++; }); return n; }

  /* ---------- Unit economics ---------- */

  function caseParams(i, c) {
    if (c === "stress") return { ret: i.stressRet, mon: i.stressMon, cpi: i.stressCpi };
    if (c === "upside") return { ret: i.upRet, mon: i.upMon, cpi: i.upCpi };
    return { ret: 1, mon: 1, cpi: 1 };
  }

  function decay(d1, d30) {
    if (!(d1 > 0) || !(d30 > 0)) return 0;
    var k = Math.log(d1 / d30) / Math.log(30);
    return isFinite(k) ? k : 0;
  }

  function scenario(i, c) {
    var p = caseParams(i, c);
    var d1 = Math.min(0.99, i.d1 * p.ret);
    var d30 = Math.min(i.d30 * p.ret, d1 * 0.99);
    var k = decay(d1, d30);
    var iap = i.iapArpdau * p.mon * i.taxKeep * (1 - i.storeFee) * (1 - i.refunds);
    var ad = (i.adImps * i.ecpm) / 1000 * p.mon * i.adKeep;
    var vc = i.varCost;
    var perDay = iap + ad - vc;
    var sub0 = i.subShare * p.mon * i.subPrice * i.taxKeep * (1 - i.subFee) * (1 - i.refunds);
    var paid = i.paidPrice * i.taxKeep * (1 - i.storeFee) * (1 - i.refunds);
    var cpi = i.cpi * p.cpi;
    var blended = (1 - i.organic) * cpi;

    var ret = new Array(MAX_DAY + 1);
    var cum = new Array(MAX_DAY + 1);
    for (var t = 0; t <= MAX_DAY; t++) {
      ret[t] = t === 0 ? 1 : d1 * Math.pow(t, -k);
      var subToday = t % 30 === 0 ? sub0 * Math.pow(i.subRenew, t / 30) : 0;
      cum[t] = (t === 0 ? paid : cum[t - 1]) + ret[t] * perDay + subToday;
    }

    var H = i.horizon;
    var days = 0;
    for (t = 0; t <= Math.min(H, MAX_DAY); t++) days += ret[t];

    var nSubs = Math.floor(H / 30) + 1;
    var subFactor = i.subRenew === 1 ? nSubs : (1 - Math.pow(i.subRenew, nSubs)) / (1 - i.subRenew);
    var rev = {
      paid: paid,
      iap: days * iap,
      ads: days * ad,
      subs: sub0 * subFactor,
    };
    rev.total = rev.paid + rev.iap + rev.ads + rev.subs;
    var varTotal = days * vc;
    var ltv = rev.total - varTotal;
    var paidShare = 1 - i.organic;

    // Payback: first day cumulative profit covers the blended cost.
    var payback;
    if (blended <= 0) payback = 0;
    else {
      var below = 0;
      for (t = 0; t <= Math.min(H, MAX_DAY); t++) if (cum[t] < blended) below++;
      payback = below > H ? null : below; // null = not within the horizon
    }

    // Cumulative profit per install at the end of months 1..12 (day 30m-1).
    var curve = [];
    for (var m = 1; m <= 12; m++) curve.push(cum[30 * m - 1]);

    var at = function (d) { return d === 0 ? 1 : d1 * Math.pow(d, -k); };
    return {
      key: c,
      d1: d1, d30: d30, k: k,
      retention: { d1: at(1), d7: at(7), d30: at(30), d90: at(90), d180: at(180), d365: at(365) },
      days: days,
      perDay: { iap: iap, ads: ad, varCost: vc, profit: perDay },
      sub0: sub0,
      rev: rev,
      varCost: varTotal,
      ltv: ltv,
      cpi: cpi,
      blended: blended,
      profit: ltv - blended,
      ratio: blended <= 0 ? null : ltv / blended,
      breakEvenCpi: paidShare > 0 ? ltv / paidShare : null,
      targetCpi: paidShare > 0 && i.target > 0 ? ltv / i.target / paidShare : null,
      payback: payback,
      per1000: { cost: 1000 * blended, ltv: 1000 * ltv, profit: 1000 * (ltv - blended) },
      verdict: blended <= 0 ? "none" : (ltv / blended >= i.target ? "meets" : "below"),
      retCurve: ret,
      cum: cum,
      curve: curve,
    };
  }

  function unitEconomics(i) {
    var empty = countBlank(i, UE_KEYS);
    var checks = {};
    var k = decay(i.d1, i.d30);
    var impliedD7 = blank(i.d1) ? null : i.d1 * Math.pow(7, -k);
    var d7Diff = blank(i.d7) || impliedD7 === null ? null : (i.d7 - impliedD7) * 100;
    if (blank(i.d1) || blank(i.d7) || blank(i.d30)) checks.retention = "Fill in the three retention inputs";
    else if (i.d1 <= i.d30) checks.retention = "Day 1 must be higher than day 30";
    else if (Math.abs(d7Diff) > 3) checks.retention = "Check your retention figures: day 7 does not fit the curve";
    else checks.retention = "OK";
    checks.horizon = HORIZONS.indexOf(i.horizon) >= 0 ? "OK" : "Horizon must be 90, 180, 365 or 730 days";

    var out = {
      empty: empty, total: UE_KEYS.length, checks: checks,
      decay: k, impliedD7: impliedD7, d7Diff: d7Diff,
      ready: empty === 0 && checks.retention === "OK" && checks.horizon === "OK",
      cases: null,
    };
    if (empty === 0 && checks.horizon === "OK" && i.d1 > 0 && i.d30 > 0) {
      out.cases = {};
      CASES.forEach(function (c) { out.cases[c] = scenario(i, c); });
    }
    return out;
  }

  /* ---------- Funding model ---------- */

  function ym(s) {
    if (!s) return null;
    var m = /^(\d{4})-(\d{1,2})/.exec(String(s));
    if (!m) return null;
    return Number(m[1]) * 12 + (Number(m[2]) - 1);
  }
  function ymStr(n) {
    var y = Math.floor(n / 12), mo = (n % 12) + 1;
    return y + "-" + (mo < 10 ? "0" : "") + mo;
  }

  function funding(f, organic, ue) {
    var empty = countBlank(f, FUND_KEYS) + (blank(organic) ? 1 : 0);
    var checks = {};
    var start = ym(f.start), launch = ym(f.launch), oneOffM = ym(f.oneOffMonth), roundM = ym(f.roundMonth);
    var cases = ue && ue.cases;

    // Curve check: profit per install must not fall from one month to the next.
    if (!cases) checks.curve = "Finish the unit economics first";
    else {
      var falls = CASES.some(function (c) {
        var cv = cases[c].curve;
        for (var m = 1; m < 12; m++) if (cv[m] < cv[m - 1]) return true;
        return false;
      });
      checks.curve = falls ? "Profit per install falls from one month to the next: check variable cost against revenue per day" : "OK";
    }
    if (start === null || launch === null || oneOffM === null || roundM === null) checks.dates = "Fill in all four dates";
    else if (launch < start || roundM < start) checks.dates = "Launch and round must not come before the model start";
    else checks.dates = "OK";
    checks.uaMonths = f.uaMonths < 0 || f.uaMonths > 36 ? "Use 0 to 36 months" : "OK";

    var out = { empty: empty, total: FUND_KEYS.length + 1, checks: checks, months: null };
    if (empty > 0 || !cases || start === null || launch === null) { checks.cash = "—"; out.ready = false; return out; }

    var fx = f.fx;
    var paidShare = 1 - organic;
    var perMonth = {};
    CASES.forEach(function (c) {
      var cv = cases[c].curve;
      perMonth[c] = cv.map(function (v, a) { return a === 0 ? v : v - cv[a - 1]; });
    });

    var months = [];
    var cash = { stress: f.cash, base: f.cash, upside: f.cash };
    var installs = { stress: [], base: [], upside: [] };
    for (var j = 0; j < MONTHS; j++) {
      var n = start + j;
      var msl = n - launch;
      var running = f.running;
      var ua = msl >= 0 && msl < f.uaMonths ? f.uaBudget * fx : 0;
      var oneOff = n === oneOffM ? f.oneOff : 0;
      var cost = running + ua + oneOff;
      var roundIn = n === roundM ? f.round : 0;
      var row = { month: ymStr(n), sinceLaunch: msl, running: running, ua: ua, oneOff: oneOff, cost: cost, round: roundIn,
        paid: {}, installs: {}, revenue: {}, cash: {}, below: {} };
      CASES.forEach(function (c) {
        var cpi = cases[c].cpi;
        var paid = cpi > 0 ? ua / fx / cpi : 0;
        var inst = paidShare > 0 ? paid / paidShare : 0;
        installs[c][j] = inst;
        var usd = 0;
        for (var a = 0; a < 12 && a <= j; a++) usd += installs[c][j - a] * perMonth[c][a];
        var rev = usd * fx;
        cash[c] = cash[c] + roundIn - cost + rev;
        row.paid[c] = paid; row.installs[c] = inst; row.revenue[c] = rev; row.cash[c] = cash[c];
        row.below[c] = cash[c] < 0 && roundM !== null && n >= roundM;
      });
      months.push(row);
    }
    out.months = months;

    // Cash before the round
    var earlyNeg = roundM !== null && months.some(function (r, j) {
      return start + j < roundM && (r.cash.stress < 0 || r.cash.base < 0 || r.cash.upside < 0);
    });
    checks.cash = earlyNeg ? "Cash goes below zero before the round arrives" : "OK";
    out.ready = empty === 0 && checks.curve === "OK" && checks.dates === "OK" && checks.uaMonths === "OK" && checks.cash === "OK";

    var res = {};
    CASES.forEach(function (c) {
      var u = cases[c];
      var blended = u.cpi * paidShare;
      var p12 = u.curve[11];
      var below = u.curve.filter(function (v) { return v < blended; }).length;
      var firstYear = months.filter(function (r) { return r.sinceLaunch >= 0 && r.sinceLaunch <= 11; });
      var minCash = Math.min.apply(null, months.map(function (r) { return r.cash[c]; }));
      var runIdx = -1;
      for (var j2 = 0; j2 < months.length; j2++) if (months[j2].below[c]) { runIdx = j2; break; }
      res[c] = {
        cpi: u.cpi,
        blended: blended,
        profit12: p12,
        afterAcq: p12 - blended,
        ratio: blended <= 0 ? null : p12 / blended,
        paybackMonth: blended <= 0 ? 0 : (below === 12 ? null : below + 1),
        per1000Cost: 1000 * blended * fx,
        per1000Profit: 1000 * p12 * fx,
        installs12: firstYear.reduce(function (s, r) { return s + r.installs[c]; }, 0),
        revenue12: firstYear.reduce(function (s, r) { return s + r.revenue[c]; }, 0),
        minCash: minCash,
        runOut: runIdx >= 0 ? months[runIdx].month : null,
        runway: runIdx >= 0 && roundM !== null ? (start + runIdx) - roundM : null,
      };
    });
    out.cases = res;

    // Use of funds: model start to the base-case run-out (or the last month).
    var endIdx = res.base.runOut ? months.findIndex(function (r) { return r.month === res.base.runOut; }) : months.length - 1;
    var win = months.slice(0, endIdx + 1);
    var sum = function (fn) { return win.reduce(function (s, r) { return s + fn(r); }, 0); };
    var team = sum(function (r) { return r.running; });
    var uaSpend = sum(function (r) { return r.ua; });
    var oneOffSpend = sum(function (r) { return r.oneOff; });
    var spend = team + uaSpend + oneOffSpend;
    var baseRev = sum(function (r) { return r.revenue.base; });
    out.useOfFunds = {
      windowEnd: months[endIdx].month,
      runsOut: !!res.base.runOut,
      team: team, ua: uaSpend, oneOff: oneOffSpend, total: spend,
      shares: spend ? { team: team / spend, ua: uaSpend / spend, oneOff: oneOffSpend / spend } : { team: 0, ua: 0, oneOff: 0 },
    };
    out.ask = {
      round: f.round,
      founderCash: f.cash,
      baseRevenue: baseRev,
      available: f.round + f.cash + baseRev,
      spend: spend,
      leftover: f.round + f.cash + baseRev - spend,
    };
    var post = f.preMoney + f.round;
    out.cap = { pre: f.preMoney, post: post, roundShare: post ? f.round / post : 0, founderShare: post ? 1 - f.round / post : 1 };
    return out;
  }

  /* ---------- Studio Falak worked example (fictional) ---------- */

  var EXAMPLE = {
    name: "Studio Falak (fictional)",
    currency: "SAR",
    ue: {
      cpi: 0.8, organic: 0.35, d1: 0.35, d7: 0.12, d30: 0.05, iapArpdau: 0.04, adImps: 6, ecpm: 7, adKeep: 0.95,
      subShare: 0.01, subPrice: 4.99, subRenew: 0.75, paidPrice: 0, storeFee: 0.15, subFee: 0.15, taxKeep: 0.9,
      refunds: 0.03, varCost: 0.002, horizon: 365, target: 1.5,
      stressRet: 0.8, stressMon: 0.8, stressCpi: 1.25, upRet: 1.2, upMon: 1.2, upCpi: 0.9,
    },
    fund: {
      fx: 3.75, start: "2026-11", launch: "2027-06", uaBudget: 30000, uaMonths: 12, running: 150000,
      oneOff: 200000, oneOffMonth: "2027-03", cash: 450000, round: 3600000, roundMonth: "2027-01", preMoney: 14000000,
    },
    sources: {
      cpi: "Illustrative: replace with your soft-launch spend ÷ installs",
      d1: "Illustrative: casual puzzle game with ads, IAP and a monthly pass",
      adImps: "Illustrative: rewarded video plus interstitials",
      paidPrice: "Free to download",
      storeFee: "Illustrative: studio under US$1M a year in proceeds",
      taxKeep: "Illustrative blended assumption",
      horizon: "One year",
      fx: "Riyal peg",
      start: "Course start",
      launch: "Studio plan: global launch after soft launch",
      uaBudget: "Studio plan",
      uaMonths: "Studio plan: one year, then reassess",
      running: "Studio plan: 7 people, tools and office",
      oneOff: "Studio plan",
      cash: "Observed: founder capital",
      round: "The ask",
      roundMonth: "Planned first close",
      preMoney: "Founders' proposal, to be negotiated",
    },
  };

  var api = {
    UE_KEYS: UE_KEYS, FUND_KEYS: FUND_KEYS, CASES: CASES, HORIZONS: HORIZONS, MONTHS: MONTHS,
    unitEconomics: unitEconomics, funding: funding, EXAMPLE: EXAMPLE, ym: ym, ymStr: ymStr,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MobileModel = api;
})(typeof window !== "undefined" ? window : this);
