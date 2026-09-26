// How concepts are WORDED for people. Presentation only: concept ids, canonical names, the graph,
// knowledge state and evidence never change because of this file.
//
// Three levels, each for its own surface:
//   canonical  "Evaluator Architectures"   the concept's real name (inspectors, evidence, "why")
//   graph      "Evaluators"                compact on-canvas Mindprint label
//   narrative  "AI checking its own work"  the headline in the live learning flow (Playground)
// plus `topic`, the same idea as a lowercase phrase that reads inside a sentence
// ("Nadani has stronger evidence on how AI should check its own work").

export type ConceptLabels = {
  canonical: string;
  graph: string;
  narrative: string;
  topic: string;
  explanation: string;
};

export const CONCEPT_LABELS: Record<string, ConceptLabels> = {
  "evaluator-architectures": {
    canonical: "Evaluator Architectures",
    graph: "Evaluators",
    narrative: "AI checking its own work",
    topic: "how AI should check its own work",
    explanation: "Why AI should not always be the final judge of its own output",
  },
  "agent-tool-use": {
    canonical: "Agent Tool Use",
    graph: "Tool Use",
    narrative: "When should AI use a tool?",
    topic: "when AI should use a tool",
    explanation: "How an agent decides when to use an external tool, and what can go wrong",
  },
  "agent-memory": {
    canonical: "Agent Memory",
    graph: "Agent Memory",
    narrative: "What should AI remember?",
    topic: "what AI should remember",
    explanation: "How an AI decides what information should persist across sessions",
  },
  retrieval: {
    canonical: "Retrieval (RAG)",
    graph: "Retrieval",
    narrative: "When should AI look something up?",
    topic: "when AI should look something up",
    explanation: "When an AI should fetch external information instead of relying only on what it already has",
  },
  "context-windows": {
    canonical: "Context Windows",
    graph: "Context",
    narrative: "How much can AI keep in mind?",
    topic: "how much AI can keep in mind",
    explanation: "What an AI can actively keep available during one interaction",
  },
  "memory-consolidation": {
    canonical: "Memory Consolidation",
    graph: "Consolidation",
    narrative: "What is worth remembering long-term?",
    topic: "what is worth remembering long-term",
    explanation: "How useful information becomes durable memory instead of temporary context",
  },
  "long-running-agents": {
    canonical: "Long-running Agents",
    graph: "Long-running",
    narrative: "How can AI keep working without losing the plot?",
    topic: "how AI keeps working without losing the plot",
    explanation: "How an agent maintains useful state across a long task",
  },
  "context-compaction": {
    canonical: "Context Compaction",
    graph: "Compaction",
    narrative: "How does AI keep the important parts?",
    topic: "how AI keeps the important parts",
    explanation: "How an agent compresses a long history while preserving what matters",
  },
  mcp: {
    canonical: "Model Context Protocol",
    graph: "MCP",
    narrative: "How does AI connect to tools?",
    topic: "how AI connects to tools",
    explanation: "How AI systems use a common protocol to work with external tools and data",
  },
  "reasoning-models": {
    canonical: "Reasoning Models",
    graph: "Reasoning",
    narrative: "AI that thinks before it answers",
    topic: "how AI thinks before it answers",
    explanation: "Models that spend extra computation working through a problem before responding",
  },
  "multimodal-reasoning": {
    canonical: "Multimodal Reasoning",
    graph: "Multimodal",
    narrative: "AI reasoning across images and text",
    topic: "how AI reasons across images and text",
    explanation: "Reasoning that combines what a model sees with what it reads",
  },
  "computer-use": {
    canonical: "Computer Use",
    graph: "Computer Use",
    narrative: "AI operating a computer",
    topic: "how AI operates a computer",
    explanation: "Agents that click, type and navigate software the way a person does",
  },
};

/** The plain-language headline for the live learning flow. Unknown concepts keep their real name. */
export const narrativeLabel = (conceptId: string, fallback: string) => CONCEPT_LABELS[conceptId]?.narrative ?? fallback;

/** The compact Mindprint label. */
export const graphLabel = (conceptId: string, fallback: string) => CONCEPT_LABELS[conceptId]?.graph ?? fallback;

/** The idea as a phrase inside a sentence ("evidence on ___"). */
export const topicLabel = (conceptId: string, fallback: string) => CONCEPT_LABELS[conceptId]?.topic ?? fallback;
