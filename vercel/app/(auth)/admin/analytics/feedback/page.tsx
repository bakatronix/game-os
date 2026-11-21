import GosShell from "@/components/GosShell";
import LocalTime from "@/components/LocalTime";
import { requirePlatformAdmin } from "@/lib/admin";
import CopyEmails from "@/components/CopyEmails";
import { getFeedbackRows, getNotAnswered, summarise, type FeedbackRow } from "@/lib/feedback";

export const dynamic = "force-dynamic";

const money = (n: number | null) => (n === null ? "—" : `$${n.toFixed(2)}`);
const signed = (n: number | null) => (n === null ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : ""}$${Math.abs(n).toFixed(2)}`);
const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);

/** Every question on the form, in the order it's asked, with the answer as text.
 *  "legacy" questions were removed from the form; they show only when an older answer has them. */
const QUESTIONS: { label: string; show: (r: FeedbackRow) => string; legacy?: boolean }[] = [
  { label: "Launch price in mind before the calculator", show: (r) => (r.noPriceBefore ? "Didn’t have a price in mind" : r.priceBefore === null ? "" : money(r.priceBefore)) },
  { label: "Launch price they ended up with", show: (r) => (r.priceAfter === null ? "" : money(r.priceAfter) + (r.priceChange !== null && r.priceChange !== 0 ? ` (${signed(r.priceChange)})` : "")) },
  { label: "What changed their mind", show: (r) => r.whyChanged },
  { label: "How much the calculator helped (1 to 5)", show: (r) => (r.helpedScore === null ? "" : String(r.helpedScore)) },
  { label: "Used Net per Copy, All-In in their funding model", show: (r) => r.netPerCopyUsed },
  { label: "Compared with working it out without the tool", show: (r) => r.timeVsWithout },
  { label: "Would use it again for a real launch", show: (r) => r.useAgain },
  { label: "Why", show: (r) => r.useAgainWhy },
  { label: "What they’d tell another founder", show: (r) => r.testimonial },
  { label: "Steps that gave them trouble (older form)", show: (r) => r.stepsTrouble.join(", "), legacy: true },
  { label: "What got in the way (older form)", show: (r) => r.troubleDetail, legacy: true },
];

/** The multiple-choice questions, for the per-question counts. */
const CHOICES: { label: string; options: string[]; get: (r: FeedbackRow) => string }[] = [
  { label: "How much did the calculator help? (1 = not at all, 5 = a lot)", options: ["1", "2", "3", "4", "5"], get: (r) => (r.helpedScore === null ? "" : String(r.helpedScore)) },
  { label: "Used Net per Copy, All-In in their funding model", options: ["Yes", "Partly", "No"], get: (r) => r.netPerCopyUsed },
  { label: "Compared with working it out without the tool", options: ["Faster", "About the same", "Slower", "Wouldn't have done it without the tool"], get: (r) => r.timeVsWithout },
  { label: "Would use it again for a real launch", options: ["Yes", "Maybe", "No"], get: (r) => r.useAgain },
  { label: "Had a launch price in mind before", options: ["Yes", "No"], get: (r) => (r.noPriceBefore ? "No" : r.priceBefore !== null ? "Yes" : "") },
];

/** Counts per option in the form's order, any unexpected values after, then blanks. */
function tally(values: string[], options: string[]): [string, number][] {
  const m = new Map<string, number>(options.map((o) => [o, 0]));
  let blank = 0;
  values.forEach((v) => { if (!v) blank++; else m.set(v, (m.get(v) || 0) + 1); });
  const out = [...m.entries()];
  if (blank) out.push(["No answer", blank]);
  return out;
}

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
        <h2>How people answered each question</h2>
        <p className="gos-muted">Counts across all {rows.length} answers. &ldquo;No answer&rdquo; means the person left it blank.</p>
        <div className="fb-breakdowns">
          {CHOICES.map((c) => {
            const counts = tally(rows.map(c.get), c.options);
            return (
              <div key={c.label}>
                <h3 className="fb-q">{c.label}</h3>
                {counts.map(([opt, n]) => (
                  <div className="fb-bar" key={opt}>
                    <span>{opt}</span>
                    <span className="ppl-meter"><span style={{ width: `${rows.length ? (n / rows.length) * 100 : 0}%` }} /></span>
                    <b>{n}</b>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <div className="gos-card">
        <h2>Answers</h2>
        {rows.length === 0 ? (
          <p className="gos-muted">No answers yet.</p>
        ) : (
          rows.map((r) => (
            <div className="fb-answer" key={r.userId}>
              <div className="fb-who">
                <b>{r.name || r.accountName || "—"}</b>
                {r.studio ? <> · {r.studio}</> : null}
                <span className="gos-muted"> · {r.email || r.accountEmail || "no email"} · sent <LocalTime iso={r.savedAt} /></span>
              </div>
              <dl className="fb-list">
                {QUESTIONS.filter((q) => !q.legacy || q.show(r)).map((q) => (
                  <div key={q.label}>
                    <dt>{q.label}</dt>
                    <dd>{q.show(r) || <span className="gos-muted">No answer</span>}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))
        )}
      </div>
    </GosShell>
  );
}
