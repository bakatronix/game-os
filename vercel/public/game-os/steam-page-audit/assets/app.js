(function () {
  "use strict";

  var startedAt = Date.now();
  var S = { entered: false, viewed: false, actioned: false };
  function track(name, props) {
    if (typeof window.gosTrack === "function") window.gosTrack(name, props || {});
  }
  function once(k, fn) { if (!S[k]) { S[k] = true; fn(); } }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function barClass(score) { return score >= 75 ? "" : score >= 55 ? "warn" : "bad"; }

  track("tool_session_start", { entry_source: document.referrer || null });

  var form = document.getElementById("auditForm");
  var input = document.getElementById("appid");
  var statusEl = document.getElementById("status");
  var reportEl = document.getElementById("report");
  var btn = document.getElementById("runBtn");

  input.value = localStorage.getItem("gos_last_appid") || "";

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var appId = (input.value || "").trim();
    if (!/^\d+$/.test(appId)) {
      statusEl.innerHTML = '<span class="error">Enter a numeric Steam App ID.</span>';
      return;
    }
    localStorage.setItem("gos_last_appid", appId);
    once("entered", function () { track("journey_step", { step_name: "app_id_entered", step_index: 1, app_id: appId }); });

    btn.disabled = true;
    statusEl.innerHTML = '<span class="spinner"></span>Auditing page…';
    reportEl.innerHTML = "";

    fetch("/api/steam-page-audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: Number(appId) }),
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        btn.disabled = false;
        if (!res.ok) {
          statusEl.innerHTML = '<span class="error">' + esc(res.body.detail || "Audit failed.") + "</span>";
          return;
        }
        statusEl.textContent = "";
        render(res.body);
        once("viewed", function () {
          track("journey_step", { step_name: "audit_viewed", step_index: 2 });
          track("audit_viewed", { app_id: Number(appId), overall: res.body.overall, grade: res.body.grade });
          track("journey_complete", { duration_seconds: Math.round((Date.now() - startedAt) / 1000) });
        });
      })
      .catch(function () {
        btn.disabled = false;
        statusEl.innerHTML = '<span class="error">Network error. Try again.</span>';
      });
  });

  function render(r) {
    var crit = r.criteria
      .map(function (c) {
        return (
          '<div class="criterion">' +
          '<span class="lbl">' + esc(c.label) + "</span>" +
          '<div class="bar ' + barClass(c.score) + '"><span style="width:' + Math.round(c.score) + '%"></span></div>' +
          '<span class="val">' + Math.round(c.score) + "</span>" +
          '<span class="detail">' + esc(c.detail) + "</span>" +
          "</div>"
        );
      })
      .join("");

    var strengths = (r.strengths || []).map(function (s) { return '<span class="pill good">' + esc(s) + "</span>"; }).join("");
    var gaps = (r.gaps || []).map(function (s) { return '<span class="pill bad">' + esc(s) + "</span>"; }).join("");

    reportEl.innerHTML =
      '<div class="card">' +
      '<div class="grade-row">' +
      '<div class="grade ' + esc(r.grade) + '">' + esc(r.grade) + "</div>" +
      '<div><div class="score-big">' + r.overall + "/100</div><div class=\"muted\">" + esc(r.game_name) + "</div></div>" +
      (r.header_image ? '<img class="cover" style="max-width:280px" src="' + esc(r.header_image) + '" alt="">' : "") +
      "</div>" +
      "</div>" +
      (strengths || gaps
        ? '<div class="card"><h2>Verdict</h2><div class="pills">' + strengths + gaps + "</div></div>"
        : "") +
      '<div class="card"><h2>Criteria</h2>' + crit + "</div>" +
      '<div class="card"><h2>Next step</h2><p class="muted">Want a full pricing + positioning read? Open the Pricing Calculator, or join the Game OS Discord for feedback.</p>' +
      '<div class="cta"><button class="btn" id="copyBtn">Copy report</button>' +
      '<a class="btn" style="text-decoration:none" href="/game-os/price-calc">Open Pricing Calculator →</a></div></div>';

    var copyBtn = document.getElementById("copyBtn");
    if (copyBtn) {
      copyBtn.addEventListener("click", function () {
        var text = "Steam Page Audit — " + r.game_name + "\nScore: " + r.overall + "/100 (grade " + r.grade + ")\n" +
          r.criteria.map(function (c) { return "  " + c.label + ": " + Math.round(c.score) + " — " + c.detail; }).join("\n");
        if (navigator.clipboard) navigator.clipboard.writeText(text);
        once("actioned", function () { track("output_action", { action: "copy" }); });
        copyBtn.textContent = "Copied";
      });
    }
  }
})();
