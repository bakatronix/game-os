import { NextResponse } from "next/server";

/* Diagnostic endpoint: verifies the OAuth provider endpoints are reachable
 * from the Vercel runtime and reports the exact callback URL Auth.js builds.
 * GET /api/diag/oauth   (temporary; remove once auth is healthy)
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const out: Record<string, unknown> = {
    requestHost: req.headers.get("host"),
    xForwardedHost: req.headers.get("x-forwarded-host"),
    authUrlEnv: process.env.AUTH_URL || null,
    trustHost: process.env.AUTH_TRUST_HOST || null,
    computedCallback: `${origin}/api/auth/callback/google`,
  };

  const checks: Record<string, unknown> = {};
  for (const [name, url] of [
    ["googleDiscovery", "https://accounts.google.com/.well-known/openid-configuration"],
    ["googleToken", "https://oauth2.googleapis.com/token"],
    ["googleUserinfo", "https://openidconnect.googleapis.com/v1/userinfo"],
    ["discordAuthorize", "https://discord.com/api/oauth2/authorize"],
  ] as const) {
    try {
      const r = await fetch(url, { method: name === "googleToken" ? "POST" : "GET" });
      checks[name] = { status: r.status, ok: true };
    } catch (e) {
      checks[name] = { ok: false, error: String(e) };
    }
  }
  out.endpoints = checks;

  return NextResponse.json(out);
}
