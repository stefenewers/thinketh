/**
 * Delta engine: what is new *to this user* in a development.
 *
 * Deterministic. It compares the development's claims and concepts against
 * the user's KnowledgeState[] and the concept graph. Claude may later rephrase
 * the text fields, but the structure, the selected claims and the affected
 * concepts come from here.
 */
import type { Claim, Concept, ConceptEdge, DeltaExplanation, Development, KnowledgeState, UserProfile } from "@thinketh/contracts";
import { MISCONCEPTIONS } from "../seed/misconceptions.ts";
import type { DevelopmentMeta } from "../seed/types.ts";
import { knowledgeLevel } from "./knowledgeState.ts";
import { interestFor } from "./selection.ts";

export const KNOWN_MASTERY = 0.6;
const MAX_ALREADY_KNEW = 3;

export type DeltaInput = {
  userId: string;
  development: Development;
  meta: DevelopmentMeta | undefined;
  profile: UserProfile;
  states: Map<string, KnowledgeState>;
  concepts: Map<string, Concept>;
  edges: ConceptEdge[];
  claims: Map<string, Claim>;
  baselineClaimIds: Record<string, string[]>;
};

/** How much this concept is a personal gap worth focusing on (importance × interest × lack of mastery). */
function gapScore(conceptId: string, input: DeltaInput): number {
  const concept = input.concepts.get(conceptId);
  const state = input.states.get(conceptId);
  if (!concept || !state) return 0;
  return concept.importance * interestFor(conceptId, input.profile) * (1 - state.mastery);
}

export function focusConceptId(input: DeltaInput): string | undefined {
  return [...input.development.conceptIds].sort((a, b) => gapScore(b, input) - gapScore(a, input))[0];
}

const fmt = (x: number) => x.toFixed(2);

function affectedReason(concept: Concept, state: KnowledgeState, isFocus: boolean): string {
  const level = knowledgeLevel(state);
  const m = fmt(state.mastery);
  if (isFocus) return `Your biggest gap here (mastery ${m}, uncertainty ${fmt(state.uncertainty)}). This development changes it directly.`;
  switch (level) {
    case "strong":
      return `You're strong here (${m}), so this builds on what you already know.`;
    case "intermediate":
      return `Partially known (${m}). This extends it.`;
    case "developing":
      return `Still developing (${m}). This fills in part of the picture.`;
    default:
      return `New ground for you (${m}). This introduces it.`;
  }
}

export function computeDelta(input: DeltaInput): DeltaExplanation {
  const { development, meta, profile, states, concepts } = input;

  // Concepts considered "background" for this development: its own concepts plus their prerequisites.
  const background = new Set(development.conceptIds);
  for (const e of input.edges) {
    if (e.type === "prerequisite" && development.conceptIds.includes(e.toConceptId)) background.add(e.fromConceptId);
  }

  const alreadyKnew: string[] = [];
  const knownConcepts = [...background]
    .filter((id) => (states.get(id)?.mastery ?? 0) >= KNOWN_MASTERY)
    .sort((a, b) => (states.get(b)?.mastery ?? 0) - (states.get(a)?.mastery ?? 0));
  for (const id of knownConcepts) {
    for (const claimId of input.baselineClaimIds[id] ?? []) {
      const claim = input.claims.get(claimId);
      if (claim && !alreadyKnew.includes(claim.text)) alreadyKnew.push(claim.text);
      break; // one baseline claim per concept keeps the list varied
    }
    if (alreadyKnew.length >= MAX_ALREADY_KNEW) break;
  }

  const newClaimIds = meta?.newClaimIds ?? development.claimIds;
  const whatChanged = newClaimIds.flatMap((id) => {
    const c = input.claims.get(id);
    return c ? [c.text] : [];
  });
  if (meta?.nuanceClaimId) {
    const nuance = input.claims.get(meta.nuanceClaimId);
    if (nuance) whatChanged.push(`Nuance: ${nuance.text}`);
  }

  const focusId = focusConceptId(input);
  const focus = focusId ? concepts.get(focusId) : undefined;
  const focusState = focusId ? states.get(focusId) : undefined;
  let whyItMattersToYou = "This development touches topics you follow.";
  if (focus && focusState) {
    const interest = profile.interests.find((i) => i.conceptIds.includes(focus.id));
    const gap = `${focus.name} is one of your least certain areas (mastery ${fmt(focusState.mastery)}, uncertainty ${fmt(focusState.uncertainty)}).`;
    const sentences = [interest ? `You follow ${interest.label}, and ${gap}` : gap];
    const goal = profile.goals[0];
    if (goal) sentences.push(`It bears directly on your goal: “${goal}”.`);
    const flag = focusState.misconceptionFlags.find((f) => MISCONCEPTIONS[f]);
    if (flag) sentences.push(`It also challenges an assumption you've shown before: ${MISCONCEPTIONS[flag]}.`);
    whyItMattersToYou = sentences.join(" ");
  }

  const mentalModelChange = meta?.mentalModelShift.before
    ? `Before: ${meta.mentalModelShift.before} Now: ${meta.mentalModelShift.after}`
    : "This development does not change the underlying model much.";

  const affectedConcepts = [...development.conceptIds]
    .sort((a, b) => gapScore(b, input) - gapScore(a, input))
    .flatMap((id) => {
      const c = concepts.get(id);
      const s = states.get(id);
      return c && s ? [{ conceptId: id, reason: affectedReason(c, s, id === focusId) }] : [];
    });

  return {
    developmentId: development.id,
    userId: input.userId,
    whatHappened: development.summaryBullets,
    whyItMattersToYou,
    alreadyKnew,
    whatChanged,
    mentalModelChange,
    affectedConcepts,
  };
}
