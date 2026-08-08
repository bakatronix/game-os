const { Client } = require("pg");
const c = new Client({ host:"db.ryixbzjnyhjwvojhmdcs.supabase.co",port:5432,user:"postgres",password:"Y0r3kJ3st3r1234",database:"postgres",ssl:{rejectUnauthorized:false}});

function computeSessions(allRows) {
  const announcements = allRows.filter(r => {
    const txt = String(r.excerpt || r.paraphrase || r.note || "");
    const isHeading = /^#/.test(txt.trim());
    const hasNumber = /(?:playtest|slice)\s*#?\s*(\d+)/i.test(txt);
    const isBuildNotice = /update is live|go play|deploy|shipped|released|now live|build.*uploaded|build.*ready/i.test(txt);
    return (isHeading && hasNumber) || isBuildNotice;
  }).sort((a,b) => a._ts - b._ts);

  if (!announcements.length) return [{ label: "All activity", rows: allRows }];

  const seenNums = new Set();
  const markers = [];
  announcements.forEach(a => {
    const txt = String(a.excerpt || a.paraphrase || a.note || "");
    const numMatch = txt.match(/(?:playtest|slice)\s*#?\s*(\d+)/i);
    let ptNum = numMatch ? parseInt(numMatch[1]) : null;
    if (ptNum && ptNum > 0 && ptNum < 100 && !seenNums.has(ptNum)) {
      seenNums.add(ptNum);
      markers.push({ _ts: a._ts, isMarker: true, ptNum, label: txt.slice(0,60) });
    }
  });

  const combined = [...allRows.map(r => ({ ...r, isMarker: false })), ...markers].sort((a,b) => a._ts - b._ts);

  const raw = []; let cur = null;
  combined.forEach(r => {
    if (r.isMarker || !cur) { cur = { ptNum: r.isMarker ? r.ptNum : null, rows: [], lastTs: r._ts }; raw.push(cur); }
    if (!r.isMarker) { cur.rows.push(r); cur.lastTs = r._ts; }
  });

  const merged = [];
  raw.forEach(s => {
    if (s.ptNum !== null) {
      const existing = merged.find(m => m.ptNum === s.ptNum);
      if (existing) { existing.rows.push(...s.rows); if (s.lastTs > existing.lastTs) existing.lastTs = s.lastTs; return; }
    }
    merged.push(s);
  });
  merged.sort((a,b) => (a.rows[0]?._ts||0) - (b.rows[0]?._ts||0));

  const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  merged.forEach(s => {
    const timestamps = s.rows.map(r => r._ts).filter(Boolean);
    const start = new Date(Math.min(...timestamps)), end = new Date(Math.max(...timestamps));
    s.label = s.ptNum !== null ? `Playtest ${s.ptNum} — ${m[start.getMonth()]} ${start.getDate()}–${m[end.getMonth()]} ${end.getDate()}` : `Session — ${m[start.getMonth()]} ${start.getDate()}–${m[end.getMonth()]} ${end.getDate()}`;
  });
  return merged.filter(s => s.rows.length >= 1);
}

c.connect().then(async () => {
  const uid = (await c.query("SELECT id FROM auth.users WHERE email = 'test111@test.com'")).rows[0].id;
  const { rows: obs } = await c.query("SELECT * FROM public.observations WHERE user_id=$1 ORDER BY timestamp",[uid]);
  const rows = obs.map(o => ({ ...o, _ts: new Date(o.timestamp).getTime() }));
  
  const sessions = computeSessions(rows);
  console.log(`${sessions.length} sessions:`);
  sessions.forEach(s => console.log(`  ${s.label} — ${s.rows.length} entries`));
  await c.end();
}).catch(e => console.error(e.message));
