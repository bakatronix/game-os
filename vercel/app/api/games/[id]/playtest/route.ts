import { NextResponse } from "next/server";
import { apiError, noStore, readJson, requireUser } from "@/lib/api";
import { getDashboard, saveConfig } from "@/lib/playtest";
import { requireGameRole } from "@/lib/spine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/games/:id/playtest — Chicken Brûlée setup (token masked), observations, latest scan. */
export async function GET(_req: Request, { params }: Ctx) {
  const r = await requireUser();
  if ("error" in r) return r.error;
  const { id } = await params;
  try {
    const { role } = await requireGameRole(r.user.id, id, "viewer");
    return NextResponse.json({ ...(await getDashboard(id)), role }, noStore);
  } catch (err) {
    return apiError(err);
  }
}

/** PUT /api/games/:id/playtest { botToken?, channels, staffPrefixes, roleMapping, gameContext }
 *  Leave botToken empty to keep the saved one. */
export async function PUT(req: Request, { params }: Ctx) {
  const r = await requireUser();
  if ("error" in r) return r.error;
  const { id } = await params;
  const body = await readJson(req);
  try {
    await requireGameRole(r.user.id, id, "editor");
    return NextResponse.json({ config: await saveConfig(r.user.id, id, body) }, noStore);
  } catch (err) {
    return apiError(err);
  }
}
