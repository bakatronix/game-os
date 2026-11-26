/**
 * Creator Match: live YouTube and Twitch lookups (brief §5.3, §3).
 *
 * Both sources are display-only. Nothing from either API is written to the database or the signal ledger,
 * nothing is summed or ranked, and results are kept in server memory only for a short cache:
 *   - YouTube Data API: search.list costs 100 quota units a call against a default of 10,000 a day, so the page
 *     searches only when someone presses the button, and each query is cached for YT_CACHE_MS.
 *   - Twitch Helix: "who is streaming this game right now", cached for TWITCH_CACHE_MS. No history is kept.
 * Without keys (YOUTUBE_API_KEY, TWITCH_CLIENT_ID + TWITCH_CLIENT_SECRET) each lookup answers `configured: false`.
 */

import { createLimiter } from "./rate-limit";

/** Calls a minute per signed-in user, across both Creator Match routes (owner's rule for external-backed routes). */
export const RATE_MAX = 30;
export const limiter = createLimiter(RATE_MAX, 60_000);

/** One YouTube search is cached this long, so repeat views don't spend quota. */
export const YT_CACHE_MS = 6 * 3600_000;
/** Most YouTube searches one server instance makes a day; a guard against draining the shared 10,000-unit quota. */
export const YT_DAILY_SEARCHES = 80;
/** Videos shown per search. */
export const YT_RESULTS = 12;
/** Comp searches look back this many days, for "recent videos about that comp". */
export const YT_COMP_DAYS = 365;
/** Live streams are cached briefly: the list is "right now", and Twitch restricts storing it. */
export const TWITCH_CACHE_MS = 2 * 60_000;
/** Streams shown per game. */
export const TWITCH_RESULTS = 20;

export const YT_QUOTA_SOURCE = "https://developers.google.com/youtube/v3/determine_quota_cost";
export const YT_POLICY_SOURCE = "https://developers.google.com/youtube/terms/developer-policies";

type Fetcher = typeof fetch;

/* ---------------- Small TTL cache ---------------- */

export function createCache<T>(ttlMs: number, maxKeys = 500) {
  const m = new Map<string, { at: number; value: T }>();
  return {
    get(key: string, now = Date.now()): T | undefined {
      const e = m.get(key);
      if (!e) return undefined;
      if (now - e.at > ttlMs) { m.delete(key); return undefined; }
      return e.value;
    },
    set(key: string, value: T, now = Date.now()) {
      m.set(key, { at: now, value });
      if (m.size > maxKeys) { const first = m.keys().next().value; if (first !== undefined) m.delete(first); }
    },
    clear() { m.clear(); },
  };
}

/** A per-UTC-day counter. Returns false once `max` is used up for today. */
export function createDailyBudget(max: number) {
  let day = "", used = 0;
  return {
    take(now = Date.now()) {
      const d = new Date(now).toISOString().slice(0, 10);
      if (d !== day) { day = d; used = 0; }
      if (used >= max) return false;
      used++;
      return true;
    },
    reset() { day = ""; used = 0; },
  };
}

/** Trim and bound a search phrase. Empty or too long gives null. */
export function cleanQuery(raw: string | null): string | null {
  const q = String(raw || "").replace(/[\u0000-\u001f"]/g, " ").replace(/\s+/g, " ").trim();
  if (!q || q.length > 100) return null;
  return q;
}

/* ---------------- YouTube ---------------- */

export type YtVideo = {
  id: string; title: string; channel: string; channelId: string | null; publishedAt: string | null;
  views: string | null; url: string; channelUrl: string | null; thumb: string | null;
};

/** Shape search.list + videos.list responses into display rows, in YouTube's order. View counts are as YouTube returns them. */
export function shapeYouTube(search: any, videos: any): YtVideo[] {
  const stats: Record<string, string | null> = {};
  for (const v of Array.isArray(videos?.items) ? videos.items : []) {
    if (v?.id) stats[String(v.id)] = v?.statistics?.viewCount != null ? String(v.statistics.viewCount) : null;
  }
  const out: YtVideo[] = [];
  for (const it of Array.isArray(search?.items) ? search.items : []) {
    const id = it?.id?.videoId;
    if (!id || typeof id !== "string") continue;
    const s = it.snippet || {};
    const ch = s.channelId ? String(s.channelId) : null;
    out.push({
      id,
      title: String(s.title || "").slice(0, 200),
      channel: String(s.channelTitle || "").slice(0, 120),
      channelId: ch,
      publishedAt: s.publishedAt ? String(s.publishedAt) : null,
      views: id in stats ? stats[id] : null,
      url: "https://www.youtube.com/watch?v=" + encodeURIComponent(id),
      channelUrl: ch ? "https://www.youtube.com/channel/" + encodeURIComponent(ch) : null,
      thumb: s.thumbnails?.default?.url ? String(s.thumbnails.default.url) : null,
    });
  }
  return out;
}

const ytCache = createCache<any>(YT_CACHE_MS);
const ytBudget = createDailyBudget(YT_DAILY_SEARCHES);
export function _resetYouTube() { ytCache.clear(); ytBudget.reset(); }

async function getJson(f: Fetcher, url: string, init?: RequestInit): Promise<{ ok: true; data: any } | { ok: false; status: number }> {
  try {
    const r = await f(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(12000) });
    if (!r.ok) return { ok: false, status: r.status };
    return { ok: true, data: await r.json() };
  } catch {
    return { ok: false, status: 0 };
  }
}

/**
 * Search YouTube for a phrase in quotes. `recentDays` limits to videos published in that many days.
 * Returns { configured, videos, fetchedAt, cached } or { configured, error }.
 */
export async function youtubeSearch(q: string, recentDays: number | null, opts: { key?: string; fetcher?: Fetcher; now?: number } = {}) {
  const key = opts.key ?? process.env.YOUTUBE_API_KEY;
  if (!key) return { configured: false as const };
  const f = opts.fetcher ?? fetch;
  const now = opts.now ?? Date.now();
  const ck = q.toLowerCase() + "|" + (recentDays || 0);
  const hit = ytCache.get(ck, now);
  if (hit) return { ...hit, cached: true };
  if (!ytBudget.take(now)) return { configured: true as const, error: "budget", videos: [] as YtVideo[] };

  const p = new URLSearchParams({ part: "snippet", type: "video", maxResults: String(YT_RESULTS), q: `"${q}"`, order: "relevance", key });
  if (recentDays) p.set("publishedAfter", new Date(now - recentDays * 86400_000).toISOString().replace(/\.\d{3}Z$/, "Z"));
  const s = await getJson(f, "https://www.googleapis.com/youtube/v3/search?" + p.toString());
  if (!s.ok) return { configured: true as const, error: s.status === 403 ? "quota" : "unavailable", videos: [] as YtVideo[] };
  const ids = (Array.isArray(s.data?.items) ? s.data.items : []).map((i: any) => i?.id?.videoId).filter((x: any) => typeof x === "string");
  let v: any = null;
  if (ids.length) {
    const vp = new URLSearchParams({ part: "statistics", id: ids.join(","), key });
    const r = await getJson(f, "https://www.googleapis.com/youtube/v3/videos?" + vp.toString());
    if (r.ok) v = r.data;
  }
  const body = { configured: true as const, query: q, recentDays: recentDays || null, videos: shapeYouTube(s.data, v), fetchedAt: new Date(now).toISOString() };
  ytCache.set(ck, body, now);
  return { ...body, cached: false };
}

/* ---------------- Twitch ---------------- */

export type TwStream = { user: string; login: string; title: string; viewers: number | null; startedAt: string | null; language: string | null; url: string };

export function shapeStreams(streams: any): TwStream[] {
  const out: TwStream[] = [];
  for (const s of Array.isArray(streams?.data) ? streams.data : []) {
    const login = String(s?.user_login || "");
    if (!/^[a-z0-9_]{1,40}$/i.test(login)) continue;
    out.push({
      user: String(s.user_name || login).slice(0, 60),
      login,
      title: String(s.title || "").slice(0, 200),
      viewers: Number.isFinite(Number(s.viewer_count)) ? Number(s.viewer_count) : null,
      startedAt: s.started_at ? String(s.started_at) : null,
      language: s.language ? String(s.language).slice(0, 8) : null,
      url: "https://www.twitch.tv/" + login,
    });
  }
  return out;
}

let token: { value: string; until: number } | null = null;
const twCache = createCache<any>(TWITCH_CACHE_MS);
export function _resetTwitch() { token = null; twCache.clear(); }

async function appToken(f: Fetcher, id: string, secret: string, now: number): Promise<string | null> {
  if (token && token.until > now + 60_000) return token.value;
  const p = new URLSearchParams({ client_id: id, client_secret: secret, grant_type: "client_credentials" });
  const r = await getJson(f, "https://id.twitch.tv/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: p.toString() });
  if (!r.ok || typeof r.data?.access_token !== "string") return null;
  token = { value: r.data.access_token, until: now + Math.max(60, Number(r.data.expires_in) || 3600) * 1000 };
  return token.value;
}

/** Who is streaming a game (by its Twitch category name) right now. Nothing is kept beyond the short cache. */
export async function twitchLive(name: string, opts: { id?: string; secret?: string; fetcher?: Fetcher; now?: number } = {}) {
  const id = opts.id ?? process.env.TWITCH_CLIENT_ID;
  const secret = opts.secret ?? process.env.TWITCH_CLIENT_SECRET;
  if (!id || !secret) return { configured: false as const };
  const f = opts.fetcher ?? fetch;
  const now = opts.now ?? Date.now();
  const ck = name.toLowerCase();
  const hit = twCache.get(ck, now);
  if (hit) return { ...hit, cached: true };

  const t = await appToken(f, id, secret, now);
  if (!t) return { configured: true as const, error: "auth", streams: [] as TwStream[] };
  const headers = { "Client-Id": id, Authorization: "Bearer " + t };
  const g = await getJson(f, "https://api.twitch.tv/helix/games?name=" + encodeURIComponent(name), { headers });
  if (!g.ok) { if (g.status === 401) token = null; return { configured: true as const, error: g.status === 429 ? "rate-limited" : "unavailable", streams: [] as TwStream[] }; }
  const game = Array.isArray(g.data?.data) ? g.data.data[0] : null;
  let body: any;
  if (!game?.id) body = { configured: true, name, found: false, streams: [], fetchedAt: new Date(now).toISOString() };
  else {
    const s = await getJson(f, `https://api.twitch.tv/helix/streams?game_id=${encodeURIComponent(String(game.id))}&first=${TWITCH_RESULTS}`, { headers });
    if (!s.ok) return { configured: true as const, error: s.status === 429 ? "rate-limited" : "unavailable", streams: [] as TwStream[] };
    body = { configured: true, name, found: true, category: String(game.name || name).slice(0, 120), streams: shapeStreams(s.data), fetchedAt: new Date(now).toISOString() };
  }
  twCache.set(ck, body, now);
  return { ...body, cached: false };
}
