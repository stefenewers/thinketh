/**
 * TemporalStore: append-only knowledge observations and state transitions.
 * "Version control for human understanding."
 *
 * Tiger Data (TimescaleDB) schema: infra/tiger.sql.
 */
import type { KnowledgeObservation, KnowledgeState, KnowledgeStateTransition } from "../contracts.ts";
import { KnowledgeStateTransitionSchema } from "../contracts.ts";
import { guarded } from "./guard.ts";
import type { TemporalStore } from "./types.ts";

export class LocalTemporalStore implements TemporalStore {
  readonly name = "local" as const;
  private readonly observations: KnowledgeObservation[] = [];
  private readonly transitions: KnowledgeStateTransition[] = [];

  async appendObservation(input: KnowledgeObservation): Promise<void> {
    this.observations.push(input);
  }

  async appendTransition(input: KnowledgeStateTransition): Promise<void> {
    this.transitions.push(input);
  }

  async getConceptHistory(userId: string, conceptId: string): Promise<KnowledgeStateTransition[]> {
    return this.transitions.filter((t) => t.userId === userId && t.conceptId === conceptId);
  }

  async getLatestStates(userId: string): Promise<KnowledgeState[]> {
    const latest = new Map<string, KnowledgeState>();
    for (const t of this.transitions) if (t.userId === userId) latest.set(t.conceptId, t.after);
    return [...latest.values()];
  }

  async getRecentTransitions(userId: string, limit: number): Promise<KnowledgeStateTransition[]> {
    return this.transitions.filter((t) => t.userId === userId).slice(-limit).reverse();
  }

  async appendInteraction(): Promise<void> {}

  async reset(userId: string): Promise<void> {
    const keep = <T extends { userId: string }>(list: T[]) => {
      const kept = list.filter((x) => x.userId !== userId);
      list.splice(0, list.length, ...kept);
    };
    keep(this.observations);
    keep(this.transitions);
  }
}

type Sql = import("postgres").Sql;

export class TigerTemporalStore implements TemporalStore {
  readonly name = "tiger" as const;
  private sqlPromise: Promise<Sql> | undefined;
  private readonly url: string;

  constructor(url: string) {
    this.url = url;
  }

  sql(): Promise<Sql> {
    this.sqlPromise ??= import("postgres").then(({ default: postgres }) =>
      postgres(this.url, { max: 3, idle_timeout: 20, connect_timeout: 5, prepare: false, ssl: "require" }),
    );
    return this.sqlPromise;
  }

  /** Cheap liveness check for /health?probe=true. */
  async probe(): Promise<string> {
    const sql = await this.sql();
    const [row] = await sql`select (select count(*) from knowledge_state_transitions)::int as transitions`;
    return `${row?.transitions ?? 0} transitions stored`;
  }

  async appendObservation(o: KnowledgeObservation): Promise<void> {
    const sql = await this.sql();
    await sql`
      insert into knowledge_observations (id, user_id, concept_id, kind, weight, correctness, source_ref, created_at)
      values (${o.id}, ${o.userId}, ${o.conceptId}, ${o.kind}, ${o.weight}, ${o.correctness ?? null}, ${o.sourceRef ?? null}, ${o.createdAt})
      on conflict do nothing`;
  }

  async appendTransition(t: KnowledgeStateTransition): Promise<void> {
    const sql = await this.sql();
    await sql`
      insert into knowledge_state_transitions (
        id, user_id, concept_id, created_at, observation_id, observation_kind,
        mastery_before, mastery_after, uncertainty_before, uncertainty_after,
        confidence_after, evidence_count, reason, payload)
      values (
        ${t.id}, ${t.userId}, ${t.conceptId}, ${t.createdAt}, ${t.observation.id}, ${t.observation.kind},
        ${t.before.mastery}, ${t.after.mastery}, ${t.before.uncertainty}, ${t.after.uncertainty},
        ${t.after.confidence}, ${t.after.evidenceCount}, ${t.reason}, ${sql.json(t as never)})
      on conflict do nothing`;
  }

  async getConceptHistory(userId: string, conceptId: string): Promise<KnowledgeStateTransition[]> {
    const sql = await this.sql();
    const rows = await sql`
      select payload from knowledge_state_transitions
      where user_id = ${userId} and concept_id = ${conceptId}
      order by created_at asc`;
    return rows.map((r) => KnowledgeStateTransitionSchema.parse(r.payload));
  }

  async getLatestStates(userId: string): Promise<KnowledgeState[]> {
    const sql = await this.sql();
    const rows = await sql`
      select distinct on (concept_id) payload
      from knowledge_state_transitions
      where user_id = ${userId}
      order by concept_id, created_at desc`;
    return rows.map((r) => KnowledgeStateTransitionSchema.parse(r.payload).after);
  }

  async getRecentTransitions(userId: string, limit: number): Promise<KnowledgeStateTransition[]> {
    const sql = await this.sql();
    const rows = await sql`
      select payload from knowledge_state_transitions
      where user_id = ${userId}
      order by created_at desc
      limit ${limit}`;
    return rows.map((r) => KnowledgeStateTransitionSchema.parse(r.payload));
  }

  async appendInteraction(input: { userId: string; kind: string; refId?: string; payload?: Record<string, unknown>; at: string }): Promise<void> {
    const sql = await this.sql();
    await sql`
      insert into interaction_events (user_id, kind, ref_id, payload, created_at)
      values (${input.userId}, ${input.kind}, ${input.refId ?? null}, ${sql.json((input.payload ?? {}) as never)}, ${input.at})`;
  }

  async reset(userId: string): Promise<void> {
    const sql = await this.sql();
    await sql`delete from knowledge_state_transitions where user_id = ${userId}`;
    await sql`delete from knowledge_observations where user_id = ${userId}`;
  }
}

const byCreatedAt = (a: KnowledgeStateTransition, b: KnowledgeStateTransition) => a.createdAt.localeCompare(b.createdAt);

/**
 * Local store always receives writes; Tiger receives them too when configured.
 * Reads merge both so a Tiger outage mid-demo never loses a transition, and a
 * fresh serverless instance still sees Tiger's history.
 */
export class ResilientTemporalStore implements TemporalStore {
  readonly name: "tiger" | "local";
  private readonly local: LocalTemporalStore;
  private readonly remote: TigerTemporalStore | undefined;
  private readonly timeoutMs: number;

  constructor(local: LocalTemporalStore, remote: TigerTemporalStore | undefined, timeoutMs = 2500) {
    this.local = local;
    this.remote = remote;
    this.timeoutMs = timeoutMs;
    this.name = remote ? "tiger" : "local";
  }

  private write(op: string, localFn: () => Promise<void>, remoteFn?: (r: TigerTemporalStore) => Promise<void>): Promise<void> {
    const remote = this.remote;
    return localFn().then(async () => {
      await guarded("tiger", op, remote && remoteFn ? () => remoteFn(remote) : undefined, () => undefined, this.timeoutMs);
    });
  }

  private async read<T>(op: string, remoteFn: (r: TigerTemporalStore) => Promise<T>, empty: T): Promise<T> {
    const remote = this.remote;
    return (await guarded("tiger", op, remote ? () => remoteFn(remote) : undefined, () => empty, this.timeoutMs)).value;
  }

  /** The Tiger store behind this one, if configured (for health probes). */
  get tiger(): TigerTemporalStore | undefined {
    return this.remote;
  }

  appendObservation(input: KnowledgeObservation): Promise<void> {
    return this.write("appendObservation", () => this.local.appendObservation(input), (r) => r.appendObservation(input));
  }

  appendTransition(input: KnowledgeStateTransition): Promise<void> {
    return this.write("appendTransition", () => this.local.appendTransition(input), (r) => r.appendTransition(input));
  }

  appendInteraction(input: { userId: string; kind: string; refId?: string; payload?: Record<string, unknown>; at: string }): Promise<void> {
    return this.write("appendInteraction", () => this.local.appendInteraction(), (r) => r.appendInteraction(input));
  }

  private merge(a: KnowledgeStateTransition[], b: KnowledgeStateTransition[]): KnowledgeStateTransition[] {
    const byId = new Map<string, KnowledgeStateTransition>();
    for (const t of [...a, ...b]) byId.set(t.id, t);
    return [...byId.values()].sort(byCreatedAt);
  }

  async getConceptHistory(userId: string, conceptId: string): Promise<KnowledgeStateTransition[]> {
    const [local, remote] = await Promise.all([
      this.local.getConceptHistory(userId, conceptId),
      this.read("getConceptHistory", (r) => r.getConceptHistory(userId, conceptId), [] as KnowledgeStateTransition[]),
    ]);
    return this.merge(remote, local);
  }

  async getLatestStates(userId: string): Promise<KnowledgeState[]> {
    const [local, remote] = await Promise.all([
      this.local.getLatestStates(userId),
      this.read("getLatestStates", (r) => r.getLatestStates(userId), [] as KnowledgeState[]),
    ]);
    const latest = new Map<string, KnowledgeState>();
    for (const s of [...remote, ...local]) {
      const cur = latest.get(s.conceptId);
      if (!cur || s.lastObservedAt >= cur.lastObservedAt) latest.set(s.conceptId, s);
    }
    return [...latest.values()];
  }

  async getRecentTransitions(userId: string, limit: number): Promise<KnowledgeStateTransition[]> {
    const [local, remote] = await Promise.all([
      this.local.getRecentTransitions(userId, limit),
      this.read("getRecentTransitions", (r) => r.getRecentTransitions(userId, limit), [] as KnowledgeStateTransition[]),
    ]);
    return this.merge(remote, local).reverse().slice(0, limit);
  }

  async reset(userId: string): Promise<void> {
    await this.write("reset", () => this.local.reset(userId), (r) => r.reset(userId));
  }
}
