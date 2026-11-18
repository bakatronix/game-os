/**
 * Daily Steam snapshot: records a released game's Steam figures into its
 * signal ledger, so the Momentum Score moves without anyone pressing a button.
 * Used by the daily cron (/api/cron/steam-snapshot) and "Record now"
 * (/api/games/:id/steam-snapshot). Keyless Steam endpoints only.
 */
import { and, eq, gte, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { games, signals } from "@/db/schema";
import { recordSignals, type SignalInput } from "@/lib/spine";

export const SNAPSHOT_TOOL = "steam";

async function get(url: string): Promise<any | null> {
  try {
    const r = await fetch(url, { headers: { Accept: "application/json" }, redirect: "manual", signal: AbortSignal.timeout(15000) });
    if (!r.ok || !(r.headers.get("content-type") || "").includes("json")) return null;
    return await r.json();
  } catch {
    return null;
  }
}

/** Steam figures for one App ID, as ledger signals. Empty when Steam has nothing. */
export async function steamSignals(appid: number): Promise<SignalInput[]> {
  const input = {
    ids: [{ appid }],
    context: { language: "english", country_code: "US" },
    data_request: { include_reviews: true, include_release: true },
  };
  const [items, hist, players] = await Promise.all([
    get("https://api.steampowered.com/IStoreBrowseService/GetItems/v1?input_json=" + encodeURIComponent(JSON.stringify(input))),
    get(`https://store.steampowered.com/appreviewhistogram/${appid}?l=english&review_score_preference=0`),
    get(`https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appid}`),
  ]);
  const it = items?.response?.store_items?.[0];
  if (!it || it.success !== 1) return [];
  const out: SignalInput[] = [];
  const meta = { appid };
  const r = it.reviews?.summary_filtered;
  if (r && typeof r.review_count === "number") {
    out.push({ key: "steam_reviews", label: "Steam reviews", value: r.review_count, unit: "units", meta });
    if (typeof r.percent_positive === "number" && r.review_count > 0) {
      out.push({ key: "steam_review_pct", label: "Steam reviews positive", value: r.percent_positive, unit: "pct", meta });
    }
  }
  const recent: any[] = Array.isArray(hist?.results?.recent) ? hist.results.recent : [];
  if (recent.length) {
    const up = recent.reduce((a, x) => a + (x.recommendations_up || 0), 0);
    const down = recent.reduce((a, x) => a + (x.recommendations_down || 0), 0);
    out.push({ key: "steam_reviews_30d", label: "Steam reviews, last 30 days", value: up + down, unit: "units", meta });
    if (up + down >= 10) out.push({ key: "steam_review_pct_30d", label: "Positive, last 30 days", value: Math.round((up / (up + down)) * 1000) / 10, unit: "pct", meta });
  }
  if (players?.response?.result === 1 && typeof players.response.player_count === "number") {
    out.push({ key: "steam_players", label: "Playing on Steam now", value: players.response.player_count, unit: "units", meta });
  }
  return out;
}

/** Snapshot one game. Skips it if it already has a snapshot from the last 20 hours, unless `force`. */
export type SnapshotResult = { gameId: string; status: "no-app-id" | "fresh" | "no-steam-data" | "recorded" | "error"; recorded: number };

export async function snapshotGame(game: { id: string; steamAppId: string | null }, force = false, userId: string | null = null): Promise<SnapshotResult> {
  const appid = Number(game.steamAppId);
  if (!Number.isInteger(appid) || appid <= 0) return { gameId: game.id, status: "no-app-id", recorded: 0 };
  if (!force) {
    const since = new Date(Date.now() - 20 * 3600000);
    const recent = await getDb().select({ id: signals.id }).from(signals)
      .where(and(eq(signals.gameId, game.id), eq(signals.toolId, SNAPSHOT_TOOL), gte(signals.observedAt, since))).limit(1);
    if (recent.length) return { gameId: game.id, status: "fresh", recorded: 0 };
  }
  const list = await steamSignals(appid);
  if (!list.length) return { gameId: game.id, status: "no-steam-data", recorded: 0 };
  const rows = await recordSignals(userId, game.id, SNAPSHOT_TOOL, list);
  return { gameId: game.id, status: "recorded", recorded: rows.length };
}

/** Snapshot every game with a Steam App ID, a few at a time, within a time budget. */
export async function snapshotAll(budgetMs = 50000) {
  const started = Date.now();
  const list = await getDb().select({ id: games.id, steamAppId: games.steamAppId }).from(games).where(isNotNull(games.steamAppId)).limit(500);
  const results: SnapshotResult[] = [];
  for (let i = 0; i < list.length; i += 4) {
    if (Date.now() - started > budgetMs) break;
    results.push(...(await Promise.all(list.slice(i, i + 4).map((g) => snapshotGame(g).catch(() => ({ gameId: g.id, status: "error" as const, recorded: 0 }))))));
  }
  return { games: list.length, done: results.length, results };
}
