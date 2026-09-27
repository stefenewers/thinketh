// In-memory mock backend returning the canonical envelopes from
// packages/contracts. Stateful within an app session so the golden loop
// (answer -> Mind updates -> Today progress) works end to end offline.
//
// The knowledge-state update below is a fixed demo stand-in so the UI has
// something to render. The real update rules are owned by the intelligence
// layer (packages/intelligence); do not tune them here.
import { visualizationFromDiagram } from "@thinketh/contracts";
import type {
  AskResponse,
  DiagnosticCandidate,
  KnowledgeObservation,
  KnowledgeState,
  KnowledgeStateTransition,
  MemoryItem,
  Resource,
} from "@thinketh/contracts";
import { levelOf } from "@/lib/knowledge";
import { DEMO_USER_ID, type ThinkethApi, UnknownQuestionError } from "./client";
import * as fx from "./fixtures";
import { ApiError } from "./http";
import { OFFLINE_VISUALIZATIONS } from "./visualizations";

const clamp = (n: number) => Math.min(1, Math.max(0, fx.round(n)));
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Demo stand-in deltas: [deltaMastery, deltaUncertainty, observation weight].
const STEP: Partial<Record<KnowledgeObservation["kind"], [number, number, number]>> = {
  diagnostic_correct: [0.09, -0.15, 0.6],
  diagnostic_incorrect: [-0.03, -0.05, 0.6],
  got_it: [0.02, -0.03, 0.2],
  already_knew: [0.03, -0.02, 0.2],
};

const MEMORY: MemoryItem[] = [
  {
    id: "mem-pref-analogies",
    kind: "preference",
    content: "Prefers systems analogies (databases, caches, operating systems) over mathematical explanations.",
    createdAt: new Date(Date.now() - 9 * 86_400_000).toISOString(),
  },
  {
    id: "mem-misconception-context",
    kind: "misconception",
    content: "Has previously conflated a long context window with persistent memory.",
    createdAt: new Date(Date.now() - 18 * 86_400_000).toISOString(),
  },
];

// The live API's ids for the developments the offline seed also tells. When the API drops
// mid-session the app is holding its ids; these let the fallback keep serving the same story.
const API_DEVELOPMENT_IDS: Record<string, string> = {
  "dev-persistent-agent-memory": "dev-agent-memory",
  "dev-evaluator-layer": "dev-evaluators",
  "dev-mcp-elicitation": "dev-mcp",
};
const localId = (developmentId: string) => API_DEVELOPMENT_IDS[developmentId] ?? developmentId;

function createMockApi(): ThinkethApi {
  let states: KnowledgeState[] = fx.initialStates();
  let history = fx.initialHistory();
  let seq = 0;

  const stateOf = (conceptId: string) => {
    const s = states.find((x) => x.conceptId === conceptId);
    if (!s) throw new Error(`Unknown concept ${conceptId}`);
    return s;
  };
  const conceptOf = (conceptId: string) => {
    const c = fx.concepts.find((x) => x.id === conceptId);
    if (!c) throw new Error(`Unknown concept ${conceptId}`);
    return c;
  };

  function apply(
    conceptId: string,
    kind: KnowledgeObservation["kind"],
    reason: string,
    opts: { correctness?: number; sourceRef?: string; misconception?: string; propagated?: KnowledgeStateTransition["propagatedChanges"]; hold?: boolean } = {},
  ): KnowledgeStateTransition {
    const [dm, du, weight] = STEP[kind] ?? [0, 0, 0.1];
    const now = new Date().toISOString();
    const before = stateOf(conceptId);
    const uncertainty = clamp(before.uncertainty + du);
    // `hold`: recorded, but not new evidence (a repeated question), so the state doesn't move.
    const after: KnowledgeState = opts.hold ? before : {
      ...before,
      mastery: clamp(before.mastery + dm),
      uncertainty,
      confidence: clamp(1 - uncertainty),
      evidenceCount: before.evidenceCount + 1,
      lastObservedAt: now,
      misconceptionFlags: opts.misconception
        ? [...new Set([...before.misconceptionFlags, opts.misconception])]
        : before.misconceptionFlags,
    };
    seq += 1;
    const t: KnowledgeStateTransition = {
      id: `tr-live-${seq}`,
      userId: DEMO_USER_ID,
      conceptId,
      before,
      observation: {
        id: `obs-live-${seq}`,
        userId: DEMO_USER_ID,
        conceptId,
        kind,
        weight,
        correctness: opts.correctness,
        sourceRef: opts.sourceRef,
        createdAt: now,
      },
      after,
      reason,
      propagatedChanges: opts.propagated ?? [],
      createdAt: now,
    };
    states = states.map((s) => (s.conceptId === conceptId ? after : s));
    for (const p of t.propagatedChanges) {
      states = states.map((s) => {
        if (s.conceptId !== p.conceptId) return s;
        const u = clamp(s.uncertainty + p.deltaUncertainty);
        return { ...s, mastery: clamp(s.mastery + p.deltaMastery), uncertainty: u, confidence: clamp(1 - u), lastObservedAt: now };
      });
    }
    history[conceptId] = [...(history[conceptId] ?? []), t];
    return t;
  }

  const developmentOrThrow = (id: string) => {
    const d = fx.developments.find((x) => x.id === id);
    if (!d) throw new Error(`Unknown development ${id}`);
    return d;
  };

  function candidatesFor(selectedConceptId: string, debug: DiagnosticCandidate): DiagnosticCandidate[] {
    const others = states
      .filter((s) => s.conceptId !== selectedConceptId)
      .map((s) => {
        const c = conceptOf(s.conceptId);
        const interest = 0.6;
        const freshness = 0.5;
        const prerequisiteCentrality = 0.5;
        return {
          conceptId: c.id,
          conceptName: c.name,
          uncertainty: s.uncertainty,
          importance: c.importance,
          interest,
          freshness,
          prerequisiteCentrality,
          priority: fx.round(s.uncertainty * c.importance * interest * freshness),
        };
      })
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 4);
    return [debug, ...others];
  }

  return {
    async resetDemo() {
      states = fx.initialStates();
      history = fx.initialHistory();
    },

    async getTodayBrief() {
      await delay(450);
      return {
        brief: {
          date: fx.todayISODate(),
          meaningfulCount: fx.developments.length,
          majorCount: fx.developments.filter((d) => d.significance >= 0.75).length,
          estimatedMinutes: 11,
          skippedCount: Object.values(fx.skippedBreakdown).reduce((a, b) => a + b, 0),
          skippedBreakdown: fx.skippedBreakdown,
          heroDevelopmentId: fx.HERO_ID,
          developmentIds: fx.developments.map((d) => d.id),
        },
        developments: fx.developments,
        sources: fx.sources,
      };
    },

    async getDevelopment(apiId) {
      await delay(300);
      const id = localId(apiId);
      const development = developmentOrThrow(id);
      return {
        development,
        delta: fx.deltaFor(id),
        sources: fx.sources.filter((s) => development.sourceIds.includes(s.id)),
        concepts: fx.concepts.filter((c) => development.conceptIds.includes(c.id)),
        claims: fx.claims.filter((c) => development.claimIds.includes(c.id)),
        storylines: [],
      };
    },

    async sendFeedback(developmentId, kind) {
      await delay(200);
      const conceptId = fx.deltaFor(localId(developmentId)).affectedConcepts[0].conceptId;
      // Mirrors the API: a self-report counts once per development.
      if ((history[conceptId] ?? []).some((t) => t.observation.kind === kind && t.observation.sourceRef === developmentId)) return { transitions: [] };
      const reason =
        kind === "already_knew"
          ? "You said you already knew this. Thinketh raised its estimate slightly and will skip similar material, pending verification."
          : "You marked this as understood. Self-reported, so it counts as a low-weight signal until verified.";
      return { transitions: [apply(conceptId, kind, reason, { sourceRef: developmentId })] };
    },

    async selectDiagnostic({ developmentId, conceptId }) {
      await delay(500);
      // By development, else by concept (a development only the live API knows still names its concept).
      const seed =
        (developmentId ? fx.diagnostics.find((d) => d.developmentId === localId(developmentId)) : undefined) ??
        (conceptId ? fx.diagnostics.find((d) => d.question.conceptId === conceptId) : undefined) ??
        (conceptId && fx.concepts.some((c) => c.id === conceptId) ? fx.recognitionCheck(conceptId) : undefined) ??
        // Nothing named: the lead story's question, as the API picks across all concepts.
        (!developmentId && !conceptId ? fx.diagnostics[0] : undefined);
      if (!seed) throw new Error("No diagnostic available");
      const q = seed.question;
      const debug = q.selectionDebug ?? { uncertainty: 0, importance: 0, interest: 0, freshness: 0, prerequisiteCentrality: 0, priority: 0 };
      return {
        question: q,
        selection: {
          explanation: q.rationale,
          candidates: candidatesFor(q.conceptId, { ...debug, conceptId: q.conceptId, conceptName: conceptOf(q.conceptId).name }),
        },
      };
    },

    async answerDiagnostic(questionId, answer) {
      await delay(700);
      const seed =
        fx.diagnostics.find((d) => d.question.id === questionId) ??
        (questionId.startsWith("dq-offline-") ? fx.recognitionCheck(questionId.slice("dq-offline-".length)) : undefined);
      if (!seed) throw new UnknownQuestionError(`Unknown question ${questionId}`);
      const correct = seed.question.choices?.[seed.correctIndex] === answer;
      // Mirrors the engine: a repeated question isn't new evidence, so a correct repeat holds the estimate.
      const repeat = Object.values(history).some((ts) => ts.some((t) => t.observation.sourceRef === `diagnostic:${questionId}`));
      const held = stateOf(seed.question.conceptId);
      const transition = correct && repeat
        ? apply(
            seed.question.conceptId,
            "diagnostic_correct",
            `Updated because you answered a question you'd already answered, so it isn't new evidence. Mastery held at ${held.mastery.toFixed(2)} and uncertainty is unchanged. A new question on this concept is what can show more.`,
            { correctness: 1, sourceRef: `diagnostic:${questionId}`, hold: true },
          )
        : correct
        ? apply(seed.question.conceptId, "diagnostic_correct", seed.correctReason, {
            correctness: 1,
            sourceRef: `diagnostic:${questionId}`,
            propagated: seed.propagated,
          })
        : apply(
            seed.question.conceptId,
            "diagnostic_incorrect",
            `You chose “${answer}”. Thinketh lowered its estimate slightly and flagged the confusion so the next explanation targets it.`,
            { correctness: 0, sourceRef: `diagnostic:${questionId}`, misconception: `chose “${answer}”` },
          );
      return {
        answer: {
          questionId,
          userId: DEMO_USER_ID,
          answer,
          correctness: correct ? 1 : 0,
          feedback: correct ? seed.correctFeedback : seed.incorrectFeedback,
        },
        transition,
      };
    },

    async getKnowledge() {
      await delay(350);
      return {
        userId: DEMO_USER_ID,
        items: states.map((state) => {
          const transitions = history[state.conceptId] ?? [];
          return {
            concept: conceptOf(state.conceptId),
            state,
            level: levelOf(state.mastery),
            lastTransition: transitions[transitions.length - 1],
          };
        }),
        edges: fx.edges,
      };
    },

    async getConceptHistory(conceptId) {
      await delay(250);
      const current = stateOf(conceptId);
      return { concept: conceptOf(conceptId), current, level: levelOf(current.mastery), transitions: history[conceptId] ?? [] };
    },

    async ask({ question, developmentId }) {
      await delay(900);
      // "Explain deeper" names its development: answer from that development's own delta.
      const dev = developmentId ? localId(developmentId) : undefined;
      return dev && fx.developments.some((d) => d.id === dev) ? answerForDevelopment(dev) : answerFor(question);
    },

    async visualize({ developmentId }) {
      await delay(600);
      const id = developmentId ? localId(developmentId) : fx.HERO_ID;
      return OFFLINE_VISUALIZATIONS[id] ?? visualizationFromDiagram(fx.diagramFor(id));
    },

    async makeItStick({ conceptId, developmentId }) {
      await delay(600);
      const id = conceptId ?? (developmentId ? fx.deltaFor(localId(developmentId)).affectedConcepts[0].conceptId : "agent-memory");
      return fx.memoryAidFor(id);
    },

    // Reading real pages needs the live API; offline, say so rather than invent an analysis.
    async listResources() {
      await delay(150);
      return [...mockResources.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    // Mirrors the API: a source that can't be read is not added. Offline, nothing new can be read.
    async addResource(url) {
      await delay(300);
      throw new ApiError(`POST /resources -> 422: Reading new sources needs the live Thinketh API (${hostOf(url)} wasn't added)`, 422);
    },

    async getResource(resId) {
      await delay(100);
      const r = mockResources.get(resId);
      if (!r) throw new Error(`No resource ${resId}`);
      return r;
    },

    async teachResource() {
      throw new Error("Teaching a saved source needs the live Thinketh API.");
    },

    async createVoiceSession() {
      await delay(300);
      return {
        mode: "transcript_fallback",
        dynamicVariables: {},
        fallbackTranscript: fx.voiceScript,
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      };
    },
  };
}

const mockResources = new Map<string, Resource>();

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function citationsFor(developmentIds: string[]) {
  const ids = new Set(fx.developments.filter((d) => developmentIds.includes(d.id)).flatMap((d) => d.sourceIds));
  return fx.sources.filter((s) => ids.has(s.id)).map((s) => ({ sourceId: s.id, title: s.title }));
}

/** Grounded in the development's seeded delta only: what happened, what you knew, what changed. */
function answerForDevelopment(developmentId: string): AskResponse {
  const delta = fx.deltaFor(developmentId);
  const sections = {
    sourcesSay: delta.whatHappened,
    thinkethInfers: [...delta.whatChanged, delta.mentalModelChange],
    youAlreadyUnderstand: delta.alreadyKnew,
    stillUncertain: [],
  };
  return {
    answer: [...sections.sourcesSay, ...sections.thinkethInfers].join(" "),
    citations: citationsFor([developmentId]),
    relatedConceptIds: delta.affectedConcepts.map((c) => c.conceptId),
    memoryUsed: [],
    sections,
  };
}

function answerFor(question: string): AskResponse {
  const q = question.toLowerCase();
  const build = (sections: NonNullable<AskResponse["sections"]>, developmentIds: string[], relatedConceptIds: string[], memoryUsed: MemoryItem[]): AskResponse => ({
    answer: [...sections.sourcesSay, ...sections.thinkethInfers].join(" ") || sections.stillUncertain.join(" "),
    citations: citationsFor(developmentIds),
    relatedConceptIds,
    memoryUsed,
    sections,
  });
  if (q.includes("weak")) {
    return build(
      {
        sourcesSay: [],
        thinkethInfers: [
          "Evaluator Architectures is your weakest area: two observations, and one flagged confusion between run-time evaluators and training-time reward models.",
          "Computer Use and Long-running Agents are next. Both have high uncertainty, which means Thinketh has little evidence either way.",
        ],
        youAlreadyUnderstand: ["Agent Tool Use and Context Windows are strong and well evidenced."],
        stillUncertain: ["High uncertainty is not the same as weak understanding. A single check on Computer Use would tell us a lot."],
      },
      ["dev-evaluators"],
      ["evaluator-architectures", "computer-use", "long-running-agents"],
      [],
    );
  }
  if (q.includes("mcp") || q.includes("model context protocol")) {
    return build(
      {
        sourcesSay: ["MCP standardizes how a model connects to tools and data through a server interface.", "This week's spec update adds streaming results and remote authentication."],
        thinkethInfers: ["You already understand tool calling well. MCP is the plug that makes the same tool usable by any model, instead of one integration per model."],
        youAlreadyUnderstand: ["Agents choose and call tools, then act on the results (strong)."],
        stillUncertain: ["How widely remote MCP servers are used in production is still emerging."],
      },
      ["dev-mcp"],
      ["mcp", "agent-tool-use"],
      [MEMORY[0]],
    );
  }
  if (q.includes("memory")) {
    return build(
      {
        sourcesSay: [
          "Claude agents can now write to and read from a memory store that persists after a session ends.",
          "A new paper reports better completion rates on multi-day tasks when agents have cross-session memory.",
        ],
        thinkethInfers: ["The practical shift is from agents as single tasks to agents as ongoing workers that accumulate context."],
        youAlreadyUnderstand: ["Context carries forward within a session.", "Retrieval can pull documents into context on demand."],
        stillUncertain: ["How memory should be pruned or corrected over time is not settled."],
      },
      [fx.HERO_ID],
      ["agent-memory", "long-running-agents", "context-windows"],
      MEMORY,
    );
  }
  return build(
    {
      sourcesSay: [],
      thinkethInfers: [],
      youAlreadyUnderstand: [],
      stillUncertain: ["Thinketh doesn't have enough evidence in your sources to answer this well yet. Try one of the suggested questions."],
    },
    [],
    [],
    [],
  );
}

export const mockApi = createMockApi();
