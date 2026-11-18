/* Price Calculator feedback.
 * Saves one answer per signed-in person to /api/tool-state/price-calc-feedback
 * (sending again replaces it). Admins read every answer at /admin/analytics/feedback. */
(function () {
  "use strict";
  var TOOL_ID = "price-calc-feedback";
  var f = document.getElementById("f");
  var notice = document.getElementById("notice");
  var send = document.getElementById("send");
  var noBefore = document.getElementById("no_price_before");
  var priceBefore = document.getElementById("price_before");

  function el(n) { return f.elements[n]; }
  function val(n) { return ((el(n) && el(n).value) || "").trim(); }
  function radio(n) { var c = f.querySelector('input[name="' + n + '"]:checked'); return c ? c.value : ""; }
  function setRadio(n, v) { var c = f.querySelector('input[name="' + n + '"][value="' + CSS.escape(String(v)) + '"]'); if (c) c.checked = true; }
  function show(id, on) { document.getElementById(id).classList.toggle("on", !!on); }
  function track(name, props) { try { if (window.gosTrack) window.gosTrack(name, props || {}); } catch (e) {} }

  noBefore.addEventListener("change", function () {
    priceBefore.disabled = noBefore.checked;
    if (noBefore.checked) priceBefore.value = "";
  });

  function fill(s) {
    ["price_before", "price_after", "why_changed", "use_again_why", "testimonial", "name", "studio", "email"].forEach(function (k) {
      if (s[k] != null && el(k)) el(k).value = s[k];
    });
    noBefore.checked = !!s.no_price_before;
    priceBefore.disabled = noBefore.checked;
    ["helped_score", "net_per_copy_used", "time_vs_without", "use_again"].forEach(function (k) { if (s[k]) setRadio(k, s[k]); });
  }

  // Prefill: earlier answers if there are any, otherwise name and email from the account.
  Promise.all([
    fetch("/api/tool-state/" + TOOL_ID, { credentials: "same-origin" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
    fetch("/api/me", { credentials: "same-origin" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
  ]).then(function (res) {
    var saved = res[0] && res[0].state;
    var me = res[1] && res[1].user;
    if (saved) {
      fill(saved);
      var when = res[0].savedAt ? new Date(res[0].savedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";
      var p = document.getElementById("saved");
      p.textContent = "You sent this on " + when + ". Change anything and send again to update it.";
      p.hidden = false;
    } else if (me) {
      if (me.name && !val("name")) el("name").value = me.name;
      if (me.email && !val("email")) el("email").value = me.email;
      if (me.studioName && !val("studio")) el("studio").value = me.studioName;
    }
  });

  f.addEventListener("submit", function (e) {
    e.preventDefault();
    notice.className = "notice";
    notice.textContent = "";
    var errs = {
      e_before: !noBefore.checked && val("price_before") === "",
      e_after: val("price_after") === "",
      e_help: radio("helped_score") === "",
      e_name: val("name") === "",
      e_studio: val("studio") === "",
      e_email: !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val("email"))
    };
    Object.keys(errs).forEach(function (id) { show(id, errs[id]); });
    var first = Object.keys(errs).filter(function (k) { return errs[k]; })[0];
    if (first) {
      document.getElementById(first).scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    var before = noBefore.checked ? null : parseFloat(val("price_before"));
    var after = parseFloat(val("price_after"));
    var state = {
      v: 1,
      submittedAt: new Date().toISOString(),
      name: val("name"), studio: val("studio"), email: val("email"),
      price_before: before, no_price_before: noBefore.checked, price_after: after,
      why_changed: val("why_changed"),
      helped_score: Number(radio("helped_score")),
      net_per_copy_used: radio("net_per_copy_used"),
      time_vs_without: radio("time_vs_without"),
      use_again: radio("use_again"), use_again_why: val("use_again_why"),
      testimonial: val("testimonial")
    };

    send.disabled = true;
    send.textContent = "Sending…";
    fetch("/api/tool-state/" + TOOL_ID, {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: state })
    }).then(function (r) {
      if (r.status === 401) throw new Error("signin");
      if (!r.ok) throw new Error("save");
      notice.className = "notice ok";
      notice.textContent = "Thank you. We’ve got your feedback.";
      track("journey_complete", { step: "feedback_sent", helped_score: state.helped_score });
    }).catch(function (err) {
      notice.className = "notice bad";
      notice.textContent = err.message === "signin"
        ? "Your sign-in has expired. Open this page again, sign in, and send it once more."
        : "That didn’t send. Check your connection and try again.";
    }).then(function () {
      send.disabled = false;
      send.textContent = "Send feedback";
    });
  });
})();
