/**
 * Deterministic IntelligenceModel: the always-available fallback. It returns
 * seeded content where it exists and simple, honest templates otherwise.
 */
import type { Claim, Concept, DeltaExplanation, DiagramSpec, MemoryAid, Source } from "../../contracts.ts";
import { evaluateShortAnswerKeywords } from "../../engine/evaluation.ts";
import type { DiagnosticItem } from "../../seed/types.ts";
import { newId } from "../../util.ts";
import type {
  AskContext,
  AskResult,
  DeltaPhrasingContext,
  IntelligenceModel,
  LearningContext,
  NormalizedDevelopment,
  RawSourceBundle,
  ShortAnswerGrade,
} from "../types.ts";

const firstSentence = (text: string) => (text.match(/[^.!?]+[.!?]/)?.[0] ?? text).trim();
const sentences = (text: string) => (text.match(/[^.!?]+[.!?]/g) ?? [text]).map((s) => s.trim()).filter((s) => s.length > 20);

const tokenize = (text: string) => new Set(text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);

export function lexicalScore(query: string, text: string): number {
  const q = tokenize(query);
  if (q.size === 0) return 0;
  const t = tokenize(text);
  let hits = 0;
  for (const w of q) if (t.has(w)) hits++;
  return hits / q.size;
}

function matchConcepts(text: string, concepts: Concept[]): string[] {
  const lower = text.toLowerCase();
  return concepts.filter((c) => lower.includes(c.name.toLowerCase()) || lower.includes(c.id.replace(/-/g, " "))).map((c) => c.id);
}

export class DeterministicModel implements IntelligenceModel {
  readonly name = "deterministic" as const;

  private readonly seeded: { diagrams: Record<string, DiagramSpec>; memoryAids: Record<string, MemoryAid> };

  constructor(seeded: { diagrams: Record<string, DiagramSpec>; memoryAids: Record<string, MemoryAid> }) {
    this.seeded = seeded;
  }

  async normalizeDevelopment(input: RawSourceBundle): Promise<NormalizedDevelopment> {
    const devId = newId("dev");
    const sources: Source[] = input.sources.map((s) => ({
      id: newId("src"),
      title: s.title,
      ...(s.url ? { url: s.url } : {}),
      sourceType: s.sourceType,
      ...(s.publisher ? { publisher: s.publisher } : {}),
      ...(s.publishedAt ? { publishedAt: s.publishedAt } : {}),
      credibility: s.credibility ?? 0.6,
    }));
    const allText = input.sources.map((s) => `${s.title}. ${s.text}`).join(" ");
    const conceptIds = matchConcepts(allText, input.knownConcepts);
    const claims: Claim[] = input.sources.flatMap((s, i) =>
      sentences(s.text)
        .slice(0, 2)
        .map((text) => ({
          id: newId("clm"),
          text,
          confidence: 0.5,
          sourceIds: [sources[i]!.id],
          conceptIds: matchConcepts(text, input.knownConcepts),
          stance: "neutral" as const,
        })),
    );
    const credibility = sources.reduce((a, s) => a + s.credibility, 0) / Math.max(1, sources.length);
    const dates = input.sources.map((s) => s.publishedAt).filter((d): d is string => !!d).sort();
    return {
      development: {
        id: devId,
        title: input.sources[0]?.title ?? "Untitled development",
        summaryBullets: input.sources.slice(0, 3).map((s) => firstSentence(s.text)),
        happenedAt: dates.at(-1) ?? new Date().toISOString(),
        significance: 0.5,
        novelty: 0.5,
        credibility,
        momentum: Math.min(1, 0.3 + 0.1 * sources.length),
        conceptIds,
        claimIds: claims.map((c) => c.id),
        sourceIds: sources.map((s) => s.id),
        storylineIds: [],
      },
      claims,
      sources,
      newConcepts: [],
      mentalModelShift: { before: "", after: "" },
    };
  }

  async explainDelta(input: DeltaPhrasingContext): Promise<DeltaExplanation> {
    return input.delta;
  }

  async generateDiagnostic(ctx: LearningContext): Promise<DiagnosticItem> {
    const distractors = ctx.relatedConcepts.filter((c) => c.id !== ctx.concept.id).slice(0, 3);
    const choices = [distractors[0]?.description, ctx.concept.description, ...distractors.slice(1).map((d) => d.description)].filter(
      (c): c is string => !!c,
    );
    return {
      id: newId("dq-gen"),
      conceptId: ctx.concept.id,
      type: "multiple_choice",
      prompt: `Which statement best describes ${ctx.concept.name}?`,
      choices,
      choiceCorrectness: choices.map((c) => (c === ctx.concept.description ? 1 : 0)),
      choiceFeedback: choices.map((c) =>
        c === ctx.concept.description ? "Right." : `That describes a related concept, not ${ctx.concept.name}.`,
      ),
      expectedConcepts: [ctx.concept.id],
      rationale: `A recognition check on ${ctx.concept.name}, built from the concept graph.`,
    };
  }

  async gradeShortAnswer(input: { item: DiagnosticItem; answer: string }): Promise<ShortAnswerGrade> {
    const text = input.answer.toLowerCase();
    const covered = (input.item.rubric ?? []).flatMap((r, i) => (r.keywords.some((k) => text.includes(k.toLowerCase())) ? [i] : []));
    return { coveredIdeaIndices: covered, feedback: evaluateShortAnswerKeywords(input.item, input.answer).feedback };
  }

  async makeItStick(ctx: LearningContext): Promise<MemoryAid> {
    const seeded = this.seeded.memoryAids[ctx.concept.id];
    if (seeded) return seeded;
    const related = ctx.relatedConcepts[0];
    return {
      conceptId: ctx.concept.id,
      analogy: `Treat ${ctx.concept.name} as one part of a larger machine. ${ctx.concept.description}`,
      memoryHook: `${ctx.concept.name}: ${ctx.concept.description.split(" ").slice(0, 8).join(" ")}…`,
      threeStepModel: [
        `What it is: ${firstSentence(ctx.concept.description)}`,
        related ? `What it connects to: ${related.name}.` : "What it connects to: the rest of the system.",
        `Why it matters now: ${ctx.claims[0]?.text ?? "it appears in today's developments."}`,
      ],
      recallQuestion: `In one sentence, what does ${ctx.concept.name} let an agent do that it couldn't before?`,
    };
  }

  async visualize(ctx: LearningContext): Promise<DiagramSpec> {
    const seeded = this.seeded.diagrams[ctx.concept.id];
    if (seeded) return seeded;
    return {
      title: `${ctx.concept.name} in context`,
      teachingGoal: `See how ${ctx.concept.name} connects to what you already know.`,
      nodes: [
        { id: ctx.concept.id, label: ctx.concept.name, group: "shared" },
        ...ctx.relatedConcepts.slice(0, 5).map((c) => ({ id: c.id, label: c.name, group: "before" as const })),
      ],
      edges: ctx.relatedConcepts.slice(0, 5).map((c) => ({ from: c.id, to: ctx.concept.id, label: "relates to" })),
      caption: ctx.concept.description,
    };
  }

  async ask(ctx: AskContext): Promise<AskResult> {
    if (ctx.sourcesSay.length === 0) return { thinkethInfers: [] };
    const infers: string[] = [];
    if (ctx.shift?.after) infers.push(`The practical shift: ${ctx.shift.after}`);
    if (ctx.focus?.misconception) {
      infers.push(`You've previously leaned toward the idea ${ctx.focus.misconception}. This is the part worth re-checking.`);
    } else if (ctx.focus && ctx.focus.mastery < 0.55) {
      infers.push(`${ctx.focus.name} is still developing for you (mastery ${ctx.focus.mastery.toFixed(2)}), so a quick understanding check here would tell Thinketh a lot.`);
    }
    return { thinkethInfers: infers };
  }
}
