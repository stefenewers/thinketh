/**
 * The final generality sprint: dynamic transfer challenges, arbitrary shared Playground sources,
 * and the deterministic session planner. Everything still changes knowledge only through the
 * ordinary evidence path.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async (host: string) => [{ address: host.startsWith("evil") ? "10.0.0.5" : "93.184.216.34", family: 4 }]),
}));

import type { CollaborativeDelta, CollaborativeDeltaItem, PlaygroundRoom } from "@thinketh/contracts";
import { resetCircuits } from "../src/adapters/guard.ts";
import type { IntelligenceModel } from "../src/adapters/types.ts";
import { ACTIVITY_MINUTES, planSession } from "../src/engine/sessionPlan.ts";
import { validateTransferDraft, type TransferContext, type TransferDraft } from "../src/engine/transfer.ts";
import { createThinketh } from "../src/index.ts";
import { fallbackNext, validateAction, type ConductorView } from "../src/playground/conductor.ts";
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
    expect(t.service.diagnosticPrompt(ch.item.id)).toEqual({ conceptId: "agent-tool-use", prompt: GOOD_TOOL_DRAFT.prompt });
  });

  it("falls back to a grounded challenge when the generated one fails validation", async () => {
    const t = make();
    withModel(t, async () => ({ ...GOOD_TOOL_DRAFT, rubric: GOOD_TOOL_DRAFT.rubric.slice(0, 1) }));
    const ch = await t.service.transferChallenge("agent-tool-use");
    expect(ch.source).toBe("fallback");
    expect(ch.item.rubric!.length).toBeGreaterThanOrEqual(3);
    expect(ch.item.prompt).toMatch(/Agent Tool Use/);
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
    expect(ch.item.prompt).toMatch(/^Apply Retrieval/);
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

describe("dynamic transfer in a room: the second peer teaching (Stefen -> Nadani, agent tool use)", () => {
  async function secondTeaching() {
    const t = make();
    const call = async (method: string, path: string, body?: unknown) => {
      const res = await t.app.request(path, { method, headers: { "content-type": "application/json", "x-thinketh-user": "demo-user" }, ...(body ? { body: JSON.stringify(body) } : {}) });
      expect(res.status, `${method} ${path}`).toBe(200);
      return (await res.json()) as PlaygroundRoom;
    };
    let room = await call("POST", "/playground/rooms", { displayName: "Stefen" });
    room = await call("POST", `/playground/rooms/${room.id}/demo-guest`);
    room = await call("POST", `/playground/rooms/${room.id}/compare`);
    expect(room.plan!.items.map((i) => i.id)).toEqual(["peer:evaluator-architectures:nadani", "peer:agent-tool-use:demo-user", "gap:memory-consolidation"]);
    room = await call("POST", `/playground/rooms/${room.id}/conduct`, { intent: "next" });
    room = await call("POST", `/playground/rooms/${room.id}/explain`, { text: "A separate evaluator catches what the generator misses.", asUserId: "nadani" });
    room = await call("POST", `/playground/rooms/${room.id}/answer`, { answer: "separate independent evaluator, bias, commit test ci checkpoints, retry fix feedback" });
    expect(room.transfer!.verified).toBe(true);
    // Next in the plan: Stefen teaches Nadani.
    room = await call("POST", `/playground/rooms/${room.id}/conduct`, {});
    expect(room.teaching).toMatchObject({ conceptId: "agent-tool-use", teacherId: "demo-user", learnerId: "nadani" });
    expect(room.completedTeachings).toEqual([expect.objectContaining({ conceptId: "evaluator-architectures", verified: true })]);
    expect(room.plan!.items[0]!.done).toBe(true);
    return { t, call, room };
  }

  const nadaniToolUse = async (t: T) => (await t.service.statesFor("nadani")).get("agent-tool-use")!;

  it("the teacher's explanation alone changes nothing; the grounded challenge is shown and graded as the same item", async () => {
    const { t, call, room: r0 } = await secondTeaching();
    const before = await nadaniToolUse(t);
    let room = await call("POST", `/playground/rooms/${r0.id}/explain`, { text: "An agent emits a structured call with arguments and reads the result back." });
    expect(await nadaniToolUse(t)).toEqual(before);
    expect(room.scene).toBe("transfer");
    expect(room.transfer).toMatchObject({ conceptId: "agent-tool-use", learnerId: "nadani", source: "fallback" });
    const qid = room.transfer!.questionId;
    expect(t.service.diagnosticPrompt(qid)!.prompt).toBe(room.transfer!.prompt);
    // Re-conducting never regenerates: the question on screen is the one that will be graded.
    const again = await t.app.request(`/playground/rooms/${room.id}`, { headers: { "x-thinketh-user": "demo-user" } });
    expect(((await again.json()) as PlaygroundRoom).transfer!.questionId).toBe(qid);

    // A strong answer (expressing the grounded ideas) goes through the ordinary evidence path.
    const rubric = (t.service as unknown as { diagnostics: Map<string, { rubric?: Array<{ idea: string }> }> }).diagnostics.get(qid)!.rubric!;
    room = await call("POST", `/playground/rooms/${room.id}/answer`, { answer: rubric.map((r) => r.idea).join(" "), asUserId: "nadani" });
    const tn = room.transfer!.transition!;
    expect(room.transfer!.verified).toBe(true);
    expect(tn.observation.kind).toBe("diagnostic_correct");
    expect(tn.observation.sourceRef).toBe(`diagnostic:${qid}`);
    expect(tn.reason).toMatch(/transfer question applying peer-taught agent tool use/);
    expect(tn.after.mastery).toBeGreaterThan(before.mastery);
    expect((await nadaniToolUse(t)).mastery).toBeCloseTo(tn.after.mastery, 5);
  });

  it("a weak answer to a generated/fallback challenge verifies nothing", async () => {
    const { t, call, room: r0 } = await secondTeaching();
    let room = await call("POST", `/playground/rooms/${r0.id}/explain`, { text: "Tools are useful." });
    room = await call("POST", `/playground/rooms/${room.id}/answer`, { answer: "It just works I guess.", asUserId: "nadani" });
    expect(room.transfer!.verified).toBe(false);
    expect(room.transfer!.transition!.observation.kind).not.toBe("diagnostic_correct");
    expect((await nadaniToolUse(t)).mastery).toBeLessThanOrEqual(room.transfer!.transition!.before.mastery + 1e-9);
  });
});

// ---------------------------------------------------------------------------

const side = (mastery: number, uncertainty: number, verified = false) => ({ mastery, uncertainty, evidenceCount: 5, verified, level: "developing" as const });
const teach = (conceptId: string, teacherId: string, learnerId: string, score: number): CollaborativeDeltaItem => ({
  kind: "teach",
  conceptId,
  conceptName: conceptId,
  teacherId,
  learnerId,
  reason: "",
  rule: "teach",
  score,
  a: teacherId === "a" ? side(0.85, 0.15, true) : side(0.3, 0.5),
  b: teacherId === "b" ? side(0.85, 0.15, true) : side(0.3, 0.5),
});
const gapItem = (conceptId: string, score: number): CollaborativeDeltaItem => ({ kind: "shared_gap", conceptId, conceptName: conceptId, reason: "", rule: "shared_gap", score, a: side(0.2, 0.5), b: side(0.2, 0.5) });
const delta = (over: Partial<CollaborativeDelta> = {}): CollaborativeDelta =>
  ({ aId: "a", bId: "b", aTeachesB: [], bTeachesA: [], sharedStrengths: [], sharedGaps: [], conflicts: [], ...over }) as CollaborativeDelta;
const names = { a: "Stefen", b: "Nadani" };
const all = () => true;

describe("session planner", () => {
  const full = delta({ bTeachesA: [teach("evals", "b", "a", 0.4)], aTeachesB: [teach("tools", "a", "b", 0.35), teach("other", "a", "b", 0.2)], sharedGaps: [gapItem("consol", 0.5)] });

  it("fills a 7-minute budget with the highest-value valid moves, in a teachable order", () => {
    const p = planSession({ delta: full, names, assessable: all });
    expect(p.items.map((i) => i.id)).toEqual(["peer:evals:b", "peer:tools:a", "gap:consol"]);
    expect(p.estimatedMinutes).toBe(ACTIVITY_MINUTES.peer_teach * 2 + ACTIVITY_MINUTES.shared_gap);
    expect(p.estimatedMinutes).toBeLessThanOrEqual(7);
    expect(p.items[0]!.rationale).toBe("Nadani has strong verified evidence here while Stefen is only starting out.");
    expect(p.items.map((i) => i.priority)).toEqual([1, 2, 3]);
  });

  it("a smaller budget keeps only what fits, most valuable first", () => {
    const p = planSession({ delta: full, names, assessable: all, budgetMinutes: 3 });
    expect(p.items.map((i) => i.id)).toEqual(["gap:consol"]);
    expect(p.estimatedMinutes).toBeLessThanOrEqual(3);
  });

  it("with no teachable opportunity it plans the shared gap and the source", () => {
    const p = planSession({ delta: delta({ sharedGaps: [gapItem("consol", 0.5)] }), names, assessable: all });
    expect(p.items.map((i) => i.type)).toEqual(["shared_gap", "resource"]);
  });

  it("never plans peer teaching Thinketh can't verify", () => {
    const p = planSession({ delta: full, names, assessable: (id) => id !== "evals" });
    expect(p.items.some((i) => i.conceptId === "evals")).toBe(false);
  });

  it("is deterministic and rejects a non-positive budget", () => {
    expect(planSession({ delta: full, names, assessable: all })).toEqual(planSession({ delta: full, names, assessable: all }));
    expect(() => planSession({ delta: full, names, assessable: all, budgetMinutes: 0 })).toThrow();
  });
});

describe("Muse conducts the plan; it cannot replace it", () => {
  const base: ConductorView = {
    scene: "overview",
    participants: [{ id: "a", name: "Stefen" }, { id: "b", name: "Nadani" }],
    teachable: [
      { conceptId: "evals", conceptName: "evals", teacherId: "b", learnerId: "a", assessmentAvailable: true },
      { conceptId: "other", conceptName: "other", teacherId: "a", learnerId: "b", assessmentAvailable: true },
    ],
    sharedGaps: [{ conceptId: "consol", conceptName: "consol" }],
    plan: [
      { id: "peer:evals:b", type: "peer_teach", conceptId: "evals", teacherId: "b", learnerId: "a", done: false },
      { id: "gap:consol", type: "shared_gap", conceptId: "consol", done: false },
    ],
    next: "peer:evals:b",
    progress: { teacherAssigned: false, explanationSubmitted: false, transferAsked: false, transferAnswered: false, sharedGapTaught: false, resourceIntroduced: false },
  };

  it("rejects a valid-looking teaching move that isn't in the plan", () => {
    expect(validateAction({ tool: "assign_peer_teacher", args: { conceptId: "other", teacherId: "a", learnerId: "b" }, by: "muse" }, base)).toMatch(/session plan/);
    expect(validateAction({ tool: "assign_peer_teacher", args: { conceptId: "evals", teacherId: "b", learnerId: "a" }, by: "muse" }, base)).toBeNull();
  });

  it("allows a shared gap only from the plan or when the room asks for it", () => {
    const noGap = { ...base, plan: base.plan.filter((i) => i.type !== "shared_gap") };
    expect(validateAction({ tool: "teach_shared_gap", args: { conceptId: "consol" }, by: "muse" }, noGap)).toMatch(/session plan/);
    expect(validateAction({ tool: "teach_shared_gap", args: { conceptId: "consol" }, by: "muse" }, { ...noGap, intent: "shared_gap" })).toBeNull();
  });

  it("the deterministic conductor follows the same plan", () => {
    expect(fallbackNext(base)).toMatchObject({ tool: "assign_peer_teacher", args: { conceptId: "evals", teacherId: "b" } });
    const afterPeer = { ...base, plan: base.plan.map((i) => (i.type === "peer_teach" ? { ...i, done: true } : i)), next: "gap:consol" };
    expect(fallbackNext(afterPeer)).toMatchObject({ tool: "teach_shared_gap", args: { conceptId: "consol" } });
  });
});

// ---------------------------------------------------------------------------

const PARAGRAPH =
  "Persistent agent memory lets an agent write distilled facts to a store and read them back in later sessions. " +
  "Unlike a longer context window, memory survives the end of a session and is scoped to the task. " +
  "Retrieval brings relevant documents into context at query time, which is a different mechanism from memory. ";
const ARTICLE = `<!doctype html><html><head><title>Agents that remember</title></head><body><article><h1>Agents that remember</h1>${`<p>${PARAGRAPH}</p>`.repeat(8)}</article></body></html>`;
const html = (body: string, status = 200) => new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });

describe("arbitrary shared Playground source", () => {
  async function roomReady(t: T) {
    const call = async (method: string, path: string, body?: unknown) => t.app.request(path, { method, headers: { "content-type": "application/json", "x-thinketh-user": "demo-user" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    let room = (await (await call("POST", "/playground/rooms", { displayName: "Stefen" })).json()) as PlaygroundRoom;
    await call("POST", `/playground/rooms/${room.id}/demo-guest`);
    room = (await (await call("POST", `/playground/rooms/${room.id}/compare`)).json()) as PlaygroundRoom;
    return { room, call };
  }
  async function settled(t: T, room: PlaygroundRoom) {
    for (let i = 0; i < 100; i++) {
      const r = (await (await t.app.request(`/playground/rooms/${room.id}`, { headers: { "x-thinketh-user": "demo-user" } })).json()) as PlaygroundRoom;
      if (r.resource!.sides.every((s) => s.status !== "processing")) return r;
      await new Promise((res) => setTimeout(res, 10));
    }
    throw new Error("never settled");
  }

  it("reads a custom article once and computes an independent delta for each Mind", async () => {
    const fetchMock = vi.fn(async (_u: string | URL) => html(ARTICLE));
    vi.stubGlobal("fetch", fetchMock);
    const t = make();
    const { room, call } = await roomReady(t);
    const res = await call("POST", `/playground/rooms/${room.id}/resource`, { url: "https://blog.example.com/agents-that-remember" });
    expect(res.status).toBe(200);
    const done = await settled(t, (await res.json()) as PlaygroundRoom);
    expect(done.scene).toBe("resource");
    expect(done.resource!.title).toMatch(/Agents that remember/);
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes("blog.example.com"))).toHaveLength(1);
    const [s1, s2] = done.resource!.sides;
    expect(s1!.userId).not.toBe(s2!.userId);
    expect(s1!.resourceId).not.toBe(s2!.resourceId);
    expect(s1!.status).toBe("ready");
    expect(s2!.status).toBe("ready");
    // Each side is that person's own resource, analyzed against their own Mind.
    expect(t.service.getResource("demo-user", s1!.resourceId).url).toBe(t.service.getResource("nadani", s2!.resourceId).url);
  });

  it("fails honestly on a blocked source and the session survives", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => html("denied", 403)));
    const t = make();
    const { room, call } = await roomReady(t);
    const res = await call("POST", `/playground/rooms/${room.id}/resource`, { url: "https://blocked.example.com/post" });
    const done = await settled(t, (await res.json()) as PlaygroundRoom);
    expect(done.resource!.sides.every((s) => s.status === "failed")).toBe(true);
    expect(done.resource!.note).toMatch(/couldn't read it/);
    // The known-safe default is still available afterwards.
    vi.stubGlobal("fetch", vi.fn(async () => html(ARTICLE)));
    const again = await call("POST", `/playground/rooms/${room.id}/conduct`, { intent: "resource" });
    expect(again.status).toBe(200);
  });

  it("refuses unsafe or invalid URLs through the same protections as everywhere else", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => html(ARTICLE)));
    const t = make();
    const { room, call } = await roomReady(t);
    for (const bad of ["http://127.0.0.1/admin", "not a url", "file:///etc/passwd"]) {
      expect((await call("POST", `/playground/rooms/${room.id}/resource`, { url: bad })).status, bad).toBe(400);
    }
  });
});
