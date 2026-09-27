/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { KnowledgeResponse, KnowledgeStateTransition } from "@thinketh/contracts";
import { COLS, PER_BAY, projectMindWorld, relatedConcepts, shelfNeighbours, titleSize, wordEm } from "../mindWorld";

// A real /knowledge response from the local API (the seeded demo learner, at baseline).
const base = JSON.parse(readFileSync(join(__dirname, "fixtures/knowledge.json"), "utf8")) as KnowledgeResponse;
const clone = () => JSON.parse(JSON.stringify(base)) as KnowledgeResponse;
const NOW = new Date("2026-09-26T20:00:00Z");
const none = new Set<string>();

/** A verified (diagnostic_correct) change today on one concept. */
function withVerified(conceptId: string, id = "t-verified") {
  const k = clone();
  const item = k.items.find((i) => i.concept.id === conceptId)!;
  const t: KnowledgeStateTransition = {
    id,
    userId: k.userId,
    conceptId,
    observation: { id: `o-${id}`, userId: k.userId, conceptId, kind: "diagnostic_correct", weight: 1, correctness: 1, createdAt: NOW.toISOString() },
    before: { ...item.state, mastery: 0.42 },
    after: { ...item.state, mastery: 0.51 },
    reason: "Answered a diagnostic correctly.",
    createdAt: NOW.toISOString(),
  } as KnowledgeStateTransition;
  item.lastTransition = t;
  return k;
}

describe("Mind library projection", () => {
  it("one book per concept, with stable ids and places independent of scores", () => {
    const w = projectMindWorld(base, { selectedId: null, played: none, now: NOW });
    expect(w.books.map((b) => b.conceptId).sort()).toEqual(base.items.map((i) => i.concept.id).sort());
    const k = clone();
    for (const i of k.items) i.state.mastery = 1 - i.state.mastery;
    const again = projectMindWorld(k, { selectedId: null, played: none, now: NOW });
    expect(again.books.map((b) => [b.conceptId, b.bay, b.row, b.col])).toEqual(w.books.map((b) => [b.conceptId, b.bay, b.row, b.col]));
    expect(w.books.every((b) => b.col < COLS)).toBe(true);
  });

  it("at rest, you rest; nothing is selected or highlighted at baseline", () => {
    const w = projectMindWorld(base, { selectedId: null, played: none, now: NOW });
    expect(w.you.at).toBeNull();
    expect(w.focus).toBeNull();
    expect(w.highlight).toBeNull();
    expect(w.books.some((b) => b.selected || b.highlight)).toBe(false);
  });

  it("a selected concept (e.g. from /mind?concept=) is its book; you stand there, which claims nothing about understanding", () => {
    const w = projectMindWorld(base, { selectedId: "evaluator-architectures", played: none, now: NOW });
    const b = w.books.find((x) => x.selected)!;
    expect(b.conceptId).toBe("evaluator-architectures");
    expect(w.focus).toBe(b);
    expect(w.you.at).toEqual({ row: b.row, col: b.col });
    expect(b.evidence).toBe("early");
    expect(b.a11y).toMatch(/^Evaluator Architectures\. Early evidence/);
  });

  it("uncertainty is its own signal, never a lock, and never folded into the evidence level", () => {
    const w = projectMindWorld(base, { selectedId: null, played: none, now: NOW });
    const mem = w.books.find((b) => b.conceptId === "agent-memory")!;
    expect(mem).toMatchObject({ evidence: "developing", uncertain: true });
    expect(w.books.find((b) => b.conceptId === "agent-tool-use")).toMatchObject({ evidence: "strong", uncertain: false });
    expect(JSON.stringify(w)).not.toMatch(/lock/i);
  });

  it("a recent verified change highlights its book once; a repeat render with it played doesn't replay", () => {
    const k = withVerified("agent-memory");
    const first = projectMindWorld(k, { selectedId: null, played: none, now: NOW });
    expect(first.highlight).toEqual({ conceptId: "agent-memory", key: "t-verified" });
    expect(first.books.find((b) => b.conceptId === "agent-memory")).toMatchObject({ highlight: true, changed: "up" });
    const again = projectMindWorld(k, { selectedId: null, played: new Set(["t-verified"]), now: NOW });
    expect(again.highlight).toBeNull();
    // The change itself stays visible as a signal; only the one-time highlight is spent.
    expect(again.books.find((b) => b.conceptId === "agent-memory")!.changed).toBe("up");
  });

  it("reading or viewing isn't a verified change and never highlights", () => {
    const k = withVerified("agent-memory");
    k.items.find((i) => i.concept.id === "agent-memory")!.lastTransition!.observation.kind = "viewed";
    expect(projectMindWorld(k, { selectedId: null, played: none, now: NOW }).highlight).toBeNull();
  });

  it("sources are related to a book, not books; an absent source claims nothing", () => {
    const counts = new Map([["agent-memory", 2]]);
    const w = projectMindWorld(base, { selectedId: null, played: none, sourceCounts: counts, now: NOW });
    expect(w.books).toHaveLength(base.items.length);
    expect(w.books.find((b) => b.conceptId === "agent-memory")!.a11y).toMatch(/2 related sources/);
    const noSource = w.books.find((b) => b.conceptId === "mcp")!;
    expect(noSource.sourceCount).toBe(0);
    expect(noSource.a11y).not.toMatch(/source/);
  });

  it("more concepts add bays instead of crowding; the selected book's bay is shown", () => {
    const k = clone();
    const extra = Array.from({ length: 5 }, (_, n) => {
      const i = JSON.parse(JSON.stringify(k.items[0]));
      i.concept.id = `zz-extra-${n}`;
      i.concept.name = `Extra ${n}`;
      i.concept.domain = "zz";
      return i;
    });
    k.items.push(...extra);
    const w = projectMindWorld(k, { selectedId: "zz-extra-4", played: none, now: NOW });
    expect(w.bays).toBe(Math.ceil(k.items.length / PER_BAY));
    expect(w.bay).toBe(1);
  });
});

describe("book titles", () => {
  it("a long single word gets a smaller size instead of breaking mid-word; short titles stay full size", () => {
    // Library covers have a 30pt inset (padding and borders); preview covers 22.
    expect(titleSize("Tool Use", 104, 30)).toBe(11.5);
    expect(titleSize("Consolidation", 104, 30)).toBeLessThan(11.5);
    expect(titleSize("Consolidation", 104, 30) * wordEm("Consolidation")).toBeLessThanOrEqual(104 - 30);
    expect(titleSize("Agent Memory", 72, 22) * wordEm("Memory")).toBeLessThanOrEqual(72 - 22);
  });
});

describe("previews (Home, Catch me up)", () => {
  const w = projectMindWorld(base, { selectedId: null, played: none, now: NOW });
  it("features the linked concept's own book with its shelf neighbours", () => {
    const { books, featured } = shelfNeighbours(w, "agent-memory");
    expect(featured!.conceptId).toBe("agent-memory");
    expect(books).toHaveLength(3);
    expect(books.map((b) => b.conceptId)).toContain("agent-memory");
  });

  it("no linked concept: no featured book, nothing invented", () => {
    expect(shelfNeighbours(w, null)).toEqual({ books: [], featured: null });
    expect(shelfNeighbours(w, "not-in-your-mind")).toEqual({ books: [], featured: null });
  });

  it("related concepts come only from real edges, strongest first, never the concept itself", () => {
    const rel = relatedConcepts(base, "agent-memory");
    const linked = new Set(base.edges.flatMap((e) => (e.fromConceptId === "agent-memory" ? [e.toConceptId] : e.toConceptId === "agent-memory" ? [e.fromConceptId] : [])));
    expect(rel.length).toBeGreaterThan(0);
    expect(rel.every((r) => linked.has(r.id) && r.id !== "agent-memory")).toBe(true);
    expect(relatedConcepts(base, "not-in-your-mind")).toEqual([]);
  });
});
