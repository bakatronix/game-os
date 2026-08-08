const { Client } = require("pg");

async function run() {
  const client = new Client({
    host: "db.ryixbzjnyhjwvojhmdcs.supabase.co",
    port: 5432,
    user: "postgres",
    password: "Y0r3kJ3st3r1234",
    database: "postgres",
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  console.log("Connected.");

  const tables = ["public.observations", "public.scans", "public.bot_configs", "public.profiles", "auth.users"];
  for (const t of tables) {
    await client.query(`DELETE FROM ${t}`);
    console.log(`Cleared ${t}`);
  }
  await client.end();
  console.log("All users and data reset.");
}

run().catch(e => { console.error(e.message); process.exit(1); });
