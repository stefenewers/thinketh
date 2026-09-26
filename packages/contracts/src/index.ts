/**
 * Thinketh shared domain contracts.
 *
 * SHARED FILE — owned jointly by mobile (Stefen) and intelligence (Nadani).
 * The domain types mirror `05-data-contracts.md` exactly. Anything below the
 * "Additive" markers was not in that doc and is documented where it is defined.
 * Follow SHARED-INTEGRATION-RULES.md before changing any existing field.
 *
 * Single file, no relative imports, so Metro (Expo), Node and Deno can all
 * consume it directly.
 */
import { z } from "zod";

const unit = z.number().min(0).max(1);
const isoDate = z.string();

// ---------------------------------------------------------------------------
// Domain contracts (05-data-contracts.md)
// ---------------------------------------------------------------------------

/**
 * Additive: `Interest` is referenced by UserProfile in 05-data-contracts.md
 * but never defined there. `weight` (0..1) feeds diagnostic selection.
 */
export const InterestSchema = z.object({
  id: z.string(),
  label: z.string(),
  conceptIds: z.array(z.string()),
  weight: unit,
});
export type Interest = z.infer<typeof InterestSchema>;

export const UserProfileSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  interests: z.array(InterestSchema),
  goals: z.array(z.string()),
  explanationPreferences: z.array(z.string()),
});
export type UserProfile = z.infer<typeof UserProfileSchema>;

export const ConceptSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  domain: z.string(),
  importance: unit,
});
export type Concept = z.infer<typeof ConceptSchema>;

export const ConceptEdgeTypeSchema = z.enum(["prerequisite", "related", "supports", "contrasts", "part_of"]);
export type ConceptEdgeType = z.infer<typeof ConceptEdgeTypeSchema>;

export const ConceptEdgeSchema = z.object({
  fromConceptId: z.string(),
  toConceptId: z.string(),
  type: ConceptEdgeTypeSchema,
  weight: unit,
});
export type ConceptEdge = z.infer<typeof ConceptEdgeSchema>;

export const SourceSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string().optional(),
  sourceType: z.enum(["paper", "article", "github", "video", "docs", "announcement"]),
  publisher: z.string().optional(),
  publishedAt: isoDate.optional(),
  credibility: unit,
});
export type Source = z.infer<typeof SourceSchema>;

export const ClaimSchema = z.object({
  id: z.string(),
  text: z.string(),
  confidence: unit,
  sourceIds: z.array(z.string()),
  conceptIds: z.array(z.string()),
  stance: z.enum(["supports", "challenges", "neutral"]).optional(),
});
export type Claim = z.infer<typeof ClaimSchema>;

export const DevelopmentSchema = z.object({
  id: z.string(),
  title: z.string(),
  summaryBullets: z.array(z.string()),
  happenedAt: isoDate,
  significance: unit,
  novelty: unit,
  credibility: unit,
  momentum: unit,
  conceptIds: z.array(z.string()),
  claimIds: z.array(z.string()),
  sourceIds: z.array(z.string()),
  storylineIds: z.array(z.string()),
});
export type Development = z.infer<typeof DevelopmentSchema>;

/**
 * mastery      — system estimate of demonstrated understanding (0..1)
 * confidence   — the user's own self-assessed confidence (0..1). Kept separate
 *                from mastery so over/under-confidence is visible.
 * uncertainty  — how unsure the system is about `mastery` (0..1)
 */
export const KnowledgeStateSchema = z.object({
  userId: z.string(),
  conceptId: z.string(),
  mastery: unit,
  confidence: unit,
  uncertainty: unit,
  evidenceCount: z.number().int().min(0),
  lastObservedAt: isoDate,
  misconceptionFlags: z.array(z.string()),
});
export type KnowledgeState = z.infer<typeof KnowledgeStateSchema>;

export const ObservationKindSchema = z.enum([
  "viewed",
  "saved",
  "already_knew",
  "got_it",
  "diagnostic_correct",
  "diagnostic_partial",
  "diagnostic_incorrect",
  "explained",
  "revisited",
  "asked_followup",
  "misconception_detected",
]);
export type ObservationKind = z.infer<typeof ObservationKindSchema>;

export const KnowledgeObservationSchema = z.object({
  id: z.string(),
  userId: z.string(),
  conceptId: z.string(),
  kind: ObservationKindSchema,
  weight: z.number(),
  correctness: unit.optional(),
  sourceRef: z.string().optional(),
  createdAt: isoDate,
});
export type KnowledgeObservation = z.infer<typeof KnowledgeObservationSchema>;

export const PropagatedChangeSchema = z.object({
  conceptId: z.string(),
  deltaMastery: z.number(),
  deltaUncertainty: z.number(),
  reason: z.string(),
});
export type PropagatedChange = z.infer<typeof PropagatedChangeSchema>;

export const KnowledgeStateTransitionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  conceptId: z.string(),
  before: KnowledgeStateSchema,
  observation: KnowledgeObservationSchema,
  after: KnowledgeStateSchema,
  reason: z.string(),
  propagatedChanges: z.array(PropagatedChangeSchema),
  createdAt: isoDate,
});
export type KnowledgeStateTransition = z.infer<typeof KnowledgeStateTransitionSchema>;

export const DeltaExplanationSchema = z.object({
  developmentId: z.string(),
  userId: z.string(),
  whatHappened: z.array(z.string()),
  whyItMattersToYou: z.string(),
  alreadyKnew: z.array(z.string()),
  whatChanged: z.array(z.string()),
  mentalModelChange: z.string(),
  affectedConcepts: z.array(z.object({ conceptId: z.string(), reason: z.string() })),
});
export type DeltaExplanation = z.infer<typeof DeltaExplanationSchema>;

export const SelectionDebugSchema = z.object({
  uncertainty: z.number(),
  importance: z.number(),
  interest: z.number(),
  freshness: z.number(),
  prerequisiteCentrality: z.number(),
  priority: z.number(),
});
export type SelectionDebug = z.infer<typeof SelectionDebugSchema>;

export const DiagnosticQuestionSchema = z.object({
  id: z.string(),
  conceptId: z.string(),
  prompt: z.string(),
  type: z.enum(["multiple_choice", "short_answer"]),
  choices: z.array(z.string()).optional(),
  expectedConcepts: z.array(z.string()),
  rationale: z.string(),
  selectionDebug: SelectionDebugSchema.optional(),
});
export type DiagnosticQuestion = z.infer<typeof DiagnosticQuestionSchema>;

export const DiagnosticAnswerSchema = z.object({
  questionId: z.string(),
  userId: z.string(),
  answer: z.string(),
  correctness: unit,
  feedback: z.string(),
});
export type DiagnosticAnswer = z.infer<typeof DiagnosticAnswerSchema>;

export const DailyBriefSchema = z.object({
  date: z.string(),
  meaningfulCount: z.number().int(),
  majorCount: z.number().int(),
  estimatedMinutes: z.number(),
  skippedCount: z.number().int().optional(),
  skippedBreakdown: z.record(z.string(), z.number()).optional(),
  heroDevelopmentId: z.string(),
  developmentIds: z.array(z.string()),
});
export type DailyBrief = z.infer<typeof DailyBriefSchema>;

export const DiagramSpecSchema = z.object({
  title: z.string(),
  teachingGoal: z.string(),
  nodes: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      group: z.enum(["before", "after", "shared"]).optional(),
    }),
  ),
  edges: z.array(z.object({ from: z.string(), to: z.string(), label: z.string().optional() })),
  caption: z.string(),
});
export type DiagramSpec = z.infer<typeof DiagramSpecSchema>;

export const MemoryAidSchema = z.object({
  conceptId: z.string(),
  analogy: z.string(),
  memoryHook: z.string(),
  threeStepModel: z.tuple([z.string(), z.string(), z.string()]),
  recallQuestion: z.string(),
  optionalDiagram: DiagramSpecSchema.optional(),
});
export type MemoryAid = z.infer<typeof MemoryAidSchema>;

// ---------------------------------------------------------------------------
// Additive: types named in 02-architecture-contract.md but not defined there
// ---------------------------------------------------------------------------

export const StorylineSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  developmentIds: z.array(z.string()),
  conceptIds: z.array(z.string()),
});
export type Storyline = z.infer<typeof StorylineSchema>;

export const MemoryItemSchema = z.object({
  id: z.string(),
  kind: z.enum(["preference", "misconception", "learning_topic", "conversation"]),
  content: z.string(),
  createdAt: isoDate,
});
export type MemoryItem = z.infer<typeof MemoryItemSchema>;

export const VoiceSessionSchema = z.object({
  mode: z.enum(["elevenlabs", "transcript_fallback"]),
  /** Pass to `startSession({ conversationToken })` in @elevenlabs/react-native. */
  conversationToken: z.string().optional(),
  agentId: z.string().optional(),
  /** Pass as `dynamicVariables` to `startSession`; the agent prompt references them. */
  dynamicVariables: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  /** Always present so the screen works without voice. */
  fallbackTranscript: z.array(z.string()),
  expiresAt: isoDate.optional(),
});
export type VoiceSession = z.infer<typeof VoiceSessionSchema>;

// ---------------------------------------------------------------------------
// Additive: API request/response envelopes for the Thinketh HTTP API
// ---------------------------------------------------------------------------

export const KnowledgeLevelSchema = z.enum(["strong", "intermediate", "developing", "weak"]);
export type KnowledgeLevel = z.infer<typeof KnowledgeLevelSchema>;

export const BriefResponseSchema = z.object({
  brief: DailyBriefSchema,
  developments: z.array(DevelopmentSchema),
});
export type BriefResponse = z.infer<typeof BriefResponseSchema>;

export const DevelopmentDetailResponseSchema = z.object({
  development: DevelopmentSchema,
  delta: DeltaExplanationSchema,
  concepts: z.array(ConceptSchema),
  claims: z.array(ClaimSchema),
  sources: z.array(SourceSchema),
  storylines: z.array(StorylineSchema),
});
export type DevelopmentDetailResponse = z.infer<typeof DevelopmentDetailResponseSchema>;

export const FeedbackKindSchema = z.enum(["viewed", "saved", "already_knew", "got_it", "explained", "revisited", "asked_followup"]);
export type FeedbackKind = z.infer<typeof FeedbackKindSchema>;

export const FeedbackRequestSchema = z.object({ kind: FeedbackKindSchema });
export type FeedbackRequest = z.infer<typeof FeedbackRequestSchema>;

export const FeedbackResponseSchema = z.object({ transitions: z.array(KnowledgeStateTransitionSchema) });
export type FeedbackResponse = z.infer<typeof FeedbackResponseSchema>;

export const DiagnosticSelectRequestSchema = z.object({
  developmentId: z.string().optional(),
  conceptId: z.string().optional(),
});
export type DiagnosticSelectRequest = z.infer<typeof DiagnosticSelectRequestSchema>;

export const DiagnosticSelectResponseSchema = z.object({
  question: DiagnosticQuestionSchema,
  selection: z.object({
    /** Human-readable "Chosen because …" line for the explainability affordance. */
    explanation: z.string(),
    candidates: z.array(SelectionDebugSchema.extend({ conceptId: z.string(), conceptName: z.string() })),
  }),
});
export type DiagnosticSelectResponse = z.infer<typeof DiagnosticSelectResponseSchema>;

export const DiagnosticAnswerRequestSchema = z.object({
  /** Multiple choice: the choice text or its 0-based index as a string. Short answer: free text. */
  answer: z.string().min(1),
});
export type DiagnosticAnswerRequest = z.infer<typeof DiagnosticAnswerRequestSchema>;

export const DiagnosticAnswerResponseSchema = z.object({
  answer: DiagnosticAnswerSchema,
  transition: KnowledgeStateTransitionSchema,
});
export type DiagnosticAnswerResponse = z.infer<typeof DiagnosticAnswerResponseSchema>;

export const KnowledgeItemSchema = z.object({
  concept: ConceptSchema,
  state: KnowledgeStateSchema,
  level: KnowledgeLevelSchema,
  lastTransition: KnowledgeStateTransitionSchema.optional(),
});
export type KnowledgeItem = z.infer<typeof KnowledgeItemSchema>;

export const KnowledgeResponseSchema = z.object({
  userId: z.string(),
  items: z.array(KnowledgeItemSchema),
  edges: z.array(ConceptEdgeSchema),
});
export type KnowledgeResponse = z.infer<typeof KnowledgeResponseSchema>;

export const ConceptHistoryResponseSchema = z.object({
  concept: ConceptSchema,
  current: KnowledgeStateSchema,
  level: KnowledgeLevelSchema,
  /** Oldest first. */
  transitions: z.array(KnowledgeStateTransitionSchema),
});
export type ConceptHistoryResponse = z.infer<typeof ConceptHistoryResponseSchema>;

export const AskRequestSchema = z.object({
  question: z.string().min(1),
  developmentId: z.string().optional(),
});
export type AskRequest = z.infer<typeof AskRequestSchema>;

export const AskResponseSchema = z.object({
  answer: z.string(),
  citations: z.array(z.object({ sourceId: z.string(), title: z.string() })),
  relatedConceptIds: z.array(z.string()),
  memoryUsed: z.array(MemoryItemSchema),
});
export type AskResponse = z.infer<typeof AskResponseSchema>;

export const LearningRequestSchema = z.object({
  conceptId: z.string().optional(),
  developmentId: z.string().optional(),
});
export type LearningRequest = z.infer<typeof LearningRequestSchema>;

export const VoiceSessionRequestSchema = z.object({ briefDate: z.string().optional() });
export type VoiceSessionRequest = z.infer<typeof VoiceSessionRequestSchema>;

/** Feature flags for hiding unstable features in the app (voice, visualize, …). */
export const AppConfigResponseSchema = z.object({ flags: z.record(z.string(), z.boolean()) });
export type AppConfigResponse = z.infer<typeof AppConfigResponseSchema>;

export const ApiErrorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });
export type ApiError = z.infer<typeof ApiErrorSchema>;
