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

/* Abuse limits. The endpoint is anonymous by design (it tracks signed-out
 * visitors too), so cap what a single request and a single client can write. */
const MAX_BODY_BYTES = 32 * 1024;
const MAX_EVENTS = 50;
const MAX_PROPS_BYTES = 4 * 1024;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30; // requests per client IP per minute (per server instance)
const EVENT_NAME = /^[A-Za-z0-9_.:-]{1,64}$/;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

const hits = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > RATE_WINDOW_MS) hits.delete(k);
  }
  return recent.length > RATE_MAX;
}

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    "unknown"
  );
}

/** Trim to a string of at most `n` chars, or null. */
function str(v: unknown, n = 200): string | null {
  if (v == null) return null;
  const s = String(v);
  return s ? s.slice(0, n) : null;
}

function validDate(v: unknown): Date {
  const d = typeof v === "string" ? new Date(v) : new Date();
  const now = Date.now();
  // Reject junk and anything more than a day in the future or a year old.
  if (isNaN(d.getTime()) || d.getTime() > now + 864e5 || d.getTime() < now - 365 * 864e5) return new Date();
  return d;
}

export async function POST(req: NextRequest) {
  if (rateLimited(clientIp(req))) {
    return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429, headers: { "Retry-After": "60" } });
  }
  if (Number(req.headers.get("content-length") || 0) > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "Payload too large" }, { status: 413 });
  }

  let body: Payload;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false, error: "Payload too large" }, { status: 413 });
    }
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!body || typeof body !== "object" || (body.events != null && !Array.isArray(body.events))) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const incoming = (body.events || [])
    .slice(0, MAX_EVENTS)
    .filter((e) => e && typeof e === "object" && typeof e.event_name === "string" && EVENT_NAME.test(e.event_name));

  const session = await auth();
  const userId = session?.user?.id ?? null;

  // anon_id: prefer the payload, fall back to the cookie.
  const anonId = str(body.anon_id || req.cookies.get("gos_anon")?.value, 64);

  // Privacy: never store emails/PII in the event row. If a waitlist_signup
  // event carries an email, split it into the restricted pii table.
  const src = body.source && typeof body.source === "object" ? body.source : {};

  const rows = incoming.map((e) => {
    let props = JSON.stringify(sanitizeProps(e.props && typeof e.props === "object" ? e.props : {}));
    if (props.length > MAX_PROPS_BYTES) props = JSON.stringify({ _truncated: true });
    return {
      eventName: e.event_name,
      timestamp: validDate(e.timestamp),
      anonId,
      userId,
      sessionId: str(body.session_id, 64),
      toolId: str(e.tool_id, 64),
      appVersion: str(e.app_version, 32),
      utmSource: str(src.utm_source),
      utmMedium: str(src.utm_medium),
      utmCampaign: str(src.utm_campaign),
      referrer: str(src.referrer, 500),
      props,
    };
  });

  // At most one waitlist signup per request, and only with a real-looking email.
  const waitlist = incoming
    .filter((e) => e.event_name === "waitlist_signup" && EMAIL.test(String((e.props as any)?.email || "").trim()))
    .slice(0, 1);

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
            email: String(p.email).trim().slice(0, 254),
            studioName: str(p.studio_name),
            devStage: str(p.dev_stage, 64),
            gameLink: str(p.game_link, 500),
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
      secure: true,
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
