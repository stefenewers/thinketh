import { CONCEPT_LABELS, type ConceptEdge, type KnowledgeItem, type MindSnapshot } from "@thinketh/contracts";
import type { LayoutEdge, LayoutNode } from "@thinketh/mindprint";

/** One concept as the Mindprint draws it. Fill follows evidence, never decoration. */
export type MindNode = LayoutNode & {
  conceptId: string;
  mastery: number;
  /** Filled = strong evidence; hollow = developing; coral = changed. */
  tone: "strong" | "developing" | "changed";
};

// Compact on-canvas names (Figma 1:6), from the shared presentation layer; the full name lives in the sheet.
export const SHORT: Record<string, string> = Object.fromEntries(Object.entries(CONCEPT_LABELS).map(([id, l]) => [id, l.graph]));

export const toneOf = (mastery: number, changed: boolean): MindNode["tone"] => (changed ? "changed" : mastery >= 0.55 ? "strong" : "developing");

export function nodesFromKnowledge(items: KnowledgeItem[], changed: Set<string>): MindNode[] {
  return items.map((i) => ({
    id: i.concept.id,
    conceptId: i.concept.id,
    label: i.concept.name,
    short: SHORT[i.concept.id] ?? i.concept.name,
    importance: i.concept.importance,
    mastery: i.state.mastery,
    tone: toneOf(i.state.mastery, changed.has(i.concept.id)),
  }));
}

export function nodesFromSnapshot(s: MindSnapshot, changed: Set<string>): MindNode[] {
  return s.concepts.map((c) => ({
    id: c.conceptId,
    conceptId: c.conceptId,
    label: c.name,
    short: c.short,
    importance: c.importance,
    mastery: c.mastery,
    tone: toneOf(c.mastery, changed.has(c.conceptId)),
  }));
}

export const layoutEdges = (edges: ConceptEdge[]): LayoutEdge[] =>
  edges.map((e) => ({ from: e.fromConceptId, to: e.toConceptId, weight: e.weight, type: e.type }));
