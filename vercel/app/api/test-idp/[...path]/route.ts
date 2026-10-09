import { NextResponse } from "next/server";

/**
 * Mock OIDC identity provider for end-to-end auth tests.
 * Enabled only when ENABLE_TEST_AUTH=true. It mimics Google's OIDC shape:
 *   /api/test-idp/authorize  -> redirects back with ?code=...&state=...
 *   /api/test-idp/token      -> returns an id_token (with iss) + access_token
 *   /api/test-idp/userinfo   -> returns the profile
 */
export const dynamic = "force-dynamic";

// The issuer must match what Auth.js expects, which is derived from AUTH_URL
// (the public domain) — not the request origin (the Vercel host behind the
// proxy). Mirrors real IdPs whose issuer is a fixed public URL.
const ISSUER = `${process.env.AUTH_URL || "https://llamagriffin.com"}/api/test-idp`;
// Tiny HS256 JWT so Auth.js can decode the id_token (no external deps).
function b64url(obj: unknown) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}
async function signJwt(payload: Record<string, unknown>) {
  const header = b64url({ alg: "HS256", typ: "JWT" });
  const body = b64url(payload);
  const data = `${header}.${body}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(process.env.AUTH_SECRET || "test"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return `${data}.${Buffer.from(sig).toString("base64url")}`;
}

export async function GET(req: Request) {
  if (process.env.ENABLE_TEST_AUTH !== "true") {
    return NextResponse.json({ error: "disabled" }, { status: 404 });
  }
  const url = new URL(req.url);
  const path = url.pathname;
  const redirectUri = url.searchParams.get("redirect_uri") || "";
  const state = url.searchParams.get("state") || "";
  const origin = url.origin;

  if (path.endsWith("/authorize")) {
    const cb = new URL(redirectUri);
    cb.searchParams.set("code", "test-code");
    cb.searchParams.set("state", state);
    return NextResponse.redirect(cb.toString());
  }

  if (path.endsWith("/token")) {
    const now = Math.floor(Date.now() / 1000);
    const idToken = await signJwt({
      iss: ISSUER,
      aud: "test-client",
      sub: "test-user-1",
      email: "test-agent@llamagriffin.com",
      email_verified: true,
      name: "Test Agent",
      iat: now,
      exp: now + 3600,
    });
    return NextResponse.json({
      access_token: "test-access",
      token_type: "Bearer",
      expires_in: 3600,
      id_token: idToken,
      scope: "openid profile email",
    });
  }

  if (path.endsWith("/userinfo")) {
    return NextResponse.json({
      sub: "test-user-1",
      email: "test-agent@llamagriffin.com",
      email_verified: true,
      name: "Test Agent",
      iss: ISSUER,
    });
  }

  if (path.endsWith("/.well-known/openid-configuration")) {
    return NextResponse.json({
      issuer: ISSUER,
      authorization_endpoint: `${origin}/api/test-idp/authorize`,
      token_endpoint: `${origin}/api/test-idp/token`,
      userinfo_endpoint: `${origin}/api/test-idp/userinfo`,
      jwks_uri: `${origin}/api/test-idp/jwks`,
      response_types_supported: ["code"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["HS256"],
      scopes_supported: ["openid", "profile", "email"],
      claims_supported: ["sub", "email", "name", "iss"],
    });
  }

  return NextResponse.json({ error: "not_found", path }, { status: 404 });
}

export const POST = GET;
