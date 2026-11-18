import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isPlatformAdmin } from "@/lib/admin";
import { getFeedbackRows, toCsv } from "@/lib/feedback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /admin/analytics/feedback/csv — every Price Calculator feedback answer, platform admins only. */
export async function GET() {
  const session = await auth();
  if (!isPlatformAdmin(session?.user?.id)) return new NextResponse("Not found", { status: 404 });
  const csv = toCsv(await getFeedbackRows());
  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="price-calc-feedback-${day}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
