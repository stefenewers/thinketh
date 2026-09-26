import type { DiagramSpec, MemoryAid } from "../contracts.ts";

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
