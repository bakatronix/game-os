import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { toolStates, users } from "@/db/schema";
import { apiError, noStore, requireUser } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Tool id the Pitch Lineup page saves under via PUT /api/tool-state/pitch-lineup. */
const TOOL_ID = "pitch-lineup";

/**
 * GET /api/pitch-lineup/scores — every signed-in scorer's Pitch Lineup scores,
 * so the page can total them. Each scorer saves their own scores through the
 * tool-state API as { scores: { [teamName]: 1 | 2 | 3 | 4 } }.
 * Returns display names only (never emails or user ids).
 */
export async function GET() {
  const r = await requireUser();
  if ("error" in r) return r.error;
  try {
    const rows = await getDb()
      .select({ userId: toolStates.userId, data: toolStates.data, savedAt: toolStates.savedAt, name: users.name })
      .from(toolStates)
      .innerJoin(users, eq(users.id, toolStates.userId))
      .where(eq(toolStates.toolId, TOOL_ID));

    const scorers = rows
      .map((row) => {
        let parsed: any = null;
        try { parsed = JSON.parse(row.data); } catch { parsed = null; }
        const raw = parsed && typeof parsed.scores === "object" && parsed.scores ? parsed.scores : {};
        const scores: Record<string, number> = {};
        for (const [team, v] of Object.entries(raw)) {
          const n = Number(v);
          if (typeof team === "string" && team.length <= 80 && [1, 2, 3, 4].includes(n)) scores[team] = n;
        }
        return {
          name: (row.name || "").trim().split(/\s+/)[0] || "Scorer",
          isMe: row.userId === r.user.id,
          scores,
          savedAt: row.savedAt.toISOString(),
        };
      })
      .filter((s) => s.isMe || Object.keys(s.scores).length > 0)
      .sort((a, b) => a.savedAt.localeCompare(b.savedAt));

    return NextResponse.json({ scorers }, noStore);
  } catch (err) {
    return apiError(err);
  }
}
