/**
 * Transfer challenges for peer teaching: after a peer explains a concept, the learner applies it in
 * a NEW context. A challenge is assessment structure only (prompt + rubric). Grading, the
 * observation and the state transition all go through the ordinary diagnostic evidence path.
 *
 * Pure: validation of model output, and a deterministic fallback grounded only in data Thinketh
 * already owns (the concept's definition and the claims attached to it). If there isn't enough
 * grounding for a fair rubric, there is no challenge, and the concept is not assessable (fail closed).
 */
import { topicLabel, type Claim, type Concept } from "../contracts.ts";
import { firstSentence } from "../util.ts";

export type TransferContext = {
  concept: Concept;
  relatedConcepts: Concept[];
  claims: Claim[];
  /** The teacher's explanation, if already given. Data, never instructions. */
  teacherExplanation?: string;
};

/** Thinketh can't build a fair, grounded challenge for this concept: don't assign it. */
export class TransferNotAssessableError extends Error {
  constructor(conceptId: string) {
    super(`No grounded transfer challenge for ${conceptId}`);
  }
}

export type TransferRubricIdea = { idea: string; keywords: string[] };

export type TransferDraft = {
  prompt: string;
  applicationContext: string;
  rationale: string;
  rubric: TransferRubricIdea[];
  expectedConcepts: string[];
};

export const TRANSFER_LIMITS = {
  promptMin: 20,
  promptMax: 320,
  contextMax: 120,
  ideasMin: 3,
  ideasMax: 5,
  ideaMax: 200,
  keywordsMin: 2,
  keywordsMax: 10,
  keywordMax: 40,
} as const;

/** New contexts a learner can apply an agent-systems concept to. Chosen deterministically per concept. */
export const APPLICATION_CONTEXTS = [
  "an autonomous coding agent that edits a large repository over several days",
  "a customer-support agent that handles thousands of conversations a week",
  "a research assistant that reads and summarizes hundreds of papers",
  "an operations agent that watches production alerts overnight",
  "a personal assistant that plans travel across many apps",
] as const;

const STOP = new Set(
  "about after again against also among an and another any are as at be because been before being between both but by can could does doing during each even every for from further had has have having here how into is it its itself just less like made make many may more most much must need needs not now of off often on once one only or other our out over own per rather same should since so some such than that the their them then there these they this those through thus to too under until up upon very was way ways were what when where whether which while who whom why will with within without would yet you your".split(" "),
);

const words = (s: string) => s.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) ?? [];

/** Distinctive terms of a sentence (not stopwords, not the concept's own name), longest first. */
function groundingTerms(text: string, exclude: Set<string>, max = 5): string[] {
  const seen = new Set<string>();
  return words(text)
    .filter((w) => w.length >= 4 && !STOP.has(w) && !exclude.has(w) && !seen.has(w) && (seen.add(w), true))
    .sort((a, b) => b.length - a.length || a.localeCompare(b))
    .slice(0, max);
}

function hashIndex(id: string, n: number): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % n;
}

/** Deterministic context for a concept: stable per concept, never the concept's own subject. */
export function applicationContextFor(concept: Concept): string {
  const own = new Set(words(concept.name));
  const options = APPLICATION_CONTEXTS.filter((c) => !words(c).some((w) => own.has(w)));
  const list = options.length ? options : [...APPLICATION_CONTEXTS];
  return list[hashIndex(concept.id, list.length)]!;
}

/**
 * The conservative fallback: an application prompt, and rubric ideas taken from the concept's own
 * definition and the claims Thinketh holds about it. Null when fewer than three grounded ideas exist.
 */
export function groundedFallback(ctx: TransferContext): TransferDraft | null {
  const exclude = new Set(words(ctx.concept.name));
  const ideas: TransferRubricIdea[] = [];
  const add = (idea: string) => {
    const keywords = groundingTerms(idea, exclude);
    if (keywords.length >= TRANSFER_LIMITS.keywordsMin && ideas.length < 4) ideas.push({ idea: idea.slice(0, TRANSFER_LIMITS.ideaMax), keywords });
  };
  add(firstSentence(ctx.concept.description));
  for (const c of ctx.claims) add(firstSentence(c.text));
  if (ideas.length < TRANSFER_LIMITS.ideasMin) return null;
  const context = applicationContextFor(ctx.concept);
  const topic = topicLabel(ctx.concept.id, ctx.concept.name);
  return {
    // Plain wording for the learner (presentation only); the rubric stays grounded and precise.
    prompt: `Picture ${context}. Using what you just learned about ${topic}, what would you do differently, and why?`,
    applicationContext: context,
    rationale: `Using ${topic} in a new situation, not repeating the explanation, is what shows it transferred.`,
    rubric: ideas,
    expectedConcepts: [ctx.concept.id],
  };
}

/** Normalize model output before validation: trim, lowercase keywords, dedupe. */
export function sanitizeDraft(d: TransferDraft): TransferDraft {
  return {
    prompt: d.prompt.trim().replace(/\s+/g, " "),
    applicationContext: d.applicationContext.trim().replace(/\s+/g, " "),
    rationale: d.rationale.trim().replace(/\s+/g, " "),
    expectedConcepts: [...new Set(d.expectedConcepts)],
    rubric: d.rubric.map((r) => ({
      idea: r.idea.trim().replace(/\s+/g, " "),
      keywords: [...new Set(r.keywords.map((k) => k.trim().toLowerCase()).filter(Boolean))],
    })),
  };
}

/** Why a (generated) draft can't be used, or null. The rules the brief sets for a fair transfer challenge. */
export function validateTransferDraft(d: TransferDraft, ctx: TransferContext): string | null {
  const L = TRANSFER_LIMITS;
  if (d.prompt.length < L.promptMin || d.prompt.length > L.promptMax) return "prompt length";
  if (!d.applicationContext || d.applicationContext.length > L.contextMax) return "application context";
  if (d.rubric.length < L.ideasMin || d.rubric.length > L.ideasMax) return "rubric size";
  for (const r of d.rubric) {
    if (r.idea.length < 8 || r.idea.length > L.ideaMax) return "rubric idea length";
    if (r.keywords.length < L.keywordsMin || r.keywords.length > L.keywordsMax) return "rubric keywords count";
    if (r.keywords.some((k) => k.length < 2 || k.length > L.keywordMax)) return "rubric keyword length";
  }
  if (!d.expectedConcepts.includes(ctx.concept.id)) return "must assess the taught concept";
  const prompt = d.prompt.toLowerCase();
  // Must not reveal the answer: no rubric idea may appear in the prompt.
  if (d.rubric.some((r) => prompt.includes(r.idea.toLowerCase()))) return "prompt reveals a rubric idea";
  // Must not simply ask the learner to repeat the teacher.
  const teacher = (ctx.teacherExplanation ?? "").toLowerCase().replace(/\s+/g, " ");
  for (let i = 0; teacher.length >= 40 && i + 40 <= teacher.length; i += 20) {
    if (prompt.includes(teacher.slice(i, i + 40))) return "prompt copies the teacher's explanation";
  }
  if (/\b(repeat|restate|summari[sz]e what|what did .* (say|explain))\b/.test(prompt)) return "prompt asks for recall, not application";
  return null;
}

/** A concept can be peer-taught only if Thinketh can verify the learning afterwards. */
export function hasGroundedChallenge(ctx: TransferContext): boolean {
  return groundedFallback(ctx) !== null;
}
