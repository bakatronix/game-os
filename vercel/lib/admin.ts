import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { users } from "@/db/schema";

/** Platform admins are the people who run Game OS itself (not studio owners).
 *  An admin has "admin" in user.platformRole; everyone else is a normal user.
 *  Admins see platform analytics and the Users page, where they can make
 *  other people admins. Checked against the database on every request, so a
 *  change takes effect at once without anyone signing out. */
export const isPlatformAdmin = cache(async (userId: string | null | undefined): Promise<boolean> => {
  if (!userId) return false;
  const [row] = await getDb()
    .select({ role: users.platformRole })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.role === "admin";
});

/** For admin pages: sign in first, then 404 for anyone who isn't an admin
 *  (a 404, so the page's existence isn't advertised). */
export async function requirePlatformAdmin(callbackUrl: string) {
  const session = await auth();
  if (!session?.user?.id) redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  if (!(await isPlatformAdmin(session.user.id))) notFound();
  return session;
}

/** For server actions on admin pages: they can be called directly, so check again. */
export async function assertPlatformAdmin() {
  const session = await auth();
  if (!(await isPlatformAdmin(session?.user?.id))) throw new Error("Not allowed");
  return session!;
}
