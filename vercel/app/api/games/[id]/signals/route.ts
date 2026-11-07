import { NextResponse } from "next/server";
import { apiError, noStore, readJson, requireUser } from "@/lib/api";
import { getLedger, recordSignals, requireGameRole } from "@/lib/spine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/games/:id/signals — latest value per key with short history. */
export async function GET(_req: Request, { params }: Ctx) {
  const r = await requireUser();
  if ("error" in r) return r.error;
  const { id } = await params;
  try {
    await requireGameRole(r.user.id, id, "viewer");
    return NextResponse.json({ ledger: await getLedger(id) }, noStore);
  } catch (err) {
    return apiError(err);
  }
}

/** POST /api/games/:id/signals { toolId, signals: [{ key, value, label?, unit?, meta? }] } */
export async function POST(req: Request, { params }: Ctx) {
  const r = await requireUser();
  if ("error" in r) return r.error;
  const { id } = await params;
  const body = await readJson(req);
  const toolId = String(body.toolId || "").trim();
  if (!toolId) return NextResponse.json({ error: "toolId is required" }, { status: 400 });
  if (!Array.isArray(body.signals) || !body.signals.length) {
    return NextResponse.json({ error: "signals must be a non-empty array" }, { status: 400 });
  }
  try {
    await requireGameRole(r.user.id, id, "editor");
    const rows = await recordSignals(r.user.id, id, toolId, body.signals);
    return NextResponse.json({ recorded: rows.length }, { status: 201, ...noStore });
  } catch (err) {
    return apiError(err);
  }
}
