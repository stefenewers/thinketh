import { describe, expect, it } from "vitest";
import {
  normalizeVisualization,
  visualizationFromDelta,
  visualizationFromDiagram,
  visualizationProblem,
  VisualizationSpecSchema,
  type VisualizationSpec,
} from "../src/contracts.ts";
import { DIAGRAMS, VISUALIZATIONS } from "../src/seed/learning.ts";

const base = (over: Partial<VisualizationSpec> = {}): VisualizationSpec => ({
  kind: "visualization",
  visualizationType: "process",
  title: "t",
  subtitle: "s",
  sections: [],
  nodes: [
    { id: "a", label: "A", emphasis: "normal" },
    { id: "b", label: "B", emphasis: "primary" },
  ],
  edges: [{ from: "a", to: "b", emphasis: "primary" }],
  callouts: [],
  takeawayLabel: "The shift",
  takeaway: "x",
  source: "model",
  ...over,
});

describe("visualization contract", () => {
  it("degrades unknown values instead of failing the parse", () => {
    const parsed = VisualizationSpecSchema.parse({
      kind: "visualization",
      visualizationType: "spiral",
      title: "t",
      subtitle: "s",
      nodes: [{ id: "a", label: "A", icon: "unicorn", emphasis: "loud" }],
      edges: [{ from: "a", to: "a", relationship: "teleports" }],
      takeaway: "x",
    });
    expect(parsed.visualizationType).toBe("concept_map");
    expect(parsed.nodes[0]!.icon).toBeUndefined();
    expect(parsed.nodes[0]!.emphasis).toBe("normal");
    expect(parsed.edges[0]!.relationship).toBeUndefined();
    expect(parsed.takeawayLabel).toBe("The shift");
  });

  it("normalizes references: no dangling edges, self-loops, duplicates or double-placed nodes", () => {
    const spec = normalizeVisualization(
      base({
        nodes: [
          { id: "a", label: "A", emphasis: "normal" },
          { id: "a", label: "A again", emphasis: "normal" },
          { id: "b", label: "B", emphasis: "normal" },
        ],
        edges: [
          { from: "a", to: "b", emphasis: "normal" },
          { from: "a", to: "b", emphasis: "normal" },
          { from: "a", to: "a", emphasis: "normal" },
          { from: "a", to: "ghost", emphasis: "normal" },
        ],
        sections: [
          { id: "s1", label: "One", tone: "before", nodeIds: ["a", "ghost"] },
          { id: "s2", label: "Two", tone: "now", nodeIds: ["a", "b"] },
        ],
        callouts: [{ text: "hi", targetNodeId: "ghost" }],
      }),
    );
    expect(spec.nodes.map((n) => n.id)).toEqual(["a", "b"]);
    expect(spec.edges).toHaveLength(1);
    expect(spec.sections.map((s) => s.nodeIds)).toEqual([["a"], ["b"]]);
    expect(spec.callouts[0]!.targetNodeId).toBeUndefined();
  });

  it("names structural problems so the planner can retry", () => {
    expect(visualizationProblem(base())).toBeNull();
    expect(visualizationProblem(base({ edges: [] }))).toMatch(/no relationships/);
    expect(visualizationProblem(base({ visualizationType: "transformation" }))).toMatch(/before and a now/);
    expect(visualizationProblem(base({ nodes: [{ id: "a", label: "x".repeat(60), emphasis: "normal" }, { id: "b", label: "B", emphasis: "normal" }] }))).toMatch(/prose/);
  });

  it("draws legacy before/after diagrams and deltas as transformations", () => {
    const legacy = visualizationFromDiagram(DIAGRAMS["agent-memory"]!);
    expect(legacy.visualizationType).toBe("transformation");
    expect(legacy.sections.map((s) => s.tone)).toEqual(["before", "now"]);
    expect(visualizationProblem(legacy)).toBeNull();
    const fromDelta = visualizationFromDelta({ alreadyKnew: ["Old A", "Old B"], whatChanged: ["New A"], mentalModelChange: "It moved." }, "Topic");
    expect(fromDelta.sections.map((s) => s.nodeIds.length)).toEqual([2, 1]);
    expect(fromDelta.takeaway).toBe("It moved.");
  });

  it("curated seed plans are valid diagrams", () => {
    for (const spec of Object.values(VISUALIZATIONS)) expect(visualizationProblem(normalizeVisualization(spec))).toBeNull();
  });
});
