import { NextResponse } from "next/server";
import { apiError, noStore, readJson, requireUser } from "@/lib/api";
import { createGame, listGamesForUser } from "@/lib/spine";
import { ensureStudioForUser } from "@/lib/studio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/games — every game in the user's studios. */
export async function GET() {
  const r = await requireUser();
  if ("error" in r) return r.error;
  try {
    const games = await listGamesForUser(r.user.id);
    return NextResponse.json({ games }, noStore);
  } catch (err) {
    return apiError(err);
  }
}

/** POST /api/games { title, steamAppId?, genre?, stage?, studioId? } */
export async function POST(req: Request) {
  const r = await requireUser();
  if ("error" in r) return r.error;
  const body = await readJson(req);
  const title = String(body.title || "").trim().slice(0, 120);
  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  const steamAppId = body.steamAppId ? String(body.steamAppId).trim() : null;
  if (steamAppId && !/^\d{1,10}$/.test(steamAppId)) {
    return NextResponse.json({ error: "Steam App ID must be numeric" }, { status: 400 });
  }
  try {
    const studioId =
      (body.studioId && String(body.studioId)) ||
      r.user.studioId ||
      (await ensureStudioForUser(r.user.id, r.user.name ?? null)).studioId;
    const game = await createGame(r.user.id, studioId, {
      title,
      steamAppId,
      genre: body.genre ? String(body.genre).slice(0, 80) : null,
      stage: body.stage,
    });
    return NextResponse.json({ game }, { status: 201, ...noStore });
  } catch (err) {
    return apiError(err);
  }
}
