import { DeltaExplanationSchema } from "../src/contracts.ts";
import { describe, expect, it } from "vitest";
import { buildBrief, isAlreadyUnderstood } from "../src/engine/brief.ts";
import { computeDelta, type DeltaInput } from "../src/engine/delta.ts";
import { evaluateMultipleChoice, evaluateShortAnswerKeywords, InvalidAnswerError } from "../src/engine/evaluation.ts";
import { FLAGSHIP_DEVELOPMENT_ID } from "../src/seed/corpus.ts";
import { NOW, seedGraph } from "./helpers.ts";

const { seed, states } = seedGraph();
const flagship = seed.developments.find((d) => d.id === FLAGSHIP_DEVELOPMENT_ID)!;

function deltaInput(overrides: Partial<DeltaInput> = {}): DeltaInput {
  return {
    userId: "demo-user",
    development: flagship,
    meta: seed.developmentMeta[flagship.id],
    profile: seed.profile,
    states,
    concepts: new Map(seed.concepts.map((c) => [c.id, c])),
    edges: seed.edges,
    claims: new Map(seed.claims.map((c) => [c.id, c])),
    baselineClaimIds: seed.baselineClaimIds,
    ...overrides,
  };
}

describe("delta engine", () => {
  it("produces a contract-valid delta", () => {
    expect(DeltaExplanationSchema.parse(computeDelta(deltaInput()))).toBeTruthy();
  });

  it("lists as already known only what the user is strong on", () => {
    const delta = computeDelta(deltaInput());
    expect(delta.alreadyKnew.length).toBeGreaterThan(0);
    expect(delta.alreadyKnew.join(" ")).toMatch(/context window/);
    // A user with no mastery "already knew" nothing.
    const novice = new Map([...states].map(([id, s]) => [id, { ...s, mastery: 0.1 }]));
    expect(computeDelta(deltaInput({ states: novice })).alreadyKnew).toEqual([]);
  });

  it("reports the development's new claims plus the nuance", () => {
    const delta = computeDelta(deltaInput());
    expect(delta.whatChanged).toHaveLength(4);
    expect(delta.whatChanged.at(-1)).toMatch(/^Nuance: /);
  });

  it("puts the user's biggest gap first and personalizes why it matters", () => {
    const delta = computeDelta(deltaInput());
    expect(delta.affectedConcepts[0]!.conceptId).toBe("agent-memory");
    expect(delta.whyItMattersToYou).toMatch(/Agent Memory is one of your least certain areas/);
    expect(delta.whyItMattersToYou).toMatch(/longer context window/); // misconception callout
  });

  it("changes with the user's state: a different user gets a different delta", () => {
    const expert = new Map([...states].map(([id, s]) => [id, { ...s, mastery: 0.95, misconceptionFlags: [] }]));
    const a = computeDelta(deltaInput());
    const b = computeDelta(deltaInput({ states: expert }));
    expect(b.alreadyKnew.length).toBeGreaterThanOrEqual(a.alreadyKnew.length);
    expect(b.whyItMattersToYou).not.toEqual(a.whyItMattersToYou);
  });
});

describe("daily brief", () => {
  const { brief, ordered } = buildBrief({
    developments: seed.developments,
    meta: seed.developmentMeta,
    states,
    profile: seed.profile,
    ingestion: seed.ingestion,
    now: NOW,
  });

  it("matches the demo headline: 6 things, 3 major, 11 minutes", () => {
    expect(brief.meaningfulCount).toBe(6);
    expect(brief.majorCount).toBe(3);
    expect(brief.estimatedMinutes).toBe(11);
  });

  it("leads with the flagship development", () => {
    expect(brief.heroDevelopmentId).toBe(FLAGSHIP_DEVELOPMENT_ID);
    expect(ordered[0]!.id).toBe(FLAGSHIP_DEVELOPMENT_ID);
  });

  it("no new information = no card", () => {
    expect(brief.developmentIds).not.toContain("dev-function-calling-explainer");
    expect(brief.skippedBreakdown?.already_understood).toBe(1);
    const explainer = seed.developments.find((d) => d.id === "dev-function-calling-explainer")!;
    expect(isAlreadyUnderstood(explainer, seed.developmentMeta[explainer.id], states)).toBe(true);
  });
});

describe("diagnostic answer evaluation", () => {
  const mc = seed.diagnostics.find((q) => q.id === "dq-agent-memory-persistence")!;
  const short = seed.diagnostics.find((q) => q.id === "dq-agent-memory-short")!;

  it("accepts index, letter or exact choice text", () => {
    expect(evaluateMultipleChoice(mc, "1").correctness).toBe(1);
    expect(evaluateMultipleChoice(mc, "B").correctness).toBe(1);
    expect(evaluateMultipleChoice(mc, mc.choices![1]!.toUpperCase()).correctness).toBe(1);
  });

  it("reveals the misconception behind a distractor", () => {
    const e = evaluateMultipleChoice(mc, "0");
    expect(e.correctness).toBeLessThan(0.4);
    expect(e.misconception).toBe("memory-equals-context-window");
  });

  it("rejects answers that match no choice", () => {
    expect(() => evaluateMultipleChoice(mc, "7")).toThrow(InvalidAnswerError);
    expect(() => evaluateMultipleChoice(mc, "something else")).toThrow(InvalidAnswerError);
  });

  it("grades short answers by rubric coverage", () => {
    expect(evaluateShortAnswerKeywords(short, "It persists across sessions and retrieves relevant facts").correctness).toBe(1);
    expect(evaluateShortAnswerKeywords(short, "It persists between sessions").correctness).toBe(0.5);
    expect(evaluateShortAnswerKeywords(short, "no idea").correctness).toBe(0);
  });
});
