import { NextResponse } from "next/server";
import { apiError, noStore, requireUser } from "@/lib/api";
import { runScan } from "@/lib/playtest";
import { requireGameRole } from "@/lib/spine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/games/:id/playtest/scan — read new Discord messages and classify them. */
export async function POST(_req: Request, { params }: Ctx) {
  const r = await requireUser();
  if ("error" in r) return r.error;
  const { id } = await params;
  try {
    await requireGameRole(r.user.id, id, "editor");
    return NextResponse.json(await runScan(r.user.id, id), noStore);
  } catch (err) {
    return apiError(err);
  }
}
