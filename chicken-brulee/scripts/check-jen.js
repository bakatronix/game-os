const { Client } = require("pg");
const c = new Client({ host: "db.ryixbzjnyhjwvojhmdcs.supabase.co", port: 5432, user: "postgres", password: "Y0r3kJ3st3r1234", database: "postgres", ssl: { rejectUnauthorized: false } });

async function main() {
  await c.connect();
  const { rows: users } = await c.query(`SELECT id, email, created_at FROM auth.users WHERE email = $1`, ["jen@dragonsnacks.com"]);
  if (!users.length) { console.log("FAIL: User jen@dragonsnacks.com not found"); await c.end(); return; }
  const uid = users[0].id;
  console.log("User:", users[0].email, "| created:", users[0].created_at);

  const { rows: configs } = await c.query(`SELECT channels, staff_prefixes FROM public.bot_configs WHERE user_id = $1`, [uid]);
  if (!configs.length) { console.log("FAIL: No bot configured"); await c.end(); return; }
  const cfg = configs[0];
  console.log("Channels:", JSON.stringify(cfg.channels));
  console.log("Staff prefixes:", cfg.staff_prefixes || "(none)");

  const { rows: scans } = await c.query(`SELECT observations_found, messages_fetched, completed_at FROM public.scans WHERE user_id = $1 ORDER BY completed_at DESC LIMIT 5`, [uid]);
  console.log("Scans:", scans.length);
  scans.forEach(s => console.log(`  ${s.observations_found} obs / ${s.messages_fetched} msgs | ${s.completed_at}`));

  const { rows: obs } = await c.query(`SELECT kind, COUNT(*) FROM public.observations WHERE user_id = $1 GROUP BY kind`, [uid]);
  console.log("Observations:", obs.map(o => `${o.kind}=${o.count}`).join(", ") || "NONE");

  await c.end();
}

main().catch(e => console.error(e.message));
