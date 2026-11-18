import GosShell from "@/components/GosShell";
import LocalTime from "@/components/LocalTime";
import { requirePlatformAdmin } from "@/lib/admin";
import CopyEmails from "@/components/CopyEmails";
import { getFeedbackRows, getNotAnswered, summarise } from "@/lib/feedback";

export const dynamic = "force-dynamic";

const money = (n: number | null) => (n === null ? "—" : `$${n.toFixed(2)}`);
const signed = (n: number | null) => (n === null ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : ""}$${Math.abs(n).toFixed(2)}`);
const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);

export default async function FeedbackPage() {
  await requirePlatformAdmin("/admin/analytics/feedback");
  const [rows, waiting] = await Promise.all([getFeedbackRows(), getNotAnswered()]);
  const s = summarise(rows);

  return (
    <GosShell title="Analytics" active="analytics" subnav="feedback">
      <div className="gos-card">
        <h2>Price Calculator feedback</h2>
        <p className="gos-muted">
          From the form at /game-os/pci/feedback. One answer per person; sending again replaces it.{" "}
          <a href="/admin/analytics/feedback/csv">Download CSV</a>
        </p>
        <div className="ppl-tiles">
          <div><b>{s.responses}</b><span>founders answered</span></div>
          <div><b>{waiting.length}</b><span>used the calculator but haven&rsquo;t answered</span></div>
          <div><b>{pct(s.changedShare)}</b><span>changed their launch price ({s.changed} of {s.comparable} who gave both prices)</span></div>
          <div><b>{signed(s.avgChange)}</b><span>average change among those who changed (average size {money(s.avgAbsChange)})</span></div>
          <div><b>{s.avgHelp === null ? "—" : s.avgHelp.toFixed(1)}</b><span>average help score, 1 to 5</span></div>
        </div>
        <p className="gos-muted" style={{ marginTop: 12 }}>
          {s.noPriceBefore} had no price in mind before · {s.usedNet} used Net per Copy in their model · {s.useAgainYes} would use it again
        </p>
        {s.trouble.length > 0 && (
          <p className="gos-muted">
            Steps that gave people trouble: {s.trouble.map(([k, n]) => `${k} (${n})`).join(", ")}
          </p>
        )}
      </div>

      <div className="gos-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <h2>Not answered yet</h2>
          <CopyEmails emails={waiting.map((w) => w.email).filter((e): e is string => !!e)} />
        </div>
        <p className="gos-muted">
          Everyone who has opened the Price Calculator while signed in and hasn&rsquo;t sent the form, most recent first.
          People who used it without signing in can&rsquo;t be listed.
        </p>
        {waiting.length === 0 ? (
          <p className="gos-muted">Everyone who has used the calculator has answered.</p>
        ) : (
          <table className="ppl-table">
            <thead>
              <tr><th>Name</th><th>Studio</th><th>Last used</th><th>Sessions</th></tr>
            </thead>
            <tbody>
              {waiting.map((w) => (
                <tr key={w.userId}>
                  <td>{w.name || "—"}<br /><span className="gos-muted">{w.email}</span></td>
                  <td>{w.studios || "—"}</td>
                  <td><LocalTime iso={w.lastUsed} /></td>
                  <td className="num">{w.sessions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="gos-card">
        <h2>Answers</h2>
        {rows.length === 0 ? (
          <p className="gos-muted">No answers yet.</p>
        ) : (
          <table className="ppl-table">
            <thead>
              <tr><th>Sent</th><th>Name</th><th>Studio or game</th><th>Before</th><th>After</th><th>Help</th><th>Comment</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.userId}>
                  <td><LocalTime iso={r.savedAt} /></td>
                  <td>{r.name}<br /><span className="gos-muted">{r.email}</span></td>
                  <td>{r.studio}</td>
                  <td className="num">{r.noPriceBefore ? "None" : money(r.priceBefore)}</td>
                  <td className="num">{money(r.priceAfter)}</td>
                  <td className="num">{r.helpedScore ?? "—"}</td>
                  <td style={{ maxWidth: 360 }}>{r.testimonial}{r.troubleDetail ? <><br /><span className="gos-muted">Trouble: {r.troubleDetail}</span></> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </GosShell>
  );
}
