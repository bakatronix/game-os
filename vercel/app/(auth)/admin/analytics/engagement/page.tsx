import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { discordSnapshots } from "@/db/schema";
import { desc } from "drizzle-orm";
import GosShell from "@/components/GosShell";

export const dynamic = "force-dynamic";

export default async function EngagementPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/admin/analytics/engagement");

  const db = getDb();
  const rows = await db
    .select()
    .from(discordSnapshots)
    .orderBy(desc(discordSnapshots.snapshotDate))
    .limit(60);

  const latest = rows[0];
  const ratio =
    latest && latest.memberCount
      ? Math.round(((latest.activeMembers ?? 0) / latest.memberCount) * 100)
      : null;

  return (
    <GosShell title="Analytics" active="admin" subnav="engagement">
      <div className="gos-card">
        <h2>Engagement ratio</h2>
        <p className="gos-muted" style={{ marginTop: -4 }}>
          active_members / member_count — the number that goes in front of investors.
        </p>
        <div className="gos-row">
          <span className="gos-muted">Latest ratio</span>
          <span style={{ fontSize: 28, fontWeight: 700 }}>
            {ratio !== null ? `${ratio}%` : "—"}
          </span>
        </div>
        {latest && (
          <>
            <div className="gos-row"><span className="gos-muted">Members</span><span>{latest.memberCount ?? "—"}</span></div>
            <div className="gos-row"><span className="gos-muted">Active (7d)</span><span>{latest.activeMembers ?? "—"}</span></div>
            <div className="gos-row"><span className="gos-muted">New joins</span><span>{latest.newJoins ?? "—"}</span></div>
            <div className="gos-row"><span className="gos-muted">Leaves</span><span>{latest.leaves ?? "—"}</span></div>
            <div className="gos-row"><span className="gos-muted">Messages</span><span>{latest.messagesCount ?? "—"}</span></div>
            <div className="gos-row"><span className="gos-muted">Play-night attendance</span><span>{latest.playNightAttendance ?? "—"}</span></div>
          </>
        )}
      </div>

      <div className="gos-card">
        <h2>Trend</h2>
        {rows.length === 0 ? (
          <p className="gos-muted">No snapshots yet. Add one below.</p>
        ) : (
          rows.map((r) => {
            const pct = r.memberCount ? Math.round(((r.activeMembers ?? 0) / r.memberCount) * 100) : 0;
            return (
              <div className="gos-row" key={r.id}>
                <span>
                  {new Date(r.snapshotDate).toISOString().slice(0, 10)}{" "}
                  <span className="gos-muted">{r.memberCount ?? 0} members · {r.activeMembers ?? 0} active</span>
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 160, height: 12, background: "var(--sand-deep)", borderRadius: 6, display: "inline-block", overflow: "hidden" }}>
                    <span style={{ display: "block", width: `${pct}%`, height: "100%", background: "var(--teal)" }} />
                  </span>
                  <span className="gos-badge">{pct}%</span>
                </span>
              </div>
            );
          })
        )}
      </div>

      <div className="gos-card">
        <h2>Add snapshot</h2>
        <p className="gos-muted" style={{ marginTop: -4 }}>
          Manual entry for now — the Discord bot collector (Layer 4) is deferred.
        </p>
        <form
          action={async (fd: FormData) => {
            "use server";
            const num = (k: string) => {
              const v = parseInt(String(fd.get(k) || ""), 10);
              return Number.isNaN(v) ? null : v;
            };
            await getDb().insert(discordSnapshots).values({
              memberCount: num("memberCount"),
              newJoins: num("newJoins"),
              leaves: num("leaves"),
              activeMembers: num("activeMembers"),
              messagesCount: num("messagesCount"),
              playNightAttendance: num("playNightAttendance"),
              granularity: String(fd.get("granularity") || "daily"),
            });
            revalidatePath("/admin/analytics/engagement");
          }}
          style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}
        >
          <div className="gos-field"><label className="gos-label">Member count</label><input className="gos-input" name="memberCount" type="number" /></div>
          <div className="gos-field"><label className="gos-label">New joins</label><input className="gos-input" name="newJoins" type="number" /></div>
          <div className="gos-field"><label className="gos-label">Leaves</label><input className="gos-input" name="leaves" type="number" /></div>
          <div className="gos-field"><label className="gos-label">Active (trailing 7d)</label><input className="gos-input" name="activeMembers" type="number" /></div>
          <div className="gos-field"><label className="gos-label">Messages</label><input className="gos-input" name="messagesCount" type="number" /></div>
          <div className="gos-field"><label className="gos-label">Play-night attendance</label><input className="gos-input" name="playNightAttendance" type="number" /></div>
          <div className="gos-field"><label className="gos-label">Granularity</label>
            <select className="gos-input" name="granularity" defaultValue="daily">
              <option value="daily">daily</option>
              <option value="weekly">weekly</option>
            </select>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <button className="gos-btn" type="submit">Add snapshot</button>
          </div>
        </form>
      </div>
    </GosShell>
  );
}
