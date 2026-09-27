/**
 * Agent-prepared exchanges (Playground). When Thinketh finds a valid teaching
 * opportunity, the teacher's agent drafts an explanation for the learner's gap.
 *
 * Grounding is enforced here, not trusted: the agent may only use materials the
 * service hands it (shared corpus claims, plus the teacher's saved sources when
 * they chose to share them), and every point it makes must cite one of them.
 * Points that cite nothing are dropped; a draft left with no grounded point is
 * rejected, and the room falls back to the person explaining in their own words.
 *
 * Nothing here observes anything: preparing, reading or delivering a lesson
 * never changes a knowledge state. Only the learner's graded transfer answer does.
 */
import type { Concept, KnowledgeLevel } from "../contracts.ts";

export type ExchangeMaterial = {
  /** Short handle the model cites ("m1"). */
  ref: string;
  text: string;
  sourceId: string;
  via: "corpus" | "shared_resource";
  /** A claim that pushes back on the rest. */
  challenges?: boolean;
};

export type ExchangeGap = { level: KnowledgeLevel; verified: boolean; hasMisconception: boolean };

export type ExchangeContext = {
  concept: Concept;
  teacherName: string;
  learnerName: string;
  learnerGap: ExchangeGap;
  materials: ExchangeMaterial[];
};

export type ExchangeDraft = { explanation: string; points: Array<{ text: string; refs: string[] }> };

const MAX_EXPLANATION = 900;
const MAX_POINT = 280;
/** The model writes language, never numbers about a person. */
const KNOWLEDGE_NUMBER = /\b(mastery|uncertainty|confidence)\b[^.]{0,20}\d/i;

/** How to pitch it, from the learner's shared snapshot only (level and whether it was ever verified). */
export function pitchFor(gap: ExchangeGap): string {
  if (gap.level === "weak" || (!gap.verified && gap.level === "developing")) return "Start from the core idea and one concrete example; assume little.";
  if (gap.level === "developing") return "Skip the basics; focus on the mechanism and where it breaks.";
  return "Focus on the one distinction that matters most.";
}

/** Clean and bound a model draft; returns the problem when it can't be used. */
export function validateExchange(draft: ExchangeDraft, ctx: ExchangeContext): { draft: ExchangeDraft } | { problem: string } {
  const refs = new Set(ctx.materials.map((m) => m.ref));
  const explanation = draft.explanation.trim().slice(0, MAX_EXPLANATION);
  if (!explanation) return { problem: "empty explanation" };
  if (KNOWLEDGE_NUMBER.test(explanation)) return { problem: "states a knowledge number" };
  const points = draft.points
    .map((p) => ({ text: p.text.trim().slice(0, MAX_POINT), refs: [...new Set(p.refs.filter((r) => refs.has(r)))] }))
    .filter((p) => p.text && p.refs.length > 0 && !KNOWLEDGE_NUMBER.test(p.text))
    .slice(0, 4);
  if (points.length === 0) return { problem: "no point cites the provided sources" };
  return { draft: { explanation, points } };
}

/** Grounded by construction: the materials' own words, ordered for the learner's gap. */
export function deterministicExchange(ctx: ExchangeContext): ExchangeDraft {
  const supporting = ctx.materials.filter((m) => !m.challenges);
  const nuance = ctx.materials.find((m) => m.challenges);
  const chosen = [...supporting.slice(0, ctx.learnerGap.level === "weak" ? 2 : 3), ...(nuance ? [nuance] : [])];
  const lead =
    ctx.learnerGap.level === "weak" || !ctx.learnerGap.verified
      ? `The core idea: ${ctx.concept.description.replace(/\.$/, "")}.`
      : `The part worth getting exactly right about ${ctx.concept.name.toLowerCase()}:`;
  return {
    explanation: [lead, ...chosen.map((m) => (m.challenges ? `One caution: ${m.text}` : m.text))].join(" ").slice(0, MAX_EXPLANATION),
    points: chosen.map((m) => ({ text: m.challenges ? `Caution: ${m.text}` : m.text, refs: [m.ref] })),
  };
}
