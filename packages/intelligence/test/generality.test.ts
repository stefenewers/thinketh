/**
 * Dynamic transfer challenges: seeded, generated-and-validated, or a grounded fallback, registered
 * for grading on the ordinary evidence path. (The Playground's guided session that asked them, its
 * session planner and its shared-source scene were removed on 2026-09-27.)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async (host: string) => [{ address: host.startsWith("evil") ? "10.0.0.5" : "93.184.216.34", family: 4 }]),
}));

import { resetCircuits } from "../src/adapters/guard.ts";
import type { IntelligenceModel } from "../src/adapters/types.ts";
import { validateTransferDraft, type TransferContext, type TransferDraft } from "../src/engine/transfer.ts";
import { createThinketh } from "../src/index.ts";
import { NOW, offlineConfig } from "./helpers.ts";

type T = ReturnType<typeof createThinketh>;

/** A "Claude" whose transfer generation we control; everything else is the deterministic model. */
function withModel(t: T, generate: IntelligenceModel["generateTransferChallenge"]) {
  const fb = t.adapters.fallbackModel;
  const fake = Object.assign(Object.create(Object.getPrototypeOf(fb)), fb, { name: "claude", generateTransferChallenge: generate }) as IntelligenceModel;
  (t.adapters as { model: IntelligenceModel | undefined }).model = fake;
}

const make = (requestTimeoutMs?: number) => {
  const cfg = offlineConfig();
  return createThinketh({ config: requestTimeoutMs ? { ...cfg, anthropic: { ...cfg.anthropic, requestTimeoutMs } } : cfg, now: () => NOW });
};

const GOOD_TOOL_DRAFT: TransferDraft = {
  prompt: "A customer-support agent must refund, look up orders and escalate. How should it decide which tool to call, and what could go wrong?",
  applicationContext: "a customer-support agent",
  rationale: "Using tool choice in a new system shows it transferred.",
  rubric: [
    { idea: "Emit a structured tool call with typed arguments instead of free text", keywords: ["structured", "arguments", "schema", "json"] },
    { idea: "Read the tool result back and reason over it before answering", keywords: ["result", "read back", "observe", "reason"] },
    { idea: "Guard against wrong or failed tool calls with validation and retries", keywords: ["validate", "retry", "fail", "error"] },
  ],
  expectedConcepts: ["agent-tool-use"],
};


beforeEach(() => resetCircuits());
afterEach(() => vi.unstubAllGlobals());

describe("dynamic transfer challenges", () => {
  it("keeps the seeded evaluator fixture as the golden challenge", async () => {
    const t = make();
    const ch = await t.service.transferChallenge("evaluator-architectures");
    expect(ch.source).toBe("seeded");
    expect(ch.item.id).toBe("dq-evaluators-transfer-coding-agent");
  });

  it("generates a validated challenge for agent tool use and registers it for grading", async () => {
    const t = make();
    const gen = vi.fn(async (_ctx: TransferContext) => GOOD_TOOL_DRAFT);
    withModel(t, gen);
    const ch = await t.service.transferChallenge("agent-tool-use", "An agent emits a structured call and reads the result.");
    expect(ch.source).toBe("generated");
    expect(ch.item).toMatchObject({ conceptId: "agent-tool-use", type: "short_answer", playgroundOnly: true, prompt: GOOD_TOOL_DRAFT.prompt });
    expect(ch.item.rubric).toHaveLength(3);
    expect(gen).toHaveBeenCalledTimes(1);
    // The model only ever sees Thinketh data about the concept (the teacher's words as data).
    const ctx = gen.mock.calls[0]![0];
    expect(ctx.concept.id).toBe("agent-tool-use");
    expect(ctx.teacherExplanation).toMatch(/structured call/);
    // Registered server-side: the same item is what answerDiagnostic grades.
    expect(await t.service.diagnosticPrompt(ch.item.id)).toEqual({ conceptId: "agent-tool-use", prompt: GOOD_TOOL_DRAFT.prompt });
  });

  it("falls back to a grounded challenge when the generated one fails validation", async () => {
    const t = make();
    withModel(t, async () => ({ ...GOOD_TOOL_DRAFT, rubric: GOOD_TOOL_DRAFT.rubric.slice(0, 1) }));
    const ch = await t.service.transferChallenge("agent-tool-use");
    expect(ch.source).toBe("fallback");
    expect(ch.item.rubric!.length).toBeGreaterThanOrEqual(3);
    expect(ch.item.prompt).toMatch(/when AI should use a tool/);
  });

  it("falls back when generation times out", async () => {
    const t = make(60);
    withModel(t, () => new Promise(() => {}));
    const ch = await t.service.transferChallenge("agent-tool-use");
    expect(ch.source).toBe("fallback");
  });

  it("builds a grounded fallback for a second concept (retrieval)", async () => {
    const t = make();
    const ch = await t.service.transferChallenge("retrieval");
    expect(ch.source).toBe("fallback");
    expect(ch.item.prompt).toMatch(/^Picture .*when AI should look something up/);
    expect(ch.item.rubric!.every((r) => r.keywords.length >= 2)).toBe(true);
  });

  it("fails closed when a concept can't be assessed safely (MCP has too little grounding)", async () => {
    const t = make();
    expect(t.service.isTransferAssessable("mcp")).toBe(false);
    await expect(t.service.transferChallenge("mcp")).rejects.toThrow(/can't verify learning/);
    expect(t.service.isTransferAssessable("agent-tool-use")).toBe(true);
    expect(t.service.isTransferAssessable("evaluator-architectures")).toBe(true);
  });

  it("rejects drafts that reveal the answer, copy the teacher or ask for recall", () => {
    const ctx: TransferContext = { concept: { id: "agent-tool-use", name: "Agent Tool Use" } as TransferContext["concept"], relatedConcepts: [], claims: [], teacherExplanation: "An agent emits a structured call with typed arguments and reads the result back before it answers anything." };
    expect(validateTransferDraft(GOOD_TOOL_DRAFT, ctx)).toBeNull();
    expect(validateTransferDraft({ ...GOOD_TOOL_DRAFT, prompt: `Explain: ${GOOD_TOOL_DRAFT.rubric[0]!.idea}.` }, ctx)).toMatch(/reveals/);
    expect(validateTransferDraft({ ...GOOD_TOOL_DRAFT, prompt: "Restate: an agent emits a structured call with typed arguments and reads the result back." }, ctx)).toMatch(/copies|recall/);
    expect(validateTransferDraft({ ...GOOD_TOOL_DRAFT, expectedConcepts: ["mcp"] }, ctx)).toMatch(/taught concept/);
    expect(validateTransferDraft({ ...GOOD_TOOL_DRAFT, rubric: [...GOOD_TOOL_DRAFT.rubric, ...GOOD_TOOL_DRAFT.rubric] }, ctx)).toMatch(/rubric size/);
  });
});
