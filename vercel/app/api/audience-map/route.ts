/**
 * Audience Map data — where a game's comp audience gathers, and how they talk. No API keys.
 *
 *   ?part=search&q=hades          → Steam store search (to add comps / resolve thesis comp names)
 *   ?part=comps&ids=1,2,3         → per comp (max 8): official links (Discord with live member
 *                                    counts), player tags with vote weights, "more like this"
 *                                    App IDs, and recent Steam discussion titles
 *   ?part=games&ids=1,2,3         → name, reviews, capsule and links for neighbouring games (max 16)
 *   ?part=name&q=My Game          → name check: Steam games with that name, and .com registration
 *
 * Reddit blocks automated requests, so subreddit links are passed through without member counts.
 */

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const IMG = "https://shared.akamai.steamstatic.com/store_item_assets/";
const UA = "Mozilla/5.0 (compatible; GameOS-AudienceMap/1.0)";

function json(obj: unknown, status = 200, cache = "public, max-age=1800, s-maxage=43200, stale-while-revalidate=86400") {
  return NextResponse.json(obj, { status, headers: { "Cache-Control": status === 200 ? cache : "no-store" } });
}
async function getJson(url: string, timeout = 15000): Promise<any | null> {
  try {
    const r = await fetch(url, { headers: { Accept: "application/json", "User-Agent": UA }, redirect: "manual", signal: AbortSignal.timeout(timeout) });
    if (!r.ok || !(r.headers.get("content-type") || "").includes("json")) return null;
    return await r.json();
  } catch { return null; }
}
async function getText(url: string, timeout = 15000): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Cookie: "birthtime=0; lastagecheckage=1-0-1990; wants_mature_content=1" }, signal: AbortSignal.timeout(timeout) });
    return r.ok ? await r.text() : null;
  } catch { return null; }
}
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
function ids(sp: URLSearchParams, max: number) {
  return Array.from(new Set((sp.get("ids") || "").split(",").filter((x) => /^\d{1,9}$/.test(x)).map(Number))).slice(0, max);
}

let TAGS: Record<number, string> | null = null;
async function tagNames() {
  if (TAGS) return TAGS;
  const d = await getJson("https://store.steampowered.com/tagdata/populartags/english");
  const m: Record<number, string> = {};
  if (Array.isArray(d)) d.forEach((t: any) => { m[Number(t.tagid)] = String(t.name); });
  if (Object.keys(m).length) TAGS = m;
  return m;
}

async function storeItems(appids: number[], req: Record<string, boolean | number>) {
  if (!appids.length) return [];
  const input = { ids: appids.map((appid) => ({ appid })), context: { language: "english", country_code: "US" }, data_request: req };
  const d = await getJson("https://api.steampowered.com/IStoreBrowseService/GetItems/v1?input_json=" + encodeURIComponent(JSON.stringify(input)));
  return (d?.response?.store_items || []).filter((i: any) => i && i.success === 1);
}

const LINK_TYPES: Record<number, string> = { 1: "youtube", 2: "facebook", 3: "x", 4: "twitch", 5: "discord", 14: "tiktok" };
function classify(url: string): string {
  if (/discord\.(gg|com\/invite)\//i.test(url)) return "discord";
  if (/reddit\.com\/r\//i.test(url)) return "reddit";
  if (/youtube\.com|youtu\.be/i.test(url)) return "youtube";
  if (/(twitter|x)\.com\//i.test(url)) return "x";
  if (/tiktok\.com/i.test(url)) return "tiktok";
  if (/twitch\.tv/i.test(url)) return "twitch";
  if (/facebook\.com/i.test(url)) return "facebook";
  if (/instagram\.com/i.test(url)) return "instagram";
  if (/bsky\.app/i.test(url)) return "bluesky";
  return "web";
}

const discordCache = new Map<string, { at: number; v: any }>();
async function discord(url: string) {
  const code = (url.match(/discord\.(?:gg|com\/invite)\/([A-Za-z0-9-]+)/i) || [])[1];
  if (!code) return null;
  const hit = discordCache.get(code);
  if (hit && Date.now() - hit.at < 3600000) return hit.v;
  const d = await getJson(`https://discord.com/api/v9/invites/${encodeURIComponent(code)}?with_counts=true`, 10000);
  const v = d && d.guild ? { server: d.guild.name, members: d.approximate_member_count ?? null, online: d.approximate_presence_count ?? null } : null;
  discordCache.set(code, { at: Date.now(), v });
  return v;
}

async function moreLike(appid: number): Promise<number[]> {
  const html = await getText(`https://store.steampowered.com/recommended/morelike/app/${appid}/`);
  if (!html) return [];
  const out: number[] = [];
  for (const m of html.matchAll(/data-ds-appid="(\d+)"/g)) {
    const id = Number(m[1]);
    if (id !== appid && !out.includes(id)) out.push(id);
  }
  return out.slice(0, 24);
}

async function discussions(appid: number): Promise<{ title: string; replies: number | null }[]> {
  const pages = await Promise.all([1, 2, 3].map((p) => getText(`https://steamcommunity.com/app/${appid}/discussions/0/?fp=${p}`)));
  const out: { title: string; replies: number | null }[] = [];
  pages.forEach((html) => {
    if (!html) return;
    for (const block of html.split('class="forum_topic ').slice(1)) {
      const t = (block.match(/class="forum_topic_name[^"]*"[^>]*>([\s\S]*?)<\/div>/) || [])[1];
      if (!t) continue;
      const title = decode(t.replace(/<[^>]+>/g, " ")).replace(/^\s*(PINNED|MOVED|LOCKED):\s*/i, "").replace(/\s+/g, " ").trim();
      if (!title || /PINNED:/i.test(t)) continue;
      const rep = (block.match(/forum_topic_reply_count[^>]*>[\s\S]*?([\d,]+)/) || [])[1];
      out.push({ title: title.slice(0, 160), replies: rep ? Number(rep.replace(/,/g, "")) : null });
    }
  });
  return out.slice(0, 60);
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const part = sp.get("part");

  if (part === "search") {
    const q = (sp.get("q") || "").trim().slice(0, 80);
    if (!q) return json({ error: "Pass ?q=" }, 400);
    const d = await getJson(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(q)}&cc=us&l=english`);
    const items = (d?.items || []).filter((i: any) => i.type === "app").slice(0, 10).map((i: any) => ({ appid: i.id, name: i.name, img: i.tiny_image || null }));
    return json({ items });
  }

  if (part === "comps") {
    const list = ids(sp, 8);
    if (!list.length) return json({ error: "Pass ?ids=" }, 400);
    const [items, names] = await Promise.all([
      storeItems(list, { include_links: true, include_tag_count: 20, include_reviews: true, include_assets: true, include_basic_info: true }),
      tagNames(),
    ]);
    const comps = await Promise.all(items.map(async (it: any) => {
      const fmt = String(it.assets?.asset_url_format || `steam/apps/${it.appid}/\${FILENAME}`);
      const links = (it.links || []).map((l: any) => ({ type: LINK_TYPES[l.link_type] || classify(String(l.url)), url: String(l.url) }));
      const [counts, like, talk] = await Promise.all([
        Promise.all(links.map((l: any) => (l.type === "discord" ? discord(l.url) : Promise.resolve(null)))),
        moreLike(it.appid),
        discussions(it.appid),
      ]);
      links.forEach((l: any, i: number) => { if (counts[i]) l.discord = counts[i]; });
      return {
        appid: it.appid, name: it.name,
        capsule: it.assets?.small_capsule ? IMG + fmt.replace("${FILENAME}", it.assets.small_capsule) : null,
        reviews: it.reviews?.summary_filtered?.review_count ?? null,
        pct: it.reviews?.summary_filtered?.percent_positive ?? null,
        developers: (it.basic_info?.developers || []).map((d: any) => d.name),
        tags: (it.tags || []).map((t: any) => ({ id: Number(t.tagid), name: names[Number(t.tagid)] || null, weight: Number(t.weight) || 0 })),
        links, moreLike: like, discussions: talk,
      };
    }));
    return json({ comps, fetchedAt: new Date().toISOString() });
  }

  if (part === "games") {
    const list = ids(sp, 16);
    if (!list.length) return json({ games: [] });
    const items = await storeItems(list, { include_links: true, include_reviews: true, include_assets: true });
    const games = await Promise.all(items.map(async (it: any) => {
      const fmt = String(it.assets?.asset_url_format || `steam/apps/${it.appid}/\${FILENAME}`);
      const links = (it.links || []).map((l: any) => ({ type: LINK_TYPES[l.link_type] || classify(String(l.url)), url: String(l.url) }));
      const d = links.find((l: any) => l.type === "discord");
      if (d) d.discord = await discord(d.url);
      return {
        appid: it.appid, name: it.name,
        capsule: it.assets?.small_capsule ? IMG + fmt.replace("${FILENAME}", it.assets.small_capsule) : null,
        reviews: it.reviews?.summary_filtered?.review_count ?? null,
        pct: it.reviews?.summary_filtered?.percent_positive ?? null,
        links,
      };
    }));
    return json({ games });
  }

  if (part === "name") {
    const q = (sp.get("q") || "").trim().slice(0, 80);
    if (!q) return json({ error: "Pass ?q=" }, 400);
    const slug = q.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
    const [search, rdap] = await Promise.all([
      getJson(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(q)}&cc=us&l=english`),
      slug.length >= 2 && slug.length <= 63
        ? fetch(`https://rdap.verisign.com/com/v1/domain/${slug}.com`, { signal: AbortSignal.timeout(10000) }).then((r) => r.status).catch(() => 0)
        : Promise.resolve(0),
    ]);
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const items = (search?.items || []).slice(0, 10).map((i: any) => ({ appid: i.id, name: i.name, img: i.tiny_image || null, exact: norm(i.name) === norm(q) }));
    return json({
      name: q, steam: items,
      domain: { name: slug ? slug + ".com" : null, status: rdap === 404 ? "available" : rdap === 200 ? "registered" : "unknown" },
    }, 200, "public, max-age=600, s-maxage=3600");
  }

  return json({ error: "Unknown part" }, 400);
}
