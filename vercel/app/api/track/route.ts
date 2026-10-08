import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { events, pii } from "@/db/schema";

export const runtime = "nodejs";

type IncomingEvent = {
  event_name: string;
  timestamp?: string;
  tool_id?: string | null;
  app_version?: string | null;
  props?: Record<string, unknown>;
};

type Payload = {
  anon_id?: string;
  session_id?: string;
  source?: {
    utm_source?: string | null;
    utm_medium?: string | null;
    utm_campaign?: string | null;
    referrer?: string | null;
  };
  events?: IncomingEvent[];
};

export async function POST(req: NextRequest) {
  let body: Payload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const session = await auth();
  const userId = session?.user?.id ?? null;

  // anon_id: prefer the payload, fall back to the cookie.
  const anonId = body.anon_id || req.cookies.get("gos_anon")?.value || null;

  // Privacy: never store emails/PII in the event row. If a waitlist_signup
  // event carries an email, split it into the restricted pii table.
  const src = body.source || {};

  const rows = (body.events || []).map((e) => ({
    eventName: e.event_name,
    timestamp: e.timestamp ? new Date(e.timestamp) : new Date(),
    anonId,
    userId,
    sessionId: body.session_id ?? null,
    toolId: e.tool_id ?? null,
    appVersion: e.app_version ?? null,
    utmSource: src.utm_source ?? null,
    utmMedium: src.utm_medium ?? null,
    utmCampaign: src.utm_campaign ?? null,
    referrer: src.referrer ?? null,
    props: JSON.stringify(sanitizeProps(e.props || {})),
  }));

  const waitlist = (body.events || []).filter(
    (e) => e.event_name === "waitlist_signup" && (e.props as any)?.email,
  );

  try {
    const db = getDb();
    if (rows.length) await db.insert(events).values(rows);
    if (waitlist.length) {
      await db.insert(pii).values(
        waitlist.map((e) => {
          const p = (e.props || {}) as any;
          return {
            userId,
            anonId,
            email: String(p.email),
            studioName: p.studio_name ? String(p.studio_name) : null,
            devStage: p.dev_stage ? String(p.dev_stage) : null,
            gameLink: p.game_link ? String(p.game_link) : null,
          };
        }),
      );
    }
  } catch (err) {
    console.error("[track] insert failed", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const res = NextResponse.json({ ok: true, count: rows.length });
  if (anonId && !req.cookies.get("gos_anon")) {
    res.cookies.set("gos_anon", anonId, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  }
  return res;
}

/** Strip obvious PII from props before they reach the event table. */
function sanitizeProps(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (k === "email" || k === "text" || k === "contact") continue;
    out[k] = v;
  }
  return out;
}
