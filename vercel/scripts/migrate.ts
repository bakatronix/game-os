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
    // --- Shared game spine (additive) ---
    `ALTER TABLE "game" ADD COLUMN IF NOT EXISTS genre TEXT`,
    `ALTER TABLE "game" ADD COLUMN IF NOT EXISTS stage INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE "game" ADD COLUMN IF NOT EXISTS "createdBy" TEXT REFERENCES "user"(id) ON DELETE SET NULL`,
    `CREATE INDEX IF NOT EXISTS game_studio_idx ON "game" ("studioId")`,
    `CREATE TABLE IF NOT EXISTS "thesis_version" (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "gameId" UUID NOT NULL REFERENCES "game"(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      audience TEXT,
      hook TEXT,
      "compSet" TEXT,
      "priceHypothesis" TEXT,
      targets TEXT,
      "changedFields" TEXT,
      source TEXT,
      note TEXT,
      "createdBy" TEXT REFERENCES "user"(id) ON DELETE SET NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      UNIQUE ("gameId", version)
    )`,
    `CREATE TABLE IF NOT EXISTS "signal" (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "gameId" UUID NOT NULL REFERENCES "game"(id) ON DELETE CASCADE,
      "toolId" TEXT NOT NULL,
      key TEXT NOT NULL,
      label TEXT,
      value DOUBLE PRECISION,
      unit TEXT,
      meta TEXT,
      "observedAt" TIMESTAMP NOT NULL DEFAULT now(),
      "createdBy" TEXT REFERENCES "user"(id) ON DELETE SET NULL
    )`,
    `CREATE INDEX IF NOT EXISTS signal_game_key_idx ON "signal" ("gameId", key, "observedAt" DESC)`,
    // Chicken Brûlée (Discord playtest scanner), moved off Supabase.
    `CREATE TABLE IF NOT EXISTS "playtest_config" (
      "gameId" UUID PRIMARY KEY REFERENCES "game"(id) ON DELETE CASCADE,
      "botToken" TEXT,
      channels TEXT,
      "staffPrefixes" TEXT,
      "roleMapping" TEXT,
      "gameContext" TEXT,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedBy" TEXT REFERENCES "user"(id) ON DELETE SET NULL
    )`,
    `CREATE TABLE IF NOT EXISTS "playtest_scan" (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "gameId" UUID NOT NULL REFERENCES "game"(id) ON DELETE CASCADE,
      "channelIds" TEXT,
      "messagesFetched" INTEGER DEFAULT 0,
      "observationsFound" INTEGER DEFAULT 0,
      summary TEXT,
      insights TEXT,
      recommendations TEXT,
      error TEXT,
      "startedAt" TIMESTAMP NOT NULL DEFAULT now(),
      "completedAt" TIMESTAMP,
      "createdBy" TEXT REFERENCES "user"(id) ON DELETE SET NULL
    )`,
    `CREATE INDEX IF NOT EXISTS playtest_scan_game_idx ON "playtest_scan" ("gameId", "startedAt" DESC)`,
    `CREATE TABLE IF NOT EXISTS "playtest_observation" (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "gameId" UUID NOT NULL REFERENCES "game"(id) ON DELETE CASCADE,
      "scanId" UUID REFERENCES "playtest_scan"(id) ON DELETE SET NULL,
      "messageId" TEXT NOT NULL,
      "timestamp" TIMESTAMP NOT NULL,
      "channelId" TEXT NOT NULL,
      "channelName" TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'observation',
      speaker TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'Player',
      theme TEXT NOT NULL,
      signal TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'Medium',
      excerpt TEXT NOT NULL,
      paraphrase TEXT,
      UNIQUE ("gameId", "messageId")
    )`,
    `CREATE INDEX IF NOT EXISTS playtest_obs_game_ts_idx ON "playtest_observation" ("gameId", "timestamp" DESC)`,
    `CREATE TABLE IF NOT EXISTS "tool_state" (
      "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      "toolId" TEXT NOT NULL,
      data TEXT NOT NULL,
      "savedAt" TIMESTAMP NOT NULL DEFAULT now(),
      PRIMARY KEY ("userId", "toolId")
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
    `ALTER TABLE "app" ADD COLUMN IF NOT EXISTS "group" TEXT NOT NULL DEFAULT 'tools'`,
    `ALTER TABLE "app" ADD COLUMN IF NOT EXISTS "anchor" TEXT`,
    `ALTER TABLE "app" ADD COLUMN IF NOT EXISTS "stage" TEXT`,
    `ALTER TABLE "app" ADD COLUMN IF NOT EXISTS "toolName" TEXT`,
    `ALTER TABLE "app" ADD COLUMN IF NOT EXISTS "cxoQuestion" TEXT`,
    `ALTER TABLE "app" ADD COLUMN IF NOT EXISTS "description" TEXT`,
    `ALTER TABLE "app" ADD COLUMN IF NOT EXISTS "status" TEXT`,
    `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "platformRole" TEXT`,
    `ALTER TABLE "app" ADD COLUMN IF NOT EXISTS "statusLabel" TEXT`,
    `ALTER TABLE "app" ADD COLUMN IF NOT EXISTS "metrics" TEXT`,
    `ALTER TABLE "app" ADD COLUMN IF NOT EXISTS "spark" TEXT`,
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
    // Seed the app registry (public-first) — all within the Game OS universe.
    `INSERT INTO "app" (id, name, path, access, version, "sortOrder", "group") VALUES
      ('dashboard', 'Dashboard', '/game-os', 'authenticated', '1', 0, 'cxo'),
      ('price-calc', 'Pricing Calculator', '/game-os/price-calc', 'public', '1', 1, 'cxo'),
      ('chicken-brulee', 'Chicken Brûlée', '/game-os/chicken-brulee', 'public', '1', 2, 'cxo'),
      ('pmf', 'PMF Analyzer', '/game-os/PMF', 'public', '1', 3, 'cxo'),
      ('seismic', 'Seismic', '/seismic', 'public', '1', 4, 'cxo'),
      ('steam-page-audit', 'Steam Page Audit', '/game-os/steam-page-audit', 'public', '1', 10, 'tools')
    ON CONFLICT (id) DO NOTHING`,
    // Mobile Calculator: its own tool, beside the Steam pricing calculator.
    `INSERT INTO "app" (id, name, path, access, version, "sortOrder", "group") VALUES
      ('mobile-calc', 'Mobile Calculator', '/game-os/mobile-calc', 'authenticated', '1', 5, 'cxo')
    ON CONFLICT (id) DO NOTHING`,
    `UPDATE "app" SET
       "toolName"='Mobile Calculator', "cxoQuestion"='Does an install pay for itself?',
       "description"='Unit economics and funding runway for a mobile game: lifetime value per install, the cost per install you can afford, payback, and how long the round lasts in a stress, base and upside case.',
       "status"='nodata', "statusLabel"='No data',
       "metrics"='[{"label":"LTV per install","value":"—"},{"label":"Max CPI at target","value":"—"},{"label":"Runway","value":"—"}]',
       "spark"='{"type":"line","values":[0.10,0.30,0.41,0.49,0.55,0.61,0.66,0.70]}'
     WHERE id='mobile-calc'`,
    // Seismic's tools + shared objects, surfaced as Game OS widgets.
    `INSERT INTO "app" (id, name, path, access, version, "sortOrder", "group", "anchor", "stage") VALUES
      ('market-scope',        'Market Scope',        '/seismic', 'public', '1', 11, 'tools', '?tool=market-scope',     'Concept'),
      ('thesis-builder',      'Thesis Builder',      '/seismic', 'public', '1', 12, 'tools', '?tool=thesis-builder',   'Concept'),
      ('audience-map',        'Audience Map',        '/seismic', 'public', '1', 13, 'tools', '?tool=audience-map',     'Pre-production'),
      ('page-engine',         'Page Engine',         '/seismic', 'public', '1', 14, 'tools', '?tool=page-engine',      'First Playable'),
      ('community-scaffold',  'Community Scaffold',  '/seismic', 'public', '1', 15, 'tools', '?tool=community-scaffold', 'First Playable'),
      ('test-loop',           'Test Loop',           '/seismic', 'public', '1', 16, 'tools', '?tool=test-loop',        'Pre-Alpha'),
      ('festival-radar',      'Festival Radar',      '/seismic', 'public', '1', 17, 'tools', '?tool=festival-radar',   'Pre-Alpha'),
      ('playtest-pipeline',   'Playtest Pipeline',   '/seismic', 'public', '1', 18, 'tools', '?tool=playtest-pipeline', 'Pre-Alpha'),
      ('creator-match',       'Creator Match',       '/seismic', 'public', '1', 19, 'tools', '?tool=creator-match',    'Closed Beta'),
      ('sentiment-radar',     'Sentiment Radar',     '/seismic', 'public', '1', 20, 'tools', '?tool=sentiment-radar',  'Closed Beta'),
      ('demo-command',        'Demo Command',        '/seismic', 'public', '1', 21, 'tools', '?tool=demo-command',     'Open Beta / EA'),
      ('window-planner',      'Window Planner',      '/seismic', 'public', '1', 22, 'tools', '?tool=window-planner',   'Open Beta / EA'),
      ('launch-runbook',      'Launch Runbook',      '/seismic', 'public', '1', 23, 'tools', '?tool=launch-runbook',   'Launch'),
      ('long-tail-engine',    'Long Tail Engine',    '/seismic', 'public', '1', 24, 'tools', '?tool=long-tail-engine', 'Post-launch'),
      ('sequel-signal',       'Sequel Signal',       '/seismic', 'public', '1', 25, 'tools', '?tool=sequel-signal',    'Post-launch'),
      ('thesis-view',         'Publishing Thesis',   '/seismic', 'public', '1', 26, 'tools', '?tool=thesis-view',      'Shared'),
      ('ledger-view',         'Signal Ledger',       '/seismic', 'public', '1', 27, 'tools', '?tool=ledger-view',      'Shared'),
      ('gate-log',            'Gate History',        '/seismic', 'public', '1', 28, 'tools', '?tool=gate-log',         'Shared')
    ON CONFLICT (id) DO NOTHING`,
    // Everything in the Game OS universe requires a signed-in account.
    `UPDATE "app" SET access = 'authenticated' WHERE id IN
      ('dashboard','price-calc','chicken-brulee','pmf','seismic','steam-page-audit',
       'market-scope','thesis-builder','audience-map','page-engine','community-scaffold',
       'test-loop','festival-radar','playtest-pipeline','creator-match','sentiment-radar',
       'demo-command','window-planner','launch-runbook','long-tail-engine','sequel-signal',
       'thesis-view','ledger-view','gate-log')`,
    `UPDATE "app" SET "group" = 'cxo' WHERE id IN
      ('price-calc','chicken-brulee','pmf')`,
    // --- Widget presentation data (rich dashboard tiles) ---
    // Top 3 CXO widgets.
    `UPDATE "app" SET
       "toolName"='Chicken Brûlée', "cxoQuestion"='Are players engaging?',
       "description"='Is the playtest community giving useful, directional feedback? Chicken Brûlée scans your Discord playtest channels for recurring patterns, onboarding friction, and flagged comments.',
       "status"='watch', "statusLabel"='Watch',
       "metrics"='[{"label":"Contributors (7d)","value":"12"},{"label":"New observations","value":"34"},{"label":"Onboarding-flagged","value":"41%"}]',
       "spark"='{"type":"bars","values":[8,12,10,14,11,12,9]}'
     WHERE id='chicken-brulee'`,
    `UPDATE "app" SET
       "toolName"='Comp Analysis / SEB', "cxoQuestion"='Is the price right?',
       "description"='Is our launch price, discount plan, and regional strategy defensible? SEB is the full indie pricing workbook: comparable-game research, four-variable scoring, score-to-tier mapping, and discount staircase planning.',
       "status"='healthy', "statusLabel"='Healthy',
       "metrics"='[{"label":"Required launch price","value":"$21.41"},{"label":"Wishlist → Week 1 est.","value":"630 units"},{"label":"Net revenue Week 1","value":"$9,443.70"}]',
       "spark"='{"type":"line","values":[18,19,19.5,20,20.8,21,21.4]}'
     WHERE id='price-calc'`,
    `UPDATE "app" SET
       "toolName"='MTG PMF Analyzer', "cxoQuestion"='Are we hitting product-market fit?',
       "description"='30 days in, is this game showing PMF signals, and where is the weakness? The MTG PMF Analyzer evaluates acquisition, engagement, and satisfaction lenses on Steam-native public data.',
       "status"='nodata', "statusLabel"='No data',
       "metrics"='[{"label":"Days since launch","value":"—"},{"label":"Acquisition lens","value":"—"},{"label":"Engagement lens","value":"—"},{"label":"Satisfaction lens","value":"—"}]',
       "spark"='{"type":"line","values":[0,0,62,71,78,84,91,94]}'
     WHERE id='pmf'`,
    // Steam Page Audit widget.
    `UPDATE "app" SET
       "toolName"='Store Page Scorer', "cxoQuestion"='Will your page convert?',
       "description"='Enter a Steam App ID; score your store page across art, trailer, description, reviews, and pricing — before players do.',
       "status"='healthy', "statusLabel"='Healthy',
       "metrics"='[{"label":"Overall","value":"93/100"},{"label":"Grade","value":"A"},{"label":"Criteria scored","value":"7"}]',
       "spark"='{"type":"bars","values":[90,85,94,85,90]}'
     WHERE id='steam-page-audit'`,
    // Seismic tools — concise descriptions + status.
    // Seismic overview as a tool entry (its 15 tools are separate widgets).
    `UPDATE "app" SET
       "group"='tools', "stage"='Lifecycle', "toolName"='Seismic',
       "description"='The full publishing lifecycle: 15 tools across 8 stages, one shared system.',
       "status"='healthy', "statusLabel"='Healthy', "anchor"=NULL
     WHERE id='seismic'`,
    `UPDATE "app" SET "toolName"='Seismic', "status"='healthy', "statusLabel"='Healthy' WHERE id IN
      ('market-scope','thesis-builder','audience-map','page-engine','community-scaffold',
       'test-loop','festival-radar','playtest-pipeline','creator-match','sentiment-radar',
       'demo-command','window-planner','launch-runbook','long-tail-engine','sequel-signal',
       'thesis-view','ledger-view','gate-log')`,
    // Concise per-tool descriptions so each widget reads as a product.
    `UPDATE "app" SET "description"='Does an audience exist? Size the market, saturation, and blue-ocean pairs.' WHERE id='market-scope'`,
    `UPDATE "app" SET "description"='Your versioned publishing thesis: audience, comp set, hook, price, and per-stage targets.' WHERE id='thesis-builder'`,
    `UPDATE "app" SET "description"='Where does the audience live? Channels, communities, and the vocabulary they use.' WHERE id='audience-map'`,
    `UPDATE "app" SET "description"='Store page performance: capsule CTR, trailer retention, and creative versions.' WHERE id='page-engine'`,
    `UPDATE "app" SET "description"='Stand up your Discord community and structured feedback loop.' WHERE id='community-scaffold'`,
    `UPDATE "app" SET "description"='A/B the hook: capsule and positioning variants against a conversion lift norm.' WHERE id='test-loop'`,
    `UPDATE "app" SET "description"='Which festivals to submit to, with deadlines and average wishlist lift.' WHERE id='festival-radar'`,
    `UPDATE "app" SET "description"='Manage playtest sessions, demo scope, and key findings.' WHERE id='playtest-pipeline'`,
    `UPDATE "app" SET "description"='Match creators by audience overlap; track outreach and response.' WHERE id='creator-match'`,
    `UPDATE "app" SET "description"='Sentiment index, decay alarms, and the words players actually use.' WHERE id='sentiment-radar'`,
    `UPDATE "app" SET "description"='Demo conversion diagnostics and the time series behind them.' WHERE id='demo-command'`,
    `UPDATE "app" SET "description"='Pick your launch window: congestion, price lock, and wishlist geography.' WHERE id='window-planner'`,
    `UPDATE "app" SET "description"='Launch checklist, alerts, and the expectation-delivery gap.' WHERE id='launch-runbook'`,
    `UPDATE "app" SET "description"='Revenue by quarter, discount ladder, and update-beat planning.' WHERE id='long-tail-engine'`,
    `UPDATE "app" SET "description"='DLC, sequel, port, or pivot — scenario cards and the next thesis draft.' WHERE id='sequel-signal'`,
    `UPDATE "app" SET "description"='The single versioned record of what you claim and why.' WHERE id='thesis-view'`,
    `UPDATE "app" SET "description"='Every signal, normalized against benchmarks, one ledger.' WHERE id='ledger-view'`,
    `UPDATE "app" SET "description"='Forced verdicts at each stage — proceed, revise, or stop.' WHERE id='gate-log'`,
    // --- Widget previews: metrics + sparkline for every Seismic tool + view ---
    `UPDATE "app" SET "cxoQuestion"='Does an audience exist?', "metrics"='[{"label":"Saturation","value":"Low"},{"label":"Genres tracked","value":"34"},{"label":"Blue-ocean pairs","value":"6"}]', "spark"='{"type":"line","values":[42,46,49,51,54]}' WHERE id='market-scope'`,
    `UPDATE "app" SET "cxoQuestion"='What is your claim?', "metrics"='[{"label":"Comp set","value":"4"},{"label":"Price hypothesis","value":"$19.99"},{"label":"Thesis versions","value":"3"}]', "spark"='{"type":"bars","values":[60,64,62,68,71]}' WHERE id='thesis-builder'`,
    `UPDATE "app" SET "cxoQuestion"='Where do players live?', "metrics"='[{"label":"Channels","value":"14"},{"label":"Top fit","value":"92%"},{"label":"Communities","value":"9"}]', "spark"='{"type":"line","values":[51,56,54,60,66]}' WHERE id='audience-map'`,
    `UPDATE "app" SET "cxoQuestion"='Does it convert?', "metrics"='[{"label":"Capsule CTR","value":"5.8%"},{"label":"Trailer retention","value":"71%"},{"label":"Creative versions","value":"7"}]', "spark"='{"type":"line","values":[55,58,61,63,66]}' WHERE id='page-engine'`,
    `UPDATE "app" SET "cxoQuestion"='Is the loop building?', "metrics"='[{"label":"Members","value":"28K"},{"label":"Feedback tags","value":"112"},{"label":"Active (7d)","value":"41%"}]', "spark"='{"type":"bars","values":[40,45,48,52,55]}' WHERE id='community-scaffold'`,
    `UPDATE "app" SET "cxoQuestion"='Does the hook read?', "metrics"='[{"label":"Variants","value":"6"},{"label":"Best lift","value":"+23%"},{"label":"Winner","value":"Cap B"}]', "spark"='{"type":"line","values":[48,52,55,59,62]}' WHERE id='test-loop'`,
    `UPDATE "app" SET "cxoQuestion"='Where to show it?', "metrics"='[{"label":"Submitted","value":"3"},{"label":"Accepted","value":"2"},{"label":"Avg lift","value":"+2,000"}]', "spark"='{"type":"bars","values":[38,42,44,48,50]}' WHERE id='festival-radar'`,
    `UPDATE "app" SET "cxoQuestion"='What did players say?', "metrics"='[{"label":"Sessions","value":"8"},{"label":"Findings","value":"26"},{"label":"Critical","value":"4"}]', "spark"='{"type":"line","values":[44,47,50,53,57]}' WHERE id='playtest-pipeline'`,
    `UPDATE "app" SET "cxoQuestion"='Who should cover it?', "metrics"='[{"label":"Matched creators","value":"48"},{"label":"Contacted","value":"17"},{"label":"Interested","value":"9"}]', "spark"='{"type":"bars","values":[35,40,45,48,52]}' WHERE id='creator-match'`,
    `UPDATE "app" SET "cxoQuestion"='What do they feel?', "metrics"='[{"label":"Sentiment index","value":"7.8/10"},{"label":"Themes","value":"12"},{"label":"Decay alarms","value":"1"}]', "spark"='{"type":"line","values":[62,64,67,70,74]}' WHERE id='sentiment-radar'`,
    `UPDATE "app" SET "cxoQuestion"='Does the demo sell?', "metrics"='[{"label":"Conversion","value":"14.2%"},{"label":"Percentile","value":"87th"},{"label":"Wishlists","value":"+3,200"}]', "spark"='{"type":"line","values":[56,60,64,68,72]}' WHERE id='demo-command'`,
    `UPDATE "app" SET "cxoQuestion"='When to launch?', "metrics"='[{"label":"Target weeks","value":"3"},{"label":"Congestion","value":"Moderate"},{"label":"Price lock","value":"$19.99"}]', "spark"='{"type":"bars","values":[46,48,52,54,58]}' WHERE id='window-planner'`,
    `UPDATE "app" SET "cxoQuestion"='Ready to ship?', "metrics"='[{"label":"Checklist","value":"24/28"},{"label":"Alerts","value":"2"},{"label":"Funnel ready","value":"Yes"}]', "spark"='{"type":"line","values":[58,62,65,70,76]}' WHERE id='launch-runbook'`,
    `UPDATE "app" SET "cxoQuestion"='How long can it earn?', "metrics"='[{"label":"Gross","value":"$210K"},{"label":"Decay","value":"82%/q"},{"label":"Localization ROI","value":"+19%"}]', "spark"='{"type":"line","values":[64,68,72,78,84]}' WHERE id='long-tail-engine'`,
    `UPDATE "app" SET "cxoQuestion"='What is next?', "metrics"='[{"label":"Best path","value":"Sequel"},{"label":"Momentum","value":"94"},{"label":"DLC score","value":"71"}]', "spark"='{"type":"bars","values":[70,75,80,86,90]}' WHERE id='sequel-signal'`,
    `UPDATE "app" SET "cxoQuestion"='The source of truth.', "metrics"='[{"label":"Version","value":"3"},{"label":"Comp set","value":"4"},{"label":"Stage","value":"6"}]', "spark"='{"type":"line","values":[58,62,66,70,74]}' WHERE id='thesis-view'`,
    `UPDATE "app" SET "cxoQuestion"='Every signal, one ledger.', "metrics"='[{"label":"Signals","value":"18,600"},{"label":"Momentum","value":"84"},{"label":"Percentile","value":"86th"}]', "spark"='{"type":"line","values":[60,64,68,73,80]}' WHERE id='ledger-view'`,
    `UPDATE "app" SET "cxoQuestion"='The verdict history.', "metrics"='[{"label":"Gates","value":"6"},{"label":"Proceeded","value":"5"},{"label":"Revised","value":"1"}]', "spark"='{"type":"bars","values":[50,55,60,66,72]}' WHERE id='gate-log'`,
    `UPDATE "app" SET "cxoQuestion"='One system, eight stages.', "metrics"='[{"label":"Tools","value":"15"},{"label":"Stages","value":"8"},{"label":"Momentum","value":"84"}]', "spark"='{"type":"line","values":[58,64,70,78,84]}' WHERE id='seismic'`,
    // Market Scope is now a standalone Game OS widget (not a Seismic deep-link).
    `UPDATE "app" SET path='/game-os/market-scope', anchor=NULL WHERE id='market-scope'`,
    // Market Scope now reads live Steam releases; drop the demo tile numbers.
    // Signal Ledger is a real page with the Momentum Score; top row, live tile.
    `UPDATE "app" SET path='/game-os/ledger-view', anchor=NULL, "group"='cxo', "sortOrder"=0, "stage"=NULL,
       "toolName"='Signal Ledger', "cxoQuestion"='Is the game gaining momentum?',
       "description"='Every figure your tools record for a game, scored against benchmarks and rolled into one Momentum Score weighted for your stage, with a daily Steam snapshot.',
       "status"='nodata', "statusLabel"='No data',
       "metrics"='[{"label":"Momentum","value":"—"},{"label":"30-day change","value":"—"},{"label":"Coverage","value":"—"}]'
     WHERE id='ledger-view'`,
    // Audience Map is a working tool: top row, live tile.
    `UPDATE "app" SET "group"='cxo', "sortOrder"=7, "stage"=NULL, "toolName"='Audience Map',
       "cxoQuestion"='Where do your players gather?',
       "description"='Start from games like yours: their Discord communities with live member counts, the games Steam recommends alongside them, the words players use, and whether your name is free.',
       "status"='nodata', "statusLabel"='No data',
       "metrics"='[{"label":"Comp Discord members","value":"—"},{"label":"Online now","value":"—"},{"label":"Comps mapped","value":"—"}]'
     WHERE id='audience-map'`,
    // PMF Analyzer rebuilt as a Game OS tool on Steam's working endpoints.
    `UPDATE "app" SET
       "toolName"='PMF Analyzer',
       "description"='Is a Steam game finding its market? Satisfaction, engagement and reach scored against similar games, with its trailer, screenshots, review history and what to do next.',
       "metrics"='[{"label":"Satisfaction","value":"—"},{"label":"Engagement","value":"—"},{"label":"Reach","value":"—"}]'
     WHERE id='pmf'`,
    // Launch Runbook is a dated Steam launch checklist: top row, live tile.
    `UPDATE "app" SET "group"='cxo', "sortOrder"=9, "stage"=NULL, "toolName"='Launch Runbook',
       "cxoQuestion"='Are you ready to launch?',
       "description"='A dated Steam launch checklist worked back from your launch day: Steam review and Coming Soon deadlines, price and launch discount, press keys, launch day and the first 30 days.',
       "status"='nodata', "statusLabel"='No data',
       "metrics"='[{"label":"Days to launch","value":"—"},{"label":"Steps done","value":"—"},{"label":"Past their date","value":"—"}]'
     WHERE id='launch-runbook'`,
    // Window Planner reads Steam's upcoming releases and event calendar: top row, live tile.
    `UPDATE "app" SET "group"='cxo', "sortOrder"=8, "stage"=NULL, "toolName"='Window Planner',
       "cxoQuestion"='When should you launch?',
       "description"='Pick a Steam launch week: how many games under your tags are coming out each week, how crowded that week usually is, and which Steam sales and Next Fest dates to avoid or aim for.',
       "status"='nodata', "statusLabel"='No data',
       "metrics"='[{"label":"Launch week","value":"—"},{"label":"Week score","value":"—"},{"label":"Same-tag releases","value":"—"}]'
     WHERE id='window-planner'`,
    // It is a working tool, so it sits in the top row with the other real tools.
    `UPDATE "app" SET
       "group"='cxo', "sortOrder"=6, "stage"=NULL, "toolName"='Market Scope',
       "description"='Size a Steam market from real releases: what games under your tags earn, whether the space is getting crowded, which added tag is an opening, and which games to use as comps.',
       "status"='nodata', "statusLabel"='No data',
       "metrics"='[{"label":"Median revenue","value":"—"},{"label":"Over $100K","value":"—"},{"label":"Releases a year","value":"—"}]'
     WHERE id='market-scope'`,
    // Sentiment Radar reads public Steam reviews (or the comps' before launch): top row, live tile.
    `UPDATE "app" SET "group"='cxo', "sortOrder"=10, "stage"=NULL, "toolName"='Sentiment Radar',
       "cxoQuestion"='What do players feel, and is it slipping?',
       "description"='Reads public Steam reviews: a decay alarm when recent reviews fall below your all-time rating, review velocity, playtime at review and the words players use. Before you have reviews, it reads your comps.',
       "status"='nodata', "statusLabel"='No data',
       "metrics"='[{"label":"Recent vs all-time","value":"—"},{"label":"Reviews a day","value":"—"},{"label":"Early negatives","value":"—"}]'
     WHERE id='sentiment-radar'`,
    // Page Engine measures the store page from studio-submitted Steamworks numbers: top row, live tile.
    `UPDATE "app" SET "group"='cxo', "sortOrder"=11, "stage"=NULL, "toolName"='Page Engine',
       "cxoQuestion"='Is the store page turning visitors into wishlists?',
       "description"='Import your Steamworks wishlist, traffic and UTM numbers, or type them in. See wishlist velocity, click-through and wishlists per visit with honest ranges, and log every beat and store asset change to see which ones moved wishlists.',
       "status"='nodata', "statusLabel"='No data',
       "metrics"='[{"label":"Adds, 28 days","value":"—"},{"label":"Per 100 visits","value":"—"},{"label":"Click-through","value":"—"}]'
     WHERE id='page-engine'`,
    // Creator Match: Twitch footprint from the studio's export, live YouTube/Twitch lists, outreach log: top row, live tile.
    `UPDATE "app" SET "group"='cxo', "sortOrder"=12, "stage"=NULL, "toolName"='Creator Match',
       "cxoQuestion"='Who covers games like yours, and is coverage bringing you players?',
       "description"='Upload your Twitch developer analytics, see who is making videos and streams about your game and your comps right now, and keep your creator outreach log. Coverage you log shows on Page Engine''s wishlist chart.',
       "status"='nodata', "statusLabel"='No data',
       "metrics"='[{"label":"Contacted","value":"—"},{"label":"Covered","value":"—"},{"label":"Twitch hours, 28d","value":"—"}]'
     WHERE id='creator-match'`,
    // Festival Radar: Steam events + hand-checked festivals, the studio's entries, measured lift: top row, live tile.
    `UPDATE "app" SET "group"='cxo', "sortOrder"=13, "stage"=NULL, "toolName"='Festival Radar',
       "cxoQuestion"='Which festivals should we enter, and did the last one move wishlists?',
       "description"='Steam Next Fest, Steam''s themed fests and other showcases matched to your tags, nearest deadline first. Track your entries, and measure the wishlist lift from each festival you attended against the weeks before.',
       "status"='nodata', "statusLabel"='No data',
       "metrics"='[{"label":"Last festival","value":"—"},{"label":"Wishlist lift","value":"—"},{"label":"95% range","value":"—"}]'
     WHERE id='festival-radar'`,
    // Demo Command: demo players from the demo's Steamworks export, read against Page Engine's wishlists: top row, live tile.
    `UPDATE "app" SET "group"='cxo', "sortOrder"=14, "stage"=NULL, "toolName"='Demo Command',
       "cxoQuestion"='Is the demo turning players into wishlists?',
       "description"='Bring in your demo''s player numbers from Steamworks and read them against the full game''s wishlist adds: wishlists per 100 demo players, demo playtime, and each Steam Next Fest against the weeks before.',
       "status"='nodata', "statusLabel"='No data', "spark"=NULL,
       "metrics"='[{"label":"Demo players, 28d","value":"—"},{"label":"Wishlists per 100","value":"—"},{"label":"Median playtime","value":"—"}]'
     WHERE id='demo-command'`,
    // Test Loop: before/after reads of store changes from Page Engine, plus off-Steam variant tests: top row, live tile.
    `UPDATE "app" SET "group"='cxo', "sortOrder"=15, "stage"=NULL, "toolName"='Test Loop',
       "cxoQuestion"='Did the change we made beat what it replaced?',
       "description"='Read each store page change before and after from your Page Engine numbers, and test ads, posts and positioning lines off Steam. Better, worse or can''t tell, with a 95% range.',
       "status"='nodata', "statusLabel"='No data', "spark"=NULL,
       "metrics"='[{"label":"Last test","value":"—"},{"label":"Lift, points","value":"—"},{"label":"Verdict","value":"—"}]'
     WHERE id='test-loop'`,
    // Long Tail Engine: legs and player floor from public Steam data and the daily snapshots: top row, live tile.
    `UPDATE "app" SET "group"='cxo', "sortOrder"=16, "stage"=NULL, "toolName"='Long Tail Engine',
       "cxoQuestion"='How long can it keep earning, and what moves it?',
       "description"='Reviews per day now against launch, players now against launch week, your revenue or a labelled estimate, and what happened to reviews and players around each update and sale.',
       "status"='nodata', "statusLabel"='No data', "spark"=NULL,
       "metrics"='[{"label":"Reviews vs launch","value":"—"},{"label":"95% bounds","value":"—"},{"label":"Players vs launch","value":"—"}]'
     WHERE id='long-tail-engine'`,
    // The remaining Seismic tools are extracted as standalone widgets too.
    `UPDATE "app" SET path='/game-os/'||id, anchor=NULL WHERE id IN
      ('thesis-builder','audience-map','page-engine','community-scaffold',
       'test-loop','festival-radar','playtest-pipeline','creator-match',
       'sentiment-radar','demo-command','window-planner','launch-runbook',
       'long-tail-engine','sequel-signal')`,
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
