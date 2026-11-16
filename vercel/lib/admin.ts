import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";

/** Platform admins (people who run Game OS itself, not studio owners).
 *  Set GAMEOS_ADMIN_USER_IDS in Vercel to a comma-separated list of user ids.
 *  Unset means nobody is an admin: the analytics pages stay hidden. */
function adminIds(): Set<string> {
  return new Set(
    (process.env.GAMEOS_ADMIN_USER_IDS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function isPlatformAdmin(userId: string | null | undefined): boolean {
  return !!userId && adminIds().has(userId);
}

/** For admin pages: sign in first, then 404 for anyone who isn't an admin
 *  (a 404, so the page's existence isn't advertised). */
export async function requirePlatformAdmin(callbackUrl: string) {
  const session = await auth();
  if (!session?.user?.id) redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  if (!isPlatformAdmin(session.user.id)) notFound();
  return session;
}

/** For server actions on admin pages: they can be called directly, so check again. */
export async function assertPlatformAdmin() {
  const session = await auth();
  if (!isPlatformAdmin(session?.user?.id)) throw new Error("Not allowed");
  return session!;
}
