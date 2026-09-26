// Static demo content for Storyline and Explore. These surfaces have no endpoint
// in the Tier 0 API yet (see docs/MOBILE-API-EXPECTATIONS.md); swap to API data
// when one exists.

/**
 * One seeded storyline: how the idea of agent memory changed, told as world-state
 * phases. Developments attach by id when the current brief has them (real API);
 * the current phase always attaches today's hero when it belongs to a storyline.
 * The user's side of the story comes from their real knowledge history.
 */
export const agentMemoryStoryline = {
  id: "agent-memory",
  title: "Persistent Agent Memory",
  subtitle: "How the idea has changed over time",
  conceptId: "agent-memory",
  priorConceptId: "context-windows",
  phases: [
    {
      label: "Earlier",
      headline: "Long context was treated as the main path toward persistent agents.",
      detail: "The bet was bigger windows: fit more of the past into one session. Everything still ended when the session did.",
      developmentIds: [] as string[],
      current: false,
    },
    {
      label: "Shift",
      headline: "Retrieval and compaction became separate memory mechanisms.",
      detail: "Context management moved out of the prompt. Summaries and retrieved notes carried work forward, but agents didn't choose what to keep.",
      developmentIds: ["dev-compaction-api", "dev-memory-benchmarks"],
      current: false,
    },
    {
      label: "Current",
      headline: "Persistent memory is emerging as its own architectural layer.",
      detail: "Agents write, scope and read back memory across sessions: a layer beside the context window, not an extension of it.",
      developmentIds: [] as string[],
      current: true,
    },
  ],
};

export type Recommendation = { title: string; why: string; conceptId?: string; developmentId?: string };

export const exploreGroups: { reason: string; items: Recommendation[] }[] = [
  {
    reason: "Builds on what you learned today",
    items: [
      {
        title: "How agents decide what to remember",
        why: "The natural next step after persistent memory: write policies and forgetting.",
        conceptId: "agent-memory",
      },
    ],
  },
  {
    reason: "Strengthens a weak area",
    items: [
      {
        title: "Evaluators vs. reward models",
        why: "Evaluator Architectures is your weakest concept, with one open confusion.",
        developmentId: "dev-evaluators",
      },
    ],
  },
  {
    reason: "Connects two of your interests",
    items: [
      {
        title: "Why multimodal models make computer use work",
        why: "Links Multimodal Reasoning and Computer Use, which you follow separately.",
        developmentId: "dev-multimodal",
      },
    ],
  },
  {
    reason: "An emerging storyline",
    items: [
      {
        title: "MCP moves to production",
        why: "Streaming and remote auth suggest MCP is leaving the local-dev phase.",
        developmentId: "dev-mcp",
      },
    ],
  },
];
