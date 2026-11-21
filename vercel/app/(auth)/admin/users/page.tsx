import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import GosShell from "@/components/GosShell";
import LocalTime from "@/components/LocalTime";
import { assertPlatformAdmin, requirePlatformAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
  createdAt: string;
  platformRole: string | null;
  lastSeen: string | null;
};

/** Make someone an admin, or a normal user again. Admins only. You can't
 *  remove your own admin role, and there is always at least one admin left. */
async function setRole(fd: FormData) {
  "use server";
  const session = await assertPlatformAdmin();
  const id = String(fd.get("id") || "");
  const makeAdmin = fd.get("role") === "admin";
  if (!id) return;
  if (!makeAdmin && id === session.user.id) throw new Error("You can't remove your own admin role.");
  const db = getDb();
  if (makeAdmin) {
    await db.execute(sql`UPDATE "user" SET "platformRole" = 'admin' WHERE id = ${id}`);
  } else {
    // Done in one statement so two admins removing each other can't leave none.
    await db.execute(sql`
      UPDATE "user" SET "platformRole" = NULL
      WHERE id = ${id}
        AND (SELECT COUNT(*) FROM "user" WHERE "platformRole" = 'admin' AND id <> ${id}) > 0
    `);
  }
  revalidatePath("/admin/users");
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await requirePlatformAdmin("/admin/users");
  const q = String((await searchParams).q || "").trim().slice(0, 80);
  const like = `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
  const filter = q ? sql`WHERE u.name ILIKE ${like} OR u.email ILIKE ${like}` : sql``;

  const res = (await getDb().execute(sql`
    SELECT u.id, u.name, u.email, u."createdAt", u."platformRole",
           (SELECT MAX(e."timestamp") FROM event e WHERE e."userId" = u.id) AS "lastSeen"
    FROM "user" u
    ${filter}
    ORDER BY (u."platformRole" = 'admin') DESC NULLS LAST, lower(coalesce(u.name, u.email)) ASC
  `)) as unknown as { rows: UserRow[] };
  const rows = res.rows;
  const admins = rows.filter((r) => r.platformRole === "admin");

  return (
    <GosShell title="Users" active="users">
      <div className="gos-card">
        <h2>Who can do what</h2>
        <p className="gos-muted" style={{ margin: "4px 0 0" }}>
          <b>Admins</b> run Game OS: they see platform analytics and this page, and can make other people admins.{" "}
          <b>Users</b> use the tools and their own studio; they never see platform analytics.
          Studio roles (owner, editor, viewer) are separate and set on each studio&rsquo;s Admin page.
        </p>
      </div>

      <div className="gos-card">
        <form method="get" style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <input className="gos-input" name="q" defaultValue={q} placeholder="Search name or email" style={{ maxWidth: 280 }} />
          <button className="gos-btn ghost" type="submit">Search</button>
          <span className="gos-muted" style={{ alignSelf: "center" }}>
            {rows.length} {rows.length === 1 ? "account" : "accounts"}
            {q ? " found" : ""} · {admins.length} {admins.length === 1 ? "admin" : "admins"}
            {q ? " in this list" : ""}
          </span>
        </form>
        <table className="ppl-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Joined</th>
              <th>Last active</th>
              <th>Role</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => {
              const admin = u.platformRole === "admin";
              const self = u.id === session.user.id;
              return (
                <tr key={u.id}>
                  <td>{u.name || "—"}{self && <span className="gos-muted"> (you)</span>}</td>
                  <td>{u.email || "—"}</td>
                  <td><LocalTime iso={new Date(u.createdAt).toISOString()} dateOnly /></td>
                  <td>{u.lastSeen ? <LocalTime iso={new Date(u.lastSeen).toISOString()} /> : <span className="gos-muted">never</span>}</td>
                  <td><span className={"gos-badge" + (admin ? " authenticated" : "")}>{admin ? "Admin" : "User"}</span></td>
                  <td>
                    {self ? (
                      <span className="gos-muted">—</span>
                    ) : (
                      <form action={setRole}>
                        <input type="hidden" name="id" value={u.id} />
                        <input type="hidden" name="role" value={admin ? "user" : "admin"} />
                        <button className="gos-btn ghost" type="submit">{admin ? "Remove admin" : "Make admin"}</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </GosShell>
  );
}
