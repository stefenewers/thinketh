/**
 * ThinkethService: the domain operations behind the HTTP API.
 *
 * Numbers (mastery, uncertainty, priority) always come from the deterministic
 * engine. Sponsor adapters are called through `guarded`, so each one has a
 * timeout and a local fallback, and none of them can block the golden path.
 */
import type {
  AskResponse,
  BriefResponse,
  Claim,
  Concept,
  ConceptEdge,
  ConceptHistoryResponse,
  DeltaExplanation,
  Development,
  DevelopmentDetailResponse,
  DiagnosticAnswerResponse,
  DiagnosticSelectResponse,
  VisualizationSpec,
  FeedbackKind,
  FeedbackResponse,
  KnowledgeResponse,
  KnowledgeState,
  KnowledgeStateTransition,
  MemoryAid,
  MemoryItem,
  Source,
  Storyline,
  PersonaProfile,
  Resource,
  TeachDeltaResponse,
  VoiceSession,
  DiscoveryAccounting,
  IdentityKind,
  LearnerProfile,
  ProfileResponse,
  PreparedLesson,
} from "./contracts.ts";
import { CONCEPT_LABELS } from "./contracts.ts";
import { adapterHealth, circuitOpen, guarded, recordCall, runInBackground, withTimeout } from "./adapters/guard.ts";
import { BackboardMemory } from "./adapters/memory.ts";
import { ClaudeModel } from "./adapters/model/claude.ts";
import { assertsKnowledgeNumber, isManipulation } from "./memoryGuard.ts";
import { MongoSemanticStore } from "./adapters/semantic.ts";
import { ElevenLabsVoice } from "./adapters/voice.ts";
import type { Adapters } from "./adapters/registry.ts";
import { lexicalScore } from "./adapters/model/deterministic.ts";
import type { AdapterName, AskContext, LearningContext, NormalizedDevelopment, RawSourceBundle, VisualizeContext } from "./adapters/types.ts";
import type { ThinkethConfig } from "./config.ts";
import { buildBrief } from "./engine/brief.ts";
import { computeDelta, focusConceptId } from "./engine/delta.ts";
import { evaluateMultipleChoice, evaluateShortAnswerKeywords, InvalidAnswerError, scoreRubric, type Evaluation } from "./engine/evaluation.ts";
import { knowledgeLevel, transition, type Graph, type TransitionResult, type UpdateOptions } from "./engine/knowledgeState.ts";
import { kindForCorrectness, makeObservation } from "./engine/observations.ts";
import { deterministicExchange, pitchFor, validateExchange, type ExchangeContext, type ExchangeGap, type ExchangeMaterial } from "./engine/exchange.ts";
import { hasGroundedChallenge, sanitizeDraft, TransferNotAssessableError, validateTransferDraft, type TransferContext, type TransferDraft } from "./engine/transfer.ts";
import { explainSelection, pickItem, scoreConcepts, toPublicQuestion } from "./engine/selection.ts";
import { logEvent } from "./log.ts";
import { MISCONCEPTIONS } from "./seed/misconceptions.ts";
import { TRANSFER_QUESTION_FOR } from "./seed/personas.ts";
import type { DevelopmentMeta, DiagnosticItem, SeedCorpus } from "./seed/types.ts";
import { DAY_MS, firstSentence, newId, round } from "./util.ts";
import {
  enforceAnalysis,
  inferSourceType,
  MAX_EXCERPT_CHARS,
  publisherFromUrl,
  readMinutes,
  usefulMinutes,
  type ConceptView,
  type TeachContext,
} from "./resources/analyze.ts";
import { fetchPage, ResourceReadError, validateUrl, youtubeId } from "./resources/fetchPage.ts";
import type { LearnerProfileRow } from "./adapters/supabase.ts";
import type { DiscoveryRunRecord } from "./discovery/types.ts";
import { conceptsForInterest, DEMO_LEARNER_PROFILE, depthOf, toPersonaProfile } from "./profile/learnerProfile.ts";
import type { DocStore } from "./store/docStore.ts";

/** Background analysis of a saved resource: nobody waits on it, so Claude gets room. */
const RESOURCE_ANALYSIS_TIMEOUT_MS = 50_000;
/** How long a fetched page is shared between readers of the same URL. */
const SHARED_PAGE_TTL_MS = 10 * 60_000;
const SHARED_PAGE_MAX = 40;
const MAX_QUEUE = 30;
const READ_FAILED = "Thinketh couldn't reliably read this source yet.";

export class NotFoundError extends Error {}
export class BadRequestError extends Error {}
/** Not allowed for this identity (e.g. resetting a real user, editing a demo persona's profile). */
export class ForbiddenError extends Error {}
/** The same operation is already in progress. */
export class ConflictError extends Error {}
export { InvalidAnswerError };

const MEMORY_TIMEOUT_MS = 2000;
/** A saved read is resumed after an interrupted run this many times before it's shown as failed. */
const MAX_READ_ATTEMPTS = 2;
const INTERRUPTED = "Reading was interrupted. Save it again to retry.";
/** A pending answer claim younger than this is still being recorded by another request. */
const PENDING_OPERATION_MS = 60_000;
const PROFILE_TTL_MS = 60_000;
/** A discovered development stays brief-eligible this long after it was found. */
const BRIEF_WINDOW_DAYS = 7;
const MAX_BRIEF_CANDIDATES = 12;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Where a person with no evidence starts: low mastery, HIGH uncertainty and zero evidence. It is a
 * prior, not a measurement. The first observations move it quickly because uncertainty is high.
 */
export const NO_EVIDENCE_PRIOR = { mastery: 0.2, confidence: 0.2, uncertainty: 0.7, evidenceCount: 0 } as const;

type StoredResource = Resource & { ownerId: string; attempts?: number };
type OperationRecord = { status: "pending" | "done"; at: string; result?: DiagnosticAnswerResponse };

async function digest(text: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return [...bytes.slice(0, 12)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function profileFromRow(row: LearnerProfileRow): LearnerProfile {
  return {
    displayName: row.display_name?.trim() || "You",
    interests: Array.isArray(row.interests) ? row.interests.filter((x): x is string => typeof x === "string") : [],
    goals: row.goals ?? [],
    teaching: row.explanation_preferences ?? [],
    completedAt: row.created_at ?? null,
  };
}
const PROBE_TIMEOUT_MS = 6000;
const SEMANTIC_TIMEOUT_MS = 3000;
const VOICE_TIMEOUT_MS = 5000;
/** Backboard "Auto" extraction runs an LLM turn, so it only ever runs in the background. */
const MEMORY_OBSERVE_TIMEOUT_MS = 45_000;

/** "What am I weakest on?": a question about the learner's knowledge state, not about sources. */
const SELF_ASSESSMENT = /\b(i|my|me)\b.*\b(weak(est)?|strong(est)?|gaps?|blind spots?)\b|\b(weak(est)?|strong(est)?|gaps?)\b.*\b(i|my|me)\b/i;

/** Concepts the question names by acronym ("MCP" -> Model Context Protocol), which word search misses. */
function conceptsByAcronym(question: string, concepts: Iterable<Concept>): Concept[] {
  const named: Concept[] = [];
  for (const c of concepts) {
    // "Model Context Protocol" -> MCP; "Retrieval (RAG)" -> RAG, as written.
    const words = c.name.replace(/\(.*?\)/g, "").split(/\s+/).filter((w) => /^[a-z]/i.test(w));
    const acronyms = [...(c.name.match(/\(([A-Za-z]{2,})\)/)?.slice(1) ?? []), ...(words.length >= 2 ? [words.map((w) => w[0]).join("")] : [])];
    if (acronyms.some((a) => new RegExp(`\\b${a}\\b`, "i").test(question))) named.push(c);
  }
  return named;
}

export class ThinkethService {
  private readonly concepts = new Map<string, Concept>();
  private readonly claims = new Map<string, Claim>();
  private readonly sources = new Map<string, Source>();
  private readonly developments = new Map<string, Development>();
  private readonly meta: Record<string, DevelopmentMeta>;
  private readonly storylines = new Map<string, Storyline>();
  private readonly diagnostics = new Map<string, DiagnosticItem>();
  private readonly sharedPages = new Map<string, { at: number; p: ReturnType<typeof fetchPage> }>();
  private readonly phrasedDeltas = new Map<string, DeltaExplanation>();
  private readonly generated = new Map<string, VisualizationSpec | MemoryAid>();
  private readonly userLocks = new Map<string, Promise<unknown>>();
  private readonly config: ThinkethConfig;
  private readonly seed: SeedCorpus;
  private readonly adapters: Adapters;
  private readonly now: () => Date;

  constructor(config: ThinkethConfig, seed: SeedCorpus, adapters: Adapters, now: () => Date = () => new Date()) {
    this.config = config;
    this.seed = seed;
    this.adapters = adapters;
    this.now = now;
    for (const c of seed.concepts) this.concepts.set(c.id, c);
    for (const c of seed.claims) this.claims.set(c.id, c);
    for (const s of seed.sources) this.sources.set(s.id, s);
    for (const d of seed.developments) this.developments.set(d.id, d);
    for (const s of seed.storylines) this.storylines.set(s.id, s);
    for (const q of seed.diagnostics) this.diagnostics.set(q.id, q);
    this.meta = { ...seed.developmentMeta };
  }

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  private graph(): Graph {
    return { concepts: this.concepts, edges: this.seed.edges };
  }

  private get store(): DocStore {
    return this.adapters.store;
  }

  /** Seeded demo personas: explicit, resettable, with a fixed profile and seeded history. */
  isDemoIdentity(userId: string): boolean {
    return this.isDemoLearner(userId) || !!this.seed.personas[userId];
  }

  /** The demo learner (Stefen), or an explicitly configured rehearsal clone of it. */
  private isDemoLearner(userId: string): boolean {
    const prefix = this.config.identity.demoAliasPrefix;
    return userId === this.config.demoUserId || (!!prefix && userId.startsWith(prefix));
  }

  /**
   * Claims this person's answers may draw on. The seeded corpus is illustrative demo data, so it
   * grounds only the demo personas; everyone else is grounded in what discovery actually read.
   */
  claimsFor(scope: string | "live" | "demo"): Claim[] {
    const demo = scope === "demo" || (scope !== "live" && this.isDemoIdentity(scope));
    return [...this.claims.values()].filter((c) => this.discoveredClaimIds.has(c.id) !== demo);
  }

  /** The concepts in this person's Mind: demo personas keep the seeded graph; everyone else also gets discovered concepts. */
  conceptsFor(userId: string): Concept[] {
    const all = [...this.concepts.values()];
    return this.isDemoIdentity(userId) ? all.filter((c) => !this.discoveredConceptIds.has(c.id)) : all;
  }

  profileFor(userId: string): PersonaProfile {
    const persona = this.seed.personas[userId];
    if (persona || this.isDemoLearner(userId)) {
      return { ...this.seed.profile, id: userId, ...(persona ? { displayName: persona.displayName } : {}) };
    }
    // Loaded by prepareUser()/loadProfile() before any request uses it; empty until onboarding is saved.
    return toPersonaProfile(userId, this.learnerProfiles.get(userId)?.profile ?? null, this.conceptsFor(userId));
  }

  /**
   * Demo personas start from their seeded baseline. Everyone else starts with NO baseline: every
   * concept gets the conservative prior below, and nothing moves until there is an observation.
   */
  private baselineFor(userId: string): KnowledgeState[] {
    if (this.seed.personas[userId]) return this.seed.personas[userId]!.baselineStates;
    return this.isDemoLearner(userId) ? this.seed.baselineStates : [];
  }

  /** Baseline (demo personas) or the no-evidence prior, overlaid with temporal history. */
  async statesFor(userId: string): Promise<Map<string, KnowledgeState>> {
    const states = new Map<string, KnowledgeState>();
    for (const s of this.baselineFor(userId)) states.set(s.conceptId, { ...s, userId });
    for (const c of this.conceptsFor(userId)) {
      if (!states.has(c.id)) states.set(c.id, { userId, conceptId: c.id, ...NO_EVIDENCE_PRIOR, lastObservedAt: this.now().toISOString(), misconceptionFlags: [] });
    }
    for (const s of await this.adapters.temporal.getLatestStates(userId)) if (states.has(s.conceptId)) states.set(s.conceptId, s);
    return states;
  }

  // -------------------------------------------------------------------------
  // Learner profiles (server-side, per verified identity)
  // -------------------------------------------------------------------------

  private readonly learnerProfiles = new Map<string, { at: number; profile: LearnerProfile | null }>();

  /** Everything a request needs loaded before synchronous reads (profileFor): the corpus and the profile. */
  async prepareUser(userId: string): Promise<void> {
    await this.ensureCorpus();
    await this.loadProfile(userId);
  }

  /** The saved learner profile, or null before onboarding. Demo personas answer with their seeded frame. */
  async loadProfile(userId: string): Promise<LearnerProfile | null> {
    if (this.isDemoIdentity(userId)) return { ...DEMO_LEARNER_PROFILE, displayName: this.profileFor(userId).displayName };
    const cached = this.learnerProfiles.get(userId);
    if (cached && Date.now() - cached.at < PROFILE_TTL_MS) return cached.profile;
    const { supabase } = this.adapters;
    const fromStore = async () => (await this.store.get<LearnerProfile>("profiles", userId)) ?? null;
    const profile = (
      await guarded(
        "supabase",
        "getProfile",
        supabase && UUID.test(userId)
          ? async () => {
              const row = await supabase.getProfile(userId);
              return row ? profileFromRow(row) : await fromStore();
            }
          : undefined,
        fromStore,
        MEMORY_TIMEOUT_MS,
      )
    ).value;
    this.learnerProfiles.set(userId, { at: Date.now(), profile });
    return profile;
  }

  /** Save onboarding / profile edits. Preferences only: this never touches the knowledge state. */
  async saveProfile(userId: string, input: Omit<LearnerProfile, "completedAt"> & { completedAt?: string | null }): Promise<LearnerProfile> {
    if (this.isDemoIdentity(userId)) throw new ForbiddenError("The demo persona's profile is part of the seeded demo.");
    const previous = await this.loadProfile(userId);
    const profile: LearnerProfile = {
      displayName: input.displayName.trim(),
      interests: [...new Set(input.interests)],
      goals: [...new Set(input.goals)],
      teaching: [...new Set(input.teaching)],
      completedAt: previous?.completedAt ?? input.completedAt ?? this.now().toISOString(),
    };
    await this.store.put("profiles", userId, profile, userId);
    const { supabase } = this.adapters;
    await guarded(
      "supabase",
      "upsertProfile",
      supabase && UUID.test(userId)
        ? () => supabase.upsertProfile(userId, { display_name: profile.displayName, interests: profile.interests, goals: profile.goals, explanation_preferences: profile.teaching })
        : undefined,
      () => undefined,
      MEMORY_TIMEOUT_MS,
    );
    this.learnerProfiles.set(userId, { at: Date.now(), profile });
    // Phrasing followed the old preferences.
    for (const k of this.phrasedDeltas.keys()) if (k.startsWith(`${userId}|`)) this.phrasedDeltas.delete(k);
    logEvent("profile.saved", { userId, interests: profile.interests, teaching: profile.teaching });
    return profile;
  }

  async profileResponse(userId: string, kind: IdentityKind): Promise<ProfileResponse> {
    const profile = await this.loadProfile(userId);
    const concepts = this.conceptsFor(userId);
    return {
      profile,
      identity: { userId, kind, displayName: profile?.displayName ?? this.profileFor(userId).displayName },
      editable: !this.isDemoIdentity(userId),
      coverage: (profile?.interests ?? []).map((interest) => ({ interest, conceptIds: conceptsForInterest(interest, concepts) })),
    };
  }

  /** Serialize state-changing operations per user so double taps can't race. */
  private withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.userLocks.get(userId) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.userLocks.set(
      userId,
      next.catch(() => undefined),
    );
    return next;
  }

  private async persist(result: TransitionResult): Promise<void> {
    const t = this.adapters.temporal;
    await t.appendObservation(result.transition.observation);
    await t.appendTransition(result.transition);
    for (const p of result.propagatedTransitions) {
      await t.appendObservation(p.observation);
      await t.appendTransition(p);
    }
    logEvent("knowledge.transition", {
      userId: result.transition.userId,
      conceptId: result.transition.conceptId,
      kind: result.transition.observation.kind,
      mastery: [result.transition.before.mastery, result.transition.after.mastery],
      uncertainty: [result.transition.before.uncertainty, result.transition.after.uncertainty],
      propagated: result.transition.propagatedChanges.map((p) => p.conceptId),
    });
  }

  private async observe(
    userId: string,
    conceptId: string,
    kind: Parameters<typeof makeObservation>[0]["kind"],
    extra: { correctness?: number; sourceRef?: string; options?: UpdateOptions; states?: Map<string, KnowledgeState>; observationId?: string } = {},
  ): Promise<TransitionResult> {
    const now = this.now();
    const states = extra.states ?? (await this.statesFor(userId));
    const observation = makeObservation({
      userId,
      conceptId,
      kind,
      ...(extra.correctness !== undefined ? { correctness: extra.correctness } : {}),
      ...(extra.sourceRef ? { sourceRef: extra.sourceRef } : {}),
      ...(extra.observationId ? { id: extra.observationId } : {}),
      now,
    });
    const result = transition({ states, observation, graph: this.graph(), now, ...(extra.options ? { options: extra.options } : {}) });
    await this.persist(result);
    for (const s of result.updatedStates) states.set(s.conceptId, s);
    return result;
  }

  // -------------------------------------------------------------------------
  // Sponsor-backed helpers
  // -------------------------------------------------------------------------

  private async recall(userId: string, query: string): Promise<MemoryItem[]> {
    const { memory, localMemory } = this.adapters;
    const items = (
      await guarded("backboard", "recall", memory ? () => memory.recall(userId, query) : undefined, () => localMemory.recall(userId, query), MEMORY_TIMEOUT_MS)
    ).value;
    // Knowledge-state numbers come only from the engine; drop any memory that claims one, however it got stored.
    const kept = items.filter((m) => !assertsKnowledgeNumber(m.content));
    if (kept.length < items.length) logEvent("memory.filtered", { userId, dropped: items.length - kept.length }, "warn");
    return kept;
  }

  private async remember(userId: string, item: MemoryItem): Promise<void> {
    const { memory, localMemory } = this.adapters;
    await localMemory.remember(userId, item);
    await guarded("backboard", "remember", memory ? () => memory.remember(userId, item) : undefined, () => undefined, MEMORY_TIMEOUT_MS);
  }

  /** Hand free text to Backboard (memory "Auto") so it extracts preferences and topics. Never awaited by the UI. */
  private observeInBackground(userId: string, text: string): void {
    const { memory } = this.adapters;
    if (!memory?.observe) return;
    runInBackground(
      "backboard.observe",
      guarded("backboard", "observe", () => memory.observe!(userId, text), () => undefined, MEMORY_OBSERVE_TIMEOUT_MS),
    );
  }

  private async getDevelopment(id: string): Promise<Development> {
    const { semantic } = this.adapters;
    const local = this.developments.get(id) ?? null;
    const found = (
      await guarded("mongo", "getDevelopment", semantic ? async () => (await semantic.getDevelopment(id)) ?? local : undefined, () => local, SEMANTIC_TIMEOUT_MS)
    ).value;
    if (!found) throw new NotFoundError(`Development not found: ${id}`);
    return found;
  }

  private model() {
    return this.adapters.model;
  }

  /** For Claude calls a request waits on: the fallback must arrive before the client gives up. */
  private claudeTimeout(): number {
    return Math.min(this.config.anthropic.timeoutMs, this.config.anthropic.requestTimeoutMs);
  }

  /** Diagnostic select/answer sit under the client's normal 8s timeout. */
  private diagnosticClaudeTimeout(): number {
    return Math.min(this.claudeTimeout(), 6000);
  }

  /** For background work nobody waits on (delta phrasing warm-up). */
  private backgroundClaudeTimeout(): number {
    return this.config.anthropic.timeoutMs;
  }

  // -------------------------------------------------------------------------
  // Today
  // -------------------------------------------------------------------------

  /** Calendar day (in the configured time zone) of an ISO timestamp. */
  private localDay(iso: string | Date): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: this.config.timeZone }).format(new Date(iso));
  }

  /** Newest first, primary transitions only (propagated side effects excluded). */
  private async recentPrimaryTransitions(userId: string, limit = 20, { withSeedHistory = false } = {}): Promise<KnowledgeStateTransition[]> {
    const recent = await this.adapters.temporal.getRecentTransitions(userId, 200);
    // Mind tells the whole story, seeded history included, so a fresh store doesn't read "0 changes".
    // The brief keeps only live changes: Today reads them as what you did today.
    const seen = new Set<string>();
    return [...recent, ...(withSeedHistory ? this.seedHistory(userId) : [])]
      .filter((t) => !t.observation.sourceRef?.startsWith("propagated:") && !seen.has(t.id) && (seen.add(t.id), true))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async brief(userId: string): Promise<BriefResponse> {
    await this.prepareUser(userId);
    if (!this.isDemoIdentity(userId)) await this.syncWithLatestRun();
    const states = await this.statesFor(userId);
    const demo = this.isDemoIdentity(userId);
    const built = buildBrief({
      developments: this.developmentsFor(userId),
      meta: this.meta,
      states,
      profile: this.profileFor(userId),
      // Fixture counts belong to the seeded demo only; a real brief reports its recorded run.
      ingestion: demo ? this.seed.ingestion : { processedItems: 0, skipped: {} },
      now: this.now(),
      timeZone: this.config.timeZone,
    });
    const { ordered } = built;
    const pipeline = demo ? this.demoAccounting(built) : await this.liveAccounting(built);
    // Live: the filtered numbers are the run's source items; developments this person already
    // understands are counted separately (pipeline.developmentsAlreadyUnderstood), never mixed in.
    const brief = demo ? built.brief : { ...built.brief, skippedCount: pipeline.itemsFiltered, skippedBreakdown: pipeline.filteredBreakdown };
    logEvent("brief.built", { userId, meaningful: brief.meaningfulCount, skipped: brief.skippedBreakdown, hero: brief.heroDevelopmentId });
    // Warm the Claude phrasing of the hero card so the first tap is already personalized.
    const hero = ordered[0];
    if (hero) runInBackground("warm-delta", this.phrasedDelta(userId, hero, states));

    const recentTransitions = await this.recentPrimaryTransitions(userId);
    const today = this.localDay(this.now());
    const passedToday = new Set(
      recentTransitions
        .filter((t) => t.observation.kind === "diagnostic_correct" && this.localDay(t.createdAt) === today)
        .map((t) => t.conceptId),
    );
    const sourceIds = new Set(ordered.flatMap((d) => d.sourceIds));
    return {
      brief,
      developments: ordered,
      sources: [...this.sources.values()].filter((s) => sourceIds.has(s.id)),
      concepts: [...this.concepts.values()],
      understoodDevelopmentIds: ordered.filter((d) => d.conceptIds[0] && passedToday.has(d.conceptIds[0])).map((d) => d.id),
      recentTransitions,
      pipeline,
    };
  }

  /** The seeded demo's illustrative ingestion counts, labeled as such (mode "demo_fixture"). */
  private demoAccounting(built: ReturnType<typeof buildBrief>): DiscoveryAccounting {
    const fixture = this.seed.ingestion;
    const filteredBreakdown = { ...fixture.skipped };
    const itemsFiltered = Object.values(filteredBreakdown).reduce((a, b) => a + b, 0);
    return {
      mode: "demo_fixture",
      sourcesChecked: 0,
      sourcesFailed: 0,
      itemsInspected: fixture.processedItems,
      itemsFiltered,
      filteredBreakdown,
      developmentsProduced: fixture.processedItems - itemsFiltered,
      developmentsAvailable: built.ordered.length + built.alreadyUnderstood,
      developmentsSelected: built.ordered.length,
      developmentsAlreadyUnderstood: built.alreadyUnderstood,
    };
  }

  /** The last successful discovery run's recorded accounting (never fixture numbers). */
  private async liveAccounting(built: ReturnType<typeof buildBrief>): Promise<DiscoveryAccounting> {
    const run = await this.store.get<DiscoveryRunRecord>("discovery_state", "last_successful_run");
    const base = {
      developmentsAvailable: this.discoveredDevelopmentIds.size,
      developmentsSelected: built.ordered.length,
      developmentsAlreadyUnderstood: built.alreadyUnderstood,
    };
    if (!run) return { mode: "none", sourcesChecked: 0, sourcesFailed: 0, itemsInspected: 0, itemsFiltered: 0, filteredBreakdown: {}, developmentsProduced: 0, ...base };
    return {
      mode: "live",
      runId: run.id,
      startedAt: run.startedAt,
      ...(run.finishedAt ? { finishedAt: run.finishedAt } : {}),
      status: run.status === "partial" ? "partial" : run.status === "failed" ? "failed" : "succeeded",
      sourcesChecked: run.sources.length,
      sourcesFailed: run.sources.filter((x) => x.error).length,
      itemsInspected: run.itemsInspected,
      itemsFiltered: Object.values(run.filtered).reduce((a, b) => a + b, 0),
      filteredBreakdown: { ...run.filtered },
      developmentsProduced: run.developmentIds.length,
      ...base,
    };
  }

  // -------------------------------------------------------------------------
  // Corpus: the seeded demo corpus plus everything discovery has stored
  // -------------------------------------------------------------------------

  private readonly discoveredConceptIds = new Set<string>();
  private readonly discoveredDevelopmentIds = new Set<string>();
  private readonly discoveredClaimIds = new Set<string>();
  private corpusLoad: Promise<void> | undefined;

  /** Load the stored corpus once (retried on the next request if the store was unreachable). */
  ensureCorpus(): Promise<void> {
    this.corpusLoad ??= this.loadCorpus().catch((err) => {
      this.corpusLoad = undefined;
      logEvent("corpus.load_failed", { error: String(err) }, "warn");
    });
    return this.corpusLoad;
  }

  /** A run in another process (the CLI, another host) stored developments this process hasn't loaded yet. */
  private async syncWithLatestRun(): Promise<void> {
    const run = await this.store.get<DiscoveryRunRecord>("discovery_state", "last_successful_run");
    if (run?.developmentIds.some((id) => !this.developments.has(id))) {
      this.corpusLoad = this.loadCorpus();
      await this.corpusLoad;
    }
  }

  private async loadCorpus(): Promise<void> {
    const [developments, claims, sources, concepts, metas] = await Promise.all([
      this.store.list<Development>("corpus_developments", undefined, 2000),
      this.store.list<Claim>("corpus_claims", undefined, 10_000),
      this.store.list<Source>("corpus_sources", undefined, 5000),
      this.store.list<Concept>("corpus_concepts", undefined, 1000),
      this.store.list<DevelopmentMeta & { developmentId: string }>("corpus_meta", undefined, 2000),
    ]);
    for (const c of concepts) {
      if (this.seed.concepts.some((x) => x.id === c.id)) continue;
      this.concepts.set(c.id, c);
      this.discoveredConceptIds.add(c.id);
    }
    for (const c of claims) {
      this.claims.set(c.id, c);
      this.discoveredClaimIds.add(c.id);
    }
    for (const x of sources) this.sources.set(x.id, x);
    for (const { developmentId, ...m } of metas) this.meta[developmentId] = m;
    for (const d of developments) {
      this.developments.set(d.id, d);
      this.discoveredDevelopmentIds.add(d.id);
    }
    if (developments.length) logEvent("corpus.loaded", { developments: developments.length, claims: claims.length, sources: sources.length, concepts: concepts.length });
  }

  /** Store a normalized development (discovery, /admin/ingest) so every later brief and restart sees it. */
  async addToCorpus(value: NormalizedDevelopment, discoveredAt: string): Promise<Development> {
    await this.ensureCorpus();
    const development: Development = { ...value.development, discoveredAt };
    const meta: DevelopmentMeta = {
      readMinutes: round(Math.max(1, value.claims.length * 0.5), 1),
      mentalModelShift: value.mentalModelShift,
      newClaimIds: value.claims.map((c) => c.id),
    };
    for (const c of value.newConcepts) {
      if (this.concepts.has(c.id)) continue;
      this.concepts.set(c.id, c);
      this.discoveredConceptIds.add(c.id);
      await this.store.put("corpus_concepts", c.id, c);
    }
    for (const c of value.claims) {
      this.claims.set(c.id, c);
      this.discoveredClaimIds.add(c.id);
      await this.store.put("corpus_claims", c.id, c);
    }
    for (const x of value.sources) {
      this.sources.set(x.id, x);
      await this.store.put("corpus_sources", x.id, x);
    }
    this.meta[development.id] = meta;
    await this.store.put("corpus_meta", development.id, { developmentId: development.id, ...meta });
    this.developments.set(development.id, development);
    this.discoveredDevelopmentIds.add(development.id);
    await this.store.put("corpus_developments", development.id, development);
    const { semantic } = this.adapters;
    await guarded("mongo", "upsertDevelopment", semantic ? () => semantic.upsertDevelopment(development) : undefined, () => undefined, SEMANTIC_TIMEOUT_MS);
    return development;
  }

  /**
   * Candidate developments for this person's brief. Demo personas read the seeded demo corpus;
   * everyone else reads what discovery actually found (recent first), never the illustrative seed.
   */
  private developmentsFor(userId: string): Development[] {
    const all = [...this.developments.values()];
    if (this.isDemoIdentity(userId)) return all.filter((d) => !this.discoveredDevelopmentIds.has(d.id));
    const discovered = all
      .filter((d) => this.discoveredDevelopmentIds.has(d.id))
      .sort((a, b) => (b.discoveredAt ?? b.happenedAt).localeCompare(a.discoveredAt ?? a.happenedAt));
    const cutoff = new Date(this.now().getTime() - BRIEF_WINDOW_DAYS * DAY_MS).toISOString();
    const recent = discovered.filter((d) => (d.discoveredAt ?? d.happenedAt) >= cutoff);
    return (recent.length ? recent : discovered).slice(0, MAX_BRIEF_CANDIDATES);
  }

  // -------------------------------------------------------------------------
  // Development detail + delta
  // -------------------------------------------------------------------------

  /**
   * How much of the delta to show, from the person's teaching choices ("Concise explanations" keeps
   * the two most important items per section; "Go deep" keeps everything). Presentation only: the
   * items, their order and every number stay the engine's.
   */
  private atDepth(delta: DeltaExplanation, userId: string): DeltaExplanation {
    if (depthOf(this.profileFor(userId).explanationPreferences) !== "concise") return delta;
    return {
      ...delta,
      whatHappened: delta.whatHappened.slice(0, 2),
      alreadyKnew: delta.alreadyKnew.slice(0, 2),
      whatChanged: delta.whatChanged.slice(0, 2),
      affectedConcepts: delta.affectedConcepts.slice(0, 2),
    };
  }

  deterministicDelta(userId: string, development: Development, states: Map<string, KnowledgeState>): DeltaExplanation {
    return computeDelta({
      userId,
      development,
      meta: this.meta[development.id],
      profile: this.profileFor(userId),
      states,
      concepts: this.concepts,
      edges: this.seed.edges,
      claims: this.claims,
      baselineClaimIds: this.seed.baselineClaimIds,
    });
  }

  private deltaCacheKey(userId: string, development: Development, states: Map<string, KnowledgeState>): string {
    const sig = development.conceptIds.map((id) => `${id}:${states.get(id)?.mastery.toFixed(2)}`).join(",");
    return `${userId}|${development.id}|${sig}`;
  }

  /** Claude-phrased delta, cached per user/development/state. Falls back to the deterministic delta. */
  private async phrasedDelta(userId: string, development: Development, states: Map<string, KnowledgeState>): Promise<DeltaExplanation> {
    const key = this.deltaCacheKey(userId, development, states);
    const cached = this.phrasedDeltas.get(key);
    if (cached) return cached;
    const delta = this.deterministicDelta(userId, development, states);
    const model = this.model();
    if (!model || !this.config.claudeDeltaPhrasing) return delta;
    const memories = await this.recall(userId, development.title);
    const result = await guarded(
      "claude",
      "explainDelta",
      () => model.explainDelta({ delta, development, profile: this.profileFor(userId), memories }),
      () => delta,
      this.backgroundClaudeTimeout(),
    );
    if (result.source === "live") this.phrasedDeltas.set(key, result.value);
    return result.value;
  }

  async development(userId: string, id: string): Promise<DevelopmentDetailResponse & { deltaSource: "claude" | "deterministic" }> {
    const development = await this.getDevelopment(id);
    const states = await this.statesFor(userId);
    const cached = this.phrasedDeltas.get(this.deltaCacheKey(userId, development, states));
    // Never make the detail screen wait on Claude: serve the cached phrasing or the deterministic delta, and warm the cache.
    const delta = this.atDepth(cached ?? this.deterministicDelta(userId, development, states), userId);
    if (!cached) runInBackground("warm-delta", this.phrasedDelta(userId, development, states));

    runInBackground(
      "interaction",
      this.adapters.temporal.appendInteraction({ userId, kind: "development_opened", refId: id, at: this.now().toISOString() }),
    );
    const pick = <T>(ids: string[], map: Map<string, T>) => ids.flatMap((x) => (map.has(x) ? [map.get(x)!] : []));
    return {
      development,
      delta,
      concepts: pick(development.conceptIds, this.concepts),
      claims: pick(development.claimIds, this.claims),
      sources: pick(development.sourceIds, this.sources),
      storylines: pick(development.storylineIds, this.storylines),
      deltaSource: cached ? "claude" : "deterministic",
    };
  }

  async feedback(userId: string, developmentId: string, kind: FeedbackKind): Promise<FeedbackResponse> {
    const development = await this.getDevelopment(developmentId);
    return this.withUserLock(userId, async () => {
      const states = await this.statesFor(userId);
      const transitions: KnowledgeStateTransition[] = [];
      const sourceRef = `development:${developmentId}`;
      // A self-report ("Got it", "I already knew this") is about the development's main idea, and
      // counts once: saying it again, or for every related concept, isn't more evidence.
      const selfReport = kind === "got_it" || kind === "already_knew";
      if (selfReport) {
        const recent = await this.adapters.temporal.getRecentTransitions(userId, 200);
        if (recent.some((t) => t.observation.kind === kind && t.observation.sourceRef === sourceRef)) return { transitions };
      }
      for (const conceptId of selfReport ? development.conceptIds.slice(0, 1) : development.conceptIds) {
        if (!states.has(conceptId)) continue;
        const r = await this.observe(userId, conceptId, kind, { sourceRef, states });
        transitions.push(r.transition);
      }
      if (kind === "explained") {
        await this.remember(userId, {
          id: newId("mem"),
          kind: "learning_topic",
          content: `Asked for a deeper explanation of “${development.title}”.`,
          createdAt: this.now().toISOString(),
        });
      }
      return { transitions };
    });
  }

  // -------------------------------------------------------------------------
  // Diagnostics
  // -------------------------------------------------------------------------

  private async answeredQuestionIds(userId: string): Promise<Set<string>> {
    const recent = await this.adapters.temporal.getRecentTransitions(userId, 200);
    return new Set(
      recent.flatMap((t) => (t.observation.sourceRef?.startsWith("diagnostic:") ? [t.observation.sourceRef.slice("diagnostic:".length)] : [])),
    );
  }

  async selectDiagnostic(userId: string, input: { developmentId?: string; conceptId?: string }): Promise<DiagnosticSelectResponse> {
    const states = await this.statesFor(userId);
    const contextDevelopment = input.developmentId ? await this.getDevelopment(input.developmentId) : undefined;
    if (input.conceptId && !this.concepts.has(input.conceptId)) throw new NotFoundError(`Concept not found: ${input.conceptId}`);
    const candidateConceptIds = input.conceptId ? [input.conceptId] : (contextDevelopment?.conceptIds ?? [...this.concepts.keys()]);

    const ranked = scoreConcepts({
      candidateConceptIds,
      concepts: [...this.concepts.values()],
      edges: this.seed.edges,
      states,
      profile: this.profileFor(userId),
      developments: [...this.developments.values()],
      ...(contextDevelopment ? { contextDevelopment } : {}),
      now: this.now(),
    });
    const top = ranked[0];
    if (!top) throw new NotFoundError("No candidate concepts for a diagnostic");
    const { conceptId, conceptName: _n, ...debug } = top;

    const answered = await this.answeredQuestionIds(userId);
    let item = pickItem(conceptId, [...this.diagnostics.values()].filter((q) => !q.playgroundOnly), states.get(conceptId), answered);
    if (!item) item = await this.generateDiagnostic(userId, conceptId, states, contextDevelopment);

    const explanation = explainSelection(top, states.get(conceptId));
    logEvent("diagnostic.selected", { userId, questionId: item.id, conceptId, priority: top.priority, explanation, ranked: ranked.slice(0, 5) });
    return { question: toPublicQuestion(item, debug), selection: { explanation, candidates: ranked.slice(0, 5) } };
  }

  private async generateDiagnostic(
    userId: string,
    conceptId: string,
    states: Map<string, KnowledgeState>,
    development?: Development,
  ): Promise<DiagnosticItem> {
    const ctx = await this.learningContext(userId, conceptId, states, development);
    const model = this.model();
    const { value } = await guarded(
      "claude",
      "generateDiagnostic",
      model ? () => model.generateDiagnostic(ctx) : undefined,
      () => this.adapters.fallbackModel.generateDiagnostic(ctx),
      this.diagnosticClaudeTimeout(),
    );
    await this.rememberDiagnostic(value);
    return value;
  }

  /** Generated questions outlive the process: an open question (or a Playground transfer) must still grade after a restart. */
  private async rememberDiagnostic(item: DiagnosticItem): Promise<void> {
    this.diagnostics.set(item.id, item);
    await this.store.put("diagnostics", item.id, item);
  }

  private async getDiagnostic(id: string): Promise<DiagnosticItem | undefined> {
    const cached = this.diagnostics.get(id);
    if (cached) return cached;
    const stored = await this.store.get<DiagnosticItem>("diagnostics", id);
    if (stored) this.diagnostics.set(id, stored);
    return stored;
  }

  /**
   * Grade an answer and record exactly one observation for it. With an `operationId` (the client's
   * Idempotency-Key, or a Playground transfer's stable id), a retry, a double tap or a replay after a
   * restart returns the recorded result instead of recording the evidence twice.
   */
  async answerDiagnostic(userId: string, questionId: string, answer: string, opts: { operationId?: string } = {}): Promise<DiagnosticAnswerResponse> {
    const opKey = opts.operationId ? `${userId}:${opts.operationId}` : undefined;
    if (opKey) {
      const done = await this.store.get<OperationRecord>("operations", opKey);
      if (done?.result) return done.result;
    }
    const item = await this.getDiagnostic(questionId);
    if (!item) throw new NotFoundError(`Diagnostic not found: ${questionId}`);
    const evaluation = await this.evaluate(item, answer);

    return this.withUserLock(userId, async () => {
      const observationId = opKey ? `obs_op_${await digest(opKey)}` : undefined;
      if (opKey) {
        const replay = await this.claimOperation(userId, opKey, observationId!, questionId, answer);
        if (replay) return replay;
      }
      const states = await this.statesFor(userId);
      const kind = kindForCorrectness(evaluation.correctness);
      // Same question (or the same prompt under a new id, as generated ones get) answered before.
      const answered = await this.answeredQuestionIds(userId);
      const repeat = [...answered].some((id) => {
        const q = id === item.id ? item : this.diagnostics.get(id);
        return !!q && q.conceptId === item.conceptId && q.prompt === item.prompt;
      });
      const options: UpdateOptions = {
        ...(repeat ? { repeat } : {}),
        ...(item.evidencePhrase ? { evidencePhrase: item.evidencePhrase } : {}),
        ...(evaluation.misconception ? { addMisconception: evaluation.misconception } : {}),
        ...(kind === "diagnostic_correct" && item.targetsMisconception ? { clearMisconception: item.targetsMisconception } : {}),
      };
      const result = await this.observe(userId, item.conceptId, kind, {
        correctness: evaluation.correctness,
        sourceRef: `diagnostic:${item.id}`,
        options,
        states,
        ...(observationId ? { observationId } : {}),
      });

      if (evaluation.misconception) {
        const description = MISCONCEPTIONS[evaluation.misconception] ?? evaluation.misconception;
        await this.remember(userId, {
          id: newId("mem"),
          kind: "misconception",
          content: `On ${this.concepts.get(item.conceptId)?.name}: showed the misconception ${description}.`,
          createdAt: this.now().toISOString(),
        });
      }
      logEvent("diagnostic.answered", { userId, questionId, correctness: evaluation.correctness, kind, misconception: evaluation.misconception, operationId: opts.operationId });
      const response: DiagnosticAnswerResponse = {
        answer: { questionId, userId, answer, correctness: evaluation.correctness, feedback: evaluation.feedback },
        transition: result.transition,
      };
      if (opKey) await this.store.put("operations", opKey, { status: "done", at: this.now().toISOString(), result: response } satisfies OperationRecord, userId);
      return response;
    });
  }

  /**
   * Claim an answer operation. Returns the recorded response when this operation already ran;
   * throws while another request is still recording it; returns undefined when this call owns it.
   * A claim left "pending" by a crash is recovered from the temporal store (the observation id is
   * derived from the operation), so a replay never records the evidence twice.
   */
  private async claimOperation(userId: string, opKey: string, observationId: string, questionId: string, answer: string): Promise<DiagnosticAnswerResponse | undefined> {
    const at = this.now().toISOString();
    if (await this.store.create("operations", opKey, { status: "pending", at } satisfies OperationRecord, userId)) return undefined;
    const existing = await this.store.get<OperationRecord>("operations", opKey);
    if (existing?.result) return existing.result;
    const recorded = await this.adapters.temporal.findTransitionByObservation(userId, observationId);
    if (recorded) {
      const result: DiagnosticAnswerResponse = {
        answer: { questionId, userId, answer, correctness: recorded.observation.correctness ?? 0, feedback: "Thinketh had already recorded this answer." },
        transition: recorded,
      };
      await this.store.put("operations", opKey, { status: "done", at, result } satisfies OperationRecord, userId);
      return result;
    }
    if (existing && this.now().getTime() - new Date(existing.at).getTime() < PENDING_OPERATION_MS) {
      throw new ConflictError("Thinketh is still recording this answer.");
    }
    // A stale claim with nothing recorded: the earlier attempt died before recording. Take it over.
    await this.store.put("operations", opKey, { status: "pending", at } satisfies OperationRecord, userId);
    return undefined;
  }

  private async evaluate(item: DiagnosticItem, answer: string): Promise<Evaluation> {
    if (item.type === "multiple_choice") return evaluateMultipleChoice(item, answer);
    const model = this.model();
    const { value } = await guarded(
      "claude",
      "gradeShortAnswer",
      model
        ? async () => {
            const grade = await model.gradeShortAnswer({ item, answer });
            const { correctness } = scoreRubric(item, grade.coveredIdeaIndices);
            return { correctness, feedback: grade.feedback, ...(grade.misconception ? { misconception: grade.misconception } : {}) };
          }
        : undefined,
      () => evaluateShortAnswerKeywords(item, answer),
      this.diagnosticClaudeTimeout(),
    );
    return value;
  }

  // -------------------------------------------------------------------------
  // Knowledge / Mind
  // -------------------------------------------------------------------------

  /** The persona's seeded prior history, re-addressed to this user. */
  private seedHistory(userId: string, conceptId?: string): KnowledgeStateTransition[] {
    const readdress = (s: KnowledgeState) => ({ ...s, userId });
    const history = this.seed.personas[userId]?.history ?? (this.isDemoLearner(userId) ? this.seed.history : []);
    return history
      .filter((t) => !conceptId || t.conceptId === conceptId)
      .map((t) => ({ ...t, userId, before: readdress(t.before), after: readdress(t.after), observation: { ...t.observation, userId } }));
  }

  async knowledge(userId: string): Promise<KnowledgeResponse> {
    const states = await this.statesFor(userId);
    const recent = await this.adapters.temporal.getRecentTransitions(userId, 200);
    const lastByConcept = new Map<string, KnowledgeStateTransition>();
    for (const t of [...recent, ...this.seedHistory(userId).reverse()]) if (!lastByConcept.has(t.conceptId)) lastByConcept.set(t.conceptId, t);
    const items = this.conceptsFor(userId).flatMap((concept) => {
      const state = states.get(concept.id);
      if (!state) return [];
      const last = lastByConcept.get(concept.id);
      return [{ concept, state, level: knowledgeLevel(state), ...(last ? { lastTransition: last } : {}) }];
    });
    items.sort((a, b) => b.state.mastery - a.state.mastery);
    return { userId, items, edges: this.seed.edges, recentTransitions: await this.recentPrimaryTransitions(userId, 20, { withSeedHistory: true }) };
  }

  async conceptHistory(userId: string, conceptId: string): Promise<ConceptHistoryResponse> {
    const concept = this.concepts.get(conceptId);
    if (!concept) throw new NotFoundError(`Concept not found: ${conceptId}`);
    const states = await this.statesFor(userId);
    const current = states.get(conceptId)!;
    const transitions = [...this.seedHistory(userId, conceptId), ...(await this.adapters.temporal.getConceptHistory(userId, conceptId))];
    return { concept, current, level: knowledgeLevel(current), transitions };
  }

  // -------------------------------------------------------------------------
  // Ask / Visualize / Make it stick
  // -------------------------------------------------------------------------

  private async learningContext(
    userId: string,
    conceptId: string,
    states: Map<string, KnowledgeState>,
    development?: Development,
  ): Promise<LearningContext> {
    const concept = this.concepts.get(conceptId);
    if (!concept) throw new NotFoundError(`Concept not found: ${conceptId}`);
    const relatedIds = new Set<string>();
    for (const e of this.seed.edges) {
      if (e.fromConceptId === conceptId) relatedIds.add(e.toConceptId);
      if (e.toConceptId === conceptId) relatedIds.add(e.fromConceptId);
    }
    const claims = this.claimsFor(userId).filter((c) => c.conceptIds.includes(conceptId)).slice(0, 6);
    return {
      concept,
      state: states.get(conceptId),
      profile: this.profileFor(userId),
      relatedConcepts: [...relatedIds].flatMap((id) => (this.concepts.has(id) ? [this.concepts.get(id)!] : [])),
      claims,
      ...(development ? { development } : {}),
      memories: await this.recall(userId, concept.name),
    };
  }

  private async resolveLearningTarget(userId: string, input: { conceptId?: string; developmentId?: string }) {
    const states = await this.statesFor(userId);
    const development = input.developmentId ? await this.getDevelopment(input.developmentId) : undefined;
    let conceptId = input.conceptId;
    if (!conceptId && development) {
      conceptId = focusConceptId({
        userId,
        development,
        meta: this.meta[development.id],
        profile: this.profileFor(userId),
        states,
        concepts: this.concepts,
        edges: this.seed.edges,
        claims: this.claims,
        baselineClaimIds: this.seed.baselineClaimIds,
      });
    }
    if (!conceptId) throw new BadRequestError("Provide conceptId or developmentId");
    return this.learningContext(userId, conceptId, states, development);
  }

  /**
   * "Visualize this": Claude plans the diagram for the topic (grammar, entities, relationships);
   * curated or delta-derived plans stand in when it can't. A plan is about the topic, not the
   * learner's progress, so a live plan is cached per development and reopening is instant.
   */
  async visualize(userId: string, input: { conceptId?: string; developmentId?: string }): Promise<VisualizationSpec> {
    const learning = await this.resolveLearningTarget(userId, input);
    const key = `visualization:${learning.development?.id ?? learning.concept.id}`;
    const cached = this.generated.get(key) as VisualizationSpec | undefined;
    if (cached) return cached;
    const states = await this.statesFor(userId);
    const delta = learning.development ? this.deterministicDelta(userId, learning.development, states) : undefined;
    const topicConcepts = learning.development?.conceptIds ?? [learning.concept.id];
    const ctx: VisualizeContext = {
      ...learning,
      ...(delta
        ? { delta: { whatHappened: delta.whatHappened, alreadyKnew: delta.alreadyKnew, whatChanged: delta.whatChanged, whyItMattersToYou: delta.whyItMattersToYou, mentalModelChange: delta.mentalModelChange } }
        : {}),
      known: topicConcepts.flatMap((id) => {
        const s = states.get(id);
        const c = this.concepts.get(id);
        return s && c ? [{ concept: c.name, level: knowledgeLevel(s) }] : [];
      }),
    };
    const model = this.model();
    // Planning a diagram measured 7-14 s live; the sheet shows a skeleton meanwhile and the plan is
    // cached, so this one call gets the full Claude timeout rather than the 12 s request cap.
    const r = await guarded("claude", "visualize", model ? () => model.visualize(ctx) : undefined, () => this.adapters.fallbackModel.visualize(ctx), this.config.anthropic.timeoutMs);
    logEvent("visualize.planned", { userId, key, source: r.source, type: r.value.visualizationType, nodes: r.value.nodes.length });
    if (r.source === "live") this.generated.set(key, r.value);
    return r.value;
  }

  async makeItStick(userId: string, input: { conceptId?: string; developmentId?: string }): Promise<MemoryAid> {
    const ctx = await this.resolveLearningTarget(userId, input);
    const seeded = this.seed.memoryAids[ctx.concept.id];
    if (seeded) return seeded;
    const key = `aid:${ctx.concept.id}`;
    const cached = this.generated.get(key) as MemoryAid | undefined;
    if (cached) return cached;
    const model = this.model();
    const r = await guarded("claude", "makeItStick", model ? () => model.makeItStick(ctx) : undefined, () => this.adapters.fallbackModel.makeItStick(ctx), this.claudeTimeout());
    if (r.source === "live") this.generated.set(key, r.value);
    return r.value;
  }

  async ask(userId: string, input: { question: string; developmentId?: string; mode?: "quick" | "teach" | "deep" }): Promise<AskResponse> {
    if (!input.developmentId && SELF_ASSESSMENT.test(input.question)) return this.askAboutKnowledge(userId);
    const named = conceptsByAcronym(input.question, this.concepts.values());
    const namedIds = new Set(named.map((c) => c.id));
    const query = [input.question, ...named.map((c) => c.name)].join(" ");
    const { semantic, localSemantic } = this.adapters;
    const [memories, hits] = await Promise.all([
      this.recall(userId, input.question),
      guarded(
        "mongo",
        "search",
        semantic ? () => semantic.search({ text: query, limit: 8 }) : undefined,
        () => localSemantic.search({ text: query, limit: 8 }),
        SEMANTIC_TIMEOUT_MS,
      ).then((r) => r.value),
    ]);

    // Expand search hits into candidate claims: claims directly, developments/concepts via their claims.
    const devClaimIds = new Set(input.developmentId ? (await this.getDevelopment(input.developmentId)).claimIds : []);
    const candidateIds = new Set(devClaimIds);
    const allowed = this.claimsFor(userId);
    const allowedIds = new Set(allowed.map((c) => c.id));
    for (const c of allowed) if (c.conceptIds.some((id) => namedIds.has(id))) candidateIds.add(c.id);
    for (const h of hits) {
      if (h.kind === "claim") candidateIds.add(h.id);
      if (h.kind === "development") for (const id of this.developments.get(h.id)?.claimIds ?? []) candidateIds.add(id);
      if (h.kind === "concept") for (const c of allowed) if (c.conceptIds.includes(h.id)) candidateIds.add(c.id);
    }
    const ranked = [...candidateIds]
      .flatMap((id) => (allowedIds.has(id) ? [this.claims.get(id)!] : []))
      .map((c) => ({ c, score: lexicalScore(query, c.text) + (devClaimIds.has(c.id) ? 0.5 : 0) + (c.conceptIds.some((id) => namedIds.has(id)) ? 0.5 : 0) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.c);

    // Layer 1: what sources say (verbatim claims).
    const said = ranked.filter((c) => c.stance !== "challenges").slice(0, 3);
    const citedConceptIds = [...new Set(said.flatMap((c) => c.conceptIds))].slice(0, 5);
    const citedDevelopmentIds = [
      ...new Set([
        ...(input.developmentId ? [input.developmentId] : []),
        ...[...this.developments.values()].filter((d) => said.some((c) => d.claimIds.includes(c.id))).map((d) => d.id),
      ]),
    ];

    // Layer 3: what you already understand (from the knowledge state, never from the model).
    const states = await this.statesFor(userId);
    const background = new Set(citedConceptIds);
    for (const e of this.seed.edges) if (e.type === "prerequisite" && background.has(e.toConceptId)) background.add(e.fromConceptId);
    const youAlreadyUnderstand = [...background]
      .flatMap((id) => {
        const s = states.get(id);
        return s && s.mastery >= 0.6 ? [{ id, s }] : [];
      })
      .sort((a, b) => b.s.mastery - a.s.mastery)
      .slice(0, 3)
      .map(({ id, s }) => {
        const claim = this.claims.get(this.seed.baselineClaimIds[id]?.[0] ?? "");
        return `${claim?.text ?? this.concepts.get(id)?.description ?? id} (${knowledgeLevel(s)})`;
      });

    // Layer 4: still uncertain (contested claims, and concepts Thinketh has little evidence on).
    const stillUncertain = [
      ...ranked.filter((c) => c.stance === "challenges").map((c) => `Sources push back: ${c.text}`),
      ...citedConceptIds.flatMap((id) => {
        const s = states.get(id);
        const name = this.concepts.get(id)?.name ?? id;
        return s && s.uncertainty >= 0.4 ? [`Thinketh has little evidence yet on how well you know ${name} (uncertainty ${s.uncertainty.toFixed(2)}).`] : [];
      }),
    ].slice(0, 3);

    let thinkethInfers: string[] = [];
    if (said.length === 0) {
      stillUncertain.splice(0, stillUncertain.length, "Thinketh doesn't have enough evidence in your sources to answer this well yet. Try asking about one of today's developments.");
    } else {
      const weakest = citedConceptIds
        .flatMap((id) => (states.has(id) ? [states.get(id)!] : []))
        .sort((a, b) => a.mastery - b.mastery)[0];
      const flag = weakest?.misconceptionFlags.find((f) => MISCONCEPTIONS[f]);
      const shiftDev = citedDevelopmentIds.map((id) => this.meta[id]?.mentalModelShift).find((m) => m?.after);
      const ctx: AskContext = {
        question: input.question,
        // Unasked, the depth follows the person's teaching choices.
        mode: input.mode ?? ({ concise: "quick", standard: "quick", deep: "deep" } as const)[depthOf(this.profileFor(userId).explanationPreferences)],
        profile: this.profileFor(userId),
        memories,
        sourcesSay: said.map((c) => c.text),
        youAlreadyUnderstand,
        stillUncertain,
        ...(shiftDev ? { shift: shiftDev } : {}),
        ...(weakest
          ? { focus: { name: this.concepts.get(weakest.conceptId)?.name ?? weakest.conceptId, mastery: weakest.mastery, ...(flag ? { misconception: MISCONCEPTIONS[flag] } : {}) } }
          : {}),
      };
      const model = this.model();
      thinkethInfers = (
        await guarded("claude", "ask", model ? () => model.ask(ctx) : undefined, () => this.adapters.fallbackModel.ask(ctx), this.claudeTimeout())
      ).value.thinkethInfers;
    }

    // Answer everything, but never let an attempt to steer the system into learner memory.
    if (isManipulation(input.question)) {
      logEvent("memory.skipped_manipulation", { userId, question: input.question.slice(0, 120) }, "warn");
    } else {
      await this.remember(userId, {
        id: newId("mem"),
        kind: "conversation",
        content: `Asked: “${input.question.slice(0, 200)}”`,
        createdAt: this.now().toISOString(),
      });
      this.observeInBackground(userId, input.question);
    }
    if (input.developmentId) {
      await this.withUserLock(userId, async () => {
        for (const conceptId of citedConceptIds.slice(0, 2)) {
          await this.observe(userId, conceptId, "asked_followup", { sourceRef: `ask:${input.developmentId}` });
        }
      });
    }
    const sourcesSay = said.map((c) => c.text);
    const answer =
      sourcesSay.length === 0 ? (stillUncertain[0] ?? "") : [`From your sources: ${sourcesSay.join(" ")}`, ...thinkethInfers].join(" ");
    const citedSourceIds = [...new Set(said.flatMap((c) => c.sourceIds))];
    return {
      answer,
      citations: citedSourceIds.flatMap((id) => (this.sources.has(id) ? [{ sourceId: id, title: this.sources.get(id)!.title }] : [])),
      relatedConceptIds: citedConceptIds,
      memoryUsed: memories,
      // Trust layers (design spec). The app renders these when present, otherwise `answer`.
      sections: { sourcesSay, thinkethInfers, youAlreadyUnderstand, stillUncertain },
    };
  }

  /** Strengths and gaps, straight from the knowledge state (deterministic; no sources to cite). */
  private async askAboutKnowledge(userId: string): Promise<AskResponse> {
    const states = [...(await this.statesFor(userId)).values()].filter((s) => this.concepts.has(s.conceptId));
    const name = (s: KnowledgeState) => this.concepts.get(s.conceptId)!.name;
    const byMastery = [...states].sort((a, b) => a.mastery - b.mastery);
    const weakest = byMastery.slice(0, 3);
    const strongest = byMastery.slice(-2).reverse();
    const thinkethInfers = [
      `Your weakest areas right now: ${weakest.map((s) => `${name(s)} (${knowledgeLevel(s)}, mastery ${s.mastery.toFixed(2)})`).join(", ")}.`,
      ...weakest.flatMap((s) => {
        const flag = s.misconceptionFlags.find((f) => MISCONCEPTIONS[f]);
        return flag ? [`On ${name(s)} you've shown a misconception: ${MISCONCEPTIONS[flag]}.`] : [];
      }),
    ];
    const stillUncertain = weakest
      .filter((s) => s.uncertainty >= 0.4)
      .map((s) => `Thinketh has little evidence on ${name(s)} (uncertainty ${s.uncertainty.toFixed(2)}), so a single check would tell a lot.`);
    return {
      answer: thinkethInfers.join(" "),
      citations: [],
      relatedConceptIds: weakest.map((s) => s.conceptId),
      memoryUsed: [],
      sections: { sourcesSay: [], thinkethInfers, youAlreadyUnderstand: strongest.map((s) => `${name(s)} (${knowledgeLevel(s)})`), stillUncertain },
    };
  }

  // -------------------------------------------------------------------------
  // Voice
  // -------------------------------------------------------------------------

  async voiceSession(userId: string): Promise<VoiceSession> {
    const { brief, developments, pipeline } = await this.brief(userId);
    const states = await this.statesFor(userId);
    const profile = this.profileFor(userId);
    // Concise listeners get the two stories that matter most; everyone else three.
    const count = depthOf(profile.explanationPreferences) === "concise" ? 2 : 3;
    const goal = profile.goals[0];
    const skipped =
      pipeline?.mode === "live"
        ? `Thinketh read ${pipeline.itemsInspected} items from its sources and left out ${pipeline.itemsFiltered} that were duplicates, off-topic or outdated.`
        : pipeline?.mode === "none"
          ? ""
          : `I skipped ${brief.skippedCount ?? 0} items that were duplicates, low signal, or things you already understand.`;
    const script = [
      developments.length
        ? `Good morning, ${profile.displayName}. You have about ${Math.round(brief.estimatedMinutes)} minutes. ${brief.meaningfulCount} ${brief.meaningfulCount === 1 ? "development" : "developments"} changed topics you follow${goal ? `, with your goal in mind: ${goal.replace(/\.$/, "").toLowerCase()}` : ""}.`
        : `Good morning, ${profile.displayName}. Nothing new changed enough to interrupt you today.`,
      ...developments.slice(0, count).map((d, i) => {
        const delta = this.deterministicDelta(userId, d, states);
        const changed = delta.whatChanged[0] ?? d.summaryBullets[0] ?? "";
        // Personalize the lead story; keep the rest short so the briefing stays brisk.
        const lead = firstSentence(delta.whyItMattersToYou);
        const tail = i === 0 && lead ? ` ${/[.!?]$/.test(lead) ? lead : `${lead}.`}` : "";
        return `${i === 0 ? "First" : i === 1 ? "Next" : "And"}: ${d.title}. ${changed}${tail}`;
      }),
      [skipped, developments.length ? "Want to go deeper on any of these?" : ""].filter(Boolean).join(" "),
    ].filter(Boolean);
    const ctx = { userId, displayName: profile.displayName, script, briefDate: brief.date, minutes: brief.estimatedMinutes };
    const { voice, transcriptVoice } = this.adapters;
    return (await guarded("elevenlabs", "createSession", voice ? () => voice.createSession(ctx) : undefined, () => transcriptVoice.createSession(ctx), VOICE_TIMEOUT_MS)).value;
  }

  // -------------------------------------------------------------------------
  // Admin
  // -------------------------------------------------------------------------

  /**
   * Make one cheap real call to every configured sponsor service. This is the
   * authoritative "is it live?" answer; the plain /health only knows whether a
   * key is configured.
   */
  async probeAdapters(): Promise<Record<string, { status: "live" | "error" | "not_configured"; detail: string; ms?: number }>> {
    const a = this.adapters;
    const probes: Record<string, (() => Promise<string>) | undefined> = {
      tiger: a.temporal.tiger ? () => a.temporal.tiger!.probe() : undefined,
      mongo: a.semantic instanceof MongoSemanticStore ? () => (a.semantic as MongoSemanticStore).probe() : undefined,
      backboard: a.memory instanceof BackboardMemory ? () => (a.memory as BackboardMemory).probe(this.config.demoUserId) : undefined,
      claude: a.model instanceof ClaudeModel ? () => (a.model as ClaudeModel).probe() : undefined,
      elevenlabs: a.voice instanceof ElevenLabsVoice ? () => (a.voice as ElevenLabsVoice).probe() : undefined,
      supabase: a.supabase ? () => a.supabase!.probe() : undefined,
    };
    const entries = await Promise.all(
      Object.entries(probes).map(async ([name, probe]) => {
        if (!probe) return [name, { status: "not_configured" as const, detail: "no credentials: using local fallback" }] as const;
        // A failure retrying cannot fix here (e.g. a TLS certificate the runtime rejects): report it, don't re-dial.
        if (circuitOpen(name as AdapterName, true)) {
          const reason = adapterHealth()[name]?.lastError ?? "unavailable in this runtime";
          return [name, { status: "error" as const, detail: `skipped (serving local fallback): ${reason}`.slice(0, 200) }] as const;
        }
        const started = Date.now();
        try {
          const detail = await withTimeout(probe(), PROBE_TIMEOUT_MS, `${name} probe`);
          recordCall(name as AdapterName, true);
          return [name, { status: "live" as const, detail, ms: Date.now() - started }] as const;
        } catch (err) {
          const message = (err instanceof Error ? err.message : String(err)).slice(0, 200);
          recordCall(name as AdapterName, false, message);
          return [name, { status: "error" as const, detail: message, ms: Date.now() - started }] as const;
        }
      }),
    );
    return Object.fromEntries(entries);
  }

  /** Defaults reflect what is actually configured; Supabase feature_flags rows override them. */
  async featureFlags(): Promise<Record<string, boolean>> {
    const defaults: Record<string, boolean> = {
      voice: !!this.adapters.voice,
      ask: true,
      visualize: true,
      make_it_stick: true,
      storylines: true,
    };
    const { supabase } = this.adapters;
    const remote = await guarded("supabase", "featureFlags", supabase ? () => supabase.featureFlags() : undefined, () => ({}), MEMORY_TIMEOUT_MS);
    return { ...defaults, ...remote.value };
  }

  // -------------------------------------------------------------------------
  // Learning Queue: save to learn. Reading and analysis never change knowledge
  // state. Resources, their analyses and lessons are stored (owner-scoped), so a
  // restart never loses them; the Maps below are caches.

  private readonly resources = new Map<string, Map<string, StoredResource>>();
  private readonly resourceLoads = new Map<string, Promise<Map<string, StoredResource>>>();
  private readonly resourceText = new Map<string, { excerpt: string }>();
  private readonly teachings = new Map<string, TeachDeltaResponse>();
  private readonly teachPending = new Map<string, Promise<TeachDeltaResponse>>();
  /** Resources being read by THIS process. Anything "processing" outside it was interrupted. */
  private readonly inFlight = new Set<string>();

  /** This user's queue: loaded from the store once per process, then kept in step with it. */
  private queue(userId: string): Promise<Map<string, StoredResource>> {
    const cached = this.resources.get(userId);
    if (cached) return Promise.resolve(cached);
    let load = this.resourceLoads.get(userId);
    if (!load) {
      load = (async () => {
        const stored = await this.store.list<StoredResource>("resources", { ownerId: userId }, MAX_QUEUE * 2);
        const q = new Map(stored.map((r) => [r.id, r]));
        this.resources.set(userId, q);
        for (const r of q.values()) if (r.status === "processing") this.recoverInterrupted(userId, r);
        return q;
      })().finally(() => this.resourceLoads.delete(userId));
      this.resourceLoads.set(userId, load);
    }
    return load;
  }

  /** A read that a restart interrupted: resume it (bounded), else say so and let the user retry. */
  private recoverInterrupted(userId: string, r: StoredResource): void {
    if (this.inFlight.has(r.id)) return;
    if ((r.attempts ?? 1) < MAX_READ_ATTEMPTS) {
      logEvent("resource.resumed", { userId, id: r.id, attempts: r.attempts });
      void this.updateResource(userId, r.id, { stage: "reading", attempts: (r.attempts ?? 1) + 1 }).then(() => this.startProcessing(userId, r.id));
    } else {
      void this.updateResource(userId, r.id, { status: "failed", stage: "done", error: INTERRUPTED });
      logEvent("resource.interrupted", { userId, id: r.id, attempts: r.attempts }, "warn");
    }
  }

  private startProcessing(userId: string, id: string): void {
    this.inFlight.add(id);
    runInBackground("resource.analyze", this.processResource(userId, id).finally(() => this.inFlight.delete(id)));
  }

  /** Public view (drops the owner and attempt bookkeeping). */
  private publicResource(r: StoredResource): Resource {
    const { ownerId: _o, attempts: _a, ...rest } = r;
    return rest;
  }

  async listResources(userId: string): Promise<Resource[]> {
    return [...(await this.queue(userId)).values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((r) => this.publicResource(r));
  }

  /** Only the owner can read a resource; anyone else gets "not found", never someone else's source. */
  async getResource(userId: string, id: string): Promise<Resource> {
    const r = (await this.queue(userId)).get(id);
    if (!r || r.ownerId !== userId) throw new NotFoundError(`No resource ${id}`);
    return this.publicResource(r);
  }

  private async updateResource(userId: string, id: string, patch: Partial<StoredResource>): Promise<void> {
    const q = await this.queue(userId);
    const r = q.get(id);
    if (!r) return;
    const next = { ...r, ...patch };
    q.set(id, next);
    await this.store.put("resources", id, next, userId);
  }

  /** Save a URL and start reading it in the background. Returns immediately with status "processing". */
  async addResource(userId: string, rawUrl: string): Promise<Resource> {
    let url: URL;
    try {
      url = validateUrl(rawUrl);
    } catch (err) {
      throw new BadRequestError(err instanceof ResourceReadError ? err.message : "That doesn't look like a web address.");
    }
    // One video, one entry: youtu.be, shorts and watch links all normalize to the watch URL.
    const video = youtubeId(url);
    if (video) url = new URL(`https://www.youtube.com/watch?v=${video}`);
    const q = await this.queue(userId);
    const same = [...q.values()].find((r) => r.url === url.toString() || r.canonicalUrl === url.toString());
    if (same && same.status !== "failed") return this.publicResource(same);
    if (same) {
      // Saving a failed source again retries it in place (same id, so links to it keep working).
      await this.updateResource(userId, same.id, { status: "processing", stage: "reading", attempts: 1, error: undefined });
      this.startProcessing(userId, same.id);
      return this.publicResource(q.get(same.id)!);
    }
    if (q.size >= MAX_QUEUE) {
      const oldest = [...q.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      if (oldest) {
        q.delete(oldest.id);
        await this.forgetResource(oldest.id);
      }
    }
    const resource: StoredResource = {
      id: newId("res"),
      ownerId: userId,
      attempts: 1,
      url: url.toString(),
      title: url.hostname.replace(/^www\./, ""),
      sourceType: inferSourceType(url.toString()),
      createdAt: this.now().toISOString(),
      status: "processing",
      stage: "reading",
      extractedConcepts: [],
      matchedConceptIds: [],
      alreadyUnderstood: [],
      newToYou: [],
      relevantConnections: [],
    };
    q.set(resource.id, resource);
    await this.store.put("resources", resource.id, resource, userId);
    this.startProcessing(userId, resource.id);
    return this.publicResource(resource);
  }

  private async forgetResource(id: string): Promise<void> {
    this.resourceText.delete(id);
    this.teachings.delete(id);
    await Promise.all([this.store.remove("resources", id), this.store.remove("resource_text", id), this.store.remove("resource_lessons", id)]);
  }

  private async excerptOf(r: Resource): Promise<string | undefined> {
    const cached = this.resourceText.get(r.id);
    if (cached) return cached.excerpt;
    const stored = await this.store.get<{ excerpt: string }>("resource_text", r.id);
    if (stored) this.resourceText.set(r.id, stored);
    return stored?.excerpt;
  }

  /**
   * One fetch per source, shared: when two people read the same URL at once (a Playground's shared
   * source), the page is fetched and extracted once and personalized separately for each Mind.
   * Same hardened fetchPage (URL validation, SSRF checks, redirects, size/PDF/YouTube limits, reader
   * fallback). Kept briefly; failures are never cached.
   */
  private fetchShared(url: string): ReturnType<typeof fetchPage> {
    const now = Date.now();
    for (const [k, v] of this.sharedPages) if (now - v.at > SHARED_PAGE_TTL_MS) this.sharedPages.delete(k);
    const hit = this.sharedPages.get(url);
    if (hit) return hit.p;
    const p = fetchPage(url, fetch, { readerBase: this.config.readerFallback });
    this.sharedPages.set(url, { at: now, p });
    if (this.sharedPages.size > SHARED_PAGE_MAX) this.sharedPages.delete(this.sharedPages.keys().next().value!);
    p.catch(() => this.sharedPages.delete(url));
    return p;
  }

  private async conceptViews(userId: string): Promise<ConceptView[]> {
    const states = await this.statesFor(userId);
    return this.conceptsFor(userId).map((c) => {
      const s = states.get(c.id);
      return {
        id: c.id,
        name: c.name,
        description: c.description,
        level: s ? knowledgeLevel(s) : "weak",
        misconceptions: s?.misconceptionFlags ?? [],
      };
    });
  }

  private async processResource(userId: string, id: string): Promise<void> {
    const started = Date.now();
    try {
      const current = await this.getResource(userId, id);
      const page = await this.fetchShared(current.url);
      const readMin = page.durationMinutes ?? readMinutes(page.words);
      await this.updateResource(userId, id, {
        title: page.title ?? current.title,
        ...(page.canonicalUrl ? { canonicalUrl: page.canonicalUrl } : {}),
        ...((page.publisher ?? publisherFromUrl(page.url)) ? { publisher: page.publisher ?? publisherFromUrl(page.url)! } : {}),
        ...(page.author ? { author: page.author } : {}),
        ...(page.publishedAt ? { publishedAt: page.publishedAt } : {}),
        fetchedAt: this.now().toISOString(),
        estimatedReadMinutes: readMin,
        readVia: page.readVia,
        // PDFs and videos are typed by what they are; web pages keep the URL-based class.
        ...(page.kind === "video" ? { sourceType: "video" as const } : page.kind === "pdf" && current.sourceType === "article" ? { sourceType: "document" as const } : {}),
        url: page.url,
        stage: "mapping",
      });
      const concepts = await this.conceptViews(userId);
      const excerpt = page.text.slice(0, MAX_EXCERPT_CHARS);
      this.resourceText.set(id, { excerpt });
      await this.store.put("resource_text", id, { excerpt }, userId);
      await this.updateResource(userId, id, { stage: "comparing" });
      const profile = this.profileFor(userId);
      const ctx = { page, excerpt, concepts, preferences: profile.explanationPreferences, interests: profile.interests.map((i) => i.topic) };
      const model = this.model();
      const r = await guarded(
        "claude",
        "analyzeResource",
        model ? () => model.analyzeResource(ctx) : undefined,
        () => this.adapters.fallbackModel.analyzeResource(ctx),
        RESOURCE_ANALYSIS_TIMEOUT_MS,
      );
      const a = enforceAnalysis(r.value, concepts);
      await this.updateResource(userId, id, {
        status: "ready",
        stage: "done",
        summary: a.summary,
        extractedConcepts: a.extractedConcepts,
        matchedConceptIds: a.matchedConceptIds,
        alreadyUnderstood: a.alreadyUnderstood,
        newToYou: a.newToYou,
        relevantConnections: a.relevantConnections,
        whyNow: a.whyNow,
        relevance: a.relevance,
        ...(!page.title && a.suggestedTitle ? { title: a.suggestedTitle } : {}),
        estimatedUsefulMinutes: usefulMinutes(readMin, a.usefulFraction),
        analyzedBy: r.source === "live" ? "claude" : "deterministic",
      });
      logEvent("resource.ready", { userId, id, ms: Date.now() - started, words: page.words, analyzedBy: r.source, matched: a.matchedConceptIds.length });
      // Warm the lesson so "Teach me the delta" is instant.
      runInBackground("resource.teach", this.pendingTeach(userId, id).catch(() => undefined));
    } catch (err) {
      const message = err instanceof ResourceReadError ? err.message : READ_FAILED;
      await this.updateResource(userId, id, { status: "failed", stage: "done", error: message }).catch(() => undefined);
      logEvent("resource.failed", { userId, id, ms: Date.now() - started, error: err instanceof Error ? err.message : String(err) }, "warn");
    }
  }

  private async teachContext(userId: string, r: Resource): Promise<TeachContext> {
    return {
      title: r.title,
      summary: r.summary ?? "",
      excerpt: (await this.excerptOf(r)) ?? r.summary ?? "",
      newToYou: r.newToYou,
      alreadyUnderstood: r.alreadyUnderstood,
      concepts: (await this.conceptViews(userId)).filter((c) => r.matchedConceptIds.includes(c.id)),
      preferences: this.profileFor(userId).explanationPreferences,
    };
  }

  /** One Claude lesson per resource, shared by the background warm-up and the request. */
  private pendingTeach(userId: string, id: string): Promise<TeachDeltaResponse> {
    const cached = this.teachings.get(id);
    if (cached) return Promise.resolve(cached);
    let p = this.teachPending.get(id);
    if (!p) {
      p = (async () => {
        const r = await this.getResource(userId, id);
        const stored = await this.store.get<TeachDeltaResponse>("resource_lessons", id);
        if (stored) {
          this.teachings.set(id, stored);
          return stored;
        }
        const ctx = await this.teachContext(userId, r);
        const model = this.model();
        const out = await guarded(
          "claude",
          "teachDelta",
          model ? () => model.teachDelta(ctx) : undefined,
          () => this.adapters.fallbackModel.teachDelta(ctx),
          RESOURCE_ANALYSIS_TIMEOUT_MS,
        );
        const conceptId = out.value.conceptId && r.matchedConceptIds.includes(out.value.conceptId) ? out.value.conceptId : r.newToYou.find((i) => i.conceptId)?.conceptId;
        const lesson: TeachDeltaResponse = {
          resourceId: id,
          sections: out.value.sections,
          skipped: out.value.skipped,
          ...(conceptId ? { conceptId } : {}),
          generatedBy: out.source === "live" ? "claude" : "deterministic",
        };
        if (out.source === "live") {
          this.teachings.set(id, lesson);
          await this.store.put("resource_lessons", id, lesson, userId);
        }
        return lesson;
      })().finally(() => this.teachPending.delete(id));
      this.teachPending.set(id, p);
    }
    return p;
  }

  /** Teach the delta. Waits briefly for Claude's lesson, else answers from the source's own words. */
  async teachResource(userId: string, id: string): Promise<TeachDeltaResponse> {
    const r = await this.getResource(userId, id);
    if (r.status !== "ready" && r.status !== "learned") throw new BadRequestError("Thinketh is still reading this source.");
    try {
      return await withTimeout(this.pendingTeach(userId, id), this.claudeTimeout(), "teach");
    } catch {
      const out = await this.adapters.fallbackModel.teachDelta(await this.teachContext(userId, r));
      const conceptId = out.conceptId ?? r.newToYou.find((i) => i.conceptId)?.conceptId;
      return { resourceId: id, sections: out.sections, skipped: out.skipped, ...(conceptId ? { conceptId } : {}), generatedBy: "deterministic" };
    }
  }

  // -------------------------------------------------------------------------
  // Playground support (read-only views; state changes only via answerDiagnostic)
  // -------------------------------------------------------------------------

  conceptList(): Concept[] {
    return [...this.concepts.values()];
  }

  conceptEdges(): ConceptEdge[] {
    return this.seed.edges;
  }

  isPersona(userId: string): boolean {
    return !!this.seed.personas[userId];
  }

  private transferContext(conceptId: string, teacherExplanation?: string): TransferContext | undefined {
    const concept = this.concepts.get(conceptId);
    if (!concept) return undefined;
    const related = new Set<string>();
    for (const e of this.seed.edges) {
      if (e.fromConceptId === conceptId) related.add(e.toConceptId);
      if (e.toConceptId === conceptId) related.add(e.fromConceptId);
    }
    return {
      concept,
      relatedConcepts: [...related].flatMap((id) => (this.concepts.has(id) ? [this.concepts.get(id)!] : [])),
      claims: [...this.claims.values()].filter((c) => c.conceptIds.includes(conceptId)).slice(0, 6),
      ...(teacherExplanation ? { teacherExplanation } : {}),
    };
  }

  /**
   * Can Thinketh verify learning of this concept after peer teaching? Yes if a seeded transfer
   * question exists, or a grounded fallback can always be built (so a failed generation can't
   * strand a learner). Never simply "true".
   */
  isTransferAssessable(conceptId: string): boolean {
    if (TRANSFER_QUESTION_FOR[conceptId]) return true;
    const ctx = this.transferContext(conceptId);
    return !!ctx && hasGroundedChallenge(ctx);
  }

  /**
   * The transfer challenge for a peer-taught concept. Seeded when one exists (the golden fixture);
   * otherwise generated by Claude from trusted Thinketh data and validated here, with a grounded
   * deterministic fallback on timeout, error or invalid output. Registered as a Playground-only
   * diagnostic so the answer is graded by answerDiagnostic like every other: same grader, same
   * observation, same update rule, same Tiger record. The prompt shown is the stored item's prompt,
   * and grading reads that same stored item by id.
   */
  async transferChallenge(
    conceptId: string,
    teacherExplanation?: string,
  ): Promise<{ item: DiagnosticItem; source: "seeded" | "generated" | "fallback"; applicationContext?: string }> {
    const seededId = TRANSFER_QUESTION_FOR[conceptId];
    const seeded = seededId ? this.diagnostics.get(seededId) : undefined;
    if (seeded) return { item: seeded, source: "seeded", applicationContext: "an autonomous coding agent" };
    const ctx = this.transferContext(conceptId, teacherExplanation);
    if (!ctx) throw new NotFoundError(`Concept not found: ${conceptId}`);
    const model = this.model();
    let out: { value: TransferDraft; source: "live" | "fallback" };
    try {
      out = await guarded(
        "claude",
        "generateTransferChallenge",
        model
          ? async () => {
              const draft = sanitizeDraft(await model.generateTransferChallenge(ctx));
              const problem = validateTransferDraft(draft, ctx);
              if (problem) throw new Error(`transfer challenge rejected: ${problem}`);
              return draft;
            }
          : undefined,
        () => this.adapters.fallbackModel.generateTransferChallenge(ctx),
        this.diagnosticClaudeTimeout(),
      );
    } catch (err) {
      if (err instanceof TransferNotAssessableError) throw new BadRequestError("Thinketh can't verify learning on that concept yet.");
      throw err;
    }
    const d = out.value;
    const item: DiagnosticItem = {
      id: newId("dq-transfer"),
      conceptId,
      type: "short_answer",
      prompt: d.prompt,
      expectedConcepts: d.expectedConcepts,
      rationale: d.rationale,
      evidencePhrase: `a transfer question applying peer-taught ${ctx.concept.name.toLowerCase()} to ${d.applicationContext}`,
      playgroundOnly: true,
      rubric: d.rubric,
    };
    await this.rememberDiagnostic(item);
    logEvent("playground.transfer_challenge", { conceptId, questionId: item.id, source: out.source === "live" ? "generated" : "fallback", ideas: d.rubric.length });
    return { item, source: out.source === "live" ? "generated" : "fallback", applicationContext: d.applicationContext };
  }

  /**
   * Playground: the teacher's agent prepares an explanation for the learner's gap. It may use the
   * shared corpus on this concept and, only when the teacher chose to share them, the titles, links
   * and summaries of sources the teacher saved on it. Never private questions or memories. Every
   * point must cite a material; with nothing grounded, the room falls back to the person's own words.
   * Preparing a lesson observes nothing: no knowledge state changes here.
   */
  async prepareExchange(input: {
    conceptId: string;
    teacherId: string;
    learnerId: string;
    teacherName: string;
    learnerName: string;
    gap: ExchangeGap;
    shareSavedSources: boolean;
    whyRelevant: string;
    /** "demo" only when every participant is a seeded persona; otherwise real, discovered sources only. */
    corpus: "demo" | "live";
  }): Promise<PreparedLesson> {
    const concept = this.concepts.get(input.conceptId);
    if (!concept) throw new NotFoundError(`Concept not found: ${input.conceptId}`);
    const materials: ExchangeMaterial[] = [];
    const cited = new Map<string, NonNullable<PreparedLesson["sources"]>[number]>();
    const claims = this.claimsFor(input.corpus)
      .filter((c) => c.conceptIds.includes(concept.id) && c.sourceIds.some((id) => this.sources.has(id)))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 6);
    for (const c of claims) {
      const src = this.sources.get(c.sourceIds.find((id) => this.sources.has(id))!)!;
      materials.push({ ref: `m${materials.length + 1}`, text: c.text, sourceId: src.id, via: "corpus", ...(c.stance === "challenges" ? { challenges: true } : {}) });
      cited.set(src.id, { id: src.id, title: src.title, ...(src.url ? { url: src.url } : {}), ...(src.publisher ? { publisher: src.publisher } : {}), ...(src.publishedAt ? { publishedAt: src.publishedAt } : {}), via: "corpus" });
    }
    if (input.shareSavedSources) {
      const saved = (await this.listResources(input.teacherId)).filter((r) => (r.status === "ready" || r.status === "learned") && r.summary && r.matchedConceptIds.includes(concept.id)).slice(0, 2);
      for (const r of saved) {
        const id = `resource:${r.id}`;
        materials.push({ ref: `m${materials.length + 1}`, text: r.summary!, sourceId: id, via: "shared_resource" });
        cited.set(id, { id, title: r.title, url: r.canonicalUrl ?? r.url, ...(r.publisher ? { publisher: r.publisher } : {}), ...(r.publishedAt ? { publishedAt: r.publishedAt } : {}), via: "shared_resource" });
      }
    }
    const context = [
      "Thinketh's shared source corpus on this concept",
      ...(input.shareSavedSources ? [`Sources ${input.teacherName} saved on this topic, shared by ${input.teacherName}`] : []),
      `${input.learnerName}'s shared knowledge snapshot (level, and whether it was ever verified)`,
    ];
    const g = input.gap;
    const adaptedTo = `${input.learnerName}'s snapshot shows ${g.level} evidence on ${concept.name}${g.verified ? "" : ", never verified by a check"}${g.hasMisconception ? ", with a misconception flagged" : ""}. ${pitchFor(g)}`;
    const base = { agentOf: input.teacherId, preparedFor: input.learnerId, adaptedTo, whyRelevant: input.whyRelevant, context, preparedAt: this.now().toISOString() };
    if (materials.length === 0) {
      logEvent("playground.lesson_unavailable", { conceptId: concept.id, teacherId: input.teacherId, reason: "no sourced material" });
      return { status: "unavailable", ...base, message: `${input.teacherName}'s agent found no sourced material on ${concept.name} to prepare from, so ${input.teacherName} can explain it in their own words.` };
    }
    const ctx: ExchangeContext = { concept, teacherName: input.teacherName, learnerName: input.learnerName, learnerGap: g, materials };
    const model = this.model();
    const r = await guarded(
      "claude",
      "prepareExchange",
      model
        ? async () => {
            const v = validateExchange(await model.prepareExchange(ctx), ctx);
            if ("problem" in v) throw new Error(`exchange rejected: ${v.problem}`);
            return v.draft;
          }
        : undefined,
      () => deterministicExchange(ctx),
      this.claudeTimeout(),
    );
    const checked = validateExchange(r.value, ctx);
    if ("problem" in checked) {
      return { status: "unavailable", ...base, message: `${input.teacherName}'s agent couldn't ground an explanation in its sources, so ${input.teacherName} can explain it in their own words.` };
    }
    const byRef = new Map(materials.map((m) => [m.ref, m.sourceId]));
    const points = checked.draft.points.map((p) => ({ text: p.text, sourceIds: [...new Set(p.refs.map((ref) => byRef.get(ref)!))] }));
    const used = new Set(points.flatMap((p) => p.sourceIds));
    logEvent("playground.lesson_prepared", { conceptId: concept.id, teacherId: input.teacherId, learnerId: input.learnerId, by: r.source, points: points.length, sources: [...used] });
    return {
      status: "prepared",
      ...base,
      by: r.source === "live" ? "claude" : "deterministic",
      text: checked.draft.explanation,
      points,
      sources: [...cited.values()].filter((x) => used.has(x.id)),
    };
  }

  /** Public prompt of a diagnostic (the answer key stays server-side). */
  async diagnosticPrompt(questionId: string): Promise<{ conceptId: string; prompt: string } | undefined> {
    const q = await this.getDiagnostic(questionId);
    return q ? { conceptId: q.conceptId, prompt: q.prompt } : undefined;
  }

  /** Concepts with at least one correct diagnostic in the learner's recorded history. */
  async verifiedConceptIds(userId: string): Promise<Set<string>> {
    const recent = await this.adapters.temporal.getRecentTransitions(userId, 500);
    const out = new Set<string>();
    for (const t of [...recent, ...this.seedHistory(userId)]) if (t.observation.kind === "diagnostic_correct") out.add(t.conceptId);
    return out;
  }

  /** A short, sourced lesson on one concept for two people at once (shared gaps). */
  conceptLesson(conceptId: string, corpus: "demo" | "live" = "demo"): { sections: Array<{ heading: string; body: string }>; resourceTitle?: string } {
    const concept = this.concepts.get(conceptId);
    if (!concept) throw new NotFoundError(`Concept not found: ${conceptId}`);
    const claims = this.claimsFor(corpus).filter((c) => c.conceptIds[0] === conceptId || c.conceptIds.includes(conceptId)).sort((a, b) => b.confidence - a.confidence);
    const source = claims.flatMap((c) => c.sourceIds).map((id) => this.sources.get(id)).find(Boolean);
    const plain = CONCEPT_LABELS[conceptId]?.explanation;
    const sections = [
      ...(plain ? [{ heading: "In plain terms", body: `${plain}.` }] : []),
      { heading: "The idea", body: concept.description },
      ...claims.slice(0, 2).map((c, i) => ({ heading: i === 0 ? "What the evidence says" : "And", body: c.text })),
    ];
    return { sections, ...(source ? { resourceTitle: source.title } : {}) };
  }

  /**
   * Demo reset: put ONE seeded demo persona back to its seeded state for a rehearsal. It only ever
   * touches that persona's own records; any other identity is refused (never a real user's history).
   */
  async reset(userId: string): Promise<void> {
    if (!this.isDemoIdentity(userId)) throw new ForbiddenError("Only a seeded demo persona can be reset.");
    const owned = await this.store.list<StoredResource>("resources", { ownerId: userId }, 1000);
    for (const r of owned) {
      this.resourceText.delete(r.id);
      this.teachings.delete(r.id);
    }
    this.resources.delete(userId);
    await Promise.all(["resources", "resource_text", "resource_lessons", "operations"].map((c) => this.store.removeOwned(c, userId)));
    await this.adapters.temporal.reset(userId);
    await this.adapters.localMemory.reset(userId);
    // Rehearsals should start from the persona's seeded memories, not accumulated
    // questions. Backboard can take several seconds to clear many memories, so this
    // runs in the background: the knowledge-state reset above is what the demo needs now.
    const { memory } = this.adapters;
    if (memory?.reconcile && userId === this.config.demoUserId) {
      runInBackground(
        "backboard-reset",
        guarded("backboard", "reconcile", () => memory.reconcile!(userId, this.seed.memories), () => undefined, 30_000),
      );
    }
    for (const k of this.phrasedDeltas.keys()) if (k.startsWith(`${userId}|`)) this.phrasedDeltas.delete(k);
    logEvent("demo.reset", { userId });
  }

  /** Normalize raw sources into a Development with Claude (claims, concepts), then store it in the corpus. */
  async ingest(bundle: Omit<RawSourceBundle, "knownConcepts">): Promise<Development> {
    const { value, source } = await this.normalize(bundle);
    const development = await this.addToCorpus(value, this.now().toISOString());
    logEvent("development.ingested", { id: development.id, via: source, claims: value.claims.length, concepts: development.conceptIds });
    return development;
  }

  /** Claude normalization (validated by the adapter) with the deterministic fallback. */
  async normalize(bundle: Omit<RawSourceBundle, "knownConcepts">, timeoutMs = Math.max(this.claudeTimeout(), 45000)): Promise<{ value: NormalizedDevelopment; source: "live" | "fallback" }> {
    await this.ensureCorpus();
    const full: RawSourceBundle = { ...bundle, knownConcepts: [...this.concepts.values()] };
    const model = this.model();
    return guarded(
      "claude",
      "normalizeDevelopment",
      model ? () => model.normalizeDevelopment(full) : undefined,
      () => this.adapters.fallbackModel.normalizeDevelopment(full),
      timeoutMs,
    );
  }
}
