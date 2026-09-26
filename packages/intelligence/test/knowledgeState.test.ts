import { KnowledgeStateTransitionSchema } from "@thinketh/contracts";
import { describe, expect, it } from "vitest";
import {
  applyObservation,
  knowledgeLevel,
  STALENESS_PER_DAY,
  transition,
  UNCERTAINTY_FLOOR,
} from "../src/engine/knowledgeState.ts";
import { kindForCorrectness, makeObservation, OBSERVATION_RULES } from "../src/engine/observations.ts";
import { DAY_MS } from "../src/util.ts";
import { NOW, seedGraph, stateOf } from "./helpers.ts";

const obs = (kind: Parameters<typeof makeObservation>[0]["kind"], conceptId = "c", correctness?: number) =>
  makeObservation({ userId: "u", conceptId, kind, ...(correctness !== undefined ? { correctness } : {}), now: NOW });

describe("observation weighting", () => {
  it("weights diagnostics far above passive and self-reported signals", () => {
    const diag = OBSERVATION_RULES.diagnostic_correct;
    for (const kind of ["viewed", "saved", "got_it", "already_knew", "explained", "revisited", "asked_followup"] as const) {
      expect(diag.weight).toBeGreaterThan(OBSERVATION_RULES[kind].weight * 3);
      expect(diag.information).toBeGreaterThan(OBSERVATION_RULES[kind].information);
      expect(OBSERVATION_RULES[kind].demonstrated).toBe(false);
    }
  });

  it("maps graded correctness to observation kinds", () => {
    expect(kindForCorrectness(1)).toBe("diagnostic_correct");
    expect(kindForCorrectness(0.8)).toBe("diagnostic_correct");
    expect(kindForCorrectness(0.5)).toBe("diagnostic_partial");
    expect(kindForCorrectness(0.39)).toBe("diagnostic_incorrect");
  });

  it("fills default correctness for diagnostic kinds only", () => {
    expect(obs("diagnostic_correct").correctness).toBe(1);
    expect(obs("diagnostic_incorrect").correctness).toBe(0);
    expect(obs("got_it").correctness).toBeUndefined();
  });
});

describe("mastery update", () => {
  it("reproduces the golden demo transition (0.42 -> 0.51, 0.44 -> 0.29)", () => {
    const before = stateOf({ conceptId: "agent-memory", mastery: 0.42, uncertainty: 0.44 });
    const { after } = applyObservation(before, obs("diagnostic_correct", "agent-memory"), NOW);
    expect(after.mastery).toBeCloseTo(0.51, 2);
    expect(after.uncertainty).toBeCloseTo(0.29, 2);
    expect(after.evidenceCount).toBe(1);
  });

  it("“Got it” is not demonstrated understanding: it is tiny and capped", () => {
    const before = stateOf({ conceptId: "c", mastery: 0.42, uncertainty: 0.44 });
    const gotIt = applyObservation(before, obs("got_it"), NOW);
    const correct = applyObservation(before, obs("diagnostic_correct"), NOW);
    expect(gotIt.deltaMastery).toBeGreaterThan(0);
    expect(correct.deltaMastery).toBeGreaterThan(gotIt.deltaMastery * 10);

    // Repeated "Got it" taps can never push mastery past the self-report ceiling.
    let s = before;
    for (let i = 0; i < 500; i++) s = applyObservation(s, obs("got_it"), NOW).after;
    expect(s.mastery).toBeLessThanOrEqual(OBSERVATION_RULES.got_it.ceiling!);
  });

  it("undemonstrated signals never lower mastery for a strong learner", () => {
    const strong = stateOf({ conceptId: "c", mastery: 0.9, uncertainty: 0.2 });
    for (const kind of ["viewed", "got_it", "already_knew", "asked_followup"] as const) {
      expect(applyObservation(strong, obs(kind), NOW).after.mastery).toBe(0.9);
    }
  });

  it("an incorrect diagnostic lowers mastery", () => {
    const before = stateOf({ conceptId: "c", mastery: 0.6, uncertainty: 0.4 });
    const { after, deltaMastery } = applyObservation(before, obs("diagnostic_incorrect"), NOW);
    expect(deltaMastery).toBeLessThan(0);
    expect(after.mastery).toBeLessThan(0.6);
  });

  it("partial answers land between incorrect and correct", () => {
    const before = stateOf({ conceptId: "c", mastery: 0.4, uncertainty: 0.4 });
    const m = (k: "diagnostic_incorrect" | "diagnostic_partial" | "diagnostic_correct") => applyObservation(before, obs(k), NOW).after.mastery;
    expect(m("diagnostic_incorrect")).toBeLessThan(m("diagnostic_partial"));
    expect(m("diagnostic_partial")).toBeLessThan(m("diagnostic_correct"));
  });

  it("moves mastery more when uncertainty is high", () => {
    const unsure = applyObservation(stateOf({ conceptId: "c", mastery: 0.4, uncertainty: 0.8 }), obs("diagnostic_correct"), NOW);
    const sure = applyObservation(stateOf({ conceptId: "c", mastery: 0.4, uncertainty: 0.1 }), obs("diagnostic_correct"), NOW);
    expect(unsure.deltaMastery).toBeGreaterThan(sure.deltaMastery * 4);
  });

  it("keeps self-reported confidence separate from mastery", () => {
    const before = stateOf({ conceptId: "c", mastery: 0.3, confidence: 0.3, uncertainty: 0.5 });
    const { after } = applyObservation(before, obs("already_knew"), NOW);
    expect(after.confidence - before.confidence).toBeGreaterThan(after.mastery - before.mastery);
  });
});

describe("uncertainty update", () => {
  it("diagnostics reduce uncertainty whatever the outcome", () => {
    const before = stateOf({ conceptId: "c", uncertainty: 0.5 });
    expect(applyObservation(before, obs("diagnostic_correct"), NOW).after.uncertainty).toBeLessThan(0.5);
    expect(applyObservation(before, obs("diagnostic_incorrect"), NOW).after.uncertainty).toBeLessThan(0.5);
  });

  it("never drops below the floor", () => {
    let s = stateOf({ conceptId: "c", uncertainty: 0.5 });
    for (let i = 0; i < 50; i++) s = applyObservation(s, obs("diagnostic_correct"), NOW).after;
    expect(s.uncertainty).toBe(UNCERTAINTY_FLOOR);
  });

  it("drifts up with time since the last observation", () => {
    const stale = stateOf({ conceptId: "c", uncertainty: 0.3, lastObservedAt: new Date(NOW.getTime() - 50 * DAY_MS).toISOString() });
    const update = applyObservation(stale, obs("viewed"), NOW);
    expect(update.staleness).toBeCloseTo(50 * STALENESS_PER_DAY, 5);
    expect(update.after.uncertainty).toBeGreaterThan(0.3);
  });

  it("a follow-up question adds uncertainty", () => {
    const before = stateOf({ conceptId: "c", uncertainty: 0.3 });
    expect(applyObservation(before, obs("asked_followup"), NOW).after.uncertainty).toBeGreaterThan(0.3);
  });
});

describe("misconceptions", () => {
  it("adds a flag from a chosen distractor and clears it on a correct answer", () => {
    const before = stateOf({ conceptId: "c" });
    const flagged = applyObservation(before, obs("diagnostic_incorrect"), NOW, { addMisconception: "m1" }).after;
    expect(flagged.misconceptionFlags).toEqual(["m1"]);
    const cleared = applyObservation(flagged, obs("diagnostic_correct"), NOW, { clearMisconception: "m1" }).after;
    expect(cleared.misconceptionFlags).toEqual([]);
  });
});

describe("transitions and propagation", () => {
  it("returns before, observation, after, reason, propagatedChanges and timestamp", () => {
    const { graph, states } = seedGraph();
    const observation = obs("diagnostic_correct", "agent-memory");
    const { transition: t } = transition({ states, observation, graph, now: NOW, options: { evidencePhrase: "a transfer question" } });
    expect(KnowledgeStateTransitionSchema.parse(t)).toBeTruthy();
    expect(t.before.mastery).toBeLessThan(t.after.mastery);
    expect(t.observation).toBe(observation);
    expect(t.createdAt).toBe(NOW.toISOString());
    expect(t.reason).toMatch(/^Updated because you correctly answered a transfer question\./);
    expect(t.reason).toMatch(/Mastery rose 0\.42 → 0\.51/);
  });

  it("explains that self-reports cannot raise mastery past the ceiling", () => {
    const { graph, states } = seedGraph();
    const { transition: t } = transition({ states, observation: obs("got_it", "agent-tool-use"), graph, now: NOW });
    expect(t.reason).toMatch(/can't raise mastery above/);
    expect(t.propagatedChanges).toEqual([]);
  });

  it("propagates a success to prerequisites, not to dependents", () => {
    const { graph, states } = seedGraph();
    const { transition: t, propagatedTransitions, updatedStates } = transition({
      states,
      observation: obs("diagnostic_correct", "agent-memory"),
      graph,
      now: NOW,
    });
    const ids = t.propagatedChanges.map((p) => p.conceptId);
    expect(ids).toContain("context-windows"); // prerequisite of agent-memory
    expect(ids).not.toContain("long-horizon-agents"); // depends on agent-memory
    for (const p of t.propagatedChanges) expect(p.deltaMastery).toBeGreaterThan(0);
    expect(propagatedTransitions).toHaveLength(t.propagatedChanges.length);
    expect(propagatedTransitions[0]!.observation.sourceRef).toBe(`propagated:${t.id}`);
    expect(updatedStates[0]!.conceptId).toBe("agent-memory");
  });

  it("propagates a failure on a prerequisite to what depends on it", () => {
    const { graph, states } = seedGraph();
    const { transition: t } = transition({ states, observation: obs("diagnostic_incorrect", "context-windows"), graph, now: NOW });
    const toDependent = t.propagatedChanges.find((p) => p.conceptId === "agent-memory");
    expect(toDependent?.deltaMastery).toBeLessThan(0);
  });

  it("does not propagate passive signals", () => {
    const { graph, states } = seedGraph();
    const { transition: t } = transition({ states, observation: obs("viewed", "agent-memory"), graph, now: NOW });
    expect(t.propagatedChanges).toEqual([]);
  });

  it("buckets knowledge levels for the Mind view", () => {
    expect(knowledgeLevel(stateOf({ conceptId: "c", mastery: 0.86 }))).toBe("strong");
    expect(knowledgeLevel(stateOf({ conceptId: "c", mastery: 0.58 }))).toBe("intermediate");
    expect(knowledgeLevel(stateOf({ conceptId: "c", mastery: 0.42 }))).toBe("developing");
    expect(knowledgeLevel(stateOf({ conceptId: "c", mastery: 0.31 }))).toBe("weak");
  });
});
