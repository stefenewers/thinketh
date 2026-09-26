import { describe, expect, it } from "vitest";
import { narrativeLabel, topicLabel } from "@thinketh/contracts";
import { SHORT } from "../../mindprint/model";

describe("concept presentation layer on mobile", () => {
  it("Mindprint on-canvas labels are exactly what they were", () => {
    expect(SHORT).toEqual({
      "agent-memory": "Agent Memory",
      "long-running-agents": "Long-running",
      "agent-tool-use": "Tool Use",
      "evaluator-architectures": "Evaluators",
      "context-windows": "Context",
      retrieval: "Retrieval",
      mcp: "MCP",
      "memory-consolidation": "Consolidation",
      "context-compaction": "Compaction",
      "reasoning-models": "Reasoning",
      "multimodal-reasoning": "Multimodal",
      "computer-use": "Computer Use",
    });
  });

  it("the live flow gets plain wording; unknown concepts keep their name", () => {
    expect(narrativeLabel("evaluator-architectures", "Evaluator architectures")).toBe("AI checking its own work");
    expect(topicLabel("agent-tool-use", "x")).toBe("when AI should use a tool");
    expect(narrativeLabel("brand-new", "Brand new")).toBe("Brand new");
  });
});
