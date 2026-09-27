// The Playground world, derived only from the room the server returns, the viewer, and the request this
// device has in flight. Pure: the same inputs always give the same picture, so a refetch, reconnect,
// remount or a second device reconstructs the settled scene. There is no separate game state to drift.
import type { PlaygroundRoom, RoomEvent } from "@thinketh/contracts";
import { narrativeLabel } from "@thinketh/contracts";

/** Floor coordinates: x 0 (left wall) → 1 (right wall); y 0 (back wall) → 1 (front edge). */
export type Pt = { x: number; y: number };

/** Requests this device can have in flight (shown as in progress, never as done). */
export type WorldPending = "compare" | null;

export type Phase = "empty" | "waiting" | "arrival" | "comparing" | "overview" | "exchange" | "ended";

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
  role: "teacher" | "learner" | null;
  /** What this participant is doing right now, from recorded state only. */
  doing: string;
  /** Has left the room (walks out through the door). */
  gone: boolean;
};

/** Offered (a difference Thinketh found), with the teaching agent, or shared once a takeaway is saved. */
export type ConceptState = "offered" | "with_teacher" | "shared";

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
  muse: {
    /** Muse coordinates the agent exchange; it is absent until there is one to coordinate. */
    state: "absent" | "resting" | "choosing" | "directing";
    /** Who chose the exchange's last move: Muse, or the deterministic planner. */
    by: "Muse" | "Planner";
    /** A participant id, or "concept". */
    target: string | null;
    line: string | null;
  };
  /** Thinketh's own action in flight. Muse never compares. */
  thinketh: "comparing" | null;
  /** Follow Muse frames this. */
  focus: Pt & { zoom: number };
  /** The ten-second read: who is teaching, what idea, what the room waits for. */
  now: { teaching: string | null; idea: string | null; waitingFor: string };
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

const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
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
  if (s === "agent_exchange") return room.exchange ? "exchange" : "overview";
  if (s === "ended") return "ended";
  // "overview", and scenes of the removed guided session a stored room may still carry.
  return room.delta ? "overview" : "arrival";
}

/** The difference the room is about: what the exchange would start on, else the strongest teachable one. */
function offered(room: PlaygroundRoom): { conceptId: string; teacherId: string; learnerId: string } | null {
  const av = room.exchangeAvailability;
  if (av?.available && av.conceptId && av.teacherId && av.learnerId) return { conceptId: av.conceptId, teacherId: av.teacherId, learnerId: av.learnerId };
  const d = room.delta;
  const top = d ? [...d.bTeachesA, ...d.aTeachesB].sort((a, b) => b.score - a.score)[0] : undefined;
  return top?.teacherId && top.learnerId ? { conceptId: top.conceptId, teacherId: top.teacherId, learnerId: top.learnerId } : null;
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

  // Who teaches whom right now (never assumed): the exchange's own record, else the difference Thinketh found.
  const ex = phase === "exchange" ? room?.exchange : undefined;
  const inExchange = phase === "exchange";
  const found = room && phase === "overview" ? offered(room) : null;
  const teacherId = ex ? ex.teacherId : found?.teacherId;
  const learnerId = ex ? ex.learnerId : found?.learnerId;
  const conceptId = ex ? ex.conceptId : (found?.conceptId ?? null);

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
    const target = others[0]?.at;
    a.facing = target && target.x < a.at.x ? "left" : "right";
  }

  // The idea, placed by what the server recorded: with the teaching agent until a takeaway is saved.
  let concept: WorldConcept | null = null;
  const snapConcept = (id: string) => room?.snapshots.flatMap((s) => s.concepts).find((c) => c.conceptId === id);
  if (room && conceptId && (phase === "overview" || inExchange) && teacherId && learnerId) {
    const t = agents.find((a) => a.userId === teacherId)!;
    const l = agents.find((a) => a.userId === learnerId)!;
    const c = snapConcept(conceptId);
    const tp = { x: t.at.x, y: t.at.y - 0.02 };
    const lp = { x: l.at.x, y: l.at.y - 0.02 };
    const state: ConceptState = ex ? (ex.savedTakeawayId ? "shared" : "with_teacher") : "offered";
    const at = state === "offered" ? { x: (tp.x + lp.x) / 2, y: 0.5 } : lerp(tp, lp, state === "shared" ? 0.8 : 0.22);
    concept = { conceptId, label: ideaLabel(conceptId, c?.name ?? ex?.conceptName ?? conceptId), short: c?.short ?? c?.name ?? "", state, at, teacherId, learnerId };
  }

  // What each person is doing, from recorded state only.
  for (const a of agents) {
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
            : phase === "overview"
              ? a.userId === teacherId
                ? `Can teach ${lower(learnerId)}`
                : a.userId === learnerId
                  ? `Can learn from ${label(teacherId)}`
                  : "In the room"
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

  // Muse coordinates the agent exchange: present only while there is one, never comparing or grading.
  const exMuse = ex ? [...ex.actions].reverse().find((x) => x.actor === "coordinator") : undefined;
  const thinketh: WorldView["thinketh"] = phase === "comparing" ? "comparing" : null;

  const t = agents.find((a) => a.userId === teacherId);
  const l = agents.find((a) => a.userId === learnerId);
  const focus = t && l && inExchange ? { ...lerp(t.at, l.at, 0.5), zoom: 1 } : { x: 0.5, y: 0.5, zoom: 1 };

  const teaching = t && l && !inExchange ? `${t.label} can teach ${lower(l.userId)}` : null;
  const idea = concept ? concept.label : null;
  const waitingFor = {
    empty: "Create a room or join one with a code",
    waiting: "Waiting for someone to join the room",
    arrival: "Waiting for you to compare your Minds",
    comparing: "Thinketh is comparing both Minds…",
    overview: room?.exchangeAvailability?.available ? "Waiting for you to let your agents exchange" : "Thinketh compared your Minds",
    exchange: ex ? (ex.status === "running" ? (ex.pending ? `${ex.pending.label}…` : "Waiting for the next step") : (ex.outcome ?? "The exchange ended")) : "",
    ended: "Session ended",
  }[phase];

  return {
    phase,
    agents,
    concept,
    muse: ex
      ? { state: ex.status === "running" ? (ex.pending?.actor === "coordinator" ? "choosing" : "directing") : "resting", by: exMuse?.by === "planner" ? "Planner" : "Muse", target: speaking ?? "concept", line: exMuse?.summary ?? null }
      : { state: "absent", by: "Muse", target: null, line: null },
    thinketh,
    focus,
    now: { teaching: ex && t && l ? `${t.isMe ? "Your" : `${t.name}'s`} agent ${ex.mode === "explore" ? "and" : "is teaching"} ${l.isMe ? "your" : `${l.name}'s`} agent${ex.mode === "explore" ? " are exploring it" : ""}` : teaching, idea, waitingFor },
    speech: lastMsg ? { userId: lastMsg.from, text: lastMsg.text.length > 110 ? `${lastMsg.text.slice(0, 107).trimEnd()}…` : lastMsg.text } : null,
    speaking,
  };
}

/**
 * One-time effects for this device. `firstSeenSeq` is the room's seq when this device first saw it;
 * anything at or before it is history and settles without replay. `played` holds effects already shown.
 */
export function freshEffects(room: PlaygroundRoom | null, firstSeenSeq: number | undefined, played: ReadonlySet<string>) {
  if (!room || firstSeenSeq === undefined) return { entering: [] as string[], enterKeys: [] as string[] };
  const isNew = (e: RoomEvent) => e.seq > firstSeenSeq && !played.has(`${room.id}:${e.seq}`);
  const joins = room.events.filter((e) => e.type === "participant_joined" && e.actor && isNew(e));
  return { entering: joins.map((e) => e.actor), enterKeys: joins.map((e) => `${room.id}:${e.seq}`) };
}
