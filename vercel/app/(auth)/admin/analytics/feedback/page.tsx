import GosShell from "@/components/GosShell";
import LocalTime from "@/components/LocalTime";
import { requirePlatformAdmin } from "@/lib/admin";
import { getFeedbackRows, summarise } from "@/lib/feedback";

export const dynamic = "force-dynamic";

const money = (n: number | null) => (n === null ? "—" : `$${n.toFixed(2)}`);
const signed = (n: number | null) => (n === null ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : ""}$${Math.abs(n).toFixed(2)}`);
const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);

export default async function FeedbackPage() {
  await requirePlatformAdmin("/admin/analytics/feedback");
  const rows = await getFeedbackRows();
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
