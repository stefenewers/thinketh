import { describe, expect, it } from "vitest";
import { layoutDuo, layoutMind, modularityClusters, measureText } from "../src/index.ts";

import { EDGES, NODES } from "./fixtures.ts";
// iPhone Pro Max content area below the header, above the tab bar.
const FRAME = { x: 16, y: 0, w: 398, h: 460 };

const clean = (d: ReturnType<typeof layoutMind>["diagnostics"]) => {
  expect(d.nodeOverlaps, "node overlaps").toBe(0);
  expect(d.labelOverlaps, "label overlaps").toBe(0);
  expect(d.labelNodeOverlaps, "labels on nodes").toBe(0);
  expect(d.labelsOutOfBounds, "labels clipped").toBe(0);
  expect(d.nodesOutOfBounds, "nodes clipped").toBe(0);
  expect(d.edgeLabelCrossings, "edges through labels").toBe(0);
  expect(d.edgeNodeCrossings, "edges through unrelated nodes").toBe(0);
};

describe("semantic clusters", () => {
  it("come from the real relationship structure, deterministically", () => {
    const c = modularityClusters(NODES.map((n) => n.id), EDGES);
    expect(c).toEqual(modularityClusters([...NODES].reverse().map((n) => n.id), [...EDGES].reverse()));
    const home = (id: string) => c.findIndex((g) => g.includes(id));
    // Memory's neighborhood stays together; tools stay with MCP.
    expect(home("memory-consolidation")).toBe(home("agent-memory"));
    expect(home("retrieval")).toBe(home("agent-memory"));
    expect(home("mcp")).toBe(home("agent-tool-use"));
    expect(home("mcp")).not.toBe(home("agent-memory"));
  });
});

describe("single Mind layout", () => {
  it("is deterministic: same state, same composition", () => {
    const a = layoutMind(NODES, EDGES, FRAME);
    const b = layoutMind([...NODES].reverse(), [...EDGES].reverse(), FRAME);
    const pos = (r: typeof a) => Object.fromEntries(r.nodes.map((n) => [n.id, [n.x, n.y]]));
    expect(pos(b)).toEqual(pos(a));
  });

  it("has no collisions at rest: nodes, labels, clipping, edges through text or nodes", () => {
    const r = layoutMind(NODES, EDGES, FRAME);
    clean(r.diagnostics);
    expect(r.labels.filter((l) => l.visible).length).toBeGreaterThanOrEqual(7);
  });

  it("stays clean with a selected concept, and always labels it", () => {
    for (const focus of NODES.map((n) => n.id)) {
      const r = layoutMind(NODES, EDGES, FRAME, { focusId: focus, lod: "focus" });
      clean(r.diagnostics);
      expect(r.labels.find((l) => l.id === focus)?.visible, focus).toBe(true);
      expect(r.nodes.find((n) => n.id === focus)?.depth).toBe(1);
    }
  });

  it("reframes around focus without scrambling the rest", () => {
    const rest = layoutMind(NODES, EDGES, FRAME);
    const focused = layoutMind(NODES, EDGES, FRAME, { focusId: "agent-memory" });
    // Agent Memory is already its cluster's hub, so its neighborhood keeps its shape.
    const pos = (r: typeof rest, id: string) => r.nodes.find((n) => n.id === id)!;
    expect(Math.abs(pos(rest, "mcp").x - pos(focused, "mcp").x)).toBeLessThan(FRAME.w * 0.2);
  });

  it("keeps reserved UI zones (e.g. a bottom sheet) clear", () => {
    const sheet = { x: 0, y: 360, w: 430, h: 100 };
    const r = layoutMind(NODES, EDGES, FRAME, { reserved: [sheet] });
    for (const n of r.nodes) expect(n.y + n.r <= sheet.y || n.y - n.r >= sheet.y + sheet.h, n.id).toBe(true);
    for (const l of r.labels.filter((x) => x.visible)) expect(l.y + l.h <= sheet.y, l.id).toBe(true);
  });

  it("shows fewer labels at overview than at normal", () => {
    const overview = layoutMind(NODES, EDGES, FRAME, { lod: "overview" }).labels.filter((l) => l.visible).length;
    const normal = layoutMind(NODES, EDGES, FRAME, { lod: "normal" }).labels.filter((l) => l.visible).length;
    expect(overview).toBeLessThan(normal);
  });
});

describe("two Minds in one space", () => {
  // Figma 1:94: two Minds side by side under their names.
  const DUO_FRAME = { x: 16, y: 0, w: 358, h: 300 };
  const duo = (focus?: string) =>
    layoutDuo({ nodes: NODES, edges: EDGES, frame: DUO_FRAME, opts: { focusId: focus ?? null, lod: "normal", requiredLabels: ["evaluator-architectures"] } });

  it("gives each person a clean region with a corridor between them", () => {
    // The foci the Playground scenes actually use (every focus is covered in the single-Mind test).
    for (const focus of [undefined, "evaluator-architectures", "memory-consolidation"]) {
      const d = duo(focus);
      clean(d.left.diagnostics);
      clean(d.right.diagnostics);
      for (const n of d.left.nodes) expect(n.x).toBeLessThan(d.band.x);
      for (const n of d.right.nodes) expect(n.x).toBeGreaterThan(d.band.x + d.band.w);
      expect(d.left.labels.filter((l) => l.visible).length).toBeGreaterThanOrEqual(5);
    }
  });

  it("puts every concept in the same place in both Minds", () => {
    const d = duo("evaluator-architectures");
    const dx = d.right.bounds.x - d.left.bounds.x;
    for (const n of d.left.nodes) {
      const twin = d.right.nodes.find((m) => m.conceptId === n.conceptId)!;
      expect(Math.abs(twin.x - dx - n.x), n.id).toBeLessThan(1);
      expect(Math.abs(twin.y - n.y), n.id).toBeLessThan(1);
    }
  });

  it("routes a transfer across the corridor, from the teacher's concept to the learner's", () => {
    const d = duo("evaluator-architectures");
    const r = d.transferRoute("evaluator-architectures", "right")!;
    const src = d.right.nodes.find((n) => n.conceptId === "evaluator-architectures")!;
    const dst = d.left.nodes.find((n) => n.conceptId === "evaluator-architectures")!;
    expect(r.a).toEqual({ x: src.x, y: src.y });
    expect(r.b).toEqual({ x: dst.x, y: dst.y });
    expect(r.c1.x).toBeGreaterThan(d.band.x);
    expect(r.c1.x).toBeLessThan(d.band.x + d.band.w);
  });
});

describe("text measurement", () => {
  it("is generous for wide glyphs", () => {
    expect(measureText("Mmmm", 12)).toBeGreaterThan(measureText("iiii", 12));
  });
});
