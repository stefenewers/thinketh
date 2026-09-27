// The Playground room as a world: where each Mind stands, which concept objects exist, how
// high they stand (mastery), what connects them, where Muse is, and what Thinketh is doing.
// Pure and renderer-independent: the SVG room draws it today, a Skia room could draw it later.
// The server room stays authoritative; nothing here changes knowledge.
import type { PlaygroundRoom, RoomEvent } from "@thinketh/contracts";
import { graphLabel, narrativeLabel } from "@thinketh/contracts";
import { deltaClaim } from "./resourceDelta";
import { PATH_PROGRESS, stageState, type Beat, type Pending } from "./roomStory";

export type Side = "left" | "right";
export type Evidence = "strong" | "developing" | "weak";

export type WorldPerson = {
  userId: string;
  /** "You" on your own device, the name otherwise. */
  label: string;
  name: string;
  side: Side;
  isMe: boolean;
  /** Seeded demo persona typed on this phone (one-device mode). */
  persona: boolean;
};

export type WorldConcept = {
  key: string;
  userId: string;
  side: Side;
  conceptId: string;
  short: string;
  name: string;
  /** Floor position: x in [-1, 1] (left to right), z in [0, 1] (back to front). */
  x: number;
  z: number;
  /** Mastery, 0-1: how high the object stands. */
  height: number;
  /** Importance, 0-1: how large it is. */
  size: number;
  evidence: Evidence;
  verified: boolean;
  uncertainty: number;
  role: "focus" | "related" | "quiet";
  /** This concept changed because an answer was verified (the learner's focus concept). */
  changed: boolean;
};

export type PathState = "possible" | "traveling" | "checkpoint" | "grading" | "verified" | "not_yet";

export type WorldPath = {
  conceptId: string;
  fromKey: string;
  toKey: string;
  teacherId: string;
  learnerId: string;
  state: PathState;
  /** How far the perspective has travelled (only "verified" reaches 1). */
  progress: number;
  /** Where Thinketh's evidence checkpoint stands on the path. */
  checkpointAt: number;
};

export type World = {
  beat: Beat | "arrival" | "waiting" | "ended";
  people: WorldPerson[];
  /** Both permissioned snapshots are in the room (from arrival on). */
  shared: boolean;
  /** Thinketh has compared them (a collaborative delta exists). */
  compared: boolean;
  concepts: WorldConcept[];
  edges: { fromKey: string; toKey: string; lit: boolean }[];
  path: WorldPath | null;
  muse: { visible: boolean; target: { kind: "rest" } | { kind: "concept"; key: string } | { kind: "gap" } | { kind: "source" }; by: "muse" | "planner" | null; waiting: boolean };
  /** Thinketh's own actions, distinct from Muse's. */
  system: { comparing: boolean; grading: boolean };
  gap: { conceptId: string; name: string; keys: string[] } | null;
  source: {
    title: string;
    chosenBecause?: string;
    claim: "reading" | "different" | "similar";
    sides: { userId: string; side: Side; status: string; minutes?: number; ideas: number; focus?: string }[];
  } | null;
  /** Where "Follow Muse" frames the camera (world coordinates). */
  frame: { x: number; z: number; zoom: number };
};

const PLATFORM_X: Record<Side, number> = { left: -0.5, right: 0.5 };
const PLATFORM_Z = 0.5;
const MAX_CONCEPTS = 7;
/** Slots in platform-local units (inward = toward the centre of the room). Slot 0 is the inner front, kept for the focus. */
const SLOTS: [number, number][] = [
  [0.2, 0.1],
  [-0.2, 0.14],
  [0.02, -0.16],
  [-0.24, -0.08],
  [0.24, -0.12],
  [-0.06, 0.24],
  [0.16, 0.26],
  [-0.2, 0.32],
];

export const keyOf = (userId: string, conceptId: string) => `${userId}:${conceptId}`;

const evidenceOf = (level: string): Evidence => (level === "strong" || level === "intermediate" ? "strong" : level === "developing" ? "developing" : "weak");

/** Host on the left, the guest on the right, on every device: the room looks the same to both people. */
export function sides(room: PlaygroundRoom): { left?: string; right?: string } {
  const host = room.participants.find((p) => p.userId === room.hostId) ?? room.participants[0];
  const guest = room.participants.find((p) => p.userId !== host?.userId);
  return { left: host?.userId, right: guest?.userId };
}

export function projectRoomToWorld(room: PlaygroundRoom, me: string, pending: Pending | "compare" = null): World {
  const { right } = sides(room);
  const sideOf = (id: string): Side => (id === right ? "right" : "left");
  const people: WorldPerson[] = room.participants.map((p) => ({
    userId: p.userId,
    name: p.displayName,
    label: p.userId === me ? "You" : p.displayName,
    side: sideOf(p.userId),
    isMe: p.userId === me,
    persona: p.demoPersona,
  }));
  const stage = stageState(room, pending === "compare" ? null : pending);
  const shared = room.snapshots.length === 2;
  const focusId = stage.conceptId;
  const gapId = room.scene === "shared_gap" ? (room.sharedGap?.conceptId ?? null) : null;
  const verified = stage.beat === "verified";

  const concepts: WorldConcept[] = [];
  const edges: World["edges"] = [];
  if (shared) {
    for (const snap of room.snapshots) {
      const side = sideOf(snap.userId);
      const inward = side === "left" ? 1 : -1;
      // Stable order: by concept id, so the same concept sits in mirrored places in both Minds.
      const ordered = [...snap.concepts].sort((a, b) => a.conceptId.localeCompare(b.conceptId));
      const lead = focusId ?? gapId;
      const shown = [
        ...ordered.filter((c) => c.conceptId === lead),
        ...[...ordered].filter((c) => c.conceptId !== lead).sort((a, b) => b.importance - a.importance || a.conceptId.localeCompare(b.conceptId)).slice(0, MAX_CONCEPTS - (lead ? 1 : 0)),
      ];
      const others = shown.filter((c) => c.conceptId !== lead).sort((a, b) => a.conceptId.localeCompare(b.conceptId));
      const learnerRelated = new Set<string>();
      if (verified && snap.userId === stage.learnerId && focusId) {
        for (const e of snap.edges) {
          if (e.fromConceptId === focusId) learnerRelated.add(e.toConceptId);
          if (e.toConceptId === focusId) learnerRelated.add(e.fromConceptId);
        }
      }
      for (const c of shown) {
        const slot = c.conceptId === lead ? SLOTS[0]! : SLOTS[1 + others.indexOf(c)] ?? SLOTS[SLOTS.length - 1]!;
        concepts.push({
          key: keyOf(snap.userId, c.conceptId),
          userId: snap.userId,
          side,
          conceptId: c.conceptId,
          short: graphLabel(c.conceptId, c.short),
          name: narrativeLabel(c.conceptId, c.name),
          x: PLATFORM_X[side] + slot[0] * inward,
          z: PLATFORM_Z + slot[1],
          height: clamp01(c.mastery),
          size: clamp01(c.importance),
          evidence: evidenceOf(c.level),
          verified: c.verified,
          uncertainty: clamp01(c.uncertainty),
          role: c.conceptId === lead ? "focus" : learnerRelated.has(c.conceptId) ? "related" : "quiet",
          changed: verified && snap.userId === stage.learnerId && c.conceptId === focusId,
        });
      }
      const ids = new Set(shown.map((c) => c.conceptId));
      for (const e of snap.edges) {
        if (!ids.has(e.fromConceptId) || !ids.has(e.toConceptId)) continue;
        const lit = verified && snap.userId === stage.learnerId && (e.fromConceptId === focusId || e.toConceptId === focusId);
        edges.push({ fromKey: keyOf(snap.userId, e.fromConceptId), toKey: keyOf(snap.userId, e.toConceptId), lit });
      }
    }
  }

  const pathStates: Partial<Record<Beat, PathState>> = { found: "possible", teaching: "traveling", checkpoint: "checkpoint", grading: "grading", verified: "verified", not_yet: "not_yet" };
  const pathState = pathStates[stage.beat];
  const path: WorldPath | null =
    shared && pathState && focusId && stage.teacherId && stage.learnerId
      ? {
          conceptId: focusId,
          fromKey: keyOf(stage.teacherId, focusId),
          toKey: keyOf(stage.learnerId, focusId),
          teacherId: stage.teacherId,
          learnerId: stage.learnerId,
          state: pathState,
          progress: PATH_PROGRESS[stage.beat],
          checkpointAt: 0.72,
        }
      : null;

  // Muse directs attention only while it is conducting: to the teacher's concept, the shared gap or the source.
  const museTarget: World["muse"]["target"] =
    path && (path.state === "traveling" || path.state === "checkpoint")
      ? { kind: "concept", key: path.fromKey }
      : gapId
        ? { kind: "gap" }
        : room.scene === "resource"
          ? { kind: "source" }
          : { kind: "rest" };

  const res = room.resource;
  const source: World["source"] =
    room.scene === "resource" && res
      ? {
          title: res.title,
          chosenBecause: res.chosenBecause,
          claim: deltaClaim(res.sides),
          sides: res.sides.map((s) => ({ userId: s.userId, side: sideOf(s.userId), status: s.status, minutes: s.usefulMinutes, ideas: s.newIdeas, focus: s.focus })),
        }
      : null;

  const gap: World["gap"] = gapId && shared ? { conceptId: gapId, name: narrativeLabel(gapId, room.sharedGap?.conceptName ?? gapId), keys: room.snapshots.map((s) => keyOf(s.userId, gapId)) } : null;

  // Follow Muse: frame the path, the gap or the whole room. Camera only; learning state is untouched.
  const pos = (key: string) => concepts.find((c) => c.key === key);
  const a = path ? pos(path.fromKey) : undefined;
  const b = path ? pos(path.toKey) : undefined;
  const frame = a && b ? { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, zoom: 1.12 } : gap ? { x: 0, z: 0.55, zoom: 1.06 } : { x: 0, z: 0.5, zoom: 1 };

  const beat: World["beat"] = room.scene === "arrival" || room.scene === "comparing" ? "arrival" : room.scene === "waiting" ? "waiting" : room.scene === "ended" ? "ended" : stage.beat;

  return {
    beat,
    people,
    shared,
    compared: !!room.delta,
    concepts,
    edges,
    path,
    muse: { visible: shared && !!room.delta, target: museTarget, by: stage.conductedBy, waiting: stage.waiting === "muse" },
    system: { comparing: pending === "compare", grading: stage.beat === "grading" },
    gap,
    source,
    frame,
  };
}

// ---------------------------------------------------------------------------
// Cues: transient direction for events this device newly observes (never replayed).

export type CueActor = { kind: "thinketh" | "muse" | "planner" | "person"; name: string };
export type VisualCue = {
  seq: number;
  kind: "arrive" | "compare" | "difference" | "assign" | "spotlight" | "explain" | "checkpoint" | "answer" | "verified" | "not_verified" | "gap" | "source" | "end" | "leave";
  actor: CueActor;
  label: string;
  conceptId?: string;
  /** Only a verified answer celebrates. */
  celebrate: boolean;
};

const conductorOf = (e: RoomEvent): CueActor => (e.data?.by === "fallback" ? { kind: "planner", name: "Planner" } : { kind: "muse", name: "Muse" });

export function eventToVisualCue(e: RoomEvent, room: PlaygroundRoom, me: string): VisualCue | null {
  const who = (id: unknown) => (typeof id === "string" ? (id === me ? "You" : (room.participants.find((p) => p.userId === id)?.displayName ?? "Someone")) : "Someone");
  const concept = typeof e.data?.conceptId === "string" ? e.data.conceptId : undefined;
  const topic = (id?: string) => (id ? narrativeLabel(id, room.snapshots[0]?.concepts.find((c) => c.conceptId === id)?.name ?? id) : "");
  const person: CueActor = { kind: "person", name: who(e.actor) };
  // Grammar for "you" on your own device.
  const obj = (id: unknown) => who(id).replace(/^You$/, "you");
  const whose = (id: unknown) => (who(id) === "You" ? "Your" : `${who(id)}'s`);
  const applies = (id: unknown) => (who(id) === "You" ? "you apply" : `${who(id)} applies`);
  const base = { seq: e.seq, conceptId: concept, celebrate: false };
  switch (e.type) {
    case "participant_joined":
      return { ...base, kind: "arrive", actor: person, label: `${who(e.actor)} joined the room` };
    case "participant_left":
      return { ...base, kind: "leave", actor: person, label: `${who(e.actor)} left` };
    case "compare_started":
      return { ...base, kind: "compare", actor: { kind: "thinketh", name: "Thinketh" }, label: "Thinketh is comparing the two shared snapshots" };
    case "delta_ready":
      return { ...base, kind: "difference", actor: { kind: "thinketh", name: "Thinketh" }, label: e.summary };
    case "teacher_assigned": {
      const c = conductorOf(e);
      return { ...base, kind: "assign", actor: c, label: `${c.name} chose ${obj(e.data?.teacherId)} to teach ${obj(e.data?.learnerId)} · ${topic(concept)}` };
    }
    case "spotlight": {
      const c = conductorOf(e);
      return { ...base, kind: "spotlight", actor: c, label: `${c.name} points at ${topic(concept)}` };
    }
    case "explanation_submitted":
      // The teacher's agent taught the learner's agent (actor "agent:<id>"): a perspective, not proof yet.
      if (e.actor.startsWith("agent:")) {
        const teacherId = e.actor.slice("agent:".length);
        return { ...base, kind: "explain", actor: { kind: "person", name: who(teacherId) }, label: `${whose(teacherId)} agent taught it: a perspective, not proof yet` };
      }
      return { ...base, kind: "explain", actor: person, label: `${who(e.actor)} explained: a perspective, not proof yet` };
    case "transfer_question":
      return { ...base, kind: "checkpoint", actor: { kind: "thinketh", name: "Thinketh" }, label: `Thinketh set a checkpoint: ${applies(e.data?.learnerId)} it somewhere new` };
    case "answer_submitted":
      return { ...base, kind: "answer", actor: person, label: `${who(e.actor)} answered · Thinketh is grading` };
    case "transfer_verified":
      return { ...base, kind: "verified", actor: { kind: "thinketh", name: "Thinketh" }, label: `Verified: ${whose(room.transfer?.learnerId)} Mind changed`, celebrate: true };
    case "transfer_not_verified":
      return { ...base, kind: "not_verified", actor: { kind: "thinketh", name: "Thinketh" }, label: "Not verified: the answer is recorded as evidence" };
    case "shared_gap_taught": {
      const c = conductorOf(e);
      return { ...base, kind: "gap", actor: c, label: `${c.name} teaches both of you · ${topic(concept)}` };
    }
    case "resource_introduced":
      return { ...base, kind: "source", actor: e.actor === "muse" ? conductorOf(e) : person, label: "One source enters the room, read against each Mind" };
    case "session_ended":
      return { ...base, kind: "end", actor: conductorOf(e), label: "Session ended" };
    default:
      return null;
  }
}

/** Cues for events after `lastSeq`, in order. The caller keeps `lastSeq`, so nothing plays twice. */
export function cuesSince(room: PlaygroundRoom, lastSeq: number, me: string): VisualCue[] {
  return room.events
    .filter((e) => e.seq > lastSeq)
    .sort((a, b) => a.seq - b.seq)
    .map((e) => eventToVisualCue(e, room, me))
    .filter((c): c is VisualCue => !!c);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
