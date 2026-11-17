/**
 * Market Scope data — Steam search crawl, no API key needed.
 *
 * Routes (query string):
 *   ?list=tags                 → Steam's popular tag list [{ tagid, name }]
 *   ?tags=1716,1662[&months=36] → every game released under ALL those tags in
 *                                 the last `months` months (newest first), as
 *                                 compact rows the browser turns into estimates.
 *
 * Row: [appid, name, "YYYY-MM-DD", listPriceCents, reviews, positivePct, tagids[]]
 * reviews/pct are null when Steam shows no review summary (too few reviews).
 *
 * Steam's search sorts by release date, 100 rows a page. We crawl pages in
 * parallel batches until a row is older than the cutoff, capped at MAX_PAGES;
 * if the cap is hit, `truncated` is true and `reached` is the oldest date seen.
 */

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const PAGE = 100;
const MAX_PAGES = 80;
const BATCH = 6;
const MAX_TAGS = 5;

type Row = [number, string, string, number | null, number | null, number | null, number[]];

function json(obj: unknown, status = 200, cache = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400") {
  return NextResponse.json(obj, { status, headers: { "Cache-Control": status === 200 ? cache : "no-store" } });
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;

  if (sp.get("list") === "tags") return fetchTags();

  const raw = (sp.get("tags") || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!raw.length || raw.length > MAX_TAGS || !raw.every((t) => /^\d{1,8}$/.test(t))) {
    return json({ error: `Pass 1–${MAX_TAGS} numeric Steam tag ids in ?tags=` }, 400);
  }
  const tags = Array.from(new Set(raw.map(Number))).sort((a, b) => a - b);
  const months = Math.min(48, Math.max(6, Number(sp.get("months")) || 36));

  const now = new Date();
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, now.getUTCDate()));
  const today = now.toISOString().slice(0, 10);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  try {
    const first = await fetchPage(tags, 0);
    const total = first.total;
    const rows: Row[] = [];
    let done = addRows(rows, first.rows, cutoffStr, today);
    let pages = 1;
    const lastPage = Math.ceil(total / PAGE);
    while (!done && pages < Math.min(lastPage, MAX_PAGES)) {
      const batch: number[] = [];
      for (let i = 0; i < BATCH && pages + i < Math.min(lastPage, MAX_PAGES); i++) batch.push(pages + i);
      const results = await Promise.all(batch.map((p) => fetchPage(tags, p * PAGE)));
      pages += batch.length;
      for (const r of results) {
        if (addRows(rows, r.rows, cutoffStr, today)) { done = true; break; }
      }
    }
    const truncated = !done && pages < lastPage;
    const reached = rows.length ? rows[rows.length - 1][2] : null;
    // De-duplicate (pages can shift by a row while new games are added).
    const seen = new Set<number>();
    const unique = rows.filter((r) => (seen.has(r[0]) ? false : (seen.add(r[0]), true)));
    return json({
      tags, months, from: cutoffStr, to: today, fetchedAt: now.toISOString(),
      totalAllTime: total, pages, truncated, reached, rows: unique,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Failed to reach Steam" }, 502);
  }
}

/** Push rows released in [cutoff, today]; return true once a row is older than cutoff. */
function addRows(out: Row[], rows: Row[], cutoff: string, today: string): boolean {
  let past = false;
  for (const r of rows) {
    if (!r[2]) continue;
    if (r[2] > today) continue;
    if (r[2] < cutoff) { past = true; continue; }
    out.push(r);
  }
  return past;
}

async function fetchPage(tags: number[], start: number): Promise<{ total: number; rows: Row[] }> {
  const url =
    "https://store.steampowered.com/search/results/?query&start=" + start +
    "&count=" + PAGE + "&tags=" + tags.join(",") +
    "&category1=998&json=1&infinite=1&cc=us&l=english&sort_by=Released_DESC";
  let lastErr = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
      if (r.ok) {
        const d = await r.json();
        return { total: Number(d.total_count) || 0, rows: parseRows(String(d.results_html || "")) };
      }
      lastErr = `Steam search returned ${r.status}`;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : "Steam search failed";
    }
    await new Promise((res) => setTimeout(res, 600 * (attempt + 1)));
  }
  throw new Error(lastErr);
}

const MONTHS: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

function parseDate(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  let m = t.match(/^([A-Z][a-z]{2}) (\d{1,2}), (\d{4})$/); // "Nov 16, 2026"
  if (m && MONTHS[m[1]]) return `${m[3]}-${MONTHS[m[1]]}-${m[2].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2}) ([A-Z][a-z]{2}), (\d{4})$/); // "16 Nov, 2026"
  if (m && MONTHS[m[2]]) return `${m[3]}-${MONTHS[m[2]]}-${m[1].padStart(2, "0")}`;
  return ""; // "Coming soon", "Q1 2027", "2027" … not a release we can date.
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .trim();
}

function parseRows(html: string): Row[] {
  const out: Row[] = [];
  for (const chunk of html.split("<a href").slice(1)) {
    if (/data-ds-bundleid=|data-ds-packageid=/.test(chunk)) continue;
    const appid = Number((chunk.match(/data-ds-appid="(\d+)"/) || [])[1]);
    if (!appid) continue;
    const name = decode((chunk.match(/<span class="title">([^<]*)<\/span>/) || [])[1] || "");
    const date = parseDate((chunk.match(/search_released[^>]*>([^<]*)</) || [])[1] || "");
    let tagids: number[] = [];
    try { tagids = JSON.parse((chunk.match(/data-ds-tagids="(\[[^\]]*\])"/) || [])[1] || "[]"); } catch { tagids = []; }

    // List price: original price when discounted, otherwise the final price.
    let price: number | null = null;
    const orig = chunk.match(/discount_original_price">\$([\d,]+(?:\.\d+)?)/);
    if (orig) price = Math.round(parseFloat(orig[1].replace(/,/g, "")) * 100);
    else {
      const fin = chunk.match(/data-price-final="(\d+)"/);
      if (fin) price = Number(fin[1]);
    }
    if (price === null && /Free(?: to Play)?\s*</i.test(chunk)) price = 0;

    let reviews: number | null = null;
    let pct: number | null = null;
    const tip = chunk.match(/data-tooltip-html="([^"]*)"/);
    if (tip) {
      const t = decode(tip[1]);
      const m = t.match(/(\d+)% of the ([\d,]+) user reviews/);
      if (m) { pct = Number(m[1]); reviews = Number(m[2].replace(/,/g, "")); }
    }
    out.push([appid, name.slice(0, 120), date, price, reviews, pct, tagids.slice(0, 20)]);
  }
  return out;
}

async function fetchTags() {
  try {
    const r = await fetch("https://store.steampowered.com/tagdata/populartags/english", {
      headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return json({ error: `Steam returned ${r.status}` }, 502);
    const d = await r.json();
    const tags = (Array.isArray(d) ? d : [])
      .filter((t: any) => t && Number.isFinite(Number(t.tagid)) && typeof t.name === "string")
      .map((t: any) => ({ id: Number(t.tagid), name: String(t.name) }));
    return json({ tags }, 200, "public, max-age=86400, s-maxage=604800");
  } catch {
    return json({ error: "Failed to reach Steam" }, 502);
  }
}
