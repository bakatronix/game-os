/* Game OS track.js — small, dependency-free event client.
 *
 *   <script src="/track.js" data-tool="price-calc" data-version="1"></script>
 *   gosTrack('result_viewed', { score: 3.4 })
 *
 * Manages anon_id, captures UTM/referrer once, fires page_view on load, and
 * batches events to POST /api/track. Never blocks the page.
 */
(function () {
  "use strict";

  var SCRIPT = document.currentScript;
  var TOOL_ID = (SCRIPT && SCRIPT.getAttribute("data-tool")) || null;
  var APP_VERSION = (SCRIPT && SCRIPT.getAttribute("data-version")) || null;
  var ENDPOINT = "/api/track";

  function getCookie(name) {
    var m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
    return m ? decodeURIComponent(m[2]) : null;
  }
  function setCookie(name, value, days) {
    var d = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie =
      name + "=" + encodeURIComponent(value) + "; expires=" + d + "; path=/; SameSite=Lax";
  }

  var anonId = getCookie("gos_anon");
  if (!anonId) {
    anonId =
      "a_" +
      Date.now().toString(36) +
      Math.random().toString(36).slice(2, 10);
    setCookie("gos_anon", anonId, 365);
  }

  var sessionId =
    "s_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  var params = new URLSearchParams(location.search);
  var source = {
    utm_source: params.get("utm_source"),
    utm_medium: params.get("utm_medium"),
    utm_campaign: params.get("utm_campaign"),
    referrer: document.referrer || null,
  };

  var queue = [];
  var timer = null;

  function flush() {
    if (!queue.length) return;
    var batch = queue.splice(0, queue.length);
    try {
      var body = JSON.stringify({
        anon_id: anonId,
        session_id: sessionId,
        source: source,
        events: batch,
      });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
      } else {
        fetch(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: body,
          keepalive: true,
        });
      }
    } catch (e) {
      /* never break the page for analytics */
    }
  }

  function schedule() {
    if (timer) return;
    timer = setTimeout(function () {
      timer = null;
      flush();
    }, 2000);
  }

  function track(eventName, props) {
    if (!eventName) return;
    queue.push({
      event_name: eventName,
      timestamp: new Date().toISOString(),
      tool_id: TOOL_ID,
      app_version: APP_VERSION,
      props: props || {},
    });
    schedule();
  }

  // page_view on load
  track("page_view", { path: location.pathname });
  window.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", flush);

  window.gosTrack = track;
  window.__gos = {
    anonId: anonId,
    sessionId: sessionId,
    toolId: TOOL_ID,
    version: APP_VERSION,
    source: source,
  };
})();
