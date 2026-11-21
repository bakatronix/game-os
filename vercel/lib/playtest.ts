import { and, desc, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { playtestConfigs, playtestObservations, playtestScans } from "@/db/schema";
import { open, seal } from "@/lib/secretbox";
import { AccessError, recordSignals } from "@/lib/spine";

/* ---------------------------------------------------------------------------
   Chicken Brûlée — Discord playtest scanner (formerly a Supabase app).
   One setup per game: bot token + channels; scans classify messages into
   observations, and the headline numbers go into the game's Signal Ledger.
--------------------------------------------------------------------------- */

const DISCORD_API = "https://discord.com/api/v10";
const DEEPSEEK_API = "https://api.deepseek.com/v1/chat/completions";
const TOOL_ID = "chicken-brulee";

/* ── Classifier (unchanged rules from the original scanner) ── */

const THEME_RULES: { theme: string; words: string[] }[] = [
  { theme: "Bugs & Polish", words: ["bug", "crash", "broken", "debug", "test item", "glitch", "audio", "sound", "music", "visual", "graphic", "typo", "spelling"] },
  { theme: "Clarity & Usability", words: ["what does", "how do i", "how to", "confused", "unclear", "understand", "supposed to", "what is", "purpose", "means", "meaning"] },
  { theme: "Feedback Process", words: ["report", "re-report", "prior version", "bug report", "reporting", "tracking", "reported"] },
  { theme: "Combat & Equipment", words: ["combat", "weapon", "armor", "equipment", "gear", "fighting", "damage", "sword", "bow"] },
  { theme: "Feature Reception", words: ["fishing", "farming", "mining", "crafting", "mini game", "minigame", "feature", "system"] },
  { theme: "Onboarding & Quest Sequencing", words: ["quest", "clear", "tutorial", "instruction", "start", "beginning", "first", "where do i", "what do i", "shop", "guide"] },
  { theme: "Progression & Resources", words: ["xp", "level", "grind", "resource", "healing", "material", "gold", "coin", "expensive", "cost", "run", "per run"] },
  { theme: "Inventory & Placement", words: ["inventory", "bar", "deed", "place", "slot", "action bar", "tool bar", "drag", "equip", "item stuck", "can't move", "can't place"] },
];
const NEG = ["bug", "broken", "stuck", "doesn't work", "not working", "error", "crash", "issue", "problem", "struggling", "difficult", "annoying", "frustrat", "worst", "terrible", "bad", "missing", "hate", "disappointed", "unplayable", "glitch", "freeze", "lag"];
const BLOCKER = ["can't progress", "can't continue", "stuck", "game-breaking", "can't place", "can't complete", "can't finish", "blocked"];
const POS = ["love", "great", "much better", "enjoy", "like ", "awesome", "amazing", "fantastic", "nice", "good", "fun", "can't wait", "excited", "brilliant", "excellent", "wonderful", "beautiful"];

export function classify(content: string, customMechanics: string[] = []) {
  const lower = content.toLowerCase();
  let theme = "General Feedback";
  let best = 0;
  for (const m of customMechanics) {
    const hits = m.toLowerCase().split(/\s+/).filter((w) => w.length > 2 && lower.includes(w)).length;
    if (hits > best) { best = hits; theme = m; }
  }
  if (best < 1) {
    for (const r of THEME_RULES) {
      const s = r.words.filter((w) => lower.includes(w)).length;
      if (s > best) { best = s; theme = r.theme; }
    }
  }
  let signal = "Observation";
  let severity = "Medium";
  const negHits = NEG.filter((w) => lower.includes(w)).length;
  const blockerHits = BLOCKER.filter((w) => lower.includes(w)).length;
  const posHits = POS.filter((w) => lower.includes(w)).length;
  const isQuestion = content.includes("?") || /^(what|how|why|when|where|can|should|does|is|are|do|will)\b/i.test(lower);
  if (blockerHits > 0) { signal = "Negative / blocker"; severity = "Critical"; }
  else if (negHits >= 3) { signal = "Negative / defect"; severity = "High"; }
  else if (negHits >= 1) { signal = "Negative / friction"; severity = "High"; }
  else if (posHits >= 1) { signal = "Positive"; severity = "Preserve"; }
  else if (isQuestion) { signal = "Question / possible issue"; }
  return { theme, signal, severity };
}

export function isEngagement(content: string) {
  const lower = content.toLowerCase();
  if (content.length < 80 && /^(omg|lol|lmao|haha|nice|pog|based|welcome|yes|no|ok|thanks|ty)\b/i.test(lower)) return true;
  const eng = ["omg", "lmao", "xd", ":d", "silly", "joke", "poggers", "pog"];
  return eng.some((w) => lower.includes(w)) && content.length < 150;
}

/* ── Config ── */

type Channel = { id: string; name: string; label: string };
type GameContext = { game_name?: string; description?: string; mechanics?: string[]; goals?: string };

function parse<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

/** The config as the browser may see it: the bot token is never returned. */
export async function getPublicConfig(gameId: string) {
  const db = getDb();
  const [row] = await db.select().from(playtestConfigs).where(eq(playtestConfigs.gameId, gameId)).limit(1);
  if (!row) return null;
  const token = open(row.botToken);
  return {
    hasToken: !!token,
    tokenHint: token ? "…" + token.slice(-4) : null,
    channels: parse<Channel[]>(row.channels, []),
    staffPrefixes: row.staffPrefixes || "",
    roleMapping: parse<Record<string, string>>(row.roleMapping, {}),
    gameContext: parse<GameContext>(row.gameContext, {}),
    updatedAt: row.updatedAt,
  };
}

const ID_RE = /^\d{5,25}$/;

export async function saveConfig(userId: string, gameId: string, input: Record<string, any>) {
  const db = getDb();
  const [existing] = await db.select().from(playtestConfigs).where(eq(playtestConfigs.gameId, gameId)).limit(1);

  const newToken = typeof input.botToken === "string" ? input.botToken.trim() : "";
  const botToken = newToken ? seal(newToken) : existing?.botToken ?? null;
  if (!botToken) throw new AccessError(400, "A Discord bot token is required.");

  const rawChannels: any[] = Array.isArray(input.channels) ? input.channels : [];
  const channels: Channel[] = rawChannels
    .map((c) => (typeof c === "string" ? { id: c } : c))
    .filter((c) => c && ID_RE.test(String(c.id).trim()))
    .slice(0, 25)
    .map((c) => {
      const id = String(c.id).trim();
      const name = String(c.name || id).slice(0, 80);
      return { id, name, label: "#" + name };
    });
  if (!channels.length) throw new AccessError(400, "Add at least one Discord channel ID (numbers only).");

  const roleMapping: Record<string, string> = {};
  if (input.roleMapping && typeof input.roleMapping === "object") {
    for (const [k, v] of Object.entries(input.roleMapping).slice(0, 50)) {
      if (k && typeof v === "string") roleMapping[String(k).slice(0, 80)] = v.slice(0, 40);
    }
  }
  const gc = input.gameContext && typeof input.gameContext === "object" ? input.gameContext : {};
  const gameContext: GameContext = {
    game_name: String(gc.game_name || "").slice(0, 120),
    description: String(gc.description || "").slice(0, 2000),
    mechanics: (Array.isArray(gc.mechanics) ? gc.mechanics : []).map((m: any) => String(m).trim().slice(0, 60)).filter(Boolean).slice(0, 30),
    goals: String(gc.goals || "").slice(0, 2000),
  };

  const values = {
    gameId,
    botToken,
    channels: JSON.stringify(channels),
    staffPrefixes: String(input.staffPrefixes || "").slice(0, 300),
    roleMapping: JSON.stringify(roleMapping),
    gameContext: JSON.stringify(gameContext),
    updatedAt: new Date(),
    updatedBy: userId,
  };
  await db.insert(playtestConfigs).values(values).onConflictDoUpdate({ target: playtestConfigs.gameId, set: values });
  return getPublicConfig(gameId);
}

/* ── Dashboard data ── */

export async function getDashboard(gameId: string) {
  const db = getDb();
  const [config, observations, scans] = await Promise.all([
    getPublicConfig(gameId),
    db.select().from(playtestObservations).where(eq(playtestObservations.gameId, gameId)).orderBy(desc(playtestObservations.timestamp)).limit(5000),
    db.select().from(playtestScans).where(eq(playtestScans.gameId, gameId)).orderBy(desc(playtestScans.startedAt)).limit(1),
  ]);
  return {
    config,
    observations: observations.map((o) => ({
      message_id: o.messageId,
      timestamp: o.timestamp,
      channel_id: o.channelId,
      channel_name: o.channelName,
      kind: o.kind,
      speaker: o.speaker,
      role: o.role,
      theme: o.theme,
      signal: o.signal,
      severity: o.severity,
      excerpt: o.excerpt,
      paraphrase: o.paraphrase || "",
    })),
    latestScan: scans[0] || null,
  };
}

/* ── Scan ── */

class DiscordError extends Error {}

async function discord(token: string, path: string, deadline: number): Promise<any> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(DISCORD_API + path, { headers: { Authorization: `Bot ${token}` }, cache: "no-store" });
    if (res.status === 429) {
      const body = await res.json().catch(() => ({}));
      const wait = Math.min(Number(body.retry_after || 1) * 1000, 5000);
      if (Date.now() + wait > deadline) throw new DiscordError("Discord is rate-limiting the bot; try again in a minute.");
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (res.status === 401) throw new DiscordError("Discord rejected the bot token. Paste a fresh one in Settings.");
    if (res.status === 403) throw new DiscordError("The bot can't read this channel. Give it View Channel + Read Message History.");
    if (res.status === 404) throw new DiscordError("Channel not found. Check the channel ID and that the bot is in the server.");
    if (!res.ok) throw new DiscordError(`Discord error ${res.status}.`);
    return res.json();
  }
  throw new DiscordError("Discord is rate-limiting the bot; try again in a minute.");
}

const MAX_PAGES_PER_CHANNEL = 10; // 1,000 messages per channel per scan

async function fetchMessages(token: string, channelId: string, since: Date, deadline: number) {
  const all: any[] = [];
  let before: string | undefined;
  for (let page = 0; page < MAX_PAGES_PER_CHANNEL && Date.now() < deadline; page++) {
    const q = new URLSearchParams({ limit: "100" });
    if (before) q.set("before", before);
    const batch: any[] = await discord(token, `/channels/${channelId}/messages?${q}`, deadline);
    if (!batch.length) break;
    let stop = false;
    for (const m of batch) {
      if (new Date(m.timestamp) <= since) { stop = true; break; }
      all.push(m);
    }
    if (stop || batch.length < 100) break;
    before = batch[batch.length - 1].id;
  }
  return all;
}

async function deepseek(prompt: string, maxTokens: number): Promise<string> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return "";
  try {
    const res = await fetch(DEEPSEEK_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: "deepseek-chat", messages: [{ role: "user", content: prompt }], temperature: 0.3, max_tokens: maxTokens }),
      signal: AbortSignal.timeout(15000),
    });
    const j = await res.json();
    return j.choices?.[0]?.message?.content || "";
  } catch {
    return "";
  }
}

export async function runScan(userId: string, gameId: string, opts: { budgetMs?: number } = {}) {
  const deadline = Date.now() + (opts.budgetMs ?? 45000);
  const db = getDb();
  const [cfg] = await db.select().from(playtestConfigs).where(eq(playtestConfigs.gameId, gameId)).limit(1);
  const token = open(cfg?.botToken);
  if (!cfg || !token) throw new AccessError(400, "No bot token yet. Add one in Settings.");
  const channels = parse<Channel[]>(cfg.channels, []);
  if (!channels.length) throw new AccessError(400, "No channels yet. Add channel IDs in Settings.");
  const staffPrefixes = (cfg.staffPrefixes || "").split(",").map((s) => s.trim()).filter(Boolean);
  const roleMap = parse<Record<string, string>>(cfg.roleMapping, {});
  const ctx = parse<GameContext>(cfg.gameContext, {});
  const mechanics = ctx.mechanics || [];

  // Only fetch what's new since the last completed scan (first scan: a year).
  const [last] = await db
    .select({ startedAt: playtestScans.startedAt })
    .from(playtestScans)
    .where(and(eq(playtestScans.gameId, gameId), isNotNull(playtestScans.completedAt)))
    .orderBy(desc(playtestScans.startedAt))
    .limit(1);
  const since = last ? new Date(last.startedAt.getTime() - 60 * 60 * 1000) : new Date(Date.now() - 365 * 86400000);

  const [scan] = await db
    .insert(playtestScans)
    .values({ gameId, channelIds: JSON.stringify(channels.map((c) => c.id)), createdBy: userId })
    .returning({ id: playtestScans.id });

  try {
    // Channel names + the server's roles (for role mapping).
    const guildRoles: Record<string, string> = {};
    const names: Record<string, string> = {};
    let guildId: string | null = null;
    for (const ch of channels) {
      const info = await discord(token, `/channels/${ch.id}`, deadline);
      names[ch.id] = info.name || ch.name;
      guildId = guildId || info.guild_id || null;
    }
    // Remember real channel names for the dashboard's channel filter.
    if (channels.some((c) => names[c.id] && names[c.id] !== c.name)) {
      const named = channels.map((c) => ({ id: c.id, name: names[c.id] || c.name, label: "#" + (names[c.id] || c.name) }));
      await db.update(playtestConfigs).set({ channels: JSON.stringify(named) }).where(eq(playtestConfigs.gameId, gameId));
    }
    if (guildId && Object.keys(roleMap).length) {
      try {
        const roles: any[] = await discord(token, `/guilds/${guildId}/roles`, deadline);
        roles.forEach((r) => { guildRoles[r.id] = r.name; });
      } catch { /* role mapping is optional */ }
    }

    let fetched = 0;
    let partial = false;
    const rows: (typeof playtestObservations.$inferInsert)[] = [];
    for (const ch of channels) {
      if (Date.now() > deadline) { partial = true; break; }
      const msgs = await fetchMessages(token, ch.id, since, deadline);
      fetched += msgs.length;
      for (const msg of msgs) {
        if (msg.type !== 0 && msg.type !== 19) continue; // default + reply
        if (msg.author?.bot) continue;
        const content = String(msg.content || "").trim();
        if (content.length < 10) continue;
        const speaker = msg.author?.global_name || msg.author?.username || "Unknown";
        const base = {
          gameId, scanId: scan.id, messageId: String(msg.id), timestamp: new Date(msg.timestamp),
          channelId: ch.id, channelName: names[ch.id] || ch.name, speaker,
          excerpt: content.slice(0, 300), paraphrase: content.slice(0, 200),
        };
        const prefixStaff = staffPrefixes.some((p) => speaker.startsWith(p) || String(msg.author?.username || "").startsWith(p));
        let role = prefixStaff ? "Staff" : "Player";
        if (!prefixStaff && Array.isArray(msg.member?.roles)) {
          for (const rid of msg.member.roles) {
            const mapped = roleMap[guildRoles[rid]];
            if (mapped) { role = mapped; break; }
          }
        }
        if (role === "Staff" || role === "Ambassador") {
          rows.push({ ...base, kind: "staff", role, theme: "Staff", signal: "Staff reply", severity: "Context" });
        } else if (isEngagement(content)) {
          rows.push({ ...base, kind: "engagement", role, theme: "Engagement", signal: "Engagement", severity: "Context" });
        } else {
          rows.push({ ...base, kind: "observation", role, ...classify(content, mechanics) });
        }
      }
    }

    // Insert, skipping messages already stored; keep only the genuinely new rows.
    const added = new Set<string>();
    for (let i = 0; i < rows.length; i += 200) {
      const ins = await db
        .insert(playtestObservations)
        .values(rows.slice(i, i + 200))
        .onConflictDoNothing({ target: [playtestObservations.gameId, playtestObservations.messageId] })
        .returning({ messageId: playtestObservations.messageId });
      ins.forEach((r) => added.add(r.messageId));
    }
    const fresh = rows.filter((r) => added.has(r.messageId));

    // Optional AI read-out (needs DEEPSEEK_API_KEY), over this scan's new player feedback.
    const playerNew = fresh.filter((r) => r.kind === "observation");
    let summary = "", insights = "", recommendations = "";
    if (playerNew.length && process.env.DEEPSEEK_API_KEY && Date.now() < deadline) {
      const list = playerNew.slice(0, 20).map((o) => `[${o.severity}] ${o.speaker}: "${String(o.excerpt).slice(0, 150)}"`).join("\n");
      const game = ctx.game_name ? `Game: ${ctx.game_name}. ${ctx.description || ""} Mechanics: ${mechanics.join(", ")}. Playtest goals: ${ctx.goals || "General feedback"}. ` : "";
      [summary, insights, recommendations] = await Promise.all([
        deepseek(`Summarize these Discord playtest observations for a game developer. ${game}Include: top critical issues, positive feedback highlights, and key themes. Use bullet points, under 200 words.\n\n${list}`, 500),
        deepseek(`Analyze these playtest observations and return a JSON array of 4-6 detailed key insights. ${game}Format: [{"priority":"Critical|High|Medium","title":"short title (max 8 words)","body":"detailed 2-4 sentence insight with specific examples and actionable recommendations"}]. Focus on patterns, severity trends, and what the dev team should prioritize.\n\n${list}`, 800),
        deepseek(`Based on these playtest observations, generate a JSON array of 5-8 prioritized, actionable recommendations for the dev team. Format: [{"priority":"Immediate|Near term","text":"specific recommendation (max 120 chars)","theme":"relevant game system or area"}]. Be specific and action-oriented. ${game}\n\n${list}`, 600),
      ]);
    }

    await db
      .update(playtestScans)
      .set({
        messagesFetched: fetched,
        observationsFound: playerNew.length,
        summary: summary || null,
        insights: insights || null,
        recommendations: recommendations || null,
        completedAt: new Date(),
        error: partial ? "Stopped early to stay within the time limit; run another scan to continue." : null,
      })
      .where(eq(playtestScans.id, scan.id));

    await recordLedger(userId, gameId);

    return {
      scan_id: scan.id,
      messages_fetched: fetched,
      observations_found: playerNew.length,
      engagement_found: fresh.filter((r) => r.kind === "engagement").length,
      total_classified: fresh.length,
      partial,
    };
  } catch (e) {
    const msg = e instanceof DiscordError ? e.message : "Scan failed.";
    await db.update(playtestScans).set({ error: msg }).where(eq(playtestScans.id, scan.id));
    if (e instanceof DiscordError) throw new AccessError(502, msg);
    throw e;
  }
}

/** Headline playtest numbers for the game's Signal Ledger (whole history). */
async function recordLedger(userId: string, gameId: string) {
  const db = getDb();
  const obs = await db
    .select({ severity: playtestObservations.severity })
    .from(playtestObservations)
    .where(and(eq(playtestObservations.gameId, gameId), eq(playtestObservations.kind, "observation")));
  const total = obs.length;
  const blockers = obs.filter((o) => o.severity === "Critical").length;
  const positive = obs.filter((o) => o.severity === "Preserve").length;
  await recordSignals(userId, gameId, TOOL_ID, [
    { key: "playtest_observations", label: "Playtest observations", value: total, unit: "units" },
    { key: "playtest_blockers", label: "Playtest blockers", value: blockers, unit: "units" },
    { key: "playtest_positive_share", label: "Positive playtest feedback", value: total ? (positive / total) * 100 : 0, unit: "pct" },
  ]);
}
