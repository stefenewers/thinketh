// The Playground's visual story, derived only from the room the server returns (scene, teaching,
// transfer, recorded events) and what this device is waiting on. Pure, so the same room always
// gives the same picture: refetches, reconnects and remounts can't replay or invent a beat.
import type { PlaygroundRoom, RoomEvent } from "@thinketh/contracts";

/** What the shared canvas shows. Only "verified" completes the path. */
export type Beat = "found" | "teaching" | "checkpoint" | "grading" | "verified" | "not_yet" | "gap" | "source" | "idle";

/** A request this device has in flight: shown as in progress, never as done. */
export type Pending = "conduct" | "answer" | "explain" | null;

export type StageState = {
  beat: Beat;
  conceptId: string | null;
  teacherId?: string;
  learnerId?: string;
  /** Who made the move on screen: Muse, or the deterministic planner when Muse couldn't. */
  conductedBy: "muse" | "planner" | null;
  /** Something is being worked on right now (not a result). */
  waiting: "muse" | "grading" | null;
};

/** How far the coral path has travelled from teacher to learner, per beat. Only a verified answer reaches 1. */
export const PATH_PROGRESS: Record<Beat, number> = {
  found: 0,
  teaching: 0.42,
  checkpoint: 0.64,
  grading: 0.64,
  not_yet: 0.64,
  verified: 1,
  gap: 0,
  source: 0,
  idle: 0,
};

const lastOf = (events: RoomEvent[], type: RoomEvent["type"]) => events.findLast((e) => e.type === type);

/** Muse or the fallback planner, from the event's own record (data.by). */
export function conductor(e: RoomEvent | undefined): "muse" | "planner" | null {
  if (!e) return null;
  return e.data?.by === "fallback" ? "planner" : "muse";
}

export function stageState(room: PlaygroundRoom, pending: Pending): StageState {
  const waiting = pending === "conduct" ? "muse" : pending === "answer" ? "grading" : null;
  const assigned = lastOf(room.events, "teacher_assigned");
  const base = { conductedBy: conductor(assigned), waiting } as const;
  switch (room.scene) {
    case "overview": {
      // The difference Thinketh found: the next planned peer move, else the strongest one.
      const next = room.plan?.items.find((i) => !i.done && i.type === "peer_teach");
      const d = room.delta;
      const top = d ? [...d.bTeachesA, ...d.aTeachesB].sort((a, b) => b.score - a.score)[0] : undefined;
      const conceptId = next?.conceptId ?? top?.conceptId ?? null;
      return { beat: "found", conceptId, teacherId: next?.teacherId ?? top?.teacherId, learnerId: next?.learnerId ?? top?.learnerId, conductedBy: null, waiting };
    }
    case "peer_teaching": {
      const t = room.teaching!;
      return { ...base, beat: "teaching", conceptId: t.conceptId, teacherId: t.teacherId, learnerId: t.learnerId };
    }
    case "transfer": {
      const t = room.teaching;
      const tr = room.transfer!;
      return { ...base, beat: pending === "answer" ? "grading" : "checkpoint", conceptId: tr.conceptId, teacherId: t?.teacherId, learnerId: tr.learnerId };
    }
    case "knowledge_moved": {
      const t = room.teaching;
      const tr = room.transfer!;
      return { ...base, beat: tr.verified ? "verified" : "not_yet", conceptId: tr.conceptId, teacherId: t?.teacherId, learnerId: tr.learnerId };
    }
    case "shared_gap":
      return { conductedBy: conductor(lastOf(room.events, "shared_gap_taught")), waiting, beat: "gap", conceptId: room.sharedGap?.conceptId ?? null };
    case "resource":
      return { conductedBy: null, waiting, beat: "source", conceptId: null };
    default:
      return { conductedBy: null, waiting, beat: "idle", conceptId: null };
  }
}

export type RailStep = {
  key: string;
  /** Who did it: "Thinketh", "Muse", "Planner" or a participant's name. */
  actor: string;
  label: string;
  state: "done" | "current" | "pending";
  /** The recorded detail behind it (numbers, reason, source), shown on tap. */
  detail?: string;
};

const fmt = (n: number) => n.toFixed(2);

/**
 * "What just happened": the current learning exchange as recorded steps. Done steps come from
 * events; the current step is either the next human action or a request actually in flight.
 */
export function railSteps(room: PlaygroundRoom, pending: Pending): RailStep[] {
  const name = (id: string | undefined) => room.participants.find((p) => p.userId === id)?.displayName ?? "Someone";
  const ev = room.events;
  const assignedAt = ev.findLastIndex((e) => e.type === "teacher_assigned");
  const cycle = assignedAt >= 0 ? ev.slice(assignedAt) : [];
  const assigned = cycle[0];
  const explained = cycle.find((e) => e.type === "explanation_submitted");
  const asked = cycle.find((e) => e.type === "transfer_question");
  const verdict = cycle.find((e) => e.type === "transfer_verified" || e.type === "transfer_not_verified");
  const delta = ev.findLast((e) => e.type === "delta_ready");
  const t = room.teaching;
  const tr = room.transfer;
  const teacher = name(t?.teacherId);
  const learner = name(tr?.learnerId ?? t?.learnerId);
  const by = conductor(assigned);
  const top = room.delta ? [...room.delta.bTeachesA, ...room.delta.aTeachesB].find((i) => i.conceptId === t?.conceptId) : undefined;

  const steps: RailStep[] = [
    {
      key: "found",
      actor: "Thinketh",
      label: "Found a teaching gap",
      state: delta ? "done" : "pending",
      detail: top
        ? `${top.reason} ${name(top.teacherId)}: mastery ${fmt(top.teacherId === room.delta!.aId ? top.a.mastery : top.b.mastery)}; ${name(top.learnerId)}: ${fmt(top.learnerId === room.delta!.aId ? top.a.mastery : top.b.mastery)}. Rule: ${top.rule.replace("_", " ")}.`
        : delta?.summary,
    },
    {
      key: "assigned",
      actor: by === "planner" ? "Planner" : "Muse",
      label: assigned ? `Assigned ${teacher}` : pending === "conduct" ? "Choosing the next move…" : "Assigns a teacher",
      state: assigned ? "done" : pending === "conduct" ? "current" : "pending",
      detail: assigned
        ? `${assigned.summary}${by === "planner" ? " (Muse couldn't respond, so Thinketh's deterministic planner made this move from the same plan.)" : " (a validated Muse tool call, from Thinketh's plan)"}`
        : undefined,
    },
    {
      key: "explained",
      actor: teacher,
      label: explained ? "Agent taught it" : "Agent teaches",
      state: explained ? "done" : assigned ? "current" : "pending",
      detail: t?.explanation ? `“${t.explanation}” A perspective, not proof of learning.` : undefined,
    },
    {
      key: "asked",
      actor: "Thinketh",
      label: asked ? "Asked for transfer" : "Transfer check",
      state: asked ? "done" : "pending",
      detail: tr ? `${tr.prompt}${tr.source ? ` (${tr.source === "seeded" ? "seeded" : tr.source === "generated" ? "generated and validated" : "grounded fallback"} challenge)` : ""}` : undefined,
    },
    {
      key: "verdict",
      // Before a verdict the learner is the one acting; grading and the verdict are Thinketh's.
      actor: verdict || pending === "answer" ? "Thinketh" : learner,
      label: verdict ? (verdict.type === "transfer_verified" ? "Answer verified" : "Not verified yet") : pending === "answer" ? "Grading the answer…" : asked ? "Answering" : "Answers",
      state: verdict ? "done" : asked ? "current" : "pending",
      detail: verdict && tr?.feedback ? tr.feedback : undefined,
    },
    {
      key: "updated",
      actor: "Thinketh",
      label: verdict ? (verdict.type === "transfer_verified" ? "Mind updated" : "Recorded, not verified") : "Mind updates",
      state: verdict ? "done" : "pending",
      detail: tr?.transition ? `${learner}: mastery ${fmt(tr.transition.before.mastery)} → ${fmt(tr.transition.after.mastery)}. ${tr.transition.reason}` : undefined,
    },
  ];
  // Only one step is ever "current": the first not-done one that is current.
  let seenCurrent = false;
  return steps.map((s) => {
    if (s.state !== "current") return s;
    if (seenCurrent) return { ...s, state: "pending" };
    seenCurrent = true;
    return s;
  });
}

/** The next human action, in plain words (who acts, and what). */
export function nextHumanAction(room: PlaygroundRoom, me: string): string | null {
  const name = (id: string | undefined) => (id === me ? "You" : (room.participants.find((p) => p.userId === id)?.displayName ?? "Someone"));
  // Nobody acts while the agents teach each other: say what is happening instead.
  const agent = (id: string) => (id === me ? "your agent" : `${name(id)}'s agent`);
  if (room.scene === "peer_teaching" && room.teaching) return `${agent(room.teaching.teacherId).replace(/^y/, "Y")} is teaching ${agent(room.teaching.learnerId)}`;
  if (room.scene === "transfer" && room.transfer) return `${name(room.transfer.learnerId)}: apply it to the new case`;
  if (room.scene === "overview") return "Start the session when you're ready";
  if (room.scene === "knowledge_moved") return "Choose the next move below";
  return null;
}
