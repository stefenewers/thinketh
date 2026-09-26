/**
 * Claude IntelligenceModel. Every call uses structured outputs, and every
 * result is re-validated against the shared contract schemas before it leaves
 * this file. Claude phrases, extracts and generates; it never assigns mastery.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import {
  ClaimSchema,
  ConceptSchema,
  DeltaExplanationSchema,
  DevelopmentSchema,
  DiagramSpecSchema,
  MemoryAidSchema,
  SourceSchema,
  type DeltaExplanation,
  type DiagramSpec,
  type MemoryAid,
} from "@thinketh/contracts";
import { z } from "zod";
import type { DiagnosticItem } from "../../seed/types.ts";
import { clamp01, newId } from "../../util.ts";
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

// Wire schemas: what Claude is asked to produce. Kept free of numeric/length
// constraints (structured outputs doesn't enforce them); those are enforced
// afterwards by the contract schemas and explicit checks.
const DeltaWire = z.object({
  whatHappened: z.array(z.string()),
  whyItMattersToYou: z.string(),
  alreadyKnew: z.array(z.string()),
  whatChanged: z.array(z.string()),
  mentalModelChange: z.string(),
  affectedConcepts: z.array(z.object({ conceptId: z.string(), reason: z.string() })),
});

const DiagnosticWire = z.object({
  prompt: z.string(),
  choices: z.array(z.string()),
  correctIndex: z.number().int(),
  choiceFeedback: z.array(z.string()),
  rationale: z.string(),
});

const GradeWire = z.object({
  coveredIdeaIndices: z.array(z.number().int()),
  misconception: z.string(),
  feedback: z.string(),
});

const MemoryAidWire = z.object({
  analogy: z.string(),
  memoryHook: z.string(),
  threeStepModel: z.array(z.string()),
  recallQuestion: z.string(),
});

const DiagramWire = z.object({
  title: z.string(),
  teachingGoal: z.string(),
  nodes: z.array(z.object({ id: z.string(), label: z.string(), group: z.enum(["before", "after", "shared"]) })),
  edges: z.array(z.object({ from: z.string(), to: z.string(), label: z.string() })),
  caption: z.string(),
});

const AskWire = z.object({
  answer: z.string(),
  citedSourceIds: z.array(z.string()),
  relatedConceptIds: z.array(z.string()),
});

const NormalizeWire = z.object({
  title: z.string(),
  summaryBullets: z.array(z.string()),
  significance: z.number(),
  novelty: z.number(),
  momentum: z.number(),
  conceptIds: z.array(z.string()),
  newConcepts: z.array(z.object({ id: z.string(), name: z.string(), description: z.string(), importance: z.number() })),
  claims: z.array(
    z.object({
      text: z.string(),
      confidence: z.number(),
      sourceIndices: z.array(z.number().int()),
      conceptIds: z.array(z.string()),
      stance: z.enum(["supports", "challenges", "neutral"]),
    }),
  ),
  mentalModelShift: z.object({ before: z.string(), after: z.string() }),
});

const SYSTEM = `You are the intelligence layer of Thinketh, a personal learning system that tracks what a specific user understands about a fast-moving field and explains only what is new to them.

Voice: calm, precise, editorial. Short sentences. No hype, no emoji, no marketing language. Address the user as "you".

Hard rules:
- Never invent numeric mastery, confidence or uncertainty values, and never claim the user knows something the provided state does not support.
- Only cite source ids and concept ids that appear in the input.
- If the input doesn't support a claim, leave it out.`;

export class ClaudeModel implements IntelligenceModel {
  readonly name = "claude" as const;
  private readonly client: Anthropic;
  private readonly opts: { apiKey: string; model: string; effort: "low" | "medium" | "high"; timeoutMs: number };

  constructor(opts: { apiKey: string; model: string; effort: "low" | "medium" | "high"; timeoutMs: number }) {
    this.opts = opts;
    this.client = new Anthropic({ apiKey: opts.apiKey, maxRetries: 0, timeout: opts.timeoutMs });
  }

  private async structured<T>(schema: z.ZodType<T>, task: string, input: unknown): Promise<T> {
    const response = await this.client.beta.messages.parse({
      model: this.opts.model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: this.opts.effort, format: betaZodOutputFormat(schema) },
      system: SYSTEM,
      messages: [{ role: "user", content: `${task}\n\n<input>\n${JSON.stringify(input, null, 2)}\n</input>` }],
    });
    if (response.stop_reason === "refusal") throw new Error("Claude declined the request");
    if (response.stop_reason === "max_tokens") throw new Error("Claude output was truncated");
    if (!response.parsed_output) throw new Error("Claude returned no parseable output");
    return response.parsed_output;
  }

  async normalizeDevelopment(input: RawSourceBundle): Promise<NormalizedDevelopment> {
    const known = input.knownConcepts.map((c) => ({ id: c.id, name: c.name }));
    const out = await this.structured(
      NormalizeWire,
      `Normalize these raw sources into one Development: the single meaningful change they describe.
- summaryBullets: 2-3 factual bullets.
- significance, novelty, momentum: 0..1 scores for the field (not for a user).
- conceptIds: ids from knownConcepts only. Put genuinely new concepts in newConcepts with kebab-case ids.
- claims: atomic, checkable claims. sourceIndices are 0-based indices into sources. Mark claims that push back on the headline as "challenges".
- mentalModelShift: how a practitioner's model of the field should change, as before/after sentences.`,
      { sources: input.sources, knownConcepts: known },
    );
    const knownIds = new Set(input.knownConcepts.map((c) => c.id));
    const sources = input.sources.map((s) =>
      SourceSchema.parse({
        id: newId("src"),
        title: s.title,
        ...(s.url ? { url: s.url } : {}),
        sourceType: s.sourceType,
        ...(s.publisher ? { publisher: s.publisher } : {}),
        ...(s.publishedAt ? { publishedAt: s.publishedAt } : {}),
        credibility: s.credibility ?? 0.6,
      }),
    );
    const newConcepts = out.newConcepts.map((c) =>
      ConceptSchema.parse({ ...c, domain: input.knownConcepts[0]?.domain ?? "general", importance: clamp01(c.importance) }),
    );
    const allowedConcepts = new Set([...knownIds, ...newConcepts.map((c) => c.id)]);
    const claims = out.claims.map((c) =>
      ClaimSchema.parse({
        id: newId("clm"),
        text: c.text,
        confidence: clamp01(c.confidence),
        sourceIds: c.sourceIndices.flatMap((i) => (sources[i] ? [sources[i].id] : [])),
        conceptIds: c.conceptIds.filter((id) => allowedConcepts.has(id)),
        stance: c.stance,
      }),
    );
    const dates = input.sources.map((s) => s.publishedAt).filter((d): d is string => !!d).sort();
    const development = DevelopmentSchema.parse({
      id: newId("dev"),
      title: out.title,
      summaryBullets: out.summaryBullets.slice(0, 3),
      happenedAt: dates.at(-1) ?? new Date().toISOString(),
      significance: clamp01(out.significance),
      novelty: clamp01(out.novelty),
      credibility: sources.reduce((a, s) => a + s.credibility, 0) / Math.max(1, sources.length),
      momentum: clamp01(out.momentum),
      conceptIds: out.conceptIds.filter((id) => allowedConcepts.has(id)),
      claimIds: claims.map((c) => c.id),
      sourceIds: sources.map((s) => s.id),
      storylineIds: [],
    });
    return { development, claims, sources, newConcepts, mentalModelShift: out.mentalModelShift };
  }

  async explainDelta(input: DeltaPhrasingContext): Promise<DeltaExplanation> {
    const out = await this.structured(
      DeltaWire,
      `Rephrase this personalized delta so it reads naturally for this user, following their explanation preferences and memories.
Keep the same meaning and the same number of items in every array. Do not add facts. Keep every conceptId exactly as given, in the same order. Keep any numbers exactly as given.`,
      {
        delta: input.delta,
        developmentTitle: input.development.title,
        explanationPreferences: input.profile.explanationPreferences,
        memories: input.memories.map((m) => m.content),
      },
    );
    const original = input.delta;
    const sameLength = (a: unknown[], b: unknown[]) => a.length === b.length;
    if (
      !sameLength(out.whatHappened, original.whatHappened) ||
      !sameLength(out.alreadyKnew, original.alreadyKnew) ||
      !sameLength(out.whatChanged, original.whatChanged)
    ) {
      throw new Error("Claude changed the delta structure");
    }
    const reasons = new Map(out.affectedConcepts.map((a) => [a.conceptId, a.reason]));
    return DeltaExplanationSchema.parse({
      developmentId: original.developmentId,
      userId: original.userId,
      whatHappened: out.whatHappened,
      whyItMattersToYou: out.whyItMattersToYou,
      alreadyKnew: out.alreadyKnew,
      whatChanged: out.whatChanged,
      mentalModelChange: out.mentalModelChange,
      affectedConcepts: original.affectedConcepts.map((a) => ({ conceptId: a.conceptId, reason: reasons.get(a.conceptId) ?? a.reason })),
    });
  }

  async generateDiagnostic(ctx: LearningContext): Promise<DiagnosticItem> {
    const out = await this.structured(
      DiagnosticWire,
      `Write one multiple-choice diagnostic question for the target concept.
- Prefer a transfer question (apply the idea to a new situation) over recall of a definition.
- Exactly 4 choices, one clearly correct. Distractors should reflect realistic misconceptions.
- choiceFeedback: one short explanation per choice, same order.
- correctIndex: 0-based.`,
      {
        concept: ctx.concept,
        relatedConcepts: ctx.relatedConcepts.map((c) => ({ id: c.id, name: c.name })),
        recentClaims: ctx.claims.map((c) => c.text),
        knownMisconceptions: ctx.state?.misconceptionFlags ?? [],
      },
    );
    if (out.choices.length !== 4 || out.choiceFeedback.length !== 4 || out.correctIndex < 0 || out.correctIndex > 3) {
      throw new Error("Claude diagnostic failed shape checks");
    }
    return {
      id: newId("dq-gen"),
      conceptId: ctx.concept.id,
      type: "multiple_choice",
      prompt: out.prompt,
      choices: out.choices,
      choiceCorrectness: out.choices.map((_, i) => (i === out.correctIndex ? 1 : 0)),
      choiceFeedback: out.choiceFeedback,
      expectedConcepts: [ctx.concept.id],
      rationale: out.rationale,
    };
  }

  async gradeShortAnswer(input: { item: DiagnosticItem; answer: string }): Promise<ShortAnswerGrade> {
    const rubric = (input.item.rubric ?? []).map((r, i) => ({ index: i, idea: r.idea }));
    const out = await this.structured(
      GradeWire,
      `Judge which rubric ideas the learner's answer clearly expresses, in any wording. Be strict: vague gestures don't count.
- coveredIdeaIndices: indices from the rubric.
- misconception: a short kebab-case label if the answer reveals a specific misconception, otherwise "".
- feedback: 1-2 sentences addressed to the learner.`,
      { question: input.item.prompt, rubric, answer: input.answer },
    );
    return {
      coveredIdeaIndices: out.coveredIdeaIndices.filter((i) => i >= 0 && i < rubric.length),
      ...(out.misconception ? { misconception: out.misconception } : {}),
      feedback: out.feedback,
    };
  }

  async makeItStick(ctx: LearningContext): Promise<MemoryAid> {
    const out = await this.structured(
      MemoryAidWire,
      `Create a memory aid for the concept, tailored to the user's explanation preferences.
- analogy: one or two sentences mapping the concept onto something familiar.
- memoryHook: a phrase of 8 words or fewer.
- threeStepModel: exactly 3 short steps.
- recallQuestion: one question the user should be able to answer tomorrow.`,
      {
        concept: ctx.concept,
        explanationPreferences: ctx.profile.explanationPreferences,
        memories: ctx.memories.map((m) => m.content),
        recentClaims: ctx.claims.map((c) => c.text),
      },
    );
    if (out.threeStepModel.length !== 3) throw new Error("Claude memory aid must have exactly 3 steps");
    const [a, b, c] = out.threeStepModel as [string, string, string];
    return MemoryAidSchema.parse({
      conceptId: ctx.concept.id,
      analogy: out.analogy,
      memoryHook: out.memoryHook,
      threeStepModel: [a, b, c],
      recallQuestion: out.recallQuestion,
    });
  }

  async visualize(ctx: LearningContext): Promise<DiagramSpec> {
    const out = await this.structured(
      DiagramWire,
      `Design a small "before vs after" mental-model diagram for the concept, rendered natively as nodes and edges.
- 4-8 nodes. group "before" = the old mental model, "after" = the new one, "shared" = unchanged parts.
- Node ids are short kebab-case strings; every edge must reference existing node ids.
- caption: one sentence explaining the shift.`,
      {
        concept: ctx.concept,
        development: ctx.development ? { title: ctx.development.title, bullets: ctx.development.summaryBullets } : undefined,
        relatedConcepts: ctx.relatedConcepts.map((c) => c.name),
        recentClaims: ctx.claims.map((c) => c.text),
      },
    );
    const ids = new Set(out.nodes.map((n) => n.id));
    if (out.nodes.length < 2 || out.edges.some((e) => !ids.has(e.from) || !ids.has(e.to))) {
      throw new Error("Claude diagram references unknown nodes");
    }
    return DiagramSpecSchema.parse(out);
  }

  async ask(ctx: AskContext): Promise<AskResult> {
    const out = await this.structured(
      AskWire,
      `Answer the user's question using only the provided claims and sources. Connect the answer to what the user already knows (their knowledge states) and follow their explanation preferences and memories. 2-5 sentences. If the corpus doesn't cover it, say so plainly.`,
      {
        question: ctx.question,
        explanationPreferences: ctx.profile.explanationPreferences,
        memories: ctx.memories.map((m) => m.content),
        claims: ctx.claims.map((c) => ({ text: c.text, sourceIds: c.sourceIds, conceptIds: c.conceptIds, stance: c.stance })),
        sources: ctx.sources.map((s) => ({ id: s.id, title: s.title })),
        knowledge: ctx.states.map((s) => ({ conceptId: s.conceptId, mastery: s.mastery })),
      },
    );
    const sourceIds = new Set(ctx.sources.map((s) => s.id));
    const conceptIds = new Set(ctx.concepts.map((c) => c.id));
    return {
      answer: out.answer,
      citedSourceIds: out.citedSourceIds.filter((id) => sourceIds.has(id)),
      relatedConceptIds: out.relatedConceptIds.filter((id) => conceptIds.has(id)),
    };
  }
}
