/**
 * Creator Match: live YouTube search for a game's title in quotes (brief §5.3 parts A and B).
 *
 *   ?q=Hollow%20Knight            → videos about the studio's own game, any date
 *   ?q=Hollow%20Knight&recent=1   → videos about a comp from the last year
 *
 * Signed-in Game OS users only, 30 calls a minute per user. Display only: nothing is stored or sent to the
 * ledger (YouTube Developer Policies, brief §3). The response is private to the browser; the server keeps a
 * short in-memory cache so repeat views don't spend the daily search quota.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { cleanQuery, limiter, youtubeSearch, YT_COMP_DAYS } from "@/lib/creator-sources";

export const runtime = "nodejs";
export const maxDuration = 30;

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const user = await requireUser();
  if ("error" in user) return user.error;
  const wait = limiter.hit(String(user.user.id));
  if (wait) return NextResponse.json({ error: "Too many requests. Try again in a minute.", retryAfter: wait }, { status: 429, headers: { ...NO_STORE, "Retry-After": String(wait) } });

  const sp = request.nextUrl.searchParams;
  const q = cleanQuery(sp.get("q"));
  if (!q) return NextResponse.json({ error: "Missing or invalid q" }, { status: 400, headers: NO_STORE });
  const body = await youtubeSearch(q, sp.get("recent") === "1" ? YT_COMP_DAYS : null);
  const ok = body.configured && !("error" in body && body.error);
  return NextResponse.json(body, { headers: { "Cache-Control": ok ? "private, max-age=1800" : "no-store" } });
}
