/**
 * The plain-language presentation layer: "simple outside, deep inside". Wording changes; concept ids,
 * the rubric's meaning, grading and the knowledge-state math do not.
 */
import { describe, expect, it } from "vitest";
import { CONCEPT_LABELS, narrativeLabel, topicLabel } from "@thinketh/contracts";
import { evaluateShortAnswerKeywords } from "../src/engine/evaluation.ts";
import { kindForCorrectness } from "../src/engine/observations.ts";
import { createThinketh } from "../src/index.ts";
import { fallbackNext, type ConductorView } from "../src/playground/conductor.ts";
import { SHORT_LABELS } from "../src/playground/room.ts";
import { PEER_PROMPTS, PLAYGROUND_DIAGNOSTICS } from "../src/seed/personas.ts";
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
  it("the peer prompt and transfer question are plain; the diagnostic id is stable", () => {
    expect(PEER_PROMPTS["evaluator-architectures"]).toBe("Why shouldn't an AI always be the final judge of its own output?");
    expect(golden.prompt).toBe("An AI agent can approve customer refunds. Where would you add an independent check before money is sent, and why?");
    expect(golden.conceptId).toBe("evaluator-architectures");
  });

  it("the rubric keeps its four ideas and every original keyword", () => {
    const ideas = golden.rubric!.map((r) => r.idea);
    expect(ideas).toHaveLength(4);
    expect(ideas[0]).toMatch(/separate, independent evaluator/);
    expect(ideas[1]).toMatch(/checkpoints/);
    expect(ideas[2]).toMatch(/Self-grading is biased/);
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

describe("Muse speaks in plain language", () => {
  const view: ConductorView = {
    scene: "overview",
    participants: [
      { id: "a", name: "Stefen" },
      { id: "b", name: "Nadani" },
    ],
    teachable: [{ conceptId: "evaluator-architectures", conceptName: "Evaluator Architectures", topic: "how AI should check its own work", teacherId: "b", learnerId: "a", assessmentAvailable: true }],
    sharedGaps: [{ conceptId: "memory-consolidation", conceptName: "Memory Consolidation", topic: "what is worth remembering long-term" }],
    plan: [
      { id: "peer:e:b", type: "peer_teach", conceptId: "evaluator-architectures", conceptName: "Evaluator Architectures", topic: "how AI should check its own work", teacherId: "b", learnerId: "a", done: false },
      { id: "gap:m", type: "shared_gap", conceptId: "memory-consolidation", conceptName: "Memory Consolidation", topic: "what is worth remembering long-term", done: false },
    ],
    next: "peer:e:b",
    progress: { teacherAssigned: false, explanationSubmitted: false, transferAsked: false, transferAnswered: false, sharedGapTaught: false, resourceIntroduced: false },
  };

  it("names the teaching by its topic, not its technical name", () => {
    const a = fallbackNext(view);
    expect(a.tool).toBe("assign_peer_teacher");
    expect(a.args.say).toBe("Nadani, teach Stefen how AI should check its own work.");
  });

  it("the shared gap line uses plain wording too", () => {
    const a = fallbackNext({ ...view, intent: "shared_gap" });
    expect(a.args.say).toBe("Neither of you has strong evidence on what is worth remembering long-term yet. I'll teach it to both of you.");
  });
});
