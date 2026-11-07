import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { games, memberships, signals, studios, thesisVersions } from "@/db/schema";

/* ---------------------------------------------------------------------------
   The shared game spine: games, their versioned Publishing Thesis, and the
   Signal Ledger. Every read/write goes through a studio-membership check.
--------------------------------------------------------------------------- */

const RANK: Record<string, number> = { viewer: 0, editor: 1, owner: 2 };

export const THESIS_FIELDS = ["audience", "hook", "compSet", "priceHypothesis", "targets"] as const;
type ThesisField = (typeof THESIS_FIELDS)[number];
const JSON_FIELDS = new Set<ThesisField>(["compSet", "targets"]);

export class AccessError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** The user's role in the studio that owns `gameId`, or throw 404/403. */
export async function requireGameRole(userId: string, gameId: string, minRole: "viewer" | "editor" | "owner") {
  const db = getDb();
  const rows = await db
    .select({ game: games, role: memberships.role })
    .from(games)
    .innerJoin(memberships, and(eq(memberships.studioId, games.studioId), eq(memberships.userId, userId)))
    .where(eq(games.id, gameId))
    .limit(1);
  if (!rows.length) throw new AccessError(404, "Game not found");
  if ((RANK[rows[0].role] ?? -1) < RANK[minRole]) throw new AccessError(403, "Not allowed");
  return rows[0];
}

/** Every game in every studio the user belongs to. */
export async function listGamesForUser(userId: string) {
  const db = getDb();
  return db
    .select({
      id: games.id,
      title: games.title,
      steamAppId: games.steamAppId,
      genre: games.genre,
      stage: games.stage,
      studioId: games.studioId,
      studioName: studios.name,
      role: memberships.role,
      createdAt: games.createdAt,
    })
    .from(games)
    .innerJoin(memberships, and(eq(memberships.studioId, games.studioId), eq(memberships.userId, userId)))
    .innerJoin(studios, eq(studios.id, games.studioId))
    .orderBy(games.createdAt);
}

export async function createGame(
  userId: string,
  studioId: string,
  input: { title: string; steamAppId?: string | null; genre?: string | null; stage?: number | null },
) {
  const db = getDb();
  const m = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.studioId, studioId), eq(memberships.userId, userId)))
    .limit(1);
  if (!m.length) throw new AccessError(403, "Not a member of this studio");
  if ((RANK[m[0].role] ?? -1) < RANK.editor) throw new AccessError(403, "Editors and owners can add games");

  const [g] = await db
    .insert(games)
    .values({
      studioId,
      title: input.title,
      steamAppId: input.steamAppId || null,
      genre: input.genre || null,
      stage: clampStage(input.stage),
      createdBy: userId,
    })
    .returning();
  return g;
}

export async function updateGame(
  gameId: string,
  patch: { title?: string; steamAppId?: string | null; genre?: string | null; stage?: number | null },
) {
  const db = getDb();
  const set: Record<string, unknown> = {};
  if (patch.title !== undefined) set.title = patch.title;
  if (patch.steamAppId !== undefined) set.steamAppId = patch.steamAppId || null;
  if (patch.genre !== undefined) set.genre = patch.genre || null;
  if (patch.stage !== undefined) set.stage = clampStage(patch.stage);
  if (!Object.keys(set).length) return null;
  const [g] = await db.update(games).set(set).where(eq(games.id, gameId)).returning();
  return g;
}

function clampStage(s: number | null | undefined) {
  const n = Math.round(Number(s) || 1);
  return Math.min(8, Math.max(1, n));
}

function parseJSON(s: string | null) {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function shapeThesis(t: typeof thesisVersions.$inferSelect | undefined) {
  if (!t) return null;
  return {
    version: t.version,
    audience: t.audience,
    hook: t.hook,
    compSet: parseJSON(t.compSet),
    priceHypothesis: t.priceHypothesis,
    targets: parseJSON(t.targets),
    changedFields: parseJSON(t.changedFields) || [],
    source: t.source,
    note: t.note,
    createdAt: t.createdAt,
  };
}

export async function getThesisHistory(gameId: string, limit = 50) {
  const db = getDb();
  const rows = await db
    .select()
    .from(thesisVersions)
    .where(eq(thesisVersions.gameId, gameId))
    .orderBy(desc(thesisVersions.version))
    .limit(limit);
  return rows.map(shapeThesis);
}

/**
 * Write a new thesis version. Only the fields present in `patch` change; the
 * rest carry over from the latest version. No-op when nothing changed.
 */
export async function reviseThesis(
  userId: string,
  gameId: string,
  patch: Partial<Record<ThesisField, unknown>>,
  source: string,
  note?: string | null,
) {
  const db = getDb();
  const [latest] = await db
    .select()
    .from(thesisVersions)
    .where(eq(thesisVersions.gameId, gameId))
    .orderBy(desc(thesisVersions.version))
    .limit(1);

  const next: Record<ThesisField, string | null> = {
    audience: latest?.audience ?? null,
    hook: latest?.hook ?? null,
    compSet: latest?.compSet ?? null,
    priceHypothesis: latest?.priceHypothesis ?? null,
    targets: latest?.targets ?? null,
  };
  const changed: string[] = [];
  for (const f of THESIS_FIELDS) {
    if (!(f in patch)) continue;
    const raw = patch[f];
    const v =
      raw === null || raw === undefined || raw === ""
        ? null
        : JSON_FIELDS.has(f)
          ? JSON.stringify(raw)
          : String(raw).trim();
    if (v !== next[f]) {
      next[f] = v;
      changed.push(f);
    }
  }
  if (!changed.length && latest) return { thesis: shapeThesis(latest), changed: [] as string[] };

  const [row] = await db
    .insert(thesisVersions)
    .values({
      gameId,
      version: (latest?.version ?? 0) + 1,
      ...next,
      changedFields: JSON.stringify(changed),
      source: source || "manual",
      note: note || null,
      createdBy: userId,
    })
    .returning();
  return { thesis: shapeThesis(row), changed };
}

export type SignalInput = {
  key: string;
  value?: number | null;
  label?: string | null;
  unit?: string | null;
  meta?: unknown;
};

export async function recordSignals(userId: string, gameId: string, toolId: string, list: SignalInput[]) {
  const rows = list
    .filter((s) => s && typeof s.key === "string" && /^[a-z0-9_.-]{1,64}$/i.test(s.key))
    .slice(0, 50)
    .map((s) => ({
      gameId,
      toolId: String(toolId).slice(0, 64),
      key: s.key,
      label: s.label ? String(s.label).slice(0, 120) : null,
      value: typeof s.value === "number" && Number.isFinite(s.value) ? s.value : null,
      unit: s.unit ? String(s.unit).slice(0, 16) : null,
      meta: s.meta === undefined ? null : JSON.stringify(s.meta).slice(0, 4000),
      createdBy: userId,
    }));
  if (!rows.length) return [];
  const db = getDb();
  return db.insert(signals).values(rows).returning();
}

/** Latest value per signal key, plus a short history per key for sparklines. */
export async function getLedger(gameId: string, perKey = 12) {
  const db = getDb();
  const rows = await db
    .select()
    .from(signals)
    .where(eq(signals.gameId, gameId))
    .orderBy(desc(signals.observedAt))
    .limit(500);
  const byKey = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byKey.get(r.key) || [];
    if (list.length < perKey) list.push(r);
    byKey.set(r.key, list);
  }
  return [...byKey.entries()].map(([key, list]) => ({
    key,
    toolId: list[0].toolId,
    label: list[0].label,
    unit: list[0].unit,
    value: list[0].value,
    meta: parseJSON(list[0].meta),
    observedAt: list[0].observedAt,
    history: list.map((r) => ({ value: r.value, observedAt: r.observedAt })).reverse(),
  }));
}

/** Full spine snapshot for one game. */
export async function getGameSnapshot(gameId: string) {
  const [history, ledger] = await Promise.all([getThesisHistory(gameId, 20), getLedger(gameId)]);
  return { thesis: history[0] || null, thesisHistory: history, ledger };
}
