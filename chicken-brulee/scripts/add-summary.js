const { Client } = require("pg");
const client = new Client({
  host: "db.ryixbzjnyhjwvojhmdcs.supabase.co", port: 5432,
  user: "postgres", password: "Y0r3kJ3st3r1234",
  database: "postgres", ssl: { rejectUnauthorized: false }
});
client.connect().then(async () => {
  await client.query("ALTER TABLE public.scans ADD COLUMN IF NOT EXISTS summary TEXT;");
  await client.query("ALTER TABLE public.scans ADD COLUMN IF NOT EXISTS insights TEXT;");
  console.log("Columns added");
  await client.end();
}).catch(e => console.error(e.message));
