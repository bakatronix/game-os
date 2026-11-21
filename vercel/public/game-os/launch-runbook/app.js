/* Launch Runbook — page logic. The checklist lives in model.js (window.RunbookModel);
 * Steam's sale and Next Fest dates come from the Window Planner model (window.WindowModel). */
(function () {
  "use strict";
  var M = window.RunbookModel, W = window.WindowModel;
  var TOOL_ID = "launch-runbook";
  var LS_KEY = "gos_launch_runbook_v1";
  var WP_KEY = "gos_window_planner_v1";
  var ACCOUNT_URL = "/api/tool-state/" + TOOL_ID;
  var LOCAL = "local"; // plan key when no game is picked

  /* ---------------- State: one plan per game ---------------- */
  function emptyPlan() { return { launch: "", type: "full", demo: false, discount: 0, done: {}, skip: {}, custom: [] }; }
  function emptyState() { return { plans: {}, savedAt: 0 }; }
  function normPlan(p) {
    var b = emptyPlan();
    if (!p || typeof p !== "object") return b;
    if (/^\d{4}-\d{2}-\d{2}$/.test(p.launch || "")) b.launch = p.launch;
    if (["full", "ea", "leave-ea"].indexOf(p.type) >= 0) b.type = p.type;
    b.demo = !!p.demo;
    var dc = Number(p.discount); b.discount = dc >= 10 && dc <= 40 ? Math.round(dc) : 0;
    if (p.done && typeof p.done === "object") b.done = p.done;
    if (p.skip && typeof p.skip === "object") b.skip = p.skip;
    if (Array.isArray(p.custom)) b.custom = p.custom.filter(function (c) { return c && c.id && c.title && /^\d{4}-\d{2}-\d{2}$/.test(c.date || ""); }).slice(0, 60);
    return b;
  }
  function normalise(s) {
    if (!s || typeof s !== "object") return null;
    var b = emptyState();
    if (s.plans && typeof s.plans === "object") Object.keys(s.plans).slice(0, 50).forEach(function (k) { b.plans[k] = normPlan(s.plans[k]); });
    b.savedAt = Number(s.savedAt) || 0;
    return b;
  }
  function lsRead(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
  var S = normalise(lsRead(LS_KEY)) || emptyState();

  function gameKey() { return window.GOS && GOS.game ? GOS.game.id : LOCAL; }
  function plan() { var k = gameKey(); if (!S.plans[k]) S.plans[k] = emptyPlan(); return S.plans[k]; }

  var saveTimer = null;
  function changed() { if (saveTimer) clearTimeout(saveTimer); saveTimer = setTimeout(persist, 300); }
  function persist() {
    S.savedAt = Date.now();
    try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) {}
    scheduleAccountSave();
  }

  /* ---------------- Helpers ---------------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function today() { var t = new Date(); return t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0"); }
  function rel(days) {
    if (days === 0) return "today";
    if (days === 1) return "tomorrow";
    if (days === -1) return "yesterday";
    return days > 0 ? "in " + days + " days" : Math.abs(days) + " days ago";
  }
  function uid() { return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  /* ---------------- Setup form ---------------- */
  var fLaunch = document.getElementById("f-launch"), fType = document.getElementById("f-type");
  var fDisc = document.getElementById("f-discount"), fDemo = document.getElementById("f-demo"), hint = document.getElementById("launch-hint");
  function syncForm() {
    var p = plan();
    fLaunch.value = p.launch; fType.value = p.type; fDisc.value = p.discount || 0; fDemo.checked = p.demo;
    renderHint();
  }
  function onForm() {
    var p = plan();
    p.launch = /^\d{4}-\d{2}-\d{2}$/.test(fLaunch.value) ? fLaunch.value : "";
    p.type = fType.value;
    var dc = Number(fDisc.value); p.discount = dc >= 10 && dc <= 40 ? Math.round(dc) : 0;
    p.demo = fDemo.checked;
    changed(); renderHint(); render();
  }
  [fLaunch, fType, fDisc, fDemo].forEach(function (el) { el.addEventListener("change", onForm); });
  fDisc.addEventListener("input", function () { var v = Number(fDisc.value); if (v > 0 && v < 10) return; onForm(); });

  /* Launch day suggested by Window Planner: the game's sent week first, then this browser's planned week. */
  function plannerLaunch() {
    var s = window.GOS && GOS.signal ? GOS.signal("window_launch_score") : null;
    if (s && s.meta && /^\d{4}-\d{2}-\d{2}$/.test(s.meta.launch || "")) return { date: s.meta.launch, from: "the week you sent from Window Planner" };
    var wp = lsRead(WP_KEY);
    if (wp && /^\d{4}-\d{2}-\d{2}$/.test(wp.chosen || "")) return { date: M.addDays(wp.chosen, 1), from: "your planned week in Window Planner" };
    return null;
  }
  function renderHint() {
    var p = plan(), w = plannerLaunch();
    if (w && w.date !== p.launch && w.date >= today()) {
      hint.innerHTML = 'Window Planner suggests <b>' + esc(M.fmtDay(w.date)) + "</b> (" + esc(w.from) + '). <button type="button" class="link-btn" id="use-wp">Use it</button>';
    } else if (!p.launch) {
      hint.innerHTML = 'Not sure yet? <a href="/game-os/window-planner">Window Planner</a> finds a quiet week.';
    } else hint.textContent = "";
  }
  hint.addEventListener("click", function (e) {
    if (!e.target.closest("#use-wp")) return;
    var w = plannerLaunch(); if (!w) return;
    plan().launch = w.date; fLaunch.value = w.date; changed(); renderHint(); render();
  });

  /* ---------------- Render ---------------- */
  var out = document.getElementById("out");
  var R = null;

  function opts() { var p = plan(); return { launch: p.launch, type: p.type, demo: p.demo, discount: p.discount }; }

  function render() {
    var p = plan();
    if (!p.launch) { R = null; out.innerHTML = '<div class="card empty-state"><p>Pick your launch day above to build the checklist.</p></div>'; return; }
    var t = today();
    var done = {}; Object.keys(p.done).forEach(function (k) { if (p.done[k]) done[k] = 1; }); Object.keys(p.skip).forEach(function (k) { if (p.skip[k]) done[k] = 1; });
    R = M.build(opts(), t, done, p.custom);
    enrich(R, p);
    var h = "";

    if (R.daysToLaunch < 0) h += '<div class="notice ok">Launched ' + rel(R.daysToLaunch) + ". The after-launch steps are below.</div>";
    else if (R.tooSoon) h += '<div class="notice bad">Launch is ' + rel(R.daysToLaunch) + ". A new game needs its store page up as Coming Soon for at least two weeks, after Valve reviews it. If your page isn&rsquo;t live yet, this date may not be possible.</div>";
    if (R.late) h += '<div class="notice warn">' + R.late + " step" + (R.late === 1 ? " is" : "s are") + " past their date. Tick them if they&rsquo;re done, or skip them if they don&rsquo;t apply.</div>";

    h += '<div class="kpis kpis-4">' +
      kpi(R.daysToLaunch >= 0 ? String(R.daysToLaunch) : "Live", R.daysToLaunch >= 0 ? "days to launch" : "launched " + rel(R.daysToLaunch), M.fmtDay(p.launch), true) +
      kpi(R.doneCount + "/" + R.total, "steps done", Math.round((R.doneCount / Math.max(1, R.total)) * 100) + "%") +
      kpi(String(R.late), "past their date", R.late ? "need a look" : "none") +
      kpi(R.next ? M.fmt(R.next.due) : "—", "next step", R.next ? R.next.title : "all done") +
      "</div>";

    h += saleCard(p);

    M.PHASES.forEach(function (ph) {
      var list = R.tasks.filter(function (x) { return x.phase === ph.id; });
      if (!list.length) return;
      var n = list.filter(function (x) { return x.done; }).length;
      h += '<section class="card phase"><div class="phase-head"><h3>' + esc(ph.name) + '</h3><span class="muted">' + n + " of " + list.length + " done</span></div>" +
        '<ul class="tasks">' + list.map(taskRow).join("") + "</ul></section>";
    });

    h += '<section class="card"><h3>Add your own step</h3><form id="add-form" class="add-form">' +
      '<input id="add-title" type="text" maxlength="120" placeholder="e.g. Book the launch stream with our publisher" required aria-label="Step">' +
      '<input id="add-date" type="date" required aria-label="Date">' +
      '<select id="add-phase" aria-label="Section">' + M.PHASES.map(function (ph) { return '<option value="' + ph.id + '"' + (ph.id === "market" ? " selected" : "") + ">" + esc(ph.name) + "</option>"; }).join("") + "</select>" +
      '<button class="btn" type="submit">Add</button></form></section>';

    h += '<div class="actions no-print"><button class="btn-ghost" type="button" id="btn-send">Send progress to my game</button><span class="feedback" id="send-msg" role="status"></span></div>';
    out.innerHTML = h;
  }

  function kpi(v, l, s, hero) { return '<div class="kpi' + (hero ? " hero" : "") + '"><div class="v">' + esc(v) + '</div><div class="l">' + esc(l) + '</div><div class="s">' + esc(s) + "</div></div>"; }

  /* Name the actual Next Fest edition and sales for this launch date. */
  function enrich(R, p) {
    if (!W) return;
    var nf = W.EVENTS.filter(function (e) { return e.kind === "nextfest" && e.end < p.launch && e.end >= today(); });
    R.tasks.forEach(function (t) {
      if (t.id === "nextfest") {
        t.detail += nf.length
          ? " Editions before your launch: " + nf.map(function (e) { return W.fmtRange(e.start, e.end); }).join(" and ") + "."
          : " No announced edition ends before your launch.";
      }
    });
  }
  function saleCard(p) {
    if (!W) return "";
    var s = M.sales(p.launch, W.EVENTS);
    var miss = W.EVENTS.filter(function (e) { return e.kind === "sale" && e.start > p.launch && M.daysBetween(p.launch, e.start) < 30; })[0];
    var h = '<div class="card sale-card"><h3>Steam sales after launch</h3><ul class="plain">';
    if (miss) h += "<li>Too close to the <b>" + esc(miss.name) + "</b> (" + esc(W.fmtRange(miss.start, miss.end)) + ") to join it: you need 30 days on sale first.</li>";
    s.forEach(function (e, i) { h += "<li>" + (i === 0 ? "First" : "Next") + " sale you can join: the <b>" + esc(e.name) + "</b> (" + esc(W.fmtRange(e.start, e.end)) + "). Sign up in Steamworks when Valve opens it.</li>"; });
    if (!s.length) h += "<li>Steam hasn&rsquo;t announced a sale you could join yet (dates are known to " + esc(W.fmt(W.KNOWN_UNTIL, true)) + ").</li>";
    h += "</ul></div>";
    return h;
  }

  function taskRow(t) {
    var p = plan(), skipped = !!p.skip[t.id];
    var badge = t.kind === "rule" ? '<span class="kind rule">Steam rule</span>' : t.kind === "tip" ? '<span class="kind tip">Suggested</span>' : '<span class="kind own">Your step</span>';
    var when = '<span class="due ' + (t.done ? "done" : t.status) + '">' + esc(M.fmtDay(t.due)) + (t.done ? "" : " · " + rel(t.days)) + "</span>";
    return '<li class="task' + (t.done ? " is-done" : "") + (skipped ? " is-skipped" : "") + '">' +
      '<input type="checkbox" id="t-' + esc(t.id) + '" data-tick="' + esc(t.id) + '"' + (p.done[t.id] ? " checked" : "") + (skipped ? " disabled" : "") + ">" +
      '<div class="task-body"><label for="t-' + esc(t.id) + '" class="task-title">' + esc(t.title) + "</label>" +
      '<div class="task-meta">' + when + badge + (skipped ? '<span class="kind skip">Skipped</span>' : "") + "</div>" +
      (t.detail ? '<p class="task-detail">' + esc(t.detail) + (t.doc ? ' <a href="' + t.doc + '" target="_blank" rel="noopener">Steamworks&nbsp;&rarr;</a>' : "") + "</p>" : "") +
      "</div>" +
      '<div class="task-act">' + (t.custom ? '<button type="button" class="link-btn" data-del="' + esc(t.id) + '">Remove</button>'
        : '<button type="button" class="link-btn" data-skip="' + esc(t.id) + '">' + (skipped ? "Unskip" : "Skip") + "</button>") + "</div></li>";
  }

  /* ---------------- Interaction ---------------- */
  out.addEventListener("change", function (e) {
    var id = e.target.getAttribute && e.target.getAttribute("data-tick"); if (!id) return;
    var p = plan();
    if (e.target.checked) p.done[id] = 1; else delete p.done[id];
    changed(); render();
    if (e.target.checked && window.gosTrack) gosTrack("journey_step", { tool_id: TOOL_ID, step_name: "task_done", step_index: 2, task: id });
  });
  out.addEventListener("click", function (e) {
    var s = e.target.closest("[data-skip]"), d = e.target.closest("[data-del]"), p = plan();
    if (s) { var id = s.getAttribute("data-skip"); if (p.skip[id]) delete p.skip[id]; else { p.skip[id] = 1; delete p.done[id]; } changed(); render(); }
    else if (d) { var cid = d.getAttribute("data-del"); p.custom = p.custom.filter(function (c) { return c.id !== cid; }); delete p.done[cid]; changed(); render(); }
    else if (e.target.closest("#btn-send")) sendSignals();
  });
  out.addEventListener("submit", function (e) {
    if (e.target.id !== "add-form") return;
    e.preventDefault();
    var title = document.getElementById("add-title").value.trim(), date = document.getElementById("add-date").value, phase = document.getElementById("add-phase").value;
    if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    plan().custom.push({ id: uid(), title: title.slice(0, 120), date: date, phase: phase });
    changed(); render();
  });

  /* ---------------- Calendar export (.ics) ---------------- */
  function icsText(s) { return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }
  function fold(line) { var out = [], i = 0; while (line.length - i > 74) { out.push((i ? " " : "") + line.slice(i, i + 74)); i += 74; } out.push((i ? " " : "") + line.slice(i)); return out.join("\r\n"); }
  document.getElementById("btn-ics").addEventListener("click", function () {
    if (!R) { alert("Pick your launch day first."); return; }
    var title = window.GOS && GOS.game ? GOS.game.title : "Game";
    var stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    var lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Llama & Griffin//Game OS Launch Runbook//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:" + icsText(title + " launch")];
    R.tasks.filter(function (t) { return !plan().skip[t.id]; }).forEach(function (t) {
      var day = t.due.replace(/-/g, ""), next = M.addDays(t.due, 1).replace(/-/g, "");
      lines.push("BEGIN:VEVENT", "UID:" + t.id + "-" + gameKey() + "@gameos.llamagriffin.com", "DTSTAMP:" + stamp,
        "DTSTART;VALUE=DATE:" + day, "DTEND;VALUE=DATE:" + next,
        fold("SUMMARY:" + icsText(title + ": " + t.title)),
        fold("DESCRIPTION:" + icsText((t.detail || "") + (t.doc ? "\n" + t.doc : ""))), "TRANSP:TRANSPARENT", "END:VEVENT");
    });
    lines.push("END:VCALENDAR");
    var blob = new Blob([lines.join("\r\n") + "\r\n"], { type: "text/calendar" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() + "-launch-runbook.ics";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    if (window.gosTrack) gosTrack("output_action", { action: "export_ics", tasks: R.tasks.length });
  });

  /* ---------------- Send to game ---------------- */
  function sendMsg(text, err) { var el = document.getElementById("send-msg"); if (el) { el.textContent = text; el.className = "feedback" + (err ? " err" : ""); } }
  function sendSignals() {
    if (!R) return;
    if (!window.GOS || !GOS.ready) { sendMsg("Game OS isn't available on this page.", true); return; }
    GOS.ready.then(function () {
      if (!GOS.user) { sendMsg("Sign in to send this to a game.", true); return; }
      if (!GOS.game) { sendMsg("Pick or add a game in the bar at the top first.", true); return; }
      var p = plan();
      var meta = { launch: p.launch, type: p.type, done: R.doneCount, total: R.total, next: R.next ? { title: R.next.title, due: R.next.due } : null };
      var list = [
        { key: "runbook_days_to_launch", label: "Days to launch (" + M.fmt(p.launch, true) + ")", value: R.daysToLaunch, unit: "units", meta: meta },
        { key: "runbook_done_pct", label: "Launch steps done", value: Math.round((R.doneCount / Math.max(1, R.total)) * 1000) / 10, unit: "pct" },
        { key: "runbook_overdue", label: "Launch steps past their date", value: R.late, unit: "units" },
      ];
      sendMsg("Sending to " + GOS.game.title + "…");
      GOS.recordSignals(TOOL_ID, list)
        .then(function () { sendMsg("Sent: " + R.doneCount + " of " + R.total + " steps done, " + (R.daysToLaunch >= 0 ? R.daysToLaunch + " days to launch." : "launched.")); if (window.gosTrack) gosTrack("output_action", { action: "send_signals" }); })
        .catch(function (err) { sendMsg("Could not send: " + err.message, true); });
    }, function () { sendMsg("Couldn't reach Game OS.", true); });
  }

  /* ---------------- Toolbar ---------------- */
  document.getElementById("btn-print").addEventListener("click", function () { window.print(); });
  document.getElementById("btn-clear").addEventListener("click", function () {
    if (!confirm("Clear this game's launch day, ticks and own steps?")) return;
    S.plans[gameKey()] = emptyPlan(); syncForm(); render(); persist();
  });

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
    accountTimer = setTimeout(function () { accountTimer = null; saveToAccount(); }, 1500);
    status("Saving…");
  }
  function saveToAccount(keepalive) {
    fetch(ACCOUNT_URL, { method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state: S }), keepalive: !!keepalive })
      .then(function (r) { if (!r.ok) throw new Error(r.status); status("Saved to your account", "ok"); })
      .catch(function () { status("Couldn't save to your account; your work is still in this browser", "error"); });
  }
  function initAccount() {
    if (!window.GOS || !GOS.ready) { status("Saved in this browser"); return Promise.resolve(); }
    return GOS.ready.then(function () {
      accountUser = !!GOS.user;
      if (!accountUser) { status("Not signed in: saved in this browser only", "error"); return; }
      return fetch(ACCOUNT_URL, { credentials: "same-origin" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          var server = j && j.state ? normalise(j.state) : null;
          if (server && (server.savedAt || 0) > (S.savedAt || 0) + 1000) {
            S = server;
            try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) {}
          }
          accountReady = true;
          if (server) status("Saved to your account", "ok");
          else if (Object.keys(S.plans).length) saveToAccount();
        });
    }).catch(function () { status("Saved in this browser"); });
  }
  window.addEventListener("pagehide", function () { if (accountReady && accountTimer) { clearTimeout(accountTimer); saveToAccount(true); } });

  /* ---------------- Boot ---------------- */
  document.getElementById("checked").textContent = M.fmt(M.CHECKED, true);
  syncForm(); render();
  if (window.GOS && GOS.mountBar) GOS.mountBar("#gameBar", { toolId: TOOL_ID });
  initAccount().then(function () { syncForm(); render(); });
  if (window.GOS && GOS.onChange) {
    var lastGame;
    GOS.onChange(function (s) {
      var id = s.game ? s.game.id : LOCAL;
      // A game's first visit starts from the plan made before a game was picked.
      if (id !== LOCAL && !S.plans[id] && S.plans[LOCAL] && S.plans[LOCAL].launch) S.plans[id] = JSON.parse(JSON.stringify(S.plans[LOCAL]));
      if (id !== lastGame) { lastGame = id; syncForm(); render(); }
      else renderHint();
    });
  }
})();
