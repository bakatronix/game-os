import NextAuth from "next-auth";
import authConfig from "@/auth.config";

const { auth } = NextAuth(authConfig);

/**
 * Gated paths and their access policy. Public-first: tools are `public`
 * until flipped. Must stay in sync with the `app` table (seeded in
 * scripts/migrate.ts). The registry in the DB drives the UI and /api/me;
 * this map drives the Edge gate without a DB round-trip.
 */
const GATES: { prefix: string; access: "authenticated" | "public" }[] = [
  { prefix: "/game-os", access: "authenticated" }, // dashboard landing only
  { prefix: "/game-os/price-calc", access: "public" },
  { prefix: "/game-os/chicken-brulee", access: "public" },
  { prefix: "/game-os/PMF", access: "public" },
  { prefix: "/seismic", access: "public" },
  { prefix: "/account", access: "authenticated" },
  { prefix: "/admin", access: "authenticated" },
];

function requiredAuth(pathname: string): boolean {
  // Longest-prefix match wins so /game-os/price-calc beats /game-os.
  const match = GATES.filter(
    (g) => pathname === g.prefix || pathname.startsWith(g.prefix + "/"),
  ).sort((a, b) => b.prefix.length - a.prefix.length)[0];
  return match ? match.access === "authenticated" : false;
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;

  if (requiredAuth(pathname) && !isLoggedIn) {
    const url = new URL("/login", req.nextUrl.origin);
    url.searchParams.set("callbackUrl", pathname);
    return Response.redirect(url);
  }

  return undefined;
});

export const config = {
  matcher: ["/game-os/:path*", "/game-os", "/account/:path*", "/admin/:path*"],
};
