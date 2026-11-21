import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { games } from "@/db/schema";
import { apiError, noStore, requireUser } from "@/lib/api";
import { requireGameRole } from "@/lib/spine";
import { snapshotGame } from "@/lib/steam-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/games/:id/steam-snapshot — record this game's Steam figures now ("Record now"). */
export async function POST(_req: Request, { params }: Ctx) {
  const r = await requireUser();
  if ("error" in r) return r.error;
  const { id } = await params;
  try {
    await requireGameRole(r.user.id, id, "editor");
    const [game] = await getDb().select({ id: games.id, steamAppId: games.steamAppId }).from(games).where(eq(games.id, id)).limit(1);
    if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });
    const res = await snapshotGame(game, true, r.user.id);
    if (res.status === "no-app-id") return NextResponse.json({ error: "This game has no Steam App ID yet." }, { status: 400 });
    if (res.status === "no-steam-data") return NextResponse.json({ error: "Steam has no public figures for this App ID yet." }, { status: 404 });
    return NextResponse.json(res, noStore);
  } catch (err) {
    return apiError(err);
  }
}
