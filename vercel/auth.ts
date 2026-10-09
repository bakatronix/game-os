import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { getDb } from "@/db";
import { users, accounts, sessions, verificationTokens } from "@/db/schema";
import authConfig from "@/auth.config";
import { ensureStudioForUser } from "@/lib/studio";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  debug: true,
  adapter: DrizzleAdapter(getDb(), {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
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
