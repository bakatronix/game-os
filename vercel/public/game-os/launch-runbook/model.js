/* Launch Runbook — pure model. UMD: window.RunbookModel in the browser, module.exports in Node.
 *
 * Builds a dated checklist from a launch date and a few choices. Every task is
 * either a Steam rule (with the Steamworks page it comes from) or a suggestion
 * (common practice, labelled as such so nobody mistakes it for a requirement).
 * Steam rules checked against Steamworks docs on 2026-11-21.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RunbookModel = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DAY = 86400000;
  var CHECKED = "2026-11-21";
  var DOCS = {
    releasing: "https://partner.steamgames.com/doc/store/releasing",
    comingSoon: "https://partner.steamgames.com/doc/store/coming_soon",
    pricing: "https://partner.steamgames.com/doc/store/pricing",
    discounts: "https://partner.steamgames.com/doc/marketing/discounts",
    wishlist: "https://partner.steamgames.com/doc/marketing/wishlist",
    nextfest: "https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest",
    earlyAccess: "https://partner.steamgames.com/doc/store/earlyaccess",
    appfee: "https://partner.steamgames.com/doc/gettingstarted/appfee",
  };

  var PHASES = [
    { id: "store", name: "Store page and Steam review" },
    { id: "build", name: "Build, price and release setup" },
    { id: "market", name: "Press, creators and community" },
    { id: "launch", name: "Launch day" },
    { id: "after", name: "After launch" },
  ];

  /* ---------------- Dates ---------------- */
  function d(s) { var p = String(s).split("-"); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function iso(t) { return new Date(t).toISOString().slice(0, 10); }
  function addDays(s, n) { return iso(d(s) + n * DAY); }
  function weekday(s) { return new Date(d(s)).getUTCDay(); }
  /* n business days before s (Mon–Fri; public holidays not counted). */
  function minusBusinessDays(s, n) {
    var t = s;
    while (n > 0) { t = addDays(t, -1); var w = weekday(t); if (w !== 0 && w !== 6) n--; }
    return t;
  }
  /* Move a date that lands on a weekend back to the Friday before. */
  function weekdayOnOrBefore(s) { var w = weekday(s); return w === 6 ? addDays(s, -1) : w === 0 ? addDays(s, -2) : s; }
  function daysBetween(a, b) { return Math.round((d(b) - d(a)) / DAY); }
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  function fmt(s, year) { var p = s.split("-"); return MON[+p[1] - 1] + " " + (+p[2]) + (year ? ", " + p[0] : ""); }
  function fmtDay(s) { return WD[weekday(s)] + " " + fmt(s); }

  /* ---------------- Tasks ----------------
     due(o) returns the due date. kind: "rule" (Steam requires it) or "tip" (suggested). */
  function tasks(o) {
    var L = o.launch, list = [];
    function add(t) { if (!t.when || t.when(o)) list.push(t); }
    var comingSoonBy = addDays(L, -14);
    var storeSubmitBy = minusBusinessDays(comingSoonBy, 7);

    // Store page and review
    add({ id: "fee", phase: "store", kind: "rule", title: "Pay the Steam Direct fee and create the app",
      detail: "US$100 per game, paid by a Steamworks admin. Not refundable, but recouped once the game makes US$1,000. Skip if done.",
      due: weekdayOnOrBefore(addDays(storeSubmitBy, -7)), doc: DOCS.appfee, when: function () { return o.type !== "leave-ea"; } });
    add({ id: "store-submit", phase: "store", kind: "rule", title: "Submit the store page for Valve's review",
      detail: "Steam asks for at least 7 business days before you want the page live; the review itself usually takes 3–5 business days. Skip if your page is already Coming Soon.",
      due: storeSubmitBy, doc: DOCS.comingSoon, when: function () { return o.type !== "leave-ea"; } });
    add({ id: "coming-soon", phase: "store", kind: "rule", title: "Post the page as Coming Soon",
      detail: "A new game must be visible as Coming Soon for at least two weeks before you can release it. Most studios keep it up for months to build wishlists.",
      due: comingSoonBy, doc: DOCS.comingSoon, when: function () { return o.type !== "leave-ea"; } });
    add({ id: "ea-page", phase: "store", kind: "rule", title: "Fill in the Early Access questions on the store page",
      detail: "Early Access games answer Valve's questions (why Early Access, how long, what changes) and that section is reviewed with the page.",
      due: storeSubmitBy, doc: DOCS.earlyAccess, when: function () { return o.type === "ea"; } });
    add({ id: "page-refresh", phase: "store", kind: "tip", title: "Refresh the store page for 1.0",
      detail: "Update the description, screenshots, trailer and the Early Access section so the page sells the finished game.",
      due: weekdayOnOrBefore(addDays(L, -14)), when: function () { return o.type === "leave-ea"; } });
    add({ id: "capsules", phase: "store", kind: "tip", title: "Lock the capsule art, trailer and screenshots",
      detail: "The launch-day page is what wishlisters land on from Steam's email. Finish it before review so you aren't changing it under the reviewer.",
      due: weekdayOnOrBefore(addDays(storeSubmitBy, -3)) });

    // Build, price and release setup
    add({ id: "price", phase: "build", kind: "rule", title: "Set the price in every currency",
      detail: "Valve reviews prices, usually within one or two business days. A currency with no price makes the game unavailable to those players.",
      due: minusBusinessDays(L, 10), doc: DOCS.pricing });
    add({ id: "launch-discount", phase: "build", kind: "rule", title: "Set up the launch discount (" + o.discount + "% off)",
      detail: "10–40% off for 7 to 14 days from launch. It has to be set up before release, below the release date on the app's landing page.",
      due: minusBusinessDays(L, 7), doc: DOCS.discounts, when: function () { return o.discount > 0; } });
    add({ id: "build-submit", phase: "build", kind: "rule", title: "Submit the release build for review",
      detail: "The build is reviewed after the store page and both must be approved before you can release. Steam gives no build review time, so allow the same 7 business days as the page.",
      due: minusBusinessDays(L, 7), doc: DOCS.releasing, when: function () { return o.type !== "leave-ea"; } });
    add({ id: "final-build", phase: "build", kind: "tip", title: "Upload the launch build to the default branch",
      detail: "Test it from a clean install on a second account. Keep the previous build ready to roll back.",
      due: weekdayOnOrBefore(addDays(L, -3)) });
    add({ id: "permissions", phase: "build", kind: "rule", title: "Check who can press Release",
      detail: "Releasing needs the Steamworks permissions “Publish app changes to Steam” and “Manage pricing and discounts”. Make sure the person on duty has both.",
      due: weekdayOnOrBefore(addDays(L, -3)), doc: DOCS.releasing });
    add({ id: "no-price-rise", phase: "build", kind: "rule", title: "Don't raise the price close to launch",
      detail: "A price rise blocks discounts for 30 days and, within 30 days of leaving Early Access, cancels your launch discount.",
      due: addDays(L, -30), doc: DOCS.earlyAccess, when: function () { return o.type === "leave-ea"; } });

    // Press, creators, community
    add({ id: "press-list", phase: "market", kind: "tip", title: "Build the press and creator list",
      detail: "Outlets and creators who cover games like yours. Market Scope's comps and Audience Map's communities are a good place to start.",
      due: weekdayOnOrBefore(addDays(L, -42)) });
    add({ id: "press-kit", phase: "market", kind: "tip", title: "Publish a press kit",
      detail: "Fact sheet, logo, key art, screenshots, trailer download and a contact email, on one page.",
      due: weekdayOnOrBefore(addDays(L, -35)) });
    add({ id: "date-announce", phase: "market", kind: "tip", title: "Announce the release date",
      detail: "A release-date trailer and posts on your channels. Put the date on the store page too.",
      due: weekdayOnOrBefore(addDays(L, -28)) });
    add({ id: "keys", phase: "market", kind: "tip", title: "Send review keys with an embargo",
      detail: "Request Steam keys in Steamworks ahead of time, then send them to press and creators with the embargo date and time.",
      due: weekdayOnOrBefore(addDays(L, -14)) });
    add({ id: "community", phase: "market", kind: "tip", title: "Schedule the launch posts and a Discord event",
      detail: "Write the launch announcement, the Steam event and social posts now, so launch day is pressing buttons, not writing.",
      due: weekdayOnOrBefore(addDays(L, -7)) });
    add({ id: "nextfest", phase: "market", kind: "rule", title: "If you want a Next Fest, it has to be before launch",
      detail: "Only unreleased games with a playable demo can take part, and each game only once. Check the next edition's sign-up deadline.",
      due: weekdayOnOrBefore(addDays(L, -60)), doc: DOCS.nextfest, when: function () { return o.demo && o.type !== "leave-ea"; } });
    add({ id: "embargo", phase: "market", kind: "tip", title: "Confirm the embargo time and the launch-day schedule",
      detail: "Who presses Release, at what time in your time zone and Pacific time, and who watches reviews and Discord for the first hours.",
      due: weekdayOnOrBefore(addDays(L, -2)) });

    // Launch day
    add({ id: "release", phase: "launch", kind: "rule", title: "Press Release in Steamworks",
      detail: "Approved games don't release on their own: use the green “Release App” button on the app's landing page.",
      due: L, doc: DOCS.releasing });
    add({ id: "wishlist-email", phase: "launch", kind: "rule", title: o.type === "leave-ea" ? "Steam emails your wishlisters about 1.0" : "Steam emails your wishlisters",
      detail: "Everyone with the game on their wishlist gets an email or push notification, sent over a few hours. Nothing to do but be ready for the traffic.",
      due: L, doc: DOCS.wishlist });
    add({ id: "announce", phase: "launch", kind: "tip", title: "Post the launch announcement everywhere",
      detail: "Steam event, Discord, social, newsletter. Pin the store link.",
      due: L });
    add({ id: "watch", phase: "launch", kind: "tip", title: "Watch reviews, refunds and crash reports",
      detail: "Answer the first negative reviews with fixes, not arguments. Note every bug report.",
      due: L });

    // After launch
    add({ id: "hotfix", phase: "after", kind: "tip", title: "Ship the first hotfix",
      detail: "Fix the worst launch bugs and say so in a Steam event: it shows reviewers you're listening.",
      due: weekdayOnOrBefore(addDays(L, 3)) });
    add({ id: "retro", phase: "after", kind: "tip", title: "Week-one review",
      detail: "Sales against your plan, wishlist conversion, review score and what players praise or complain about. The PMF Analyzer can score it against similar games.",
      due: weekdayOnOrBefore(addDays(L, 7)) });
    add({ id: "update", phase: "after", kind: "tip", title: "Publish the first content update or roadmap",
      detail: "A visible update in the first weeks keeps the game in front of players who are still deciding.",
      due: weekdayOnOrBefore(addDays(L, 21)) });
    add({ id: "first-discount", phase: "after", kind: "rule", title: "First day a regular discount is allowed",
      detail: "No discounts for 30 days after release (the launch discount is the exception). A discount of 20% or more also emails your wishlisters, at most once every two weeks.",
      due: addDays(L, 30), doc: DOCS.discounts });

    return list;
  }

  /* Seasonal sales this launch can join: released at least 30 days before the sale starts. */
  function sales(launch, events) {
    return (events || []).filter(function (e) { return e.kind === "sale" && daysBetween(launch, e.start) >= 30; }).slice(0, 2);
  }

  /* Full plan with status per task. */
  function build(o, today, done, custom) {
    done = done || {}; custom = custom || [];
    var list = tasks(o).map(function (t) { return Object.assign({}, t); });
    custom.forEach(function (c) {
      if (c && c.id && c.title && /^\d{4}-\d{2}-\d{2}$/.test(c.date || "")) {
        list.push({ id: c.id, phase: c.phase || "market", kind: "own", title: c.title, detail: "", due: c.date, custom: true });
      }
    });
    list.forEach(function (t) {
      t.done = !!done[t.id];
      t.days = daysBetween(today, t.due);
      t.status = t.done ? "done" : t.days < 0 ? "late" : t.days <= 7 ? "soon" : "later";
    });
    list.sort(function (a, b) { return a.due < b.due ? -1 : a.due > b.due ? 1 : 0; });
    var open = list.filter(function (t) { return !t.done; });
    return {
      tasks: list,
      total: list.length,
      doneCount: list.length - open.length,
      late: open.filter(function (t) { return t.status === "late"; }).length,
      next: open.filter(function (t) { return t.days >= 0; })[0] || null,
      daysToLaunch: daysBetween(today, o.launch),
      tooSoon: daysBetween(today, o.launch) < 21 && o.type !== "leave-ea",
    };
  }

  return {
    PHASES: PHASES, DOCS: DOCS, CHECKED: CHECKED,
    tasks: tasks, build: build, sales: sales,
    addDays: addDays, minusBusinessDays: minusBusinessDays, daysBetween: daysBetween, fmt: fmt, fmtDay: fmtDay,
  };
});
