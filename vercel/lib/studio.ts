import { eq, and } from "drizzle-orm";
import { getDb } from "@/db";
import { studios, memberships } from "@/db/schema";

export type StudioContext = {
  studioId: string;
  studioName: string;
  role: string;
};

/**
 * Ensure the user belongs to at least one studio, creating a personal one on
 * first login. Returns the studio they should operate in (the first
 * membership, oldest first).
 */
export async function ensureStudioForUser(
  userId: string,
  userName: string | null,
): Promise<StudioContext> {
  const db = getDb();

  // Existing membership?
  const existing = await db
    .select({
      studioId: memberships.studioId,
      role: memberships.role,
      name: studios.name,
    })
    .from(memberships)
    .innerJoin(studios, eq(studios.id, memberships.studioId))
    .where(eq(memberships.userId, userId))
    .limit(1);

  if (existing.length) {
    return {
      studioId: existing[0].studioId,
      studioName: existing[0].name,
      role: existing[0].role,
    };
  }

  // First login — create a personal studio owned by the user.
  const name = userName ? `${userName}'s Studio` : "My Studio";
  const [studio] = await db
    .insert(studios)
    .values({ name, ownerId: userId })
    .returning();

  await db
    .insert(memberships)
    .values({ studioId: studio.id, userId, role: "owner" })
    .onConflictDoNothing();

  return { studioId: studio.id, studioName: studio.name, role: "owner" };
}

/** All studios a user belongs to, with their role. */
export async function getStudiosForUser(userId: string) {
  const db = getDb();
  return db
    .select({
      studioId: memberships.studioId,
      role: memberships.role,
      name: studios.name,
    })
    .from(memberships)
    .innerJoin(studios, eq(studios.id, memberships.studioId))
    .where(eq(memberships.userId, userId));
}

/** Whether a user is a member of a studio with at least the given role. */
export async function hasStudioRole(
  userId: string,
  studioId: string,
  minRole: string,
): Promise<boolean> {
  const rank: Record<string, number> = { viewer: 0, editor: 1, owner: 2 };
  const db = getDb();
  const rows = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.studioId, studioId)))
    .limit(1);
  if (!rows.length) return false;
  return (rank[rows[0].role] ?? -1) >= (rank[minRole] ?? 99);
}
