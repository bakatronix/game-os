/**
 * Game OS edge router — Cloudflare Worker.
 *
 * Runs on llamagriffin.com. Sends the Game OS app (and its API) to Vercel and
 * everything else to the existing Namecheap origin, unchanged.
 *
 *   /game-os/*   -> Vercel   (the Next.js app in ../../vercel)
 *   /game-os     -> Vercel
 *   /api/*       -> Vercel   (same-origin APIs; set ROUTE_API=false to disable)
 *   everything   -> Namecheap origin (68.65.120.165)
 *
 * Config via Worker env vars:
 *   VERCEL_ORIGIN    e.g. "game-os-xxxx.vercel.app"  (no scheme)
 *   NAMECHEAP_ORIGIN e.g. "68.65.120.165"
 *   ROUTE_API        "true" | "false"  (default true)
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    const routeApi = (env.ROUTE_API ?? "true") === "true";

    // App pages + tools served by the Next.js app (not the marketing site).
    const APP_PREFIXES = [
      "/login",
      "/account",
      "/admin",
      "/invite",
      "/_next",
      "/seismic",
      "/track.js",
    ];

    const toVercel =
      path === "/game-os" ||
      path.startsWith("/game-os/") ||
      (routeApi && (path === "/api" || path.startsWith("/api/"))) ||
      APP_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));

    if (toVercel) {
      const origin = env.VERCEL_ORIGIN;
      if (!origin) return misconfigured();
      // Vercel only accepts its own host, so we rewrite Host to the Vercel
      // host. Next.js Server Actions additionally compare x-forwarded-host
      // with the Origin header and abort on mismatch — so Origin/Referer and
      // x-forwarded-host must ALL be the Vercel host. Public URLs are still
      // correct because Auth.js uses AUTH_URL=https://llamagriffin.com.
      const target = new URL(request.url);
      target.protocol = "https:";
      target.hostname = origin.replace(/^https?:\/\//, "");
      const proxied = new Request(target.toString(), request);
      proxied.headers.set("Host", target.host);
      proxied.headers.set("X-Forwarded-Host", target.host);
      proxied.headers.set("X-Forwarded-Proto", "https");

      const originHeader = request.headers.get("Origin");
      if (originHeader) proxied.headers.set("Origin", `https://${target.host}`);
      const referer = request.headers.get("Referer");
      if (referer) {
        try {
          const r = new URL(referer);
          r.host = target.host;
          proxied.headers.set("Referer", r.toString());
        } catch {}
      }
      const res = await fetch(proxied, { redirect: "manual" });
      return rewriteUpstream(res, target.host, url.host);
    }

    // Everything else -> the Namecheap origin. Connect to the origin IP while
    // presenting SNI/Host as llamagriffin.com (its TLS cert is valid only for
    // that name). resolveOverride avoids looping back through the proxy.
    const originIp = env.NAMECHEAP_ORIGIN;
    if (!originIp) return misconfigured();
    const proxied = new Request(request);
    proxied.headers.set("Host", url.host);
    proxied.headers.set("X-Forwarded-Host", url.host);
    proxied.headers.set("X-Forwarded-Proto", "https");
    return fetch(request.url, {
      method: request.method,
      headers: proxied.headers,
      body: request.body,
      redirect: "manual",
      cf: { resolveOverride: originIp, cacheEverything: false },
    });
  },
};

function misconfigured() {
  return new Response("Edge router misconfigured (missing origin)", {
    status: 500,
  });
}

/**
 * Rewrite the upstream (Vercel host) response so it behaves as if it came from
 * the public host (llamagriffin.com):
 *  - Location headers -> public host
 *  - Set-Cookie: strip __Host- / __Secure- prefixes (invalid once we add a
 *    Domain) and set Domain=.llamagriffin.com so the browser sends them back
 *    to the proxied app on every request (PKCE/CSRF/session cookies).
 */
function rewriteUpstream(res, fromHost, toHost) {
  const headers = new Headers(res.headers);

  const loc = headers.get("Location");
  if (loc && loc.includes(fromHost)) {
    headers.set("Location", loc.replaceAll(fromHost, toHost));
  }

  const cookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  if (cookies.length) {
    headers.delete("Set-Cookie");
    const apex = ".".concat(toHost.split(".").slice(-2).join("."));
    for (const c of cookies) {
      // Strip __Host-/__Secure- prefixes (invalid with a Domain) and normalise
      // the Domain to the public apex so the browser sends them back.
      let out = c
        .replace(/^__Host-/, "")
        .replace(/^__Secure-/, "")
        .replace(/;\s*Domain=[^;]*/gi, "");
      out += `; Domain=${apex}`;
      headers.append("Set-Cookie", out);
    }
  }

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}
