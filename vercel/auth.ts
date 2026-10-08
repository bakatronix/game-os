import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { getDb } from "@/db";
import { users, accounts, sessions, verificationTokens } from "@/db/schema";
import authConfig from "@/auth.config";
import { ensureStudioForUser } from "@/lib/studio";

// The app runs behind a Cloudflare Worker that rewrites Host to the Vercel
// host, so Auth.js cannot see llamagriffin.com. We pin the cookie domain to
// the public apex and drop the __Host-/__Secure- prefixes (which require the
// exact request host). This keeps CSRF/PKCE/session cookies scoped to the
// public site across the proxy.
const COOKIE_DOMAIN = process.env.AUTH_COOKIE_DOMAIN || ".llamagriffin.com";
const baseCookie = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: true,
  domain: COOKIE_DOMAIN,
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(getDb(), {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  cookies: {
    sessionToken: { name: "authjs.session-token", options: baseCookie },
    callbackUrl: { name: "authjs.callback-url", options: baseCookie },
    csrfToken: { name: "authjs.csrf-token", options: baseCookie },
    pkceCodeVerifier: { name: "authjs.pkce.code_verifier", options: baseCookie },
    state: { name: "authjs.state", options: baseCookie },
    nonce: { name: "authjs.nonce", options: baseCookie },
  },
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, trigger }) {
      if (user) token.id = user.id;

      // Resolve the user's studio + role onto the token on sign-in or when
      // explicitly refreshed (session.update()). Kept off the hot path.
      const needsStudio = (user || trigger === "update") && token.id;
      if (needsStudio) {
        try {
          const { studioId, studioName, role } = await ensureStudioForUser(
            token.id as string,
            (user?.name as string) || null,
          );
          token.studioId = studioId;
          token.studioName = studioName;
          token.role = role;
        } catch (err) {
          console.error("[auth] studio resolution failed", err);
        }
      }
      return token;
    },
  },
});
