import type { KnowledgeObservation, ObservationKind } from "../contracts.ts";
import { clamp01, newId } from "../util.ts";

/**
 * The observation model: how much each kind of signal tells us.
 *
 * weight       How strongly the observation pulls mastery toward its target.
 * information  Fraction of current uncertainty the observation removes.
 *              Negative means it *adds* uncertainty (e.g. a follow-up question
 *              reveals an open gap).
 * demonstrated True only when the user showed understanding (diagnostics).
 *              Self-reports and passive reading are never "demonstrated".
 * ceiling      Undemonstrated signals can never push mastery above this. This
 *              is what makes "Got it" different from a correct diagnostic.
 */
export type ObservationRule = {
  weight: number;
  information: number;
  demonstrated: boolean;
  ceiling?: number;
  /** How far self-reported confidence moves toward `confidenceTarget` (0..1). */
  confidenceShift: number;
  confidenceTarget?: number;
  label: string;
};

export const OBSERVATION_RULES: Record<ObservationKind, ObservationRule> = {
  viewed: { weight: 0.05, information: 0.01, demonstrated: false, ceiling: 0.5, confidenceShift: 0, label: "viewed a development" },
  revisited: { weight: 0.08, information: 0.02, demonstrated: false, ceiling: 0.5, confidenceShift: 0, label: "came back to it" },
  saved: { weight: 0.06, information: 0.01, demonstrated: false, ceiling: 0.5, confidenceShift: 0.05, confidenceTarget: 0.7, label: "saved it" },
  explained: { weight: 0.1, information: 0.02, demonstrated: false, ceiling: 0.55, confidenceShift: 0.05, confidenceTarget: 0.7, label: "read a deeper explanation" },
  asked_followup: { weight: 0.05, information: -0.03, demonstrated: false, ceiling: 0.5, confidenceShift: 0, label: "asked a follow-up question" },
  got_it: { weight: 0.15, information: 0.03, demonstrated: false, ceiling: 0.6, confidenceShift: 0.25, confidenceTarget: 0.8, label: "tapped “Got it”" },
  already_knew: { weight: 0.25, information: 0.05, demonstrated: false, ceiling: 0.65, confidenceShift: 0.35, confidenceTarget: 0.9, label: "said you already knew this" },
  diagnostic_correct: { weight: 1.0, information: 0.34, demonstrated: true, confidenceShift: 0.3, label: "answered a diagnostic correctly" },
  diagnostic_partial: { weight: 0.8, information: 0.25, demonstrated: true, confidenceShift: 0.3, label: "answered a diagnostic partially" },
  diagnostic_incorrect: { weight: 1.0, information: 0.3, demonstrated: true, confidenceShift: 0.3, label: "answered a diagnostic incorrectly" },
  misconception_detected: { weight: 0.6, information: 0.15, demonstrated: true, confidenceShift: 0.2, label: "showed a specific misconception" },
};

/** Correctness implied by kinds that don't carry an explicit score. */
const DEFAULT_CORRECTNESS: Partial<Record<ObservationKind, number>> = {
  diagnostic_correct: 1,
  diagnostic_partial: 0.5,
  diagnostic_incorrect: 0,
  misconception_detected: 0.2,
};

/** Map a graded correctness score to an observation kind. */
export function kindForCorrectness(correctness: number): ObservationKind {
  if (correctness >= 0.8) return "diagnostic_correct";
  if (correctness >= 0.4) return "diagnostic_partial";
  return "diagnostic_incorrect";
}

export function makeObservation(input: {
  userId: string;
  conceptId: string;
  kind: ObservationKind;
  correctness?: number;
  sourceRef?: string;
  now?: Date;
  weightScale?: number;
  /** A stable id (derived from an operation id) makes a retried observation findable instead of duplicated. */
  id?: string;
}): KnowledgeObservation {
  const rule = OBSERVATION_RULES[input.kind];
  const correctness = input.correctness ?? DEFAULT_CORRECTNESS[input.kind];
  return {
    id: input.id ?? newId("obs"),
    userId: input.userId,
    conceptId: input.conceptId,
    kind: input.kind,
    weight: rule.weight * (input.weightScale ?? 1),
    ...(correctness !== undefined ? { correctness: clamp01(correctness) } : {}),
    ...(input.sourceRef ? { sourceRef: input.sourceRef } : {}),
    createdAt: (input.now ?? new Date()).toISOString(),
  };
}
