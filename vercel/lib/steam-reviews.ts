/**
 * Public Steam reviews for one app, shared by Sentiment Radar's routes (/api/sentiment-radar and its themes
 * route). GetAppReviews needs no key. Steam rate-limits anonymous calls (HTTP 429): we stop at the first
 * refusal and say why, and never retry in a loop or work around a redirect.
 */

/** Steam's page size for GetAppReviews. */
export const PER_PAGE = 100;
/** Review text kept per review; enough for snippets, not a copy of the review. */
export const TEXT_CHARS = 600;

export type Got = { ok: true; data: any } | { ok: false; reason: string };

export async function get(url: string): Promise<Got> {
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

export type SlimReview = {
  id: string;
  up: boolean;
  playtime: number | null; // minutes
  created: number | null; // unix seconds
  lang: string | null;
  text: string;
  url: string | null;
};

function slim(appid: number, r: any): SlimReview {
  const steamid = r?.author?.steamid ? String(r.author.steamid) : null;
  const pt = Number(r?.author?.playtime_at_review);
  return {
    id: String(r?.recommendationid ?? ""),
    up: !!r?.voted_up,
    playtime: Number.isFinite(pt) ? pt : null,
    created: Number(r?.timestamp_created) || null,
    lang: r?.language || null,
    text: String(r?.review || "").slice(0, TEXT_CHARS),
    url: steamid ? `https://steamcommunity.com/profiles/${steamid}/recommended/${appid}/` : null,
  };
}

/** Up to `max` most recent reviews in all languages. `reason` is set when Steam stopped answering part-way. */
export async function readReviews(appid: number, max: number) {
  const out: SlimReview[] = [];
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
