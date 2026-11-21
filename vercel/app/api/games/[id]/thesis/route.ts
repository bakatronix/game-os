import { NextResponse } from "next/server";
import { apiError, noStore, readJson, requireUser } from "@/lib/api";
import { THESIS_FIELDS, getThesisHistory, requireGameRole, reviseThesis } from "@/lib/spine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/games/:id/thesis — version history, newest first. */
export async function GET(_req: Request, { params }: Ctx) {
  const r = await requireUser();
  if ("error" in r) return r.error;
  const { id } = await params;
  try {
    await requireGameRole(r.user.id, id, "viewer");
    const history = await getThesisHistory(id);
    return NextResponse.json({ thesis: history[0] || null, history }, noStore);
  } catch (err) {
    return apiError(err);
  }
}

/**
 * POST /api/games/:id/thesis { audience?, hook?, compSet?, priceHypothesis?,
 * targets?, source?, note? } — writes a new version; unchanged fields carry over.
 */
export async function POST(req: Request, { params }: Ctx) {
  const r = await requireUser();
  if ("error" in r) return r.error;
  const { id } = await params;
  const body = await readJson(req);

  const patch: Record<string, unknown> = {};
  for (const f of THESIS_FIELDS) if (f in body) patch[f] = body[f];
  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "No thesis fields given" }, { status: 400 });
  }
  if ("compSet" in patch && patch.compSet != null && !Array.isArray(patch.compSet)) {
    return NextResponse.json({ error: "compSet must be an array" }, { status: 400 });
  }
  if ("priceHypothesis" in patch && patch.priceHypothesis != null && patch.priceHypothesis !== "") {
    const n = Number(String(patch.priceHypothesis).replace(/[$,\s]/g, ""));
    if (!Number.isFinite(n) || n < 0 || n > 1000) {
      return NextResponse.json({ error: "priceHypothesis must be a USD amount" }, { status: 400 });
    }
    patch.priceHypothesis = n.toFixed(2);
  }
  for (const f of ["audience", "hook"]) {
    if (typeof patch[f] === "string") patch[f] = (patch[f] as string).slice(0, 2000);
  }

  try {
    await requireGameRole(r.user.id, id, "editor");
    const source = body.source ? String(body.source).slice(0, 64) : "manual";
    const res = await reviseThesis(r.user.id, id, patch, source, body.note ? String(body.note).slice(0, 500) : null);
    return NextResponse.json(res, { status: res.changed.length ? 201 : 200, ...noStore });
  } catch (err) {
    return apiError(err);
  }
}
