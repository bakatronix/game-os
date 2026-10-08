import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { sql } from "drizzle-orm";
import GosShell from "@/components/GosShell";
import {
  getPartners,
  createPartner,
  updatePartner,
  deletePartner,
} from "@/lib/partners";

export const dynamic = "force-dynamic";

type PartnerRow = Awaited<ReturnType<typeof getPartners>>[number] & {
  sessions: number;
  lastSession: string | null;
  dormant: boolean;
};

export default async function PartnersPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/admin/analytics/partners");

  const partners = await getPartners();
  const db = getDb();

  // Session counts per user, from Layer 2 events (tool_session_start).
  const countsRes = (await db.execute(sql`
    SELECT "userId" AS uid, COUNT(*)::int AS sessions, MAX("timestamp") AS last
    FROM event
    WHERE "eventName" = 'tool_session_start' AND "userId" IS NOT NULL
    GROUP BY "userId"
  `)) as unknown as { rows: { uid: string; sessions: number; last: string }[] };
  const counts = new Map(countsRes.rows.map((r) => [r.uid, r]));

  const rows: PartnerRow[] = partners.map((p) => {
    const c = p.userId ? counts.get(p.userId) : undefined;
    const last = c?.last ? new Date(c.last) : null;
    const dormant = !last || Date.now() - last.getTime() > 14 * 864e5;
    return {
      ...p,
      sessions: c?.sessions ?? 0,
      lastSession: last ? last.toISOString().slice(0, 10) : null,
      dormant: p.status === "active" ? dormant : false,
    };
  });

  const active = rows.filter((r) => r.status === "active" && !r.dormant).length;
  const dormantCount = rows.filter((r) => r.dormant).length;

  return (
    <GosShell title="Analytics" active="admin" subnav="partners">
      <div className="gos-card">
        <h2>Partner board</h2>
        <p className="gos-muted" style={{ marginTop: -4 }}>
          {rows.length} partners · {active} active · {dormantCount} flagged dormant
          (no session in 14 days)
        </p>

        {rows.length === 0 ? (
          <p className="gos-muted">No partners yet. Add one below.</p>
        ) : (
          rows.map((p) => (
            <div className="gos-row" key={p.id} style={{ alignItems: "flex-start" }}>
              <div style={{ minWidth: 0 }}>
                <div>
                  <strong>{p.studioName}</strong>{" "}
                  {p.game ? <span className="gos-muted">· {p.game}</span> : null}
                </div>
                <div className="gos-muted" style={{ fontSize: 12 }}>
                  {[p.contact, p.devStage, p.recruitedVia].filter(Boolean).join(" · ")}
                  {p.validating ? ` · validating: ${p.validating}` : ""}
                </div>
                <div className="gos-muted" style={{ fontSize: 12 }}>
                  {p.sessions} sessions · last {p.lastSession ?? "never"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span className="gos-badge">{p.status}</span>
                {p.dormant && <span className="gos-badge authenticated">dormant</span>}
                <form
                  action={async (fd: FormData) => {
                    "use server";
                    await updatePartner(String(fd.get("id")), {
                      status: String(fd.get("status")),
                      quotePermission: String(fd.get("quote")),
                    });
                    revalidatePath("/admin/analytics/partners");
                  }}
                  style={{ display: "flex", gap: 6, alignItems: "center" }}
                >
                  <input type="hidden" name="id" value={p.id} />
                  <select name="status" defaultValue={p.status ?? "active"} className="gos-input" style={{ maxWidth: 110 }}>
                    <option value="active">active</option>
                    <option value="dormant">dormant</option>
                    <option value="churned">churned</option>
                  </select>
                  <select name="quote" defaultValue={p.quotePermission ?? "n"} className="gos-input" style={{ maxWidth: 90 }}>
                    <option value="n">quote n</option>
                    <option value="y">quote y</option>
                  </select>
                  <button className="gos-btn ghost" type="submit">Save</button>
                </form>
                <form
                  action={async (fd: FormData) => {
                    "use server";
                    await deletePartner(String(fd.get("id")));
                    revalidatePath("/admin/analytics/partners");
                  }}
                >
                  <input type="hidden" name="id" value={p.id} />
                  <button className="gos-btn ghost" type="submit">Remove</button>
                </form>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="gos-card">
        <h2>Add a partner</h2>
        <form
          action={async (fd: FormData) => {
            "use server";
            const studioName = String(fd.get("studioName") || "").trim();
            if (studioName) {
              await createPartner({
                studioName,
                contact: String(fd.get("contact") || ""),
                game: String(fd.get("game") || ""),
                steamPageUrl: String(fd.get("steamPageUrl") || ""),
                devStage: String(fd.get("devStage") || ""),
                recruitedVia: String(fd.get("recruitedVia") || ""),
                validating: String(fd.get("validating") || ""),
              });
            }
            revalidatePath("/admin/analytics/partners");
          }}
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
        >
          <div className="gos-field"><label className="gos-label">Studio name</label><input className="gos-input" name="studioName" required /></div>
          <div className="gos-field"><label className="gos-label">Contact</label><input className="gos-input" name="contact" /></div>
          <div className="gos-field"><label className="gos-label">Game</label><input className="gos-input" name="game" /></div>
          <div className="gos-field"><label className="gos-label">Steam page URL</label><input className="gos-input" name="steamPageUrl" /></div>
          <div className="gos-field"><label className="gos-label">Dev stage</label>
            <select className="gos-input" name="devStage" defaultValue="concept">
              <option>concept</option><option>preprod</option><option>playable</option><option>beta</option><option>launched</option>
            </select>
          </div>
          <div className="gos-field"><label className="gos-label">Recruited via</label>
            <select className="gos-input" name="recruitedVia" defaultValue="ring1">
              <option>ring1</option><option>ring2</option><option>content</option><option>other</option>
            </select>
          </div>
          <div className="gos-field" style={{ gridColumn: "1 / -1" }}><label className="gos-label">Validating (what their usage proves)</label><input className="gos-input" name="validating" /></div>
          <div style={{ gridColumn: "1 / -1" }}>
            <button className="gos-btn" type="submit">Add partner</button>
          </div>
        </form>
      </div>
    </GosShell>
  );
}
