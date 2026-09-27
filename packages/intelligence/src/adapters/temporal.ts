/**
 * TemporalStore: append-only knowledge observations and state transitions.
 * "Version control for human understanding."
 *
 * Tiger Data (TimescaleDB) schema: infra/tiger.sql.
 */
import type { KnowledgeObservation, KnowledgeState, KnowledgeStateTransition } from "../contracts.ts";
import { KnowledgeStateTransitionSchema } from "../contracts.ts";
import { logEvent } from "../log.ts";
import { guarded } from "./guard.ts";
import type { TemporalStore } from "./types.ts";
import type { DocStore } from "../store/docStore.ts";

export class LocalTemporalStore implements TemporalStore {
  readonly name = "local" as const;
  private readonly observations: KnowledgeObservation[] = [];
  private readonly transitions: KnowledgeStateTransition[] = [];
  /** Without Tiger, the local history is the record: keep it in the durable doc store so a restart keeps it. */
  private readonly persist: DocStore | undefined;
  private loaded: Promise<void> | undefined;

  constructor(persist?: DocStore) {
    this.persist = persist;
  }

  private ready(): Promise<void> {
    this.loaded ??= (async () => {
      if (!this.persist) return;
      const stored = await this.persist.list<KnowledgeStateTransition>("local_transitions", undefined, 100_000);
      const known = new Set(this.transitions.map((t) => t.id));
      this.transitions.unshift(...stored.filter((t) => !known.has(t.id)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    })();
    return this.loaded;
  }

  async appendObservation(input: KnowledgeObservation): Promise<void> {
    this.observations.push(input);
  }

  async appendTransition(input: KnowledgeStateTransition): Promise<void> {
    await this.ready();
    this.transitions.push(input);
    await this.persist?.put("local_transitions", input.id, input, input.userId);
  }

  async getConceptHistory(userId: string, conceptId: string): Promise<KnowledgeStateTransition[]> {
    await this.ready();
    return this.transitions.filter((t) => t.userId === userId && t.conceptId === conceptId);
  }

  async getLatestStates(userId: string): Promise<KnowledgeState[]> {
    await this.ready();
    const latest = new Map<string, KnowledgeState>();
    for (const t of this.transitions) if (t.userId === userId) latest.set(t.conceptId, t.after);
    return [...latest.values()];
  }

  async getRecentTransitions(userId: string, limit: number): Promise<KnowledgeStateTransition[]> {
    await this.ready();
    return this.transitions.filter((t) => t.userId === userId).slice(-limit).reverse();
  }

  async findTransitionByObservation(userId: string, observationId: string): Promise<KnowledgeStateTransition | undefined> {
    await this.ready();
    return this.transitions.find((t) => t.userId === userId && t.observation.id === observationId);
  }

  async appendInteraction(): Promise<void> {}

  async reset(userId: string): Promise<void> {
    await this.ready();
    const keep = <T extends { userId: string }>(list: T[]) => {
      const kept = list.filter((x) => x.userId !== userId);
      list.splice(0, list.length, ...kept);
    };
    keep(this.observations);
    keep(this.transitions);
    await this.persist?.removeOwned("local_transitions", userId);
  }
}

type Sql = import("postgres").Sql;

export class TigerTemporalStore implements TemporalStore {
  readonly name = "tiger" as const;
  private sqlPromise: Promise<Sql> | undefined;
  private readonly url: string;
  private readonly tlsInsecure: boolean;

  constructor(url: string, opts: { tlsInsecure?: boolean } = {}) {
    this.url = url;
    this.tlsInsecure = opts.tlsInsecure ?? false;
    if (this.tlsInsecure) logEvent("tiger.tls_insecure", { note: "HACKGT DEMO ONLY: Tiger certificate verification is off" }, "warn");
  }

  /**
   * TLS options for this connection only. Encryption is always required.
   * HACKGT DEMO ONLY: Deno rejects Tiger managed certificate chain; remove this bypass after the event.
   * (Timescale's server certificate is marked CA:TRUE, which Deno's TLS stack refuses as CaUsedAsEndEntity.)
   * With TIGER_TLS_INSECURE=true the certificate is not verified; nothing else in the process is affected.
   */
  tlsOptions(): "require" | { rejectUnauthorized: false } {
    return this.tlsInsecure ? { rejectUnauthorized: false } : "require";
  }

  sql(): Promise<Sql> {
    this.sqlPromise ??= import("postgres").then(({ default: postgres }) =>
      postgres(this.url, { max: 3, idle_timeout: 20, connect_timeout: 5, prepare: false, ssl: this.tlsOptions() }),
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

  async findTransitionByObservation(userId: string, observationId: string): Promise<KnowledgeStateTransition | undefined> {
    const sql = await this.sql();
    const rows = await sql`
      select payload from knowledge_state_transitions
      where user_id = ${userId} and observation_id = ${observationId}
      limit 1`;
    return rows[0] ? KnowledgeStateTransitionSchema.parse(rows[0].payload) : undefined;
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

  async findTransitionByObservation(userId: string, observationId: string): Promise<KnowledgeStateTransition | undefined> {
    return (
      (await this.local.findTransitionByObservation(userId, observationId)) ??
      (await this.read("findTransitionByObservation", (r) => r.findTransitionByObservation(userId, observationId), undefined as KnowledgeStateTransition | undefined))
    );
  }

  async reset(userId: string): Promise<void> {
    await this.write("reset", () => this.local.reset(userId), (r) => r.reset(userId));
  }
}
