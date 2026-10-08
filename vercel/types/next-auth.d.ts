import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      studioId?: string | null;
      studioName?: string | null;
      role?: string | null;
    } & DefaultSession["user"];
  }
}
