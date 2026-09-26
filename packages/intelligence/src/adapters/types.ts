/**
 * Adapter interfaces (02-architecture-contract.md), extended with the extra
 * reads the service needs. The mobile app never sees these: it only sees the
 * Thinketh domain API.
 */
import type {
  Claim,
  Concept,
  DeltaExplanation,
  Development,
  DiagramSpec,
  KnowledgeObservation,
  KnowledgeState,
  KnowledgeStateTransition,
  MemoryAid,
  MemoryItem,
  Source,
  PersonaProfile,
  VoiceSession,
} from "../contracts.ts";
import type { DiagnosticItem } from "../seed/types.ts";

export type AdapterName = "claude" | "backboard" | "mongo" | "tiger" | "supabase" | "elevenlabs";

export interface MemoryProvider {
  readonly name: "backboard" | "local";
  recall(userId: string, query: string): Promise<MemoryItem[]>;
  remember(userId: string, item: MemoryItem): Promise<void>;
  reset?(userId: string): Promise<void>;
  /** Let the provider extract its own memories from free text (Backboard memory "Auto"). */
  observe?(userId: string, text: string): Promise<void>;
  /** Cheap authenticated call to confirm the integration is live; may return a short detail. */
  probe?(userId: string): Promise<string | void>;
  /** Converge stored memories to exactly `keep` (used by demo reset). */
  reconcile?(userId: string, keep: MemoryItem[]): Promise<{ deleted: number; added: number }>;
}

export type SearchKind = "development" | "concept" | "claim" | "source";

export type SemanticSearchQuery = { text: string; kinds?: SearchKind[]; limit?: number };

export type SemanticSearchResult = { kind: SearchKind; id: string; score: number; text: string };

export interface SemanticStore {
  readonly name: "mongo" | "local";
  upsertDevelopment(input: Development): Promise<void>;
  getDevelopment(id: string): Promise<Development | null>;
  search(query: SemanticSearchQuery): Promise<SemanticSearchResult[]>;
}

export interface TemporalStore {
  readonly name: "tiger" | "local";
  appendObservation(input: KnowledgeObservation): Promise<void>;
  appendTransition(input: KnowledgeStateTransition): Promise<void>;
  /** Oldest first. */
  getConceptHistory(userId: string, conceptId: string): Promise<KnowledgeStateTransition[]>;
  /** Latest `after` state per concept that has any transition. */
  getLatestStates(userId: string): Promise<KnowledgeState[]>;
  /** Newest first. */
  getRecentTransitions(userId: string, limit: number): Promise<KnowledgeStateTransition[]>;
  appendInteraction(input: { userId: string; kind: string; refId?: string; payload?: Record<string, unknown>; at: string }): Promise<void>;
  reset(userId: string): Promise<void>;
}

export type RawSourceBundle = {
  sources: Array<Omit<Source, "id" | "credibility"> & { text: string; credibility?: number }>;
  knownConcepts: Concept[];
};

export type NormalizedDevelopment = {
  development: Development;
  claims: Claim[];
  sources: Source[];
  /** Concepts mentioned that are not yet in the graph. */
  newConcepts: Concept[];
  mentalModelShift: { before: string; after: string };
};

export type LearningContext = {
  concept: Concept;
  state: KnowledgeState | undefined;
  profile: PersonaProfile;
  relatedConcepts: Concept[];
  claims: Claim[];
  development?: Development;
  memories: MemoryItem[];
};

export type DeltaPhrasingContext = {
  delta: DeltaExplanation;
  development: Development;
  profile: PersonaProfile;
  memories: MemoryItem[];
};

/**
 * Ask is layered for trust. The service assembles the verbatim layers
 * (sourcesSay, youAlreadyUnderstand, stillUncertain) deterministically; the
 * model only writes `thinkethInfers`, grounded in those layers.
 */
export type AskContext = {
  question: string;
  profile: PersonaProfile;
  memories: MemoryItem[];
  sourcesSay: string[];
  youAlreadyUnderstand: string[];
  stillUncertain: string[];
  /** Mental-model shift of the most relevant development, if any. */
  shift?: { before: string; after: string };
  /** Weakest cited concept, for a personal note. */
  focus?: { name: string; mastery: number; misconception?: string };
};

export type AskResult = { thinkethInfers: string[] };

export type ShortAnswerGrade = { coveredIdeaIndices: number[]; misconception?: string; feedback: string };

export interface IntelligenceModel {
  readonly name: "claude" | "deterministic";
  normalizeDevelopment(input: RawSourceBundle): Promise<NormalizedDevelopment>;
  /** Rephrase a deterministic delta. Must keep ids and structure; never touches numbers. */
  explainDelta(input: DeltaPhrasingContext): Promise<DeltaExplanation>;
  generateDiagnostic(input: LearningContext): Promise<DiagnosticItem>;
  gradeShortAnswer(input: { item: DiagnosticItem; answer: string }): Promise<ShortAnswerGrade>;
  makeItStick(input: LearningContext): Promise<MemoryAid>;
  visualize(input: LearningContext): Promise<DiagramSpec>;
  ask(input: AskContext): Promise<AskResult>;
}

export type VoiceContext = { userId: string; displayName: string; script: string[]; briefDate: string; minutes: number };

export interface VoiceProvider {
  readonly name: "elevenlabs" | "transcript";
  createSession(input: VoiceContext): Promise<VoiceSession>;
}
