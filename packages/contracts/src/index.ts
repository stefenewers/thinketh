// Shared Thinketh domain contracts. Mirrors 05-data-contracts.md exactly.
// Change only via the shared-contract process in SHARED-INTEGRATION-RULES.md.
import { z } from "zod";

const unit = z.number().min(0).max(1);

// `Interest` is referenced by UserProfile but not defined in 05-data-contracts.md.
// Minimal shape proposed here — confirm with Nadani.
export const InterestSchema = z.object({
  topic: z.string(),
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

export const ConceptEdgeSchema = z.object({
  fromConceptId: z.string(),
  toConceptId: z.string(),
  type: z.enum(["prerequisite", "related", "supports", "contrasts", "part_of"]),
  weight: unit,
});
export type ConceptEdge = z.infer<typeof ConceptEdgeSchema>;

export const SourceSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string().optional(),
  sourceType: z.enum(["paper", "article", "github", "video", "docs", "announcement"]),
  publisher: z.string().optional(),
  publishedAt: z.string().optional(),
  credibility: unit,
});
export type Source = z.infer<typeof SourceSchema>;

export const ClaimSchema = z.object({
  id: z.string(),
  text: z.string(),
  confidence: z.number(),
  sourceIds: z.array(z.string()),
  conceptIds: z.array(z.string()),
  stance: z.enum(["supports", "challenges", "neutral"]).optional(),
});
export type Claim = z.infer<typeof ClaimSchema>;

export const DevelopmentSchema = z.object({
  id: z.string(),
  title: z.string(),
  summaryBullets: z.array(z.string()),
  happenedAt: z.string(),
  significance: z.number(),
  novelty: z.number(),
  credibility: z.number(),
  momentum: z.number(),
  conceptIds: z.array(z.string()),
  claimIds: z.array(z.string()),
  sourceIds: z.array(z.string()),
  storylineIds: z.array(z.string()),
});
export type Development = z.infer<typeof DevelopmentSchema>;

export const KnowledgeStateSchema = z.object({
  userId: z.string(),
  conceptId: z.string(),
  mastery: z.number(),
  confidence: z.number(),
  uncertainty: z.number(),
  evidenceCount: z.number(),
  lastObservedAt: z.string(),
  misconceptionFlags: z.array(z.string()),
});
export type KnowledgeState = z.infer<typeof KnowledgeStateSchema>;

export const KnowledgeObservationKindSchema = z.enum([
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
export type KnowledgeObservationKind = z.infer<typeof KnowledgeObservationKindSchema>;

export const KnowledgeObservationSchema = z.object({
  id: z.string(),
  userId: z.string(),
  conceptId: z.string(),
  kind: KnowledgeObservationKindSchema,
  weight: z.number(),
  correctness: unit.optional(),
  sourceRef: z.string().optional(),
  createdAt: z.string(),
});
export type KnowledgeObservation = z.infer<typeof KnowledgeObservationSchema>;

export const KnowledgeStateTransitionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  conceptId: z.string(),
  before: KnowledgeStateSchema,
  observation: KnowledgeObservationSchema,
  after: KnowledgeStateSchema,
  reason: z.string(),
  propagatedChanges: z.array(
    z.object({
      conceptId: z.string(),
      deltaMastery: z.number(),
      deltaUncertainty: z.number(),
      reason: z.string(),
    }),
  ),
  createdAt: z.string(),
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
  affectedConcepts: z.array(
    z.object({
      conceptId: z.string(),
      reason: z.string(),
    }),
  ),
});
export type DeltaExplanation = z.infer<typeof DeltaExplanationSchema>;

export const DiagnosticQuestionSchema = z.object({
  id: z.string(),
  conceptId: z.string(),
  prompt: z.string(),
  type: z.enum(["multiple_choice", "short_answer"]),
  choices: z.array(z.string()).optional(),
  expectedConcepts: z.array(z.string()),
  rationale: z.string(),
  selectionDebug: z
    .object({
      uncertainty: z.number(),
      importance: z.number(),
      interest: z.number(),
      freshness: z.number(),
      prerequisiteCentrality: z.number(),
      priority: z.number(),
    })
    .optional(),
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
  meaningfulCount: z.number(),
  majorCount: z.number(),
  estimatedMinutes: z.number(),
  skippedCount: z.number().optional(),
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
  edges: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      label: z.string().optional(),
    }),
  ),
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

// ===========================================================================
// Canonical API envelopes (JOINT-INTEGRATION-CHECKLIST step 2)
//
// Request/response shapes for the Thinketh HTTP API, agreed from
// docs/MOBILE-API-EXPECTATIONS.md and NEXT-STEPS-NADANI.md. Every field inside
// them is a domain contract above. POST bodies may include `userId`; the
// server identifies the user from the auth token or `X-Thinketh-User` header.
// ===========================================================================

export const SelectionDebugSchema = DiagnosticQuestionSchema.shape.selectionDebug.unwrap();
export type SelectionDebug = z.infer<typeof SelectionDebugSchema>;

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
  createdAt: z.string(),
});
export type MemoryItem = z.infer<typeof MemoryItemSchema>;

export const KnowledgeLevelSchema = z.enum(["strong", "intermediate", "developing", "weak"]);
export type KnowledgeLevel = z.infer<typeof KnowledgeLevelSchema>;

const withUser = { userId: z.string().optional() };

// GET /brief/today
export const TodayResponseSchema = z.object({
  brief: DailyBriefSchema,
  /** Everything referenced by brief.developmentIds, in brief order. */
  developments: z.array(DevelopmentSchema),
  sources: z.array(SourceSchema),
  concepts: z.array(ConceptSchema),
  /** Developments whose understanding check the user passed today. */
  understoodDevelopmentIds: z.array(z.string()),
  /** Newest first. Primary transitions only (no propagated side effects). */
  recentTransitions: z.array(KnowledgeStateTransitionSchema),
});
export type TodayResponse = z.infer<typeof TodayResponseSchema>;

// GET /developments/:id
export const DevelopmentDetailResponseSchema = z.object({
  development: DevelopmentSchema,
  /** delta.affectedConcepts[0] is the primary concept. */
  delta: DeltaExplanationSchema,
  sources: z.array(SourceSchema),
  concepts: z.array(ConceptSchema),
  claims: z.array(ClaimSchema),
  storylines: z.array(StorylineSchema).optional(),
});
export type DevelopmentDetailResponse = z.infer<typeof DevelopmentDetailResponseSchema>;

// POST /developments/:id/feedback
export const FeedbackKindSchema = z.enum(["got_it", "already_knew", "viewed", "saved", "explained", "revisited", "asked_followup"]);
export type FeedbackKind = z.infer<typeof FeedbackKindSchema>;
export const FeedbackRequestSchema = z.object({ ...withUser, kind: FeedbackKindSchema });
export type FeedbackRequest = z.infer<typeof FeedbackRequestSchema>;
export const FeedbackResponseSchema = z.object({
  /** transitions[0].reason is shown inline. */
  transitions: z.array(KnowledgeStateTransitionSchema),
});
export type FeedbackResponse = z.infer<typeof FeedbackResponseSchema>;

// POST /diagnostics/select
export const DiagnosticSelectRequestSchema = z.object({
  ...withUser,
  developmentId: z.string().optional(),
  conceptId: z.string().optional(),
});
export type DiagnosticSelectRequest = z.infer<typeof DiagnosticSelectRequestSchema>;
export const DiagnosticSelectResponseSchema = z.object({
  question: DiagnosticQuestionSchema,
  selection: z.object({
    /** "Chosen because …" line for the explainability affordance. */
    explanation: z.string(),
    /** Top candidates, highest priority first. */
    candidates: z.array(SelectionDebugSchema.extend({ conceptId: z.string(), conceptName: z.string() })),
  }),
});
export type DiagnosticSelectResponse = z.infer<typeof DiagnosticSelectResponseSchema>;

// POST /diagnostics/:id/answer
export const DiagnosticAnswerRequestSchema = z.object({
  ...withUser,
  /** Multiple choice: exact choice text (or 0-based index). Short answer: free text. */
  answer: z.string().min(1),
});
export type DiagnosticAnswerRequest = z.infer<typeof DiagnosticAnswerRequestSchema>;
export const DiagnosticAnswerResponseSchema = z.object({
  answer: DiagnosticAnswerSchema,
  transition: KnowledgeStateTransitionSchema,
});
export type DiagnosticAnswerResponse = z.infer<typeof DiagnosticAnswerResponseSchema>;

// GET /knowledge
export const KnowledgeItemSchema = z.object({
  concept: ConceptSchema,
  state: KnowledgeStateSchema,
  level: KnowledgeLevelSchema,
  lastTransition: KnowledgeStateTransitionSchema.optional(),
});
export type KnowledgeItem = z.infer<typeof KnowledgeItemSchema>;
export const KnowledgeResponseSchema = z.object({
  userId: z.string(),
  /** One per concept, sorted by mastery (highest first). */
  items: z.array(KnowledgeItemSchema),
  edges: z.array(ConceptEdgeSchema),
  /** Newest first. Primary transitions only. */
  recentTransitions: z.array(KnowledgeStateTransitionSchema),
});
export type KnowledgeResponse = z.infer<typeof KnowledgeResponseSchema>;

// GET /knowledge/:conceptId/history
export const ConceptHistoryResponseSchema = z.object({
  concept: ConceptSchema,
  current: KnowledgeStateSchema,
  level: KnowledgeLevelSchema,
  /** Oldest first. */
  transitions: z.array(KnowledgeStateTransitionSchema),
});
export type ConceptHistoryResponse = z.infer<typeof ConceptHistoryResponseSchema>;

// POST /ask
export const AskRequestSchema = z.object({
  ...withUser,
  question: z.string().min(1),
  developmentId: z.string().optional(),
});
export type AskRequest = z.infer<typeof AskRequestSchema>;
/** Trust layers: what sources say vs what Thinketh infers vs what you know vs what's unknown. Empty arrays hide their section. */
export const AskResponseSchema = z.object({
  question: z.string(),
  sourcesSay: z.array(z.string()),
  thinkethInfers: z.array(z.string()),
  youAlreadyUnderstand: z.array(z.string()),
  stillUncertain: z.array(z.string()),
  citedDevelopmentIds: z.array(z.string()),
  citedConceptIds: z.array(z.string()),
  memoryUsed: z.array(MemoryItemSchema).optional(),
});
export type AskResponse = z.infer<typeof AskResponseSchema>;

// POST /visualize -> DiagramSpec, POST /make-it-stick -> MemoryAid
export const LearningRequestSchema = z.object({
  ...withUser,
  conceptId: z.string().optional(),
  developmentId: z.string().optional(),
});
export type LearningRequest = z.infer<typeof LearningRequestSchema>;

// POST /voice/session
export const VoiceSessionRequestSchema = z.object({ ...withUser, briefDate: z.string().optional() });
export type VoiceSessionRequest = z.infer<typeof VoiceSessionRequestSchema>;
export const VoiceSessionSchema = z.object({
  sessionId: z.string(),
  mode: z.enum(["elevenlabs", "transcript_fallback"]),
  /** Pass to `startSession({ conversationToken, dynamicVariables })`. Null = voice unavailable, play fallbackScript. */
  conversationToken: z.string().nullable(),
  agentId: z.string().nullable(),
  expiresAt: z.string(),
  dynamicVariables: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  /** Always present so Catch Me Up works without voice. */
  fallbackScript: z.array(z.string()),
});
export type VoiceSession = z.infer<typeof VoiceSessionSchema>;

// GET /config
export const AppConfigResponseSchema = z.object({ flags: z.record(z.string(), z.boolean()) });
export type AppConfigResponse = z.infer<typeof AppConfigResponseSchema>;
