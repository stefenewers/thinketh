/**
 * Backend view of the contracts.
 *
 * Re-exports the shared domain contracts (`@thinketh/contracts`, which mirrors
 * 05-data-contracts.md) unchanged, and adds backend-side types: domain objects
 * the shared file doesn't define yet (Storyline, MemoryItem, VoiceSession) and
 * the HTTP response envelopes. These stay here until the envelopes are agreed
 * with mobile (see docs/MOBILE-API-EXPECTATIONS.md) and moved into
 * packages/contracts through the shared-contract process.
 */
import {
  ClaimSchema,
  ConceptEdgeSchema,
  ConceptSchema,
  DailyBriefSchema,
  DeltaExplanationSchema,
  DevelopmentSchema,
  DiagnosticAnswerSchema,
  DiagnosticQuestionSchema,
  KnowledgeObservationKindSchema,
  KnowledgeStateSchema,
  KnowledgeStateTransitionSchema,
  SourceSchema,
  type Interest,
  type KnowledgeObservationKind,
  type KnowledgeStateTransition,
  type UserProfile,
} from "@thinketh/contracts";
import { z } from "zod";

export * from "@thinketh/contracts";

// ---------------------------------------------------------------------------
// Aliases and derived types
// ---------------------------------------------------------------------------

export const ObservationKindSchema = KnowledgeObservationKindSchema;
export type ObservationKind = KnowledgeObservationKind;
export type PropagatedChange = KnowledgeStateTransition["propagatedChanges"][number];

export const SelectionDebugSchema = DiagnosticQuestionSchema.shape.selectionDebug.unwrap();
export type SelectionDebug = z.infer<typeof SelectionDebugSchema>;

/**
 * Server-side persona profile. The shared `Interest` is `{ topic, weight }`;
 * the backend also needs which concepts each interest covers, for diagnostic
 * selection and "why it matters to you".
 */
export type PersonaInterest = Interest & { conceptIds: string[] };
export type PersonaProfile = Omit<UserProfile, "interests"> & { interests: PersonaInterest[] };

// ---------------------------------------------------------------------------
// Domain objects named in 02-architecture-contract.md but not yet shared
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

// ---------------------------------------------------------------------------
// HTTP request/response envelopes
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
export const FeedbackResponseSchema = z.object({ transitions: z.array(KnowledgeStateTransitionSchema) });
export type FeedbackResponse = z.infer<typeof FeedbackResponseSchema>;

export const DiagnosticSelectRequestSchema = z.object({
  developmentId: z.string().optional(),
  conceptId: z.string().optional(),
});

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

/** Feature flags for hiding unstable features in the app (voice, visualize, …). */
export const AppConfigResponseSchema = z.object({ flags: z.record(z.string(), z.boolean()) });
