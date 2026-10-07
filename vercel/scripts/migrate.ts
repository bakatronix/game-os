import { neon } from "@neondatabase/serverless";

/**
 * One-shot migration: creates the Auth.js + Game OS tables if they do not
 * exist. Run with: DATABASE_URL=... npm run db:migrate
 */
const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS "user" (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT UNIQUE,
      "emailVerified" TIMESTAMP,
      image TEXT,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS "account" (
      "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      provider TEXT NOT NULL,
      "providerAccountId" TEXT NOT NULL,
      refresh_token TEXT,
      access_token TEXT,
      expires_at INTEGER,
      token_type TEXT,
      scope TEXT,
      id_token TEXT,
      session_state TEXT,
      PRIMARY KEY (provider, "providerAccountId")
    )`,
    `CREATE TABLE IF NOT EXISTS "session" (
      "sessionToken" TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      expires TIMESTAMP NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS "verificationToken" (
      identifier TEXT NOT NULL,
      token TEXT NOT NULL,
      expires TIMESTAMP NOT NULL,
      PRIMARY KEY (identifier, token)
    )`,
    `CREATE TABLE IF NOT EXISTS "studio" (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      "ownerId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS "membership" (
      "studioId" UUID NOT NULL REFERENCES "studio"(id) ON DELETE CASCADE,
      "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'owner',
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      PRIMARY KEY ("studioId", "userId")
    )`,
    `CREATE TABLE IF NOT EXISTS "game" (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "studioId" UUID NOT NULL REFERENCES "studio"(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      "steamAppId" TEXT,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now()
    )`,
  ];

  for (const s of statements) {
    await sql(s);
  }
  console.log("Migration complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
