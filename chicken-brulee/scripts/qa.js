const { Client } = require("pg");
const client = new Client({
  host: "db.ryixbzjnyhjwvojhmdcs.supabase.co", port: 5432,
  user: "postgres", password: "Y0r3kJ3st3r1234",
  database: "postgres", ssl: { rejectUnauthorized: false }
});

function fmtTs(iso) {
  const d = new Date(iso);
  const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${d.getUTCDate()} ${m[d.getUTCMonth()]} ${d.getUTCFullYear()} · ${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}`;
}

function getSentiment(o) {
  const s = o.signal || "";
  if (/positive/i.test(s) || o.severity === "Preserve") return 1;
  if (/negative|blocker|defect|friction/i.test(s) || o.severity === "Critical" || o.severity === "High") return -1;
  return 0;
}

// Reproduction of computeSessions
function computeSessions(allRows) {
  const announcements = allRows.filter(r => {
    const txt = String(r.excerpt || r.paraphrase || r.note || "").toLowerCase();
    return /playtest ?#?\d|# ?playtest|update is live|go play|build.*live|now live|deploy|shipped|released/i.test(txt);
  }).sort((a,b) => a._ts - b._ts);

  const markers = announcements.map(a => {
    const txt = String(a.excerpt || a.paraphrase || a.note || "");
    const numMatch = txt.match(/playtest ?#?(\d+)/i);
    return {
      _ts: a._ts || new Date(a.timestamp||a.iso||0).getTime(), isMarker: true,
      ptNum: numMatch ? parseInt(numMatch[1]) : null,
      label: txt.slice(0, 60)
    };
  });
  const combined = [...allRows.map(r => ({ ...r, _ts: r._ts || new Date(r.timestamp||r.iso||0).getTime() })), ...markers].sort((a,b) => a._ts - b._ts);
  const sessions = [];
  let cur = null, lastPtNum = -1;
  combined.forEach(r => {
    const isNewPlaytest = r.isMarker && r.ptNum !== null && r.ptNum !== lastPtNum;
    if (isNewPlaytest || (!cur && r.isMarker) || !cur) {
      lastPtNum = r.isMarker && r.ptNum !== null ? r.ptNum : lastPtNum;
      const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      const d = new Date(r._ts);
      const label = `Playtest ${lastPtNum >= 0 ? lastPtNum : sessions.length + 1} — ${m[d.getMonth()]} ${d.getDate()}`;
      cur = { label, rows: [], lastTs: r._ts, context: r.isMarker ? r.label : "" };
      sessions.push(cur);
    }
    if (!r.isMarker) { cur.rows.push(r); cur.lastTs = r._ts; }
  });

  const valid = sessions.filter(s => s.rows.length >= 1);
  const result = valid.length ? valid : (sessions.length ? sessions : []);
  result.forEach((s, i) => {
    const end = new Date(s.lastTs);
    const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    s.label = `Playtest ${i+1} — ${m[new Date(s.rows[0]?._ts || s.lastTs).getMonth()]} ${new Date(s.rows[0]?._ts || s.lastTs).getDate()}–${m[end.getMonth()]} ${end.getDate()}`;
    if (s.context) s.label += ` · "${s.context.slice(0,50)}"`;
  });
  return result.length ? result : (allRows.length ? [{ label: "All activity", rows: allRows, lastTs: allRows[allRows.length-1]?._ts || 0 }] : []);
}

async function qa() {
  await client.connect();
  const { rows: users } = await client.query(`SELECT id FROM auth.users WHERE email = 'test111@test.com'`);
  if (!users.length) { console.log("FAIL: No user"); return; }
  const uid = users[0].id;

  const { rows: obs } = await client.query(`SELECT * FROM public.observations WHERE user_id = $1 ORDER BY timestamp`, [uid]);
  const { rows: scans } = await client.query(`SELECT * FROM public.scans WHERE user_id = $1 ORDER BY completed_at DESC`, [uid]);

  console.log("=".repeat(60));
  console.log("CHICKEN BRÛLÉE — QA REPORT");
  console.log("=".repeat(60));
  console.log(`User: test111@test.com (${uid.slice(0,8)})`);
  console.log(`Scans: ${scans.length} | Observations: ${obs.length}`);
  console.log("");

  // Breakdown
  const byKind = {};
  obs.forEach(o => { byKind[o.kind] = (byKind[o.kind]||0)+1; });
  console.log("BY KIND:", Object.entries(byKind).map(([k,v]) => `${k}=${v}`).join(", "));

  const observers = obs.filter(o => o.kind === "observation");
  const staff = obs.filter(o => o.kind === "staff");
  const eng = obs.filter(o => o.kind === "engagement");

  console.log(`Observations: ${observers.length} | Staff: ${staff.length} | Engagement: ${eng.length}`);
  console.log(`Contributors: ${new Set(observers.map(o=>o.speaker)).size}`);
  console.log("");

  // Severity
  const sev = {};
  observers.forEach(o => { sev[o.severity] = (sev[o.severity]||0)+1; });
  console.log("SEVERITY:", Object.entries(sev).map(([k,v]) => `${k}=${v}`).join(", "));

  // Themes
  const themes = {};
  observers.forEach(o => { themes[o.theme] = (themes[o.theme]||0)+1; });
  console.log("\nTOP THEMES:");
  Object.entries(themes).sort((a,b) => b[1]-a[1]).slice(0,8).forEach(([t,c]) => console.log(`  ${t}: ${c}`));

  // Sentiment
  const sents = observers.map(o => getSentiment(o));
  const pos = sents.filter(s=>s>0).length, neg = sents.filter(s=>s<0).length, neu = sents.filter(s=>s===0).length;
  console.log(`\nSENTIMENT: +${pos} / ${neu} neutral / -${neg} | Avg: ${(sents.reduce((a,b)=>a+b,0)/sents.length).toFixed(2)}`);

  // Sessions
  const rows = obs.map(o => ({ ...o, _ts: new Date(o.timestamp).getTime() }));
  const sessions = computeSessions(rows);
  console.log(`\nPLAYTEST SESSIONS: ${sessions.length}`);
  sessions.forEach((s, i) => {
    const oCount = s.rows.filter(r => r.kind === "observation").length;
    console.log(`  ${s.label}`);
    console.log(`    Entries: ${s.rows.length} (${oCount} obs, ${s.rows.filter(r=>r.kind==="engagement").length} eng, ${s.rows.filter(r=>r.kind==="staff").length} staff)`);
    console.log(`    Date range: ${s.rows[0]?.timestamp?.slice(0,10) || "?"} to ${new Date(s.lastTs).toISOString().slice(0,10)}`);
  });

  // Announcement markers found
  const markers = obs.filter(o => {
    const txt = String(o.excerpt || "").toLowerCase();
    return /playtest ?#?\d|# ?playtest|update is live|go play|now live/i.test(txt);
  });
  console.log(`\nANNOUNCEMENT MARKERS: ${markers.length}`);
  markers.forEach(m => console.log(`  [${m.timestamp.slice(0,10)}] ${m.speaker}: "${(m.excerpt||"").slice(0,80)}"`));

  // Issues found
  console.log("\nISSUES:");
  if (observers.length === 0) console.log("  WARN: No observations found! Scanner may not be detecting player messages.");
  if (themes["General Feedback"] > observers.length * 0.5) console.log(`  WARN: ${themes["General Feedback"]}/${observers.length} observations are "General Feedback" — classification too generic.`);
  if (!staff.length) console.log("  WARN: No staff messages detected. Check staff_prefixes in Settings.");
  if (sessions.length > markers.length) console.log("  WARN: More sessions than markers — gap fallback creating fake sessions.");
  if (scans.length > 2 && scans.slice(0, -1).every(s => s.observations_found === 0)) console.log("  WARN: Recent scans return 0 observations — dedup working but no new content.");

  await client.end();
}

qa().catch(e => { console.error(e.message); process.exit(1); });
