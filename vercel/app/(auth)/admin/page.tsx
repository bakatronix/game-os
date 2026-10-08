import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { apps, games, memberships, studios, users } from "@/db/schema";
import { eq, asc, and } from "drizzle-orm";
import { hasStudioRole } from "@/lib/studio";
import GosShell from "@/components/GosShell";

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/admin");

  const studioId = session.user.studioId;
  if (!studioId) redirect("/account");

  const canAdmin = await hasStudioRole(session.user.id, studioId, "owner");
  const db = getDb();

  const [studio] = await db
    .select()
    .from(studios)
    .where(eq(studios.id, studioId))
    .limit(1);

  const members = await db
    .select({
      userId: memberships.userId,
      role: memberships.role,
      name: users.name,
      email: users.email,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.studioId, studioId));

  const appRows = await db
    .select()
    .from(apps)
    .orderBy(asc(apps.sortOrder));

  const gameRows = await db
    .select()
    .from(games)
    .where(eq(games.studioId, studioId));

  return (
    <GosShell title="Admin" active="admin">
      <div className="gos-card">
        <h2>Studio</h2>
        <div className="gos-row">
          <span className="gos-muted">Name</span>
          <span>{studio?.name ?? "—"}</span>
        </div>
        <div className="gos-row">
          <span className="gos-muted">Your role</span>
          <span className="gos-badge">{session.user.role}</span>
        </div>
      </div>

      <div className="gos-card">
        <h2>Members</h2>
        {members.map((m) => (
          <div className="gos-row" key={m.userId}>
            <span>
              {m.name ?? "Unnamed"}{" "}
              <span className="gos-muted">{m.email}</span>
            </span>
            {canAdmin && m.userId !== session.user.id ? (
              <form
                action={async (formData: FormData) => {
                  "use server";
                  const role = String(formData.get("role"));
                  const uid = String(formData.get("uid"));
                  const db = getDb();
                  await db
                    .update(memberships)
                    .set({ role })
                    .where(
                      and(
                        eq(memberships.studioId, studioId),
                        eq(memberships.userId, uid),
                      ),
                    );
                  revalidatePath("/admin");
                }}
              >
                <input type="hidden" name="uid" value={m.userId} />
                <select
                  name="role"
                  defaultValue={m.role}
                  className="gos-input"
                  style={{ maxWidth: 120, display: "inline-block" }}
                >
                  <option value="owner">owner</option>
                  <option value="editor">editor</option>
                  <option value="viewer">viewer</option>
                </select>
                <button className="gos-btn ghost" type="submit" style={{ marginLeft: 8 }}>
                  Save
                </button>
              </form>
            ) : (
              <span className="gos-badge">{m.role}</span>
            )}
          </div>
        ))}
      </div>

      <div className="gos-card">
        <h2>Apps &amp; access</h2>
        {appRows.map((a) => (
          <div className="gos-row" key={a.id}>
            <span>
              {a.name} <span className="gos-muted">{a.path}</span>
            </span>
            {canAdmin ? (
              <form
                action={async (formData: FormData) => {
                  "use server";
                  const id = String(formData.get("id"));
                  const access = String(formData.get("access"));
                  const enabled = formData.get("enabled") === "on" ? 1 : 0;
                  const db = getDb();
                  await db
                    .update(apps)
                    .set({ access, enabled })
                    .where(eq(apps.id, id));
                  revalidatePath("/admin");
                }}
              >
                <input type="hidden" name="id" value={a.id} />
                <select
                  name="access"
                  defaultValue={a.access}
                  className="gos-input"
                  style={{ maxWidth: 160, display: "inline-block" }}
                >
                  <option value="public">public</option>
                  <option value="authenticated">authenticated</option>
                  <option value="studio">studio</option>
                  <option value="role">role</option>
                </select>
                <label style={{ marginLeft: 8 }}>
                  <input type="checkbox" name="enabled" defaultChecked={a.enabled === 1} /> on
                </label>
                <button className="gos-btn ghost" type="submit" style={{ marginLeft: 8 }}>
                  Save
                </button>
              </form>
            ) : (
              <span className={`gos-badge ${a.access}`}>{a.access}</span>
            )}
          </div>
        ))}
        <p className="gos-muted" style={{ marginTop: 12 }}>
          Note: the edge gate reads a config map that mirrors this table — access
          flips here are recorded now and wired to the gate in the next pass.
        </p>
      </div>

      <div className="gos-card">
        <h2>Games</h2>
        {gameRows.length === 0 ? (
          <p className="gos-muted">No games yet.</p>
        ) : (
          gameRows.map((g) => (
            <div className="gos-row" key={g.id}>
              <span>{g.title}</span>
              <span className="gos-muted">{g.steamAppId ?? "no appid"}</span>
            </div>
          ))
        )}
      </div>
    </GosShell>
  );
}
