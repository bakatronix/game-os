import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { toolStates } from "@/db/schema";
import { apiError, noStore, requireUser } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ toolId: string }> };

const TOOL_ID = /^[a-z0-9-]{1,40}$/;
const MAX_BYTES = 512 * 1024;

/** GET /api/tool-state/:toolId — the signed-in user's saved workbook, or null. */
export async function GET(_req: Request, { params }: Ctx) {
  const r = await requireUser();
  if ("error" in r) return r.error;
  const { toolId } = await params;
  if (!TOOL_ID.test(toolId)) return NextResponse.json({ error: "Unknown tool" }, { status: 400 });
  try {
    const [row] = await getDb()
      .select()
      .from(toolStates)
      .where(and(eq(toolStates.userId, r.user.id!), eq(toolStates.toolId, toolId)))
      .limit(1);
    if (!row) return NextResponse.json({ state: null }, noStore);
    let state: unknown = null;
    try { state = JSON.parse(row.data); } catch { state = null; }
    return NextResponse.json({ state, savedAt: row.savedAt.toISOString() }, noStore);
  } catch (err) {
    return apiError(err);
  }
}

/** PUT /api/tool-state/:toolId { state } — replace the saved workbook (max 512 KB). */
export async function PUT(req: Request, { params }: Ctx) {
  const r = await requireUser();
  if ("error" in r) return r.error;
  const { toolId } = await params;
  if (!TOOL_ID.test(toolId)) return NextResponse.json({ error: "Unknown tool" }, { status: 400 });
  if (Number(req.headers.get("content-length") || 0) > MAX_BYTES) {
    return NextResponse.json({ error: "Workbook too large to save" }, { status: 413 });
  }
  let text: string;
  try { text = await req.text(); } catch { return NextResponse.json({ error: "Bad body" }, { status: 400 }); }
  if (text.length > MAX_BYTES) return NextResponse.json({ error: "Workbook too large to save" }, { status: 413 });
  let body: any;
  try { body = JSON.parse(text); } catch { return NextResponse.json({ error: "Body must be JSON" }, { status: 400 }); }
  if (!body || typeof body.state !== "object" || body.state === null || Array.isArray(body.state)) {
    return NextResponse.json({ error: "state must be an object" }, { status: 400 });
  }
  try {
    const savedAt = new Date();
    const data = JSON.stringify(body.state);
    await getDb()
      .insert(toolStates)
      .values({ userId: r.user.id!, toolId, data, savedAt })
      .onConflictDoUpdate({ target: [toolStates.userId, toolStates.toolId], set: { data, savedAt } });
    return NextResponse.json({ savedAt: savedAt.toISOString() }, noStore);
  } catch (err) {
    return apiError(err);
  }
}
