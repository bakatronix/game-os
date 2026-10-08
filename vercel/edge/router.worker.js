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
      // Vercel only accepts its own host. Rewrite Host to the Vercel host and
      // pass the public host via X-Forwarded-Host so Auth.js (AUTH_URL=
      // https://llamagriffin.com, trust host) builds correct public URLs.
      const target = new URL(request.url);
      target.protocol = "https:";
      target.hostname = origin.replace(/^https?:\/\//, "");
      const proxied = new Request(target.toString(), request);
      proxied.headers.set("Host", target.host);
      proxied.headers.set("X-Forwarded-Host", url.host);
      proxied.headers.set("X-Forwarded-Proto", "https");
      return fetch(proxied, { redirect: "manual" });
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
