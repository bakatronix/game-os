/**
 * Sentiment Radar data: public Steam reviews, the review histogram and developer news for one app. No API keys.
 *
 *   ?appid=413150            → up to MAX_REVIEWS recent reviews (all languages), histogram, news
 *   ?appid=413150&max=200    → fewer reviews (the page asks for fewer per comp)
 *
 * Public data only, but the route answers only Game OS users who are already signed in (no extra step for
 * them), limited to RATE_MAX calls a minute per user. Nothing here is stored.
 * Steam rate-limits anonymous calls (HTTP 429). We cache in server memory for a few hours and never retry in a loop.
 * If Steam refuses or redirects the review request, we say so and add SteamSpy's public daily counts
 * as a labelled fallback (docs/PROJECT-GUIDE.md, rule 5). We never work around Steam's bot protection.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { createLimiter } from "@/lib/rate-limit";
import { get, readReviews } from "@/lib/steam-reviews";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Most reviews read per call for the studio's own game. The page says how many were read. */
const MAX_REVIEWS = 500;

/**
 * Caching. Answers go only to signed-in users, so the browser may keep them (private) but Vercel's shared
 * edge cache may not: an edge copy would be served to anyone, signed in or not. Steam is protected instead
 * by a cache in server memory, per instance: 3 hours for a good answer, 10 minutes when Steam refused.
 */
const OK_TTL_MS = 3 * 3600_000;
const SHORT_TTL_MS = 10 * 60_000;
const MAX_CACHED = 200; // entries kept per server instance; the oldest are dropped first
const OK_CACHE = "private, max-age=1800";
const SHORT_CACHE = "private, max-age=300";
const memo = new Map<string, { at: number; ttl: number; body: unknown }>();
function fromMemo(key: string, now = Date.now()) {
  const hit = memo.get(key);
  if (!hit) return null;
  if (now - hit.at > hit.ttl) { memo.delete(key); return null; }
  return hit;
}
function toMemo(key: string, body: unknown, ttl: number) {
  memo.delete(key);
  memo.set(key, { at: Date.now(), ttl, body });
  while (memo.size > MAX_CACHED) memo.delete(memo.keys().next().value as string);
}

/** Calls a minute per signed-in user. One read of your game is 1 call; comps are at most 5. */
const RATE_MAX = 30;
const limiter = createLimiter(RATE_MAX, 60_000);

/** SteamSpy's daily counts for one app: all-time positive and negative reviews and owners' playtime. */
async function steamSpy(appid: number) {
  const res = await get(`https://steamspy.com/api.php?request=appdetails&appid=${appid}`);
  if (!res.ok) return null;
  const d = res.data;
  const pos = Number(d?.positive), neg = Number(d?.negative);
  if (Number(d?.appid) !== appid || !(pos + neg > 0)) return null;
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : null);
  return {
    positive: pos,
    negative: neg,
    medianForeverMin: n(d?.median_forever), // all owners who played, not reviewers
    averageForeverMin: n(d?.average_forever),
    owners: typeof d?.owners === "string" ? d.owners.slice(0, 40) : null,
    source: "https://steamspy.com/about",
  };
}

export async function GET(request: NextRequest) {
  const user = await requireUser();
  if ("error" in user && user.error) {
    user.error.headers.set("Cache-Control", "no-store");
    return user.error;
  }
  if (!("user" in user) || !user.user) return NextResponse.json({ error: "Sign in required" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const wait = limiter.hit(String(user.user.id));
  if (wait) {
    return NextResponse.json(
      { error: "Too many requests. Try again in a minute.", retryAfter: wait },
      { status: 429, headers: { "Retry-After": String(wait), "Cache-Control": "no-store" } },
    );
  }

  const sp = request.nextUrl.searchParams;
  const raw = sp.get("appid") || "";
  if (!/^\d{1,9}$/.test(raw)) return NextResponse.json({ error: "Missing or invalid appid" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const appid = Number(raw);
  const asked = Number(sp.get("max"));
  const max = asked > 0 ? Math.min(MAX_REVIEWS, Math.floor(asked)) : MAX_REVIEWS;

  const key = `${appid}:${max}`;
  const cached = fromMemo(key);
  if (cached) return NextResponse.json(cached.body, { headers: { "Cache-Control": cached.ttl === OK_TTL_MS ? OK_CACHE : SHORT_CACHE } });

  const { body, ok } = await read(appid, max);
  toMemo(key, body, ok ? OK_TTL_MS : SHORT_TTL_MS);
  return NextResponse.json(body, { headers: { "Cache-Control": ok ? OK_CACHE : SHORT_CACHE } });
}

/** Everything for one app from Steam (and SteamSpy if Steam refuses the reviews). `ok` is false when Steam refused. */
async function read(appid: number, max: number) {
  const [rev, hist, news] = await Promise.all([
    readReviews(appid, max),
    get(`https://store.steampowered.com/appreviewhistogram/${appid}?l=english&review_score_preference=0`),
    get(`https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${appid}&count=20&maxlength=1&format=json`),
  ]);

  // Steam refused the reviews themselves: add SteamSpy's daily counts, clearly labelled, as a fallback.
  const spy = !rev.reviews.length && rev.reason ? await steamSpy(appid) : null;

  // Nothing at all came back: tell the page why, cache briefly, and let the user try later.
  if (!rev.reviews.length && !hist.ok && rev.reason) {
    return { body: { appid, unavailable: true, reason: rev.reason, steamspy: spy }, ok: false };
  }

  const h = hist.ok ? hist.data?.results : null;
  const body = {
    appid,
    fetchedAt: new Date().toISOString(),
    cap: max,
    read: rev.reviews.length,
    total: rev.total,
    partial: rev.reason ? rev.reason : null,
    steamspy: spy,
    reviews: rev.reviews,
    histogram: h
      ? {
          rollup_type: h.rollup_type || null,
          start_date: h.start_date || null,
          end_date: h.end_date || null,
          rollups: Array.isArray(h.rollups) ? h.rollups : [],
          recent: Array.isArray(h.recent) ? h.recent : [],
        }
      : null,
    news: news.ok && Array.isArray(news.data?.appnews?.newsitems)
      ? news.data.appnews.newsitems.map((n: any) => ({ title: String(n.title || "").slice(0, 200), url: n.url || null, date: n.date || null, feedname: n.feedname || null }))
      : [],
  };
  return { body, ok: !rev.reason };
}
