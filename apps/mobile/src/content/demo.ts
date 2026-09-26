// Static demo content for Storyline and Explore. These surfaces have no endpoint
// in the Tier 0 API yet (see docs/MOBILE-API-EXPECTATIONS.md); swap to API data
// when one exists.

/**
 * One seeded storyline: how the idea of agent memory changed, told as world-state
 * phases. Developments attach by id when the current brief has them (real API);
 * the current phase always attaches today's hero when it belongs to a storyline.
 * The user's side of the story comes from their real knowledge history.
 */
/** The seeded demo learner (the API's demo user). Shown on Today and as the Playground host. */
export const DEMO_LEARNER_NAME = "Stefen";
/** The seeded Playground partner (the server's Nadani persona). */
export const DEMO_PARTNER_NAME = "Nadani";

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

export type Recommendation = { title: string; why: string; conceptId?: string; developmentId?: string; storylineId?: string };

/**
 * Each group lists alternatives in preference order; Explore shows the ones that
 * resolve against the current brief and knowledge state (the real API and the
 * on-device seed use different ids), and hides a group with none.
 */
export const exploreGroups: { reason: string; items: Recommendation[] }[] = [
  {
    reason: "Builds on today's learning",
    items: [
      {
        title: "How agents decide what to remember",
        why: "The natural next step after persistent memory: what to keep, what to consolidate, what to forget.",
        conceptId: "memory-consolidation",
      },
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
        title: "Evaluators as a separate layer",
        why: "Evaluator Architectures is one of your weakest areas, and this development is changing it.",
        developmentId: "dev-evaluator-layer",
      },
      {
        title: "Evaluators vs. reward models",
        why: "Evaluator Architectures is your weakest concept, with one open confusion.",
        developmentId: "dev-evaluators",
      },
    ],
  },
  {
    reason: "Connects two things you know",
    items: [
      {
        title: "When a tool server pauses to ask you",
        why: "Links the Model Context Protocol with Agent Tool Use, which you already know well.",
        developmentId: "dev-mcp-elicitation",
      },
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
        title: "From bigger context windows to a memory layer",
        why: "How the idea of agent memory changed this year, and where your understanding sits in it.",
        storylineId: "agent-memory",
      },
    ],
  },
];
