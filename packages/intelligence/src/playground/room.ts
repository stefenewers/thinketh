/**
 * Playground rooms. The server is the source of truth: every scene change,
 * explanation and answer lands here first, then a semantic event is
 * broadcast. Knowledge state changes only through `answerDiagnostic` (the
 * same evidence path as every diagnostic); the conductor only changes what
 * the room is looking at, and an agent-prepared lesson changes nothing.
 *
 * Rooms are stored (doc store "rooms") and every mutation runs under a per-room
 * lock, then commits: save first, broadcast after. A restart keeps every room,
 * its event order and its participants; the Map below is a cache.
 */
import type {
  MindSnapshot,
  MuseAction,
  PlaygroundRoom,
  RoomEvent,
  RoomEventType,
  RoomParticipant,
} from "../contracts.ts";
import { CONCEPT_LABELS, narrativeLabel, topicLabel } from "../contracts.ts";
import { collaborativeDelta } from "../engine/collaborative.ts";
import { knowledgeLevel } from "../engine/knowledgeState.ts";
import { logEvent } from "../log.ts";
import { nextPlanItem, planSession } from "../engine/sessionPlan.ts";
import { NADANI_ID, PEER_PROMPTS } from "../seed/personas.ts";
import { BadRequestError, ForbiddenError, NotFoundError, type ThinkethService } from "../service.ts";
import type { DocStore } from "../store/docStore.ts";
import { runInBackground } from "../adapters/guard.ts";
import { newId } from "../util.ts";
import { validateAction, type Conductor, type ConductorView } from "./conductor.ts";
import type { RoomRealtime } from "./realtime.ts";

export { ForbiddenError };

const MAX_ROOMS = 200;
const MAX_EVENTS = 200;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/**
 * The known-safe shared source. Chosen by scripts/resource-asymmetry.mjs, which reads every
 * safe seeded source through the live pipeline against both demo Minds: this page gives the
 * clearest REAL difference (measured twice, 2026-09-26: Stefen ~3 min, focus agent memory;
 * Nadani ~5 min, focus agent tool use). The previous default ("Building effective agents")
 * gave both ~5-6 min and 5 ideas. Values are always computed, never set.
 */
export const DEFAULT_ROOM_RESOURCE = "https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview";

/** Compact graph labels: the shared presentation layer (packages/contracts/src/presentation.ts). */
export const SHORT_LABELS: Record<string, string> = Object.fromEntries(Object.entries(CONCEPT_LABELS).map(([id, l]) => [id, l.graph]));

const SNAPSHOT_EXCLUDES = ["Ask history", "Saved memories and preferences", "Which misconception (only that one exists)", "Sources you've read"];

type Room = Omit<PlaygroundRoom, "conductor" | "realtime">;

/** "Evaluator Architectures" -> "evaluator architectures", keeping acronyms ("MCP"). */
const lowerName = (s: string) => s.split(" ").map((w) => (/^[A-Z0-9]{2,}/.test(w) ? w : w.toLowerCase())).join(" ");

const SOURCE_LABEL: Record<string, string> = {
  primary: "Technical article",
  documentation: "Documentation",
  research: "Research",
  preprint: "Preprint",
  repository: "Repository",
  reporting: "Reporting",
  article: "Article",
  video: "Video",
  document: "Document",
};

export class PlaygroundService {
  /** Cache of stored rooms. */
  private readonly rooms = new Map<string, Room>();
  private readonly locks = new Map<string, Promise<unknown>>();
  /** Events emitted inside the current mutation, broadcast only after the room is saved. */
  private readonly unpublished = new Map<string, RoomEvent[]>();
  private readonly svc: ThinkethService;
  private readonly conductor: Conductor;
  private readonly realtime: RoomRealtime;
  private readonly store: DocStore;
  private readonly now: () => Date;
  /** Where clients subscribe (public anon key only; never the service key). */
  private readonly subscribe: { url: string; key: string } | undefined;

  constructor(
    svc: ThinkethService,
    conductor: Conductor,
    realtime: RoomRealtime,
    store: DocStore,
    now: () => Date = () => new Date(),
    subscribe?: { url: string; key: string },
  ) {
    this.svc = svc;
    this.conductor = conductor;
    this.realtime = realtime;
    this.store = store;
    this.now = now;
    this.subscribe = subscribe;
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
      if (oldest && oldest.id !== room.id) this.rooms.delete(oldest.id);
    }
  }

  /** One mutation at a time per room, so event order, seq and "already answered" checks hold under concurrency. */
  private locked<T>(roomId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(roomId) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.locks.set(roomId, next.catch(() => undefined));
    return next;
  }

  /** Save, then broadcast what this mutation emitted (clients refetch; the stored room must already be there). */
  private async commit(room: Room): Promise<void> {
    await this.store.put("rooms", room.id, room);
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
    return this.mutate(roomId, userId, async (room) => {
      await this.refreshResource(room);
      await this.markDelivered(room, userId);
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
      // The teacher widened (or narrowed) what their agent may use: prepare again if nothing's been said yet.
      if (room.teaching && room.teaching.teacherId === actor && !room.teaching.explanation) this.startPreparing(room);
    });
  }

  // -------------------------------------------------------------------------
  // Compare: permissioned snapshots -> deterministic collaborative delta

  async compare(roomId: string, userId: string): Promise<PlaygroundRoom> {
    return this.mutate(roomId, userId, (room) => this.compareIn(room, roomId));
  }

  private async compareIn(room: Room, roomId: string): Promise<void> {
    if (room.participants.length < 2) throw new BadRequestError("Invite someone first.");
    // Thinketh computes the comparison from evidence; Muse only conducts what follows.
    this.emit(room, "compare_started", "thinketh", "Thinketh is comparing the evidence in both Minds.");
    room.snapshots = await Promise.all(room.participants.map((p) => this.snapshot(p, room)));
    const [a, b] = room.snapshots as [MindSnapshot, MindSnapshot];
    const importance = Object.fromEntries(this.svc.conceptList().map((c) => [c.id, c.importance]));
    room.delta = collaborativeDelta(a, b, importance);
    // Thinketh plans the session from the delta: the most valuable valid moves that fit 7 minutes.
    room.plan = planSession({
      delta: room.delta,
      names: Object.fromEntries(room.participants.map((p) => [p.userId, p.displayName])),
      assessable: (conceptId) => this.svc.isTransferAssessable(conceptId),
    });
    room.completedTeachings = [];
    room.scene = "overview";
    const d = room.delta;
    const n = d.aTeachesB.length + d.bTeachesA.length + d.sharedGaps.length;
    this.emit(room, "delta_ready", "thinketh", `Thinketh found ${n} useful ${n === 1 ? "difference" : "differences"} in your evidence.`, {
      aTeachesB: d.aTeachesB.length,
      bTeachesA: d.bTeachesA.length,
      sharedGaps: d.sharedGaps.length,
      conflicts: d.conflicts.length,
    });
    logEvent("playground.plan", { roomId, estimatedMinutes: room.plan.estimatedMinutes, items: room.plan.items.map((i) => i.id) });
    logEvent("playground.delta", { roomId, a: a.userId, b: b.userId, aTeachesB: d.aTeachesB.map((i) => i.conceptId), bTeachesA: d.bTeachesA.map((i) => i.conceptId), sharedGaps: d.sharedGaps.map((i) => i.conceptId), conflicts: d.conflicts.map((i) => i.conceptId) });
  }

  /** Seeded (illustrative) sources ground a room only when everyone in it is a seeded demo persona. */
  private corpusScope(room: Room): "demo" | "live" {
    return room.participants.every((p) => this.svc.isDemoIdentity(p.userId)) ? "demo" : "live";
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
  // Conducting

  async conduct(roomId: string, userId: string, intent?: ConductorView["intent"]): Promise<PlaygroundRoom> {
    return this.mutate(roomId, userId, (room) => this.conductIn(room, intent));
  }

  private async conductIn(room: Room, intent?: ConductorView["intent"]): Promise<void> {
    if (!room.delta) throw new BadRequestError("Compare both Minds first.");
    const view = this.conductorView(room, intent);
    const action = await this.conductor.next(view);
    // Validated here too: whatever the source, nothing unchecked reaches the room.
    const problem = validateAction(action, view);
    if (problem) throw new BadRequestError(`Conductor proposed an invalid action: ${problem}`);
    await this.apply(room, action);
  }

  private conductorView(room: Room, intent?: ConductorView["intent"]): ConductorView {
    const d = room.delta!;
    const answered = room.transfer?.correctness !== undefined;
    return {
      scene: room.scene,
      participants: room.participants.map((p) => ({ id: p.userId, name: p.displayName })),
      teachable: [...d.aTeachesB, ...d.bTeachesA]
        .sort((x, y) => y.score - x.score)
        .map((t) => ({ conceptId: t.conceptId, conceptName: t.conceptName, topic: this.topic(t.conceptId), teacherId: t.teacherId!, learnerId: t.learnerId!, assessmentAvailable: this.svc.isTransferAssessable(t.conceptId) })),
      sharedGaps: d.sharedGaps.map((g) => ({ conceptId: g.conceptId, conceptName: g.conceptName, topic: this.topic(g.conceptId) })),
      plan: (room.plan?.items ?? []).map((i) => ({
        id: i.id,
        type: i.type,
        ...(i.conceptId ? { conceptId: i.conceptId } : {}),
        ...(i.conceptName ? { conceptName: i.conceptName } : {}),
        ...(i.conceptId ? { topic: this.topic(i.conceptId) } : {}),
        ...(i.teacherId ? { teacherId: i.teacherId } : {}),
        ...(i.learnerId ? { learnerId: i.learnerId } : {}),
        done: i.done,
      })),
      next: nextPlanItem(room.plan)?.id ?? null,
      // The CURRENT peer teaching; once its transfer is answered, the next one can start.
      progress: {
        teacherAssigned: !!room.teaching && !answered,
        explanationSubmitted: !!room.teaching?.explanation && !answered,
        transferAsked: !!room.transfer && !answered,
        transferAnswered: answered,
        sharedGapTaught: !!room.sharedGap,
        resourceIntroduced: !!room.resource,
      },
      ...(intent ? { intent } : {}),
    };
  }

  private async apply(room: Room, a: MuseAction): Promise<void> {
    const say = typeof a.args.say === "string" ? a.args.say : undefined;
    if (say) room.museLine = say;
    const s = (k: string) => a.args[k] as string;
    switch (a.tool) {
      case "get_room_state":
        return;
      case "spotlight_scene":
        room.spotlight = { conceptId: s("conceptId"), ...(a.args.participantId ? { participantId: s("participantId") } : {}) };
        this.emit(room, "spotlight", "muse", say ?? "Look here.", { conceptId: s("conceptId"), by: a.by });
        return;
      case "assign_peer_teacher": {
        const concept = this.svc.conceptList().find((c) => c.id === s("conceptId"))!;
        if (room.teaching && room.transfer?.correctness !== undefined) {
          (room.completedTeachings ??= []).push({
            conceptId: room.teaching.conceptId,
            conceptName: room.teaching.conceptName,
            teacherId: room.teaching.teacherId,
            learnerId: room.teaching.learnerId,
            verified: !!room.transfer.verified,
          });
        }
        delete room.transfer;
        room.teaching = {
          conceptId: concept.id,
          conceptName: concept.name,
          teacherId: s("teacherId"),
          learnerId: s("learnerId"),
          prompt: PEER_PROMPTS[concept.id] ?? `What matters most about ${this.topic(concept.id)}?`,
        };
        room.scene = "peer_teaching";
        room.spotlight = { conceptId: concept.id, participantId: s("teacherId") };
        this.emit(room, "teacher_assigned", "muse", `${this.name(room, s("teacherId"))} → ${this.name(room, s("learnerId"))}: ${narrativeLabel(concept.id, concept.name)}`, {
          conceptId: concept.id,
          teacherId: s("teacherId"),
          learnerId: s("learnerId"),
          by: a.by,
        });
        // Thinketh found the opportunity; now the teacher's agent prepares for it (in the background).
        this.startPreparing(room);
        return;
      }
      case "request_explanation":
        room.scene = "peer_teaching";
        return;
      case "ask_transfer_question": {
        const t = room.teaching!;
        // Seeded, generated or grounded fallback; stored server-side. The prompt shown here is the
        // stored item's prompt, and grading reads that same item by id: no regeneration in between.
        const ch = await this.svc.transferChallenge(t.conceptId, t.explanation);
        room.transfer = {
          conceptId: t.conceptId,
          learnerId: t.learnerId,
          questionId: ch.item.id,
          prompt: ch.item.prompt,
          source: ch.source,
          ...(ch.applicationContext ? { applicationContext: ch.applicationContext } : {}),
          rationale: ch.item.rationale,
        };
        room.scene = "transfer";
        room.spotlight = { conceptId: t.conceptId, participantId: t.learnerId };
        // The explanation is now in front of the learner (their device shows it with the question).
        this.emit(room, "transfer_question", "muse", say ?? "Apply it somewhere new.", { conceptId: t.conceptId, learnerId: t.learnerId, by: a.by });
        return;
      }
      case "teach_shared_gap": {
        const concept = this.svc.conceptList().find((c) => c.id === s("conceptId"))!;
        const lesson = this.svc.conceptLesson(concept.id, this.corpusScope(room));
        room.sharedGap = { conceptId: concept.id, conceptName: concept.name, lesson: lesson.sections };
        this.markDone(room, (i) => i.type === "shared_gap");
        room.scene = "shared_gap";
        room.spotlight = { conceptId: concept.id };
        this.emit(room, "shared_gap_taught", "muse", say ?? `Shared gap: ${narrativeLabel(concept.id, concept.name)}`, { conceptId: concept.id, by: a.by, resourceTitle: lesson.resourceTitle ?? null });
        return;
      }
      case "introduce_resource":
        await this.introduceResource(room, DEFAULT_ROOM_RESOURCE, a.by);
        return;
      case "advance_scene":
        room.scene = "overview";
        room.spotlight = null;
        this.emit(room, "scene_advanced", "muse", say ?? "Back to the overview.", { scene: "overview", by: a.by });
        return;
      case "end_session":
        room.scene = "ended";
        this.emit(room, "session_ended", "muse", say ?? "Session ended.", { by: a.by });
        return;
    }
  }

  // -------------------------------------------------------------------------
  // Peer teaching -> transfer -> real evidence

  /**
   * The teacher's explanation: their own words (default), their agent's prepared draft as-is ("agent"),
   * or that draft edited ("agent_edited"). The source is recorded and shown, so agent material is never
   * presented as something the person said.
   */
  explain(roomId: string, userId: string, text: string, asUserId?: string, source: "own" | "agent" | "agent_edited" = "own"): Promise<PlaygroundRoom> {
    return this.mutate(roomId, userId, async (room) => {
      const t = room.teaching;
      if (!t) throw new BadRequestError("Nobody has been asked to teach yet.");
      if (t.explanation) throw new BadRequestError("The explanation is already in.");
      const actor = this.actingAs(room, userId, asUserId);
      if (actor !== t.teacherId) throw new ForbiddenError("Only the assigned teacher can explain.");
      const clean = text.trim();
      let from = source;
      if (from !== "own") {
        if (t.prepared?.status !== "prepared" || !t.prepared.text) throw new BadRequestError("There's no agent-prepared explanation to use.");
        if (from === "agent" && clean !== t.prepared.text.trim()) from = "agent_edited";
      }
      t.explanation = clean;
      t.explanationSource = from;
      const who = this.name(room, actor);
      const summary =
        from === "own" ? `${who} explained ${this.topic(t.conceptId)}.` : from === "agent" ? `${who} shared the explanation their agent prepared.` : `${who} edited and shared their agent's explanation.`;
      this.emit(room, "explanation_submitted", actor, summary, { conceptId: t.conceptId, source: from });
      // The teacher explaining is not evidence of anything for the learner; the transfer question is.
      await this.conductIn(room);
    });
  }

  answer(roomId: string, userId: string, answer: string, asUserId?: string): Promise<PlaygroundRoom> {
    return this.mutate(roomId, userId, (room) => this.answerIn(room, userId, answer, asUserId));
  }

  private async answerIn(room: Room, userId: string, answer: string, asUserId?: string): Promise<void> {
    const tr = room.transfer;
    if (!tr) throw new BadRequestError("There's no transfer question yet.");
    if (tr.correctness !== undefined) throw new BadRequestError("That question has been answered.");
    const actor = this.actingAs(room, userId, asUserId);
    if (actor !== tr.learnerId) throw new ForbiddenError("Only the learner answers the transfer question.");
    if (!room.events.some((e) => e.type === "answer_submitted" && e.data?.questionId === tr.questionId)) {
      this.emit(room, "answer_submitted", actor, `${this.name(room, actor)} answered.`, { conceptId: tr.conceptId, questionId: tr.questionId });
    }

    // The same evidence path as every diagnostic: grade -> observe -> transition -> Tiger. The operation id is
    // stable per room and question, so a retry (or a replay after a restart) returns the recorded transition
    // instead of recording the evidence twice.
    const result = await this.svc.answerDiagnostic(actor, tr.questionId, answer, { operationId: `room:${room.id}:${tr.questionId}` });
    const verified = result.transition.observation.kind === "diagnostic_correct";
    tr.answer = answer;
    tr.correctness = result.answer.correctness;
    tr.feedback = result.answer.feedback;
    tr.verified = verified;
    tr.transition = result.transition;
    const taught = room.teaching;
    if (taught) this.markDone(room, (i) => i.type === "peer_teach" && i.conceptId === taught.conceptId && i.teacherId === taught.teacherId && i.learnerId === taught.learnerId);
    room.scene = "knowledge_moved";
    const teacher = room.teaching ? this.name(room, room.teaching.teacherId) : "Your peer";
    this.emit(
      room,
      verified ? "transfer_verified" : "transfer_not_verified",
      "thinketh",
      verified ? `Knowledge moved. ${teacher} explained it; ${this.name(room, actor)} applied it in a new context.` : "Not verified yet. Thinketh recorded what the answer showed.",
      { conceptId: tr.conceptId, correctness: tr.correctness, kind: result.transition.observation.kind, transitionId: result.transition.id },
    );
    // Refresh the learner's snapshot so both Minds show the real new state.
    const idx = room.snapshots.findIndex((s) => s.userId === actor);
    const p = room.participants.find((x) => x.userId === actor);
    if (idx >= 0 && p) room.snapshots[idx] = await this.snapshot(p, room);
  }

  // -------------------------------------------------------------------------
  // Agent-prepared lessons: found -> prepared -> delivered -> demonstrated

  /** Mark the current teaching as being prepared and let the teacher's agent draft it without holding the room. */
  private startPreparing(room: Room): void {
    const t = room.teaching;
    if (!t) return;
    t.prepared = { status: "preparing", agentOf: t.teacherId, preparedFor: t.learnerId, preparedAt: this.now().toISOString() };
    const key = { roomId: room.id, conceptId: t.conceptId, teacherId: t.teacherId, learnerId: t.learnerId };
    runInBackground("playground.prepare", this.prepare(key));
  }

  private async prepare(key: { roomId: string; conceptId: string; teacherId: string; learnerId: string }): Promise<void> {
    const snapshotRoom = await this.load(key.roomId);
    if (!snapshotRoom) return;
    const learnerSnap = snapshotRoom.snapshots.find((x) => x.userId === key.learnerId)?.concepts.find((c) => c.conceptId === key.conceptId);
    const teacher = snapshotRoom.participants.find((p) => p.userId === key.teacherId);
    const item = [...(snapshotRoom.delta?.aTeachesB ?? []), ...(snapshotRoom.delta?.bTeachesA ?? [])].find((i) => i.conceptId === key.conceptId && i.teacherId === key.teacherId);
    let lesson;
    try {
      lesson = await this.svc.prepareExchange({
        conceptId: key.conceptId,
        teacherId: key.teacherId,
        learnerId: key.learnerId,
        teacherName: this.name(snapshotRoom, key.teacherId),
        learnerName: this.name(snapshotRoom, key.learnerId),
        gap: { level: learnerSnap?.level ?? "weak", verified: !!learnerSnap?.verified, hasMisconception: !!learnerSnap?.hasMisconception },
        shareSavedSources: !!teacher?.shares?.savedSources,
        corpus: this.corpusScope(snapshotRoom),
        whyRelevant: item?.reason ?? `${this.name(snapshotRoom, key.teacherId)} has stronger evidence on ${this.topic(key.conceptId)}.`,
      });
    } catch (err) {
      logEvent("playground.prepare_failed", { roomId: key.roomId, error: err instanceof Error ? err.message : String(err) }, "warn");
      lesson = {
        status: "unavailable" as const,
        agentOf: key.teacherId,
        preparedFor: key.learnerId,
        preparedAt: this.now().toISOString(),
        message: `${this.name(snapshotRoom, key.teacherId)}'s agent couldn't prepare this right now, so it teaches from Thinketh's concept description instead.`,
      };
    }
    await this.locked(key.roomId, async () => {
      const room = await this.load(key.roomId);
      const t = room?.teaching;
      // The room moved on (another teaching, or the explanation is already in): don't overwrite it.
      if (!room || !t || t.conceptId !== key.conceptId || t.teacherId !== key.teacherId || t.learnerId !== key.learnerId || t.explanation) return;
      t.prepared = lesson;
      const who = this.name(room, key.teacherId);
      // The agents teach each other: the teacher's agent hands its explanation straight to the learner's agent.
      if (lesson.status === "prepared") {
        this.emit(room, "lesson_prepared", `agent:${key.teacherId}`, `${who}'s agent found sourced material and prepared an explanation for ${this.name(room, key.learnerId)}.`, {
          conceptId: key.conceptId,
          sources: lesson.sources?.length ?? 0,
          by: lesson.by ?? null,
        });
      } else {
        this.emit(room, "lesson_unavailable", `agent:${key.teacherId}`, lesson.message ?? `${who}'s agent couldn't prepare this.`, { conceptId: key.conceptId });
      }
      await this.agentTeach(room).catch((err) => logEvent("playground.agent_teach_failed", { roomId: room.id, error: err instanceof Error ? err.message : String(err) }, "warn"));
      await this.commit(room);
    });
  }

  /**
   * Agent-to-agent teaching. The teacher's agent explains to the learner's agent, which already adapted it
   * to the learner's gap (prepared.adaptedTo); nobody is asked to type. Then Thinketh asks the LEARNER the
   * transfer question: an exchange between agents is never evidence that a person learned anything, so
   * only the learner's own graded answer can change their Mind.
   */
  private async agentTeach(room: Room): Promise<void> {
    const t = room.teaching;
    if (!t || t.explanation) return;
    const concept = this.svc.conceptList().find((c) => c.id === t.conceptId);
    const p = t.prepared;
    // Nothing sourced to teach from: the agent falls back to Thinketh's own definition of the concept, and says so.
    t.explanation = p?.status === "prepared" && p.text ? p.text : `From Thinketh's concept description (no sourced material yet): ${concept?.description ?? this.topic(t.conceptId)}`;
    t.explanationSource = "agent";
    const teacher = this.name(room, t.teacherId);
    const learner = this.name(room, t.learnerId);
    this.emit(room, "explanation_submitted", `agent:${t.teacherId}`, `${teacher}'s agent taught ${learner}'s agent ${this.topic(t.conceptId)}.`, { conceptId: t.conceptId, source: "agent" });
    await this.conductIn(room);
  }

  /** The learner's device has fetched the room with the explanation in front of them: encountered, not yet understood. */
  private async markDelivered(room: Room, userId: string): Promise<void> {
    const t = room.teaching;
    if (!t?.explanation || t.deliveredAt || room.scene !== "transfer") return;
    const learner = room.participants.find((p) => p.userId === t.learnerId);
    if (userId !== t.learnerId && !(learner?.demoPersona && userId === room.hostId)) return;
    t.deliveredAt = this.now().toISOString();
  }

  // -------------------------------------------------------------------------
  // Shared resource: one source, one delta per Mind (existing resource pipeline)

  async resource(roomId: string, userId: string, url: string): Promise<PlaygroundRoom> {
    return this.mutate(roomId, userId, async (room) => {
      if (!room.delta) throw new BadRequestError("Compare both Minds first.");
      await this.introduceResource(room, url, "fallback", userId);
    });
  }

  private async introduceResource(room: Room, url: string, by: MuseAction["by"], actor = "muse"): Promise<void> {
    const sides = await Promise.all(
      room.participants.map(async (p) => {
        const r = await this.svc.addResource(p.userId, url);
        return { userId: p.userId, resourceId: r.id, status: r.status, stage: r.stage, newIdeas: r.newToYou.length };
      }),
    );
    const first = await this.svc.getResource(sides[0]!.userId, sides[0]!.resourceId);
    // Say why this source is here: the measured default (scripts/resource-asymmetry.mjs) or a person's own link.
    const chosenBecause =
      url === DEFAULT_ROOM_RESOURCE
        ? "Thinketh's default: in tests with these two Minds, it gave the clearest difference."
        : `${actor === "muse" ? "Muse" : this.name(room, actor)} chose this source.`;
    room.resource = { url: first.url, title: first.title, sides, chosenBecause };
    this.markDone(room, (i) => i.type === "resource");
    room.scene = "resource";
    room.spotlight = null;
    this.emit(room, "resource_introduced", actor, "One source, read against both Minds.", { by });
    await this.refreshResource(room);
  }

  private async refreshResource(room: Room): Promise<void> {
    const res = room.resource;
    if (!res) return;
    for (const side of res.sides) {
      let r;
      try {
        r = await this.svc.getResource(side.userId, side.resourceId);
      } catch {
        continue;
      }
      side.status = r.status;
      side.stage = r.stage;
      side.newIdeas = r.newToYou.length;
      if (r.estimatedUsefulMinutes !== undefined) side.usefulMinutes = r.estimatedUsefulMinutes;
      const focus = r.newToYou[0];
      const skip = r.alreadyUnderstood[0];
      if (focus) side.focus = focus.conceptId ? this.topic(focus.conceptId) : focus.idea;
      if (skip) side.skip = skip.conceptId ? this.topic(skip.conceptId) : skip.idea;
      res.title = r.title;
      if (r.publisher) res.publisher = r.publisher;
      if (r.estimatedReadMinutes !== undefined) res.readMinutes = r.estimatedReadMinutes;
      res.sourceLabel = [r.publisher, SOURCE_LABEL[r.sourceType]].filter(Boolean).join(" · ");
    }
    const done = res.sides.every((s) => s.status === "ready" || s.status === "learned" || s.status === "failed");
    if (done && !res.note) {
      res.note = this.resourceNote(room);
      room.museLine = res.note;
      this.emit(room, "resource_ready", "thinketh", "Both deltas are ready.", Object.fromEntries(res.sides.map((s) => [s.userId, s.newIdeas])));
    }
  }

  /** Deterministic from the two computed deltas: who should focus where, who can skip what. */
  private resourceNote(room: Room): string {
    const res = room.resource!;
    const parts = res.sides.map((s) => {
      const name = this.name(room, s.userId);
      if (s.status === "failed") return `${name}: I couldn't read it for you.`;
      if (s.newIdeas === 0) return `${name}: nothing new here for you, so skip it.`;
      if (s.focus) return `${name}: focus on ${s.focus}.`;
      return `${name}: ${s.newIdeas} new idea${s.newIdeas === 1 ? "" : "s"} for you.`;
    });
    const skipper = [...res.sides].sort((x, y) => x.newIdeas - y.newIdeas)[0];
    if (skipper?.skip && skipper.newIdeas > 0) {
      const i = res.sides.indexOf(skipper);
      parts[i] = `${parts[i]!.replace(/\.$/, "")}, and skip ${skipper.skip}.`;
    }
    if (room.sharedGap) parts.push(`I'll teach the shared gap separately.`);
    return parts.join(" ");
  }

  // -------------------------------------------------------------------------
  // Helpers

  private markDone(room: Room, match: (i: NonNullable<Room["plan"]>["items"][number]) => boolean): void {
    const item = room.plan?.items.find((i) => !i.done && match(i));
    if (item) item.done = true;
  }

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

  /** Plain-language wording for a concept inside a sentence (presentation only). */
  private topic(id: string): string {
    return topicLabel(id, lowerName(this.conceptName(id)));
  }

  private conceptName(id: string): string {
    return this.svc.conceptList().find((c) => c.id === id)?.name ?? id;
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
      conductor: { mode: this.conductor.mode, detail: this.conductor.detail },
      realtime: {
        channel: this.channel(room),
        mode: this.realtime.mode,
        ...(this.realtime.mode === "broadcast" && this.subscribe ? { url: this.subscribe.url, key: this.subscribe.key } : {}),
      },
    };
  }
}
