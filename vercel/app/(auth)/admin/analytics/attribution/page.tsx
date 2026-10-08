import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { sql } from "drizzle-orm";
import GosShell from "@/components/GosShell";

export const dynamic = "force-dynamic";

export default async function AttributionPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/admin/analytics/attribution");

  const db = getDb();

  // Signups by UTM source/medium/campaign
  const byUtm = (await db.execute(sql`
    SELECT
      COALESCE("utmSource", '(direct)') AS source,
      COALESCE("utmMedium", '—') AS medium,
      COALESCE("utmCampaign", '—') AS campaign,
      COUNT(*)::int AS signups
    FROM event
    WHERE "eventName" = 'waitlist_signup'
    GROUP BY 1, 2, 3
    ORDER BY signups DESC
    LIMIT 25
  `)) as unknown as { rows: { source: string; medium: string; campaign: string; signups: number }[] };

  // Discord joins by invite_code (props JSON)
  const byInvite = (await db.execute(sql`
    SELECT
      COALESCE((props::json->>'invite_code'), '(none)') AS invite_code,
      COUNT(*)::int AS joins
    FROM event
    WHERE "eventName" = 'discord_join'
    GROUP BY 1
    ORDER BY joins DESC
    LIMIT 25
  `)) as unknown as { rows: { invite_code: string; joins: number }[] };

  // Content clicks by source/campaign
  const byClick = (await db.execute(sql`
    SELECT
      COALESCE("utmSource", '(direct)') AS source,
      COALESCE("utmCampaign", '—') AS campaign,
      COUNT(*)::int AS clicks
    FROM event
    WHERE "eventName" = 'content_click'
    GROUP BY 1, 2
    ORDER BY clicks DESC
    LIMIT 25
  `)) as unknown as { rows: { source: string; campaign: string; clicks: number }[] };

  function emptyMsg(n: number, what: string) {
    return n === 0 ? <p className="gos-muted">No {what} yet.</p> : null;
  }

  return (
    <GosShell title="Analytics" active="admin" subnav="attribution">
      <div className="gos-card">
        <h2>Signups by campaign (UTM)</h2>
        {emptyMsg(byUtm.rows.length, "signups")}
        {byUtm.rows.map((r, i) => (
          <div className="gos-row" key={i}>
            <span>
              <strong>{r.source}</strong>{" "}
              <span className="gos-muted">{r.medium} · {r.campaign}</span>
            </span>
            <span className="gos-badge">{r.signups}</span>
          </div>
        ))}
      </div>

      <div className="gos-card">
        <h2>Discord joins by invite code</h2>
        <p className="gos-muted" style={{ marginTop: -4 }}>
          One invite link per post/article/DM — this answers "which content moves people."
        </p>
        {emptyMsg(byInvite.rows.length, "joins")}
        {byInvite.rows.map((r, i) => (
          <div className="gos-row" key={i}>
            <span><code>{r.invite_code}</code></span>
            <span className="gos-badge">{r.joins}</span>
          </div>
        ))}
      </div>

      <div className="gos-card">
        <h2>Content clicks by source</h2>
        {emptyMsg(byClick.rows.length, "content clicks")}
        {byClick.rows.map((r, i) => (
          <div className="gos-row" key={i}>
            <span>
              <strong>{r.source}</strong>{" "}
              <span className="gos-muted">{r.campaign}</span>
            </span>
            <span className="gos-badge">{r.clicks}</span>
          </div>
        ))}
      </div>
    </GosShell>
  );
}
