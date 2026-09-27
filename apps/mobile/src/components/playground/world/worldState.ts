// The Playground world, derived only from the room the server returns, the viewer, and the request this
// device has in flight. Pure: the same inputs always give the same picture, so a refetch, reconnect,
// remount or a second device reconstructs the settled scene. There is no separate game state to drift.
import type { PlaygroundRoom, RoomEvent } from "@thinketh/contracts";
import { narrativeLabel } from "@thinketh/contracts";
import { conductor, stageState, type Pending } from "../../../lib/roomStory";
import { fmt2 } from "../../../lib/knowledge";

/** Floor coordinates: x 0 (left wall) → 1 (right wall); y 0 (back wall) → 1 (front edge). */
export type Pt = { x: number; y: number };

/** Requests this device can have in flight (shown as in progress, never as done). */
export type WorldPending = Pending | "compare";

export type Phase =
  | "empty"
  | "waiting"
  | "arrival"
  | "comparing"
  | "overview"
  | "choosing"
  | "teaching"
  | "checkpoint"
  | "grading"
  | "verified"
  | "not_yet"
  | "shared_gap"
  | "resource"
  | "exchange"
  | "ended";

export type Tone = "coral" | "blue";

export type WorldAgent = {
  userId: string;
  name: string;
  /** "You" on the viewer's own device. */
  label: string;
  /** Fixed per person on every device: the host is coral, the guest blue. */
  tone: Tone;
  isMe: boolean;
  /** The seeded demo persona, operated from the host's phone. Never shown as an autonomous device. */
  persona: boolean;
  at: Pt;
  facing: "left" | "right";
  role: "teacher" | "learner" | "together" | null;
  /** What this participant is doing right now, from recorded state only. */
  doing: string;
  /** Has left the room (walks out through the door). */
  gone: boolean;
};

export type ConceptState = "offered" | "with_teacher" | "checkpoint" | "grading" | "verified" | "not_yet" | "shared" | "source";

export type WorldConcept = {
  conceptId: string;
  /** Plain-language label ("AI checking its own work"). */
  label: string;
  /** Compact on-object label from the snapshot. */
  short: string;
  state: ConceptState;
  at: Pt;
  teacherId?: string;
  learnerId?: string;
};

export type WorldView = {
  phase: Phase;
  agents: WorldAgent[];
  concept: WorldConcept | null;
  /** Thinketh's evidence checkpoint, just short of the learner's Mind. */
  checkpoint: Pt | null;
  /** The learner's Mind on the floor: where a verified idea lands. */
  learnerMind: { userId: string; at: Pt; tone: Tone } | null;
  muse: {
    state: "absent" | "resting" | "choosing" | "directing";
    /** Who made the move on screen: Muse, or the deterministic planner. */
    by: "Muse" | "Planner";
    /** A participant id, or "concept". */
    target: string | null;
    line: string | null;
  };
  /** Thinketh's own action in flight. Muse never compares or grades. */
  thinketh: "comparing" | "grading" | null;
  /** Follow Muse frames this. */
  focus: Pt & { zoom: number };
  /** The ten-second read: who is teaching, what idea, what Thinketh waits for, verified or not. */
  now: { teaching: string | null; idea: string | null; waitingFor: string; verified: boolean | null };
  /** Agent exchange: the latest delivered message, beside the agent that sent it. */
  speech: { userId: string; text: string } | null;
  /** Agent exchange: whose agent is working right now (only while that work is actually in flight). */
  speaking: string | null;
};

export const PLACES = {
  door: { x: 0.86, y: 0.02 },
  hostHome: { x: 0.2, y: 0.56 },
  guestHome: { x: 0.8, y: 0.56 },
} as const;
/** How far along teacher → learner the idea stops for Thinketh's check. */
export const CHECKPOINT_AT = 0.6;

const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const lastOf = (events: RoomEvent[], type: RoomEvent["type"]) => events.findLast((e) => e.type === type);
const sentence = (s: string) => s.split(" ").map((w, i) => (i === 0 || /^[A-Z0-9]{2,}/.test(w) ? w : w.toLowerCase())).join(" ");
export const ideaLabel = (id: string, name: string) => narrativeLabel(id, sentence(name));

/** Is this participant gone (left after their latest join)? */
function hasLeft(room: PlaygroundRoom, userId: string) {
  const left = room.events.findLast((e) => e.type === "participant_left" && e.actor === userId);
  const joined = room.events.findLast((e) => e.type === "participant_joined" && e.actor === userId);
  return !!left && (!joined || left.seq > joined.seq);
}

function phaseOf(room: PlaygroundRoom | null, pending: WorldPending): Phase {
  if (!room) return "empty";
  const s = room.scene;
  if (s === "waiting") return room.participants.length > 1 ? "arrival" : "waiting";
  if (s === "arrival") return pending === "compare" ? "comparing" : "arrival";
  if (s === "comparing") return "comparing";
  if ((s === "overview" || s === "knowledge_moved" || s === "shared_gap") && pending === "conduct") return "choosing";
  if (s === "overview") return "overview";
  if (s === "peer_teaching") return "teaching";
  if (s === "transfer") return pending === "answer" ? "grading" : "checkpoint";
  if (s === "knowledge_moved") return room.transfer?.verified ? "verified" : "not_yet";
  if (s === "shared_gap") return "shared_gap";
  if (s === "resource") return "resource";
  if (s === "agent_exchange") return "exchange";
  return "ended";
}

/**
 * The room as a small world. `me` is the viewer; `pending` is what this device is waiting on.
 * With no room yet, the viewer's own agent stands alone in the room.
 */
export function projectPlayground(room: PlaygroundRoom | null, me: string, pending: WorldPending, myName = "You"): WorldView {
  const phase = phaseOf(room, pending);
  const hostId = room?.hostId ?? me;
  const people = room?.participants ?? [{ userId: me, displayName: myName, role: "host" as const, demoPersona: false }];
  const name = (id?: string) => people.find((p) => p.userId === id)?.displayName ?? "Someone";
  const label = (id?: string) => (id === me ? "You" : name(id));
  const lower = (id?: string) => (id === me ? "you" : name(id));
  const hostHuman = name(hostId);
  const stage = room ? stageState(room, pending === "compare" ? null : pending) : null;

  // Who teaches whom right now (never assumed: from the room's teaching, transfer or plan).
  // The agent exchange positions the two agents like a teaching, from the exchange's own record.
  const ex = phase === "exchange" ? room?.exchange : undefined;
  const inExchange = phase === "teaching" || phase === "checkpoint" || phase === "grading" || phase === "verified" || phase === "not_yet" || phase === "exchange";
  const teacherId = ex ? ex.teacherId : inExchange || phase === "overview" || phase === "choosing" ? stage?.teacherId : undefined;
  const learnerId = ex ? ex.learnerId : inExchange || phase === "overview" || phase === "choosing" ? stage?.learnerId : undefined;
  const conceptId = ex ? ex.conceptId : (stage?.conceptId ?? null);

  const home = (id: string) => (id === hostId ? PLACES.hostHome : PLACES.guestHome);
  const agents: WorldAgent[] = people.map((p) => {
    const gone = room ? hasLeft(room, p.userId) : false;
    let at: Pt = gone ? PLACES.door : home(p.userId);
    let role: WorldAgent["role"] = null;
    if (inExchange && teacherId && learnerId) {
      if (p.userId === teacherId) {
        // The teacher approaches the listener and stops at a conversational distance.
        const l = home(learnerId);
        at = { x: l.x + (home(teacherId).x > l.x ? 0.38 : -0.38), y: l.y + 0.06 };
        role = "teacher";
      } else if (p.userId === learnerId) role = "learner";
    }
    if (phase === "shared_gap" || phase === "resource") {
      at = { x: p.userId === hostId ? 0.3 : 0.7, y: 0.6 };
      role = "together";
    }
    return {
      userId: p.userId,
      name: p.displayName,
      label: label(p.userId),
      tone: p.userId === hostId ? "coral" : "blue",
      isMe: p.userId === me,
      persona: !!p.demoPersona,
      at,
      facing: "right",
      role,
      doing: "",
      gone,
    };
  });

  // Face each other (or the shared object); sprites face right natively and are mirrored to face left.
  const present = agents.filter((a) => !a.gone);
  for (const a of present) {
    const others = present.filter((o) => o !== a);
    const target = phase === "shared_gap" || phase === "resource" ? { x: 0.5 } : others[0]?.at;
    a.facing = target && target.x < a.at.x ? "left" : "right";
  }

  // The idea, placed by what the server recorded. It only reaches the learner after transfer_verified.
  let concept: WorldConcept | null = null;
  let checkpoint: Pt | null = null;
  let learnerMind: WorldView["learnerMind"] = null;
  const snapConcept = (id: string) => room?.snapshots.flatMap((s) => s.concepts).find((c) => c.conceptId === id);
  if (room && conceptId && (phase === "overview" || phase === "choosing" || inExchange) && teacherId && learnerId) {
    const t = agents.find((a) => a.userId === teacherId)!;
    const l = agents.find((a) => a.userId === learnerId)!;
    const c = snapConcept(conceptId);
    const tp = { x: t.at.x, y: t.at.y - 0.02 };
    const lp = { x: l.at.x, y: l.at.y - 0.02 };
    const state: ConceptState =
      // Exchange: the idea stays with the teaching agent until a takeaway is actually saved, then it's shared.
      ex ? (ex.savedTakeawayId ? "shared" : "with_teacher") : phase === "teaching" ? "with_teacher" : phase === "checkpoint" ? "checkpoint" : phase === "grading" ? "grading" : phase === "verified" ? "verified" : phase === "not_yet" ? "not_yet" : "offered";
    const along = ex && state === "shared" ? 0.8 : state === "with_teacher" ? 0.22 : state === "checkpoint" || state === "grading" || state === "not_yet" ? CHECKPOINT_AT - 0.12 : state === "verified" ? 1 : 0.5;
    const at = state === "offered" ? { x: (tp.x + lp.x) / 2, y: 0.5 } : lerp(tp, lp, along);
    concept = { conceptId, label: ideaLabel(conceptId, c?.name ?? room.teaching?.conceptName ?? conceptId), short: c?.short ?? c?.name ?? "", state, at, teacherId, learnerId };
    if (!ex && state !== "offered" && state !== "with_teacher") checkpoint = lerp(tp, lp, CHECKPOINT_AT);
    // An agent's takeaway lands in its library, not in the person's Mind: no Mind ring for an exchange.
    if (inExchange && !ex) learnerMind = { userId: learnerId, at: l.at, tone: l.tone };
  } else if (room && phase === "shared_gap" && room.sharedGap) {
    const g = room.sharedGap;
    concept = { conceptId: g.conceptId, label: ideaLabel(g.conceptId, g.conceptName), short: snapConcept(g.conceptId)?.short ?? g.conceptName, state: "shared", at: { x: 0.5, y: 0.5 } };
  } else if (room && phase === "resource" && room.resource) {
    concept = { conceptId: "source", label: room.resource.title, short: "Source", state: "source", at: { x: 0.5, y: 0.46 } };
  }

  // What each person is doing, from recorded state only.
  const tr = room?.transfer;
  for (const a of agents) {
    const typedFor = a.persona && !a.isMe ? ` (${hostHuman} types for this demo persona)` : "";
    a.doing = a.gone
      ? "Left the room"
      : phase === "waiting" || phase === "empty"
        ? "In the room, waiting for someone to join"
        : phase === "arrival"
          ? a.persona
            ? "Joined as a demo persona on this phone"
            : a.userId === hostId
              ? "Hosting the room"
              : "Joined from their own device"
          : phase === "comparing"
            ? "Sharing their Mind snapshot while Thinketh compares"
            : phase === "overview" || phase === "choosing"
              ? a.userId === teacherId
                ? `Can teach ${lower(learnerId)}`
                : a.userId === learnerId
                  ? `Can learn from ${label(teacherId)}`
                  : "In the room"
              : phase === "teaching"
                ? a.role === "teacher"
                  ? "Teaching"
                  : "Learning it"
                : phase === "checkpoint"
                  ? a.role === "learner"
                    ? `Answering Thinketh's transfer question${typedFor}`
                    : "Taught; waiting for Thinketh's check"
                  : phase === "grading"
                    ? a.role === "learner"
                      ? "Answer submitted; Thinketh is grading"
                      : "Waiting for Thinketh's verdict"
                    : phase === "verified"
                      ? a.role === "learner" && tr?.transition
                        ? `Verified: mastery ${fmt2(tr.transition.before.mastery)} → ${fmt2(tr.transition.after.mastery)}`
                        : a.role === "teacher"
                          ? "Taught it; the transfer was verified"
                          : "In the room"
                      : phase === "not_yet"
                        ? a.role === "learner"
                          ? "Not verified yet; the answer was recorded"
                          : "Taught it; not verified yet"
                        : phase === "shared_gap"
                          ? "Learning the shared gap with Muse"
                          : phase === "resource"
                            ? (() => {
                                const side = room?.resource?.sides.find((s) => s.userId === a.userId);
                                if (!side || side.status === "processing") return "Reading the source against their own Mind";
                                if (side.status === "failed") return "Thinketh couldn't read the source";
                                return `${side.usefulMinutes !== undefined ? `~${Math.round(side.usefulMinutes)} min · ` : ""}${side.newIdeas} new ideas for them`;
                              })()
                            : "Session ended";
  }

  // Agent exchange: what each agent is doing, from the recorded exchange and the work actually in flight.
  const speaking = ex?.status === "running" && ex.pending?.actor.startsWith("agent:") ? ex.pending.actor.slice("agent:".length) : null;
  const lastMsg = ex?.messages.at(-1);
  if (ex) {
    const verb: Record<string, string> = { explanation: "Explained", answer: "Answered", revision: "Revised the explanation", clarification: "Asked a question", evidence_request: "Asked for evidence", application: "Proposed an application", takeaway: "Proposed a takeaway" };
    for (const a of agents) {
      const mine = [...ex.messages].reverse().find((m) => m.from === a.userId);
      a.doing =
        a.userId === speaking
          ? (ex.pending?.label ?? "Taking a turn")
          : ex.status !== "running"
            ? a.userId === ex.learnerId && ex.savedTakeawayId
              ? "Its agent retained a sourced takeaway"
              : mine
                ? `Its agent: ${verb[mine.kind]!.toLowerCase()}`
                : "In the room"
            : mine
              ? `Its agent: ${verb[mine.kind]!.toLowerCase()}`
              : "Its agent is listening";
    }
  }

  // Muse conducts. It appears once there is a plan to conduct, and never compares or grades.
  const assigned = room ? lastOf(room.events, "teacher_assigned") : undefined;
  const moveEvent = phase === "shared_gap" ? (room ? lastOf(room.events, "shared_gap_taught") : undefined) : assigned;
  const by = conductor(moveEvent) === "planner" ? "Planner" : "Muse";
  const museState: WorldView["muse"]["state"] =
    !room || phase === "waiting" || phase === "arrival" || phase === "comparing" || phase === "empty"
      ? "absent"
      : phase === "choosing"
        ? "choosing"
        : phase === "teaching" || phase === "checkpoint"
          ? "directing"
          : phase === "shared_gap" || phase === "resource"
            ? "directing"
            : "resting";
  const exMuse = ex ? [...ex.actions].reverse().find((x) => x.actor === "coordinator") : undefined;
  const museTarget = ex ? (speaking ?? "concept") : museState !== "directing" ? null : phase === "teaching" ? (teacherId ?? null) : phase === "checkpoint" ? (learnerId ?? null) : "concept";
  const museLine = ex ? (exMuse?.summary ?? null) : room && (phase === "teaching" || phase === "checkpoint" || phase === "shared_gap" || phase === "resource") ? (room.museLine ?? null) : null;

  const thinketh: WorldView["thinketh"] = phase === "comparing" ? "comparing" : phase === "grading" ? "grading" : null;

  const t = agents.find((a) => a.userId === teacherId);
  const l = agents.find((a) => a.userId === learnerId);
  const focus = t && l && inExchange ? { ...lerp(t.at, l.at, 0.5), zoom: 1 } : { x: 0.5, y: 0.5, zoom: 1 };

  const teaching = t && l && !inExchange ? `${t.label} can teach ${lower(l.userId)}` : t && l ? `${t.label} ${t.isMe ? "are" : "is"} teaching ${lower(l.userId)}` : phase === "shared_gap" ? `Muse is teaching ${agents.length > 1 ? "both of you" : "you"}` : null;
  const idea = concept ? concept.label : null;
  const learnerWhose = l ? (l.isMe ? "your" : `${l.name}'s`) : "the";
  const side = room?.resource?.sides;
  const waitingFor = {
    empty: "Create a room or join one with a code",
    waiting: "Waiting for someone to join the room",
    arrival: "Waiting for you to compare your Minds",
    comparing: "Thinketh is comparing both Minds…",
    overview: "Waiting for you to start the session",
    choosing: "Muse is choosing the next move from Thinketh's plan…",
    teaching: `Waiting for ${t ? (t.isMe ? "your" : `${t.name}'s`) : "the"} explanation`,
    checkpoint: `Thinketh is waiting for ${learnerWhose} answer to a new case`,
    grading: "Thinketh is grading the answer…",
    verified: "Verified: understanding shown in a new case",
    not_yet: "Not verified: the answer didn't show it yet",
    shared_gap: "Muse is teaching the shared gap",
    resource: side?.some((s) => s.status === "processing") ? "Thinketh is reading the source against each Mind…" : "Each Mind got its own delta from the same source",
    exchange: ex ? (ex.status === "running" ? (ex.pending ? `${ex.pending.label}…` : "Waiting for the next step") : (ex.outcome ?? "The exchange ended")) : "",
    ended: "Session ended",
  }[phase];
  const verified = phase === "verified" ? true : phase === "not_yet" ? false : null;

  return {
    phase,
    agents,
    concept,
    checkpoint,
    learnerMind,
    muse: { state: ex ? (ex.status === "running" ? (ex.pending?.actor === "coordinator" ? "choosing" : "directing") : "resting") : museState, by: ex ? (exMuse?.by === "planner" ? "Planner" : "Muse") : by, target: museTarget, line: museLine },
    thinketh,
    focus,
    now: { teaching: ex && t && l ? `${t.isMe ? "Your" : `${t.name}'s`} agent ${ex.mode === "explore" ? "and" : "is teaching"} ${l.isMe ? "your" : `${l.name}'s`} agent${ex.mode === "explore" ? " are exploring it" : ""}` : teaching, idea, waitingFor, verified },
    speech: lastMsg ? { userId: lastMsg.from, text: lastMsg.text.length > 110 ? `${lastMsg.text.slice(0, 107).trimEnd()}…` : lastMsg.text } : null,
    speaking,
  };
}

/**
 * One-time effects for this device. `firstSeenSeq` is the room's seq when this device first saw it;
 * anything at or before it is history and settles without replay. `played` holds effects already shown.
 */
export function freshEffects(room: PlaygroundRoom | null, firstSeenSeq: number | undefined, played: ReadonlySet<string>) {
  if (!room || firstSeenSeq === undefined) return { entering: [] as string[], enterKeys: [] as string[], celebrate: null as string | null };
  const isNew = (e: RoomEvent) => e.seq > firstSeenSeq && !played.has(`${room.id}:${e.seq}`);
  const joins = room.events.filter((e) => e.type === "participant_joined" && e.actor && isNew(e));
  const entering = joins.map((e) => e.actor);
  const enterKeys = joins.map((e) => `${room.id}:${e.seq}`);
  const v = lastOf(room.events, "transfer_verified");
  const celebrate = v && isNew(v) && room.scene === "knowledge_moved" && room.transfer?.verified ? `${room.id}:${v.seq}` : null;
  return { entering, enterKeys, celebrate };
}

/** Every move this session recorded, verified or not. The end screen never claims more (or less). */
export function sessionOutcome(room: PlaygroundRoom) {
  const moves = [...(room.completedTeachings ?? [])];
  const tr = room.transfer;
  const t = room.teaching;
  if (tr && tr.verified !== undefined && !moves.some((m) => m.conceptId === tr.conceptId && m.learnerId === tr.learnerId)) {
    moves.push({ conceptId: tr.conceptId, conceptName: t?.conceptName ?? tr.conceptId, teacherId: t?.teacherId ?? "", learnerId: tr.learnerId, verified: !!tr.verified });
  }
  return { moves, verifiedCount: moves.filter((m) => m.verified).length };
}
