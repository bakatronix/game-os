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
 *   VERCEL_ORIGIN   e.g. "game-os-xxxx.vercel.app"  (no scheme)
 *   NAMECHEAP_ORIGIN e.g. "68.65.120.165"
 *   ROUTE_API       "true" | "false"  (default true)
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    const routeApi = (env.ROUTE_API ?? "true") === "true";

    const toVercel =
      path === "/game-os" ||
      path.startsWith("/game-os/") ||
      (routeApi && (path === "/api" || path.startsWith("/api/")));

    const origin = toVercel ? env.VERCEL_ORIGIN : env.NAMECHEAP_ORIGIN;
    if (!origin) {
      return new Response("Edge router misconfigured (missing origin)", {
        status: 500,
      });
    }

    // Rewrite the request to the chosen origin, preserving method/body/headers.
    const target = new URL(request.url);
    target.protocol = "https:";
    target.hostname = origin.replace(/^https?:\/\//, "");

    const proxied = new Request(target.toString(), request);
    // Host header must be the origin's host, not llamagriffin.com.
    proxied.headers.set("Host", target.host);
    // Tell Vercel which public host this came in as (for OAuth/cookie origin).
    proxied.headers.set("X-Forwarded-Host", url.host);

    return fetch(proxied);
  },
};
