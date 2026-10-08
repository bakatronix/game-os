import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { sql } from "drizzle-orm";
import GosShell from "@/components/GosShell";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/admin/analytics");

  const db = getDb();

  // Funnel steps (matches the spec's priority order)
  const funnelNames = [
    "page_view",
    "waitlist_signup",
    "discord_join",
    "tool_session_start",
    "journey_complete",
    "return_session",
  ];

  const funnelRows = (await db.execute(sql`
    SELECT "eventName" AS name,
           COUNT(*)::int AS total,
           COUNT(DISTINCT COALESCE("anonId", "userId"))::int AS uniques
    FROM event
    GROUP BY "eventName"
  `)) as unknown as { rows: { name: string; total: number; uniques: number }[] };
  const byName = new Map(funnelRows.rows.map((r) => [r.name, r]));

  const last7 = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM event
    WHERE "timestamp" > now() - interval '7 days'
  `)) as unknown as { rows: { n: number }[] };

  const byTool = (await db.execute(sql`
    SELECT COALESCE("toolId", '(none)') AS tool, COUNT(*)::int AS total
    FROM event GROUP BY "toolId" ORDER BY total DESC
  `)) as unknown as { rows: { tool: string; total: number }[] };

  const bySource = (await db.execute(sql`
    SELECT COALESCE("utmSource", referrer, '(direct)') AS source, COUNT(*)::int AS total
    FROM event WHERE "eventName" = 'page_view'
    GROUP BY 1 ORDER BY total DESC LIMIT 10
  `)) as unknown as { rows: { source: string; total: number }[] };

  const maxFunnel = Math.max(
    1,
    ...funnelNames.map((n) => byName.get(n)?.uniques ?? 0),
  );

  return (
    <GosShell title="Analytics" active="admin" subnav="funnel">
      <div className="gos-card">
        <h2>Funnel (unique actors)</h2>
        <p className="gos-muted" style={{ marginTop: -4 }}>
          page_view → waitlist_signup → discord_join → tool_session → journey_complete → return_session
        </p>
        {funnelNames.map((name, i) => {
          const r = byName.get(name);
          const val = r?.uniques ?? 0;
          const pct = Math.round((val / maxFunnel) * 100);
          return (
            <div className="gos-row" key={name}>
              <span>
                {i + 1}. <strong>{name}</strong>{" "}
                <span className="gos-muted">{val} unique · {r?.total ?? 0} total</span>
              </span>
              <span style={{ width: 220, height: 12, background: "var(--sand-deep)", borderRadius: 6, display: "inline-block", overflow: "hidden" }}>
                <span style={{ display: "block", width: `${pct}%`, height: "100%", background: "var(--teal)" }} />
              </span>
            </div>
          );
        })}
        <p className="gos-muted" style={{ marginTop: 12 }}>
          Events in last 7 days: <strong>{last7.rows[0]?.n ?? 0}</strong>
        </p>
      </div>

      <div className="gos-card">
        <h2>Events by tool</h2>
        {byTool.rows.length === 0 ? (
          <p className="gos-muted">No events yet.</p>
        ) : (
          byTool.rows.map((r) => (
            <div className="gos-row" key={r.tool}>
              <span>{r.tool}</span>
              <span className="gos-badge">{r.total}</span>
            </div>
          ))
        )}
      </div>

      <div className="gos-card">
        <h2>Content attribution (page_view source)</h2>
        {bySource.rows.length === 0 ? (
          <p className="gos-muted">No page views yet.</p>
        ) : (
          bySource.rows.map((r) => (
            <div className="gos-row" key={r.source}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 520 }}>
                {r.source}
              </span>
              <span className="gos-badge">{r.total}</span>
            </div>
          ))
        )}
      </div>
    </GosShell>
  );
}
