import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Discord from "next-auth/providers/discord";

/**
 * Edge-safe Auth.js config: providers + pages only, no adapter. Imported by
 * middleware so it does not pull the Neon/Drizzle client into the Edge runtime.
 * The full config with the Drizzle adapter lives in auth.ts.
 */
export default {
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
    Discord({
      clientId: process.env.AUTH_DISCORD_ID,
      clientSecret: process.env.AUTH_DISCORD_SECRET,
    }),
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
