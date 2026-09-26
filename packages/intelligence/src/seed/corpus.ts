/**
 * Seeded demo corpus and persona for the golden demo path.
 *
 * All sources, publishers and developments here are illustrative demo data,
 * not real announcements. Timestamps are relative to `now` so the brief always
 * reads as "today".
 */
import type { Claim, Concept, ConceptEdge, Development, KnowledgeState, Source, Storyline } from "../contracts.ts";
import { DAY_MS } from "../util.ts";
import { DIAGNOSTICS } from "./diagnostics.ts";
import { replayHistory } from "./history.ts";
import { DIAGRAMS, MEMORY_AIDS } from "./learning.ts";
import type { DevelopmentMeta, SeedCorpus } from "./types.ts";

export const DEMO_DOMAIN = "AI agents";
export const FLAGSHIP_DEVELOPMENT_ID = "dev-persistent-agent-memory";

const CONCEPTS: Concept[] = [
  {
    id: "agent-tool-use",
    name: "Agent Tool Use",
    description: "How a model decides to call external tools, passes structured arguments, and folds results back into its reasoning.",
    domain: DEMO_DOMAIN,
    importance: 0.85,
  },
  {
    id: "mcp",
    name: "Model Context Protocol",
    description: "An open protocol that standardizes how applications expose tools, resources and prompts to AI models.",
    domain: DEMO_DOMAIN,
    importance: 0.75,
  },
  {
    id: "agent-memory",
    name: "Agent Memory",
    description: "Mechanisms that let an agent retain and recall information across sessions, beyond a single context window.",
    domain: DEMO_DOMAIN,
    importance: 0.9,
  },
  {
    id: "evaluator-architectures",
    name: "Evaluator Architectures",
    description: "Designs where a separate model or process grades, critiques or verifies an agent's output before it is accepted.",
    domain: DEMO_DOMAIN,
    importance: 0.8,
  },
  {
    id: "context-windows",
    name: "Context Windows",
    description: "The bounded span of tokens a model can attend to in a single request, and what happens at its limits.",
    domain: DEMO_DOMAIN,
    importance: 0.7,
  },
  {
    id: "retrieval",
    name: "Retrieval (RAG)",
    description: "Fetching relevant documents at query time and placing them in context so the model can ground its answer.",
    domain: DEMO_DOMAIN,
    importance: 0.7,
  },
  {
    id: "memory-consolidation",
    name: "Memory Consolidation",
    description: "Distilling raw interaction history into durable, deduplicated facts an agent can reuse later.",
    domain: DEMO_DOMAIN,
    importance: 0.6,
  },
  {
    id: "long-running-agents",
    name: "Long-running Agents",
    description: "Agents that pursue a goal over many steps, sessions or days rather than a single request.",
    domain: DEMO_DOMAIN,
    importance: 0.8,
  },
  {
    id: "context-compaction",
    name: "Context Compaction",
    description: "Summarizing or pruning earlier conversation so a long-running session stays within its context window.",
    domain: DEMO_DOMAIN,
    importance: 0.55,
  },
];

// fromConceptId -> toConceptId. For "prerequisite", `from` is a prerequisite of `to`.
const EDGES: ConceptEdge[] = [
  { fromConceptId: "context-windows", toConceptId: "agent-memory", type: "prerequisite", weight: 0.8 },
  { fromConceptId: "agent-tool-use", toConceptId: "agent-memory", type: "prerequisite", weight: 0.5 },
  { fromConceptId: "agent-memory", toConceptId: "long-running-agents", type: "prerequisite", weight: 0.8 },
  { fromConceptId: "agent-tool-use", toConceptId: "mcp", type: "prerequisite", weight: 0.7 },
  { fromConceptId: "context-windows", toConceptId: "context-compaction", type: "prerequisite", weight: 0.6 },
  { fromConceptId: "memory-consolidation", toConceptId: "agent-memory", type: "part_of", weight: 0.7 },
  { fromConceptId: "retrieval", toConceptId: "agent-memory", type: "related", weight: 0.6 },
  { fromConceptId: "context-compaction", toConceptId: "agent-memory", type: "related", weight: 0.5 },
  { fromConceptId: "evaluator-architectures", toConceptId: "long-running-agents", type: "supports", weight: 0.6 },
  { fromConceptId: "agent-tool-use", toConceptId: "long-running-agents", type: "supports", weight: 0.4 },
];

export function buildSeed(now: Date = new Date()): SeedCorpus {
  const ago = (days: number) => new Date(now.getTime() - days * DAY_MS).toISOString();

  const sources: Source[] = [
    // Flagship: persistent agent memory
    {
      id: "src-memory-engineering-post",
      title: "Giving long-running agents a memory that survives the session",
      sourceType: "announcement",
      publisher: "Frontier lab engineering blog (demo)",
      publishedAt: ago(0.4),
      credibility: 0.85,
    },
    {
      id: "src-memory-paper",
      title: "Consolidate, Don't Accumulate: Write-Time Distillation for Agent Memory",
      sourceType: "paper",
      publisher: "Preprint (demo)",
      publishedAt: ago(0.6),
      credibility: 0.8,
    },
    {
      id: "src-memory-repo",
      title: "open-agent-memory: reference memory store with scoped recall",
      sourceType: "github",
      publisher: "Open-source project (demo)",
      publishedAt: ago(0.5),
      credibility: 0.7,
    },
    {
      id: "src-memory-critique",
      title: "When agents remember the wrong thing: error entrenchment in persistent memory",
      sourceType: "article",
      publisher: "Independent evaluation newsletter (demo)",
      publishedAt: ago(0.3),
      credibility: 0.75,
    },
    // Other developments
    {
      id: "src-evaluator-report",
      title: "Separate graders catch what self-critique misses",
      sourceType: "paper",
      publisher: "Preprint (demo)",
      publishedAt: ago(0.7),
      credibility: 0.8,
    },
    {
      id: "src-mcp-spec-update",
      title: "Protocol update: servers can request user input mid-task",
      sourceType: "docs",
      publisher: "Protocol specification (demo)",
      publishedAt: ago(0.8),
      credibility: 0.9,
    },
    {
      id: "src-compaction-docs",
      title: "Server-side compaction for long conversations",
      sourceType: "docs",
      publisher: "Model API documentation (demo)",
      publishedAt: ago(0.9),
      credibility: 0.85,
    },
    {
      id: "src-memory-vs-rag-benchmark",
      title: "Retrieval scores no longer predict memory performance",
      sourceType: "paper",
      publisher: "Benchmark consortium (demo)",
      publishedAt: ago(0.5),
      credibility: 0.75,
    },
    {
      id: "src-tool-reliability",
      title: "Reporting tool-call reliability, not just task accuracy",
      sourceType: "article",
      publisher: "Applied ML newsletter (demo)",
      publishedAt: ago(0.6),
      credibility: 0.7,
    },
    {
      id: "src-function-calling-explainer",
      title: "Explainer: what is function calling?",
      sourceType: "article",
      publisher: "Tech explainer site (demo)",
      publishedAt: ago(0.4),
      credibility: 0.6,
    },
    // Older background sources (what the user already knew)
    {
      id: "src-context-window-primer",
      title: "Why models forget: the context window, explained",
      sourceType: "article",
      publisher: "Tech explainer site (demo)",
      publishedAt: ago(120),
      credibility: 0.7,
    },
    {
      id: "src-rag-primer",
      title: "Retrieval-augmented generation in practice",
      sourceType: "docs",
      publisher: "Framework documentation (demo)",
      publishedAt: ago(200),
      credibility: 0.75,
    },
    {
      id: "src-tool-use-guide",
      title: "Building agents with tool use",
      sourceType: "docs",
      publisher: "Model API documentation (demo)",
      publishedAt: ago(150),
      credibility: 0.85,
    },
  ];

  const claims: Claim[] = [
    // Flagship: new claims
    {
      id: "clm-memory-persists-across-sessions",
      text: "Agents can now write distilled facts to a persistent memory store and recall them in later sessions, even when each session starts with an empty context window.",
      confidence: 0.9,
      sourceIds: ["src-memory-engineering-post", "src-memory-repo"],
      conceptIds: ["agent-memory", "long-running-agents"],
      stance: "supports",
    },
    {
      id: "clm-write-time-consolidation",
      text: "Consolidating memories when they are written (deduplicating and summarizing) outperforms storing raw transcripts and filtering at read time.",
      confidence: 0.8,
      sourceIds: ["src-memory-paper"],
      conceptIds: ["memory-consolidation", "agent-memory"],
      stance: "supports",
    },
    {
      id: "clm-memory-scoped-recall",
      text: "Recall is scoped: the agent retrieves only memories relevant to the current task, so memory is closer to a curated database than to a longer context window.",
      confidence: 0.85,
      sourceIds: ["src-memory-engineering-post", "src-memory-repo"],
      conceptIds: ["agent-memory", "retrieval", "context-windows"],
      stance: "supports",
    },
    {
      id: "clm-memory-entrenches-errors",
      text: "Persistent memory can entrench mistakes: an incorrect fact written early keeps being recalled, so memory needs evaluation and correction paths.",
      confidence: 0.7,
      sourceIds: ["src-memory-critique"],
      conceptIds: ["agent-memory", "evaluator-architectures"],
      stance: "challenges",
    },
    // Other developments
    {
      id: "clm-separate-evaluator",
      text: "A separate evaluator model catches substantially more agent errors than asking the same model to critique itself.",
      confidence: 0.8,
      sourceIds: ["src-evaluator-report"],
      conceptIds: ["evaluator-architectures", "long-running-agents"],
      stance: "supports",
    },
    {
      id: "clm-mcp-elicitation",
      text: "Protocol servers can pause a tool call to request structured input from the user, then resume the same task.",
      confidence: 0.9,
      sourceIds: ["src-mcp-spec-update"],
      conceptIds: ["mcp", "agent-tool-use"],
      stance: "supports",
    },
    {
      id: "clm-compaction-server-side",
      text: "Context compaction is moving from application code into the model API, which summarizes earlier turns automatically near the context limit.",
      confidence: 0.85,
      sourceIds: ["src-compaction-docs"],
      conceptIds: ["context-compaction", "context-windows"],
      stance: "supports",
    },
    {
      id: "clm-memory-benchmarks-diverge",
      text: "Systems that score well on retrieval benchmarks do not necessarily score well on multi-session memory benchmarks.",
      confidence: 0.75,
      sourceIds: ["src-memory-vs-rag-benchmark"],
      conceptIds: ["retrieval", "agent-memory"],
      stance: "neutral",
    },
    {
      id: "clm-tool-reliability-metric",
      text: "Teams are starting to report tool-call reliability (valid calls per attempt) alongside task accuracy.",
      confidence: 0.7,
      sourceIds: ["src-tool-reliability"],
      conceptIds: ["agent-tool-use"],
      stance: "neutral",
    },
    {
      id: "clm-function-calling-basics",
      text: "Function calling lets a model return structured arguments for a tool instead of free text.",
      confidence: 0.95,
      sourceIds: ["src-function-calling-explainer"],
      conceptIds: ["agent-tool-use"],
      stance: "neutral",
    },
    // Baseline (established) claims
    {
      id: "clm-baseline-context-bounded",
      text: "A model only sees what is inside its context window; anything outside it is invisible to that request.",
      confidence: 0.95,
      sourceIds: ["src-context-window-primer"],
      conceptIds: ["context-windows"],
      stance: "neutral",
    },
    {
      id: "clm-baseline-rag-query-time",
      text: "RAG retrieves documents at query time and places them in context; nothing is learned or retained afterwards.",
      confidence: 0.9,
      sourceIds: ["src-rag-primer"],
      conceptIds: ["retrieval"],
      stance: "neutral",
    },
    {
      id: "clm-baseline-tools-structured",
      text: "Agents act through tools by emitting structured calls and reading back the results.",
      confidence: 0.95,
      sourceIds: ["src-tool-use-guide"],
      conceptIds: ["agent-tool-use"],
      stance: "neutral",
    },
  ];

  const developments: Development[] = [
    {
      id: FLAGSHIP_DEVELOPMENT_ID,
      title: "Persistent agent memory changes how long-running agents operate",
      summaryBullets: [
        "Agents can now write distilled facts to a memory store and recall them in later sessions.",
        "Memories are consolidated when written, not filtered from raw transcripts later.",
        "Recall is scoped to the current task, so memory behaves like a curated database, not a bigger context window.",
      ],
      happenedAt: ago(0.4),
      significance: 0.92,
      novelty: 0.85,
      credibility: 0.82,
      momentum: 0.8,
      conceptIds: ["agent-memory", "memory-consolidation", "long-running-agents", "context-windows", "retrieval"],
      claimIds: [
        "clm-memory-persists-across-sessions",
        "clm-write-time-consolidation",
        "clm-memory-scoped-recall",
        "clm-memory-entrenches-errors",
      ],
      sourceIds: ["src-memory-engineering-post", "src-memory-paper", "src-memory-repo", "src-memory-critique"],
      storylineIds: ["story-context-to-persistent-agents"],
    },
    {
      id: "dev-evaluator-layer",
      title: "Separate evaluator agents become a standard layer in agent pipelines",
      summaryBullets: [
        "A dedicated grader model catches more errors than self-critique by the same model.",
        "Evaluators are being placed between agent steps, not just at the end.",
      ],
      happenedAt: ago(0.7),
      significance: 0.8,
      novelty: 0.7,
      credibility: 0.8,
      momentum: 0.7,
      conceptIds: ["evaluator-architectures", "long-running-agents"],
      claimIds: ["clm-separate-evaluator"],
      sourceIds: ["src-evaluator-report"],
      storylineIds: ["story-context-to-persistent-agents"],
    },
    {
      id: "dev-mcp-elicitation",
      title: "Protocol servers can now pause a task to ask the user for input",
      summaryBullets: [
        "A tool call can suspend, request structured input from the user, and resume.",
        "Human-in-the-loop steps no longer need custom glue code.",
      ],
      happenedAt: ago(0.8),
      significance: 0.76,
      novelty: 0.7,
      credibility: 0.9,
      momentum: 0.65,
      conceptIds: ["mcp", "agent-tool-use"],
      claimIds: ["clm-mcp-elicitation"],
      sourceIds: ["src-mcp-spec-update"],
      storylineIds: [],
    },
    {
      id: "dev-compaction-api",
      title: "Context compaction moves from app code into the model API",
      summaryBullets: ["Earlier turns are summarized automatically near the context limit, without application logic."],
      happenedAt: ago(0.9),
      significance: 0.62,
      novelty: 0.6,
      credibility: 0.85,
      momentum: 0.55,
      conceptIds: ["context-compaction", "context-windows"],
      claimIds: ["clm-compaction-server-side"],
      sourceIds: ["src-compaction-docs"],
      storylineIds: ["story-context-to-persistent-agents"],
    },
    {
      id: "dev-memory-benchmarks",
      title: "Retrieval benchmarks stop predicting memory performance",
      summaryBullets: ["Strong retrieval scores do not carry over to multi-session memory tasks."],
      happenedAt: ago(0.5),
      significance: 0.58,
      novelty: 0.65,
      credibility: 0.75,
      momentum: 0.5,
      conceptIds: ["retrieval", "agent-memory"],
      claimIds: ["clm-memory-benchmarks-diverge"],
      sourceIds: ["src-memory-vs-rag-benchmark"],
      storylineIds: [],
    },
    {
      id: "dev-tool-reliability",
      title: "Tool-call reliability is now reported alongside accuracy",
      summaryBullets: ["Valid-calls-per-attempt is becoming a headline agent metric."],
      happenedAt: ago(0.6),
      significance: 0.5,
      novelty: 0.55,
      credibility: 0.7,
      momentum: 0.45,
      conceptIds: ["agent-tool-use"],
      claimIds: ["clm-tool-reliability-metric"],
      sourceIds: ["src-tool-reliability"],
      storylineIds: [],
    },
    // Candidate that the brief filters out: nothing new for this user.
    {
      id: "dev-function-calling-explainer",
      title: "Explainer: what is function calling?",
      summaryBullets: ["Function calling lets a model return structured arguments for a tool."],
      happenedAt: ago(0.4),
      significance: 0.3,
      novelty: 0.1,
      credibility: 0.6,
      momentum: 0.3,
      conceptIds: ["agent-tool-use"],
      claimIds: ["clm-function-calling-basics"],
      sourceIds: ["src-function-calling-explainer"],
      storylineIds: [],
    },
  ];

  const developmentMeta: Record<string, DevelopmentMeta> = {
    [FLAGSHIP_DEVELOPMENT_ID]: {
      readMinutes: 3,
      mentalModelShift: {
        before: "An agent's memory is its context window: when the session ends, everything it learned is gone.",
        after: "An agent's memory is a curated store it writes to and selectively reads from, so knowledge outlives any single context window.",
      },
      newClaimIds: ["clm-memory-persists-across-sessions", "clm-write-time-consolidation", "clm-memory-scoped-recall"],
      nuanceClaimId: "clm-memory-entrenches-errors",
    },
    "dev-evaluator-layer": {
      readMinutes: 2,
      mentalModelShift: {
        before: "Agents check their own work by reflecting on it.",
        after: "Reliable agents are checked by a separate evaluator with its own criteria.",
      },
      newClaimIds: ["clm-separate-evaluator"],
    },
    "dev-mcp-elicitation": {
      readMinutes: 2,
      mentalModelShift: {
        before: "A tool call runs to completion or fails.",
        after: "A tool call can pause for the user and resume, making human-in-the-loop a protocol feature.",
      },
      newClaimIds: ["clm-mcp-elicitation"],
    },
    "dev-compaction-api": {
      readMinutes: 1.5,
      mentalModelShift: {
        before: "Long conversations need hand-written summarization logic.",
        after: "The model API can compact history itself near the limit.",
      },
      newClaimIds: ["clm-compaction-server-side"],
    },
    "dev-memory-benchmarks": {
      readMinutes: 1.5,
      mentalModelShift: {
        before: "Good retrieval implies good memory.",
        after: "Memory is its own capability with its own benchmarks.",
      },
      newClaimIds: ["clm-memory-benchmarks-diverge"],
    },
    "dev-tool-reliability": {
      readMinutes: 1,
      mentalModelShift: {
        before: "Agent quality is measured by task accuracy.",
        after: "Tool-call reliability is measured as a first-class metric too.",
      },
      newClaimIds: ["clm-tool-reliability-metric"],
    },
    "dev-function-calling-explainer": {
      readMinutes: 1,
      mentalModelShift: { before: "", after: "" },
      newClaimIds: [],
    },
  };

  const storylines: Storyline[] = [
    {
      id: "story-context-to-persistent-agents",
      title: "From context windows to persistent agents",
      summary:
        "Agents are moving from single-session reasoning inside one context window toward long-running systems with compaction, memory and independent evaluation.",
      developmentIds: ["dev-compaction-api", "dev-evaluator-layer", FLAGSHIP_DEVELOPMENT_ID],
      conceptIds: ["context-windows", "context-compaction", "agent-memory", "evaluator-architectures", "long-running-agents"],
    },
  ];

  const userId = "demo-user";
  const state = (
    conceptId: string,
    mastery: number,
    confidence: number,
    uncertainty: number,
    evidenceCount: number,
    hoursAgo: number,
    misconceptionFlags: string[] = [],
  ): KnowledgeState => ({
    userId,
    conceptId,
    mastery,
    confidence,
    uncertainty,
    evidenceCount,
    lastObservedAt: new Date(now.getTime() - hoursAgo * 3600 * 1000).toISOString(),
    misconceptionFlags,
  });

  const conceptById = (id: string) => CONCEPTS.find((c) => c.id === id)!;

  // Agent Memory: missed a context-vs-memory question 18 days ago (flagging the
  // misconception), read more since. Replayed through the engine to land on the
  // runbook's starting point (mastery ≈ 0.42, uncertainty ≈ 0.44).
  const agentMemory = replayHistory(
    state("agent-memory", 0.43, 0.6, 0.505, 0, 30 * 24),
    [
      {
        daysAgo: 18,
        kind: "diagnostic_incorrect",
        correctness: 0.35,
        options: {
          evidencePhrase: "a question on whether a long context window gives an agent memory",
          addMisconception: "memory-equals-context-window",
        },
      },
      { daysAgo: 9, kind: "explained" },
      { daysAgo: 4, kind: "viewed" },
      { daysAgo: 0.05, kind: "revisited" },
    ],
    conceptById("agent-memory"),
    now,
  );

  // Evaluator Architectures: one partial diagnostic 12 days ago.
  const evaluators = replayHistory(
    state("evaluator-architectures", 0.3, 0.4, 0.62, 1, 20 * 24),
    [
      { daysAgo: 12, kind: "diagnostic_partial", correctness: 0.3, options: { evidencePhrase: "a question on why graders should be independent" } },
      { daysAgo: 6, kind: "viewed" },
    ],
    conceptById("evaluator-architectures"),
    now,
  );

  const baselineStates: KnowledgeState[] = [
    state("agent-tool-use", 0.86, 0.85, 0.12, 14, 20),
    state("mcp", 0.58, 0.6, 0.3, 6, 30),
    agentMemory.end,
    evaluators.end,
    state("context-windows", 0.78, 0.8, 0.18, 10, 24),
    state("retrieval", 0.68, 0.7, 0.24, 8, 26),
    state("memory-consolidation", 0.22, 0.25, 0.5, 1, 48),
    state("long-running-agents", 0.5, 0.5, 0.32, 4, 36),
    state("context-compaction", 0.45, 0.4, 0.38, 3, 44),
  ];

  return {
    profile: {
      id: userId,
      displayName: "Jordan",
      interests: [
        {
          topic: "AI agents",
          conceptIds: ["agent-memory", "long-running-agents", "agent-tool-use", "mcp"],
          weight: 1,
        },
        { topic: "Evaluation", conceptIds: ["evaluator-architectures"], weight: 0.8 },
        {
          topic: "LLM infrastructure",
          conceptIds: ["context-windows", "retrieval", "context-compaction", "memory-consolidation"],
          weight: 0.6,
        },
      ],
      goals: ["Build a long-running agent that improves over weeks of use"],
      explanationPreferences: ["systems analogies over math", "before/after comparisons", "concrete examples"],
    },
    concepts: CONCEPTS,
    edges: EDGES,
    sources,
    claims,
    developments,
    developmentMeta,
    baselineClaimIds: {
      "context-windows": ["clm-baseline-context-bounded"],
      "retrieval": ["clm-baseline-rag-query-time"],
      "agent-tool-use": ["clm-baseline-tools-structured", "clm-function-calling-basics"],
    },
    storylines,
    baselineStates,
    history: [...agentMemory.transitions, ...evaluators.transitions],
    diagnostics: DIAGNOSTICS,
    memories: [
      {
        id: "mem-pref-analogies",
        kind: "preference",
        content: "Prefers systems analogies (databases, caches, operating systems) over mathematical explanations.",
        createdAt: ago(10),
      },
      {
        id: "mem-pref-before-after",
        kind: "preference",
        content: "Learns fastest from explicit before/after comparisons of a mental model.",
        createdAt: ago(9),
      },
      {
        id: "mem-misconception-context",
        kind: "misconception",
        content: "Previously confused persistent agent memory with a longer context window.",
        createdAt: ago(3),
      },
      {
        id: "mem-topic-long-running",
        kind: "learning_topic",
        content: "Currently learning how to build long-running agents that improve across sessions.",
        createdAt: ago(5),
      },
    ],
    diagrams: DIAGRAMS,
    memoryAids: MEMORY_AIDS,
    ingestion: {
      processedItems: 53,
      skipped: { duplicate: 21, low_signal: 17 },
    },
  };
}
