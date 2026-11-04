import {
  pgTable,
  text,
  timestamp,
  primaryKey,
  integer,
  uuid,
  doublePrecision,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

/* ---------------------------------------------------------------------------
   Auth.js core tables (users, accounts, sessions, verification tokens).
   These follow the Auth.js Drizzle adapter schema.
--------------------------------------------------------------------------- */

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => ({
    compoundKey: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  }),
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => ({
    compoundKey: primaryKey({ columns: [vt.identifier, vt.token] }),
  }),
);

/* ---------------------------------------------------------------------------
   Game OS tenancy: a studio owns games; users are members with a role.
   This is what governs access and usage of the tools.
--------------------------------------------------------------------------- */

export const studios = pgTable("studio", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  ownerId: text("ownerId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // A personal studio is auto-created for solo users; it is not a "team".
  isPersonal: integer("isPersonal").notNull().default(0),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
});

export const memberships = pgTable(
  "membership",
  {
    studioId: uuid("studioId")
      .notNull()
      .references(() => studios.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("owner"), // owner | editor | viewer
    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  },
  (m) => ({
    pk: primaryKey({ columns: [m.studioId, m.userId] }),
  }),
);

export const invitations = pgTable("invitation", {
  id: uuid("id").primaryKey().defaultRandom(),
  studioId: uuid("studioId")
    .notNull()
    .references(() => studios.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role").notNull().default("viewer"), // viewer | editor | owner
  token: text("token").notNull().unique(),
  invitedBy: text("invitedBy").references(() => users.id, { onDelete: "set null" }),
  status: text("status").notNull().default("pending"), // pending | accepted | revoked
  expiresAt: timestamp("expiresAt", { mode: "date" }),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
});

export const games = pgTable("game", {
  id: uuid("id").primaryKey().defaultRandom(),
  studioId: uuid("studioId")
    .notNull()
    .references(() => studios.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  steamAppId: text("steamAppId"),
  genre: text("genre"),
  stage: integer("stage").notNull().default(1), // Seismic lifecycle stage 1..8
  createdBy: text("createdBy").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
});

/* ---------------------------------------------------------------------------
   The shared game spine (Seismic's shared objects, made real).
   Every tool reads the current game's latest thesis and writes measurements
   into its signal ledger, so one tool's output becomes another's input.
--------------------------------------------------------------------------- */

/* Publishing Thesis — one immutable row per version. Latest = max(version). */
export const thesisVersions = pgTable("thesis_version", {
  id: uuid("id").primaryKey().defaultRandom(),
  gameId: uuid("gameId")
    .notNull()
    .references(() => games.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  audience: text("audience"),
  hook: text("hook"),
  compSet: text("compSet"), // JSON array [{name, appId?, price?}]
  priceHypothesis: text("priceHypothesis"), // e.g. "19.99"
  targets: text("targets"), // JSON object of per-stage targets
  changedFields: text("changedFields"), // JSON array of field names changed in this version
  source: text("source"), // tool id that wrote it, or "manual"
  note: text("note"),
  createdBy: text("createdBy").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
});

/* Signal Ledger — append-only measurements from every tool. */
export const signals = pgTable("signal", {
  id: uuid("id").primaryKey().defaultRandom(),
  gameId: uuid("gameId")
    .notNull()
    .references(() => games.id, { onDelete: "cascade" }),
  toolId: text("toolId").notNull(),
  key: text("key").notNull(), // e.g. "page_audit_overall", "launch_price"
  label: text("label"),
  value: doublePrecision("value"),
  unit: text("unit"), // "usd" | "units" | "score" | "pct" | ...
  meta: text("meta"), // JSON
  observedAt: timestamp("observedAt", { mode: "date" }).defaultNow().notNull(),
  createdBy: text("createdBy").references(() => users.id, { onDelete: "set null" }),
});

/* ---------------------------------------------------------------------------
   App registry — every tool/app Game OS serves, as data. Adding a future app
   is one row, not a code change. `access` governs who can open it.
--------------------------------------------------------------------------- */

export const apps = pgTable("app", {
  id: text("id").primaryKey(), // slug, e.g. "price-calc", "pmf", "seismic"
  name: text("name").notNull(),
  path: text("path").notNull(), // e.g. "/game-os/price-calc"
  url: text("url"), // external tool URL if not served locally
  access: text("access").notNull().default("public"), // public | authenticated | studio | role
  minRole: text("minRole"), // when access = role: viewer | editor | owner
  version: text("version"), // app_version stamped on events
  icon: text("icon"),
  group: text("group").notNull().default("tools"), // cxo (top 3) | tools (below)
  anchor: text("anchor"), // deep-link target appended to path, e.g. "?tool=market-scope"
  stage: text("stage"), // lifecycle stage label for grouping (Seismic) — e.g. "Concept"
  // Widget presentation (rich tiles on the dashboard).
  toolName: text("toolName"), // underlying tool name, e.g. "Chicken Brûlée"
  cxoQuestion: text("cxoQuestion"), // one-line CXO framing
  description: text("description"), // short description shown on the tile
  status: text("status"), // healthy | watch | nodata
  statusLabel: text("statusLabel"), // "Healthy" | "Watch" | "No data"
  metrics: text("metrics"), // JSON array [{label,value}]
  spark: text("spark"), // JSON {type:'bars'|'line',values:[...]} or null
  sortOrder: integer("sortOrder").notNull().default(0),
  enabled: integer("enabled").notNull().default(1), // 1 = shown
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
});

/* ---------------------------------------------------------------------------
   Instrumentation (Jay's spec). Raw events, one row each; metrics are
   computed in the dashboard layer. PII is isolated from events.
--------------------------------------------------------------------------- */

export const events = pgTable("event", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventName: text("eventName").notNull(),
  timestamp: timestamp("timestamp", { mode: "date" }).defaultNow().notNull(),
  anonId: text("anonId"),
  userId: text("userId").references(() => users.id, { onDelete: "set null" }),
  sessionId: text("sessionId"),
  toolId: text("toolId"),
  appVersion: text("appVersion"),
  utmSource: text("utmSource"),
  utmMedium: text("utmMedium"),
  utmCampaign: text("utmCampaign"),
  referrer: text("referrer"),
  props: text("props"), // JSON string of event-specific fields
});

/* Restricted PII — never exposed to the app or joined into dashboards. */
export const pii = pgTable("pii", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("userId").references(() => users.id, { onDelete: "cascade" }),
  anonId: text("anonId"),
  email: text("email").notNull(),
  studioName: text("studioName"),
  devStage: text("devStage"),
  gameLink: text("gameLink"),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
});

/* Layer 3 — design partner records (manual, maintained by Jay). */
export const designPartners = pgTable("design_partner", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("userId").references(() => users.id, { onDelete: "set null" }),
  studioName: text("studioName").notNull(),
  contact: text("contact"),
  game: text("game"),
  steamPageUrl: text("steamPageUrl"),
  devStage: text("devStage"),
  recruitedVia: text("recruitedVia"), // ring1 | ring2 | content | other
  dateJoined: timestamp("dateJoined", { mode: "date" }).defaultNow(),
  toolsUsed: text("toolsUsed"), // JSON array
  quotePermission: text("quotePermission").default("n"), // y | n
  status: text("status").default("active"), // active | dormant | churned
  validating: text("validating"),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
});

/* Layer 4 — Discord engagement snapshots. */
export const discordSnapshots = pgTable("discord_snapshot", {
  id: uuid("id").primaryKey().defaultRandom(),
  snapshotDate: timestamp("snapshotDate", { mode: "date" }).defaultNow().notNull(),
  memberCount: integer("memberCount"),
  newJoins: integer("newJoins"),
  leaves: integer("leaves"),
  activeMembers: integer("activeMembers"),
  messagesCount: integer("messagesCount"),
  playNightAttendance: integer("playNightAttendance"),
  granularity: text("granularity").default("daily"), // daily | weekly
});
