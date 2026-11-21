/**
 * Daily Steam snapshot for every game with a Steam App ID (Vercel Cron, see vercel.json).
 * Vercel sends "Authorization: Bearer $CRON_SECRET"; without CRON_SECRET set, this refuses to run.
 */
import { NextResponse } from "next/server";
import { snapshotAll } from "@/lib/steam-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const r = await snapshotAll();
  const count = (s: string) => r.results.filter((x) => x.status === s).length;
  return NextResponse.json(
    { games: r.games, done: r.done, recorded: count("recorded"), fresh: count("fresh"), noData: count("no-steam-data"), errors: count("error") },
    { headers: { "Cache-Control": "no-store" } },
  );
}
