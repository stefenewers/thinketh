// In-memory mock backend. Stateful within an app session so the golden loop
// (answer -> Mind updates -> Today progress) works end to end.
//
// The knowledge-state update below is a fixed demo stand-in so the UI has
// something to render. The real update rules are owned by the intelligence
// layer (packages/intelligence); do not tune them here.
import type { KnowledgeObservation, KnowledgeState, KnowledgeStateTransition } from "@thinketh/contracts";
import { DEMO_USER_ID, type ThinkethApi } from "./client";
import * as fx from "./fixtures";
import type { AskResponse, FeedbackKind } from "./types";

const clamp = (n: number) => Math.min(1, Math.max(0, fx.round(n)));
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Demo stand-in deltas: [deltaMastery, deltaUncertainty, observation weight].
const STEP: Record<KnowledgeObservation["kind"], [number, number, number] | undefined> = {
  diagnostic_correct: [0.09, -0.15, 0.6],
  diagnostic_incorrect: [-0.03, -0.05, 0.6],
  got_it: [0.02, -0.03, 0.2],
  already_knew: [0.03, -0.02, 0.2],
  diagnostic_partial: undefined,
  viewed: undefined,
  saved: undefined,
  explained: undefined,
  revisited: undefined,
  asked_followup: undefined,
  misconception_detected: undefined,
};

function createMockApi(): ThinkethApi & { reset(): void } {
  let states: KnowledgeState[] = fx.initialStates();
  let history = fx.initialHistory();
  let understood = new Set<string>();
  let recent: KnowledgeStateTransition[] = [];
  let seq = 0;

  const stateOf = (conceptId: string) => {
    const s = states.find((x) => x.conceptId === conceptId);
    if (!s) throw new Error(`Unknown concept ${conceptId}`);
    return s;
  };

  function apply(
    conceptId: string,
    kind: KnowledgeObservation["kind"],
    reason: string,
    opts: { correctness?: number; sourceRef?: string; misconception?: string; propagated?: KnowledgeStateTransition["propagatedChanges"] } = {},
  ): KnowledgeStateTransition {
    const [dm, du, weight] = STEP[kind] ?? [0, 0, 0.1];
    const now = new Date().toISOString();
    const before = stateOf(conceptId);
    const uncertainty = clamp(before.uncertainty + du);
    const after: KnowledgeState = {
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
    const id = `tr-live-${++seq}`;
    const t: KnowledgeStateTransition = {
      id,
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
    recent = [t, ...recent];
    return t;
  }

  const developmentOrThrow = (id: string) => {
    const d = fx.developments.find((x) => x.id === id);
    if (!d) throw new Error(`Unknown development ${id}`);
    return d;
  };

  return {
    reset() {
      states = fx.initialStates();
      history = fx.initialHistory();
      understood = new Set();
      recent = [];
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
        concepts: fx.concepts,
        understoodDevelopmentIds: [...understood],
        recentTransitions: recent,
      };
    },

    async getDevelopment(id) {
      await delay(300);
      const development = developmentOrThrow(id);
      return {
        development,
        delta: fx.deltaFor(id),
        sources: fx.sources.filter((s) => development.sourceIds.includes(s.id)),
        concepts: fx.concepts.filter((c) => development.conceptIds.includes(c.id)),
        claims: fx.claims.filter((c) => development.claimIds.includes(c.id)),
      };
    },

    async sendFeedback(developmentId, kind: FeedbackKind) {
      await delay(200);
      const conceptId = fx.deltaFor(developmentId).affectedConcepts[0].conceptId;
      const reason =
        kind === "got_it"
          ? "You marked this as understood. Self-reported, so it counts as a low-weight signal until verified."
          : "You said you already knew this. Thinketh raised its estimate slightly and will skip similar material, pending verification.";
      return { transitions: [apply(conceptId, kind, reason, { sourceRef: developmentId })] };
    },

    async selectDiagnostic({ developmentId, conceptId }) {
      await delay(500);
      const seed = fx.diagnostics.find((d) => (developmentId ? d.developmentId === developmentId : d.question.conceptId === conceptId));
      if (!seed) throw new Error("No diagnostic available");
      return seed.question;
    },

    async answerDiagnostic(questionId, { answer }) {
      await delay(700);
      const seed = fx.diagnostics.find((d) => d.question.id === questionId);
      if (!seed) throw new Error(`Unknown question ${questionId}`);
      const correct = seed.question.choices?.[seed.correctIndex] === answer;
      const transition = correct
        ? apply(seed.question.conceptId, "diagnostic_correct", seed.correctReason, {
            correctness: 1,
            sourceRef: questionId,
            propagated: seed.propagated,
          })
        : apply(
            seed.question.conceptId,
            "diagnostic_incorrect",
            `You chose “${answer}”. Thinketh lowered its estimate slightly and flagged the confusion so the next explanation targets it.`,
            { correctness: 0, sourceRef: questionId, misconception: `chose “${answer}”` },
          );
      if (correct) understood.add(seed.developmentId);
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
      return { states, concepts: fx.concepts, edges: fx.edges, recentTransitions: recent };
    },

    async getConceptHistory(conceptId) {
      await delay(250);
      return history[conceptId] ?? [];
    },

    async ask({ question }) {
      await delay(900);
      return answerFor(question);
    },

    async visualize({ developmentId }) {
      await delay(600);
      return fx.diagramFor(developmentId ?? fx.HERO_ID);
    },

    async makeItStick({ conceptId }) {
      await delay(600);
      return fx.memoryAidFor(conceptId);
    },

    async createVoiceSession() {
      await delay(300);
      return {
        sessionId: "voice-mock",
        conversationToken: null,
        agentId: null,
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
        fallbackScript: fx.voiceScript,
      };
    },
  };
}

function answerFor(question: string): AskResponse {
  const q = question.toLowerCase();
  if (q.includes("weak")) {
    return {
      question,
      sourcesSay: [],
      thinkethInfers: [
        "Evaluator Architectures is your weakest area: two observations, and one flagged confusion between run-time evaluators and training-time reward models.",
        "Computer Use and Long-running Agents are next. Both have high uncertainty, which means Thinketh has little evidence either way.",
      ],
      youAlreadyUnderstand: ["Agent Tool Use and Context Windows are strong and well evidenced."],
      stillUncertain: ["High uncertainty is not the same as weak understanding. A single check on Computer Use would tell us a lot."],
      citedDevelopmentIds: ["dev-evaluators"],
      citedConceptIds: ["evaluator-architectures", "computer-use", "long-running-agents"],
    };
  }
  if (q.includes("mcp")) {
    return {
      question,
      sourcesSay: ["MCP standardizes how a model connects to tools and data through a server interface.", "This week's spec update adds streaming results and remote authentication."],
      thinkethInfers: ["You already understand tool calling well. MCP is the plug that makes the same tool usable by any model, instead of one integration per model."],
      youAlreadyUnderstand: ["Agents choose and call tools, then act on the results (strong)."],
      stillUncertain: ["How widely remote MCP servers are used in production is still emerging."],
      citedDevelopmentIds: ["dev-mcp"],
      citedConceptIds: ["mcp", "agent-tool-use"],
    };
  }
  if (q.includes("memory")) {
    return {
      question,
      sourcesSay: [
        "Claude agents can now write to and read from a memory store that persists after a session ends.",
        "A new paper reports better completion rates on multi-day tasks when agents have cross-session memory.",
      ],
      thinkethInfers: ["The practical shift is from agents as single tasks to agents as ongoing workers that accumulate context."],
      youAlreadyUnderstand: ["Context carries forward within a session.", "Retrieval can pull documents into context on demand."],
      stillUncertain: ["How memory should be pruned or corrected over time is not settled."],
      citedDevelopmentIds: [fx.HERO_ID],
      citedConceptIds: ["agent-memory", "long-running-agents", "context-windows"],
    };
  }
  return {
    question,
    sourcesSay: [],
    thinkethInfers: [],
    youAlreadyUnderstand: [],
    stillUncertain: ["Thinketh doesn't have enough evidence in your sources to answer this well yet. Try one of the suggested questions."],
    citedDevelopmentIds: [],
    citedConceptIds: [],
  };
}

export const mockApi = createMockApi();
