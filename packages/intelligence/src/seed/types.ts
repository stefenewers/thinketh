import type {
  Claim,
  Concept,
  ConceptEdge,
  DiagnosticQuestion,
  DiagramSpec,
  Development,
  KnowledgeState,
  KnowledgeStateTransition,
  MemoryAid,
  MemoryItem,
  PersonaProfile,
  Source,
  Storyline,
} from "../contracts.ts";

/** Server-only development metadata that the public Development contract does not carry. */
export type DevelopmentMeta = {
  readMinutes: number;
  /** How the field's model shifts because of this development. */
  mentalModelShift: { before: string; after: string };
  /** Claims introduced by this development (vs. claims it merely references). */
  newClaimIds: string[];
  /** A claim that pushes back on the headline, surfaced as nuance. */
  nuanceClaimId?: string;
};

/**
 * Server-only diagnostic item. The answer key never leaves the server:
 * `toPublicQuestion` strips everything below `expectedConcepts`.
 */
export type DiagnosticItem = Omit<DiagnosticQuestion, "selectionDebug"> & {
  /** Multiple choice: correctness (0..1) per choice index. */
  choiceCorrectness?: number[];
  /** Multiple choice: feedback per choice index. */
  choiceFeedback?: string[];
  /** Multiple choice: misconception flag revealed by picking this choice. */
  choiceMisconception?: Array<string | null>;
  /** Short answer: grading rubric (key ideas) for Claude or keyword fallback. */
  rubric?: Array<{ idea: string; keywords: string[] }>;
  /** Completes "Updated because you correctly answered …" in transition reasons. */
  evidencePhrase?: string;
  /** Misconception this question is designed to probe (cleared on a correct answer). */
  targetsMisconception?: string;
};

export type IngestionStats = {
  processedItems: number;
  skipped: Record<string, number>;
};

export type SeedCorpus = {
  profile: PersonaProfile;
  concepts: Concept[];
  edges: ConceptEdge[];
  sources: Source[];
  claims: Claim[];
  developments: Development[];
  developmentMeta: Record<string, DevelopmentMeta>;
  /** Established claims per concept that someone with mastery already knows. */
  baselineClaimIds: Record<string, string[]>;
  storylines: Storyline[];
  baselineStates: KnowledgeState[];
  /** Prior transitions for the persona (oldest first), consistent with baselineStates. */
  history: KnowledgeStateTransition[];
  diagnostics: DiagnosticItem[];
  memories: MemoryItem[];
  diagrams: Record<string, DiagramSpec>;
  memoryAids: Record<string, MemoryAid>;
  ingestion: IngestionStats;
};
