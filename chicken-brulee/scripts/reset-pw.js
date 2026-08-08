const { Client } = require("pg");
const c = new Client({ host:"db.ryixbzjnyhjwvojhmdcs.supabase.co",port:5432,user:"postgres",password:"Y0r3kJ3st3r1234",database:"postgres",ssl:{rejectUnauthorized:false}});

c.connect().then(async () => {
  const { rows } = await c.query("SELECT id FROM auth.users WHERE email = 'jen@dragonsnacks.com'");
  if (!rows.length) { console.log("User not found"); await c.end(); return; }
  const uid = rows[0].id;
  console.log("User ID:", uid);

  // Use Supabase's crypt() to hash password and update
  const hash = await c.query("SELECT crypt('test1234', gen_salt('bf')) AS hash");
  await c.query("UPDATE auth.users SET encrypted_password = $1, email_confirmed_at = now(), updated_at = now() WHERE id = $2", [hash.rows[0].hash, uid]);
  console.log("Password updated to: test1234");
  await c.end();
}).catch(e => console.error(e.message));
