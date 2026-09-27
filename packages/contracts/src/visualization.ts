import { z } from "zod";
import type { DeltaExplanation, DiagramSpec } from "./domain.ts";

// "Visualize this": a structured diagram of meaning, never of pixels. The planner (Claude or a
// deterministic fallback) chooses the grammar and the content; the app owns every layout,
// colour, coordinate and animation. Unknown enum values degrade instead of failing the parse,
// so a new icon or relationship on the server never breaks an older app.

export const VISUALIZATION_TYPES = [
  "transformation",
  "process",
  "system",
  "hierarchy",
  "comparison",
  "causal_chain",
  "cycle",
  "timeline",
  "concept_map",
  "convergence",
  "divergence",
  "quantitative",
] as const;
export type VisualizationType = (typeof VISUALIZATION_TYPES)[number];

/** Semantic pixel icons the app can draw. Anything else renders without an icon. */
export const VISUAL_ICONS = [
  "image",
  "document",
  "text",
  "brain",
  "person",
  "memory",
  "goal",
  "facts",
  "message",
  "screen",
  "database",
  "model",
  "tool",
  "answer",
  "network",
  "agent",
  "audio",
  "search",
  "cost",
  "clock",
  "check",
  "warning",
  "loop",
  "book",
] as const;
export type VisualIcon = (typeof VISUAL_ICONS)[number];

export const VISUAL_RELATIONSHIPS = [
  "feeds_into",
  "becomes",
  "causes",
  "enables",
  "uses",
  "returns",
  "contains",
  "part_of",
  "branches_to",
  "followed_by",
  "contrasts",
  "repeats",
] as const;
export type VisualRelationship = (typeof VISUAL_RELATIONSHIPS)[number];

const oneOf = <T extends readonly [string, ...string[]]>(values: T) =>
  z.string().transform((v) => ((values as readonly string[]).includes(v) ? (v as T[number]) : undefined));

export const VisualNodeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  /** One short secondary line, never a paragraph. */
  description: z.string().nullish().transform((v) => v || undefined),
  icon: oneOf(VISUAL_ICONS).nullish().transform((v) => v ?? undefined),
  /** primary: the idea the learner should see; muted: what went away. */
  emphasis: z.enum(["normal", "primary", "muted"]).catch("normal"),
  /** quantitative only: the number this node stands for. */
  value: z.number().nullish().transform((v) => v ?? undefined),
});
export type VisualNode = z.infer<typeof VisualNodeSchema>;

export const VisualEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  relationship: oneOf(VISUAL_RELATIONSHIPS).nullish().transform((v) => v ?? undefined),
  label: z.string().nullish().transform((v) => v || undefined),
  emphasis: z.enum(["normal", "primary"]).catch("normal"),
});
export type VisualEdge = z.infer<typeof VisualEdgeSchema>;

export const VisualSectionSchema = z.object({
  id: z.string(),
  label: z.string(),
  caption: z.string().nullish().transform((v) => v || undefined),
  /** before: the old model; now: the new one. */
  tone: z.enum(["neutral", "before", "now"]).catch("neutral"),
  nodeIds: z.array(z.string()),
});
export type VisualSection = z.infer<typeof VisualSectionSchema>;

export const VisualCalloutSchema = z.object({
  text: z.string().min(1),
  targetNodeId: z.string().nullish().transform((v) => v || undefined),
});
export type VisualCallout = z.infer<typeof VisualCalloutSchema>;

export const VisualizationSpecSchema = z.object({
  kind: z.literal("visualization"),
  visualizationType: z.enum(VISUALIZATION_TYPES).catch("concept_map"),
  title: z.string(),
  subtitle: z.string(),
  sections: z.array(VisualSectionSchema).default([]),
  nodes: z.array(VisualNodeSchema).min(1),
  edges: z.array(VisualEdgeSchema).default([]),
  callouts: z.array(VisualCalloutSchema).default([]),
  /** Unit for quantitative values ("ms", "$ per 1M tokens"). */
  unit: z.string().nullish().transform((v) => v || undefined),
  takeawayLabel: z.string().default("The shift"),
  takeaway: z.string(),
  /** Where the spec came from: a model, a curated seed, or the development's own delta. */
  source: z.enum(["model", "seed", "delta"]).catch("model"),
});
export type VisualizationSpec = z.infer<typeof VisualizationSpecSchema>;

/** Most nodes one iPhone-width diagram can carry before it should be split into sections. */
export const MAX_VISUAL_NODES = 9;

/**
 * Make a parsed spec internally consistent: unique ids, at most MAX_VISUAL_NODES, edges and
 * sections that only reference real nodes, no self-loops or duplicate edges, callouts that point
 * at nodes that exist. Pure; used by the server before sending and by the app before drawing.
 */
export function normalizeVisualization(spec: VisualizationSpec): VisualizationSpec {
  const seen = new Set<string>();
  const nodes = spec.nodes.filter((n) => !seen.has(n.id) && (seen.add(n.id), true)).slice(0, MAX_VISUAL_NODES);
  const ids = new Set(nodes.map((n) => n.id));
  const edgeKeys = new Set<string>();
  const edges = spec.edges.filter((e) => {
    const key = `${e.from}->${e.to}`;
    if (!ids.has(e.from) || !ids.has(e.to) || e.from === e.to || edgeKeys.has(key)) return false;
    edgeKeys.add(key);
    return true;
  });
  const placed = new Set<string>();
  const sections = spec.sections
    .map((s) => ({ ...s, nodeIds: s.nodeIds.filter((id) => ids.has(id) && !placed.has(id) && (placed.add(id), true)) }))
    .filter((s) => s.nodeIds.length > 0);
  const callouts = spec.callouts
    .map((c) => (c.targetNodeId && !ids.has(c.targetNodeId) ? { text: c.text } : c))
    .slice(0, 2);
  return { ...spec, nodes, edges, sections, callouts };
}

/** A structural sanity check for planner output. Returns the problem, or null when usable. */
export function visualizationProblem(spec: VisualizationSpec): string | null {
  const n = spec.nodes.length;
  if (n < 2 && spec.visualizationType !== "quantitative") return "fewer than two nodes";
  const needsEdges = !["comparison", "quantitative", "hierarchy"].includes(spec.visualizationType);
  if (needsEdges && spec.edges.length === 0) return "no relationships between nodes";
  if (spec.visualizationType === "transformation" && spec.sections.length < 2) return "a transformation needs a before and a now section";
  if (spec.visualizationType === "comparison" && spec.sections.length < 2) return "a comparison needs two or more sections";
  if (spec.visualizationType === "quantitative" && spec.nodes.filter((x) => x.value !== undefined).length < 2) return "quantitative without values";
  if (spec.nodes.some((x) => x.label.length > 48)) return "a node label is prose, not a label";
  return null;
}

/** The older before/after DiagramSpec, drawn with the same renderer as a transformation. */
export function visualizationFromDiagram(d: DiagramSpec, source: VisualizationSpec["source"] = "seed"): VisualizationSpec {
  const group = (g: "before" | "after" | "shared") => d.nodes.filter((n) => (g === "before" ? n.group === "before" || !n.group : n.group === g));
  const before = group("before");
  const after = group("after");
  const shared = group("shared");
  const inSection = new Set([...before, ...after].map((n) => n.id));
  return normalizeVisualization({
    kind: "visualization",
    visualizationType: before.length && after.length ? "transformation" : "concept_map",
    title: d.title,
    subtitle: d.teachingGoal,
    sections: [
      { id: "before", label: "Before", tone: "before", nodeIds: before.map((n) => n.id) },
      { id: "now", label: "Now", tone: "now", nodeIds: after.map((n) => n.id) },
    ],
    nodes: [...before, ...after].map((n) => ({ id: n.id, label: n.label, emphasis: n.group === "after" ? ("primary" as const) : ("normal" as const) })),
    // Shared context ("Agent + tools") reads as a note, not as a node wired into both models.
    edges: d.edges
      .filter((e) => inSection.has(e.from) && inSection.has(e.to))
      .map((e) => ({ from: e.from, to: e.to, label: e.label, emphasis: after.some((n) => n.id === e.to) ? ("primary" as const) : ("normal" as const) })),
    callouts: shared.length ? [{ text: `Still true: ${shared.map((n) => n.label).join(", ")}.` }] : [],
    takeawayLabel: "The shift",
    takeaway: d.caption,
    source,
  });
}

/** What you knew, then what changed: a transformation drawn from the delta, in its own words. */
export function visualizationFromDelta(
  delta: Pick<DeltaExplanation, "alreadyKnew" | "whatChanged" | "mentalModelChange">,
  title: string,
): VisualizationSpec {
  const before = delta.alreadyKnew.slice(0, 3).map((label, i) => ({ id: `knew-${i}`, label, emphasis: "normal" as const }));
  const after = delta.whatChanged.slice(0, 3).map((label, i) => ({ id: `changed-${i}`, label, emphasis: "primary" as const }));
  const chain = (ns: { id: string }[], emphasis: "normal" | "primary") =>
    ns.slice(1).map((n, i) => ({ from: ns[i]!.id, to: n.id, relationship: "followed_by" as const, emphasis }));
  return normalizeVisualization({
    kind: "visualization",
    visualizationType: "transformation",
    title,
    subtitle: "What you already knew, and what this changes.",
    sections: [
      { id: "before", label: "You knew", tone: "before", nodeIds: before.map((n) => n.id) },
      { id: "now", label: "What changed", tone: "now", nodeIds: after.map((n) => n.id) },
    ],
    nodes: [...before, ...after],
    edges: [...chain(before, "normal"), ...chain(after, "primary")],
    callouts: [],
    takeawayLabel: "The shift",
    takeaway: delta.mentalModelChange,
    source: "delta",
  });
}
