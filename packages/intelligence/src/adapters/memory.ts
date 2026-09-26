/**
 * MemoryProvider: persistent, cross-thread learning context (preferences,
 * recurring misconceptions, current topics, conversation memory).
 *
 * Backboard is NOT the source of truth for numeric mastery. That lives in the
 * knowledge-state engine and the temporal store.
 */
import type { MemoryItem } from "../contracts.ts";
import { MemoryItemSchema } from "../contracts.ts";
import { lexicalScore } from "./model/deterministic.ts";
import { ensureOk } from "./guard.ts";
import type { MemoryProvider } from "./types.ts";

const RECALL_LIMIT = 5;

export class LocalMemory implements MemoryProvider {
  readonly name = "local" as const;
  private readonly items = new Map<string, MemoryItem[]>();
  private readonly seed: MemoryItem[];

  constructor(seed: MemoryItem[]) {
    this.seed = seed;
  }

  private forUser(userId: string): MemoryItem[] {
    let list = this.items.get(userId);
    if (!list) {
      list = this.seed.map((m) => ({ ...m }));
      this.items.set(userId, list);
    }
    return list;
  }

  async recall(userId: string, query: string): Promise<MemoryItem[]> {
    // Preferences always apply; everything else is ranked by relevance to the query.
    const list = this.forUser(userId);
    const prefs = list.filter((m) => m.kind === "preference");
    const rest = list
      .filter((m) => m.kind !== "preference")
      .map((m) => ({ m, s: lexicalScore(query, m.content) + (m.kind === "misconception" ? 0.1 : 0) }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.m);
    return [...prefs, ...rest].slice(0, RECALL_LIMIT).map((m) => ({ ...m, source: "local" as const }));
  }

  async remember(userId: string, item: MemoryItem): Promise<void> {
    const list = this.forUser(userId);
    if (!list.some((m) => m.content === item.content)) list.push(item);
  }

  async reset(userId: string): Promise<void> {
    this.items.delete(userId);
  }
}

type BackboardMemoryRecord = { id: string; content: string; metadata?: Record<string, unknown> | null; created_at?: string | null; score?: number | null };

/** Backboard memory modes: Auto = retrieve + write, Readonly = retrieve only. */
export type BackboardMemoryMode = "Auto" | "Readonly" | "off";

export type BackboardMessageResult = {
  threadId: string;
  content: string;
  status: string;
  memoryOperationId?: string;
  retrievedMemories: { id?: string; memory: string; score?: number }[];
};

type BackboardOptions = {
  apiKey: string;
  baseUrl: string;
  /** Use one pre-created assistant (e.g. for the demo persona). */
  assistantId?: string;
  /** Optional model for thread messages (Backboard's default otherwise), e.g. provider "anthropic". */
  llmProvider?: string;
  modelName?: string;
  /** Persist/lookup assistant ids (Supabase integration_ids) so they survive restarts. */
  lookupAssistant?: (userId: string) => Promise<string | undefined>;
  saveAssistant?: (userId: string, assistantId: string) => Promise<void>;
};

const SYSTEM_PROMPT =
  "You are the persistent learning memory for one Thinketh user. Remember their explanation preferences, recurring misconceptions, current learning topics and past questions. Never store numeric mastery scores.";

/** Always recalled alongside the query, so explanation preferences reach every answer. */
const STANDING_QUERY = "how this user prefers explanations, and misconceptions they have had";

/** Backboard's extracted memories carry no Thinketh kind, so infer one from the text. */
export function inferMemoryKind(content: string): MemoryItem["kind"] {
  if (/confus|conflat|misconception|mistak|mixed up|thought (that )?.* (was|is) /i.test(content)) return "misconception";
  if (/prefer|analog|learns? (best|fastest)|likes? |explanations? (style|with)/i.test(content)) return "preference";
  if (/learning|studying|currently|goal|interested in|wants to/i.test(content)) return "learning_topic";
  return "conversation";
}

/**
 * Backboard REST adapter (https://app.backboard.io/api, header X-API-Key).
 * One stable assistant per user, so memory persists across threads.
 *
 * - `recall` searches the assistant's memories directly: retrieval without mutation.
 * - `remember` writes a Thinketh-authored fact (misconception detected, question asked) with its kind.
 * - `observe` posts free text to the user's thread with memory "Auto", letting Backboard extract
 *   preferences and topics itself.
 */
export class BackboardMemory implements MemoryProvider {
  readonly name = "backboard" as const;
  private readonly assistants = new Map<string, string>();
  private readonly threads = new Map<string, string>();
  private readonly opts: BackboardOptions;

  constructor(opts: BackboardOptions) {
    this.opts = opts;
  }

  private async call(path: string, init: RequestInit = {}): Promise<Response> {
    // JSON bodies are strings; form bodies (thread messages) set their own content type.
    const headers: Record<string, string> = { "X-API-Key": this.opts.apiKey };
    if (typeof init.body === "string") headers["Content-Type"] = "application/json";
    const res = await fetch(`${this.opts.baseUrl}${path}`, { ...init, headers });
    return ensureOk(res, `backboard ${init.method ?? "GET"} ${path.split("/").slice(0, 2).join("/")}`);
  }

  async createAssistant(name: string): Promise<string> {
    const res = await this.call("/assistants", {
      method: "POST",
      body: JSON.stringify({ name: name.slice(0, 255), system_prompt: SYSTEM_PROMPT }),
    });
    return ((await res.json()) as { assistant_id: string }).assistant_id;
  }

  async assistantFor(userId: string): Promise<string> {
    if (this.opts.assistantId) return this.opts.assistantId;
    const cached = this.assistants.get(userId) ?? (await this.opts.lookupAssistant?.(userId));
    if (cached) {
      this.assistants.set(userId, cached);
      return cached;
    }
    const assistantId = await this.createAssistant(`thinketh-${userId}`);
    this.assistants.set(userId, assistantId);
    await this.opts.saveAssistant?.(userId, assistantId);
    return assistantId;
  }

  async createThread(assistantId: string): Promise<string> {
    const res = await this.call(`/assistants/${assistantId}/threads`, { method: "POST", body: "{}" });
    return ((await res.json()) as { thread_id: string }).thread_id;
  }

  /** Send a message on a thread with the given memory mode. */
  async sendMessage(threadId: string, content: string, memory: BackboardMemoryMode): Promise<BackboardMessageResult> {
    const form = new URLSearchParams({ content, stream: "false", memory });
    if (this.opts.llmProvider) form.set("llm_provider", this.opts.llmProvider);
    if (this.opts.modelName) form.set("model_name", this.opts.modelName);
    const res = await this.call(`/threads/${threadId}/messages`, { method: "POST", body: form });
    const body = (await res.json()) as {
      content?: string | null;
      status?: string;
      memory_operation_id?: string | null;
      retrieved_memories?: { id?: string | null; memory: string; score?: number | null }[] | null;
    };
    return {
      threadId,
      content: body.content ?? "",
      status: body.status ?? "UNKNOWN",
      ...(body.memory_operation_id ? { memoryOperationId: body.memory_operation_id } : {}),
      retrievedMemories: (body.retrieved_memories ?? []).map((m) => ({
        memory: m.memory,
        ...(m.id ? { id: m.id } : {}),
        ...(m.score != null ? { score: m.score } : {}),
      })),
    };
  }

  /** Memory writes are asynchronous; poll until the operation settles. */
  async waitForMemoryOperation(operationId: string, timeoutMs = 90_000, intervalMs = 1500): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const res = await this.call(`/assistants/memories/operations/${operationId}`);
      const { status } = (await res.json()) as { status?: string };
      if (status && status !== "IN_PROGRESS" && status !== "PENDING") return status;
      if (Date.now() > deadline) throw new Error(`backboard memory operation ${operationId} still ${status} after ${timeoutMs}ms`);
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  async searchMemories(assistantId: string, query: string, limit = RECALL_LIMIT): Promise<BackboardMemoryRecord[]> {
    const res = await this.call(`/assistants/${assistantId}/memories/search`, {
      method: "POST",
      body: JSON.stringify({ query, limit }),
    });
    return ((await res.json()) as { memories?: BackboardMemoryRecord[] }).memories ?? [];
  }

  private toItem(m: BackboardMemoryRecord): MemoryItem {
    const kind = MemoryItemSchema.shape.kind.safeParse(m.metadata?.kind);
    return {
      id: String(m.metadata?.thinkethId ?? m.id),
      kind: kind.success ? kind.data : inferMemoryKind(m.content),
      content: m.content,
      createdAt: m.created_at ?? new Date().toISOString(),
      source: "backboard",
    };
  }

  async recall(userId: string, query: string): Promise<MemoryItem[]> {
    const assistantId = await this.assistantFor(userId);
    const [relevant, standing] = await Promise.all([
      this.searchMemories(assistantId, query),
      this.searchMemories(assistantId, STANDING_QUERY),
    ]);
    const seen = new Set<string>();
    const items = [...relevant, ...standing]
      .filter((m) => !seen.has(m.id) && !!seen.add(m.id))
      .map((m) => this.toItem(m));
    // Same ordering rule as LocalMemory: preferences first, then by relevance.
    return [...items.filter((m) => m.kind === "preference"), ...items.filter((m) => m.kind !== "preference")].slice(0, RECALL_LIMIT);
  }

  async remember(userId: string, item: MemoryItem): Promise<void> {
    const assistantId = await this.assistantFor(userId);
    await this.call(`/assistants/${assistantId}/memories`, {
      method: "POST",
      body: JSON.stringify({ content: item.content, metadata: { kind: item.kind, thinkethId: item.id } }),
    });
  }

  async observe(userId: string, text: string): Promise<void> {
    const assistantId = await this.assistantFor(userId);
    let threadId = this.threads.get(userId);
    if (!threadId) {
      threadId = await this.createThread(assistantId);
      this.threads.set(userId, threadId);
    }
    await this.sendMessage(threadId, text, "Auto");
  }

  /** Cheap authenticated call used by `/health?probe=1`. */
  async probe(userId: string): Promise<void> {
    await this.call(`/assistants/${await this.assistantFor(userId)}`);
  }

  async reset(userId: string): Promise<void> {
    const assistantId = await this.assistantFor(userId);
    await this.call(`/assistants/${assistantId}/memories`, { method: "DELETE" });
  }
}
