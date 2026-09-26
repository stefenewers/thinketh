// Response envelopes the mobile app consumes. Everything inside them is a shared
// contract type; the envelopes themselves are the client's proposal for the API
// surface (see docs/MOBILE-API-EXPECTATIONS.md). Kept here, not in
// packages/contracts, until Nadani confirms them.
import { z } from "zod";
import {
  ClaimSchema,
  ConceptEdgeSchema,
  ConceptSchema,
  DailyBriefSchema,
  DeltaExplanationSchema,
  DevelopmentSchema,
  DiagnosticAnswerSchema,
  DiagramSpecSchema,
  DiagnosticQuestionSchema,
  KnowledgeStateSchema,
  KnowledgeStateTransitionSchema,
  MemoryAidSchema,
  SourceSchema,
} from "@thinketh/contracts";

// GET /brief/today
export const TodayResponseSchema = z.object({
  brief: DailyBriefSchema,
  developments: z.array(DevelopmentSchema),
  sources: z.array(SourceSchema),
  concepts: z.array(ConceptSchema),
  understoodDevelopmentIds: z.array(z.string()),
  recentTransitions: z.array(KnowledgeStateTransitionSchema),
});
export type TodayResponse = z.infer<typeof TodayResponseSchema>;

// GET /developments/:id
export const DevelopmentDetailResponseSchema = z.object({
  development: DevelopmentSchema,
  delta: DeltaExplanationSchema,
  sources: z.array(SourceSchema),
  concepts: z.array(ConceptSchema),
  claims: z.array(ClaimSchema),
});
export type DevelopmentDetailResponse = z.infer<typeof DevelopmentDetailResponseSchema>;

// POST /developments/:id/feedback
export const FeedbackKindSchema = z.enum(["got_it", "already_knew"]);
export type FeedbackKind = z.infer<typeof FeedbackKindSchema>;
export const FeedbackResponseSchema = z.object({
  transitions: z.array(KnowledgeStateTransitionSchema),
});
export type FeedbackResponse = z.infer<typeof FeedbackResponseSchema>;

// POST /diagnostics/select
export type DiagnosticSelectRequest = { userId: string; developmentId?: string; conceptId?: string };
export const DiagnosticSelectResponseSchema = DiagnosticQuestionSchema;

// POST /diagnostics/:id/answer
export type DiagnosticAnswerRequest = { userId: string; answer: string };
export const DiagnosticAnswerResponseSchema = z.object({
  answer: DiagnosticAnswerSchema,
  transition: KnowledgeStateTransitionSchema,
});
export type DiagnosticAnswerResponse = z.infer<typeof DiagnosticAnswerResponseSchema>;

// GET /knowledge
export const KnowledgeResponseSchema = z.object({
  states: z.array(KnowledgeStateSchema),
  concepts: z.array(ConceptSchema),
  edges: z.array(ConceptEdgeSchema),
  recentTransitions: z.array(KnowledgeStateTransitionSchema),
});
export type KnowledgeResponse = z.infer<typeof KnowledgeResponseSchema>;

// GET /knowledge/:conceptId/history
export const ConceptHistoryResponseSchema = z.array(KnowledgeStateTransitionSchema);

// POST /ask
export type AskRequest = { userId: string; question: string };
export const AskResponseSchema = z.object({
  question: z.string(),
  // Trust layering from the design spec: sources vs inference vs you vs unknown.
  sourcesSay: z.array(z.string()),
  thinkethInfers: z.array(z.string()),
  youAlreadyUnderstand: z.array(z.string()),
  stillUncertain: z.array(z.string()),
  citedDevelopmentIds: z.array(z.string()),
  citedConceptIds: z.array(z.string()),
});
export type AskResponse = z.infer<typeof AskResponseSchema>;

// POST /visualize
export type VisualizeRequest = { userId: string; developmentId?: string; conceptId?: string };
export const VisualizeResponseSchema = DiagramSpecSchema;

// POST /make-it-stick
export type MakeItStickRequest = { userId: string; conceptId: string; developmentId?: string };
export const MakeItStickResponseSchema = MemoryAidSchema;

// POST /voice/session
export type VoiceSessionRequest = { userId: string; briefDate: string };
export const VoiceSessionSchema = z.object({
  sessionId: z.string(),
  // ElevenLabs conversation token / signed URL, minted server-side. Null = voice unavailable.
  conversationToken: z.string().nullable(),
  agentId: z.string().nullable(),
  expiresAt: z.string(),
  fallbackScript: z.array(z.string()),
});
export type VoiceSession = z.infer<typeof VoiceSessionSchema>;
