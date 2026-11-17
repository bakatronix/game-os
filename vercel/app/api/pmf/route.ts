/**
 * PMF Analyzer data — everything Steam shows about one game, no API key.
 *
 *   GET ?appid=1794680
 *     → store data (reviews summary, tags, art, screenshots, trailer), monthly
 *       review history, SteamSpy playtime/owners, current players, global
 *       achievement rates and recent news.
 *   GET ?part=peers&tags=42804,4885&from=YYYY-MM-DD&to=YYYY-MM-DD
 *     → every game under those tags released in the window (Steam search rows),
 *       for percentile comparisons. Split out because it is the slow part.
 *
 * Steam's /appreviews endpoint now redirects automated requests, so review
 * counts come from IStoreBrowseService and the review histogram instead, and
 * playtime comes from SteamSpy rather than from review samples.
 */

import { NextRequest, NextResponse } from "next/server";
import { crawlByRelease } from "@/lib/steam-search";

export const runtime = "nodejs";
export const maxDuration = 60;

const IMG = "https://shared.akamai.steamstatic.com/store_item_assets/";
const VID = "https://video.akamai.steamstatic.com/store_trailers/";

function json(obj: unknown, status = 200, cache = "public, max-age=1800, s-maxage=21600, stale-while-revalidate=86400") {
  return NextResponse.json(obj, { status, headers: { "Cache-Control": status === 200 ? cache : "no-store" } });
}

async function get(url: string, timeout = 15000): Promise<any | null> {
  try {
    const r = await fetch(url, { headers: { Accept: "application/json" }, redirect: "manual", signal: AbortSignal.timeout(timeout) });
    if (!r.ok) return null;
    if (!(r.headers.get("content-type") || "").includes("json")) return null;
    return await r.json();
  } catch {
    return null;
  }
}

const ymd = (sec: number | null | undefined) => (sec ? new Date(sec * 1000).toISOString().slice(0, 10) : null);

let TAG_NAMES: Record<number, string> | null = null;
let TAG_AT = 0;
async function tagNames(): Promise<Record<number, string>> {
  if (TAG_NAMES && Date.now() - TAG_AT < 86400000) return TAG_NAMES;
  const d = await get("https://store.steampowered.com/tagdata/populartags/english");
  const map: Record<number, string> = {};
  if (Array.isArray(d)) d.forEach((t: any) => { if (t && t.tagid) map[Number(t.tagid)] = String(t.name); });
  if (Object.keys(map).length) { TAG_NAMES = map; TAG_AT = Date.now(); }
  return map;
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  if (sp.get("part") === "peers") return peers(sp);

  const appid = Number(sp.get("appid"));
  if (!Number.isInteger(appid) || appid <= 0 || appid > 1e8) return json({ error: "Pass a numeric Steam App ID in ?appid=" }, 400);

  const input = {
    ids: [{ appid }],
    context: { language: "english", country_code: "US" },
    data_request: {
      include_reviews: true, include_screenshots: true, include_assets: true, include_basic_info: true,
      include_tag_count: 20, include_trailers: true, include_release: true, include_platforms: true,
    },
  };
  const [items, hist, spy, players, ach, news, names] = await Promise.all([
    get("https://api.steampowered.com/IStoreBrowseService/GetItems/v1?input_json=" + encodeURIComponent(JSON.stringify(input))),
    get(`https://store.steampowered.com/appreviewhistogram/${appid}?l=english&review_score_preference=0`),
    get(`https://steamspy.com/api.php?request=appdetails&appid=${appid}`, 20000),
    get(`https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appid}`),
    get(`https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid=${appid}`),
    get(`https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${appid}&count=40&maxlength=240&feeds=steam_community_announcements`),
    tagNames(),
  ]);

  const it = items?.response?.store_items?.[0];
  if (!it || it.success !== 1 || !it.name) {
    return json({ error: "Steam has no store page for that App ID (or it isn't a released game)." }, 404, "no-store");
  }

  const fmt = String(it.assets?.asset_url_format || `steam/apps/${appid}/\${FILENAME}`);
  const asset = (f?: string) => (f ? IMG + fmt.replace("${FILENAME}", f) : null);
  const shots = (it.screenshots?.all_ages_screenshots || it.screenshots?.mature_content_screenshots || [])
    .slice(0, 16)
    .map((s: any) => {
      const f = String(s.filename || "");
      return { full: IMG + f, thumb: IMG + f.replace(/\.jpg(\?|$)/, ".600x338.jpg$1") };
    });
  const tr = it.trailers?.highlights?.[0];
  const micro = (type: string) => tr?.microtrailer?.find((m: any) => m.type === type)?.filename;
  const trailer = tr
    ? {
        name: tr.trailer_name || "Trailer",
        mp4: micro("video/mp4") ? VID + micro("video/mp4") : null,
        webm: micro("video/webm") ? VID + micro("video/webm") : null,
        poster: tr.screenshot_full ? IMG + String(tr.trailer_url_format || "steam/apps/${FILENAME}").replace("${FILENAME}", tr.screenshot_full) : null,
      }
    : null;

  const r = it.reviews?.summary_filtered || {};
  const res = hist?.results;
  const month = (sec: number) => new Date(sec * 1000).toISOString().slice(0, 7);
  const history = Array.isArray(res?.rollups)
    ? res.rollups.map((x: any) => ({ m: res.rollup_type === "week" ? ymd(x.date) : month(x.date), up: x.recommendations_up || 0, down: x.recommendations_down || 0 }))
    : [];
  const recent = Array.isArray(res?.recent)
    ? res.recent.map((x: any) => ({ d: ymd(x.date), up: x.recommendations_up || 0, down: x.recommendations_down || 0 }))
    : [];

  const achList: number[] = (ach?.achievementpercentages?.achievements || [])
    .map((a: any) => Number(a.percent))
    .filter((v: number) => Number.isFinite(v))
    .sort((a: number, b: number) => b - a);

  const now = Date.now() / 1000;
  const newsItems = (news?.appnews?.newsitems || []).map((n: any) => ({
    title: String(n.title || "").slice(0, 160),
    date: ymd(n.date),
    url: n.url,
    patch: /patch|hotfix|update|\bv?\d+\.\d+/i.test(String(n.title || "")) || (n.tags || []).includes("patchnotes"),
    age: (now - Number(n.date || 0)) / 86400,
  }));

  const tags = (it.tags || []).map((t: any) => ({ id: Number(t.tagid), name: names[Number(t.tagid)] || null, weight: Number(t.weight) || 0 }));
  const price = it.best_purchase_option ? Number(it.best_purchase_option.final_price_in_cents) : it.is_free ? 0 : null;
  const spyOk = spy && Number(spy.appid) === appid;

  return json({
    appid,
    name: it.name,
    url: `https://store.steampowered.com/app/${appid}/`,
    description: it.basic_info?.short_description || "",
    developers: (it.basic_info?.developers || []).map((d: any) => d.name),
    publishers: (it.basic_info?.publishers || []).map((d: any) => d.name),
    released: ymd(it.release?.steam_release_date),
    firstReleased: ymd(it.release?.original_steam_release_date),
    comingSoon: !!it.release?.is_coming_soon,
    earlyAccess: !!it.release?.is_early_access,
    price,
    priceLabel: it.best_purchase_option?.formatted_final_price || (price === 0 ? "Free" : null),
    platforms: { windows: !!it.platforms?.windows, mac: !!it.platforms?.mac, linux: !!it.platforms?.steamos_linux, deck: it.platforms?.steam_deck_compat_category ?? null },
    reviews: { total: r.review_count ?? null, pct: r.percent_positive ?? null, label: r.review_score_label || null },
    history,
    recent,
    tags,
    media: {
      header: asset(it.assets?.header),
      capsule: asset(it.assets?.main_capsule),
      hero: asset(it.assets?.library_hero) || asset(it.assets?.hero_capsule),
      background: asset(it.assets?.page_background),
      screenshots: shots,
      trailer,
    },
    players: {
      current: players?.response?.result === 1 ? players.response.player_count : null,
      peakYesterday: spyOk ? Number(spy.ccu) || null : null,
      owners: spyOk ? spy.owners || null : null,
      avgMinutes: spyOk ? Number(spy.average_forever) || 0 : null,
      medianMinutes: spyOk ? Number(spy.median_forever) || 0 : null,
      avg2wMinutes: spyOk ? Number(spy.average_2weeks) || 0 : null,
      median2wMinutes: spyOk ? Number(spy.median_2weeks) || 0 : null,
    },
    achievements: achList.length ? { count: achList.length, percents: achList } : null,
    news: newsItems.slice(0, 40),
    fetchedAt: new Date().toISOString(),
  });
}

async function peers(sp: URLSearchParams) {
  const tags = (sp.get("tags") || "").split(",").filter((t) => /^\d{1,8}$/.test(t)).map(Number).slice(0, 3);
  const from = sp.get("from") || "", to = sp.get("to") || "";
  if (!tags.length || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    return json({ error: "Pass ?part=peers&tags=…&from=YYYY-MM-DD&to=YYYY-MM-DD" }, 400);
  }
  try {
    const c = await crawlByRelease(Array.from(new Set(tags)).sort((a, b) => a - b), from, to, 60);
    return json({ tags, from, to, truncated: c.truncated, reached: c.reached, rows: c.rows }, 200,
      "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400");
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Failed to reach Steam" }, 502);
  }
}
