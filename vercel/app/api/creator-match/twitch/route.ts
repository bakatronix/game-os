/**
 * Creator Match: who is streaming a game on Twitch right now (brief §5.3 part B).
 *
 *   ?name=Hollow%20Knight   → live streams in that Twitch category
 *
 * Signed-in Game OS users only, 30 calls a minute per user (shared with the YouTube route). A live list fetched
 * on page load and never stored: Twitch's Developer Agreement restricts keeping its content beyond a short cache.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { cleanQuery, limiter, twitchLive } from "@/lib/creator-sources";

export const runtime = "nodejs";
export const maxDuration = 30;

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const user = await requireUser();
  if ("error" in user) return user.error;
  const wait = limiter.hit(String(user.user.id));
  if (wait) return NextResponse.json({ error: "Too many requests. Try again in a minute.", retryAfter: wait }, { status: 429, headers: { ...NO_STORE, "Retry-After": String(wait) } });

  const name = cleanQuery(request.nextUrl.searchParams.get("name"));
  if (!name) return NextResponse.json({ error: "Missing or invalid name" }, { status: 400, headers: NO_STORE });
  const body = await twitchLive(name);
  const ok = body.configured && !("error" in body && body.error);
  return NextResponse.json(body, { headers: { "Cache-Control": ok ? "private, max-age=60" : "no-store" } });
}
