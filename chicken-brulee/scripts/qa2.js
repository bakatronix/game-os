const { Client } = require("pg");
const client = new Client({ host: "db.ryixbzjnyhjwvojhmdcs.supabase.co", port: 5432, user: "postgres", password: "Y0r3kJ3st3r1234", database: "postgres", ssl: { rejectUnauthorized: false } });

function computeSessions(allRows) {
  const announcements = allRows.filter(r => {
    const txt = String(r.excerpt || r.paraphrase || r.note || "");
    return /playtest\s*#?\d/i.test(txt);
  }).sort((a,b) => a._ts - b._ts);

  if (!announcements.length) return [{ label: "All activity", rows: allRows }];

  const markers = announcements.map(a => {
    const txt = String(a.excerpt || a.paraphrase || a.note || "");
    const numMatch = txt.match(/playtest\s*#?(\d+)/i);
    let ptNum = numMatch ? parseInt(numMatch[1]) : null;
    if (ptNum && (ptNum > 100 || ptNum < 1)) ptNum = null;
    return { _ts: a._ts, isMarker: true, ptNum, label: txt.slice(0,60) };
  });

  const combined = [...allRows.map(r => ({ ...r, isMarker: false })), ...markers].sort((a,b) => a._ts - b._ts);

  const raw = []; let cur = null;
  combined.forEach(r => {
    if (r.isMarker || !cur) { cur = { ptNum: r.isMarker ? r.ptNum : null, rows: [], lastTs: r._ts }; raw.push(cur); }
    if (!r.isMarker) { cur.rows.push(r); cur.lastTs = r._ts; }
  });

  const merged = [];
  raw.forEach(s => {
    const last = merged[merged.length - 1];
    if (last && s.ptNum !== null && last.ptNum === s.ptNum) { last.rows.push(...s.rows); last.lastTs = s.lastTs; }
    else merged.push(s);
  });

  const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  merged.forEach(s => {
    const start = new Date(s.rows[0]?._ts || s.lastTs), end = new Date(s.lastTs);
    s.label = s.ptNum !== null ? `Playtest ${s.ptNum} — ${m[start.getMonth()]} ${start.getDate()}–${m[end.getMonth()]} ${end.getDate()}` : `Session — ${m[start.getMonth()]} ${start.getDate()}–${m[end.getMonth()]} ${end.getDate()}`;
  });
  return merged.filter(s => s.rows.length >= 1);
}

async function main() {
  await client.connect();
  const { rows: users } = await client.query(`SELECT id FROM auth.users WHERE email = 'test111@test.com'`);
  const uid = users[0].id;
  const { rows: obs } = await client.query(`SELECT * FROM public.observations WHERE user_id = $1 ORDER BY timestamp`, [uid]);
  const rows = obs.map(o => ({ ...o, _ts: new Date(o.timestamp).getTime() }));
  
  const sessions = computeSessions(rows);
  console.log(`${sessions.length} sessions:`);
  sessions.forEach(s => console.log(`  ${s.label} — ${s.rows.length} entries`));
  await client.end();
}

main().catch(e => console.error(e.message));
