// Deterministic demo dataset. Numbers match 06-demo-runbook.md.
// Timestamps are relative to app launch so "today" always reads as today.
import type {
  Claim,
  Concept,
  ConceptEdge,
  DeltaExplanation,
  Development,
  DiagnosticQuestion,
  DiagramSpec,
  KnowledgeState,
  KnowledgeStateTransition,
  MemoryAid,
  Source,
} from "@thinketh/contracts";
import { DEMO_USER_ID } from "./client";

const NOW = Date.now();
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
const daysAgo = (d: number) => hoursAgo(d * 24);
export const todayISODate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const HERO_ID = "dev-agent-memory";

export const concepts: Concept[] = [
  { id: "agent-memory", name: "Agent Memory", description: "How an agent stores useful information and reads it back in later, separate sessions — as distinct from what fits in a single context window.", domain: "Agent Architecture", importance: 0.9 },
  { id: "agent-tool-use", name: "Agent Tool Use", description: "An agent choosing and calling external tools, then acting on the results.", domain: "Agent Architecture", importance: 0.85 },
  { id: "mcp", name: "Model Context Protocol", description: "An open protocol for connecting models to tools and data sources through a standard server interface.", domain: "Developer Tooling", importance: 0.8 },
  { id: "evaluator-architectures", name: "Evaluator Architectures", description: "Pipelines where a separate model or agent checks, scores, or critiques another agent's output before it is used.", domain: "Agent Architecture", importance: 0.7 },
  { id: "long-running-agents", name: "Long-running Agents", description: "Agents that work on a goal across hours or days, pausing and resuming rather than finishing in one session.", domain: "Agent Architecture", importance: 0.75 },
  { id: "context-windows", name: "Context Windows", description: "The amount of text a model can attend to at once. Context lasts for a session; it is not memory.", domain: "Foundation Models", importance: 0.65 },
  { id: "retrieval", name: "Retrieval (RAG)", description: "Fetching relevant documents at query time and placing them into the model's context.", domain: "Infrastructure", importance: 0.7 },
  { id: "reasoning-models", name: "Reasoning Models", description: "Models trained to spend more computation thinking through a problem before answering.", domain: "Foundation Models", importance: 0.7 },
  { id: "multimodal-reasoning", name: "Multimodal Reasoning", description: "Reasoning jointly across text, images, audio, and video rather than handling each separately.", domain: "Multimodal AI", importance: 0.6 },
  { id: "computer-use", name: "Computer Use", description: "Agents operating software through screens, clicks, and keystrokes the way a person would.", domain: "Agent Architecture", importance: 0.55 },
];

export const edges: ConceptEdge[] = [
  { fromConceptId: "agent-memory", toConceptId: "long-running-agents", type: "supports", weight: 0.85 },
  { fromConceptId: "agent-memory", toConceptId: "context-windows", type: "contrasts", weight: 0.7 },
  { fromConceptId: "agent-memory", toConceptId: "retrieval", type: "related", weight: 0.75 },
  { fromConceptId: "agent-tool-use", toConceptId: "mcp", type: "related", weight: 0.8 },
  { fromConceptId: "agent-tool-use", toConceptId: "long-running-agents", type: "supports", weight: 0.6 },
  { fromConceptId: "evaluator-architectures", toConceptId: "long-running-agents", type: "supports", weight: 0.5 },
  { fromConceptId: "reasoning-models", toConceptId: "evaluator-architectures", type: "related", weight: 0.5 },
  { fromConceptId: "multimodal-reasoning", toConceptId: "computer-use", type: "supports", weight: 0.6 },
  { fromConceptId: "agent-tool-use", toConceptId: "computer-use", type: "related", weight: 0.6 },
  { fromConceptId: "context-windows", toConceptId: "reasoning-models", type: "related", weight: 0.4 },
  { fromConceptId: "mcp", toConceptId: "agent-memory", type: "related", weight: 0.5 },
];

const seedStates: [string, number, number, number][] = [
  // conceptId, mastery, uncertainty, evidenceCount
  ["agent-tool-use", 0.82, 0.14, 9],
  ["context-windows", 0.74, 0.18, 7],
  ["retrieval", 0.69, 0.22, 6],
  ["reasoning-models", 0.63, 0.27, 5],
  ["mcp", 0.58, 0.31, 5],
  ["multimodal-reasoning", 0.47, 0.4, 3],
  ["agent-memory", 0.42, 0.44, 3],
  ["long-running-agents", 0.36, 0.48, 2],
  ["computer-use", 0.31, 0.55, 1],
  ["evaluator-architectures", 0.24, 0.52, 2],
];

export function initialStates(): KnowledgeState[] {
  return seedStates.map(([conceptId, mastery, uncertainty, evidenceCount]) => ({
    userId: DEMO_USER_ID,
    conceptId,
    mastery,
    confidence: round(1 - uncertainty),
    uncertainty,
    evidenceCount,
    lastObservedAt: conceptId === "agent-memory" ? daysAgo(7) : daysAgo(3),
    misconceptionFlags: conceptId === "evaluator-architectures" ? ["conflates evaluator with reward model"] : [],
  }));
}

export const round = (n: number) => Math.round(n * 100) / 100;

function transition(
  id: string,
  conceptId: string,
  kind: KnowledgeStateTransition["observation"]["kind"],
  weight: number,
  from: [number, number, number],
  to: [number, number, number],
  reason: string,
  at: string,
): KnowledgeStateTransition {
  const state = ([mastery, uncertainty, evidenceCount]: [number, number, number], observedAt: string): KnowledgeState => ({
    userId: DEMO_USER_ID,
    conceptId,
    mastery,
    confidence: round(1 - uncertainty),
    uncertainty,
    evidenceCount,
    lastObservedAt: observedAt,
    misconceptionFlags: [],
  });
  return {
    id,
    userId: DEMO_USER_ID,
    conceptId,
    before: state(from, daysAgo(40)),
    observation: { id: `obs-${id}`, userId: DEMO_USER_ID, conceptId, kind, weight, createdAt: at },
    after: state(to, at),
    reason,
    propagatedChanges: [],
    createdAt: at,
  };
}

export function initialHistory(): Record<string, KnowledgeStateTransition[]> {
  const history: Record<string, KnowledgeStateTransition[]> = {
    "agent-memory": [
      transition("tr-am-1", "agent-memory", "viewed", 0.1, [0.3, 0.6, 0], [0.34, 0.55, 1], "Read about 1M-token context windows. Passive reading is a low-weight signal.", daysAgo(28)),
      transition("tr-am-2", "agent-memory", "got_it", 0.2, [0.34, 0.55, 1], [0.38, 0.5, 2], "Marked “Got it” on an external-memory architecture development. Self-reported, not yet verified.", daysAgo(16)),
      transition("tr-am-3", "agent-memory", "asked_followup", 0.25, [0.38, 0.5, 2], [0.42, 0.44, 3], "Asked how retrieval differs from memory. Shows active engagement; the understanding itself was not tested.", daysAgo(7)),
    ],
    // Mirrors the API seed: real prior history exists only for these two concepts. The rest start
    // from an estimate with no recorded change (onboarding promises "never asked").
    "evaluator-architectures": [
      transition("tr-ev-1", "evaluator-architectures", "diagnostic_partial", 0.8, [0.3, 0.62, 0], [0.24, 0.53, 1], "Updated because you partially answered a question on why graders should be independent.", daysAgo(12)),
      transition("tr-ev-2", "evaluator-architectures", "viewed", 0.05, [0.24, 0.53, 1], [0.24, 0.52, 2], "Updated because you viewed a development. A light signal: it can't show understanding by itself.", daysAgo(6)),
    ],
  };
  return history;
}

export const sources: Source[] = [
  // Real, verified pages where they support the claims that cite them; the rest are marked (demo), never credited to a real org.
  { id: "src-am-1", title: "Managing context on the Claude Developer Platform", sourceType: "announcement", publisher: "Anthropic", url: "https://claude.com/blog/context-management", credibility: 0.95 },
  { id: "src-am-2", title: "Memory tool", sourceType: "docs", publisher: "Claude Platform Docs", url: "https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool", credibility: 0.93 },
  { id: "src-am-3", title: "Towards agents that remember: evaluation of cross-session memory", sourceType: "paper", publisher: "Preprint (demo)", publishedAt: daysAgo(6), credibility: 0.8 },
  { id: "src-am-4", title: "letta-ai/letta: Platform for stateful agents with advanced memory", sourceType: "github", publisher: "GitHub", url: "https://github.com/letta-ai/letta", credibility: 0.75 },
  { id: "src-mm-1", title: "Native multimodal reasoning in production models", sourceType: "announcement", publisher: "Frontier lab blog (demo)", publishedAt: hoursAgo(5), credibility: 0.9 },
  { id: "src-ev-1", title: "Evaluator agents in production pipelines", sourceType: "article", publisher: "Applied ML newsletter (demo)", publishedAt: hoursAgo(9), credibility: 0.8 },
  { id: "src-ev-2", title: "Building Effective AI Agents", sourceType: "article", publisher: "Anthropic", url: "https://www.anthropic.com/engineering/building-effective-agents", credibility: 0.85 },
  { id: "src-mcp-1", title: "Key Changes (Model Context Protocol specification, 2025-03-26)", sourceType: "docs", publisher: "Model Context Protocol", url: "https://modelcontextprotocol.io/specification/2025-03-26/changelog", credibility: 0.9 },
  { id: "src-rm-1", title: "Small reasoning models on structured benchmarks", sourceType: "article", publisher: "Research newsletter (demo)", publishedAt: hoursAgo(14), credibility: 0.8 },
  { id: "src-cu-1", title: "An open computer-use toolkit for agents", sourceType: "github", publisher: "Open-source project (demo)", publishedAt: hoursAgo(16), credibility: 0.7 },
];

export const developments: Development[] = [
  {
    id: HERO_ID,
    title: "Persistent agent memory changes how long-running agents operate",
    summaryBullets: [
      "Agents can now keep useful context across separate sessions, not just within one.",
      "Memory is scoped, inspectable, and deletable.",
    ],
    happenedAt: hoursAgo(2),
    significance: 0.92,
    novelty: 0.84,
    credibility: 0.94,
    momentum: 0.8,
    conceptIds: ["agent-memory", "long-running-agents", "context-windows"],
    claimIds: ["cl-am-1", "cl-am-2"],
    sourceIds: ["src-am-1", "src-am-2", "src-am-3", "src-am-4"],
    storylineIds: ["story-agent-memory"],
  },
  {
    id: "dev-multimodal",
    title: "Gemini reasons across modalities natively",
    summaryBullets: ["Text, image, and audio are processed in one pass rather than stitched together."],
    happenedAt: hoursAgo(5),
    significance: 0.81,
    novelty: 0.7,
    credibility: 0.92,
    momentum: 0.75,
    conceptIds: ["multimodal-reasoning", "computer-use"],
    claimIds: [],
    sourceIds: ["src-mm-1"],
    storylineIds: [],
  },
  {
    id: "dev-evaluators",
    title: "Evaluator agents become a standard layer in agent pipelines",
    summaryBullets: ["Teams now route agent output through a separate checking agent before acting on it."],
    happenedAt: hoursAgo(9),
    significance: 0.78,
    novelty: 0.66,
    credibility: 0.8,
    momentum: 0.82,
    conceptIds: ["evaluator-architectures", "long-running-agents"],
    claimIds: [],
    sourceIds: ["src-ev-1", "src-ev-2"],
    storylineIds: [],
  },
  {
    id: "dev-mcp",
    title: "MCP adds streaming tool results and remote authentication",
    summaryBullets: ["Tools can return partial results as they work, and remote servers get a standard auth flow."],
    happenedAt: hoursAgo(11),
    significance: 0.62,
    novelty: 0.55,
    credibility: 0.9,
    momentum: 0.6,
    conceptIds: ["mcp", "agent-tool-use"],
    claimIds: [],
    sourceIds: ["src-mcp-1"],
    storylineIds: [],
  },
  {
    id: "dev-small-reasoning",
    title: "Small reasoning-tuned models match larger ones on structured tasks",
    summaryBullets: ["On math and code benchmarks, thinking time substitutes for parameter count."],
    happenedAt: hoursAgo(14),
    significance: 0.58,
    novelty: 0.45,
    credibility: 0.85,
    momentum: 0.55,
    conceptIds: ["reasoning-models"],
    claimIds: [],
    sourceIds: ["src-rm-1"],
    storylineIds: [],
  },
  {
    id: "dev-computer-use",
    title: "Open-source agents get a standard computer-use toolkit",
    summaryBullets: ["A shared toolkit for screen control lowers the bar for building computer-use agents."],
    happenedAt: hoursAgo(16),
    significance: 0.52,
    novelty: 0.5,
    credibility: 0.7,
    momentum: 0.5,
    conceptIds: ["computer-use", "agent-tool-use"],
    claimIds: [],
    sourceIds: ["src-cu-1"],
    storylineIds: [],
  },
];

export const claims: Claim[] = [
  { id: "cl-am-1", text: "Agents can write to and read from a memory store that persists after the session ends.", confidence: 0.95, sourceIds: ["src-am-1", "src-am-2"], conceptIds: ["agent-memory"], stance: "supports" },
  { id: "cl-am-2", text: "Cross-session memory improves completion rates on multi-day tasks.", confidence: 0.7, sourceIds: ["src-am-3"], conceptIds: ["long-running-agents"], stance: "supports" },
];

// Keys match the backend's snake_case categories; the app maps them to labels.
export const skippedBreakdown: Record<string, number> = {
  duplicate: 68,
  low_signal: 31,
  already_understood: 22,
  minor_update: 15,
  low_confidence: 7,
};

type DeltaSeed = Omit<DeltaExplanation, "developmentId" | "userId">;

const deltaSeeds: Record<string, DeltaSeed> = {
  [HERO_ID]: {
    whatHappened: [
      "Claude agents can now write facts to a memory store and read them back in later, separate sessions.",
      "Memory is scoped per user or project, and can be inspected, edited, and deleted.",
      "Early users report coding and support agents resuming multi-day work without being re-briefed.",
    ],
    whyItMattersToYou:
      "You follow agent architecture and build with tool-using agents. This changes what an agent can be responsible for between your sessions.",
    alreadyKnew: [
      "Agents can call tools and act on the results.",
      "Within one session, context carries forward through the context window.",
      "Retrieval can pull documents into context on demand.",
    ],
    whatChanged: [
      "Useful state now survives after the session ends.",
      "The agent decides what to remember, not only what to retrieve.",
    ],
    mentalModelChange: "Agents can now behave less like isolated tasks and more like persistent software workers.",
    affectedConcepts: [
      { conceptId: "agent-memory", reason: "The core mechanism of this development." },
      { conceptId: "long-running-agents", reason: "Persistent memory is what makes multi-day agents practical." },
      { conceptId: "context-windows", reason: "Separates session context from persisted state." },
    ],
  },
  "dev-multimodal": {
    whatHappened: ["Gemini now reasons over text, images, and audio in one model pass.", "Benchmarks show gains on tasks that mix screenshots with instructions."],
    whyItMattersToYou: "Computer-use agents depend on reading screens. Joint reasoning makes that more reliable.",
    alreadyKnew: ["Models can accept images as input.", "Earlier systems often converted images to text first."],
    whatChanged: ["Modalities are no longer handled by separate stages."],
    mentalModelChange: "Seeing and reading are becoming one skill for models, not two.",
    affectedConcepts: [
      { conceptId: "multimodal-reasoning", reason: "Directly advanced." },
      { conceptId: "computer-use", reason: "Screen understanding is a bottleneck for computer use." },
    ],
  },
  "dev-evaluators": {
    whatHappened: ["Several teams published pipelines where a separate evaluator agent checks work before it ships.", "Generator–verifier loops show gains on long-horizon tasks."],
    whyItMattersToYou: "This is your weakest area, and it is becoming standard practice in the systems you build.",
    alreadyKnew: ["Agents can make mistakes that compound over long tasks."],
    whatChanged: ["Checking is becoming its own architectural layer, not an afterthought."],
    mentalModelChange: "Reliable agents are pairs: one that acts and one that checks.",
    affectedConcepts: [
      { conceptId: "evaluator-architectures", reason: "Directly advanced." },
      { conceptId: "long-running-agents", reason: "Verification limits compounding errors over long tasks." },
    ],
  },
  "dev-mcp": {
    whatHappened: ["MCP servers can stream partial tool results.", "Remote MCP servers get a standard authentication flow."],
    whyItMattersToYou: "You already use tool calling. This makes remote tools practical for production agents.",
    alreadyKnew: ["MCP standardizes how models connect to tools.", "Tool calls return a single result."],
    whatChanged: ["Tools can report progress while they work."],
    mentalModelChange: "MCP is moving from local developer plumbing to production infrastructure.",
    affectedConcepts: [
      { conceptId: "mcp", reason: "Directly advanced." },
      { conceptId: "agent-tool-use", reason: "Streaming changes how agents wait on tools." },
    ],
  },
  "dev-small-reasoning": {
    whatHappened: ["Small reasoning-tuned models matched much larger models on math and code benchmarks."],
    whyItMattersToYou: "You may be able to use cheaper models for structured agent steps.",
    alreadyKnew: ["Reasoning models spend more compute thinking before they answer."],
    whatChanged: ["Thinking time can substitute for model size on structured tasks."],
    mentalModelChange: "For structured problems, how long a model thinks can matter more than how big it is.",
    affectedConcepts: [{ conceptId: "reasoning-models", reason: "Directly advanced." }],
  },
  "dev-computer-use": {
    whatHappened: ["An open-source toolkit standardizes screen reading, clicking, and typing for agents."],
    whyItMattersToYou: "It lowers the cost of trying computer use in your own agents.",
    alreadyKnew: ["Computer-use agents exist in closed products."],
    whatChanged: ["There is now a shared open baseline."],
    mentalModelChange: "Computer use is moving from a product feature to a commodity capability.",
    affectedConcepts: [
      { conceptId: "computer-use", reason: "Directly advanced." },
      { conceptId: "agent-tool-use", reason: "Screen control is a tool like any other." },
    ],
  },
};

export function deltaFor(developmentId: string): DeltaExplanation {
  const seed = deltaSeeds[developmentId];
  if (!seed) throw new Error(`No delta for ${developmentId}`);
  return { developmentId, userId: DEMO_USER_ID, ...seed };
}

// One diagnostic per development. correctIndex is server-side knowledge; the
// mock uses it to grade, the UI never sees it.
export type DiagnosticSeed = {
  question: DiagnosticQuestion;
  developmentId: string;
  correctIndex: number;
  kindLabel: string;
  correctFeedback: string;
  incorrectFeedback: string;
  correctReason: string;
  propagated: KnowledgeStateTransition["propagatedChanges"];
};

/**
 * A recognition check for a concept with no written question, built only from concept
 * definitions (as the API's fallback does): the concept's own description among three others.
 */
export function recognitionCheck(conceptId: string): DiagnosticSeed {
  const concept = concepts.find((c) => c.id === conceptId);
  if (!concept) throw new Error(`Unknown concept ${conceptId}`);
  const others = concepts.filter((c) => c.id !== conceptId && c.domain === concept.domain).concat(concepts.filter((c) => c.domain !== concept.domain)).slice(0, 3);
  const correctIndex = [...conceptId].reduce((h, ch) => h + ch.charCodeAt(0), 0) % 4;
  const choices = others.map((c) => c.description);
  choices.splice(correctIndex, 0, concept.description);
  return {
    developmentId: "",
    correctIndex,
    kindLabel: "recognition",
    question: {
      id: `dq-offline-${conceptId}`,
      conceptId,
      prompt: `Which statement best describes ${concept.name}?`,
      type: "multiple_choice",
      choices,
      expectedConcepts: [conceptId],
      rationale: `A recognition check on ${concept.name}, built from its definition.`,
    },
    correctFeedback: `Right: that is what ${concept.name} means.`,
    incorrectFeedback: `That describes a related concept. ${concept.name}: ${concept.description}`,
    correctReason: `Updated because you correctly answered a recognition question on ${concept.name}.`,
    propagated: [],
  };
}

export const diagnostics: DiagnosticSeed[] = [
  {
    developmentId: HERO_ID,
    correctIndex: 1,
    kindLabel: "transfer",
    question: {
      id: "dq-agent-memory",
      conceptId: "agent-memory",
      prompt:
        "A support agent shuts down after every conversation. The next morning it picks up an unresolved refund case without being re-briefed. What makes this possible?",
      type: "multiple_choice",
      choices: ["A larger context window", "Memory that persists across sessions", "Access to more external tools", "Faster inference"],
      expectedConcepts: ["agent-memory", "context-windows"],
      rationale: "Chosen because Agent Memory is high-uncertainty and central to topics you're following.",
      selectionDebug: { uncertainty: 0.44, importance: 0.9, interest: 0.85, freshness: 1, prerequisiteCentrality: 0.72, priority: 0.81 },
    },
    correctFeedback:
      "The agent was shut down, so nothing survived in its context window. The case survived because it was written to memory and read back in a new session.",
    incorrectFeedback:
      "A context window only lasts while the session is running. Once the agent shut down, only memory that persists across sessions could carry the case forward.",
    correctReason: "Updated because you correctly answered a transfer question about what state persists across sessions.",
    propagated: [
      { conceptId: "long-running-agents", deltaMastery: 0.03, deltaUncertainty: -0.05, reason: "Persistent memory is a prerequisite for multi-day agents." },
      { conceptId: "context-windows", deltaMastery: 0, deltaUncertainty: -0.04, reason: "You separated session context from persisted state." },
    ],
  },
  {
    developmentId: "dev-multimodal",
    correctIndex: 2,
    kindLabel: "mechanism",
    question: {
      id: "dq-multimodal",
      conceptId: "multimodal-reasoning",
      prompt: "What is different about a natively multimodal model compared with one that captions images first?",
      type: "multiple_choice",
      choices: ["It uses a larger context window", "It only accepts images", "It reasons over the image and text together", "It needs no training data"],
      expectedConcepts: ["multimodal-reasoning"],
      rationale: "Chosen because Multimodal Reasoning is uncertain and connects to computer use, which you follow.",
      selectionDebug: { uncertainty: 0.4, importance: 0.6, interest: 0.7, freshness: 1, prerequisiteCentrality: 0.55, priority: 0.64 },
    },
    correctFeedback: "The model does not translate the image into words first; it reasons over both at once.",
    incorrectFeedback: "The key change is joint reasoning: no separate captioning step that loses detail.",
    correctReason: "Updated because you identified the mechanism behind native multimodality.",
    propagated: [{ conceptId: "computer-use", deltaMastery: 0.02, deltaUncertainty: -0.03, reason: "Screen understanding underpins computer use." }],
  },
  {
    developmentId: "dev-evaluators",
    correctIndex: 0,
    kindLabel: "distinguish",
    question: {
      id: "dq-evaluators",
      conceptId: "evaluator-architectures",
      prompt: "Which setup is an evaluator architecture rather than a reward model used in training?",
      type: "multiple_choice",
      choices: [
        "A second agent checks each answer at run time before it is shown",
        "A score used to update model weights during training",
        "A larger model that replaces the smaller one",
        "A cache of previous answers",
      ],
      expectedConcepts: ["evaluator-architectures"],
      rationale: "Chosen because Evaluator Architectures is your weakest area and has a flagged misconception.",
      selectionDebug: { uncertainty: 0.52, importance: 0.7, interest: 0.8, freshness: 1, prerequisiteCentrality: 0.5, priority: 0.77 },
    },
    correctFeedback: "Evaluators run at inference time and gate output; reward models shape training.",
    incorrectFeedback: "A reward model shapes training. An evaluator checks output while the system is running.",
    correctReason: "Updated because you distinguished run-time evaluation from training-time reward — the misconception Thinketh had flagged.",
    propagated: [{ conceptId: "long-running-agents", deltaMastery: 0.02, deltaUncertainty: -0.02, reason: "Verification reduces compounding errors in long tasks." }],
  },
  {
    developmentId: "dev-mcp",
    correctIndex: 3,
    kindLabel: "apply",
    question: {
      id: "dq-mcp",
      conceptId: "mcp",
      prompt: "An agent calls a remote MCP tool that takes two minutes to finish. What does streaming results change?",
      type: "multiple_choice",
      choices: ["The tool finishes faster", "The agent no longer needs authentication", "The model's context window grows", "The agent can act on partial progress while the tool works"],
      expectedConcepts: ["mcp", "agent-tool-use"],
      rationale: "Chosen because MCP is intermediate and today's change is directly about it.",
      selectionDebug: { uncertainty: 0.31, importance: 0.8, interest: 0.75, freshness: 1, prerequisiteCentrality: 0.6, priority: 0.62 },
    },
    correctFeedback: "Streaming lets the agent see progress and react before the tool finishes.",
    incorrectFeedback: "Streaming does not speed up the tool; it lets the agent see partial results while it waits.",
    correctReason: "Updated because you applied streaming tool results to a new scenario.",
    propagated: [{ conceptId: "agent-tool-use", deltaMastery: 0.01, deltaUncertainty: -0.02, reason: "Tool-calling patterns reinforced." }],
  },
  {
    developmentId: "dev-small-reasoning",
    correctIndex: 1,
    kindLabel: "mechanism",
    question: {
      id: "dq-small-reasoning",
      conceptId: "reasoning-models",
      prompt: "Why can a small reasoning-tuned model match a larger model on a math benchmark?",
      type: "multiple_choice",
      choices: ["It memorized the benchmark", "It spends more computation thinking before answering", "It has a larger context window", "It uses retrieval"],
      expectedConcepts: ["reasoning-models"],
      rationale: "Chosen because Reasoning Models is moderately uncertain and today's change refines it.",
      selectionDebug: { uncertainty: 0.27, importance: 0.7, interest: 0.6, freshness: 1, prerequisiteCentrality: 0.45, priority: 0.52 },
    },
    correctFeedback: "Extra thinking time at inference substitutes for parameters on structured problems.",
    incorrectFeedback: "The gain comes from thinking longer at inference, not from size or retrieval.",
    correctReason: "Updated because you explained why thinking time can substitute for model size.",
    propagated: [],
  },
  {
    developmentId: "dev-computer-use",
    correctIndex: 2,
    kindLabel: "distinguish",
    question: {
      id: "dq-computer-use",
      conceptId: "computer-use",
      prompt: "Which task requires computer use rather than ordinary tool calling?",
      type: "multiple_choice",
      choices: ["Querying a database through an API", "Calling a weather service", "Filling in a form in a desktop app with no API", "Reading a file from disk"],
      expectedConcepts: ["computer-use", "agent-tool-use"],
      rationale: "Chosen because Computer Use has the highest uncertainty in your model.",
      selectionDebug: { uncertainty: 0.55, importance: 0.55, interest: 0.6, freshness: 1, prerequisiteCentrality: 0.4, priority: 0.58 },
    },
    correctFeedback: "Without an API, the agent has to operate the interface itself.",
    incorrectFeedback: "When an API exists, ordinary tool calling is enough. Computer use is for software with no API.",
    correctReason: "Updated because you distinguished computer use from API tool calling.",
    propagated: [],
  },
];

const diagrams: Record<string, DiagramSpec> = {
  [HERO_ID]: {
    title: "Where an agent's knowledge lives",
    teachingGoal: "See that state now survives the end of a session.",
    nodes: [
      { id: "b1", label: "Session starts", group: "before" },
      { id: "b2", label: "Context window", group: "before" },
      { id: "b3", label: "Session ends: state lost", group: "before" },
      { id: "a1", label: "Session 1", group: "after" },
      { id: "a2", label: "Memory store", group: "after" },
      { id: "a3", label: "Session 2 resumes", group: "after" },
      { id: "s1", label: "Agent + tools", group: "shared" },
    ],
    edges: [
      { from: "b1", to: "b2", label: "fills" },
      { from: "b2", to: "b3", label: "discarded" },
      { from: "a1", to: "a2", label: "writes" },
      { from: "a2", to: "a3", label: "read back" },
      { from: "s1", to: "b1" },
      { from: "s1", to: "a1" },
    ],
    caption: "Before, everything the agent knew lived in the context window and vanished with it. Now the agent writes what matters to a store that outlives the session.",
  },
  "dev-multimodal": {
    title: "From pipeline to single pass",
    teachingGoal: "See that captioning is no longer a separate step.",
    nodes: [
      { id: "b1", label: "Image", group: "before" },
      { id: "b2", label: "Caption model", group: "before" },
      { id: "b3", label: "Text-only reasoning", group: "before" },
      { id: "a1", label: "Image + text", group: "after" },
      { id: "a2", label: "Joint reasoning", group: "after" },
      { id: "s1", label: "Answer", group: "shared" },
    ],
    edges: [
      { from: "b1", to: "b2" },
      { from: "b2", to: "b3", label: "loses detail" },
      { from: "a1", to: "a2" },
      { from: "b3", to: "s1" },
      { from: "a2", to: "s1" },
    ],
    caption: "The caption step used to be where detail got lost. Now the model sees the image directly while it reasons.",
  },
  "dev-evaluators": {
    title: "Acting, then checking",
    teachingGoal: "See checking as its own layer.",
    nodes: [
      { id: "b1", label: "Agent acts", group: "before" },
      { id: "b2", label: "Output used", group: "before" },
      { id: "a1", label: "Agent acts", group: "after" },
      { id: "a2", label: "Evaluator checks", group: "after" },
      { id: "a3", label: "Output used", group: "after" },
    ],
    edges: [
      { from: "b1", to: "b2" },
      { from: "a1", to: "a2" },
      { from: "a2", to: "a3", label: "if it passes" },
      { from: "a2", to: "a1", label: "retry" },
    ],
    caption: "A second agent now sits between action and use, catching mistakes before they compound.",
  },
  "dev-mcp": {
    title: "From one reply to a live connection",
    teachingGoal: "See that a tool can now report while it works, and live on a remote server.",
    nodes: [
      { id: "b1", label: "Agent calls a local tool", group: "before" },
      { id: "b2", label: "Waits in silence", group: "before" },
      { id: "b3", label: "One result at the end", group: "before" },
      { id: "a1", label: "Agent calls a remote server", group: "after" },
      { id: "a2", label: "Standard sign-in", group: "after" },
      { id: "a3", label: "Partial results stream back", group: "after" },
      { id: "s1", label: "MCP interface", group: "shared" },
    ],
    edges: [
      { from: "b1", to: "b2" },
      { from: "b2", to: "b3" },
      { from: "a1", to: "a2" },
      { from: "a2", to: "a3", label: "progress" },
      { from: "s1", to: "b1" },
      { from: "s1", to: "a1" },
    ],
    caption: "The same MCP interface, but tools can now report progress while they work and run on remote servers with a standard sign-in.",
  },
  "dev-small-reasoning": {
    title: "Size versus thinking time",
    teachingGoal: "See that thinking time can stand in for model size on structured tasks.",
    nodes: [
      { id: "b1", label: "Hard structured task", group: "before" },
      { id: "b2", label: "Needs a larger model", group: "before" },
      { id: "a1", label: "Hard structured task", group: "after" },
      { id: "a2", label: "Small model thinks longer", group: "after" },
      { id: "s1", label: "Math and code benchmarks", group: "shared" },
    ],
    edges: [
      { from: "b1", to: "b2" },
      { from: "a1", to: "a2", label: "more thinking" },
      { from: "s1", to: "b1" },
      { from: "s1", to: "a1" },
    ],
    caption: "For structured problems, how long a model thinks can matter more than how big it is.",
  },
  "dev-computer-use": {
    title: "From product feature to shared toolkit",
    teachingGoal: "See computer use becoming a common, open capability.",
    nodes: [
      { id: "b1", label: "Closed products", group: "before" },
      { id: "b2", label: "Each builds its own screen control", group: "before" },
      { id: "a1", label: "Open-source toolkit", group: "after" },
      { id: "a2", label: "Any agent reads, clicks, types", group: "after" },
      { id: "s1", label: "Agent + tools", group: "shared" },
    ],
    edges: [
      { from: "b1", to: "b2" },
      { from: "a1", to: "a2", label: "shared baseline" },
      { from: "s1", to: "b1" },
      { from: "s1", to: "a1" },
    ],
    caption: "Computer use is moving from a product feature to a commodity capability.",
  },
};

export function diagramFor(developmentId: string): DiagramSpec {
  if (diagrams[developmentId]) return diagrams[developmentId];
  const dev = developments.find((d) => d.id === developmentId);
  // Never draw a placeholder for a development this seed doesn't know.
  if (!dev) throw new Error(`No diagram for ${developmentId}`);
  // No hand-drawn diagram: draw the development's own delta (what you knew -> what changed).
  const delta = deltaFor(developmentId);
  const before = delta.alreadyKnew.map((label, i) => ({ id: `b${i + 1}`, label, group: "before" as const }));
  const after = delta.whatChanged.map((label, i) => ({ id: `a${i + 1}`, label, group: "after" as const }));
  return {
    title: dev.title,
    teachingGoal: "Compare what you knew with what changed.",
    nodes: [...before, ...after],
    edges: [...before.slice(1).map((n, i) => ({ from: before[i]!.id, to: n.id })), ...after.slice(1).map((n, i) => ({ from: after[i]!.id, to: n.id }))],
    caption: delta.mentalModelChange,
  };
}

const memoryAids: Record<string, Omit<MemoryAid, "conceptId">> = {
  "agent-memory": {
    analogy:
      "A context window is a whiteboard: useful during the meeting, wiped when everyone leaves. Agent memory is the notebook someone takes home and brings back tomorrow.",
    memoryHook: "Context is the whiteboard. Memory is the notebook.",
    threeStepModel: ["During a session, the agent works from its context.", "Before the session ends, it writes what matters to memory.", "Next session, it reads memory back and resumes."],
    recallQuestion: "An agent forgets a user's preference overnight. Was the preference in its context, its memory, or both?",
  },
  "multimodal-reasoning": {
    analogy: "Describing a painting to someone over the phone versus letting them see it.",
    memoryHook: "No more phone call to the image.",
    threeStepModel: ["Old: image becomes a caption.", "Old: reasoning happens on the caption.", "New: reasoning happens on the image itself."],
    recallQuestion: "What gets lost when an image is captioned before reasoning?",
  },
  "evaluator-architectures": {
    analogy: "A writer and an editor. The reward model is the writing class; the evaluator is the editor at the desk today.",
    memoryHook: "Reward models teach. Evaluators check.",
    threeStepModel: ["The agent produces output.", "A separate evaluator checks it at run time.", "Only output that passes is used."],
    recallQuestion: "Does an evaluator change the model's weights?",
  },
  mcp: {
    analogy: "MCP is USB for model tools. Streaming is a progress bar on the file copy.",
    memoryHook: "Plug in once, watch progress.",
    threeStepModel: ["An MCP server exposes tools.", "The agent calls a tool.", "Partial results stream back while it works."],
    recallQuestion: "What can an agent do with streaming results that it couldn't before?",
  },
  "reasoning-models": {
    analogy: "A smaller student who shows their working can beat a bigger one who answers instantly.",
    memoryHook: "Thinking time beats size on structured problems.",
    threeStepModel: ["The model receives a structured problem.", "It spends extra compute reasoning step by step.", "Accuracy rises without more parameters."],
    recallQuestion: "On what kind of task does thinking time substitute for model size?",
  },
  "computer-use": {
    analogy: "Tool calling is phoning a service desk. Computer use is walking to the counter and filling in the form yourself.",
    memoryHook: "No API? Use the screen.",
    threeStepModel: ["The agent sees the screen.", "It decides where to click or type.", "It checks the screen again and continues."],
    recallQuestion: "When is computer use necessary instead of a tool call?",
  },
};

export function memoryAidFor(conceptId: string): MemoryAid {
  // Never another concept's analogy: a concept without a seeded aid has none offline.
  const aid = memoryAids[conceptId];
  if (!aid) throw new Error(`No memory aid for ${conceptId}`);
  return { conceptId, ...aid, optionalDiagram: undefined };
}

export const voiceScript = [
  "Good morning. You have about eleven minutes.",
  `${developments.length} developments materially changed topics you follow today.`,
  "The biggest: agents can now keep memory across sessions. You already knew agents carry context within a session. What changed is that useful state now survives after the session ends.",
  "Want to check your understanding of that, or move on to the next one?",
];
