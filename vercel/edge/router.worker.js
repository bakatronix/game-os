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
      // Vercel routes by the Host header, which must be the Vercel host. But
      // Auth.js builds the OAuth redirect_uri from X-Forwarded-Host, so that
      // MUST be the PUBLIC host or Google's token exchange rejects it. Next.js
      // Server Actions compare x-forwarded-host with Origin — both are the
      // public host, so the check passes.
      const target = new URL(request.url);
      target.protocol = "https:";
      target.hostname = origin.replace(/^https?:\/\//, "");
      const proxied = new Request(target.toString(), request);
      proxied.headers.set("Host", target.host);
      proxied.headers.set("X-Forwarded-Host", url.host);
      proxied.headers.set("X-Forwarded-Proto", "https");

      const originHeader = request.headers.get("Origin");
      if (originHeader) proxied.headers.set("Origin", `https://${url.host}`);
      const referer = request.headers.get("Referer");
      if (referer) {
        try {
          const r = new URL(referer);
          r.host = url.host;
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
    const res = await fetch(request.url, {
      method: request.method,
      headers: proxied.headers,
      body: request.body,
      redirect: "manual",
      cf: { resolveOverride: originIp, cacheEverything: false },
    });
    return withSecurityHeaders(res);
  },
};

/* Same baseline headers the Next.js app sets (vercel/next.config.ts), added to
 * the Namecheap marketing site's responses. Existing headers are kept. */
const SECURITY_HEADERS = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Content-Security-Policy": "frame-ancestors 'self'; base-uri 'self'; object-src 'none'",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
};

function withSecurityHeaders(res) {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(k)) headers.set(k, v);
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

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
