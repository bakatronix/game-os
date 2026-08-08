const { Client } = require("pg");
const c = new Client({ host:"db.ryixbzjnyhjwvojhmdcs.supabase.co",port:5432,user:"postgres",password:"Y0r3kJ3st3r1234",database:"postgres",ssl:{rejectUnauthorized:false}});
c.connect().then(async () => {
  await c.query("ALTER TABLE public.scans ADD COLUMN IF NOT EXISTS recommendations TEXT");
  console.log("Done");
  await c.end();
}).catch(e => console.error(e.message));
