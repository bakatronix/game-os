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
import { crawlByRelease } from "@/lib/steam-search";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_TAGS = 5;

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
    const c = await crawlByRelease(tags, cutoffStr, today);
    return json({
      tags, months, from: cutoffStr, to: today, fetchedAt: now.toISOString(),
      totalAllTime: c.total, pages: c.pages, truncated: c.truncated, reached: c.reached, rows: c.rows,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Failed to reach Steam" }, 502);
  }
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
