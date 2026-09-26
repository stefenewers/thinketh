/**
 * Session planner: given the collaborative delta and a time budget, which valid learning moves are
 * worth the time? Deterministic. Muse conducts the plan; it cannot replace it.
 *
 * Value comes only from the delta's own evidence-based score:
 *   peer teaching: gap x teacher certainty x (verified ? 1 : 0.8) x (0.5 + importance)
 *   shared gap:    (1 - best mastery) x (0.5 + importance)
 * A peer move is a candidate only if Thinketh can verify the learning afterwards (assessable).
 * Durations are planning estimates, not predictions.
 */
import { topicLabel, type CollaborativeDelta, type CollaborativeDeltaItem, type SessionPlan, type SessionPlanItem } from "../contracts.ts";

/** Planning estimates (minutes). One place, so nothing else carries magic durations. */
export const ACTIVITY_MINUTES = {
  /** Teacher explains, learner answers a transfer challenge, Thinketh grades. */
  peer_teach: 2.5,
  /** Muse teaches a concept neither Mind has strong evidence on. */
  shared_gap: 2,
  /** One source, read against both Minds. */
  resource: 2,
} as const;

export const DEFAULT_BUDGET_MINUTES = 7;

/** A shared source is always available (the known-safe default) but worth less than verified learning. */
const RESOURCE_VALUE = 0.15;

type Candidate = Omit<SessionPlanItem, "priority" | "done"> & { value: number; order: number };

const TYPE_ORDER: Record<SessionPlanItem["type"], number> = { peer_teach: 0, shared_gap: 1, resource: 2 };

function peerRationale(item: CollaborativeDeltaItem, delta: CollaborativeDelta, names: Record<string, string>): string {
  const teacher = names[item.teacherId!] ?? "Your peer";
  const learner = names[item.learnerId!] ?? "the other Mind";
  const t = item.teacherId === delta.aId ? item.a : item.b;
  const l = item.learnerId === delta.aId ? item.a : item.b;
  const evidence = t.verified ? "strong verified evidence" : "stronger recent evidence";
  const need = l.mastery < 0.35 ? "is only starting out" : "is still uncertain";
  return `${teacher} has ${evidence} on ${topicLabel(item.conceptId, item.conceptName.toLowerCase())} while ${learner} ${need}.`;
}

export function planSession(input: {
  delta: CollaborativeDelta;
  names: Record<string, string>;
  /** Can Thinketh verify learning of this concept after peer teaching? */
  assessable: (conceptId: string) => boolean;
  budgetMinutes?: number;
}): SessionPlan {
  const budget = input.budgetMinutes ?? DEFAULT_BUDGET_MINUTES;
  if (!(budget > 0)) throw new Error("budget must be a positive number of minutes");
  const { delta, names } = input;
  const candidates: Candidate[] = [];

  // Peer teaching: the best assessable move in each direction (so both Minds get to teach).
  const byScore = (x: CollaborativeDeltaItem, y: CollaborativeDeltaItem) => y.score - x.score || x.conceptId.localeCompare(y.conceptId);
  for (const dir of [delta.bTeachesA, delta.aTeachesB]) {
    const best = [...dir].sort(byScore).find((i) => i.teacherId && i.learnerId && input.assessable(i.conceptId));
    if (!best) continue;
    candidates.push({
      id: `peer:${best.conceptId}:${best.teacherId}`,
      type: "peer_teach",
      conceptId: best.conceptId,
      conceptName: best.conceptName,
      teacherId: best.teacherId!,
      learnerId: best.learnerId!,
      estimatedMinutes: ACTIVITY_MINUTES.peer_teach,
      rationale: peerRationale(best, delta, names),
      value: best.score,
      order: 0,
    });
  }

  const gap = [...delta.sharedGaps].sort(byScore)[0];
  if (gap) {
    candidates.push({
      id: `gap:${gap.conceptId}`,
      type: "shared_gap",
      conceptId: gap.conceptId,
      conceptName: gap.conceptName,
      estimatedMinutes: ACTIVITY_MINUTES.shared_gap,
      rationale: "Neither of you has strong evidence here yet, so Muse teaches it to both.",
      value: gap.score,
      order: 1,
    });
  }

  candidates.push({
    id: "resource",
    type: "resource",
    estimatedMinutes: ACTIVITY_MINUTES.resource,
    rationale: "One source, read against both Minds: a different delta for each.",
    value: RESOURCE_VALUE,
    order: 2,
  });

  // Highest value first while it fits; then run them in a teachable order.
  const chosen: Candidate[] = [];
  let used = 0;
  for (const c of [...candidates].sort((x, y) => y.value - x.value || x.id.localeCompare(y.id))) {
    if (used + c.estimatedMinutes <= budget + 1e-9) {
      chosen.push(c);
      used += c.estimatedMinutes;
    }
  }
  chosen.sort((x, y) => TYPE_ORDER[x.type] - TYPE_ORDER[y.type] || y.value - x.value || x.id.localeCompare(y.id));
  return {
    budgetMinutes: budget,
    estimatedMinutes: Math.round(used * 10) / 10,
    items: chosen.map(({ value: _v, order: _o, ...item }, i) => ({ ...item, priority: i + 1, done: false })),
  };
}

/** The next plan item still to do, in order. */
export const nextPlanItem = (plan: SessionPlan | undefined) => plan?.items.find((i) => !i.done);
