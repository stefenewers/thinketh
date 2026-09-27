import type { VisualizationSpec } from "@thinketh/contracts";

// Offline "Visualize this" plans for the seeded developments: what the planner produces for
// them, written down so the demo draws the same diagrams without the API. Each topic gets the
// grammar its idea actually has; none of this is layout.

const v = (spec: Omit<VisualizationSpec, "kind" | "source" | "callouts"> & Partial<Pick<VisualizationSpec, "callouts">>): VisualizationSpec => ({
  kind: "visualization",
  source: "seed",
  callouts: [],
  ...spec,
});

export const OFFLINE_VISUALIZATIONS: Record<string, VisualizationSpec> = {
  "dev-agent-memory": v({
    visualizationType: "process",
    title: "How agent memory carries forward",
    subtitle: "What an agent learns in one session reaches the next, without re-briefing.",
    sections: [
      { id: "s1", label: "Session 1", tone: "neutral", nodeIds: ["conversation-1"] },
      { id: "store", label: "Memory store", caption: "Outlives the session", tone: "now", nodeIds: ["preferences", "goals", "facts"] },
      { id: "s2", label: "Session 2", tone: "neutral", nodeIds: ["conversation-2"] },
    ],
    nodes: [
      { id: "conversation-1", label: "Conversation 1", description: "The agent works a task", icon: "message", emphasis: "normal" },
      { id: "preferences", label: "Preferences", description: "How you like it", icon: "person", emphasis: "primary" },
      { id: "goals", label: "Goals", description: "Where it's going", icon: "goal", emphasis: "primary" },
      { id: "facts", label: "Facts", description: "Distilled", icon: "facts", emphasis: "primary" },
      { id: "conversation-2", label: "Conversation 2", description: "Starts already briefed", icon: "agent", emphasis: "normal" },
    ],
    edges: [
      { from: "conversation-1", to: "preferences", relationship: "feeds_into", emphasis: "primary" },
      { from: "conversation-1", to: "goals", relationship: "feeds_into", label: "writes", emphasis: "primary" },
      { from: "conversation-1", to: "facts", relationship: "feeds_into", emphasis: "primary" },
      { from: "preferences", to: "conversation-2", relationship: "returns", emphasis: "primary" },
      { from: "goals", to: "conversation-2", relationship: "returns", label: "recalls", emphasis: "primary" },
      { from: "facts", to: "conversation-2", relationship: "returns", emphasis: "primary" },
    ],
    callouts: [{ text: "The context window still empties. The store is what survives.", targetNodeId: "facts" }],
    takeawayLabel: "The shift",
    takeaway: "Memory is a layer beside the context window, not a bigger one: the agent writes what matters and recalls only what the next task needs.",
  }),
  "dev-multimodal": v({
    visualizationType: "transformation",
    title: "From pipeline to single pass",
    subtitle: "The key change is where the model gets access to the image.",
    sections: [
      { id: "before", label: "Before", caption: "Separate stages", tone: "before", nodeIds: ["image-old", "caption", "text-reasoning"] },
      { id: "now", label: "Now", caption: "Native multimodal", tone: "now", nodeIds: ["image-new", "joint", "answer"] },
    ],
    nodes: [
      { id: "image-old", label: "Image", description: "Visual input", icon: "image", emphasis: "normal" },
      { id: "caption", label: "Caption model", description: "Image into text", icon: "document", emphasis: "muted" },
      { id: "text-reasoning", label: "Text reasoning", description: "From the caption", icon: "brain", emphasis: "normal" },
      { id: "image-new", label: "Image + text", description: "Pixels and context", icon: "image", emphasis: "normal" },
      { id: "joint", label: "Joint reasoning", description: "Sees and reasons", icon: "brain", emphasis: "primary" },
      { id: "answer", label: "Answer", description: "Grounded in the image", icon: "answer", emphasis: "normal" },
    ],
    edges: [
      { from: "image-old", to: "caption", relationship: "feeds_into", emphasis: "normal" },
      { from: "caption", to: "text-reasoning", relationship: "feeds_into", emphasis: "normal" },
      { from: "image-new", to: "joint", relationship: "feeds_into", emphasis: "primary" },
      { from: "joint", to: "answer", relationship: "feeds_into", emphasis: "primary" },
    ],
    callouts: [{ text: "The model keeps the image in the reasoning loop.", targetNodeId: "joint" }],
    takeawayLabel: "The shift",
    takeaway: "The caption step disappears. The model can reason about what it sees directly.",
  }),
  "dev-evaluators": v({
    visualizationType: "cycle",
    title: "Acting, then checking",
    subtitle: "A second agent grades the first before anything ships.",
    sections: [],
    nodes: [
      { id: "act", label: "Agent acts", description: "Drafts the output", icon: "agent", emphasis: "normal" },
      { id: "check", label: "Evaluator checks", description: "A separate grader", icon: "check", emphasis: "primary" },
      { id: "feedback", label: "Feedback", description: "What failed, and why", icon: "message", emphasis: "normal" },
      { id: "revise", label: "Agent revises", description: "Fixes before acting", icon: "tool", emphasis: "normal" },
    ],
    edges: [
      { from: "act", to: "check", relationship: "feeds_into", emphasis: "primary" },
      { from: "check", to: "feedback", relationship: "returns", emphasis: "normal" },
      { from: "feedback", to: "revise", relationship: "feeds_into", emphasis: "normal" },
      { from: "revise", to: "act", relationship: "repeats", emphasis: "normal" },
    ],
    takeawayLabel: "The loop",
    takeaway: "Checking is becoming its own layer: errors get caught inside the loop instead of compounding across a long task.",
  }),
  "dev-mcp": v({
    visualizationType: "system",
    title: "One connection, working live",
    subtitle: "MCP now carries progress and sign-in, not just a single reply.",
    sections: [],
    nodes: [
      { id: "agent", label: "Your agent", description: "Calls a tool", icon: "agent", emphasis: "normal" },
      { id: "auth", label: "Standard sign-in", description: "Remote auth flow", icon: "check", emphasis: "normal" },
      { id: "mcp", label: "MCP server", description: "One interface", icon: "network", emphasis: "primary" },
      { id: "tool", label: "Remote tool", description: "Runs elsewhere", icon: "tool", emphasis: "normal" },
      { id: "partial", label: "Partial results", description: "Streamed as it works", icon: "message", emphasis: "primary" },
    ],
    edges: [
      { from: "agent", to: "mcp", relationship: "uses", emphasis: "normal" },
      { from: "auth", to: "mcp", relationship: "enables", emphasis: "normal" },
      { from: "mcp", to: "tool", relationship: "uses", emphasis: "normal" },
      { from: "mcp", to: "partial", relationship: "returns", label: "streams", emphasis: "primary" },
    ],
    takeawayLabel: "The shift",
    takeaway: "MCP is moving from local developer plumbing to production infrastructure: remote, authenticated, and live.",
  }),
  "dev-small-reasoning": v({
    visualizationType: "comparison",
    title: "Size versus thinking time",
    subtitle: "On structured tasks, a small model that thinks longer keeps up.",
    sections: [
      { id: "large", label: "Large model", tone: "neutral", nodeIds: ["l-size", "l-think", "l-score", "l-cost"] },
      { id: "small", label: "Small reasoner", tone: "now", nodeIds: ["s-size", "s-think", "s-score", "s-cost"] },
    ],
    nodes: [
      { id: "l-size", label: "Very large", description: "Size", icon: "model", emphasis: "normal" },
      { id: "l-think", label: "Answers fast", description: "Thinking time", icon: "clock", emphasis: "normal" },
      { id: "l-score", label: "Strong", description: "Math and code", icon: "check", emphasis: "normal" },
      { id: "l-cost", label: "Expensive", description: "Cost per task", icon: "cost", emphasis: "normal" },
      { id: "s-size", label: "Small", description: "Size", icon: "model", emphasis: "normal" },
      { id: "s-think", label: "Thinks longer", description: "Thinking time", icon: "clock", emphasis: "primary" },
      { id: "s-score", label: "Matches it", description: "Math and code", icon: "check", emphasis: "primary" },
      { id: "s-cost", label: "Cheaper", description: "Cost per task", icon: "cost", emphasis: "normal" },
    ],
    edges: [],
    takeawayLabel: "The shift",
    takeaway: "For structured problems, how long a model thinks can matter more than how big it is.",
  }),
  "dev-computer-use": v({
    visualizationType: "convergence",
    title: "Three skills, one toolkit",
    subtitle: "What closed products each built alone is now a shared open baseline.",
    sections: [],
    nodes: [
      { id: "read", label: "Reading screens", icon: "screen", emphasis: "normal" },
      { id: "click", label: "Clicking", icon: "tool", emphasis: "normal" },
      { id: "type", label: "Typing", icon: "text", emphasis: "normal" },
      { id: "toolkit", label: "Open toolkit", description: "One standard interface", icon: "book", emphasis: "primary" },
      { id: "agents", label: "Any agent", description: "Can use a computer", icon: "agent", emphasis: "normal" },
    ],
    edges: [
      { from: "read", to: "toolkit", relationship: "part_of", emphasis: "normal" },
      { from: "click", to: "toolkit", relationship: "part_of", emphasis: "normal" },
      { from: "type", to: "toolkit", relationship: "part_of", emphasis: "normal" },
      { from: "toolkit", to: "agents", relationship: "enables", emphasis: "primary" },
    ],
    takeawayLabel: "The shift",
    takeaway: "Computer use is moving from a product feature to a commodity capability any agent can pick up.",
  }),
};
