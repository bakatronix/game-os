import { NextRequest, NextResponse } from "next/server";
import NextAuth from "next-auth";
import authConfig from "@/auth.config";

const { auth } = NextAuth(authConfig);

type Gate = { path: string; access: string; minRole: string | null; id: string; name: string };

/**
 * Fallback gate map, used if the registry fetch fails. Mirrors the seeded
 * `app` table (public-first). The DB registry is the source of truth.
 */
const FALLBACK_GATES: Gate[] = [
  { path: "/game-os", access: "authenticated", minRole: null, id: "dashboard", name: "Dashboard" },
  { path: "/game-os/price-calc", access: "public", minRole: null, id: "price-calc", name: "Pricing Calculator" },
  { path: "/game-os/chicken-brulee", access: "public", minRole: null, id: "chicken-brulee", name: "Chicken Brûlée" },
  { path: "/game-os/PMF", access: "public", minRole: null, id: "pmf", name: "PMF Analyzer" },
  { path: "/seismic", access: "public", minRole: null, id: "seismic", name: "Seismic" },
];

// Edge cache for the registry (per isolate).
let cache: { at: number; gates: Gate[] } | null = null;
const TTL = 30_000;

async function getGates(req: NextRequest): Promise<Gate[]> {
  if (cache && Date.now() - cache.at < TTL) return cache.gates;
  try {
    const res = await fetch(new URL("/api/apps", req.nextUrl.origin), {
      headers: { "x-middleware-fetch": "1" },
    });
    if (res.ok) {
      const data = (await res.json()) as { gates: Gate[] };
      if (Array.isArray(data.gates) && data.gates.length) {
        cache = { at: Date.now(), gates: data.gates };
        return data.gates;
      }
    }
  } catch {
    /* fall through to fallback */
  }
  return FALLBACK_GATES;
}

function matchGate(pathname: string, gates: Gate[]): Gate | null {
  return (
    gates
      .filter((g) => pathname === g.path || pathname.startsWith(g.path + "/"))
      .sort((a, b) => b.path.length - a.path.length)[0] || null
  );
}

export default auth(async (req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;

  const gates = await getGates(req);
  const gate = matchGate(pathname, gates);

  // Dashboard/account/admin are always authenticated regardless of registry.
  const alwaysAuth =
    pathname === "/account" ||
    pathname.startsWith("/account/") ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/invite" ||
    pathname.startsWith("/invite/");

  const needsAuth =
    alwaysAuth ||
    (gate ? gate.access === "authenticated" : false);

  if (needsAuth && !isLoggedIn) {
    const url = new URL("/login", req.nextUrl.origin);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  return undefined;
});

export const config = {
  matcher: [
    "/game-os/:path*",
    "/game-os",
    "/seismic/:path*",
    "/seismic",
    "/account/:path*",
    "/account",
    "/admin/:path*",
    "/admin",
    "/invite/:path*",
    "/invite",
  ],
};
