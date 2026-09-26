/**
 * Playground rooms. The server is the source of truth: every scene change,
 * explanation and answer lands here first, then a semantic event is
 * broadcast. Knowledge state changes only through `answerDiagnostic` (the
 * same evidence path as every diagnostic); the conductor only changes what
 * the room is looking at.
 */
import type {
  MindSnapshot,
  MuseAction,
  PlaygroundRoom,
  RoomEvent,
  RoomEventType,
  RoomParticipant,
} from "../contracts.ts";
import { collaborativeDelta } from "../engine/collaborative.ts";
import { knowledgeLevel } from "../engine/knowledgeState.ts";
import { logEvent } from "../log.ts";
import { NADANI_ID, PEER_PROMPTS, TRANSFER_QUESTION_FOR } from "../seed/personas.ts";
import { BadRequestError, NotFoundError, type ThinkethService } from "../service.ts";
import { newId } from "../util.ts";
import { validateAction, type Conductor, type ConductorView } from "./conductor.ts";
import type { RoomRealtime } from "./realtime.ts";

export class ForbiddenError extends Error {}

const MAX_ROOMS = 200;
const MAX_EVENTS = 200;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** The shared source Figma 1:376 shows. */
export const DEFAULT_ROOM_RESOURCE = "https://www.anthropic.com/engineering/building-effective-agents";

export const SHORT_LABELS: Record<string, string> = {
  "agent-memory": "Agent Memory",
  "long-running-agents": "Long-running",
  "agent-tool-use": "Tool Use",
  "evaluator-architectures": "Evaluators",
  "context-windows": "Context",
  "retrieval": "Retrieval",
  "mcp": "MCP",
  "memory-consolidation": "Consolidation",
  "context-compaction": "Compaction",
};

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
  private readonly rooms = new Map<string, Room>();
  private readonly svc: ThinkethService;
  private readonly conductor: Conductor;
  private readonly realtime: RoomRealtime;
  private readonly now: () => Date;
  /** Where clients subscribe (public anon key only; never the service key). */
  private readonly subscribe: { url: string; key: string } | undefined;

  constructor(svc: ThinkethService, conductor: Conductor, realtime: RoomRealtime, now: () => Date = () => new Date(), subscribe?: { url: string; key: string }) {
    this.svc = svc;
    this.conductor = conductor;
    this.realtime = realtime;
    this.now = now;
    this.subscribe = subscribe;
  }

  // -------------------------------------------------------------------------
  // Lifecycle

  create(userId: string, displayName: string): PlaygroundRoom {
    if (this.rooms.size >= MAX_ROOMS) {
      const oldest = [...this.rooms.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      if (oldest) this.rooms.delete(oldest.id);
    }
    const room: Room = {
      id: newId("room"),
      code: this.newCode(),
      createdAt: this.now().toISOString(),
      hostId: userId,
      participants: [this.participant(userId, displayName, "host", false)],
      scene: "waiting",
      spotlight: null,
      snapshots: [],
      seq: 0,
      events: [],
    };
    this.rooms.set(room.id, room);
    this.emit(room, "room_created", userId, `${displayName} opened a Playground.`);
    return this.view(room);
  }

  async join(userId: string, code: string, displayName: string): Promise<PlaygroundRoom> {
    const room = [...this.rooms.values()].find((r) => r.code === code.toUpperCase());
    if (!room) throw new NotFoundError("No Playground with that code.");
    if (!room.participants.some((p) => p.userId === userId)) {
      if (room.participants.length >= 2) throw new BadRequestError("This Playground already has two Minds.");
      room.participants.push(this.participant(userId, displayName, "guest", false));
      await this.onArrival(room, userId);
    }
    return this.view(room);
  }

  /** One-device demo: the seeded persona joins, and the host's device acts for her. */
  async addDemoGuest(roomId: string, userId: string): Promise<PlaygroundRoom> {
    const room = this.forHost(roomId, userId);
    if (!room.participants.some((p) => p.userId === NADANI_ID)) {
      if (room.participants.length >= 2) throw new BadRequestError("This Playground already has two Minds.");
      room.participants.push(this.participant(NADANI_ID, this.svc.profileFor(NADANI_ID).displayName, "guest", true));
      await this.onArrival(room, NADANI_ID);
    }
    return this.view(room);
  }

  async get(roomId: string, userId: string): Promise<PlaygroundRoom> {
    const room = this.forParticipant(roomId, userId);
    await this.refreshResource(room);
    return this.view(room);
  }

  leave(roomId: string, userId: string): PlaygroundRoom {
    const room = this.forParticipant(roomId, userId);
    this.emit(room, "participant_left", userId, `${this.name(room, userId)} left.`);
    room.scene = "ended";
    return this.view(room);
  }

  // -------------------------------------------------------------------------
  // Compare: permissioned snapshots -> deterministic collaborative delta

  async compare(roomId: string, userId: string): Promise<PlaygroundRoom> {
    const room = this.forParticipant(roomId, userId);
    if (room.participants.length < 2) throw new BadRequestError("Invite someone first.");
    this.emit(room, "compare_started", "muse", "Muse is comparing both Minds.");
    room.snapshots = await Promise.all(room.participants.map((p) => this.snapshot(p)));
    const [a, b] = room.snapshots as [MindSnapshot, MindSnapshot];
    const importance = Object.fromEntries(this.svc.conceptList().map((c) => [c.id, c.importance]));
    room.delta = collaborativeDelta(a, b, importance);
    room.scene = "overview";
    const d = room.delta;
    this.emit(room, "delta_ready", "thinketh", "Three useful differences in your current evidence.", {
      aTeachesB: d.aTeachesB.length,
      bTeachesA: d.bTeachesA.length,
      sharedGaps: d.sharedGaps.length,
      conflicts: d.conflicts.length,
    });
    logEvent("playground.delta", { roomId, a: a.userId, b: b.userId, aTeachesB: d.aTeachesB.map((i) => i.conceptId), bTeachesA: d.bTeachesA.map((i) => i.conceptId), sharedGaps: d.sharedGaps.map((i) => i.conceptId), conflicts: d.conflicts.map((i) => i.conceptId) });
    return this.view(room);
  }

  private async snapshot(p: RoomParticipant): Promise<MindSnapshot> {
    const [states, verified] = await Promise.all([this.svc.statesFor(p.userId), this.svc.verifiedConceptIds(p.userId)]);
    const concepts = this.svc.conceptList().flatMap((c) => {
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
    const room = this.forParticipant(roomId, userId);
    if (!room.delta) throw new BadRequestError("Compare both Minds first.");
    const view = this.conductorView(room, intent);
    const action = await this.conductor.next(view);
    // Validated here too: whatever the source, nothing unchecked reaches the room.
    const problem = validateAction(action, view);
    if (problem) throw new BadRequestError(`Conductor proposed an invalid action: ${problem}`);
    await this.apply(room, action);
    return this.view(room);
  }

  private conductorView(room: Room, intent?: ConductorView["intent"]): ConductorView {
    const d = room.delta!;
    return {
      scene: room.scene,
      participants: room.participants.map((p) => ({ id: p.userId, name: p.displayName })),
      teachable: [...d.aTeachesB, ...d.bTeachesA]
        .sort((x, y) => y.score - x.score)
        .map((t) => ({ conceptId: t.conceptId, conceptName: t.conceptName, teacherId: t.teacherId!, learnerId: t.learnerId!, hasTransferQuestion: !!TRANSFER_QUESTION_FOR[t.conceptId] })),
      sharedGaps: d.sharedGaps.map((g) => ({ conceptId: g.conceptId, conceptName: g.conceptName })),
      progress: {
        teacherAssigned: !!room.teaching,
        explanationSubmitted: !!room.teaching?.explanation,
        transferAsked: !!room.transfer,
        transferAnswered: room.transfer?.correctness !== undefined,
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
        room.teaching = {
          conceptId: concept.id,
          conceptName: concept.name,
          teacherId: s("teacherId"),
          learnerId: s("learnerId"),
          prompt: PEER_PROMPTS[concept.id] ?? `What matters most about ${concept.name}?`,
        };
        room.scene = "peer_teaching";
        room.spotlight = { conceptId: concept.id, participantId: s("teacherId") };
        this.emit(room, "teacher_assigned", "muse", `${this.name(room, s("teacherId"))} → ${this.name(room, s("learnerId"))}: ${concept.name}`, {
          conceptId: concept.id,
          teacherId: s("teacherId"),
          learnerId: s("learnerId"),
          by: a.by,
        });
        return;
      }
      case "request_explanation":
        room.scene = "peer_teaching";
        return;
      case "ask_transfer_question": {
        const t = room.teaching!;
        const questionId = TRANSFER_QUESTION_FOR[t.conceptId]!;
        const q = this.svc.diagnosticPrompt(questionId)!;
        room.transfer = { conceptId: t.conceptId, learnerId: t.learnerId, questionId, prompt: q.prompt };
        room.scene = "transfer";
        room.spotlight = { conceptId: t.conceptId, participantId: t.learnerId };
        this.emit(room, "transfer_question", "muse", say ?? "Apply it somewhere new.", { conceptId: t.conceptId, learnerId: t.learnerId, by: a.by });
        return;
      }
      case "teach_shared_gap": {
        const concept = this.svc.conceptList().find((c) => c.id === s("conceptId"))!;
        const lesson = this.svc.conceptLesson(concept.id);
        room.sharedGap = { conceptId: concept.id, conceptName: concept.name, lesson: lesson.sections };
        room.scene = "shared_gap";
        room.spotlight = { conceptId: concept.id };
        this.emit(room, "shared_gap_taught", "muse", say ?? `Shared gap: ${concept.name}`, { conceptId: concept.id, by: a.by, resourceTitle: lesson.resourceTitle ?? null });
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

  explain(roomId: string, userId: string, text: string, asUserId?: string): Promise<PlaygroundRoom> {
    const room = this.forParticipant(roomId, userId);
    const t = room.teaching;
    if (!t) throw new BadRequestError("Nobody has been asked to teach yet.");
    if (t.explanation) throw new BadRequestError("The explanation is already in.");
    const actor = this.actingAs(room, userId, asUserId);
    if (actor !== t.teacherId) throw new ForbiddenError("Only the assigned teacher can explain.");
    t.explanation = text.trim();
    this.emit(room, "explanation_submitted", actor, `${this.name(room, actor)} explained ${t.conceptName}.`, { conceptId: t.conceptId });
    // The teacher explaining is not evidence of anything for the learner; the transfer question is.
    return this.conduct(roomId, userId);
  }

  async answer(roomId: string, userId: string, answer: string, asUserId?: string): Promise<PlaygroundRoom> {
    const room = this.forParticipant(roomId, userId);
    const tr = room.transfer;
    if (!tr) throw new BadRequestError("There's no transfer question yet.");
    if (tr.correctness !== undefined) throw new BadRequestError("That question has been answered.");
    const actor = this.actingAs(room, userId, asUserId);
    if (actor !== tr.learnerId) throw new ForbiddenError("Only the learner answers the transfer question.");
    this.emit(room, "answer_submitted", actor, `${this.name(room, actor)} answered.`, { conceptId: tr.conceptId });

    // The same evidence path as every diagnostic: grade -> observe -> transition -> Tiger.
    const result = await this.svc.answerDiagnostic(actor, tr.questionId, answer);
    const verified = result.transition.observation.kind === "diagnostic_correct";
    tr.answer = answer;
    tr.correctness = result.answer.correctness;
    tr.feedback = result.answer.feedback;
    tr.verified = verified;
    tr.transition = result.transition;
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
    if (idx >= 0 && p) room.snapshots[idx] = await this.snapshot(p);
    return this.view(room);
  }

  // -------------------------------------------------------------------------
  // Shared resource: one source, one delta per Mind (existing resource pipeline)

  async resource(roomId: string, userId: string, url: string): Promise<PlaygroundRoom> {
    const room = this.forParticipant(roomId, userId);
    if (!room.delta) throw new BadRequestError("Compare both Minds first.");
    await this.introduceResource(room, url, "fallback", userId);
    return this.view(room);
  }

  private async introduceResource(room: Room, url: string, by: MuseAction["by"], actor = "muse"): Promise<void> {
    const sides = await Promise.all(
      room.participants.map(async (p) => {
        const r = await this.svc.addResource(p.userId, url);
        return { userId: p.userId, resourceId: r.id, status: r.status, stage: r.stage, newIdeas: r.newToYou.length };
      }),
    );
    const first = this.svc.getResource(sides[0]!.userId, sides[0]!.resourceId);
    room.resource = { url: first.url, title: first.title, sides };
    room.scene = "resource";
    room.spotlight = null;
    this.emit(room, "resource_introduced", actor, "Same source. Different delta.", { by });
    await this.refreshResource(room);
  }

  private async refreshResource(room: Room): Promise<void> {
    const res = room.resource;
    if (!res) return;
    for (const side of res.sides) {
      let r;
      try {
        r = this.svc.getResource(side.userId, side.resourceId);
      } catch {
        continue;
      }
      side.status = r.status;
      side.stage = r.stage;
      side.newIdeas = r.newToYou.length;
      if (r.estimatedUsefulMinutes !== undefined) side.usefulMinutes = r.estimatedUsefulMinutes;
      const focus = r.newToYou[0];
      const skip = r.alreadyUnderstood[0];
      if (focus) side.focus = focus.conceptId ? lowerName(this.conceptName(focus.conceptId)) : focus.idea;
      if (skip) side.skip = skip.conceptId ? lowerName(this.conceptName(skip.conceptId)) : skip.idea;
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

  /** Joining is the consent: both Minds' knowledge-state snapshots become visible to the room. */
  private async onArrival(room: Room, userId: string): Promise<void> {
    room.snapshots = await Promise.all(room.participants.map((p) => this.snapshot(p)));
    room.scene = "arrival";
    this.emit(room, "participant_joined", userId, `${this.name(room, userId)} joined`);
  }

  private participant(userId: string, displayName: string, role: "host" | "guest", demoPersona: boolean): RoomParticipant {
    return { userId, displayName: displayName.trim().slice(0, 40), role, joinedAt: this.now().toISOString(), demoPersona };
  }

  private forParticipant(roomId: string, userId: string): Room {
    const room = this.rooms.get(roomId);
    if (!room || !room.participants.some((p) => p.userId === userId)) throw new NotFoundError("Playground not found.");
    return room;
  }

  private forHost(roomId: string, userId: string): Room {
    const room = this.forParticipant(roomId, userId);
    if (room.hostId !== userId) throw new ForbiddenError("Only the host can do that.");
    return room;
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

  private conceptName(id: string): string {
    return this.svc.conceptList().find((c) => c.id === id)?.name ?? id;
  }

  private emit(room: Room, type: RoomEventType, actor: string, summary: string, data?: RoomEvent["data"]): void {
    room.seq += 1;
    const event: RoomEvent = { id: newId("evt"), seq: room.seq, at: this.now().toISOString(), type, actor, summary, ...(data ? { data } : {}) };
    room.events.push(event);
    if (room.events.length > MAX_EVENTS) room.events.splice(0, room.events.length - MAX_EVENTS);
    this.realtime.publish(this.channel(room), { seq: room.seq, type });
  }

  private channel(room: Room): string {
    return `playground:${room.id}`;
  }

  private newCode(): string {
    for (;;) {
      let code = "";
      for (let i = 0; i < 6; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      if (![...this.rooms.values()].some((r) => r.code === code)) return code;
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
