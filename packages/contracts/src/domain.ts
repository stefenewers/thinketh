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
  /**
   * Optional (additive): when Thinketh's discovery pipeline first found this development.
   * `happenedAt` stays the sources' own publication time, so an old article found today
   * never reads as published today.
   */
  discoveredAt: z.string().optional(),
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
