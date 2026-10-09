import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Discord from "next-auth/providers/discord";

// Test-only OIDC provider pointing at the mock IdP (/api/test-idp). Enabled
// only when ENABLE_TEST_AUTH=true so agents can exercise the full callback
// path deterministically. Never present in normal production.
const testProvider = {
  id: "test",
  name: "Test",
  type: "oidc" as const,
  issuer: `${process.env.AUTH_URL || "https://llamagriffin.com"}/api/test-idp`,
  clientId: "test-client",
  clientSecret: "test-secret",
  authorization: {
    params: {
      authorization_endpoint: `${process.env.AUTH_URL || "https://llamagriffin.com"}/api/test-idp/authorize`,
    },
  },
};

/**
 * Edge-safe Auth.js config: providers + pages only, no adapter. Imported by
 * middleware so it does not pull the Neon/Drizzle client into the Edge runtime.
 * The full config with the Drizzle adapter lives in auth.ts.
 */
// The app runs behind a Cloudflare Worker that rewrites Host to the Vercel
// host, so Auth.js cannot see llamagriffin.com. Pin the cookie domain to the
// public apex and drop the __Host-/__Secure- prefixes (which require the exact
// request host). This MUST live in the shared config so the Edge middleware
// looks for the same cookie names the Node route sets — otherwise middleware
// never sees the session and every request loops back to /login.
const COOKIE_DOMAIN = process.env.AUTH_COOKIE_DOMAIN || ".llamagriffin.com";
const baseCookie = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: true,
  domain: COOKIE_DOMAIN,
};

export default {
  cookies: {
    sessionToken: { name: "authjs.session-token", options: baseCookie },
    callbackUrl: { name: "authjs.callback-url", options: baseCookie },
    csrfToken: { name: "authjs.csrf-token", options: baseCookie },
    pkceCodeVerifier: { name: "authjs.pkce.code_verifier", options: baseCookie },
    state: { name: "authjs.state", options: baseCookie },
    nonce: { name: "authjs.nonce", options: baseCookie },
  },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
    Discord({
      clientId: process.env.AUTH_DISCORD_ID,
      clientSecret: process.env.AUTH_DISCORD_SECRET,
    }),
    ...(process.env.ENABLE_TEST_AUTH === "true" ? [testProvider as any] : []),
  ],
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.studioId = (token.studioId as string) || null;
        session.user.studioName = (token.studioName as string) || null;
        session.user.role = (token.role as string) || null;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
