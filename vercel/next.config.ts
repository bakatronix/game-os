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
