/**
 * Seeded Playground personas. Nadani is a second learner with a genuinely
 * different Mind: strong, verified evidence on evaluator architectures, weak
 * on agent tool use, and the same gap as the demo user on memory
 * consolidation. Her prior history is replayed through the real update rule,
 * and everything after the seed is recorded like anyone else's (Tiger).
 */
import type { Concept, KnowledgeState, KnowledgeStateTransition } from "../contracts.ts";
import { replayHistory } from "./history.ts";
import type { DiagnosticItem } from "./types.ts";

export type Persona = {
  userId: string;
  displayName: string;
  baselineStates: KnowledgeState[];
  history: KnowledgeStateTransition[];
};

export const NADANI_ID = "nadani";

export function buildPersonas(now: Date, concepts: Concept[]): Record<string, Persona> {
  const userId = NADANI_ID;
  const state = (conceptId: string, mastery: number, confidence: number, uncertainty: number, evidenceCount: number, hoursAgo: number): KnowledgeState => ({
    userId,
    conceptId,
    mastery,
    confidence,
    uncertainty,
    evidenceCount,
    lastObservedAt: new Date(now.getTime() - hoursAgo * 3600 * 1000).toISOString(),
    misconceptionFlags: [],
  });
  const concept = (id: string) => concepts.find((c) => c.id === id)!;

  // Evaluators: she built a grader pipeline; two correct diagnostics make it verified.
  const evaluators = replayHistory(
    state("evaluator-architectures", 0.72, 0.66, 0.28, 5, 40 * 24),
    [
      { daysAgo: 21, kind: "diagnostic_correct", correctness: 1, options: { evidencePhrase: "a question on why graders should be independent" } },
      { daysAgo: 8, kind: "diagnostic_correct", correctness: 0.9, options: { evidencePhrase: "a question on where evaluation belongs in an agent loop" } },
      { daysAgo: 2, kind: "revisited" },
    ],
    concept("evaluator-architectures"),
    now,
  );

  const baselineStates: KnowledgeState[] = [
    evaluators.end,
    state("retrieval", 0.8, 0.8, 0.18, 9, 30),
    state("mcp", 0.74, 0.72, 0.22, 6, 50),
    state("context-windows", 0.72, 0.7, 0.24, 7, 60),
    state("agent-memory", 0.5, 0.5, 0.36, 4, 72),
    state("long-running-agents", 0.58, 0.55, 0.32, 4, 96),
    state("agent-tool-use", 0.38, 0.4, 0.42, 2, 120),
    state("context-compaction", 0.4, 0.4, 0.4, 2, 140),
    state("memory-consolidation", 0.2, 0.22, 0.52, 1, 300),
  ];
  return { [userId]: { userId, displayName: "Nadani", baselineStates, history: evaluators.transitions } };
}

/**
 * The Playground's transfer question: after a peer explains evaluator
 * architectures, the learner applies it in a new context. Graded by the same
 * short-answer rubric path as every diagnostic. Never picked by normal
 * adaptive selection (it only makes sense right after a peer explanation).
 */
export const PLAYGROUND_DIAGNOSTICS: DiagnosticItem[] = [
  {
    id: "dq-evaluators-transfer-coding-agent",
    conceptId: "evaluator-architectures",
    type: "short_answer",
    prompt: "Apply that idea to an autonomous coding agent. Where should evaluation happen, and why?",
    expectedConcepts: ["evaluator-architectures", "long-running-agents"],
    rationale: "A transfer question in a new context: explaining it back isn't enough, the learner has to use it.",
    evidencePhrase: "a transfer question applying peer-taught evaluator design to a coding agent",
    playgroundOnly: true,
    rubric: [
      {
        idea: "A separate, independent evaluator (not the generating model grading itself)",
        keywords: ["separate", "independent", "different model", "another model", "not the same", "second model", "external"],
      },
      {
        idea: "Evaluate at checkpoints in the loop: after steps, before commit/merge, via tests or CI",
        keywords: ["test", "commit", "merge", "step", "checkpoint", "before", "ci", "each", "gate", "pull request"],
      },
      {
        idea: "Self-grading is biased: a model tends to approve its own output",
        keywords: ["bias", "own work", "own output", "self", "approve", "blind spot", "same mistakes"],
      },
      {
        idea: "The verdict feeds back so the agent retries or fixes before continuing",
        keywords: ["retry", "fix", "feedback", "loop", "revise", "reject", "iterate", "roll back"],
      },
    ],
  },
];

/** The peer-teaching prompt the teacher answers out loud, per concept. */
export const PEER_PROMPTS: Record<string, string> = {
  "evaluator-architectures": "Why should an evaluator sometimes be separate from the generating model?",
  "agent-tool-use": "How does an agent decide when to call a tool, and what can go wrong?",
  "retrieval": "When is retrieval the right answer, and when isn't it?",
  "mcp": "What problem does the Model Context Protocol actually solve?",
  "context-windows": "What does a bigger context window buy you, and what doesn't it?",
};

/** Transfer questions available after a peer explanation, per concept. */
export const TRANSFER_QUESTION_FOR: Record<string, string> = {
  "evaluator-architectures": "dq-evaluators-transfer-coding-agent",
};
