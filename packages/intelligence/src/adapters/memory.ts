/**
 * MemoryProvider: persistent, cross-thread learning context (preferences,
 * recurring misconceptions, current topics, conversation memory).
 *
 * Backboard is NOT the source of truth for numeric mastery. That lives in the
 * knowledge-state engine and the temporal store.
 */
import type { MemoryItem } from "@thinketh/contracts";
import { MemoryItemSchema } from "@thinketh/contracts";
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
    return [...prefs, ...rest].slice(0, RECALL_LIMIT);
  }

  async remember(userId: string, item: MemoryItem): Promise<void> {
    const list = this.forUser(userId);
    if (!list.some((m) => m.content === item.content)) list.push(item);
  }

  async reset(userId: string): Promise<void> {
    this.items.delete(userId);
  }
}

type BackboardMemoryRecord = { id: string; content: string; metadata?: Record<string, unknown> | null; created_at?: string };

type BackboardOptions = {
  apiKey: string;
  baseUrl: string;
  /** Use one pre-created assistant (e.g. for the demo persona). */
  assistantId?: string;
  /** Persist/lookup assistant ids (Supabase integration_ids) so they survive restarts. */
  lookupAssistant?: (userId: string) => Promise<string | undefined>;
  saveAssistant?: (userId: string, assistantId: string) => Promise<void>;
};

/**
 * Backboard REST adapter (https://app.backboard.io/api, header X-API-Key).
 * One stable assistant per user, so memory persists across threads.
 */
export class BackboardMemory implements MemoryProvider {
  readonly name = "backboard" as const;
  private readonly assistants = new Map<string, string>();
  private readonly opts: BackboardOptions;

  constructor(opts: BackboardOptions) {
    this.opts = opts;
  }

  private async call(path: string, init: RequestInit = {}): Promise<Response> {
    const res = await fetch(`${this.opts.baseUrl}${path}`, {
      ...init,
      headers: { "X-API-Key": this.opts.apiKey, "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    return ensureOk(res, `backboard ${init.method ?? "GET"} ${path.split("/").slice(0, 2).join("/")}`);
  }

  async assistantFor(userId: string): Promise<string> {
    if (this.opts.assistantId) return this.opts.assistantId;
    const cached = this.assistants.get(userId) ?? (await this.opts.lookupAssistant?.(userId));
    if (cached) {
      this.assistants.set(userId, cached);
      return cached;
    }
    const res = await this.call("/assistants", {
      method: "POST",
      body: JSON.stringify({
        name: `thinketh-${userId}`.slice(0, 255),
        system_prompt:
          "You are the persistent learning memory for one Thinketh user. Remember their explanation preferences, recurring misconceptions, current learning topics and past questions.",
      }),
    });
    const { assistant_id } = (await res.json()) as { assistant_id: string };
    this.assistants.set(userId, assistant_id);
    await this.opts.saveAssistant?.(userId, assistant_id);
    return assistant_id;
  }

  private toItem(m: BackboardMemoryRecord): MemoryItem {
    const kind = MemoryItemSchema.shape.kind.safeParse(m.metadata?.kind);
    return {
      id: String(m.metadata?.thinkethId ?? m.id),
      kind: kind.success ? kind.data : "conversation",
      content: m.content,
      createdAt: m.created_at ?? new Date().toISOString(),
    };
  }

  async recall(userId: string, query: string): Promise<MemoryItem[]> {
    const assistantId = await this.assistantFor(userId);
    const res = await this.call(`/assistants/${assistantId}/memories/search`, {
      method: "POST",
      body: JSON.stringify({ query, limit: RECALL_LIMIT }),
    });
    const body = (await res.json()) as { memories?: BackboardMemoryRecord[] };
    return (body.memories ?? []).map((m) => this.toItem(m));
  }

  async remember(userId: string, item: MemoryItem): Promise<void> {
    const assistantId = await this.assistantFor(userId);
    await this.call(`/assistants/${assistantId}/memories`, {
      method: "POST",
      body: JSON.stringify({ content: item.content, metadata: { kind: item.kind, thinkethId: item.id } }),
    });
  }

  async reset(userId: string): Promise<void> {
    const assistantId = await this.assistantFor(userId);
    await this.call(`/assistants/${assistantId}/memories`, { method: "DELETE" });
  }
}
