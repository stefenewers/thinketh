/**
 * Diagnostic answer evaluation. Multiple choice is fully deterministic. Short
 * answers are graded against a rubric of key ideas: Claude (when available)
 * judges which ideas are present, but correctness is always computed here as
 * ideasCovered / ideasTotal.
 */
import type { DiagnosticItem } from "../seed/types.ts";
import { round } from "../util.ts";

export class InvalidAnswerError extends Error {}

export type Evaluation = {
  correctness: number;
  feedback: string;
  misconception?: string;
  chosenIndex?: number;
};

export function resolveChoiceIndex(item: DiagnosticItem, answer: string): number {
  const choices = item.choices ?? [];
  const trimmed = answer.trim();
  if (/^\d+$/.test(trimmed)) {
    const i = Number(trimmed);
    if (i >= 0 && i < choices.length) return i;
  }
  if (/^[A-Za-z]$/.test(trimmed)) {
    const i = trimmed.toUpperCase().charCodeAt(0) - 65;
    if (i >= 0 && i < choices.length) return i;
  }
  const i = choices.findIndex((c) => c.trim().toLowerCase() === trimmed.toLowerCase());
  if (i >= 0) return i;
  throw new InvalidAnswerError(`Answer does not match any choice for ${item.id}. Send the choice text or its 0-based index.`);
}

export function evaluateMultipleChoice(item: DiagnosticItem, answer: string): Evaluation {
  const index = resolveChoiceIndex(item, answer);
  const correctness = item.choiceCorrectness?.[index] ?? 0;
  const misconception = item.choiceMisconception?.[index] ?? undefined;
  return {
    correctness,
    feedback: item.choiceFeedback?.[index] ?? (correctness >= 0.8 ? "Correct." : "Not quite."),
    chosenIndex: index,
    ...(misconception ? { misconception } : {}),
  };
}

/** Correctness from which rubric ideas were covered (indices into item.rubric). */
export function scoreRubric(item: DiagnosticItem, coveredIdeaIndices: number[]): { correctness: number; missing: string[] } {
  const rubric = item.rubric ?? [];
  if (rubric.length === 0) return { correctness: 0, missing: [] };
  const covered = new Set(coveredIdeaIndices.filter((i) => i >= 0 && i < rubric.length));
  return {
    correctness: round(covered.size / rubric.length, 2),
    missing: rubric.filter((_, i) => !covered.has(i)).map((r) => r.idea),
  };
}

/** Deterministic keyword fallback for short answers. */
export function evaluateShortAnswerKeywords(item: DiagnosticItem, answer: string): Evaluation {
  const text = answer.toLowerCase();
  const covered = (item.rubric ?? []).flatMap((r, i) => (r.keywords.some((k) => text.includes(k.toLowerCase())) ? [i] : []));
  const { correctness, missing } = scoreRubric(item, covered);
  const feedback =
    missing.length === 0
      ? "You covered the key ideas."
      : `You covered ${covered.length} of ${item.rubric?.length ?? 0} key ideas. Missing: ${missing.join("; ")}.`;
  return { correctness, feedback };
}
