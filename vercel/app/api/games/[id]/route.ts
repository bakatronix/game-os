import { NextResponse } from "next/server";
import { apiError, noStore, readJson, requireUser } from "@/lib/api";
import { getGameSnapshot, requireGameRole, updateGame } from "@/lib/spine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/games/:id — game + latest thesis + thesis history + signal ledger. */
export async function GET(_req: Request, { params }: Ctx) {
  const r = await requireUser();
  if ("error" in r) return r.error;
  const { id } = await params;
  try {
    const { game, role } = await requireGameRole(r.user.id, id, "viewer");
    const snap = await getGameSnapshot(id);
    return NextResponse.json({ game: { ...game, role }, ...snap }, noStore);
  } catch (err) {
    return apiError(err);
  }
}

/** PATCH /api/games/:id { title?, steamAppId?, genre?, stage? } */
export async function PATCH(req: Request, { params }: Ctx) {
  const r = await requireUser();
  if ("error" in r) return r.error;
  const { id } = await params;
  const body = await readJson(req);
  if (body.steamAppId && !/^\d{1,10}$/.test(String(body.steamAppId).trim())) {
    return NextResponse.json({ error: "Steam App ID must be numeric" }, { status: 400 });
  }
  try {
    await requireGameRole(r.user.id, id, "editor");
    const game = await updateGame(id, {
      title: body.title !== undefined ? String(body.title).trim().slice(0, 120) || undefined : undefined,
      steamAppId: body.steamAppId !== undefined ? String(body.steamAppId || "").trim() : undefined,
      genre: body.genre !== undefined ? String(body.genre || "").slice(0, 80) : undefined,
      stage: body.stage !== undefined ? Number(body.stage) : undefined,
    });
    return NextResponse.json({ game }, noStore);
  } catch (err) {
    return apiError(err);
  }
}
