import Link from "next/link";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import GosShell from "@/components/GosShell";
import LocalTime from "@/components/LocalTime";
import { requirePlatformAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

const RANGES = [7, 30, 90] as const;

/** Plain-language names for the events tools send. */
const EVENT_WORDS: Record<string, string> = {
  page_view: "Opened",
  tool_session_start: "Started a session",
  return_session: "Came back",
  inputs_entered: "Entered inputs",
  result_viewed: "Viewed a result",
  result_actioned: "Acted on a result",
  output_action: "Used an output",
  journey_step: "Moved to a step",
  journey_complete: "Finished the flow",
  game_created: "Created a game",
  thesis_revised: "Revised the thesis",
  signals_recorded: "Recorded signals",
  gate_decision: "Made a gate decision",
  analysis_run: "Ran an analysis",
  audit_viewed: "Viewed an audit",
  report_viewed: "Viewed a report",
  report_actioned: "Acted on a report",
};

type Rows<T> = { rows: T[] };

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; tool?: string }>;
}) {
  await requirePlatformAdmin("/admin/analytics/people");
  const q = await searchParams;
  const days = (RANGES as readonly number[]).includes(Number(q.days)) ? Number(q.days) : 30;
  const db = getDb();

  // Tool names from the app registry; "test" events are internal noise.
  const apps = (await db.execute(sql`SELECT id, name FROM app ORDER BY "sortOrder"`)) as unknown as Rows<{ id: string; name: string }>;
  const toolName = new Map(apps.rows.map((a) => [a.id, a.name]));
  toolName.set("game-os", "Game OS dashboard");
  const tool = q.tool && (toolName.has(q.tool) || /^[a-z0-9-]{1,40}$/.test(q.tool)) ? q.tool : null;
  const nameOf = (id: string | null) => (id ? toolName.get(id) || id : "—");

  const since = sql`now() - make_interval(days => ${days})`;
  const toolCond = tool ? sql`AND e."toolId" = ${tool}` : sql``;
  const base = sql`e."toolId" IS DISTINCT FROM 'test' AND e."timestamp" > ${since} ${toolCond}`;

  const [tiles, daily, byTool, people, recent] = await Promise.all([
    db.execute(sql`
      SELECT
        COUNT(DISTINCT e."userId")::int AS people,
        COUNT(*) FILTER (WHERE e."eventName" = 'page_view')::int AS visits,
        COUNT(DISTINCT e."anonId") FILTER (WHERE e."userId" IS NULL)::int AS anon,
        (SELECT COUNT(*)::int FROM "user" u WHERE u."createdAt" > ${since}) AS new_people
      FROM event e WHERE ${base}
    `) as unknown as Promise<Rows<{ people: number; visits: number; anon: number; new_people: number }>>,
    db.execute(sql`
      SELECT to_char(d, 'YYYY-MM-DD') AS day,
             COALESCE(COUNT(DISTINCT e."userId"), 0)::int AS people,
             COALESCE(COUNT(e.id) FILTER (WHERE e."eventName" = 'page_view'), 0)::int AS visits
      FROM generate_series(date_trunc('day', now()) - make_interval(days => ${days - 1}), date_trunc('day', now()), interval '1 day') d
      LEFT JOIN event e ON date_trunc('day', e."timestamp") = d AND e."toolId" IS DISTINCT FROM 'test' ${toolCond}
      GROUP BY d ORDER BY d
    `) as unknown as Promise<Rows<{ day: string; people: number; visits: number }>>,
    db.execute(sql`
      SELECT e."toolId" AS tool,
             COUNT(DISTINCT e."userId")::int AS people,
             COUNT(*) FILTER (WHERE e."eventName" = 'page_view')::int AS visits,
             COUNT(*) FILTER (WHERE e."eventName" = 'tool_session_start')::int AS sessions,
             MAX(e."timestamp") AS last
      FROM event e WHERE ${base} AND e."toolId" IS NOT NULL
      GROUP BY e."toolId" ORDER BY people DESC, visits DESC
    `) as unknown as Promise<Rows<{ tool: string; people: number; visits: number; sessions: number; last: string }>>,
    db.execute(sql`
      SELECT u.id, u.name, u.email, u."createdAt" AS joined,
             (SELECT string_agg(DISTINCT s.name, ', ') FROM membership m JOIN studio s ON s.id = m."studioId" WHERE m."userId" = u.id) AS studios,
             a.tools, COALESCE(a.visits, 0)::int AS visits, COALESCE(a.events, 0)::int AS events, a.last,
             (SELECT MAX(x."timestamp") FROM event x WHERE x."userId" = u.id) AS last_ever
      FROM "user" u
      LEFT JOIN (
        SELECT e."userId", array_agg(DISTINCT e."toolId") FILTER (WHERE e."toolId" IS NOT NULL) AS tools,
               COUNT(*) FILTER (WHERE e."eventName" = 'page_view') AS visits, COUNT(*) AS events, MAX(e."timestamp") AS last
        FROM event e WHERE ${base} AND e."userId" IS NOT NULL GROUP BY e."userId"
      ) a ON a."userId" = u.id
      ORDER BY a.last DESC NULLS LAST, last_ever DESC NULLS LAST, u."createdAt" DESC
    `) as unknown as Promise<Rows<{ id: string; name: string | null; email: string | null; joined: string; studios: string | null; tools: string[] | null; visits: number; events: number; last: string | null; last_ever: string | null }>>,
    // One row per visit: a session in one tool (or, without a session id, an hour).
    db.execute(sql`
      SELECT MIN(e."timestamp") AS at, MAX(e."timestamp") AS until, e."toolId" AS tool,
             array_agg(DISTINCT e."eventName") AS evs, MAX(u.name) AS name, MAX(u.email) AS email,
             bool_or(e."userId" IS NULL) AS anon
      FROM event e LEFT JOIN "user" u ON u.id = e."userId"
      WHERE ${base}
      GROUP BY COALESCE(e."sessionId", COALESCE(e."userId", e."anonId") || to_char(date_trunc('hour', e."timestamp"), 'YYYYMMDDHH24')),
               COALESCE(e."userId", e."anonId"), e."toolId"
      ORDER BY MAX(e."timestamp") DESC LIMIT 40
    `) as unknown as Promise<Rows<{ at: string; until: string; tool: string | null; evs: string[]; name: string | null; email: string | null; anon: boolean }>>,
  ]);

  const t = tiles.rows[0] || { people: 0, visits: 0, anon: 0, new_people: 0 };
  const active = people.rows.filter((p) => p.events > 0);
  const inactive = people.rows.filter((p) => p.events === 0);
  const maxDay = Math.max(1, ...daily.rows.map((d) => d.people));
  const maxToolPeople = Math.max(1, ...byTool.rows.map((r) => r.people));
  const href = (o: { days?: number; tool?: string | null }) => {
    const p = new URLSearchParams();
    p.set("days", String(o.days ?? days));
    const tl = o.tool === undefined ? tool : o.tool;
    if (tl) p.set("tool", tl);
    return `/admin/analytics/people?${p}`;
  };
  const who = (name: string | null, email: string | null) => name || email || "Unknown";
  // What happened in a visit, in plain words, without the routine events every visit sends.
  const ROUTINE = new Set(["page_view", "tool_session_start", "return_session", "journey_step"]);
  const did = (evs: string[]) => {
    const words = evs.filter((e) => !ROUTINE.has(e)).map((e) => EVENT_WORDS[e] || e.replace(/_/g, " "));
    return words.length ? words.join(", ") : "Looked around";
  };
  const mins = (a: string, b: string) => Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000));

  return (
    <GosShell title="Analytics" active="analytics" subnav="people">
      <div className="gos-card">
        <div className="ppl-filters">
          <span className="gos-muted">Last</span>
          {RANGES.map((d) => (
            <Link key={d} href={href({ days: d })} className={`ppl-chip${d === days ? " on" : ""}`}>{d} days</Link>
          ))}
          <span className="gos-muted" style={{ marginLeft: 12 }}>Tool</span>
          <Link href={href({ tool: null })} className={`ppl-chip${!tool ? " on" : ""}`}>All tools</Link>
          {["price-calc", "mobile-calc", "market-scope", "ledger-view", "game-os", "chicken-brulee", "pmf", "steam-page-audit", "seismic"].map((id) => (
            <Link key={id} href={href({ tool: id })} className={`ppl-chip${tool === id ? " on" : ""}`}>{nameOf(id)}</Link>
          ))}
        </div>
        <div className="ppl-tiles">
          <div><b>{t.people}</b><span>signed-in people used {tool ? nameOf(tool) : "Game OS"}</span></div>
          <div><b>{t.visits}</b><span>page visits</span></div>
          <div><b>{t.anon}</b><span>visitors not signed in</span></div>
          <div><b>{t.new_people}</b><span>new Game OS accounts</span></div>
        </div>
        <h2 style={{ marginTop: 18 }}>People per day</h2>
        <div className="ppl-bars" role="img" aria-label={`Signed-in people per day over the last ${days} days`}>
          {daily.rows.map((d) => (
            <div key={d.day} className="ppl-bar" title={`${d.day}: ${d.people} people, ${d.visits} visits`}>
              <span style={{ height: `${Math.max(d.people ? 6 : 0, (d.people / maxDay) * 100)}%` }} />
            </div>
          ))}
        </div>
        <div className="ppl-axis gos-muted"><span>{daily.rows[0]?.day}</span><span>busiest day: {maxDay} {maxDay === 1 ? "person" : "people"}</span><span>today</span></div>
      </div>

      {!tool && (
        <div className="gos-card">
          <h2>Tools</h2>
          <table className="ppl-table">
            <thead><tr><th>Tool</th><th>People</th><th></th><th>Visits</th><th>Sessions</th><th>Last used</th></tr></thead>
            <tbody>
              {byTool.rows.map((r) => (
                <tr key={r.tool}>
                  <td><Link href={href({ tool: r.tool })}>{nameOf(r.tool)}</Link></td>
                  <td className="num">{r.people}</td>
                  <td style={{ width: "28%" }}><span className="ppl-meter"><span style={{ width: `${(r.people / maxToolPeople) * 100}%` }} /></span></td>
                  <td className="num">{r.visits}</td>
                  <td className="num">{r.sessions}</td>
                  <td><LocalTime iso={r.last} /></td>
                </tr>
              ))}
              {byTool.rows.length === 0 && <tr><td colSpan={6} className="gos-muted">No activity in this period.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <div className="gos-card">
        <h2>Who used {tool ? nameOf(tool) : "Game OS"} <span className="gos-muted">({active.length} {active.length === 1 ? "person" : "people"} in the last {days} days)</span></h2>
        <table className="ppl-table">
          <thead><tr><th>Person</th><th>Studio</th><th>Tools</th><th>Visits</th><th style={{ whiteSpace: "nowrap" }}>Last seen</th><th>Joined</th></tr></thead>
          <tbody>
            {active.map((p) => (
              <tr key={p.id}>
                <td><strong>{p.name || "—"}</strong><div className="gos-muted">{p.email}</div></td>
                <td>{p.studios || <span className="gos-muted">—</span>}</td>
                <td>{(p.tools || []).filter((x) => x !== "test").map((x) => nameOf(x)).join(", ")}</td>
                <td className="num">{p.visits}</td>
                <td><LocalTime iso={p.last} /></td>
                <td><LocalTime iso={p.joined} dateOnly /></td>
              </tr>
            ))}
            {active.length === 0 && <tr><td colSpan={6} className="gos-muted">Nobody in this period.</td></tr>}
          </tbody>
        </table>
        {!tool && inactive.length > 0 && (
          <details style={{ marginTop: 12 }}>
            <summary className="gos-muted">{inactive.length} {inactive.length === 1 ? "account" : "accounts"} with no activity in the last {days} days</summary>
            <table className="ppl-table">
              <tbody>
                {inactive.map((p) => (
                  <tr key={p.id}>
                    <td><strong>{p.name || "—"}</strong><div className="gos-muted">{p.email}</div></td>
                    <td>{p.studios || <span className="gos-muted">—</span>}</td>
                    <td className="gos-muted">Last seen: <LocalTime iso={p.last_ever} /></td>
                    <td className="gos-muted">Joined <LocalTime iso={p.joined} dateOnly /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </div>

      <div className="gos-card">
        <h2>Recent visits</h2>
        <p className="gos-muted" style={{ marginTop: -4 }}>One row per visit to a tool, newest first.</p>
        <table className="ppl-table">
          <thead><tr><th>When</th><th>Who</th><th>Tool</th><th>What they did</th></tr></thead>
          <tbody>
            {recent.rows.map((r, i) => (
              <tr key={i}>
                <td style={{ whiteSpace: "nowrap" }}><LocalTime iso={r.at} />{mins(r.at, r.until) > 0 ? <div className="gos-muted">{mins(r.at, r.until)} min</div> : null}</td>
                <td>{r.anon && !r.name ? <span className="gos-muted">Not signed in</span> : who(r.name, r.email)}</td>
                <td>{nameOf(r.tool)}</td>
                <td>{did(r.evs)}</td>
              </tr>
            ))}
            {recent.rows.length === 0 && <tr><td colSpan={4} className="gos-muted">No activity in this period.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="gos-muted">Only Game OS admins can see this page. Times are in your own time zone. Visitors who aren&apos;t signed in are counted but never named.</p>
    </GosShell>
  );
}
