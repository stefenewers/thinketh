import type { LayoutEdge, LayoutNode } from "../src/index.ts";

// The real Thinketh concept graph (packages/intelligence/src/seed/corpus.ts).
export const NODES: LayoutNode[] = [
  { id: "agent-memory", label: "Agent Memory", short: "Agent Memory", importance: 0.95 },
  { id: "long-running-agents", label: "Long-running Agents", short: "Long-running", importance: 0.85 },
  { id: "agent-tool-use", label: "Agent Tool Use", short: "Tool Use", importance: 0.8 },
  { id: "evaluator-architectures", label: "Evaluator Architectures", short: "Evaluators", importance: 0.8 },
  { id: "context-windows", label: "Context Windows", short: "Context", importance: 0.65 },
  { id: "retrieval", label: "Retrieval (RAG)", short: "Retrieval", importance: 0.65 },
  { id: "mcp", label: "Model Context Protocol", short: "MCP", importance: 0.7 },
  { id: "memory-consolidation", label: "Memory Consolidation", short: "Consolidation", importance: 0.7 },
  { id: "context-compaction", label: "Context Compaction", short: "Compaction", importance: 0.6 },
];
export const EDGES: LayoutEdge[] = [
  { from: "context-windows", to: "agent-memory", weight: 0.8, type: "prerequisite" },
  { from: "agent-tool-use", to: "agent-memory", weight: 0.5, type: "prerequisite" },
  { from: "agent-memory", to: "long-running-agents", weight: 0.8, type: "prerequisite" },
  { from: "agent-tool-use", to: "mcp", weight: 0.7, type: "prerequisite" },
  { from: "context-windows", to: "context-compaction", weight: 0.6, type: "prerequisite" },
  { from: "memory-consolidation", to: "agent-memory", weight: 0.7, type: "part_of" },
  { from: "retrieval", to: "agent-memory", weight: 0.6, type: "related" },
  { from: "context-compaction", to: "agent-memory", weight: 0.5, type: "related" },
  { from: "evaluator-architectures", to: "long-running-agents", weight: 0.6, type: "supports" },
  { from: "agent-tool-use", to: "long-running-agents", weight: 0.4, type: "supports" },
];
