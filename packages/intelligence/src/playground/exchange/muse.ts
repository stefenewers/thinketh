/**
 * Muse chat with tools (Meta Model API, OpenAI-compatible Chat Completions), for agent exchanges.
 *
 * Verified against the API (2026-09-27, docs.meta.ai/docs/protocols/chat-completions and a live
 * probe): replay each assistant message with its `tool_calls`, then one `tool` message per call with
 * the matching `tool_call_id` (omitting it is HTTP 400); `tool_choice` accepts only "auto";
 * `reasoning_effort` must not be "none"; reasoning is not carried across turns and is never shown.
 */
import { logEvent } from "../../log.ts";

export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
export type ToolDef = { name: string; description: string; parameters: Record<string, unknown> };

export class MuseUnavailableError extends Error {}

export type MuseChatConfig = { apiKey: string; baseUrl: string; model: string };

export interface ExchangeModel {
  readonly label: string;
  /** `timeoutMs` bounds one attempt; `budgetMs` (default 2× timeout) bounds all attempts together. */
  complete(messages: ChatMessage[], tools: ToolDef[], opts: { timeoutMs: number; budgetMs?: number; maxTokens?: number; purpose: string }): Promise<{ message: Extract<ChatMessage, { role: "assistant" }>; ms: number }>;
}

const TRANSIENT = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
/** One retry: for a timeout, a transient status or a dropped connection. */
const RETRIES = 1;

export class MuseChat implements ExchangeModel {
  readonly label: string;
  private readonly cfg: MuseChatConfig;
  private readonly fetchImpl: typeof fetch;

  constructor(cfg: MuseChatConfig, fetchImpl: typeof fetch = fetch) {
    this.cfg = cfg;
    this.fetchImpl = fetchImpl;
    this.label = `Muse (${cfg.model})`;
  }

  async complete(messages: ChatMessage[], tools: ToolDef[], opts: { timeoutMs: number; budgetMs?: number; maxTokens?: number; purpose: string }) {
    const started = Date.now();
    const budget = opts.budgetMs ?? opts.timeoutMs * 2;
    let lastError = "";
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, 700));
      const remaining = Math.min(opts.timeoutMs, budget - (Date.now() - started));
      if (remaining < 3000) break;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), remaining);
      try {
        const res = await this.fetchImpl(`${this.cfg.baseUrl}/chat/completions`, {
          method: "POST",
          signal: ctrl.signal,
          headers: { Authorization: `Bearer ${this.cfg.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: this.cfg.model,
            max_tokens: opts.maxTokens ?? 1500,
            reasoning_effort: "low",
            tool_choice: "auto",
            tools: tools.map((t) => ({ type: "function", function: t })),
            messages,
          }),
        });
        if (!res.ok) {
          lastError = `muse ${res.status} ${(await res.text().catch(() => "")).slice(0, 160)}`;
          if (TRANSIENT.has(res.status)) continue;
          throw new MuseUnavailableError(lastError);
        }
        const body = (await res.json()) as { choices?: Array<{ message?: { content?: string | null; tool_calls?: ToolCall[] } }> };
        const m = body.choices?.[0]?.message;
        if (!m) throw new MuseUnavailableError("muse returned no message");
        // Replay exactly what the API needs: role, content, tool_calls. Nothing else is kept.
        const message: Extract<ChatMessage, { role: "assistant" }> = {
          role: "assistant",
          content: m.content ?? null,
          ...(m.tool_calls?.length ? { tool_calls: m.tool_calls.map((c) => ({ id: c.id, type: "function" as const, function: { name: c.function.name, arguments: c.function.arguments } })) } : {}),
        };
        const ms = Date.now() - started;
        logEvent("exchange.model_call", { purpose: opts.purpose, ms, attempt, tools: message.tool_calls?.map((c) => c.function.name) ?? [] });
        return { message, ms };
      } catch (err) {
        if (err instanceof MuseUnavailableError) throw err;
        lastError = err instanceof Error ? (err.name === "AbortError" ? "muse timed out" : err.message) : String(err);
      } finally {
        clearTimeout(timer);
      }
    }
    throw new MuseUnavailableError(lastError || "muse unavailable");
  }
}
