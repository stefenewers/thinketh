// Static demo content for Library and Explore. These surfaces have no endpoint
// in the Tier 0 API yet (see docs/MOBILE-API-EXPECTATIONS.md); swap to API data
// when one exists.

export const agentMemoryStoryline = {
  id: "story-agent-memory",
  title: "Agent Memory",
  summary: "How agents went from forgetting everything between sessions to keeping what matters.",
  events: [
    { when: "May", title: "Context windows reach a million tokens", change: "More fits in a session, but it still ends with the session." },
    { when: "June", title: "External memory architectures gain adoption", change: "Teams bolt vector stores onto agents to fake continuity." },
    { when: "August", title: "Cross-session retrieval improves", change: "Agents retrieve past work reliably, but don't choose what to keep." },
    { when: "Today", title: "Native persistent memory appears", change: "Agents decide what to remember and read it back later.", current: true },
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
