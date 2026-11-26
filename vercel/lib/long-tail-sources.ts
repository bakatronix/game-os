/**
 * Long Tail Engine: public Steam data for one released game (brief §5.7). No API keys.
 *
 *   - appreviewhistogram: review counts since release (weekly or monthly totals) plus daily counts for the last 30 days
 *   - appdetails: release date, list price (US store) and supported languages
 *   - ISteamNews/GetNewsForApp: the developer's announcements, with Steam's "patchnotes" tag where it is set
 *
 * Nothing here is stored or written to the ledger. Answers are kept in server memory for CACHE_MS, and the route
 * allows RATE_MAX calls a minute per signed-in user (owner's rule for external-backed routes, 26 Nov 2026).
 * If Steam refuses (429) or redirects a request, we say so and stop; we never retry in a loop (brief §2.7).
 */

import { createLimiter } from "./rate-limit";
import { createCache } from "./creator-sources";

/** Calls a minute per signed-in user. */
export const RATE_MAX = 30;
export const limiter = createLimiter(RATE_MAX, 60_000);

/** A full answer is cached this long; Steam's review counts and news change slowly. */
export const CACHE_MS = 3 * 3600_000;
/** An answer with a refused or failed part is cached briefly, so a retry a few minutes later can succeed. */
export const SHORT_CACHE_MS = 10 * 60_000;
/** Announcements read per game. GetNewsForApp returns the newest first. */
export const NEWS_COUNT = 100;

type Fetcher = typeof fetch;
type Got = { ok: true; data: any } | { ok: false; reason: string };

async function get(url: string, fetcher: Fetcher): Promise<Got> {
  try {
    const r = await fetcher(url, { headers: { Accept: "application/json" }, redirect: "manual", signal: AbortSignal.timeout(15000) });
    if (r.status === 429) return { ok: false, reason: "rate-limited" };
    if (r.status >= 300 && r.status < 400) return { ok: false, reason: "redirected" };
    if (!r.ok) return { ok: false, reason: `steam-${r.status}` };
    const type = r.headers?.get ? r.headers.get("content-type") || "" : "application/json";
    if (!type.includes("json")) return { ok: false, reason: "not-json" };
    return { ok: true, data: await r.json() };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}

export const histogramUrl = (appid: number) => `https://store.steampowered.com/appreviewhistogram/${appid}?l=english&review_score_preference=0`;
export const detailsUrl = (appid: number) => `https://store.steampowered.com/api/appdetails?appids=${appid}&cc=us&l=english`;
export const newsUrl = (appid: number) =>
  `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${appid}&count=${NEWS_COUNT}&maxlength=1&feeds=steam_community_announcements&format=json`;

/** Plain language names from appdetails' supported_languages HTML ("English<strong>*</strong>, French<br>..."). */
export function parseLanguages(html: unknown): string[] {
  if (typeof html !== "string") return [];
  const text = html
    .replace(/<br\s*\/?>[\s\S]*$/i, "") // the footnote after <br> explains the asterisk
    .replace(/<[^>]*>/g, "")
    .replace(/\*/g, "");
  const seen = new Set<string>();
  return text.split(",").map((s) => s.trim()).filter((s) => s && s.length <= 40 && !seen.has(s) && (seen.add(s), true)).slice(0, 60);
}

function shapeHistogram(h: any) {
  const r = h?.results;
  if (!r) return null;
  const n = (x: any) => ({ date: Number(x?.date) || null, up: Number(x?.recommendations_up) || 0, down: Number(x?.recommendations_down) || 0 });
  return {
    rollup_type: r.rollup_type === "week" || r.rollup_type === "month" ? r.rollup_type : null,
    start_date: Number(r.start_date) || null,
    end_date: Number(r.end_date) || null,
    rollups: (Array.isArray(r.rollups) ? r.rollups : []).map(n).filter((x: any) => x.date),
    recent: (Array.isArray(r.recent) ? r.recent : []).map(n).filter((x: any) => x.date),
  };
}

function shapeDetails(d: any, appid: number) {
  const e = d?.[String(appid)];
  if (!e || e.success !== true || !e.data) return null;
  const x = e.data;
  const p = x.price_overview;
  return {
    name: typeof x.name === "string" ? x.name.slice(0, 200) : null,
    type: typeof x.type === "string" ? x.type : null,
    free: x.is_free === true,
    releaseText: typeof x.release_date?.date === "string" ? x.release_date.date.slice(0, 40) : null,
    comingSoon: x.release_date?.coming_soon === true,
    // US list price before any discount, in cents. Only when Steam answered in US dollars.
    priceCents: p && p.currency === "USD" && Number.isFinite(Number(p.initial)) ? Number(p.initial) : null,
    discountPercent: p && Number.isFinite(Number(p.discount_percent)) ? Number(p.discount_percent) : null,
    languages: parseLanguages(x.supported_languages),
    earlyAccess: Array.isArray(x.genres) && x.genres.some((g: any) => String(g?.description || "").toLowerCase() === "early access"),
  };
}

function shapeNews(d: any) {
  const items: any[] = Array.isArray(d?.appnews?.newsitems) ? d.appnews.newsitems : [];
  return items.map((n) => ({
    title: String(n?.title || "").slice(0, 200),
    url: typeof n?.url === "string" && /^https:\/\//.test(n.url) ? n.url : null,
    date: Number(n?.date) || null,
    patchnotes: Array.isArray(n?.tags) && n.tags.includes("patchnotes"),
  })).filter((n) => n.date);
}

export type TailData = {
  appid: number;
  fetchedAt: string;
  histogram: ReturnType<typeof shapeHistogram>;
  details: ReturnType<typeof shapeDetails>;
  news: ReturnType<typeof shapeNews>;
  /** Parts Steam refused or that failed, with the reason. Empty when everything came back. */
  missing: { part: "histogram" | "details" | "news"; reason: string }[];
};

const cache = createCache<{ body: TailData; ttl: number; at: number }>(CACHE_MS, 300);
export function _resetCache() { cache.clear(); }

/** Read all three parts for one app, from cache when fresh. */
export async function tailData(appid: number, opts: { fetcher?: Fetcher; now?: number } = {}): Promise<{ body: TailData; cached: boolean; complete: boolean }> {
  const now = opts.now ?? Date.now();
  const hit = cache.get(String(appid), now);
  if (hit && now - hit.at <= hit.ttl) return { body: hit.body, cached: true, complete: hit.ttl === CACHE_MS };
  const f = opts.fetcher || fetch;
  const [h, d, n] = await Promise.all([get(histogramUrl(appid), f), get(detailsUrl(appid), f), get(newsUrl(appid), f)]);
  const missing: TailData["missing"] = [];
  const histogram = h.ok ? shapeHistogram(h.data) : null;
  if (!h.ok) missing.push({ part: "histogram", reason: h.reason });
  else if (!histogram) missing.push({ part: "histogram", reason: "empty" });
  const details = d.ok ? shapeDetails(d.data, appid) : null;
  if (!d.ok) missing.push({ part: "details", reason: d.reason });
  else if (!details) missing.push({ part: "details", reason: "empty" });
  const news = n.ok ? shapeNews(n.data) : [];
  if (!n.ok) missing.push({ part: "news", reason: n.reason });
  const body: TailData = { appid, fetchedAt: new Date(now).toISOString(), histogram, details, news, missing };
  const complete = missing.length === 0;
  cache.set(String(appid), { body, ttl: complete ? CACHE_MS : SHORT_CACHE_MS, at: now }, now);
  return { body, cached: false, complete };
}
