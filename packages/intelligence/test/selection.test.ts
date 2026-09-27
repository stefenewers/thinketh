import { describe, expect, it } from "vitest";
import {
  centralityScores,
  DEFAULT_INTEREST,
  explainSelection,
  freshnessFor,
  interestFor,
  pickItem,
  scoreConcepts,
  toPublicQuestion,
} from "../src/engine/selection.ts";
import { FLAGSHIP_DEVELOPMENT_ID } from "../src/seed/corpus.ts";
import { DAY_MS } from "../src/util.ts";
import { NOW, seedGraph } from "./helpers.ts";

describe("adaptive diagnostic selection", () => {
  const { seed, states } = seedGraph();
  const flagship = seed.developments.find((d) => d.id === FLAGSHIP_DEVELOPMENT_ID)!;
  const score = (candidateConceptIds: string[], contextDevelopment = flagship) =>
    scoreConcepts({
      candidateConceptIds,
      concepts: seed.concepts,
      edges: seed.edges,
      states,
      profile: seed.profile,
      developments: seed.developments,
      contextDevelopment,
      now: NOW,
    });

  it("selects Agent Memory for the flagship development", () => {
    const ranked = score(flagship.conceptIds);
    expect(ranked[0]!.conceptId).toBe("agent-memory");
  });

  it("priority is exactly the product of the five factors", () => {
    for (const s of score(flagship.conceptIds)) {
      const product = s.uncertainty * s.importance * s.interest * s.freshness * s.prerequisiteCentrality;
      expect(s.priority).toBeCloseTo(product, 3);
    }
  });

  it("returns ranked candidates, highest priority first", () => {
    const ranked = score(seed.concepts.map((c) => c.id));
    for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1]!.priority).toBeGreaterThanOrEqual(ranked[i]!.priority);
  });

  it("uses the strongest matching interest, with a default floor", () => {
    expect(interestFor("agent-memory", seed.profile)).toBe(1);
    expect(interestFor("not-followed", seed.profile)).toBe(DEFAULT_INTEREST);
  });

  it("decays freshness with development age", () => {
    const dev = { ...flagship, id: "x", conceptIds: ["only-here"], happenedAt: new Date(NOW.getTime() - 7 * DAY_MS).toISOString() };
    expect(freshnessFor("only-here", [dev], NOW)).toBeCloseTo(0.5, 2);
    expect(freshnessFor("only-here", [dev], NOW, dev)).toBe(1);
    expect(freshnessFor("nowhere", [dev], NOW)).toBe(0.3);
  });

  it("keeps centrality within [0.5, 1] with the hub at 1", () => {
    const c = centralityScores(seed.concepts, seed.edges);
    for (const v of c.values()) {
      expect(v).toBeGreaterThanOrEqual(0.5);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(c.get("agent-memory")).toBe(1);
  });

  it("explains the choice in the runbook's words", () => {
    const top = score(flagship.conceptIds)[0]!;
    expect(explainSelection(top, states.get("agent-memory"))).toMatch(
      /^Chosen because Agent Memory is high-uncertainty and central to topics you're following\./,
    );
  });

  it("prefers unanswered questions that probe a known misconception", () => {
    const state = states.get("agent-memory")!;
    expect(state.misconceptionFlags).toContain("memory-equals-context-window");
    expect(pickItem("agent-memory", seed.diagnostics, state, new Set())!.id).toBe("dq-agent-memory-persistence");
    expect(pickItem("agent-memory", seed.diagnostics, state, new Set(["dq-agent-memory-persistence"]))!.id).toBe("dq-agent-memory-short");
    expect(pickItem("no-such-concept", seed.diagnostics, state, new Set())).toBeUndefined();
    // Every banked question answered: none is repeated (the service writes a new one).
    const all = new Set(seed.diagnostics.filter((q) => q.conceptId === "agent-memory").map((q) => q.id));
    expect(pickItem("agent-memory", seed.diagnostics, state, all)).toBeUndefined();
  });

  it("never sends the answer key to the client", () => {
    const item = seed.diagnostics.find((q) => q.id === "dq-agent-memory-persistence")!;
    const pub = toPublicQuestion(item) as Record<string, unknown>;
    for (const secret of ["choiceCorrectness", "choiceFeedback", "choiceMisconception", "rubric", "targetsMisconception", "evidencePhrase"]) {
      expect(pub).not.toHaveProperty(secret);
    }
  });
});
