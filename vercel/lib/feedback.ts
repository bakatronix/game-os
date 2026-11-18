import { sql } from "drizzle-orm";
import { getDb } from "@/db";

/** Price Calculator feedback, saved per person in tool_state under this id. */
export const FEEDBACK_TOOL_ID = "price-calc-feedback";

export type FeedbackRow = {
  userId: string;
  accountName: string | null;
  accountEmail: string | null;
  savedAt: string;
  name: string;
  studio: string;
  email: string;
  priceBefore: number | null;
  noPriceBefore: boolean;
  priceAfter: number | null;
  priceChange: number | null;
  whyChanged: string;
  helpedScore: number | null;
  netPerCopyUsed: string;
  timeVsWithout: string;
  useAgain: string;
  useAgainWhy: string;
  stepsTrouble: string[];
  troubleDetail: string;
  testimonial: string;
};

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export async function getFeedbackRows(): Promise<FeedbackRow[]> {
  const res = (await getDb().execute(sql`
    SELECT t."userId", t.data, t."savedAt", u.name, u.email
    FROM tool_state t JOIN "user" u ON u.id = t."userId"
    WHERE t."toolId" = ${FEEDBACK_TOOL_ID}
    ORDER BY t."savedAt" DESC
  `)) as unknown as { rows: { userId: string; data: string; savedAt: string; name: string | null; email: string | null }[] };

  return res.rows.map((r) => {
    let s: Record<string, unknown> = {};
    try { s = JSON.parse(r.data) || {}; } catch { s = {}; }
    const before = num(s.price_before);
    const after = num(s.price_after);
    return {
      userId: r.userId,
      accountName: r.name,
      accountEmail: r.email,
      savedAt: new Date(r.savedAt).toISOString(),
      name: str(s.name),
      studio: str(s.studio),
      email: str(s.email),
      priceBefore: before,
      noPriceBefore: s.no_price_before === true,
      priceAfter: after,
      priceChange: before !== null && after !== null ? Math.round((after - before) * 100) / 100 : null,
      whyChanged: str(s.why_changed),
      helpedScore: num(s.helped_score),
      netPerCopyUsed: str(s.net_per_copy_used),
      timeVsWithout: str(s.time_vs_without),
      useAgain: str(s.use_again),
      useAgainWhy: str(s.use_again_why),
      stepsTrouble: Array.isArray(s.steps_trouble) ? (s.steps_trouble as unknown[]).map(str).filter(Boolean) : [],
      troubleDetail: str(s.trouble_detail),
      testimonial: str(s.testimonial),
    };
  });
}

export type NotAnsweredRow = {
  userId: string;
  name: string | null;
  email: string | null;
  studios: string | null;
  lastUsed: string;
  sessions: number;
  visits: number;
};

/** People who have used the Price Calculator while signed in but haven't sent the feedback form. */
export async function getNotAnswered(): Promise<NotAnsweredRow[]> {
  const res = (await getDb().execute(sql`
    SELECT u.id AS "userId", u.name, u.email,
           (SELECT string_agg(DISTINCT s.name, ', ') FROM membership m JOIN studio s ON s.id = m."studioId" WHERE m."userId" = u.id) AS studios,
           MAX(e."timestamp") AS "lastUsed",
           COUNT(DISTINCT e."sessionId")::int AS sessions,
           COUNT(*)::int AS visits
    FROM event e JOIN "user" u ON u.id = e."userId"
    WHERE e."toolId" = 'price-calc'
      AND NOT EXISTS (
        SELECT 1 FROM tool_state t WHERE t."userId" = u.id AND t."toolId" = ${FEEDBACK_TOOL_ID}
      )
    GROUP BY u.id, u.name, u.email
    ORDER BY MAX(e."timestamp") DESC
  `)) as unknown as { rows: (Omit<NotAnsweredRow, "lastUsed"> & { lastUsed: string })[] };
  return res.rows.map((r) => ({ ...r, lastUsed: new Date(r.lastUsed).toISOString() }));
}

/** Headline numbers for the deck: share who changed price, average change, average help score. */
export function summarise(rows: FeedbackRow[]) {
  const withBoth = rows.filter((r) => r.priceChange !== null);
  const changed = withBoth.filter((r) => r.priceChange !== 0);
  const scores = rows.map((r) => r.helpedScore).filter((n): n is number => n !== null);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const trouble = new Map<string, number>();
  rows.forEach((r) => r.stepsTrouble.filter((x) => x !== "None").forEach((x) => trouble.set(x, (trouble.get(x) || 0) + 1)));
  return {
    responses: rows.length,
    comparable: withBoth.length,
    changed: changed.length,
    changedShare: withBoth.length ? changed.length / withBoth.length : null,
    avgChange: avg(changed.map((r) => r.priceChange as number)),
    avgAbsChange: avg(changed.map((r) => Math.abs(r.priceChange as number))),
    noPriceBefore: rows.filter((r) => r.noPriceBefore).length,
    avgHelp: avg(scores),
    usedNet: rows.filter((r) => r.netPerCopyUsed === "Yes").length,
    useAgainYes: rows.filter((r) => r.useAgain === "Yes").length,
    trouble: [...trouble.entries()].sort((a, b) => b[1] - a[1]),
  };
}

const CSV_COLUMNS: [string, (r: FeedbackRow) => unknown][] = [
  ["sent_at", (r) => r.savedAt],
  ["name", (r) => r.name],
  ["studio_or_game", (r) => r.studio],
  ["email", (r) => r.email],
  ["account_email", (r) => r.accountEmail],
  ["price_before", (r) => r.priceBefore],
  ["no_price_before", (r) => (r.noPriceBefore ? "yes" : "")],
  ["price_after", (r) => r.priceAfter],
  ["price_change", (r) => r.priceChange],
  ["why_changed", (r) => r.whyChanged],
  ["helped_score", (r) => r.helpedScore],
  ["net_per_copy_used", (r) => r.netPerCopyUsed],
  ["time_vs_without", (r) => r.timeVsWithout],
  ["use_again", (r) => r.useAgain],
  ["use_again_why", (r) => r.useAgainWhy],
  ["steps_trouble", (r) => r.stepsTrouble.join("; ")],
  ["trouble_detail", (r) => r.troubleDetail],
  ["comment", (r) => r.testimonial],
];

/** CSV safe for Excel and Sheets: quoted cells, formula characters neutralised. */
export function toCsv(rows: FeedbackRow[]): string {
  const cell = (v: unknown) => {
    let s = v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  const head = CSV_COLUMNS.map(([h]) => cell(h)).join(",");
  const body = rows.map((r) => CSV_COLUMNS.map(([, f]) => cell(f(r))).join(","));
  return "﻿" + [head, ...body].join("\r\n") + "\r\n";
}
