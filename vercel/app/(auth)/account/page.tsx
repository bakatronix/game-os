import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { getStudiosForUser } from "@/lib/studio";
import { getDb } from "@/db";
import { apps } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import GosShell from "@/components/GosShell";

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/account");

  const memberships = await getStudiosForUser(session.user.id);
  const db = getDb();
  const appRows = await db
    .select()
    .from(apps)
    .where(eq(apps.enabled, 1))
    .orderBy(asc(apps.sortOrder));

  const u = session.user;

  return (
    <GosShell title="Account" active="account">
      <div className="gos-card">
        <h2>Profile</h2>
        <div className="gos-row">
          <span className="gos-muted">Name</span>
          <span>{u.name ?? "—"}</span>
        </div>
        <div className="gos-row">
          <span className="gos-muted">Email</span>
          <span>{u.email ?? "—"}</span>
        </div>
        <div className="gos-row">
          <span className="gos-muted">Active studio</span>
          <span>{u.studioName ?? "—"}</span>
        </div>
        <div className="gos-row">
          <span className="gos-muted">Role</span>
          <span className="gos-badge">{u.role ?? "—"}</span>
        </div>
      </div>

      <div className="gos-card">
        <h2>Studios</h2>
        {memberships.length === 0 ? (
          <p className="gos-muted">No studios yet.</p>
        ) : (
          memberships.map((m) => (
            <div className="gos-row" key={m.studioId}>
              <span>{m.name}</span>
              <span className="gos-badge">{m.role}</span>
            </div>
          ))
        )}
        <p className="gos-muted" style={{ marginTop: 12 }}>
          Invite members and manage roles from the{" "}
          <a href="/admin">Admin</a> tab.
        </p>
      </div>

      <div className="gos-card">
        <h2>Your apps</h2>
        {appRows.map((a) => (
          <div className="gos-row" key={a.id}>
            <span>
              <a href={a.path}>{a.name}</a>{" "}
              <span className="gos-muted">{a.path}</span>
            </span>
            <span className={`gos-badge ${a.access}`}>{a.access}</span>
          </div>
        ))}
      </div>

      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <button type="submit" className="gos-btn ghost">
          Sign out
        </button>
      </form>
    </GosShell>
  );
}
