import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The app runs behind a Cloudflare Worker that proxies to the Vercel host.
  // Vercel sets x-forwarded-host to the Vercel host, but the browser's Origin
  // is llamagriffin.com. Allow the public origin so Server Actions (used by
  // the Auth.js sign-in buttons) are not rejected.
  experimental: {
    serverActions: {
      allowedOrigins: [
        "llamagriffin.com",
        "www.llamagriffin.com",
        "game-os-seismic2.vercel.app",
      ],
    },
  },
  // Baseline security headers on every response. A full script CSP is left
  // out on purpose: the static tools use inline scripts and several CDNs.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      // ---- Static tools (served from /public) ----
      { source: "/game-os", destination: "/game-os/index.html" },
      { source: "/game-os/", destination: "/game-os/index.html" },
      { source: "/game-os/price-calc", destination: "/game-os/price-calc/index.html" },
      { source: "/game-os/price-calc/", destination: "/game-os/price-calc/index.html" },
      { source: "/game-os/chicken-brulee", destination: "/game-os/chicken-brulee/index.html" },
      { source: "/game-os/chicken-brulee/", destination: "/game-os/chicken-brulee/index.html" },
      { source: "/game-os/PMF", destination: "/game-os/PMF/index.html" },
      { source: "/game-os/PMF/", destination: "/game-os/PMF/index.html" },
      { source: "/game-os/steam-page-audit", destination: "/game-os/steam-page-audit/index.html" },
      { source: "/game-os/steam-page-audit/", destination: "/game-os/steam-page-audit/index.html" },
      { source: "/game-os/market-scope", destination: "/game-os/market-scope/index.html" },
      { source: "/game-os/market-scope/", destination: "/game-os/market-scope/index.html" },
      { source: "/game-os/thesis-builder", destination: "/game-os/thesis-builder/index.html" },
      { source: "/game-os/thesis-builder/", destination: "/game-os/thesis-builder/index.html" },
      { source: "/game-os/audience-map", destination: "/game-os/audience-map/index.html" },
      { source: "/game-os/audience-map/", destination: "/game-os/audience-map/index.html" },
      { source: "/game-os/page-engine", destination: "/game-os/page-engine/index.html" },
      { source: "/game-os/page-engine/", destination: "/game-os/page-engine/index.html" },
      { source: "/game-os/community-scaffold", destination: "/game-os/community-scaffold/index.html" },
      { source: "/game-os/community-scaffold/", destination: "/game-os/community-scaffold/index.html" },
      { source: "/game-os/test-loop", destination: "/game-os/test-loop/index.html" },
      { source: "/game-os/test-loop/", destination: "/game-os/test-loop/index.html" },
      { source: "/game-os/festival-radar", destination: "/game-os/festival-radar/index.html" },
      { source: "/game-os/festival-radar/", destination: "/game-os/festival-radar/index.html" },
      { source: "/game-os/playtest-pipeline", destination: "/game-os/playtest-pipeline/index.html" },
      { source: "/game-os/playtest-pipeline/", destination: "/game-os/playtest-pipeline/index.html" },
      { source: "/game-os/creator-match", destination: "/game-os/creator-match/index.html" },
      { source: "/game-os/creator-match/", destination: "/game-os/creator-match/index.html" },
      { source: "/game-os/sentiment-radar", destination: "/game-os/sentiment-radar/index.html" },
      { source: "/game-os/sentiment-radar/", destination: "/game-os/sentiment-radar/index.html" },
      { source: "/game-os/demo-command", destination: "/game-os/demo-command/index.html" },
      { source: "/game-os/demo-command/", destination: "/game-os/demo-command/index.html" },
      { source: "/game-os/window-planner", destination: "/game-os/window-planner/index.html" },
      { source: "/game-os/window-planner/", destination: "/game-os/window-planner/index.html" },
      { source: "/game-os/launch-runbook", destination: "/game-os/launch-runbook/index.html" },
      { source: "/game-os/launch-runbook/", destination: "/game-os/launch-runbook/index.html" },
      { source: "/game-os/long-tail-engine", destination: "/game-os/long-tail-engine/index.html" },
      { source: "/game-os/long-tail-engine/", destination: "/game-os/long-tail-engine/index.html" },
      { source: "/game-os/sequel-signal", destination: "/game-os/sequel-signal/index.html" },
      { source: "/game-os/sequel-signal/", destination: "/game-os/sequel-signal/index.html" },
      // PMF web (built with VITE_API_URL=/game-os/PMF/api/v1) posts to
      // /game-os/PMF/api/v1/analyze — send it to the ported route handler.
      {
        source: "/game-os/PMF/api/v1/analyze",
        destination: "/api/v1/analyze",
      },
      { source: "/seismic", destination: "/seismic/index.html" },
      { source: "/seismic/", destination: "/seismic/index.html" },
    ];
  },
};

export default nextConfig;
