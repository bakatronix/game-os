/**
 * Sentiment Radar phase 2: group a game's recent public Steam reviews into themes with an LLM, and match the
 * store page's claims against the complaint themes (the expectation gap). Brief §5.1 step 5; LLM use approved
 * by the owner on 2026-11-26. The model is set in lib/llm.ts (GAMEOS_LLM_MODEL), the key is ANTHROPIC_API_KEY.
 *
 *   POST { gameId }  → themes and expectation-gap flags for that game's Steam App ID
 *
 * Only public text is sent to the model: recent Steam reviews and the store page's short description and
 * About text. Nothing the studio submitted is sent. The App ID comes from the game record, not the request,
 * and the caller must be an editor of the game, so nobody can spend the budget on other apps.
 *
 * Cost limits (each per server instance, so they slow spending rather than cap it; the hard cap is the
 * monthly spend limit in the Anthropic console):
 *   - one analysis per game per CACHE_TTL_MS; repeat calls get the saved answer and cost nothing;
 *   - USER_DAILY_MAX analyses per user per day and GLOBAL_DAILY_MAX across all users;
 *   - RATE_MAX calls a minute per user, as for the other Steam-backed routes.
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError, readJson, requireUser } from "@/lib/api";
import { requireGameRole } from "@/lib/spine";
import { createLimiter } from "@/lib/rate-limit";
import { get, readReviews } from "@/lib/steam-reviews";
import { callJson, llmConfigured, llmModel } from "@/lib/llm";
import { MIN_REVIEWS_FOR_THEMES, SYSTEM_PROMPT, THEMES_SCHEMA, buildPrompt, storeText, validate } from "@/lib/sentiment-themes";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Reviews sent to the model: the same cap as the page reads, so the themes describe the reviews shown. */
const MAX_REVIEWS = 500;
/** One analysis per game per day; repeat calls within it return the saved answer. */
const CACHE_TTL_MS = 24 * 3600_000;
const MAX_CACHED = 200;
/** Analyses that reach the model, per user per day and per server instance per day. */
const USER_DAILY_MAX = 10;
const GLOBAL_DAILY_MAX = 100;
const RATE_MAX = 30;

const perMinute = createLimiter(RATE_MAX, 60_000);
const perUserDay = createLimiter(USER_DAILY_MAX, 24 * 3600_000);
const perDay = createLimiter(GLOBAL_DAILY_MAX, 24 * 3600_000);
const memo = new Map<number, { at: number; body: unknown }>();
const inFlight = new Map<number, Promise<{ status: number; body: any }>>();

const NO_STORE = { "Cache-Control": "private, no-store" };
const reply = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  NextResponse.json(body, { status, headers: { ...NO_STORE, ...extra } });

export async function POST(request: NextRequest) {
  const user = await requireUser();
  if ("error" in user && user.error) { user.error.headers.set("Cache-Control", "no-store"); return user.error; }
  if (!("user" in user) || !user.user?.id) return reply({ error: "Sign in required" }, 401);
  const uid = String(user.user.id);
  const wait = perMinute.hit(uid);
  if (wait) return reply({ error: "Too many requests. Try again in a minute.", code: "busy", retryAfter: wait }, 429, { "Retry-After": String(wait) });

  const body = await readJson(request);
  const gameId = typeof body.gameId === "string" ? body.gameId : "";
  if (!gameId) return reply({ error: "Missing gameId" }, 400);
  let appid: number;
  try {
    const { game } = await requireGameRole(uid, gameId, "editor");
    const m = String(game.steamAppId || "").match(/\d{1,9}/);
    if (!m) return reply({ error: "This game has no Steam App ID.", code: "no-app-id" }, 400);
    appid = Number(m[0]);
  } catch (err) {
    return apiError(err);
  }

  const hit = memo.get(appid);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return reply({ ...(hit.body as object), cached: true });
  if (!llmConfigured()) return reply({ error: "Themes aren't set up on this server yet (no model key).", code: "not-configured" }, 503);

  let job = inFlight.get(appid);
  if (!job) {
    job = analyse(appid, uid).finally(() => inFlight.delete(appid));
    inFlight.set(appid, job);
  }
  const res = await job;
  return reply(res.body, res.status, res.status === 429 && res.body?.retryAfter ? { "Retry-After": String(res.body.retryAfter) } : {});
}

async function analyse(appid: number, uid: string): Promise<{ status: number; body: any }> {
  const [rev, details] = await Promise.all([
    readReviews(appid, MAX_REVIEWS),
    get(`https://store.steampowered.com/api/appdetails?appids=${appid}&l=english`),
  ]);
  const reviews = rev.reviews.filter((r) => r.text.trim());
  if (reviews.length < MIN_REVIEWS_FOR_THEMES) {
    if (rev.reason && !reviews.length) return { status: 502, body: { error: "Steam didn't return the reviews.", code: "steam", reason: rev.reason } };
    return { status: 200, body: { appid, tooFew: true, read: reviews.length, min: MIN_REVIEWS_FOR_THEMES } };
  }
  const entry = details.ok ? details.data?.[String(appid)] : null;
  const store = storeText(entry?.success ? entry.data : null);

  // Spend limits are counted only when a call is about to reach the model.
  const userWait = perUserDay.hit(uid);
  if (userWait) return { status: 429, body: { error: `You've run ${USER_DAILY_MAX} theme analyses today. Try again tomorrow.`, code: "daily-limit", retryAfter: userWait } };
  const allWait = perDay.hit("all");
  if (allWait) return { status: 429, body: { error: "Game OS has reached today's limit for theme analyses. Try again tomorrow.", code: "daily-limit", retryAfter: allWait } };

  const out = await callJson({ system: SYSTEM_PROMPT, user: buildPrompt(store, reviews), schema: THEMES_SCHEMA as unknown as Record<string, unknown> });
  if (!out.ok) {
    const msg = out.reason === "refused" ? "The model declined to read these reviews."
      : out.reason === "rate-limited" ? "The model service is busy. Try again in a few minutes."
        : out.reason === "not-configured" ? "Themes aren't set up on this server yet (no model key)."
          : "The model didn't return a usable answer. Try again later.";
    return { status: out.reason === "not-configured" ? 503 : 502, body: { error: msg, code: out.reason === "not-configured" ? "not-configured" : "llm", reason: out.reason } };
  }

  const checked = validate(out.data, reviews, store);
  const created = reviews.map((r) => r.created).filter((t): t is number => !!t).sort((a, b) => a - b);
  const day = (s: number) => new Date(s * 1000).toISOString().slice(0, 10);
  const result = {
    appid,
    analysedAt: new Date().toISOString(),
    model: out.model || llmModel(),
    read: reviews.length,
    total: rev.total,
    partial: rev.reason,
    window: created.length ? `${day(created[0])}/${day(created[created.length - 1])}` : null,
    n: { pos: reviews.filter((r) => r.up).length, neg: reviews.filter((r) => !r.up).length },
    store: { chars: store.length, available: !!store },
    themes: checked.themes,
    gaps: store ? checked.gaps : [],
    dropped: checked.dropped,
  };
  memo.delete(appid);
  memo.set(appid, { at: Date.now(), body: result });
  while (memo.size > MAX_CACHED) memo.delete(memo.keys().next().value as number);
  console.info("[sentiment-themes]", appid, result.model, "in", out.usage.input, "out", out.usage.output);
  return { status: 200, body: result };
}
