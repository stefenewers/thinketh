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
  DiagramSpec,
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
} from "./contracts.ts";
import { adapterHealth, circuitOpen, guarded, recordCall, runInBackground, withTimeout } from "./adapters/guard.ts";
import { BackboardMemory } from "./adapters/memory.ts";
import { ClaudeModel } from "./adapters/model/claude.ts";
import { assertsKnowledgeNumber, isManipulation } from "./memoryGuard.ts";
import { MongoSemanticStore } from "./adapters/semantic.ts";
import { ElevenLabsVoice } from "./adapters/voice.ts";
import type { Adapters } from "./adapters/registry.ts";
import { lexicalScore } from "./adapters/model/deterministic.ts";
import type { AdapterName, AskContext, LearningContext, RawSourceBundle } from "./adapters/types.ts";
import type { ThinkethConfig } from "./config.ts";
import { buildBrief } from "./engine/brief.ts";
import { computeDelta, focusConceptId } from "./engine/delta.ts";
import { evaluateMultipleChoice, evaluateShortAnswerKeywords, InvalidAnswerError, scoreRubric, type Evaluation } from "./engine/evaluation.ts";
import { knowledgeLevel, transition, type Graph, type TransitionResult, type UpdateOptions } from "./engine/knowledgeState.ts";
import { kindForCorrectness, makeObservation } from "./engine/observations.ts";
import { hasGroundedChallenge, sanitizeDraft, TransferNotAssessableError, validateTransferDraft, type TransferContext, type TransferDraft } from "./engine/transfer.ts";
import { explainSelection, pickItem, scoreConcepts, toPublicQuestion } from "./engine/selection.ts";
import { logEvent } from "./log.ts";
import { MISCONCEPTIONS } from "./seed/misconceptions.ts";
import { TRANSFER_QUESTION_FOR } from "./seed/personas.ts";
import type { DevelopmentMeta, DiagnosticItem, SeedCorpus } from "./seed/types.ts";
import { newId, round } from "./util.ts";
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

/** Background analysis of a saved resource: nobody waits on it, so Claude gets room. */
const RESOURCE_ANALYSIS_TIMEOUT_MS = 50_000;
/** How long a fetched page is shared between readers of the same URL. */
const SHARED_PAGE_TTL_MS = 10 * 60_000;
const SHARED_PAGE_MAX = 40;
const MAX_QUEUE = 30;
const READ_FAILED = "Thinketh couldn't reliably read this source yet.";

export class NotFoundError extends Error {}
export class BadRequestError extends Error {}
export { InvalidAnswerError };

const MEMORY_TIMEOUT_MS = 2000;
const PROBE_TIMEOUT_MS = 6000;
const SEMANTIC_TIMEOUT_MS = 3000;
const VOICE_TIMEOUT_MS = 5000;
/** Backboard "Auto" extraction runs an LLM turn, so it only ever runs in the background. */
const MEMORY_OBSERVE_TIMEOUT_MS = 45_000;

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
  private readonly generated = new Map<string, DiagramSpec | MemoryAid>();
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

  profileFor(userId: string): PersonaProfile {
    const persona = this.seed.personas[userId];
    return { ...this.seed.profile, id: userId, ...(persona ? { displayName: persona.displayName } : {}) };
  }

  /** Seeded Playground personas start from their own baseline; everyone else from the demo persona's. */
  private baselineFor(userId: string): KnowledgeState[] {
    return this.seed.personas[userId]?.baselineStates ?? this.seed.baselineStates;
  }

  /** Baseline persona state (new users start from the demo persona) overlaid with temporal history. */
  async statesFor(userId: string): Promise<Map<string, KnowledgeState>> {
    const states = new Map<string, KnowledgeState>();
    for (const s of this.baselineFor(userId)) states.set(s.conceptId, { ...s, userId });
    for (const c of this.concepts.values()) {
      if (!states.has(c.id)) {
        states.set(c.id, {
          userId,
          conceptId: c.id,
          mastery: 0.2,
          confidence: 0.2,
          uncertainty: 0.6,
          evidenceCount: 0,
          lastObservedAt: this.now().toISOString(),
          misconceptionFlags: [],
        });
      }
    }
    for (const s of await this.adapters.temporal.getLatestStates(userId)) states.set(s.conceptId, s);
    return states;
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
    extra: { correctness?: number; sourceRef?: string; options?: UpdateOptions; states?: Map<string, KnowledgeState> } = {},
  ): Promise<TransitionResult> {
    const now = this.now();
    const states = extra.states ?? (await this.statesFor(userId));
    const observation = makeObservation({
      userId,
      conceptId,
      kind,
      ...(extra.correctness !== undefined ? { correctness: extra.correctness } : {}),
      ...(extra.sourceRef ? { sourceRef: extra.sourceRef } : {}),
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
  private async recentPrimaryTransitions(userId: string, limit = 20): Promise<KnowledgeStateTransition[]> {
    const recent = await this.adapters.temporal.getRecentTransitions(userId, 200);
    return recent.filter((t) => !t.observation.sourceRef?.startsWith("propagated:")).slice(0, limit);
  }

  async brief(userId: string): Promise<BriefResponse> {
    const states = await this.statesFor(userId);
    const { brief, ordered } = buildBrief({
      developments: [...this.developments.values()],
      meta: this.meta,
      states,
      profile: this.profileFor(userId),
      ingestion: this.seed.ingestion,
      now: this.now(),
      timeZone: this.config.timeZone,
    });
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
    };
  }

  // -------------------------------------------------------------------------
  // Development detail + delta
  // -------------------------------------------------------------------------

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
    const delta = cached ?? this.deterministicDelta(userId, development, states);
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
      for (const conceptId of development.conceptIds) {
        if (!states.has(conceptId)) continue;
        const r = await this.observe(userId, conceptId, kind, { sourceRef: `development:${developmentId}`, states });
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
    this.diagnostics.set(value.id, value);
    return value;
  }

  async answerDiagnostic(userId: string, questionId: string, answer: string): Promise<DiagnosticAnswerResponse> {
    const item = this.diagnostics.get(questionId);
    if (!item) throw new NotFoundError(`Diagnostic not found: ${questionId}`);
    const evaluation = await this.evaluate(item, answer);

    return this.withUserLock(userId, async () => {
      const states = await this.statesFor(userId);
      const kind = kindForCorrectness(evaluation.correctness);
      const options: UpdateOptions = {
        ...(item.evidencePhrase ? { evidencePhrase: item.evidencePhrase } : {}),
        ...(evaluation.misconception ? { addMisconception: evaluation.misconception } : {}),
        ...(kind === "diagnostic_correct" && item.targetsMisconception ? { clearMisconception: item.targetsMisconception } : {}),
      };
      const result = await this.observe(userId, item.conceptId, kind, {
        correctness: evaluation.correctness,
        sourceRef: `diagnostic:${item.id}`,
        options,
        states,
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
      logEvent("diagnostic.answered", { userId, questionId, correctness: evaluation.correctness, kind, misconception: evaluation.misconception });
      return {
        answer: { questionId, userId, answer, correctness: evaluation.correctness, feedback: evaluation.feedback },
        transition: result.transition,
      };
    });
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
    return (this.seed.personas[userId]?.history ?? this.seed.history)
      .filter((t) => !conceptId || t.conceptId === conceptId)
      .map((t) => ({ ...t, userId, before: readdress(t.before), after: readdress(t.after), observation: { ...t.observation, userId } }));
  }

  async knowledge(userId: string): Promise<KnowledgeResponse> {
    const states = await this.statesFor(userId);
    const recent = await this.adapters.temporal.getRecentTransitions(userId, 200);
    const lastByConcept = new Map<string, KnowledgeStateTransition>();
    for (const t of [...recent, ...this.seedHistory(userId).reverse()]) if (!lastByConcept.has(t.conceptId)) lastByConcept.set(t.conceptId, t);
    const items = [...this.concepts.values()].flatMap((concept) => {
      const state = states.get(concept.id);
      if (!state) return [];
      const last = lastByConcept.get(concept.id);
      return [{ concept, state, level: knowledgeLevel(state), ...(last ? { lastTransition: last } : {}) }];
    });
    items.sort((a, b) => b.state.mastery - a.state.mastery);
    return { userId, items, edges: this.seed.edges, recentTransitions: await this.recentPrimaryTransitions(userId) };
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
    const claims = [...this.claims.values()].filter((c) => c.conceptIds.includes(conceptId)).slice(0, 6);
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

  async visualize(userId: string, input: { conceptId?: string; developmentId?: string }): Promise<DiagramSpec> {
    const ctx = await this.resolveLearningTarget(userId, input);
    const seeded = this.seed.diagrams[ctx.concept.id];
    if (seeded) return seeded;
    const key = `diagram:${ctx.concept.id}:${ctx.development?.id ?? ""}`;
    const cached = this.generated.get(key) as DiagramSpec | undefined;
    if (cached) return cached;
    const model = this.model();
    const r = await guarded("claude", "visualize", model ? () => model.visualize(ctx) : undefined, () => this.adapters.fallbackModel.visualize(ctx), this.claudeTimeout());
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
    const { semantic, localSemantic } = this.adapters;
    const [memories, hits] = await Promise.all([
      this.recall(userId, input.question),
      guarded(
        "mongo",
        "search",
        semantic ? () => semantic.search({ text: input.question, limit: 8 }) : undefined,
        () => localSemantic.search({ text: input.question, limit: 8 }),
        SEMANTIC_TIMEOUT_MS,
      ).then((r) => r.value),
    ]);

    // Expand search hits into candidate claims: claims directly, developments/concepts via their claims.
    const devClaimIds = new Set(input.developmentId ? (await this.getDevelopment(input.developmentId)).claimIds : []);
    const candidateIds = new Set(devClaimIds);
    for (const h of hits) {
      if (h.kind === "claim") candidateIds.add(h.id);
      if (h.kind === "development") for (const id of this.developments.get(h.id)?.claimIds ?? []) candidateIds.add(id);
      if (h.kind === "concept") for (const c of this.claims.values()) if (c.conceptIds.includes(h.id)) candidateIds.add(c.id);
    }
    const ranked = [...candidateIds]
      .flatMap((id) => (this.claims.has(id) ? [this.claims.get(id)!] : []))
      .map((c) => ({ c, score: lexicalScore(input.question, c.text) + (devClaimIds.has(c.id) ? 0.5 : 0) }))
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
        mode: input.mode ?? "quick",
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

  // -------------------------------------------------------------------------
  // Voice
  // -------------------------------------------------------------------------

  async voiceSession(userId: string): Promise<VoiceSession> {
    const { brief, developments } = await this.brief(userId);
    const states = await this.statesFor(userId);
    const profile = this.profileFor(userId);
    const major = developments.filter((d) => d.significance >= 0.75);
    const script = [
      `Good morning, ${profile.displayName}. You have about ${Math.round(brief.estimatedMinutes)} minutes. ${major.length} developments materially changed topics you follow today.`,
      ...developments.slice(0, 3).map((d, i) => {
        const delta = this.deterministicDelta(userId, d, states);
        const changed = delta.whatChanged[0] ?? d.summaryBullets[0] ?? "";
        // Personalize the lead story; keep the rest short so the briefing stays brisk.
        const tail = i === 0 ? ` ${delta.whyItMattersToYou.split(". ")[0]}.` : "";
        return `${i === 0 ? "First" : i === 1 ? "Next" : "And"}: ${d.title}. ${changed}${tail}`;
      }),
      `I skipped ${brief.skippedCount ?? 0} items that were duplicates, low signal, or things you already understand. Want to go deeper on any of these?`,
    ];
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
  // state; the diagnostic stays the only path that does.

  private readonly resources = new Map<string, Map<string, Resource>>();
  private readonly resourceText = new Map<string, { excerpt: string }>();
  private readonly teachings = new Map<string, TeachDeltaResponse>();
  private readonly teachPending = new Map<string, Promise<TeachDeltaResponse>>();

  private queue(userId: string): Map<string, Resource> {
    let q = this.resources.get(userId);
    if (!q) {
      q = new Map();
      this.resources.set(userId, q);
    }
    return q;
  }

  listResources(userId: string): Resource[] {
    return [...this.queue(userId).values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getResource(userId: string, id: string): Resource {
    const r = this.queue(userId).get(id);
    if (!r) throw new NotFoundError(`No resource ${id}`);
    return r;
  }

  private updateResource(userId: string, id: string, patch: Partial<Resource>): void {
    const q = this.queue(userId);
    const r = q.get(id);
    if (r) q.set(id, { ...r, ...patch });
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
    const q = this.queue(userId);
    const existing = [...q.values()].find((r) => r.url === url.toString() && r.status !== "failed");
    if (existing) return existing;
    if (q.size >= MAX_QUEUE) {
      const oldest = this.listResources(userId).at(-1);
      if (oldest) q.delete(oldest.id);
    }
    const resource: Resource = {
      id: newId("res"),
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
    runInBackground("resource.analyze", this.processResource(userId, resource.id));
    return resource;
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
    return [...this.concepts.values()].map((c) => {
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
      const page = await this.fetchShared(this.getResource(userId, id).url);
      const readMin = page.durationMinutes ?? readMinutes(page.words);
      this.updateResource(userId, id, {
        title: page.title ?? this.getResource(userId, id).title,
        ...(page.canonicalUrl ? { canonicalUrl: page.canonicalUrl } : {}),
        ...((page.publisher ?? publisherFromUrl(page.url)) ? { publisher: page.publisher ?? publisherFromUrl(page.url)! } : {}),
        ...(page.author ? { author: page.author } : {}),
        ...(page.publishedAt ? { publishedAt: page.publishedAt } : {}),
        fetchedAt: this.now().toISOString(),
        estimatedReadMinutes: readMin,
        readVia: page.readVia,
        // PDFs and videos are typed by what they are; web pages keep the URL-based class.
        ...(page.kind === "video" ? { sourceType: "video" as const } : page.kind === "pdf" && this.getResource(userId, id).sourceType === "article" ? { sourceType: "document" as const } : {}),
        url: page.url,
        stage: "mapping",
      });
      const concepts = await this.conceptViews(userId);
      const excerpt = page.text.slice(0, MAX_EXCERPT_CHARS);
      this.resourceText.set(id, { excerpt });
      this.updateResource(userId, id, { stage: "comparing" });
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
      this.updateResource(userId, id, {
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
      this.updateResource(userId, id, { status: "failed", stage: "done", error: message });
      logEvent("resource.failed", { userId, id, ms: Date.now() - started, error: err instanceof Error ? err.message : String(err) }, "warn");
    }
  }

  private async teachContext(userId: string, r: Resource): Promise<TeachContext> {
    return {
      title: r.title,
      summary: r.summary ?? "",
      excerpt: this.resourceText.get(r.id)?.excerpt ?? r.summary ?? "",
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
        const r = this.getResource(userId, id);
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
        if (out.source === "live") this.teachings.set(id, lesson);
        return lesson;
      })().finally(() => this.teachPending.delete(id));
      this.teachPending.set(id, p);
    }
    return p;
  }

  /** Teach the delta. Waits briefly for Claude's lesson, else answers from the source's own words. */
  async teachResource(userId: string, id: string): Promise<TeachDeltaResponse> {
    const r = this.getResource(userId, id);
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
    this.diagnostics.set(item.id, item);
    logEvent("playground.transfer_challenge", { conceptId, questionId: item.id, source: out.source === "live" ? "generated" : "fallback", ideas: d.rubric.length });
    return { item, source: out.source === "live" ? "generated" : "fallback", applicationContext: d.applicationContext };
  }

  /** Public prompt of a diagnostic (the answer key stays server-side). */
  diagnosticPrompt(questionId: string): { conceptId: string; prompt: string } | undefined {
    const q = this.diagnostics.get(questionId);
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
  conceptLesson(conceptId: string): { sections: Array<{ heading: string; body: string }>; resourceTitle?: string } {
    const concept = this.concepts.get(conceptId);
    if (!concept) throw new NotFoundError(`Concept not found: ${conceptId}`);
    const claims = [...this.claims.values()].filter((c) => c.conceptIds[0] === conceptId || c.conceptIds.includes(conceptId)).sort((a, b) => b.confidence - a.confidence);
    const source = claims.flatMap((c) => c.sourceIds).map((id) => this.sources.get(id)).find(Boolean);
    const sections = [
      { heading: "The idea", body: concept.description },
      ...claims.slice(0, 2).map((c, i) => ({ heading: i === 0 ? "What the evidence says" : "And", body: c.text })),
    ];
    return { sections, ...(source ? { resourceTitle: source.title } : {}) };
  }

  async reset(userId: string): Promise<void> {
    for (const id of this.queue(userId).keys()) {
      this.resourceText.delete(id);
      this.teachings.delete(id);
    }
    this.resources.delete(userId);
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
    this.phrasedDeltas.clear();
    logEvent("demo.reset", { userId });
  }

  /** Normalize raw sources into a Development with Claude (claims, concepts), then store it. */
  async ingest(bundle: Omit<RawSourceBundle, "knownConcepts">): Promise<Development> {
    const full: RawSourceBundle = { ...bundle, knownConcepts: [...this.concepts.values()] };
    const model = this.model();
    const { value, source } = await guarded(
      "claude",
      "normalizeDevelopment",
      model ? () => model.normalizeDevelopment(full) : undefined,
      () => this.adapters.fallbackModel.normalizeDevelopment(full),
      Math.max(this.claudeTimeout(), 45000),
    );
    for (const c of value.newConcepts) if (!this.concepts.has(c.id)) this.concepts.set(c.id, c);
    for (const c of value.claims) this.claims.set(c.id, c);
    for (const s of value.sources) this.sources.set(s.id, s);
    this.developments.set(value.development.id, value.development);
    this.meta[value.development.id] = {
      readMinutes: round(Math.max(1, value.claims.length * 0.5), 1),
      mentalModelShift: value.mentalModelShift,
      newClaimIds: value.claims.map((c) => c.id),
    };
    const { semantic } = this.adapters;
    await guarded("mongo", "upsertDevelopment", semantic ? () => semantic.upsertDevelopment(value.development) : undefined, () => undefined, SEMANTIC_TIMEOUT_MS);
    logEvent("development.ingested", { id: value.development.id, via: source, claims: value.claims.length, concepts: value.development.conceptIds });
    return value.development;
  }
}
