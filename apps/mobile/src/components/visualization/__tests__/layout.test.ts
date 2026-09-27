import { describe, expect, it } from "vitest";
import { normalizeVisualization, type VisualizationSpec } from "@thinketh/contracts";
import { OFFLINE_VISUALIZATIONS } from "../../../api/visualizations";
import { VISUALIZATION_SAMPLES } from "../../../content/visualizationSamples";
import { layoutVisualization, measureKeys, type Layout, type Rect } from "../layout";
import { PIXEL_ICONS, PIXEL_PALETTE } from "../pixelIcons";

const WIDTH = 350; // an iPhone content column (390 - 2 × 20 gutter)
const measuredFor = (spec: VisualizationSpec) => Object.fromEntries(measureKeys(spec).map((k) => [k, k.startsWith("section:") ? 40 : 96]));
const lay = (spec: VisualizationSpec, width = WIDTH) => layoutVisualization(spec, width, measuredFor(spec));
const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w - 0.5 && a.x + a.w > b.x + 0.5 && a.y < b.y + b.h - 0.5 && a.y + a.h > b.y + 0.5;
const onBoundary = (p: { x: number; y: number }, rects: Rect[]) =>
  rects.some((r) => p.x >= r.x - 3 && p.x <= r.x + r.w + 3 && p.y >= r.y - 3 && p.y <= r.y + r.h + 3 && (Math.abs(p.x - r.x) < 3.5 || Math.abs(p.x - r.x - r.w) < 3.5 || Math.abs(p.y - r.y) < 3.5 || Math.abs(p.y - r.y - r.h) < 3.5));

const ALL: [string, VisualizationSpec][] = [
  ...VISUALIZATION_SAMPLES.map((s) => [s.key, normalizeVisualization(s.spec)] as [string, VisualizationSpec]),
  ...Object.entries(OFFLINE_VISUALIZATIONS),
];

describe("visualization layout", () => {
  it.each(ALL)("%s: fits the phone, nothing overlaps, at most three across", (_key, spec) => {
    for (const width of [WIDTH, 300]) {
      const l = lay(spec, width);
      const nodes = Object.values(l.nodes);
      if (spec.visualizationType !== "quantitative") expect(nodes).toHaveLength(spec.nodes.length);
      for (const n of nodes) {
        expect(n.x).toBeGreaterThanOrEqual(0);
        expect(n.x + n.w).toBeLessThanOrEqual(width + 0.5);
      }
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) expect(overlap(nodes[i]!, nodes[j]!), `${nodes[i]!.id} / ${nodes[j]!.id}`).toBe(false);
      const perRow = new Map<number, number>();
      for (const n of nodes) perRow.set(Math.round(n.y), (perRow.get(Math.round(n.y)) ?? 0) + 1);
      expect(Math.max(...perRow.values())).toBeLessThanOrEqual(3);
    }
  });

  it.each(ALL)("%s: connectors start and end on a card or frame, never floating", (_key, spec) => {
    const l: Layout = lay(spec);
    const rects: Rect[] = [...Object.values(l.nodes), ...l.frames];
    for (const e of l.edges) {
      if (e.key.startsWith("rail-")) continue; // the timeline rail runs between its own markers
      expect(onBoundary(e.samples[0]!, rects), `${e.key} start`).toBe(true);
      expect(onBoundary(e.samples[e.samples.length - 1]!, rects), `${e.key} end`).toBe(true);
    }
  });

  it("gives the seven acceptance topics seven different topologies", () => {
    const signature = (spec: VisualizationSpec) => {
      const l = lay(spec);
      const rows = [...new Set(Object.values(l.nodes).map((n) => Math.round(n.y)))].sort((a, b) => a - b);
      const shape = rows.map((y) => Object.values(l.nodes).filter((n) => Math.round(n.y) === y).length).join("-");
      return `${spec.visualizationType}:${shape}:${l.frames.length}f`;
    };
    const sigs = VISUALIZATION_SAMPLES.map((s) => signature(normalizeVisualization(s.spec)));
    expect(new Set(sigs).size).toBe(VISUALIZATION_SAMPLES.length);
    expect(new Set(VISUALIZATION_SAMPLES.map((s) => s.spec.visualizationType)).size).toBe(7);
  });

  it("plays the idea in order: a transformation shows Before, crosses over, then Now", () => {
    const spec = OFFLINE_VISUALIZATIONS["dev-multimodal"]!;
    const l = lay(spec);
    const wave = (from: string) => l.edges.find((e) => e.from === from)!.wave;
    const transition = l.edges.find((e) => e.key === "transition")!.wave;
    expect(wave("image-old")).toBeLessThan(transition);
    expect(wave("image-new")).toBeGreaterThan(transition);
  });

  it("routes connectors into a group of parallel items once, at the frame", () => {
    const l = lay(OFFLINE_VISUALIZATIONS["dev-agent-memory"]!);
    expect(l.edges.filter((e) => e.to === "frame:store")).toHaveLength(1);
    expect(l.edges.find((e) => e.to === "frame:store")!.targets).toEqual(["preferences", "goals", "facts"]);
  });
});

describe("pixel icons", () => {
  it("are 12×12 grids drawn only from the palette", () => {
    for (const [name, grid] of Object.entries(PIXEL_ICONS)) {
      expect(grid, name).toHaveLength(12);
      for (const row of grid) {
        expect(row, `${name}: ${row}`).toHaveLength(12);
        for (const ch of row) expect(ch === "." || ch in PIXEL_PALETTE, `${name}: ${ch}`).toBe(true);
      }
    }
  });
});
