import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { apps } from "@/db/schema";
import { asc } from "drizzle-orm";

export const runtime = "nodejs";

/**
 * GET /api/apps — the app registry, shaped for the edge gate.
 * Cached at the edge (60s) so middleware can read it cheaply via fetch.
 */
export async function GET() {
  const db = getDb();
  const rows = await db.select().from(apps).orderBy(asc(apps.sortOrder));
  const gates = rows
    .filter((a) => a.enabled === 1)
    .map((a) => ({
      path: a.path,
      access: a.access,
      minRole: a.minRole,
      id: a.id,
      name: a.name,
      group: a.group,
      version: a.version,
      sortOrder: a.sortOrder,
    }));
  return NextResponse.json(
    { gates },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
