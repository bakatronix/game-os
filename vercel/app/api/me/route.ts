import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getStudiosForUser } from "@/lib/studio";
import { getDb } from "@/db";
import { apps } from "@/db/schema";
import { eq, asc } from "drizzle-orm";

/**
 * GET /api/me — the identity + context endpoint the static tools call to
 * discover who is signed in and which apps they can open.
 *
 * Returns { user: null } when signed out.
 */
export async function GET() {
  const session = await auth();

  const db = getDb();
  const appRows = await db
    .select()
    .from(apps)
    .where(eq(apps.enabled, 1))
    .orderBy(asc(apps.sortOrder));

  if (!session?.user) {
    return NextResponse.json({
      user: null,
      apps: appRows.map(publicApp),
    });
  }

  const memberships = await getStudiosForUser(session.user.id);

  return NextResponse.json({
    user: {
      id: session.user.id,
      name: session.user.name ?? null,
      email: session.user.email ?? null,
      image: session.user.image ?? null,
      studioId: session.user.studioId ?? null,
      studioName: session.user.studioName ?? null,
      role: session.user.role ?? null,
    },
    memberships,
    apps: appRows.map(publicApp),
  });
}

function publicApp(a: typeof apps.$inferSelect) {
  return {
    id: a.id,
    name: a.name,
    path: a.path,
    url: a.url,
    access: a.access,
    minRole: a.minRole,
    version: a.version,
    icon: a.icon,
  };
}
