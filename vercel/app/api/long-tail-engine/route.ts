/**
 * Long Tail Engine data: the review histogram, release date, price and languages, and developer announcements
 * for one Steam app (brief §5.7). Public, keyless Steam endpoints only; nothing is stored.
 *
 *   ?appid=413150
 *
 * Signed-in Game OS users only (no extra sign-in step), RATE_MAX calls a minute per user. The answer is cached in
 * server memory and marked private, so a shared cache never serves it to someone who isn't signed in.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { limiter, tailData } from "@/lib/long-tail-sources";

export const runtime = "nodejs";
export const maxDuration = 30;

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const user = await requireUser();
  if ("error" in user && user.error) {
    user.error.headers.set("Cache-Control", "no-store");
    return user.error;
  }
  if (!("user" in user) || !user.user) return NextResponse.json({ error: "Sign in required" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const wait = limiter.hit(String(user.user.id));
  if (wait) return NextResponse.json({ error: "Too many requests. Try again in a minute.", retryAfter: wait }, { status: 429, headers: { ...NO_STORE, "Retry-After": String(wait) } });

  const raw = request.nextUrl.searchParams.get("appid") || "";
  if (!/^\d{1,9}$/.test(raw) || Number(raw) <= 0) return NextResponse.json({ error: "Missing or invalid appid" }, { status: 400, headers: NO_STORE });

  const { body, complete } = await tailData(Number(raw));
  return NextResponse.json(body, { headers: { "Cache-Control": complete ? "private, max-age=1800" : "private, max-age=300" } });
}
