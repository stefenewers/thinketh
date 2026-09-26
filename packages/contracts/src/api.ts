// Canonical HTTP envelopes for the Thinketh API, shared by mobile and backend.
// Taken from the backend's implementation (packages/intelligence/src/contracts.ts)
// so the server keeps validating exactly what it already returns. Mobile-only
// needs are expressed as OPTIONAL fields so neither side breaks.
import { z } from "zod";
import {
  ClaimSchema,
  ConceptEdgeSchema,
  ConceptSchema,
  DailyBriefSchema,
  DeltaExplanationSchema,
  DevelopmentSchema,
  DiagnosticAnswerSchema,
  DiagnosticQuestionSchema,
  KnowledgeStateSchema,
  KnowledgeStateTransitionSchema,
  SourceSchema,
} from "./domain.ts";

export const SelectionDebugSchema = DiagnosticQuestionSchema.shape.selectionDebug.unwrap();
export type SelectionDebug = z.infer<typeof SelectionDebugSchema>;

// Domain objects named in 02-architecture-contract.md, first defined by the backend.

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
  /** Where the memory was recalled from: Backboard (live) or the local fallback. */
  source: z.enum(["backboard", "local"]).optional(),
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
  expiresAt: z.string().optional(),
});
export type VoiceSession = z.infer<typeof VoiceSessionSchema>;

export const KnowledgeLevelSchema = z.enum(["strong", "intermediate", "developing", "weak"]);
export type KnowledgeLevel = z.infer<typeof KnowledgeLevelSchema>;

// GET /brief/today
export const BriefResponseSchema = z.object({
  brief: DailyBriefSchema,
  developments: z.array(DevelopmentSchema),
  /** Optional (mobile): sources for the listed developments, for publisher names on Today. */
  sources: z.array(SourceSchema).optional(),
  /** Optional: all concepts, so Today can name them without a /knowledge call. */
  concepts: z.array(ConceptSchema).optional(),
  /**
   * Optional: developments counted as understood today — a direct (non-propagated)
   * diagnostic_correct today on the development's conceptIds[0]. Same rule the app uses.
   */
  understoodDevelopmentIds: z.array(z.string()).optional(),
  /** Optional: newest first, primary transitions only (no "propagated:" side effects). */
  recentTransitions: z.array(KnowledgeStateTransitionSchema).optional(),
});
export type BriefResponse = z.infer<typeof BriefResponseSchema>;

// GET /developments/:id
export const DevelopmentDetailResponseSchema = z.object({
  development: DevelopmentSchema,
  delta: DeltaExplanationSchema,
  concepts: z.array(ConceptSchema),
  claims: z.array(ClaimSchema),
  sources: z.array(SourceSchema),
  storylines: z.array(StorylineSchema),
});
export type DevelopmentDetailResponse = z.infer<typeof DevelopmentDetailResponseSchema>;

// POST /developments/:id/feedback
export const FeedbackKindSchema = z.enum(["viewed", "saved", "already_knew", "got_it", "explained", "revisited", "asked_followup"]);
export type FeedbackKind = z.infer<typeof FeedbackKindSchema>;
export const FeedbackRequestSchema = z.object({ kind: FeedbackKindSchema });
export const FeedbackResponseSchema = z.object({ transitions: z.array(KnowledgeStateTransitionSchema) });
export type FeedbackResponse = z.infer<typeof FeedbackResponseSchema>;

// POST /diagnostics/select
export const DiagnosticSelectRequestSchema = z.object({
  developmentId: z.string().optional(),
  conceptId: z.string().optional(),
});
export type DiagnosticSelectRequest = z.infer<typeof DiagnosticSelectRequestSchema>;

export const DiagnosticCandidateSchema = SelectionDebugSchema.extend({ conceptId: z.string(), conceptName: z.string() });
export type DiagnosticCandidate = z.infer<typeof DiagnosticCandidateSchema>;

export const DiagnosticSelectResponseSchema = z.object({
  question: DiagnosticQuestionSchema,
  selection: z.object({
    /** Human-readable "Chosen because …" line for the explainability affordance. */
    explanation: z.string(),
    /** Ranked candidates, highest priority first. */
    candidates: z.array(DiagnosticCandidateSchema),
  }),
});
export type DiagnosticSelectResponse = z.infer<typeof DiagnosticSelectResponseSchema>;

// POST /diagnostics/:id/answer
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
  items: z.array(KnowledgeItemSchema),
  edges: z.array(ConceptEdgeSchema),
  /** Optional: newest first, primary transitions only (no "propagated:" side effects). */
  recentTransitions: z.array(KnowledgeStateTransitionSchema).optional(),
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
/** Ask learning modes: how much to explain. Presentation only; never touches knowledge state. */
export const AskModeSchema = z.enum(["quick", "teach", "deep"]);
export type AskMode = z.infer<typeof AskModeSchema>;

export const AskRequestSchema = z.object({
  question: z.string().min(1),
  developmentId: z.string().optional(),
  /** Optional; defaults to "quick". */
  mode: AskModeSchema.optional(),
});
export type AskRequest = z.infer<typeof AskRequestSchema>;

export const AskSectionsSchema = z.object({
  sourcesSay: z.array(z.string()),
  thinkethInfers: z.array(z.string()),
  youAlreadyUnderstand: z.array(z.string()),
  stillUncertain: z.array(z.string()),
});
export type AskSections = z.infer<typeof AskSectionsSchema>;

export const AskResponseSchema = z.object({
  answer: z.string(),
  citations: z.array(z.object({ sourceId: z.string(), title: z.string() })),
  relatedConceptIds: z.array(z.string()),
  memoryUsed: z.array(MemoryItemSchema),
  /** Optional (mobile): trust layering from the design spec. When absent, the app renders `answer`. */
  sections: AskSectionsSchema.optional(),
});
export type AskResponse = z.infer<typeof AskResponseSchema>;

// POST /visualize, POST /make-it-stick
export const LearningRequestSchema = z.object({
  conceptId: z.string().optional(),
  developmentId: z.string().optional(),
});
export type LearningRequest = z.infer<typeof LearningRequestSchema>;

// GET /config
/** Feature flags for hiding unstable features in the app (voice, visualize, …). */
export const AppConfigResponseSchema = z.object({ flags: z.record(z.string(), z.boolean()) });
export type AppConfigResponse = z.infer<typeof AppConfigResponseSchema>;

// ---------------------------------------------------------------------------
// Learning Queue: "save to learn". A user-supplied URL, read and compared with
// the user's knowledge state. Analysis never changes knowledge state; the
// diagnostic remains the only path that does.

/** What the URL is, judged only from where it lives (no claims beyond that). */
export const ResourceSourceTypeSchema = z.enum(["primary", "documentation", "research", "preprint", "repository", "reporting", "article", "video", "document"]);
export type ResourceSourceType = z.infer<typeof ResourceSourceTypeSchema>;

export const ResourceStatusSchema = z.enum(["processing", "ready", "failed", "learned"]);
/** The step actually running, so the app can say what Thinketh is doing. */
export const ResourceStageSchema = z.enum(["reading", "mapping", "comparing", "done"]);

export const ResourceIdeaSchema = z.object({ idea: z.string(), conceptId: z.string().optional() });
export type ResourceIdea = z.infer<typeof ResourceIdeaSchema>;

export const ResourceSchema = z.object({
  id: z.string(),
  url: z.string(),
  canonicalUrl: z.string().optional(),
  title: z.string(),
  publisher: z.string().optional(),
  author: z.string().optional(),
  publishedAt: z.string().optional(),
  sourceType: ResourceSourceTypeSchema,
  createdAt: z.string(),
  fetchedAt: z.string().optional(),
  status: ResourceStatusSchema,
  stage: ResourceStageSchema,
  /** Shown to the user when status is "failed". */
  error: z.string().optional(),
  estimatedReadMinutes: z.number().optional(),
  estimatedUsefulMinutes: z.number().optional(),
  summary: z.string().optional(),
  extractedConcepts: z.array(z.string()),
  matchedConceptIds: z.array(z.string()),
  alreadyUnderstood: z.array(ResourceIdeaSchema),
  newToYou: z.array(ResourceIdeaSchema),
  relevantConnections: z.array(z.object({ conceptId: z.string(), why: z.string() })),
  whyNow: z.string().optional(),
  /** Which layer wrote the analysis: Claude, or the deterministic fallback. */
  analyzedBy: z.enum(["claude", "deterministic"]).optional(),
  /** How the text was obtained: the page, a PDF, a video transcript, a video's description only, or a reader service. */
  readVia: z.enum(["page", "pdf", "transcript", "description", "reader-service"]).optional(),
  /** How this relates to what the user is learning. */
  relevance: z.object({ level: z.enum(["core", "adjacent", "outside"]), reason: z.string() }).optional(),
});
export type Resource = z.infer<typeof ResourceSchema>;

// GET /resources
export const ResourceListResponseSchema = z.object({ resources: z.array(ResourceSchema) });
export type ResourceListResponse = z.infer<typeof ResourceListResponseSchema>;

// POST /resources
export const AddResourceRequestSchema = z.object({ url: z.string().min(1) });
export type AddResourceRequest = z.infer<typeof AddResourceRequestSchema>;

// POST /resources/:id/teach
export const TeachDeltaResponseSchema = z.object({
  resourceId: z.string(),
  /** Short teaching sections, new ideas first. */
  sections: z.array(z.object({ heading: z.string(), body: z.string() })),
  /** Ideas compressed or skipped because the user already understands them. */
  skipped: z.array(z.string()),
  /** The concept "Check my understanding" should test. */
  conceptId: z.string().optional(),
  generatedBy: z.enum(["claude", "deterministic"]),
});
export type TeachDeltaResponse = z.infer<typeof TeachDeltaResponseSchema>;
