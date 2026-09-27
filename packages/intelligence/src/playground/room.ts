/**
 * Playground rooms. The server is the source of truth: every scene change lands here first, then a
 * semantic event is broadcast. A room compares two permissioned Mind snapshots, lets the two
 * participants' agents exchange (exchange/engine.ts) and lets Grokbot challenge the saved takeaway
 * (exchange/challenge.ts). Nothing in a room changes anyone's knowledge state.
 *
 * The guided session (conductor, peer teaching, transfer questions, shared gap and shared-source
 * scenes, and the post-exchange "apply it yourself" check) was removed on 2026-09-27 at the product
 * owner's request. Stored rooms may still carry its fields and scenes; they parse, and a room left in
 * one of those scenes is shown as the overview.
 *
 * Rooms are stored (doc store "rooms") and every mutation runs under a per-room
 * lock, then commits: save first, broadcast after. A restart keeps every room,
 * its event order and its participants; the Map below is a cache.
 */
import type { LearningScene, MindSnapshot, PlaygroundRoom, RoomEvent, RoomEventType, RoomParticipant } from "../contracts.ts";
import { CONCEPT_LABELS } from "../contracts.ts";
import { collaborativeDelta } from "../engine/collaborative.ts";
import { knowledgeLevel } from "../engine/knowledgeState.ts";
import { logEvent } from "../log.ts";
import { NADANI_ID } from "../seed/personas.ts";
import { BadRequestError, ForbiddenError, NotFoundError, type ThinkethService } from "../service.ts";
import type { DocStore } from "../store/docStore.ts";
import type { AgentTakeaway } from "../contracts.ts";
import type { IntelligenceModel } from "../adapters/types.ts";
import { DeterministicModel } from "../adapters/model/deterministic.ts";
import { AgentExchangeEngine, type ExchangeLimits, type RoomEventOut } from "./exchange/engine.ts";
import type { ExchangeModel } from "./exchange/muse.ts";
import { TakeawayChallengeEngine, type ChallengeLimits } from "./exchange/challenge.ts";
import type { ChallengerModel } from "./exchange/grok.ts";
import { newId } from "../util.ts";
import type { RoomRealtime } from "./realtime.ts";

export { ForbiddenError };

const MAX_ROOMS = 200;
const MAX_EVENTS = 200;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** Compact graph labels: the shared presentation layer (packages/contracts/src/presentation.ts). */
export const SHORT_LABELS: Record<string, string> = Object.fromEntries(Object.entries(CONCEPT_LABELS).map(([id, l]) => [id, l.graph]));

const SNAPSHOT_EXCLUDES = ["Ask history", "Saved memories and preferences", "Which misconception (only that one exists)", "Sources you've read"];

type Room = Omit<PlaygroundRoom, "conductor" | "realtime">;

/** Scenes of the removed guided session. A stored room still in one of them is shown as the overview. */
const LEGACY_SCENES = new Set<LearningScene>(["peer_teaching", "transfer", "knowledge_moved", "shared_gap", "resource"]);

export class PlaygroundService {
  /** Cache of stored rooms. */
  private readonly rooms = new Map<string, Room>();
  private readonly locks = new Map<string, Promise<unknown>>();
  /** Mutations queued or running per room: a poll during one reads the last commit instead of waiting behind it. */
  private readonly busy = new Map<string, number>();
  /** The last committed state of each room this process wrote (JSON, so in-flight edits never leak into it). */
  private readonly committed = new Map<string, string>();
  /** Events emitted inside the current mutation, broadcast only after the room is saved. */
  private readonly unpublished = new Map<string, RoomEvent[]>();
  private readonly svc: ThinkethService;
  private readonly realtime: RoomRealtime;
  private readonly store: DocStore;
  private readonly now: () => Date;
  /** Where clients subscribe (public anon key only; never the service key). */
  private readonly subscribe: { url: string; key: string } | undefined;

  constructor(
    svc: ThinkethService,
    realtime: RoomRealtime,
    store: DocStore,
    now: () => Date = () => new Date(),
    subscribe?: { url: string; key: string },
    exchange?: { model: ExchangeModel | undefined; grader: { live: IntelligenceModel | undefined; fallback: DeterministicModel }; limits: ExchangeLimits },
    challenge?: { grok: ChallengerModel | undefined; limits: ChallengeLimits },
  ) {
    this.svc = svc;
    this.realtime = realtime;
    this.store = store;
    this.now = now;
    this.subscribe = subscribe;
    this.exchange = new AgentExchangeEngine({
      svc,
      store,
      model: exchange?.model,
      grader: exchange?.grader ?? { live: undefined, fallback: new DeterministicModel({ diagrams: {}, visualizations: {}, memoryAids: {} }) },
      limits: exchange?.limits ?? { maxMessages: 6, maxToolCalls: 12, deadlineMs: 300_000, callTimeoutMs: 25_000 },
      host: this,
      now,
    });
    this.challenge = new TakeawayChallengeEngine({
      svc,
      store,
      grok: challenge?.grok,
      defender: () => this.exchange.agentModel,
      grader: exchange?.grader ?? { live: undefined, fallback: new DeterministicModel({ diagrams: {}, visualizations: {}, memoryAids: {} }) },
      limits: challenge?.limits ?? { deadlineMs: 240_000, callTimeoutMs: 45_000, maxToolCalls: 18 },
      host: this,
      now,
    });
  }

  /** Grokbot: an optional visiting challenger for a saved takeaway (absent unless xAI is configured). */
  readonly challenge: TakeawayChallengeEngine;

  async startChallenge(roomId: string, userId: string): Promise<PlaygroundRoom> {
    await this.challenge.start(roomId, userId);
    return this.get(roomId, userId);
  }

  async advanceChallenge(roomId: string, userId: string, step: number): Promise<PlaygroundRoom> {
    await this.challenge.advance(roomId, userId, step);
    return this.get(roomId, userId);
  }

  async stopChallenge(roomId: string, userId: string): Promise<PlaygroundRoom> {
    await this.challenge.stop(roomId, userId);
    return this.get(roomId, userId);
  }

  /** The agent exchange (Muse agents in separate contexts). */
  readonly exchange: AgentExchangeEngine;

  /** ExchangeHost: run `fn` on the stored room under its lock; commit (save, then broadcast) if it changed. */
  withRoom<T>(roomId: string, fn: (room: Room, emit: (e: RoomEventOut) => void) => Promise<T> | T): Promise<T> {
    return this.locked(roomId, async () => {
      const room = await this.load(roomId);
      if (!room) throw new NotFoundError("Playground not found.");
      const before = JSON.stringify(room);
      try {
        return await fn(room, (e) => this.emit(room, e.type, e.actor, e.summary, e.data));
      } finally {
        if (this.unpublished.has(room.id) || JSON.stringify(room) !== before) await this.commit(room);
      }
    });
  }

  // -------------------------------------------------------------------------
  // Agent exchange: start / advance / stop / close

  async startExchange(roomId: string, userId: string, conceptId?: string): Promise<PlaygroundRoom> {
    await this.withRoom(roomId, (room) => {
      if (room.challenge?.status === "running") throw new BadRequestError("Grokbot is still examining the last takeaway.");
    });
    await this.exchange.start(roomId, userId, conceptId);
    return this.get(roomId, userId);
  }

  async advanceExchange(roomId: string, userId: string, step: number): Promise<PlaygroundRoom> {
    await this.exchange.advance(roomId, userId, step);
    return this.get(roomId, userId);
  }

  async stopExchange(roomId: string, userId: string): Promise<PlaygroundRoom> {
    await this.exchange.stop(roomId, userId);
    return this.get(roomId, userId);
  }

  /** Back to the room overview once an exchange has ended. */
  async closeExchange(roomId: string, userId: string): Promise<PlaygroundRoom> {
    return this.mutate(roomId, userId, (room) => {
      if (room.exchange?.status === "running") throw new BadRequestError("Stop the exchange first.");
      if (room.challenge?.status === "running") throw new BadRequestError("Stop the challenge first.");
      if (room.scene === "agent_exchange" || LEGACY_SCENES.has(room.scene)) room.scene = "overview";
    });
  }

  /** Takeaways this person's agent retained (their own library only). */
  async takeaways(userId: string, conceptId?: string): Promise<AgentTakeaway[]> {
    const all = await this.store.list<AgentTakeaway>("agent_takeaways", { ownerId: userId }, 200);
    return all.filter((t) => !conceptId || t.conceptId === conceptId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async takeaway(userId: string, id: string): Promise<AgentTakeaway> {
    const t = await this.store.get<AgentTakeaway>("agent_takeaways", id);
    if (!t || t.ownerId !== userId) throw new NotFoundError("Takeaway not found.");
    return t;
  }

  // -------------------------------------------------------------------------
  // Storage, locking and commit

  private async load(roomId: string): Promise<Room | undefined> {
    const cached = this.rooms.get(roomId);
    if (cached) return cached;
    const stored = await this.store.get<Room>("rooms", roomId);
    if (stored) this.cache(stored);
    return stored;
  }

  private cache(room: Room): void {
    this.rooms.set(room.id, room);
    if (this.rooms.size > MAX_ROOMS) {
      const oldest = [...this.rooms.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      if (oldest && oldest.id !== room.id) {
        this.rooms.delete(oldest.id);
        this.committed.delete(oldest.id);
      }
    }
  }

  /** One mutation at a time per room, so event order, seq and "already answered" checks hold under concurrency. */
  private locked<T>(roomId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(roomId) ?? Promise.resolve();
    this.busy.set(roomId, (this.busy.get(roomId) ?? 0) + 1);
    const next = prev.then(fn, fn).finally(() => {
      const n = (this.busy.get(roomId) ?? 1) - 1;
      if (n > 0) this.busy.set(roomId, n);
      else this.busy.delete(roomId);
    });
    this.locks.set(roomId, next.catch(() => undefined));
    return next;
  }

  /** Save, then broadcast what this mutation emitted (clients refetch; the stored room must already be there). */
  private async commit(room: Room): Promise<void> {
    await this.store.put("rooms", room.id, room);
    this.committed.set(room.id, JSON.stringify(room));
    const events = this.unpublished.get(room.id) ?? [];
    this.unpublished.delete(room.id);
    for (const e of events) this.realtime.publish(this.channel(room), { seq: e.seq, type: e.type });
  }

  /** Run a mutation on a participant's room under the room lock, then commit it. */
  private mutate(roomId: string, userId: string, fn: (room: Room) => Promise<void> | void): Promise<PlaygroundRoom> {
    return this.locked(roomId, async () => {
      const room = await this.forParticipant(roomId, userId);
      const before = JSON.stringify(room);
      try {
        await fn(room);
      } finally {
        // Save only real changes (polling is frequent). What happened before a failure is still history.
        if (this.unpublished.has(room.id) || JSON.stringify(room) !== before) await this.commit(room);
      }
      return this.view(room);
    });
  }

  // -------------------------------------------------------------------------
  // Lifecycle

  async create(userId: string, displayName: string): Promise<PlaygroundRoom> {
    const room: Room = {
      id: newId("room"),
      code: "",
      createdAt: this.now().toISOString(),
      hostId: userId,
      participants: [this.participant(userId, displayName, "host", false)],
      scene: "waiting",
      spotlight: null,
      snapshots: [],
      seq: 0,
      events: [],
    };
    room.code = await this.newCode();
    this.cache(room);
    this.emit(room, "room_created", userId, `${displayName} opened a Playground.`);
    await this.commit(room);
    return this.view(room);
  }

  async join(userId: string, code: string, displayName: string): Promise<PlaygroundRoom> {
    const found = await this.byCode(code.toUpperCase());
    if (!found) throw new NotFoundError("No Playground with that code.");
    return this.locked(found.id, async () => {
      const room = (await this.load(found.id))!;
      if (!room.participants.some((p) => p.userId === userId)) {
        if (room.participants.length >= 2) throw new BadRequestError("This Playground already has two Minds.");
        room.participants.push(this.participant(userId, displayName, "guest", false));
        await this.onArrival(room, userId);
        await this.commit(room);
      }
      return this.view(room);
    });
  }

  /** One-device demo: the seeded persona joins, and the host's device acts for her. */
  async addDemoGuest(roomId: string, userId: string): Promise<PlaygroundRoom> {
    return this.mutate(roomId, userId, async (room) => {
      if (room.hostId !== userId) throw new ForbiddenError("Only the host can do that.");
      if (room.participants.some((p) => p.userId === NADANI_ID)) return;
      if (room.participants.length >= 2) throw new BadRequestError("This Playground already has two Minds.");
      room.participants.push(this.participant(NADANI_ID, this.svc.profileFor(NADANI_ID).displayName, "guest", true));
      await this.onArrival(room, NADANI_ID);
    });
  }

  async get(roomId: string, userId: string): Promise<PlaygroundRoom> {
    // A mutation holds the lock across Claude calls and page reads; polls shouldn't queue behind it
    // (the client times out at 8 s). Serve the room as it stands; the mutation's broadcast triggers a refetch.
    const snapshot = this.busy.has(roomId) ? this.committed.get(roomId) : undefined;
    if (snapshot) {
      const room = JSON.parse(snapshot) as Room;
      if (!room.participants.some((p) => p.userId === userId)) throw new NotFoundError("Playground not found.");
      return this.view(room);
    }
    return this.mutate(roomId, userId, async (room) => {
      await this.exchange.reconcile(room);
      await this.challenge.reconcile(room);
      // A room left mid guided session (removed 2026-09-27) lands on the overview, where the exchange starts.
      if (LEGACY_SCENES.has(room.scene)) room.scene = room.delta ? "overview" : "arrival";
    });
  }

  async leave(roomId: string, userId: string): Promise<PlaygroundRoom> {
    return this.mutate(roomId, userId, (room) => {
      this.emit(room, "participant_left", userId, `${this.name(room, userId)} left.`);
      room.scene = "ended";
    });
  }

  /**
   * The one sharing choice beyond the knowledge snapshot: whether this person's agent may use the
   * titles, links and summaries of sources they saved on the topic being taught. Off by default.
   */
  async share(roomId: string, userId: string, shares: { savedSources: boolean }, asUserId?: string): Promise<PlaygroundRoom> {
    return this.mutate(roomId, userId, async (room) => {
      const actor = this.actingAs(room, userId, asUserId);
      const p = room.participants.find((x) => x.userId === actor)!;
      if (!!p.shares?.savedSources === shares.savedSources) return;
      p.shares = { savedSources: shares.savedSources };
      this.emit(room, "sharing_changed", actor, shares.savedSources ? `${p.displayName} let their agent use sources they saved on this topic.` : `${p.displayName} stopped sharing saved sources.`, {
        savedSources: shares.savedSources,
      });
    });
  }

  // -------------------------------------------------------------------------
  // Compare: permissioned snapshots -> deterministic collaborative delta

  async compare(roomId: string, userId: string): Promise<PlaygroundRoom> {
    return this.mutate(roomId, userId, (room) => this.compareIn(room, roomId));
  }

  private async compareIn(room: Room, roomId: string): Promise<void> {
    if (room.participants.length < 2) throw new BadRequestError("Invite someone first.");
    // Thinketh computes the comparison from evidence; the agents' exchange starts from it.
    this.emit(room, "compare_started", "thinketh", "Thinketh is comparing the evidence in both Minds.");
    room.snapshots = await Promise.all(room.participants.map((p) => this.snapshot(p, room)));
    const [a, b] = room.snapshots as [MindSnapshot, MindSnapshot];
    const importance = Object.fromEntries(this.svc.conceptList().map((c) => [c.id, c.importance]));
    room.delta = collaborativeDelta(a, b, importance);
    room.scene = "overview";
    const d = room.delta;
    const n = d.aTeachesB.length + d.bTeachesA.length + d.sharedGaps.length;
    this.emit(room, "delta_ready", "thinketh", `Thinketh found ${n} useful ${n === 1 ? "difference" : "differences"} in your evidence.`, {
      aTeachesB: d.aTeachesB.length,
      bTeachesA: d.bTeachesA.length,
      sharedGaps: d.sharedGaps.length,
      conflicts: d.conflicts.length,
    });
    logEvent("playground.delta", { roomId, a: a.userId, b: b.userId, aTeachesB: d.aTeachesB.map((i) => i.conceptId), bTeachesA: d.bTeachesA.map((i) => i.conceptId), sharedGaps: d.sharedGaps.map((i) => i.conceptId), conflicts: d.conflicts.map((i) => i.conceptId) });
  }

  /** Concepts both Minds hold (a demo persona's seeded graph may be smaller than a live account's). */
  private sharedConceptIds(room: Room): Set<string> {
    const sets = room.participants.map((p) => new Set(this.svc.conceptsFor(p.userId).map((c) => c.id)));
    return new Set([...(sets[0] ?? [])].filter((id) => sets.every((s) => s.has(id))));
  }

  private async snapshot(p: RoomParticipant, room: Room): Promise<MindSnapshot> {
    await this.svc.prepareUser(p.userId);
    const shared = this.sharedConceptIds(room);
    const [states, verified] = await Promise.all([this.svc.statesFor(p.userId), this.svc.verifiedConceptIds(p.userId)]);
    const concepts = this.svc.conceptList().filter((c) => shared.has(c.id)).flatMap((c) => {
      const s = states.get(c.id);
      if (!s) return [];
      const r2 = (v: number) => Math.round(v * 100) / 100;
      return [
        {
          conceptId: c.id,
          name: c.name,
          short: SHORT_LABELS[c.id] ?? c.name,
          importance: c.importance,
          level: knowledgeLevel(s),
          mastery: r2(s.mastery),
          uncertainty: r2(s.uncertainty),
          evidenceCount: s.evidenceCount,
          verified: verified.has(c.id),
          hasMisconception: s.misconceptionFlags.length > 0,
          lastObservedAt: s.lastObservedAt,
        },
      ];
    });
    return { userId: p.userId, displayName: p.displayName, takenAt: this.now().toISOString(), concepts, edges: this.svc.conceptEdges(), excludes: SNAPSHOT_EXCLUDES };
  }

  // -------------------------------------------------------------------------
  // Helpers

  /** Joining is the consent: both Minds' knowledge-state snapshots become visible to the room. */
  private async onArrival(room: Room, userId: string): Promise<void> {
    room.snapshots = await Promise.all(room.participants.map((p) => this.snapshot(p, room)));
    room.scene = "arrival";
    this.emit(room, "participant_joined", userId, `${this.name(room, userId)} joined`);
  }

  private participant(userId: string, displayName: string, role: "host" | "guest", demoPersona: boolean): RoomParticipant {
    return { userId, displayName: displayName.trim().slice(0, 40), role, joinedAt: this.now().toISOString(), demoPersona };
  }

  /** Only participants can see or change a room; to anyone else it doesn't exist. */
  private async forParticipant(roomId: string, userId: string): Promise<Room> {
    const room = await this.load(roomId);
    if (!room || !room.participants.some((p) => p.userId === userId)) throw new NotFoundError("Playground not found.");
    return room;
  }

  private async byCode(code: string): Promise<Room | undefined> {
    const cached = [...this.rooms.values()].find((r) => r.code === code);
    if (cached) return cached;
    const [stored] = await this.store.list<Room>("rooms", { where: { code } }, 1);
    if (stored) this.cache(stored);
    return stored;
  }

  /** The host's device may act for a seeded demo persona in its own room, and nobody else. */
  private actingAs(room: Room, userId: string, asUserId?: string): string {
    if (!asUserId || asUserId === userId) return userId;
    const target = room.participants.find((p) => p.userId === asUserId);
    if (room.hostId !== userId || !target?.demoPersona) throw new ForbiddenError("You can only act for yourself.");
    return asUserId;
  }

  private name(room: Room, userId: string): string {
    return room.participants.find((p) => p.userId === userId)?.displayName ?? "Someone";
  }

  private emit(room: Room, type: RoomEventType, actor: string, summary: string, data?: RoomEvent["data"]): void {
    room.seq += 1;
    const event: RoomEvent = { id: newId("evt"), seq: room.seq, at: this.now().toISOString(), type, actor, summary, ...(data ? { data } : {}) };
    room.events.push(event);
    if (room.events.length > MAX_EVENTS) room.events.splice(0, room.events.length - MAX_EVENTS);
    const pending = this.unpublished.get(room.id) ?? [];
    pending.push(event);
    this.unpublished.set(room.id, pending);
  }

  private channel(room: Room): string {
    return `playground:${room.id}`;
  }

  private async newCode(): Promise<string> {
    for (;;) {
      let code = "";
      for (let i = 0; i < 6; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      if (!(await this.byCode(code))) return code;
    }
  }

  private view(room: Room): PlaygroundRoom {
    return {
      ...structuredClone(room),
      exchangeAvailability: this.exchange.availability(room),
      ...(this.challenge.configured ? { challengeAvailability: this.challenge.availability(room) } : {}),
      realtime: {
        channel: this.channel(room),
        mode: this.realtime.mode,
        ...(this.realtime.mode === "broadcast" && this.subscribe ? { url: this.subscribe.url, key: this.subscribe.key } : {}),
      },
    };
  }
}
