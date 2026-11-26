/* Festival Radar — page logic. The maths lives in model.js (window.FestivalModel).
 * Steam's own events come from Window Planner's model; other festivals from festivals.json in this folder.
 * The studio's entries are its own data, saved per game to the account. Accepted and attended entries are
 * also written to the game's ledger as Page Engine "festival" beats. Lift reads Page Engine's daily wishlists. */
(function () {
  "use strict";
  var M = window.FestivalModel, PM = window.PageModel, WM = window.WindowModel;
  var TOOL_ID = "festival-radar";
  var LS_KEY = "gos_festival_radar_v1";
  var PE_LS_KEY = "gos_page_engine_v1";
  var ACCOUNT_URL = "/api/tool-state/" + TOOL_ID;
  var MAX_ENTRIES = 300;   // keeps the saved state far under the 512 KB tool-state limit
  var MAX_TAGS = 20;

  /* ---------------- State: per game, the studio's entries and extra tags ---------------- */
  function emptyGame() { return { entries: [], tags: [], showAll: false }; }
  function emptyState() { return { games: {}, savedAt: 0 }; }
  function normalise(s) {
    if (!s || typeof s !== "object") return null;
    var b = emptyState();
    b.savedAt = Number(s.savedAt) || 0;
    Object.keys(s.games || {}).forEach(function (id) {
      var g = s.games[id] || {}, o = emptyGame();
      o.entries = (g.entries || []).map(M.cleanEntry).filter(Boolean).slice(-MAX_ENTRIES);
      o.tags = (Array.isArray(g.tags) ? g.tags : []).map(M.norm).filter(Boolean).slice(0, MAX_TAGS);
      o.showAll = !!g.showAll;
      b.games[String(id).slice(0, 64)] = o;
    });
    return b;
  }
  var S = (function () { try { return normalise(JSON.parse(localStorage.getItem(LS_KEY) || "null")); } catch (e) { return null; } })() || emptyState();
  function gid() { return window.GOS && GOS.game ? String(GOS.game.id) : "_none"; }
  function G() { var id = gid(); return S.games[id] || (S.games[id] = emptyGame()); }
  var saveTimer = null;
  function changed() { if (saveTimer) clearTimeout(saveTimer); saveTimer = setTimeout(persist, 300); }
  function persist() {
    S.savedAt = Date.now();
    try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) {}
    scheduleAccountSave();
  }

  /* ---------------- Formatting ---------------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function num(n) { return n == null || !isFinite(n) ? "—" : Math.round(n).toLocaleString("en-US"); }
  function signed(n) { return n == null || !isFinite(n) ? "—" : (n > 0 ? "+" : n < 0 ? "−" : "") + num(Math.abs(n)); }
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function dl(ymd) { if (!ymd) return "—"; var p = String(ymd).split("-"); return +p[2] + " " + MONTHS[+p[1] - 1] + " " + p[0]; }
  function range(a, b) { return !a ? "dates not set" : !b || a === b ? dl(a) : dl(a) + " – " + dl(b); }
  function today() { var d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function plural(n, w) { return num(n) + " " + w + (n === 1 ? "" : "s"); }
  function track(name, props) { if (typeof window.gosTrack === "function") window.gosTrack(name, Object.assign({ tool_id: TOOL_ID }, props || {})); }
  function step(name, index, extra) { track("journey_step", Object.assign({ step_name: name, step_index: index }, extra || {})); }
  function safeUrl(u) { return /^https:\/\//i.test(String(u || "")) ? String(u) : ""; }
  function statusBadge(s) { return '<span class="status ' + esc(s) + '">' + esc(s) + "</span>"; }

  var out = document.getElementById("out");
  var listCard = document.getElementById("list-card");
  var entriesCard = document.getElementById("entries-card");
  var liftCard = document.getElementById("lift-card");
  var festivals = [];          // from festivals.json
  var festivalsLoaded = false, festivalsError = false;
  var ledgerBeats = [];        // every beat in the game's ledger (any tool)
  var pageWishlists = null;    // Page Engine's daily wishlist table for this game, if any
  var editing = null;          // entry id being edited
  var draft = null;            // prefill for the entry form, from a list row
  var viewed = { list: false, lift: false };

  /* ---------------- Derived ---------------- */
  function tags() {
    var g = window.GOS && GOS.game, t = window.GOS && GOS.thesis;
    var genre = [g && g.genre, t && t.genre].filter(Boolean).join(",");
    return M.gameTags(genre, G().tags);
  }
  function genreTags() {
    var g = window.GOS && GOS.game, t = window.GOS && GOS.thesis;
    return M.gameTags([g && g.genre, t && t.genre].filter(Boolean).join(","), []);
  }
  function items() { return M.steamEvents(WM.EVENTS).concat(festivals); }
  function liveEntries() { return G().entries.filter(function (e) { return !e.deleted; }); }
  function allBeats() {
    var local = G().entries.map(function (e) { return M.entryBeat(e); }).filter(Boolean);
    return PM.mergeLog(ledgerBeats, local).filter(function (b) { return !b.deleted; });
  }
  function lifts() {
    return liveEntries().filter(function (e) { return e.status === "attended"; }).map(function (e) { return M.lift(pageWishlists || [], e, allBeats()); })
      .sort(function (a, b) { return (a.entry.eventStart || "") < (b.entry.eventStart || "") ? 1 : -1; });
  }

  /* ---------------- Render: the answer ---------------- */
  function render() {
    var t = today(), D = M.deadlines(items(), t, tags(), false);
    var lines = [], next = "";
    var open = D.filter(function (x) { return x.deadlineOpen && !M.entryFor(G().entries, x.f.id); });
    var nextEvent = D.filter(function (x) { return !x.running && x.daysToEvent != null && x.daysToEvent >= 0; })[0];
    if (open.length) {
      var o = open[0];
      lines.push("The nearest deadline you haven&rsquo;t acted on is <b>" + esc(o.f.name) + "</b>: submissions close on <b>" + dl(o.f.submissionCloses) + "</b>, in " + plural(o.daysToDeadline, "day") + ".");
    } else if (festivals.length) lines.push("No open submission deadlines in the list match your tags right now.");
    if (nextEvent) lines.push("The next event on the list is <b>" + esc(nextEvent.f.name) + "</b>, " + range(nextEvent.f.eventStart, nextEvent.f.eventEnd) + (nextEvent.f.steam ? " (Steam)" : "") + ".");
    var E = liveEntries(), byStatus = {};
    E.forEach(function (e) { byStatus[e.status] = (byStatus[e.status] || 0) + 1; });
    if (E.length) lines.push("You&rsquo;re tracking " + plural(E.length, "festival") + ": " + M.STATUSES.filter(function (s) { return byStatus[s]; }).map(function (s) { return byStatus[s] + " " + s; }).join(", ") + ".");
    var L = lifts(), read = L.filter(function (x) { return x.enough; });
    if (read.length) {
      var r = read[0];
      lines.push("At <b>" + esc(r.entry.name) + "</b> you gained <b>" + signed(r.lift) + " wishlist adds</b> above your usual rate (" + signed(r.lo) + " to " + signed(r.hi) + ", from " + num(r.during) + " adds over " + plural(r.days, "day") + ")." +
        (r.verdict === "rise" ? " That rise is beyond chance." : r.verdict === "fall" ? " Adds were below your usual rate, beyond chance." : " That&rsquo;s within normal day-to-day variation, so it&rsquo;s no clear change."));
    } else if (L.length) lines.push("You attended " + plural(L.length, "festival") + ", but there isn&rsquo;t enough daily wishlist data around " + (L.length === 1 ? "it" : "them") + " to measure lift yet.");
    if (!pageWishlists || !pageWishlists.length) next = L.length ? "Next: import your daily wishlists in Page Engine to measure what your festivals did." : open.length ? "Next: decide on " + esc(open[0].f.name) + " before " + dl(open[0].f.submissionCloses) + ", and track it below so its deadline stays in view." : "Next: track the festivals you&rsquo;re considering below. After you attend one, import daily wishlists in Page Engine to measure the lift.";
    else if (L.length && !read.length) next = "Next: Page Engine needs daily wishlist adds for the event days and at least " + M.MIN_BASELINE_DAYS + " of the " + M.BASELINE_DAYS + " days before. Import an export that covers them.";
    else if (open.length) next = "Next: decide on " + esc(open[0].f.name) + " before " + dl(open[0].f.submissionCloses) + ", and track it below so its deadline stays in view.";
    else next = "Next: keep your entries up to date. Accepted and attended festivals go on Page Engine&rsquo;s wishlist chart as beats.";
    if (!lines.length) lines.push("No festivals with open deadlines in the list yet. Steam&rsquo;s own events are below; other festivals appear here once their dates have been checked on their own sites.");
    out.innerHTML = '<section class="card answer"><h3>The answer</h3>' + lines.map(function (l) { return '<p class="verdict">' + l + "</p>"; }).join("") +
      '<p class="next">' + next + "</p>" +
      '<p class="method">Lift is compared with your own usual daily adds before each event, never with other studios: there is no shared benchmark yet.</p></section>';
  }

  /* ---------------- The deadline list ---------------- */
  function renderList() {
    var g = G(), t = today(), T = tags(), gt = genreTags();
    var D = M.deadlines(items(), t, T, g.showAll);
    var s = '<h3>Upcoming festivals <span class="half reach">Reach</span></h3>';
    s += '<p class="note">Steam Next Fest and Steam&rsquo;s themed fests come from Steam&rsquo;s own calendar (as in Window Planner). Other festivals and showcases are listed by hand, each with the page its dates came from. Filtered by your game&rsquo;s tags; Next Fest is open to any game with a demo.</p>';
    s += '<div class="chips" aria-label="Tags used to filter">' + (gt.length ? gt.map(function (x) { return '<span class="chip fixed" title="From your game&rsquo;s genre">' + esc(x) + "</span>"; }).join("") : "") +
      g.tags.map(function (x) { return '<span class="chip">' + esc(x) + '<button type="button" data-rmtag="' + esc(x) + '" aria-label="Remove ' + esc(x) + '">&times;</button></span>'; }).join("") +
      (!gt.length && !g.tags.length ? '<span class="muted">No tags yet. Add your genre so themed fests can be matched.</span>' : "") + "</div>";
    s += '<form class="tag-add" id="f-tag"><input name="tag" maxlength="40" placeholder="Add a tag, e.g. roguelike" aria-label="Add a tag"><button class="btn-small" type="submit">Add</button></form>';
    s += '<label class="toggle"><input type="checkbox" id="show-all"' + (g.showAll ? " checked" : "") + "> Show festivals that don&rsquo;t match my tags</label>";
    if (festivalsError) s += '<div class="notice warn">Couldn&rsquo;t load the festival list. Steam&rsquo;s own events are still shown.</div>';
    else if (festivalsLoaded && !festivals.length) s += '<div class="notice warn">No other festivals are listed yet. Festivals are added once their dates have been checked on their own sites, so none are guessed. Steam&rsquo;s own events are below.</div>';
    if (!D.length) s += '<p class="note">Nothing upcoming matches. Try &ldquo;Show festivals that don&rsquo;t match my tags&rdquo;.</p>';
    else s += '<ul class="fests">' + D.map(row).join("") + "</ul>";
    s += '<p class="method">Steam dates: <a href="' + esc(WM.SOURCE) + '" target="_blank" rel="noopener">Steamworks upcoming events</a>, checked ' + dl(WM.CHECKED) + ", known up to " + dl(WM.KNOWN_UNTIL) + ". Steam doesn&rsquo;t list Next Fest sign-up deadlines there, so check registration in Steamworks. Festivals checked more than " + M.STALE_DAYS + " days ago are flagged.</p>";
    listCard.innerHTML = s;
    wireList();
    if (!viewed.list) { viewed.list = true; step("festivals_viewed", 1, { shown: D.length, listed: festivals.length }); }
  }
  function row(x) {
    var f = x.f, e = M.entryFor(G().entries, f.id), url = safeUrl(f.url);
    var when = x.deadlineOpen ? dl(f.submissionCloses) + "<small>deadline, " + plural(x.daysToDeadline, "day") + " left</small>"
      : x.running ? "On now<small>until " + dl(f.eventEnd) + "</small>"
      : dl(f.eventStart) + "<small>" + (f.steam ? "event starts" : x.deadlinePassed ? "event starts; deadline passed" : "event starts") + "</small>";
    var kind = f.kind === "nextfest" ? '<span class="kind steam">Steam Next Fest</span>' : f.kind === "steamfest" ? '<span class="kind steam">Steam themed fest</span>' : '<span class="kind">Festival</span>';
    var meta = [];
    meta.push("Event " + range(f.eventStart, f.eventEnd));
    if (f.submissionOpens || f.submissionCloses) meta.push("Submissions " + (f.submissionOpens ? dl(f.submissionOpens) + " – " : "until ") + dl(f.submissionCloses));
    if (f.cost) meta.push(esc(f.cost));
    if (f.platforms.length && !f.steam) meta.push(esc(f.platforms.join(", ")));
    if (f.tags.length && f.kind !== "nextfest") meta.push("Tags: " + esc(f.tags.join(", ")));
    var src = f.steam ? (f.kind === "nextfest" ? "Sign up through Steamworks; the deadline is set there." : "Steam picks games for themed fests by store tag.")
      : 'Source: <a href="' + esc(safeUrl(f.source)) + '" target="_blank" rel="noopener">' + esc(hostOf(f.source)) + "</a>, checked " + dl(f.checked) + ".";
    return '<li class="' + (x.match ? "" : "nomatch") + '"><div class="when">' + when + '</div><div class="what">' +
      (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener"><b>' + esc(f.name) + "</b></a>" : "<b>" + esc(f.name) + "</b>") + kind +
      '<div class="m">' + meta.join(" &middot; ") + '</div><div class="m">' + src + "</div>" +
      (x.stale ? '<div class="warn-line">Dates may have changed. Check the site.</div>' : "") +
      '</div><div class="x">' + (e ? statusBadge(e.status) : '<button class="btn-small" type="button" data-track="' + esc(f.id) + '">Track</button>') + "</div></li>";
  }
  function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return "source"; } }
  function wireList() {
    var f = document.getElementById("f-tag");
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var v = M.norm(new FormData(f).get("tag")), g = G();
      if (!v || g.tags.indexOf(v) >= 0 || g.tags.length >= MAX_TAGS) return;
      g.tags.push(v); changed(); renderList(); render();
    });
    listCard.querySelectorAll("[data-rmtag]").forEach(function (b) {
      b.addEventListener("click", function () { var g = G(), v = b.getAttribute("data-rmtag"); g.tags = g.tags.filter(function (x) { return x !== v; }); changed(); renderList(); render(); });
    });
    document.getElementById("show-all").addEventListener("change", function (ev) { G().showAll = ev.target.checked; changed(); renderList(); });
    listCard.querySelectorAll("[data-track]").forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-track"), f = items().filter(function (x) { return x.id === id; })[0];
        if (!f) return;
        editing = null;
        draft = { festivalId: f.id, name: f.name, eventStart: f.eventStart, eventEnd: f.eventEnd, status: "considering" };
        renderEntries();
        var el = document.getElementById("f-entry"); if (el) { el.scrollIntoView({ block: "center" }); var st = el.querySelector("[name=status]"); if (st) st.focus(); }
      });
    });
  }

  /* ---------------- The studio's entries ---------------- */
  function renderEntries() {
    var g = G(), cur = editing ? g.entries.filter(function (e) { return e.id === editing; })[0] : null, v = cur || draft || {};
    var s = "<h3>Your festivals</h3>";
    s += '<p class="note">The festivals you&rsquo;re considering or in, saved to your account for this game. When a festival is accepted or attended, it&rsquo;s also saved to your game as a &ldquo;festival&rdquo; beat, so it shows on Page Engine&rsquo;s wishlist chart. Set the event dates: they&rsquo;re what the lift is measured over.</p>';
    s += '<form class="form" id="f-entry"><label class="wide">Festival<input name="name" required maxlength="120" value="' + esc(v.name || "") + '" placeholder="Pick one above with Track, or type a name"></label>' +
      '<label>Status<select name="status">' + M.STATUSES.map(function (x) { return "<option" + (x === (v.status || "considering") ? " selected" : "") + ">" + x + "</option>"; }).join("") + "</select></label>" +
      '<label>Event starts<input type="date" name="eventStart" value="' + esc(v.eventStart || "") + '"></label>' +
      '<label>Event ends<input type="date" name="eventEnd" value="' + esc(v.eventEnd || "") + '"></label>' +
      '<label>Submitted on<input type="date" name="submitted" value="' + esc(v.submitted || "") + '"></label>' +
      '<label class="wide">Note<input name="note" maxlength="300" value="' + esc(v.note || "") + '" placeholder="Optional, e.g. booth number or slot"></label>' +
      '<input type="hidden" name="festivalId" value="' + esc(v.festivalId || "") + '">' +
      '<div class="actions wide" style="grid-column:1/-1;margin-top:0"><button class="btn" type="submit">' + (cur ? "Save changes" : "Track festival") + "</button>" +
      (cur || draft ? '<button class="btn-ghost" type="button" id="btn-cancel">Cancel</button>' : "") + '<span class="feedback" id="e-msg" role="status"></span></div></form>';
    var E = liveEntries().slice().sort(function (a, b) { var x = a.eventStart || "9999", y = b.eventStart || "9999"; return x < y ? 1 : x > y ? -1 : 0; });
    if (E.length) s += '<ul class="log-list">' + E.map(function (e) {
      return '<li><span class="d">' + (e.eventStart ? dl(e.eventStart) : "No dates") + '</span><span class="t"><b>' + esc(e.name) + "</b> " + statusBadge(e.status) +
        (e.eventEnd && e.eventEnd !== e.eventStart ? " &middot; until " + dl(e.eventEnd) : "") + (e.submitted ? " &middot; submitted " + dl(e.submitted) : "") + (e.note ? " &middot; " + esc(e.note) : "") +
        '</span><span class="x"><select class="inline-status" data-status="' + esc(e.id) + '" aria-label="Status for ' + esc(e.name) + '">' +
        M.STATUSES.map(function (x) { return "<option" + (x === e.status ? " selected" : "") + ">" + x + "</option>"; }).join("") + "</select>" +
        '<button class="btn-small" type="button" data-edit="' + esc(e.id) + '">Edit</button><button class="btn-small" type="button" data-del="' + esc(e.id) + '">Delete</button></span></li>';
    }).join("") + "</ul>";
    else s += '<p class="note">No festivals tracked yet.</p>';
    entriesCard.innerHTML = s;
    wireEntries();
  }
  function wireEntries() {
    var f = document.getElementById("f-entry");
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var fd = new FormData(f), g = G(), old = editing ? g.entries.filter(function (e) { return e.id === editing; })[0] : null;
      var e = M.cleanEntry({
        id: old ? old.id : uid(), festivalId: fd.get("festivalId") || (old && old.festivalId) || "", name: fd.get("name"), status: fd.get("status"),
        eventStart: fd.get("eventStart"), eventEnd: fd.get("eventEnd"), submitted: fd.get("submitted"), note: fd.get("note"), updated: Date.now(),
      });
      if (!e) return msg("Give the festival a name.", true);
      saveEntry(e, old, old ? "Saved." : "Tracking " + e.name + ".");
      if (!old) step("festival_tracked", 2, { status: e.status, listed: !!e.festivalId });
    });
    var c = document.getElementById("btn-cancel");
    if (c) c.addEventListener("click", function () { editing = null; draft = null; renderEntries(); });
    entriesCard.querySelectorAll("[data-status]").forEach(function (sel) {
      sel.addEventListener("change", function () {
        var id = sel.getAttribute("data-status"), old = G().entries.filter(function (e) { return e.id === id; })[0];
        if (!old) return;
        saveEntry(Object.assign({}, old, { status: sel.value, updated: Date.now() }), old, old.name + " is now " + sel.value + ".");
      });
    });
    entriesCard.querySelectorAll("[data-edit]").forEach(function (b) {
      b.addEventListener("click", function () { editing = b.getAttribute("data-edit"); draft = null; renderEntries(); document.getElementById("f-entry").scrollIntoView({ block: "center" }); });
    });
    entriesCard.querySelectorAll("[data-del]").forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-del"), old = G().entries.filter(function (e) { return e.id === id; })[0];
        if (old) saveEntry(Object.assign({}, old, { deleted: true, updated: Date.now() }), old, "Deleted " + old.name + ".");
      });
    });
  }
  function msg(text, err) { var m = document.getElementById("e-msg"); if (m) { m.className = "feedback" + (err ? " err" : ""); m.textContent = text; } }

  /** Save the entry locally, then write (or remove) its festival beat in the game's ledger when that changes. */
  function saveEntry(e, old, okText) {
    var g = G();
    g.entries = M.mergeEntries(g.entries, [e]);
    editing = null; draft = null; changed(); renderEntries(); renderList(); renderLift(); render();
    msg(okText);
    var before = old ? M.entryBeat(old) : null, after = M.entryBeat(e);
    var same = before && before.deleted === after.deleted && before.date === after.date && before.note === after.note;
    if (same || (!before && after.deleted)) return;
    if (!window.GOS || !GOS.game) { msg(okText + " Pick a game to add the festival to its beat log."); return; }
    var row = M.beatRow(e);
    GOS.recordSignals(TOOL_ID, [row]).then(function () {
      msg(okText + (row.meta.deleted ? " Removed its festival beat from " : " Festival beat saved to ") + GOS.game.title + ".");
      ledgerBeats = PM.mergeLog(ledgerBeats, [PM.cleanBeat(row.meta)]); renderLift(); render();
    }).catch(function (err) { msg(okText + " Saved here, but the festival beat didn't reach the game ledger: " + err.message, true); });
  }

  /* ---------------- Measured lift ---------------- */
  var REASONS = {
    dates: "Set the event dates to measure this.",
    long: "Events longer than " + M.MAX_EVENT_DAYS + " days can&rsquo;t be read against a two-week baseline.",
    nodata: "Import wishlists in Page Engine to measure this.",
    baseline: "Too few to read yet: needs daily adds on " + M.MIN_BASELINE_DAYS + " of the " + M.BASELINE_DAYS + " days before the event.",
    event: "Too few to read yet: needs daily adds on every event day.",
    few: "Too few to read yet: needs at least " + M.MIN_EVENT_ADDS + " adds during the event.",
  };
  function renderLift() {
    var L = lifts();
    var s = '<h3>Did it move wishlists? <span class="half reach">Reach</span></h3>';
    if (!L.length) {
      liftCard.innerHTML = s + '<p class="note">Mark a festival as attended to measure it. The read uses your daily wishlist adds from <a href="/game-os/page-engine">Page Engine</a>: adds during the event, against your usual day in the two weeks before.</p>';
      return;
    }
    if (!pageWishlists || !pageWishlists.length) s += '<div class="notice warn">Import wishlists in <a href="/game-os/page-engine">Page Engine</a> to measure this. Festival Radar reads the daily adds you import there.</div>';
    s += '<div class="tbl-wrap"><table class="t beats"><thead><tr><th>Festival</th><th>Read</th><th>Adds during</th><th>Usual for those days</th><th>Lift (95% range)</th></tr></thead><tbody>';
    s += L.map(function (r) {
      var e = r.entry, name = "<b>" + esc(e.name) + '</b><div class="s muted">' + range(e.eventStart, e.eventEnd) + "</div>";
      if (!r.enough) return '<tr><td class="name">' + name + '</td><td class="read" colspan="4">' + (REASONS[r.reason] || "Can&rsquo;t read this yet.") + (r.reason === "few" ? " (n = " + num(r.during) + ")" : "") + "</td></tr>";
      var read = r.verdict === "rise" ? '<span class="badge good">Rise</span>' : r.verdict === "fall" ? '<span class="badge bad">Below usual</span>' : '<span class="badge warn">No clear change</span>';
      var ov = r.overlaps && r.overlaps.length ? '<div class="s">' + plural(r.overlaps.length, "other beat") + " in the same window (" + r.overlaps.map(function (b) { return esc(b.type) + " " + dl(b.date); }).join(", ") + "). Their effect can&rsquo;t be separated from the festival&rsquo;s.</div>" : "";
      return '<tr><td class="name">' + name + '</td><td class="read" data-l="Read">' + read + ov + '</td><td data-l="Adds during">' + num(r.during) + " <span class=\"range\">over " + plural(r.days, "day") + '</span></td><td data-l="Usual">' + num(r.expected) +
        ' <span class="range">(' + (Math.round(r.baselinePerDay * 10) / 10) + "/day &times; " + r.days + ')</span></td><td data-l="Lift"><b>' + signed(r.lift) + '</b> <span class="range">' + signed(r.lo) + " to " + signed(r.hi) + "</span></td></tr>";
    }).join("") + "</tbody></table></div>";
    var sig = L.map(M.liftSignal).filter(Boolean), g = window.GOS && GOS.game;
    s += '<p class="method">Method: wishlist adds on each event day, minus a baseline of the median daily adds in the ' + M.BASELINE_DAYS + " days before the event &times; the number of event days. The range is the exact 95% Poisson range on the event-days count, less the baseline. &ldquo;Rise&rdquo; only when the baseline sits below that range. A festival&rsquo;s effect can arrive after it ends, which this read misses. &ldquo;Associated with&rdquo;, not &ldquo;caused by&rdquo;.</p>";
    s += '<div class="actions"><button class="btn" id="btn-send" type="button"' + (sig.length && g ? "" : " disabled") + ">Send to " + (g ? esc(g.title) : "game") + '</button><span class="feedback" id="send-msg" role="status">' +
      (sig.length ? "Records " + plural(sig.length, "festival_lift row") + ", one per measured event, with its range, baseline and source." : "Nothing measured to send yet.") + (g ? "" : " Pick a game above first.") + "</span></div>";
    liftCard.innerHTML = s;
    var send = document.getElementById("btn-send");
    if (send) send.addEventListener("click", function () {
      var list = lifts().map(M.liftSignal).filter(Boolean), m = document.getElementById("send-msg");
      if (!list.length || !window.GOS || !GOS.game) return;
      send.disabled = true; m.className = "feedback"; m.textContent = "Sending to " + GOS.game.title + "…";
      GOS.recordSignals(TOOL_ID, list).then(function () {
        m.textContent = "Sent " + plural(list.length, "figure") + " to " + GOS.game.title + ".";
        track("output_action", { action: "send_signals", count: list.length });
      }).catch(function (err) { send.disabled = false; m.className = "feedback err"; m.textContent = "Couldn't send: " + err.message; });
    });
    if (!viewed.lift && sig.length) { viewed.lift = true; step("lift_viewed", 3, { measured: sig.length }); }
  }

  /* ---------------- Data from elsewhere: festivals.json, ledger beats, Page Engine's wishlists ---------------- */
  function loadFestivals() {
    return fetch("/game-os/festival-radar/festivals.json", { credentials: "same-origin" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) { festivals = M.festivalsFrom(j); festivalsLoaded = true; })
      .catch(function () { festivalsError = true; festivalsLoaded = true; })
      .then(function () { renderList(); render(); });
  }
  function syncLedger() {
    if (!window.GOS || !GOS.game) { ledgerBeats = []; return Promise.resolve(); }
    var id = GOS.game.id;
    return fetch("/api/games/" + encodeURIComponent(id) + "/signals?all=1&days=365", { credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !window.GOS || !GOS.game || GOS.game.id !== id) return;
        ledgerBeats = PM.logsFromLedger((j.rows || []).filter(function (r) { return r.key === "beat"; })).beats;
        renderLift(); render();
      }).catch(function () {});
  }
  /** Page Engine keeps daily wishlists in its own saved state (this browser, or the account). Read-only here. */
  function loadPageEngine() {
    var id = gid(), local = null;
    try { local = JSON.parse(localStorage.getItem(PE_LS_KEY) || "null"); } catch (e) {}
    var pick = function (st) { var g = st && st.games && st.games[id]; return g && Array.isArray(g.wishlists) ? g.wishlists.filter(function (r) { return r && PM.isYmd(r.from) && PM.isYmd(r.to); }) : null; };
    pageWishlists = pick(local);
    renderLift(); render();
    if (!accountUser) return Promise.resolve();
    return fetch("/api/tool-state/page-engine", { credentials: "same-origin" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      var st = j && j.state;
      if (st && (!local || (Number(st.savedAt) || 0) > (Number(local.savedAt) || 0))) { var w = pick(st); if (w) { pageWishlists = w; renderLift(); render(); } }
    }).catch(function () {});
  }

  /* ---------------- About ---------------- */
  function about() {
    var items = [
      "<b>Steam&rsquo;s own events</b> (Next Fest and the themed fests) are read from the same calendar Window Planner uses, taken from <a href=\"" + WM.SOURCE + "\" target=\"_blank\" rel=\"noopener\">Steamworks</a> and checked " + dl(WM.CHECKED) + ". Steam sales aren&rsquo;t festivals, so they&rsquo;re left out here.",
      "<b>Other festivals and showcases</b> are listed by hand. Each one records the page its dates came from and when that page was read. Nothing is listed without a source, and anything checked more than " + M.STALE_DAYS + " days ago is flagged, because festivals move their dates.",
      "<b>Your festivals</b> are your own data, saved to your account per game. Accepted and attended ones are also written to your game&rsquo;s ledger as &ldquo;festival&rdquo; beats; changing the status back removes the beat.",
      "<b>Lift</b> needs daily wishlist adds from Page Engine: every event day, and at least " + M.MIN_BASELINE_DAYS + " of the " + M.BASELINE_DAYS + " days before it. It also needs " + M.MIN_EVENT_ADDS + " adds during the event; below that the range is wider than the count. Below these minimums the page says &ldquo;too few to read yet&rdquo; and sends nothing.",
      "<b>No outside benchmarks:</b> there&rsquo;s no shared pool of other studios&rsquo; numbers yet, so there&rsquo;s no &ldquo;average festival lift&rdquo;. Each event is compared with your own weeks before it.",
      "<b>All Reach:</b> festivals are about whether marketing found an audience. Whether that audience sticks shows in Page Engine and Sentiment Radar.",
    ];
    document.getElementById("about-list").innerHTML = items.map(function (x) { return "<li>" + x + "</li>"; }).join("");
  }

  /* ---------------- Account sync ---------------- */
  var accountReady = false, accountUser = false, accountTimer = null;
  function status(text, kind) {
    var el = document.getElementById("save-status");
    if (!el) { el = document.createElement("span"); el.id = "save-status"; el.setAttribute("role", "status"); document.querySelector(".toolbar").appendChild(el); }
    el.className = "save-status " + (kind || ""); el.textContent = text;
  }
  function scheduleAccountSave() {
    if (!accountReady || !accountUser) return;
    if (accountTimer) clearTimeout(accountTimer);
    accountTimer = setTimeout(function () { accountTimer = null; saveToAccount(); }, 2000);
  }
  function saveToAccount(keepalive) {
    fetch(ACCOUNT_URL, { method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state: S }), keepalive: !!keepalive })
      .then(function (r) { if (r.status === 413) throw new Error("too large"); if (!r.ok) throw new Error(r.status); status("Saved to your account", "ok"); })
      .catch(function (e) { status(e.message === "too large" ? "Too much to save to your account; delete old entries" : "Couldn't save to your account; your list is still in this browser", "error"); });
  }
  function initAccount() {
    if (!window.GOS || !GOS.ready) return Promise.resolve();
    return GOS.ready.then(function () {
      accountUser = !!GOS.user;
      if (!accountUser) { status("Not signed in: saved in this browser only", "error"); return; }
      return fetch(ACCOUNT_URL, { credentials: "same-origin" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
        var server = j && j.state ? normalise(j.state) : null;
        if (server && (server.savedAt || 0) > (S.savedAt || 0) + 1000) {
          S = server;
          try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) {}
        }
        accountReady = true;
      });
    }).catch(function () {});
  }
  window.addEventListener("pagehide", function () { if (accountReady && accountTimer) { clearTimeout(accountTimer); saveToAccount(true); } });

  /* ---------------- Boot ---------------- */
  document.getElementById("btn-print").addEventListener("click", function () { window.print(); });
  about();
  if (window.GOS && GOS.mountBar) GOS.mountBar("#gameBar", { toolId: TOOL_ID });
  var booted = false, lastGame = null;
  function all() { render(); renderList(); renderEntries(); renderLift(); }
  initAccount().then(start, start);
  function start() {
    booted = true; lastGame = gid();
    all(); loadFestivals(); syncLedger(); loadPageEngine();
  }
  if (window.GOS && GOS.onChange) {
    GOS.onChange(function () {
      if (!booted) return;
      var id = gid();
      if (id === lastGame) { renderList(); render(); return; } // thesis or ledger refreshed: genre may have changed
      lastGame = id; editing = null; draft = null; viewed = { list: false, lift: false };
      ledgerBeats = []; pageWishlists = null;
      all(); syncLedger(); loadPageEngine();
    });
  }
})();
