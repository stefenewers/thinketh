/**
 * Deterministic, explainable knowledge-state update.
 *
 * This is a transparent heuristic estimator, not full Bayesian inference:
 *
 *   U_eff  = min(0.95, U + STALENESS_PER_DAY × daysSinceLastObserved)
 *   target = correctness            (demonstrated evidence)
 *          = ceiling                (undemonstrated evidence; never above it)
 *   Δm     = LEARNING_RATE × U_eff × weight × (target − m)
 *   U'     = max(U_FLOOR, U_eff × (1 − information))
 *
 * Mastery moves more when we are unsure (high U_eff) and when the evidence is
 * strong (high weight). Diagnostics carry ~7× the weight of "Got it" and cut
 * uncertainty ~10× more. One-hop propagation along the concept graph applies
 * only to demonstrated evidence.
 */
import type {
  Concept,
  ConceptEdge,
  KnowledgeObservation,
  KnowledgeState,
  KnowledgeStateTransition,
  PropagatedChange,
} from "../contracts.ts";
import { MISCONCEPTIONS } from "../seed/misconceptions.ts";
import { clamp01, daysBetween, newId, round } from "../util.ts";
import { OBSERVATION_RULES, makeObservation } from "./observations.ts";

export const LEARNING_RATE = 0.35;
export const STALENESS_PER_DAY = 0.004;
export const UNCERTAINTY_FLOOR = 0.05;
export const UNCERTAINTY_CEILING = 0.95;
/** Share of a mastery change passed to a prerequisite / dependent concept (× edge weight). */
export const PREREQUISITE_PROPAGATION = 0.5;
/** Share passed along related / supports / part_of edges (× edge weight). */
export const ASSOCIATIVE_PROPAGATION = 0.25;
/** Ignore propagated changes smaller than this. */
const PROPAGATION_EPSILON = 0.002;

export type UpdateOptions = {
  /** Misconception revealed by this observation (e.g. a chosen distractor). */
  addMisconception?: string;
  /** Misconception disproved by this observation (a correct answer on a probing question). */
  clearMisconception?: string;
  /** Short phrase describing the evidence, e.g. "a transfer question about …". */
  evidencePhrase?: string;
};

export type StateUpdate = {
  after: KnowledgeState;
  deltaMastery: number;
  deltaUncertainty: number;
  staleness: number;
};

export function effectiveUncertainty(state: KnowledgeState, now: Date): { value: number; staleness: number } {
  const staleness = STALENESS_PER_DAY * daysBetween(state.lastObservedAt, now);
  return { value: Math.min(UNCERTAINTY_CEILING, state.uncertainty + staleness), staleness };
}

/** Apply one observation to one concept's state. Pure. */
export function applyObservation(
  state: KnowledgeState,
  observation: KnowledgeObservation,
  now: Date,
  options: UpdateOptions = {},
): StateUpdate {
  const rule = OBSERVATION_RULES[observation.kind];
  const { value: uEff, staleness } = effectiveUncertainty(state, now);
  const m = state.mastery;

  let deltaMastery: number;
  if (rule.demonstrated) {
    const target = observation.correctness ?? 0.5;
    deltaMastery = LEARNING_RATE * uEff * observation.weight * (target - m);
  } else {
    const ceiling = rule.ceiling ?? 0.5;
    // Undemonstrated signals only pull up toward the ceiling, never down, never past it.
    deltaMastery = m >= ceiling ? 0 : LEARNING_RATE * uEff * observation.weight * (ceiling - m);
  }
  const mastery = round(clamp01(m + deltaMastery));

  const uncertainty = round(Math.min(UNCERTAINTY_CEILING, Math.max(UNCERTAINTY_FLOOR, uEff * (1 - rule.information))));

  const confidenceTarget = rule.demonstrated ? (observation.correctness ?? 0.5) : (rule.confidenceTarget ?? state.confidence);
  const confidence = round(clamp01(state.confidence + rule.confidenceShift * (confidenceTarget - state.confidence)));

  let flags = [...state.misconceptionFlags];
  if (options.clearMisconception) flags = flags.filter((f) => f !== options.clearMisconception);
  if (options.addMisconception && !flags.includes(options.addMisconception)) flags.push(options.addMisconception);

  const after: KnowledgeState = {
    ...state,
    mastery,
    confidence,
    uncertainty,
    evidenceCount: state.evidenceCount + 1,
    lastObservedAt: observation.createdAt,
    misconceptionFlags: flags,
  };
  return {
    after,
    deltaMastery: round(mastery - m),
    deltaUncertainty: round(uncertainty - state.uncertainty),
    staleness,
  };
}

const fmt = (x: number) => x.toFixed(2);

export function explainUpdate(input: {
  concept: Concept;
  before: KnowledgeState;
  after: KnowledgeState;
  observation: KnowledgeObservation;
  staleness: number;
  options: UpdateOptions;
}): string {
  const { concept, before, after, observation, options } = input;
  const rule = OBSERVATION_RULES[observation.kind];
  const parts: string[] = [];

  const evidence = options.evidencePhrase ? ` ${options.evidencePhrase}` : "";
  switch (observation.kind) {
    case "diagnostic_correct":
      parts.push(`Updated because you correctly answered${evidence || ` a question on ${concept.name}`}.`);
      break;
    case "diagnostic_partial":
      parts.push(`Updated because you partially answered${evidence || ` a question on ${concept.name}`}.`);
      break;
    case "diagnostic_incorrect":
      parts.push(`Updated because you missed${evidence || ` a question on ${concept.name}`}.`);
      break;
    default:
      parts.push(`Updated because you ${rule.label}.`);
  }

  const mChange = after.mastery - before.mastery;
  const uChange = after.uncertainty - before.uncertainty;
  const movement =
    Math.abs(mChange) < 0.005
      ? `Mastery held at ${fmt(after.mastery)}`
      : `Mastery ${mChange > 0 ? "rose" : "fell"} ${fmt(before.mastery)} → ${fmt(after.mastery)}`;
  const certainty =
    Math.abs(uChange) < 0.005
      ? "uncertainty is unchanged"
      : `uncertainty ${uChange < 0 ? "fell" : "rose"} ${fmt(before.uncertainty)} → ${fmt(after.uncertainty)}`;
  parts.push(`${movement} and ${certainty}.`);

  if (rule.demonstrated) {
    parts.push(
      `Diagnostic evidence is weighted ${observation.weight.toFixed(2)}, versus ${OBSERVATION_RULES.got_it.weight.toFixed(2)} for “Got it”, because it shows understanding rather than reporting it.`,
    );
  } else if (rule.ceiling !== undefined && before.mastery >= rule.ceiling) {
    parts.push(
      `Self-reports and reading can't raise mastery above ${fmt(rule.ceiling)} on their own. A diagnostic question is needed to show more.`,
    );
  } else {
    parts.push(`This is a light signal (weight ${observation.weight.toFixed(2)}): it can't show understanding by itself.`);
  }

  const describe = (flag: string) => MISCONCEPTIONS[flag] ?? flag;
  if (options.clearMisconception && before.misconceptionFlags.includes(options.clearMisconception)) {
    parts.push(`It also cleared an earlier misconception: ${describe(options.clearMisconception)}.`);
  }
  if (options.addMisconception && !before.misconceptionFlags.includes(options.addMisconception)) {
    parts.push(`Your answer suggests a specific misconception, now flagged: ${describe(options.addMisconception)}.`);
  }
  if (observation.kind === "diagnostic_incorrect" && before.confidence - before.mastery > 0.2) {
    parts.push("You felt fairly confident here, so this is useful calibration.");
  }
  if (input.staleness >= 0.01) {
    parts.push(`Uncertainty had drifted up by ${fmt(input.staleness)} since the concept was last observed.`);
  }
  return parts.join(" ");
}

export type Graph = { concepts: Map<string, Concept>; edges: ConceptEdge[] };

type PropagationTarget = { conceptId: string; factor: number; reason: string };

function propagationTargets(conceptId: string, deltaMastery: number, graph: Graph): PropagationTarget[] {
  const name = (id: string) => graph.concepts.get(id)?.name ?? id;
  const targets: PropagationTarget[] = [];
  for (const e of graph.edges) {
    if (e.fromConceptId !== conceptId && e.toConceptId !== conceptId) continue;
    const other = e.fromConceptId === conceptId ? e.toConceptId : e.fromConceptId;
    if (e.type === "contrasts") continue;
    if (e.type === "prerequisite") {
      // Showing the dependent concept is evidence for its prerequisite; failing a
      // prerequisite is evidence against what depends on it.
      if (e.toConceptId === conceptId && deltaMastery > 0) {
        targets.push({
          conceptId: other,
          factor: PREREQUISITE_PROPAGATION * e.weight,
          reason: `${name(other)} is a prerequisite of ${name(conceptId)}, so showing ${name(conceptId)} is partial evidence for it.`,
        });
      } else if (e.fromConceptId === conceptId && deltaMastery < 0) {
        targets.push({
          conceptId: other,
          factor: PREREQUISITE_PROPAGATION * e.weight,
          reason: `${name(conceptId)} is a prerequisite of ${name(other)}, so a gap here weakens the estimate for ${name(other)}.`,
        });
      }
    } else {
      targets.push({
        conceptId: other,
        factor: ASSOCIATIVE_PROPAGATION * e.weight,
        reason: `${name(other)} is ${e.type === "part_of" ? "structurally linked" : "closely related"} to ${name(conceptId)}.`,
      });
    }
  }
  return targets;
}

export type TransitionResult = {
  transition: KnowledgeStateTransition;
  /** One transition per propagated concept, so its history shows the change too. */
  propagatedTransitions: KnowledgeStateTransition[];
  /** Every state that changed, primary first. */
  updatedStates: KnowledgeState[];
};

/**
 * Apply an observation, propagate one hop through the concept graph, and
 * return fully explained transitions. Pure: the caller persists the result.
 */
export function transition(input: {
  states: Map<string, KnowledgeState>;
  observation: KnowledgeObservation;
  graph: Graph;
  now: Date;
  options?: UpdateOptions;
}): TransitionResult {
  const { observation, graph, now } = input;
  const options = input.options ?? {};
  const before = input.states.get(observation.conceptId);
  const concept = graph.concepts.get(observation.conceptId);
  if (!before || !concept) throw new Error(`Unknown concept state: ${observation.conceptId}`);

  const update = applyObservation(before, observation, now, options);
  const reason = explainUpdate({ concept, before, after: update.after, observation, staleness: update.staleness, options });

  const rule = OBSERVATION_RULES[observation.kind];
  const propagatedChanges: PropagatedChange[] = [];
  const propagatedTransitions: KnowledgeStateTransition[] = [];
  const updatedStates: KnowledgeState[] = [update.after];
  const transitionId = newId("kst");

  if (rule.demonstrated && update.deltaMastery !== 0) {
    for (const target of propagationTargets(observation.conceptId, update.deltaMastery, graph)) {
      const other = input.states.get(target.conceptId);
      if (!other) continue;
      const deltaMastery = round(update.deltaMastery * target.factor);
      if (Math.abs(deltaMastery) < PROPAGATION_EPSILON) continue;
      const deltaUncertainty = round(-other.uncertainty * rule.information * target.factor);
      const after: KnowledgeState = {
        ...other,
        mastery: round(clamp01(other.mastery + deltaMastery)),
        uncertainty: round(Math.max(UNCERTAINTY_FLOOR, other.uncertainty + deltaUncertainty)),
        lastObservedAt: observation.createdAt,
      };
      propagatedChanges.push({ conceptId: target.conceptId, deltaMastery, deltaUncertainty, reason: target.reason });
      updatedStates.push(after);

      const derived = makeObservation({
        userId: observation.userId,
        conceptId: target.conceptId,
        kind: observation.kind,
        ...(observation.correctness !== undefined ? { correctness: observation.correctness } : {}),
        sourceRef: `propagated:${transitionId}`,
        now,
        weightScale: target.factor,
      });
      propagatedTransitions.push({
        id: newId("kst"),
        userId: observation.userId,
        conceptId: target.conceptId,
        before: other,
        observation: derived,
        after,
        reason: `Propagated from ${concept.name}: ${target.reason} Mastery ${fmt(other.mastery)} → ${fmt(after.mastery)}.`,
        propagatedChanges: [],
        createdAt: observation.createdAt,
      });
    }
  }

  return {
    transition: {
      id: transitionId,
      userId: observation.userId,
      conceptId: observation.conceptId,
      before,
      observation,
      after: update.after,
      reason,
      propagatedChanges,
      createdAt: observation.createdAt,
    },
    propagatedTransitions,
    updatedStates,
  };
}

export function knowledgeLevel(state: KnowledgeState): "strong" | "intermediate" | "developing" | "weak" {
  if (state.mastery >= 0.75) return "strong";
  if (state.mastery >= 0.55) return "intermediate";
  if (state.mastery >= 0.4) return "developing";
  return "weak";
}
