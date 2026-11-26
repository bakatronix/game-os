/**
 * The one place Game OS chooses its language model. Every LLM call goes through here, so swapping the model
 * is a single change: set GAMEOS_LLM_MODEL in the environment (no code change), or edit DEFAULT_LLM_MODEL.
 *
 * Provider: Anthropic (Claude), approved by the owner on 2026-11-26 for Sentiment Radar phase 2.
 * Key: ANTHROPIC_API_KEY, server-side only (Vercel env, or .env.local when running locally). Never commit it.
 * Rules (docs/MARKETING-TOOLS-BRIEFS.md §3): public review and store-page text only. Studio-submitted data
 * (Steamworks exports, refund figures) and Discord messages are never sent to a model provider.
 */

import Anthropic from "@anthropic-ai/sdk";

/** Default model. Override with the GAMEOS_LLM_MODEL environment variable. */
export const DEFAULT_LLM_MODEL = "claude-opus-5-5";

export function llmModel(): string {
  const m = (process.env.GAMEOS_LLM_MODEL || "").trim();
  return /^[a-z0-9.\-_:@]{3,80}$/i.test(m) ? m : DEFAULT_LLM_MODEL;
}

export function llmConfigured(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || "").trim();
}

let client: Anthropic | null = null;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 240_000 });
  return client;
}

export type JsonCallResult =
  | { ok: true; data: unknown; model: string; usage: { input: number; output: number } }
  | { ok: false; reason: "not-configured" | "refused" | "truncated" | "bad-output" | "rate-limited" | "provider-error"; status?: number };

/**
 * One structured-output request: the reply is JSON matching `schema`. Streams (long inputs), turns on
 * Anthropic's server-side refusal fallback, and never retries in a loop. Errors are returned, not thrown.
 */
export async function callJson(opts: { system: string; user: string; schema: Record<string, unknown>; maxTokens?: number }): Promise<JsonCallResult> {
  if (!llmConfigured()) return { ok: false, reason: "not-configured" };
  const model = llmModel();
  try {
    const stream = getClient().beta.messages.stream({
      model,
      max_tokens: opts.maxTokens ?? 32000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: opts.schema } },
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    } as any);
    const msg: any = await stream.finalMessage();
    if (msg.stop_reason === "refusal") return { ok: false, reason: "refused" };
    if (msg.stop_reason === "max_tokens") return { ok: false, reason: "truncated" };
    const text = (msg.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
    let data: unknown;
    try { data = JSON.parse(text); } catch { return { ok: false, reason: "bad-output" }; }
    return { ok: true, data, model: String(msg.model || model), usage: { input: Number(msg.usage?.input_tokens) || 0, output: Number(msg.usage?.output_tokens) || 0 } };
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return { ok: false, reason: "rate-limited", status: 429 };
    if (err instanceof Anthropic.APIError) {
      console.error("[llm]", err.status, err.message);
      return { ok: false, reason: "provider-error", status: err.status };
    }
    console.error("[llm]", err);
    return { ok: false, reason: "provider-error" };
  }
}
