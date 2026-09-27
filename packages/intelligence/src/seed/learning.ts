import type { DiagramSpec, MemoryAid, VisualizationSpec } from "../contracts.ts";

/** Deterministic Visualize This specs, keyed by concept id. */
export const DIAGRAMS: Record<string, DiagramSpec> = {
  "agent-memory": {
    title: "Where an agent's knowledge lives",
    teachingGoal: "See why persistent memory is not a bigger context window.",
    nodes: [
      { id: "b-session1", label: "Session 1 context", group: "before" },
      { id: "b-session2", label: "Session 2 context (empty)", group: "before" },
      { id: "b-lost", label: "Everything learned is lost", group: "before" },
      { id: "model", label: "Model (weights unchanged)", group: "shared" },
      { id: "a-session1", label: "Session 1 context", group: "after" },
      { id: "a-store", label: "Memory store (distilled facts)", group: "after" },
      { id: "a-session2", label: "Session 2 context", group: "after" },
    ],
    edges: [
      { from: "b-session1", to: "b-lost", label: "session ends" },
      { from: "b-lost", to: "b-session2", label: "starts from zero" },
      { from: "a-session1", to: "a-store", label: "write + consolidate" },
      { from: "a-store", to: "a-session2", label: "recall what's relevant" },
      { from: "model", to: "b-session1" },
      { from: "model", to: "a-session1" },
    ],
    caption: "Before, knowledge died with the session. Now an agent writes distilled facts to an external store and pulls back only what the next task needs.",
  },
};

/** Deterministic Make It Stick aids, keyed by concept id. */
export const MEMORY_AIDS: Record<string, MemoryAid> = {
  "agent-memory": {
    conceptId: "agent-memory",
    analogy:
      "A context window is RAM: fast, but wiped on restart. Persistent memory is a database the agent writes to before shutdown and queries after boot.",
    memoryHook: "Context is RAM. Memory is disk.",
    threeStepModel: [
      "Write: at the end of a task, distill what's worth keeping.",
      "Store: consolidate it with what's already known, deduplicating as you go.",
      "Recall: at the start of the next task, retrieve only what's relevant.",
    ],
    recallQuestion: "If an agent's session ends and a new one begins, where does yesterday's knowledge come from?",
    optionalDiagram: DIAGRAMS["agent-memory"],
  },
};

/**
 * Curated "Visualize this" plans, keyed by concept id: what the planner falls back to when Claude
 * is unavailable. Meaning only; the app draws them.
 */
export const VISUALIZATIONS: Record<string, VisualizationSpec> = {
  "agent-memory": {
    kind: "visualization",
    visualizationType: "process",
    title: "How agent memory carries forward",
    subtitle: "What the agent learns in one session reaches the next, without re-briefing.",
    sections: [
      { id: "s1", label: "Session 1", tone: "neutral", nodeIds: ["conversation-1"] },
      { id: "store", label: "Memory store", caption: "Outlives the session", tone: "now", nodeIds: ["preferences", "goals", "facts"] },
      { id: "s2", label: "Session 2", tone: "neutral", nodeIds: ["conversation-2"] },
    ],
    nodes: [
      { id: "conversation-1", label: "Conversation 1", description: "The agent works a task", icon: "message", emphasis: "normal" },
      { id: "preferences", label: "Preferences", description: "How you like it done", icon: "person", emphasis: "primary" },
      { id: "goals", label: "Goals", description: "What you're working toward", icon: "goal", emphasis: "primary" },
      { id: "facts", label: "Facts", description: "Distilled, deduplicated", icon: "facts", emphasis: "primary" },
      { id: "conversation-2", label: "Conversation 2", description: "Starts already briefed", icon: "agent", emphasis: "normal" },
    ],
    edges: [
      { from: "conversation-1", to: "preferences", relationship: "feeds_into", label: "writes", emphasis: "primary" },
      { from: "conversation-1", to: "goals", relationship: "feeds_into", emphasis: "primary" },
      { from: "conversation-1", to: "facts", relationship: "feeds_into", emphasis: "primary" },
      { from: "preferences", to: "conversation-2", relationship: "returns", label: "recalls", emphasis: "primary" },
      { from: "goals", to: "conversation-2", relationship: "returns", emphasis: "primary" },
      { from: "facts", to: "conversation-2", relationship: "returns", emphasis: "primary" },
    ],
    callouts: [{ text: "The context window still empties. The store is what survives.", targetNodeId: "facts" }],
    takeawayLabel: "The shift",
    takeaway: "Memory is a layer beside the context window, not a bigger one: the agent writes what matters and recalls only what the next task needs.",
    source: "seed",
  },
};
