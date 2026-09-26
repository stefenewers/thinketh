/**
 * Adaptive diagnostic selection v0: transparent multiplicative scoring.
 *
 *   priority = uncertainty × conceptImportance × userInterest × freshness × prerequisiteCentrality
 *
 * Each factor is in (0, 1]; every factor is returned as debug metadata so the
 * app can show why a question was chosen. This is a heuristic ranking, not
 * expected-information-gain or Bayesian inference.
 */
import type { Concept, ConceptEdge, Development, DiagnosticQuestion, KnowledgeState, SelectionDebug, PersonaProfile } from "../contracts.ts";
import type { DiagnosticItem } from "../seed/types.ts";
import { daysBetween, round } from "../util.ts";
import { effectiveUncertainty } from "./knowledgeState.ts";

export const DEFAULT_INTEREST = 0.3;
export const FRESHNESS_FLOOR = 0.3;
export const FRESHNESS_HALF_LIFE_DAYS = 7;

export type ScoredConcept = SelectionDebug & { conceptId: string; conceptName: string };

export function interestFor(conceptId: string, profile: PersonaProfile): number {
  let best = DEFAULT_INTEREST;
  for (const i of profile.interests) if (i.conceptIds.includes(conceptId)) best = Math.max(best, i.weight);
  return best;
}

/** 1.0 if the concept is in the development being read; otherwise decays with the age of its latest development. */
export function freshnessFor(conceptId: string, developments: Development[], now: Date, contextDevelopment?: Development): number {
  if (contextDevelopment?.conceptIds.includes(conceptId)) return 1;
  let latest: number | undefined;
  for (const d of developments) {
    if (!d.conceptIds.includes(conceptId)) continue;
    const age = daysBetween(d.happenedAt, now);
    latest = latest === undefined ? age : Math.min(latest, age);
  }
  if (latest === undefined) return FRESHNESS_FLOOR;
  return Math.max(FRESHNESS_FLOOR, 0.5 ** (latest / FRESHNESS_HALF_LIFE_DAYS));
}

/**
 * Weighted degree in the concept graph, normalized to [0.5, 1]. Being a
 * prerequisite of other concepts counts 1.5× because a gap there blocks more.
 */
export function centralityScores(concepts: Concept[], edges: ConceptEdge[]): Map<string, number> {
  const degree = new Map<string, number>(concepts.map((c) => [c.id, 0]));
  for (const e of edges) {
    const fromBoost = e.type === "prerequisite" ? 1.5 : 1;
    degree.set(e.fromConceptId, (degree.get(e.fromConceptId) ?? 0) + e.weight * fromBoost);
    degree.set(e.toConceptId, (degree.get(e.toConceptId) ?? 0) + e.weight);
  }
  const max = Math.max(...degree.values(), 1e-9);
  return new Map([...degree].map(([id, d]) => [id, 0.5 + 0.5 * (d / max)]));
}

export function scoreConcepts(input: {
  candidateConceptIds: string[];
  concepts: Concept[];
  edges: ConceptEdge[];
  states: Map<string, KnowledgeState>;
  profile: PersonaProfile;
  developments: Development[];
  contextDevelopment?: Development;
  now: Date;
}): ScoredConcept[] {
  const byId = new Map(input.concepts.map((c) => [c.id, c]));
  const centrality = centralityScores(input.concepts, input.edges);
  const scored: ScoredConcept[] = [];
  for (const conceptId of input.candidateConceptIds) {
    const concept = byId.get(conceptId);
    const state = input.states.get(conceptId);
    if (!concept || !state) continue;
    const uncertainty = effectiveUncertainty(state, input.now).value;
    const importance = concept.importance;
    const interest = interestFor(conceptId, input.profile);
    const freshness = freshnessFor(conceptId, input.developments, input.now, input.contextDevelopment);
    const prerequisiteCentrality = centrality.get(conceptId) ?? 0.5;
    const priority = uncertainty * importance * interest * freshness * prerequisiteCentrality;
    scored.push({
      conceptId,
      conceptName: concept.name,
      uncertainty: round(uncertainty),
      importance: round(importance),
      interest: round(interest),
      freshness: round(freshness),
      prerequisiteCentrality: round(prerequisiteCentrality),
      priority: round(priority, 4),
    });
  }
  return scored.sort((a, b) => b.priority - a.priority);
}

export function explainSelection(top: ScoredConcept, state: KnowledgeState | undefined): string {
  const traits: string[] = [];
  if (top.uncertainty >= 0.35) traits.push("high-uncertainty");
  else if (top.uncertainty >= 0.2) traits.push("still uncertain");
  else traits.push("due for a check");

  const central = top.prerequisiteCentrality >= 0.85;
  const followed = top.interest >= 0.9;
  if (central && followed) traits.push("central to topics you're following");
  else if (followed) traits.push("part of topics you're following");
  else if (central) traits.push("a foundation for other concepts");
  else if (top.freshness >= 1) traits.push("featured in this development");

  let line = `Chosen because ${top.conceptName} is ${traits.join(" and ")}.`;
  if (state && state.misconceptionFlags.length > 0) line += " It also checks a misconception you've shown before.";
  return line;
}

/** Choose a question for a concept: unanswered first, then ones probing a known misconception, then multiple choice. */
export function pickItem(
  conceptId: string,
  bank: DiagnosticItem[],
  state: KnowledgeState | undefined,
  answeredIds: Set<string>,
): DiagnosticItem | undefined {
  const items = bank.filter((q) => q.conceptId === conceptId);
  if (items.length === 0) return undefined;
  const score = (q: DiagnosticItem) =>
    (answeredIds.has(q.id) ? 0 : 4) +
    (q.targetsMisconception && state?.misconceptionFlags.includes(q.targetsMisconception) ? 2 : 0) +
    (q.type === "multiple_choice" ? 1 : 0);
  return [...items].sort((a, b) => score(b) - score(a))[0];
}

export function toPublicQuestion(item: DiagnosticItem, debug?: SelectionDebug): DiagnosticQuestion {
  return {
    id: item.id,
    conceptId: item.conceptId,
    prompt: item.prompt,
    type: item.type,
    ...(item.choices ? { choices: item.choices } : {}),
    expectedConcepts: item.expectedConcepts,
    rationale: item.rationale,
    ...(debug ? { selectionDebug: debug } : {}),
  };
}
