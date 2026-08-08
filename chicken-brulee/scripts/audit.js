const { Client } = require("pg");
const c = new Client({ host:"db.ryixbzjnyhjwvojhmdcs.supabase.co",port:5432,user:"postgres",password:"Y0r3kJ3st3r1234",database:"postgres",ssl:{rejectUnauthorized:false}});

c.connect().then(async () => {
  const u = await c.query("SELECT id FROM auth.users WHERE email = 'test111@test.com'");
  const uid = u.rows[0].id;
  const { rows: obs } = await c.query("SELECT * FROM public.observations WHERE user_id=$1 ORDER BY timestamp",[uid]);
  const { rows: scans } = await c.query("SELECT summary,insights,recommendations,completed_at FROM public.scans WHERE user_id=$1 ORDER BY completed_at DESC LIMIT 1",[uid]);

  console.log("=".repeat(60));
  console.log("DATA QUALITY AUDIT — test111@test.com");
  console.log("=".repeat(60));
  console.log(`Total entries: ${obs.length}`);

  // Kind breakdown
  const kinds = {};
  obs.forEach(o => { kinds[o.kind]=(kinds[o.kind]||0)+1; });
  console.log("Kinds:", JSON.stringify(kinds));

  // Classification quality
  const themes = {}, sevs = {};
  obs.filter(o=>o.kind==="observation").forEach(o => {
    themes[o.theme]=(themes[o.theme]||0)+1;
    sevs[o.severity]=(sevs[o.severity]||0)+1;
  });
  console.log("\nTHEMES:");
  Object.entries(themes).sort((a,b)=>b[1]-a[1]).forEach(([k,v]) => console.log(`  ${k}: ${v} (${(v/obs.filter(o=>o.kind==="observation").length*100).toFixed(0)}%)`));
  console.log("\nSEVERITY:", JSON.stringify(sevs));

  // Last scan output
  const scan = scans[0];
  console.log("\nLAST SCAN:", scan?.completed_at);
  console.log("  Summary:", (scan?.summary||"").slice(0,200));
  console.log("  Insights:", (scan?.insights||"").slice(0,200));
  console.log("  Recommendations:", (scan?.recommendations||"").slice(0,200));

  // Critical items
  const criticals = obs.filter(o => o.severity === "Critical");
  console.log(`\nCRITICAL ITEMS: ${criticals.length}`);
  criticals.slice(0,5).forEach(o => console.log(`  [${(o.timestamp+"").slice(0,10)}] ${o.speaker}: "${(o.excerpt||"").slice(0,100)}"`));

  // Staff/player ratio
  const players = new Set(obs.filter(o=>o.kind!=="staff").map(o=>o.speaker));
  const staffers = new Set(obs.filter(o=>o.kind==="staff").map(o=>o.speaker));
  console.log(`\nPlayers: ${players.size} | Staff: ${staffers.size}`);
  if (staffers.size === 0) console.log("  ISSUE: Zero staff detected — check staff_prefixes in Settings");
  if (themes["General Feedback"] > obs.filter(o=>o.kind==="observation").length * 0.5) console.log(`  ISSUE: ${(themes["General Feedback"]/obs.filter(o=>o.kind==="observation").length*100).toFixed(0)}% are "General Feedback" — add Game Mechanics in Settings`);

  await c.end();
}).catch(e => console.error(e.message));
