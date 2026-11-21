/**
 * Window Planner data — Steam's coming-soon list, no API key needed.
 *
 *   ?tags=1716,1662[&weeks=26] → unreleased games under ALL those tags that
 *   Steam lists with a release date (or month) between today and `weeks` ahead.
 *
 * Row: [appid, name, "YYYY-MM-DD" | "", "YYYY-MM" | "", tagids[]]
 * `undated` counts upcoming games with no usable date ("Coming soon", "Q2 2027").
 * Past release history comes from /api/market-scope (same tags, cached).
 */

import { NextRequest, NextResponse } from "next/server";
import { crawlUpcoming } from "@/lib/steam-search";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_TAGS = 5;

function json(obj: unknown, status = 200) {
  return NextResponse.json(obj, {
    status,
    // Upcoming dates move as studios announce; a few hours is fresh enough.
    headers: { "Cache-Control": status === 200 ? "public, max-age=1800, s-maxage=21600, stale-while-revalidate=21600" : "no-store" },
  });
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const raw = (sp.get("tags") || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!raw.length || raw.length > MAX_TAGS || !raw.every((t) => /^\d{1,8}$/.test(t))) {
    return json({ error: `Pass 1–${MAX_TAGS} numeric Steam tag ids in ?tags=` }, 400);
  }
  const tags = Array.from(new Set(raw.map(Number))).sort((a, b) => a - b);
  const weeks = Math.min(52, Math.max(8, Number(sp.get("weeks")) || 26));

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const to = new Date(now.getTime() + (weeks * 7 + 7) * 86400000).toISOString().slice(0, 10);

  try {
    const c = await crawlUpcoming(tags, to);
    return json({
      tags, weeks, from: today, to, fetchedAt: now.toISOString(),
      totalUpcoming: c.total, undated: c.undated, pages: c.pages, truncated: c.truncated, reached: c.reached, rows: c.rows,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Failed to reach Steam" }, 502);
  }
}
