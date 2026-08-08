const { Client } = require("pg");
const fs = require("fs");
const sql = fs.readFileSync(__dirname + "/../sql/schema.sql", "utf-8");

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
  console.log("Connected to Supabase PostgreSQL");
  await client.query(sql);
  console.log("Schema created successfully");
  await client.end();
}

run().catch(e => { console.error(e.message); process.exit(1); });
