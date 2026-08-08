const { Client } = require("pg");
const c = new Client({ host:"db.ryixbzjnyhjwvojhmdcs.supabase.co",port:5432,user:"postgres",password:"Y0r3kJ3st3r1234",database:"postgres",ssl:{rejectUnauthorized:false}});
c.connect().then(async () => {
  await c.query("ALTER TABLE public.bot_configs ADD COLUMN IF NOT EXISTS role_mapping JSONB DEFAULT '{}'::jsonb");
  console.log("role_mapping column added");
  await c.end();
}).catch(e => console.error(e.message));
