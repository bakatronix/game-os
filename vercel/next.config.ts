import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
