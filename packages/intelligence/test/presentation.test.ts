/**
 * The plain-language presentation layer: "simple outside, deep inside". Wording changes; concept ids,
 * the rubric's meaning, grading and the knowledge-state math do not.
 */
import { describe, expect, it } from "vitest";
import { CONCEPT_LABELS, narrativeLabel, topicLabel } from "@thinketh/contracts";
import { evaluateShortAnswerKeywords } from "../src/engine/evaluation.ts";
import { kindForCorrectness } from "../src/engine/observations.ts";
import { createThinketh } from "../src/index.ts";
import { SHORT_LABELS } from "../src/playground/room.ts";
import { PLAYGROUND_DIAGNOSTICS } from "../src/seed/personas.ts";
import { NOW, offlineConfig } from "./helpers.ts";

const make = () => createThinketh({ config: offlineConfig(), now: () => NOW });
const golden = PLAYGROUND_DIAGNOSTICS.find((d) => d.id === "dq-evaluators-transfer-coding-agent")!;

const LEGACY_STRONG =
  "Use a separate, independent evaluator model rather than letting the agent grade its own output, because self-grading is biased. Evaluate at each commit gate with tests and CI, and feed the verdict back so the agent retries and fixes.";
const PLAIN_STRONG =
  "I'd put a separate check before the refund is sent, because the same agent that made the decision can miss its own mistake. If the check fails, the refund is blocked and sent back to be fixed.";
/** The brief's example: it never says what happens when the check fails, so it stays partial. */
const PLAIN_MISSING_FEEDBACK =
  "I'd put a separate evaluator before the refund is issued, because the same agent that made the decision might miss its own mistake.";
const WEAK = "I'm not sure, maybe just run it and see.";

describe("concept labels", () => {
  const concepts = make().service.conceptList();

  it("concept ids are unchanged", () => {
    expect(concepts.map((c) => c.id).sort()).toEqual(
      ["agent-memory", "agent-tool-use", "context-compaction", "context-windows", "evaluator-architectures", "long-running-agents", "mcp", "memory-consolidation", "retrieval"].sort(),
    );
  });

  it("every concept has canonical, graph, narrative and topic wording; canonical is the real name", () => {
    for (const c of concepts) {
      const l = CONCEPT_LABELS[c.id]!;
      expect(l, c.id).toBeDefined();
      expect(l.canonical).toBe(c.name);
      for (const v of [l.graph, l.narrative, l.topic, l.explanation]) expect(v.trim().length).toBeGreaterThan(0);
      expect(l.topic).toBe(l.topic.charAt(0).toLowerCase() + l.topic.slice(1));
    }
  });

  it("graph labels stay compact and identical to the Mindprint's previous labels", () => {
    expect(SHORT_LABELS).toMatchObject({
      "agent-memory": "Agent Memory",
      "long-running-agents": "Long-running",
      "agent-tool-use": "Tool Use",
      "evaluator-architectures": "Evaluators",
      "context-windows": "Context",
      retrieval: "Retrieval",
      mcp: "MCP",
      "memory-consolidation": "Consolidation",
      "context-compaction": "Compaction",
    });
    for (const l of Object.values(CONCEPT_LABELS)) expect(l.graph.length).toBeLessThanOrEqual(14);
  });

  it("the golden concept reads as 'AI checking its own work'; unknown concepts keep their real name", () => {
    expect(narrativeLabel("evaluator-architectures", "Evaluator Architectures")).toBe("AI checking its own work");
    expect(topicLabel("evaluator-architectures", "x")).toBe("how AI should check its own work");
    expect(narrativeLabel("not-a-concept", "Some Concept")).toBe("Some Concept");
  });
});

describe("golden peer teaching and transfer wording", () => {
  it("the transfer question is plain; the diagnostic id is stable", () => {
    expect(golden.prompt).toBe("An AI agent can approve customer refunds. Where would you add an independent check before money is sent, and why?");
    expect(golden.conceptId).toBe("evaluator-architectures");
  });

  it("the rubric keeps its four ideas and every original keyword", () => {
    const ideas = golden.rubric!.map((r) => r.idea);
    expect(ideas).toHaveLength(4);
    expect(ideas[0]).toMatch(/separate, independent evaluator/);
    expect(ideas[1]).toMatch(/checkpoints/);
    expect(ideas[2]).toMatch(/Self-grading is risky: .*approve its own output/);
    expect(ideas[3]).toMatch(/feeds back/);
    const original = [
      ["separate", "independent", "different model", "another model", "not the same", "second model", "external"],
      ["test", "commit", "merge", "step", "checkpoint", "before", "ci", "each", "gate", "pull request"],
      ["bias", "own work", "own output", "self", "approve", "blind spot", "same mistakes"],
      ["retry", "fix", "feedback", "loop", "revise", "reject", "iterate", "roll back"],
    ];
    original.forEach((kws, i) => expect(golden.rubric![i]!.keywords).toEqual(expect.arrayContaining(kws)));
  });

  it("strong answers grade correct in either register; partial and weak answers do not verify", () => {
    const grade = (a: string) => kindForCorrectness(evaluateShortAnswerKeywords(golden, a).correctness);
    expect(grade(LEGACY_STRONG)).toBe("diagnostic_correct");
    expect(grade(PLAIN_STRONG)).toBe("diagnostic_correct");
    expect(evaluateShortAnswerKeywords(golden, PLAIN_MISSING_FEEDBACK).correctness).toBe(0.75);
    expect(grade(PLAIN_MISSING_FEEDBACK)).toBe("diagnostic_partial");
    expect(grade(WEAK)).toBe("diagnostic_incorrect");
  });

  it("the knowledge update is the same math whichever wording the answer uses", async () => {
    const run = async (answer: string) => {
      const t = make();
      const r = await t.service.answerDiagnostic("demo-user", golden.id, answer);
      return r.transition;
    };
    const [legacy, plain] = await Promise.all([run(LEGACY_STRONG), run(PLAIN_STRONG)]);
    expect(plain.observation.kind).toBe(legacy.observation.kind);
    expect(plain.before).toEqual(legacy.before);
    expect({ ...plain.after, lastUpdatedAt: 0 }).toEqual({ ...legacy.after, lastUpdatedAt: 0 });
  });
});
