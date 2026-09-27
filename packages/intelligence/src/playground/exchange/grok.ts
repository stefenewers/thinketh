/**
 * Grokbot's model: xAI's Responses API (https://api.x.ai/v1/responses), server-side only.
 *
 * Checked against docs.x.ai (2026-09-26): function tools are `{ type: "function", name, description,
 * parameters }` with an object-rooted schema; a call comes back as an `output` item
 * `{ type: "function_call", call_id, name, arguments }` and its result goes back as
 * `{ type: "function_call_output", call_id, output }`; `reasoning` output items are summaries we never
 * show. Requests are stateless (`store: false`): the full context is replayed each call, so nothing
 * about a room is retained by xAI beyond the request itself.
 *
 * Same conventions as the Muse client: bounded retries on transient statuses, one deadline across
 * retries, and a log line per call (purpose, ms, model, tools, token usage), never the key or content.
 */
import { logEvent } from "../../log.ts";
import type { ChatMessage, ExchangeModel, ToolCall, ToolDef } from "./muse.ts";

export class ChallengerUnavailableError extends Error {}
export class ChallengerTimeoutError extends ChallengerUnavailableError {}

export type XaiConfig = { apiKey: string; baseUrl: string; model: string; reasoningEffort?: string };

/** An ExchangeModel that also reports the model id the provider says actually answered. */
export interface ChallengerModel extends ExchangeModel {
  readonly provider: "xai";
  readonly configuredModel: string;
  complete(
    messages: ChatMessage[],
    tools: ToolDef[],
    opts: { timeoutMs: number; maxTokens?: number; purpose: string },
  ): Promise<{ message: Extract<ChatMessage, { role: "assistant" }>; ms: number; model?: string }>;
}

const TRANSIENT = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const RETRIES = 1;

type OutputItem =
  | { type: "message"; role?: string; content?: Array<{ type: string; text?: string }> }
  | { type: "function_call"; call_id: string; name: string; arguments: string }
  | { type: string };

/** Chat history → Responses input items (system/user/assistant messages, calls and their outputs). */
export function toResponsesInput(messages: ChatMessage[]): unknown[] {
  const out: unknown[] = [];
  for (const m of messages) {
    if (m.role === "tool") out.push({ type: "function_call_output", call_id: m.tool_call_id, output: m.content });
    else if (m.role === "assistant") {
      if (m.content) out.push({ role: "assistant", content: m.content });
      for (const c of m.tool_calls ?? []) out.push({ type: "function_call", call_id: c.id, name: c.function.name, arguments: c.function.arguments });
    } else out.push({ role: m.role, content: m.content });
  }
  return out;
}

export class GrokChallenger implements ChallengerModel {
  readonly provider = "xai" as const;
  readonly label: string;
  readonly configuredModel: string;
  private readonly cfg: XaiConfig;
  private readonly fetchImpl: typeof fetch;

  constructor(cfg: XaiConfig, fetchImpl: typeof fetch = fetch) {
    this.cfg = cfg;
    this.fetchImpl = fetchImpl;
    this.configuredModel = cfg.model;
    this.label = `Grok (${cfg.model})`;
  }

  async complete(messages: ChatMessage[], tools: ToolDef[], opts: { timeoutMs: number; maxTokens?: number; purpose: string }) {
    const started = Date.now();
    let lastError = "";
    let timedOut = false;
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, 800));
      const remaining = opts.timeoutMs - (Date.now() - started);
      if (remaining < 2000) break;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), remaining);
      try {
        const res = await this.fetchImpl(`${this.cfg.baseUrl}/responses`, {
          method: "POST",
          signal: ctrl.signal,
          headers: { Authorization: `Bearer ${this.cfg.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: this.cfg.model,
            input: toResponsesInput(messages),
            tools: tools.map((t) => ({ type: "function", name: t.name, description: t.description, parameters: t.parameters })),
            tool_choice: "required",
            parallel_tool_calls: false,
            max_output_tokens: opts.maxTokens ?? 2000,
            store: false,
            ...(this.cfg.reasoningEffort ? { reasoning: { effort: this.cfg.reasoningEffort } } : {}),
          }),
        });
        if (!res.ok) {
          lastError = `xai ${res.status} ${(await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 160)}`;
          if (TRANSIENT.has(res.status)) continue;
          throw new ChallengerUnavailableError(lastError);
        }
        const body = (await res.json()) as { model?: string; output?: OutputItem[]; usage?: { input_tokens?: number; output_tokens?: number; output_tokens_details?: { reasoning_tokens?: number } } };
        const items = body.output ?? [];
        const calls: ToolCall[] = items
          .filter((i): i is Extract<OutputItem, { type: "function_call" }> => i.type === "function_call" && "call_id" in i)
          .map((i) => ({ id: i.call_id, type: "function" as const, function: { name: i.name, arguments: i.arguments } }));
        const text = items
          .filter((i): i is Extract<OutputItem, { type: "message" }> => i.type === "message")
          .flatMap((i) => i.content ?? [])
          .map((c) => c.text ?? "")
          .join("")
          .trim();
        if (!calls.length && !text) throw new ChallengerUnavailableError("xai returned no output");
        const message: Extract<ChatMessage, { role: "assistant" }> = { role: "assistant", content: text || null, ...(calls.length ? { tool_calls: calls } : {}) };
        const ms = Date.now() - started;
        logEvent("challenge.grok_call", {
          purpose: opts.purpose,
          ms,
          attempt,
          model: body.model ?? null,
          tools: calls.map((c) => c.function.name),
          inputTokens: body.usage?.input_tokens ?? null,
          outputTokens: body.usage?.output_tokens ?? null,
          reasoningTokens: body.usage?.output_tokens_details?.reasoning_tokens ?? null,
        });
        return { message, ms, ...(body.model ? { model: body.model } : {}) };
      } catch (err) {
        if (err instanceof ChallengerUnavailableError) throw err;
        timedOut = err instanceof Error && err.name === "AbortError";
        lastError = timedOut ? "xai timed out" : err instanceof Error ? err.message : String(err);
      } finally {
        clearTimeout(timer);
      }
    }
    if (timedOut || !lastError) throw new ChallengerTimeoutError(lastError || "xai timed out");
    throw new ChallengerUnavailableError(lastError);
  }
}

/** Which models this key can use (GET /v1/models), for configuration checks. */
export async function listXaiModels(cfg: Pick<XaiConfig, "apiKey" | "baseUrl">, fetchImpl: typeof fetch = fetch): Promise<string[]> {
  const res = await fetchImpl(`${cfg.baseUrl}/models`, { headers: { Authorization: `Bearer ${cfg.apiKey}` } });
  if (!res.ok) throw new ChallengerUnavailableError(`xai ${res.status}`);
  const body = (await res.json()) as { data?: Array<{ id: string }> };
  return (body.data ?? []).map((m) => m.id);
}
