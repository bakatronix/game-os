import {
  pgTable,
  text,
  timestamp,
  primaryKey,
  integer,
  uuid,
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

export const games = pgTable("game", {
  id: uuid("id").primaryKey().defaultRandom(),
  studioId: uuid("studioId")
    .notNull()
    .references(() => studios.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  steamAppId: text("steamAppId"),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
});
