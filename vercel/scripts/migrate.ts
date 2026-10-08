import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env.local") });

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
    `ALTER TABLE "studio" ADD COLUMN IF NOT EXISTS "isPersonal" INTEGER NOT NULL DEFAULT 0`,
    `CREATE TABLE IF NOT EXISTS "game" (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "studioId" UUID NOT NULL REFERENCES "studio"(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      "steamAppId" TEXT,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS "invitation" (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "studioId" UUID NOT NULL REFERENCES "studio"(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      token TEXT NOT NULL UNIQUE,
      "invitedBy" TEXT REFERENCES "user"(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      "expiresAt" TIMESTAMP,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS "app" (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      url TEXT,
      access TEXT NOT NULL DEFAULT 'public',
      "minRole" TEXT,
      version TEXT,
      icon TEXT,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS "event" (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "eventName" TEXT NOT NULL,
      "timestamp" TIMESTAMP NOT NULL DEFAULT now(),
      "anonId" TEXT,
      "userId" TEXT REFERENCES "user"(id) ON DELETE SET NULL,
      "sessionId" TEXT,
      "toolId" TEXT,
      "appVersion" TEXT,
      "utmSource" TEXT,
      "utmMedium" TEXT,
      "utmCampaign" TEXT,
      referrer TEXT,
      props TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS event_name_ts_idx ON "event" ("eventName", "timestamp")`,
    `CREATE INDEX IF NOT EXISTS event_anon_idx ON "event" ("anonId")`,
    `CREATE INDEX IF NOT EXISTS event_user_idx ON "event" ("userId")`,
    `CREATE TABLE IF NOT EXISTS "pii" (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "userId" TEXT REFERENCES "user"(id) ON DELETE CASCADE,
      "anonId" TEXT,
      email TEXT NOT NULL,
      "studioName" TEXT,
      "devStage" TEXT,
      "gameLink" TEXT,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS "design_partner" (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "userId" TEXT REFERENCES "user"(id) ON DELETE SET NULL,
      "studioName" TEXT NOT NULL,
      contact TEXT,
      game TEXT,
      "steamPageUrl" TEXT,
      "devStage" TEXT,
      "recruitedVia" TEXT,
      "dateJoined" TIMESTAMP DEFAULT now(),
      "toolsUsed" TEXT,
      "quotePermission" TEXT DEFAULT 'n',
      status TEXT DEFAULT 'active',
      validating TEXT,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS "discord_snapshot" (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "snapshotDate" TIMESTAMP NOT NULL DEFAULT now(),
      "memberCount" INTEGER,
      "newJoins" INTEGER,
      leaves INTEGER,
      "activeMembers" INTEGER,
      "messagesCount" INTEGER,
      "playNightAttendance" INTEGER,
      granularity TEXT DEFAULT 'daily'
    )`,
    // Seed the app registry with the tools we serve today (public-first).
    `INSERT INTO "app" (id, name, path, access, version, "sortOrder") VALUES
      ('dashboard', 'Dashboard', '/game-os', 'authenticated', '1', 0),
      ('price-calc', 'Pricing Calculator', '/game-os/price-calc', 'public', '1', 1),
      ('chicken-brulee', 'Chicken Brûlée', '/game-os/chicken-brulee', 'public', '1', 2),
      ('pmf', 'PMF Analyzer', '/game-os/PMF', 'public', '1', 3),
      ('seismic', 'Seismic', '/seismic', 'public', '1', 4)
    ON CONFLICT (id) DO NOTHING`,
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
