import NextAuth from "next-auth";
import authConfig from "@/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;

  // Gate the dashboard landing only. Individual tools (price-calc,
  // chicken-brulee, PMF) and the seismic mockflow stay publicly reachable
  // for now — tighten later via the app registry.
  const isDashboard = pathname === "/game-os" || pathname === "/game-os/";

  if (isDashboard && !isLoggedIn) {
    const url = new URL("/login", req.nextUrl.origin);
    url.searchParams.set("callbackUrl", pathname);
    return Response.redirect(url);
  }

  return undefined;
});

export const config = {
  matcher: ["/game-os", "/game-os/"],
};
