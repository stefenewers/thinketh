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
  question: z.string().min(1),
  developmentId: z.string().optional(),
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
