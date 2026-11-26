/**
 * Sentiment Radar data: public Steam reviews, the review histogram and developer news for one app. No API keys.
 *
 *   ?appid=413150            → up to MAX_REVIEWS recent reviews (all languages), histogram, news
 *   ?appid=413150&max=200    → fewer reviews (the page asks for fewer per comp)
 *
 * Public data only, but the route answers only Game OS users who are already signed in (no extra step for
 * them), limited to RATE_MAX calls a minute per user. Nothing here is stored.
 * Steam rate-limits anonymous calls (HTTP 429). We cache for a few hours and never retry in a loop.
 * If Steam refuses or redirects the review request, we say so and add SteamSpy's public daily counts
 * as a labelled fallback (docs/PROJECT-GUIDE.md, rule 5). We never work around Steam's bot protection.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { createLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Most reviews read per call for the studio's own game. The page says how many were read. */
const MAX_REVIEWS = 500;
/** Steam's page size for GetAppReviews. */
const PER_PAGE = 100;
/** Review text kept per review; enough for snippets, not a copy of the review. */
const TEXT_CHARS = 600;

const OK_CACHE = "public, max-age=1800, s-maxage=10800, stale-while-revalidate=3600";
const SHORT_CACHE = "public, max-age=300, s-maxage=600";

/** Calls a minute per signed-in user. One read of your game is 1 call; comps are at most 5. */
const RATE_MAX = 30;
const limiter = createLimiter(RATE_MAX, 60_000);

type Got = { ok: true; data: any } | { ok: false; reason: string };

async function get(url: string): Promise<Got> {
  try {
    const r = await fetch(url, { headers: { Accept: "application/json" }, redirect: "manual", signal: AbortSignal.timeout(15000) });
    if (r.status === 429) return { ok: false, reason: "rate-limited" };
    if (r.status >= 300 && r.status < 400) return { ok: false, reason: "redirected" };
    if (!r.ok) return { ok: false, reason: `steam-${r.status}` };
    if (!(r.headers.get("content-type") || "").includes("json")) return { ok: false, reason: "not-json" };
    return { ok: true, data: await r.json() };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}

function reviewsUrl(appid: number, cursor: string, num: number) {
  const input = { appid, filter: "recent", language: "all", cursor, num_per_page: num, review_type: "all", purchase_type: "all" };
  return "https://api.steampowered.com/IUserReviewsService/GetAppReviews/v1/?input_json=" + encodeURIComponent(JSON.stringify(input));
}

function slim(appid: number, r: any) {
  const steamid = r?.author?.steamid ? String(r.author.steamid) : null;
  const pt = Number(r?.author?.playtime_at_review);
  return {
    id: String(r?.recommendationid ?? ""),
    up: !!r?.voted_up,
    playtime: Number.isFinite(pt) ? pt : null, // minutes
    created: Number(r?.timestamp_created) || null, // unix seconds
    lang: r?.language || null,
    text: String(r?.review || "").slice(0, TEXT_CHARS),
    url: steamid ? `https://steamcommunity.com/profiles/${steamid}/recommended/${appid}/` : null,
  };
}

async function readReviews(appid: number, max: number) {
  const out: ReturnType<typeof slim>[] = [];
  let cursor = "*";
  let total: number | null = null;
  let reason: string | null = null;
  const seen = new Set<string>();
  while (out.length < max) {
    const res = await get(reviewsUrl(appid, cursor, Math.min(PER_PAGE, max - out.length)));
    if (!res.ok) { reason = res.reason; break; }
    const body = res.data?.response ?? res.data;
    if (total == null && typeof body?.query_summary?.total_reviews === "number") total = body.query_summary.total_reviews;
    const list: any[] = Array.isArray(body?.reviews) ? body.reviews : [];
    if (!list.length) break;
    for (const r of list) {
      const s = slim(appid, r);
      if (s.id && seen.has(s.id)) continue;
      if (s.id) seen.add(s.id);
      out.push(s);
    }
    const next = body?.cursor;
    if (!next || next === cursor) break;
    cursor = next;
  }
  return { reviews: out.slice(0, max), total, reason };
}

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
  if ("error" in user) return user.error;
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

  const [rev, hist, news] = await Promise.all([
    readReviews(appid, max),
    get(`https://store.steampowered.com/appreviewhistogram/${appid}?l=english&review_score_preference=0`),
    get(`https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${appid}&count=20&maxlength=1&format=json`),
  ]);

  // Steam refused the reviews themselves: add SteamSpy's daily counts, clearly labelled, as a fallback.
  const spy = !rev.reviews.length && rev.reason ? await steamSpy(appid) : null;

  // Nothing at all came back: tell the page why, cache briefly, and let the user try later.
  if (!rev.reviews.length && !hist.ok && rev.reason) {
    return NextResponse.json(
      { appid, unavailable: true, reason: rev.reason, steamspy: spy },
      { headers: { "Cache-Control": SHORT_CACHE } },
    );
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
  return NextResponse.json(body, { headers: { "Cache-Control": rev.reason ? SHORT_CACHE : OK_CACHE } });
}
