import { eq, and } from "drizzle-orm";
import { getDb } from "@/db";
import { studios, memberships, invitations } from "@/db/schema";

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

  // First login — create a personal studio owned by the user. Individual
  // users operate inside this personal studio; teams invite them into theirs.
  const name = userName ? `${userName}'s Workspace` : "My Workspace";
  const [studio] = await db
    .insert(studios)
    .values({ name, ownerId: userId, isPersonal: 1 })
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

/** Random URL-safe token. */
function token(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Create a pending invitation for an email to join a studio. */
export async function createInvitation(
  studioId: string,
  email: string,
  role: string,
  invitedBy: string,
) {
  const db = getDb();
  const expires = new Date(Date.now() + 14 * 864e5);
  const [inv] = await db
    .insert(invitations)
    .values({
      studioId,
      email: email.toLowerCase().trim(),
      role,
      token: token(),
      invitedBy,
      status: "pending",
      expiresAt: expires,
    })
    .returning();
  return inv;
}

/** Pending invitations for a studio. */
export async function getInvitationsForStudio(studioId: string) {
  const db = getDb();
  return db
    .select()
    .from(invitations)
    .where(and(eq(invitations.studioId, studioId), eq(invitations.status, "pending")))
    .orderBy(invitations.createdAt);
}

/**
 * Accept an invitation by token for a signed-in user. Adds a membership if
 * the invited email matches the user's email.
 */
export async function acceptInvitation(invToken: string, userId: string, userEmail: string) {
  const db = getDb();
  const [inv] = await db
    .select()
    .from(invitations)
    .where(eq(invitations.token, invToken))
    .limit(1);

  if (!inv) return { ok: false, error: "Invitation not found" } as const;
  if (inv.status !== "pending") return { ok: false, error: "Invitation already used" } as const;
  if (inv.expiresAt && inv.expiresAt.getTime() < Date.now())
    return { ok: false, error: "Invitation expired" } as const;
  if (inv.email.toLowerCase() !== userEmail.toLowerCase())
    return { ok: false, error: "This invitation is for a different email" } as const;

  await db
    .insert(memberships)
    .values({ studioId: inv.studioId, userId, role: inv.role })
    .onConflictDoUpdate({
      target: [memberships.studioId, memberships.userId],
      set: { role: inv.role },
    });

  await db
    .update(invitations)
    .set({ status: "accepted" })
    .where(eq(invitations.id, inv.id));

  return { ok: true, studioId: inv.studioId } as const;
}
