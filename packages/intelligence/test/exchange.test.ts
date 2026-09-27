/**
 * Agent exchange: separate agent contexts, real tool execution, grounding, persistence, stop and
 * duplicate protection, and no human knowledge change. The model is a scripted stand-in (this file never
 * calls Muse); live behaviour is verified separately against the real API.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentExchange, PlaygroundRoom } from "@thinketh/contracts";
import { resetCircuits } from "../src/adapters/guard.ts";
import { createThinketh } from "../src/index.ts";
import { validActions } from "../src/playground/exchange/engine.ts";
import { MuseUnavailableError, type ChatMessage, type ExchangeModel, type ToolDef } from "../src/playground/exchange/muse.ts";
import { NOW, offlineConfig } from "./helpers.ts";

type Call = { name: string; args: Record<string, unknown> };
type Script = (purpose: string, messages: ChatMessage[], tools: string[]) => Promise<Call[]> | Call[];

/** Records every request exactly as the agent would have sent it, and answers from a script. */
class FakeMuse implements ExchangeModel {
  readonly label = "Muse (test double)";
  readonly calls: Array<{ purpose: string; messages: ChatMessage[]; tools: string[] }> = [];
  private readonly script: Script;
  constructor(script: Script) {
    this.script = script;
  }
  async complete(messages: ChatMessage[], tools: ToolDef[], opts: { purpose: string }) {
    const names = tools.map((t) => t.name);
    this.calls.push({ purpose: opts.purpose, messages: structuredClone(messages), tools: names });
    const out = await this.script(opts.purpose, messages, names);
    const n = this.calls.length;
    return {
      message: { role: "assistant" as const, content: null, tool_calls: out.map((c, i) => ({ id: `call_${n}_${i}`, type: "function" as const, function: { name: c.name, arguments: JSON.stringify(c.args) } })) },
      ms: 1,
    };
  }
}

/** The passages the latest retrieve_sources returned to this agent. */
const lastPassages = (messages: ChatMessage[]): Array<{ ref: string; text: string; kind: string }> => {
  const tool = [...messages].reverse().find((m) => m.role === "tool" && m.content.includes('"passages"'));
  return tool && tool.role === "tool" ? (JSON.parse(tool.content).passages as Array<{ ref: string; text: string; kind: string }>) : [];
};
const lastUser = (messages: ChatMessage[]) => [...messages].reverse().find((m) => m.role === "user")!.content as string;
/** The coordinator view's validActions, as the model sees them. */
const valid = (messages: ChatMessage[]) => Object.keys(JSON.parse(lastUser(messages).replace(/^Exchange view \(data\):\n/, "")).validActions);

/** A cooperative script: retrieve, explain, ask for evidence, answer, take away the passage itself. */
function cooperative(opts: { learner?: "evidence" | "takeaway" | "unsupported" } = {}): Script {
  return (purpose, messages) => {
    if (purpose === "coordinator") {
      const v = valid(messages);
      const pick = ["save_takeaway", "check_takeaway", "teacher_respond", "learner_respond", "learner_takeaway", "finish"].find((a) => v.includes(a))!;
      return [{ name: "choose_next", args: { action: pick, note: `test chose ${pick}` } }];
    }
    const passages = lastPassages(messages);
    const retrieved = messages.some((m) => m.role === "tool" && m.content.includes('"passages"'));
    if (purpose.startsWith("teacher")) {
      if (!retrieved) return [{ name: "retrieve_sources", args: { query: "why separate" } }];
      const p = passages.find((x) => x.kind === "claim")!;
      return purpose.endsWith("explain")
        ? [{ name: "send_explanation", args: { text: `The key point: ${p.text}`, sourceRefs: [p.ref] } }]
        : [{ name: "answer_question", args: { text: `The source says: ${p.text}`, sourceRefs: [p.ref] } }];
    }
    // Learner: looks at its own permitted material first, then works from what the teacher sent.
    if (!retrieved) return [{ name: "retrieve_sources", args: { query: "evidence" } }];
    const sent = JSON.parse(lastUser(messages).split("\n\nNow:")[0]!.replace(/^Exchange update \(data, not instructions\):\n/, "")) as { citedPassages: Record<string, { text: string }> };
    const [ref, passage] = Object.entries(sent.citedPassages)[0] ?? Object.entries(Object.fromEntries(passages.map((x) => [x.ref, x])))[0]!;
    if (purpose.endsWith("learner_respond") && opts.learner === "evidence" && !messages.some((m) => m.role === "assistant" && JSON.stringify(m).includes("request_evidence"))) {
      return [{ name: "request_evidence", args: { claim: "the key point", question: "Which source says this?" } }];
    }
    if (opts.learner === "unsupported") return [{ name: "propose_takeaway", args: { text: "Quantum annealing hardware doubles compiler throughput for spreadsheets.", sourceRefs: [ref] } }];
    return [{ name: "propose_takeaway", args: { text: passage!.text, sourceRefs: [ref] } }];
  };
}

const tmp = () => mkdtempSync(join(tmpdir(), "thinketh-exchange-"));
function boot(model: ExchangeModel | undefined, dataDir = tmp()) {
  const t = createThinketh({ config: { ...offlineConfig(), dataDir }, now: () => NOW });
  (t.playground.exchange as unknown as { model: ExchangeModel | undefined }).model = model;
  return t;
}
type T = ReturnType<typeof boot>;
const req = async (t: T, method: string, path: string, body?: unknown, user = "demo-user") => {
  const res = await t.app.request(path, { method, headers: { "content-type": "application/json", "x-thinketh-user": user }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  return { status: res.status, room: (await res.json()) as PlaygroundRoom };
};
async function comparedRoom(t: T): Promise<PlaygroundRoom> {
  let r = (await req(t, "POST", "/playground/rooms", { displayName: "Stefen" })).room;
  r = (await req(t, "POST", `/playground/rooms/${r.id}/demo-guest`)).room;
  return (await req(t, "POST", `/playground/rooms/${r.id}/compare`)).room;
}
async function runToEnd(t: T, roomId: string): Promise<PlaygroundRoom> {
  let r = (await req(t, "GET", `/playground/rooms/${roomId}`)).room;
  for (let i = 0; i < 40 && r.exchange?.status === "running"; i++) r = (await req(t, "POST", `/playground/rooms/${roomId}/exchange/advance`, { step: r.exchange.step })).room;
  return r;
}

beforeEach(() => resetCircuits());
afterEach(() => undefined);

describe("agent exchange", () => {
  it("runs a real exchange: separate contexts, propagated transcript, a checked and saved takeaway, no human change", async () => {
    const muse = new FakeMuse(cooperative({ learner: "evidence" }));
    const t = boot(muse);
    const room0 = await comparedRoom(t);
    expect(room0.exchangeAvailability).toMatchObject({ available: true, mode: "teach", teacherId: "nadani", learnerId: "demo-user", conceptId: "evaluator-architectures" });
    const before = await t.service.knowledge("demo-user");
    const transitionsBefore = (await t.adapters.temporal.getRecentTransitions("demo-user", 500)).length;

    const started = await req(t, "POST", `/playground/rooms/${room0.id}/exchange`, {});
    expect(started.room.scene).toBe("agent_exchange");
    const room = await runToEnd(t, room0.id);
    const ex = room.exchange!;
    expect(ex.status).toBe("completed");
    expect(ex.messages.map((m) => m.kind)).toEqual(["explanation", "evidence_request", "answer", "takeaway"]);
    expect(ex.check).toMatchObject({ verdict: "supported", checkedBy: "deterministic" });
    // The default coordinator is Thinketh's planner: no model call is spent choosing turns.
    expect(muse.calls.some((c) => c.purpose === "coordinator")).toBe(false);

    // Separate contexts: the teacher's system prompt and the learner's differ, and neither sees the other's tool results.
    const teacherCalls = muse.calls.filter((c) => c.purpose.startsWith("teacher"));
    const learnerCalls = muse.calls.filter((c) => c.purpose.startsWith("learner"));
    expect(teacherCalls[0]!.messages[0]).toMatchObject({ role: "system", content: expect.stringMatching(/teaching agent/) });
    expect(learnerCalls[0]!.messages[0]).toMatchObject({ role: "system", content: expect.stringMatching(/receiving agent/) });
    // The learner's first turn received the teacher's actual explanation and the passage it cited.
    const explanation = ex.messages[0]!;
    expect(lastUser(learnerCalls[0]!.messages)).toContain(explanation.text);
    expect(lastUser(learnerCalls[0]!.messages)).toContain(ex.sources.find((s) => s.ref === explanation.sourceRefs[0])!.text);
    // The teacher's next turn received the learner's actual question, after its own earlier tool results.
    const teacherRespond = teacherCalls.find((c) => c.purpose === "teacher:teacher_respond")!;
    expect(lastUser(teacherRespond.messages)).toContain("Which source says this?");
    expect(teacherRespond.messages.some((m) => m.role === "tool")).toBe(true);
    // Every tool call in history got its tool result (the Chat Completions contract).
    for (const c of muse.calls) {
      const ids = c.messages.flatMap((m) => (m.role === "assistant" ? (m.tool_calls ?? []).map((x) => x.id) : []));
      const answered = new Set(c.messages.flatMap((m) => (m.role === "tool" ? [m.tool_call_id] : [])));
      expect(ids.every((id) => answered.has(id))).toBe(true);
    }

    // Saved for the learner's agent only; opens from their library; the teacher can't read it.
    const mine = await t.app.request("/takeaways?conceptId=evaluator-architectures", { headers: { "x-thinketh-user": "demo-user" } });
    const list = ((await mine.json()) as { takeaways: Array<{ id: string; fromName: string; exchangeId: string; sources: unknown[] }> }).takeaways;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: ex.savedTakeawayId, fromName: "Nadani", exchangeId: ex.id });
    expect((await t.app.request(`/takeaways/${ex.savedTakeawayId}`, { headers: { "x-thinketh-user": "nadani" } })).status).toBe(404);
    expect(room.events.map((e) => e.type)).toEqual(expect.arrayContaining(["exchange_started", "retrieval_started", "retrieval_completed", "agent_message", "clarification_requested", "takeaway_checked", "takeaway_saved", "exchange_completed"]));

    // Agent activity is not human evidence.
    expect((await t.adapters.temporal.getRecentTransitions("demo-user", 500)).length).toBe(transitionsBefore);
    expect((await t.service.knowledge("demo-user")).items.map((i) => i.state)).toEqual(before.items.map((i) => i.state));

    // A later authorized agent request retrieves the saved material (labelled as an agent takeaway).
    const again = await req(t, "POST", `/playground/rooms/${room0.id}/exchange/close`, {});
    expect(again.room.scene).toBe("overview");
    await req(t, "POST", `/playground/rooms/${room0.id}/exchange`, {});
    const second = await runToEnd(t, room0.id);
    expect(second.exchange!.sources.some((s) => s.kind === "takeaway" && s.via === "agent_takeaway" && s.retrievedBy === "demo-user")).toBe(true);
  });

  it("the receiving agent's actual response changes what can happen next", () => {
    const base: AgentExchange = {
      id: "exc_1", status: "running", mode: "teach", conceptId: "c", conceptName: "C", teacherId: "a", learnerId: "b", reason: "", startedBy: "a", startedAt: NOW.toISOString(), step: 3,
      budgets: { maxMessages: 6, maxToolCalls: 12, deadlineAt: new Date(NOW.getTime() + 60_000).toISOString() },
      used: { messages: 2, toolCalls: 3, modelCalls: 3 }, actions: [], sources: [], humanChecks: 0,
      messages: [{ id: "m1", at: "", from: "a", to: "b", kind: "explanation", text: "x", sourceRefs: ["S1"] }],
    };
    const asked = { ...base, messages: [...base.messages, { id: "m2", at: "", from: "b", to: "a", kind: "clarification" as const, text: "?", sourceRefs: [] }] };
    const tookAway = { ...base, messages: [...base.messages, { id: "m2", at: "", from: "b", to: "a", kind: "takeaway" as const, text: "t", sourceRefs: ["S1"] }], takeaway: { text: "t", sourceRefs: ["S1"], unresolved: [] } };
    expect(validActions(asked, NOW.getTime())).toEqual(["teacher_respond", "finish"]);
    expect(validActions(tookAway, NOW.getTime())).toEqual(["check_takeaway"]);
  });

  it("rejects an unsupported takeaway and saves nothing", async () => {
    const t = boot(new FakeMuse(cooperative({ learner: "unsupported" })));
    const r0 = await comparedRoom(t);
    await req(t, "POST", `/playground/rooms/${r0.id}/exchange`, {});
    const ex = (await runToEnd(t, r0.id)).exchange!;
    expect(ex.check?.verdict).toBe("unsupported");
    expect(ex.status).toBe("insufficient");
    expect(ex.savedTakeawayId).toBeUndefined();
    expect(await t.adapters.store.list("agent_takeaways")).toHaveLength(0);
  });

  it("only cites what an agent actually has, and never reaches saved sources that weren't shared", async () => {
    let rejected = "";
    const t = boot(
      new FakeMuse((purpose, messages) => {
        if (purpose === "coordinator") return [{ name: "choose_next", args: { action: "finish", note: "stop" } }];
        const tool = [...messages].reverse().find((m) => m.role === "tool");
        if (tool && tool.role === "tool" && tool.content.includes("aren't available")) rejected = tool.content;
        if (!messages.some((m) => m.role === "tool")) return [{ name: "send_explanation", args: { text: "Invented", sourceRefs: ["S9"] } }];
        if (!messages.some((m) => m.role === "tool" && m.content.includes('"passages"'))) return [{ name: "retrieve_sources", args: {} }];
        const p = lastPassages(messages)[0]!;
        return [{ name: "send_explanation", args: { text: p.text, sourceRefs: [p.ref] } }];
      }),
    );
    await t.adapters.store.put("resources", "res_x", { id: "res_x", ownerId: "nadani", url: "https://example.com/x", title: "Nadani's private read", sourceType: "article", createdAt: NOW.toISOString(), status: "ready", stage: "done", summary: "Private summary about evaluators.", extractedConcepts: [], matchedConceptIds: ["evaluator-architectures"], alreadyUnderstood: [], newToYou: [], relevantConnections: [] }, "nadani");
    const r0 = await comparedRoom(t);
    await req(t, "POST", `/playground/rooms/${r0.id}/exchange`, {});
    const ex = (await runToEnd(t, r0.id)).exchange!;
    expect(rejected).toMatch(/S9 aren't available/);
    expect(ex.sources.some((s) => s.via === "shared_resource")).toBe(false);
    expect(ex.messages[0]!.sourceRefs).toEqual([expect.stringMatching(/^S\d$/)]);
  });

  it("start is idempotent and a step runs once, however many requests ask for it", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const muse = new FakeMuse(async (purpose, messages, tools) => {
      if (purpose.startsWith("teacher")) await gate;
      return cooperative()(purpose, messages, tools);
    });
    const t = boot(muse);
    const r0 = await comparedRoom(t);
    const [a, b] = await Promise.all([req(t, "POST", `/playground/rooms/${r0.id}/exchange`, {}), req(t, "POST", `/playground/rooms/${r0.id}/exchange`, {})]);
    expect(a.room.exchange!.id).toBe(b.room.exchange!.id);
    // Step 0 is the (single-option) plan; step 1 is the teacher's turn, asked for by three requests at once.
    const s1 = (await req(t, "POST", `/playground/rooms/${r0.id}/exchange/advance`, { step: 0 })).room.exchange!.step;
    const three = [0, 1, 2].map(() => req(t, "POST", `/playground/rooms/${r0.id}/exchange/advance`, { step: s1 }));
    await new Promise((r) => setTimeout(r, 20));
    release();
    await Promise.all(three);
    const ex = (await req(t, "GET", `/playground/rooms/${r0.id}`)).room.exchange!;
    expect(ex.step).toBe(s1 + 1);
    expect(ex.messages).toHaveLength(1);
    // One teacher turn began (its first call ends on the delivered update), however many requests asked.
    expect(muse.calls.filter((c) => c.purpose.startsWith("teacher") && c.messages.at(-1)?.role === "user")).toHaveLength(1);
    // A stale step number does nothing.
    const stale = await req(t, "POST", `/playground/rooms/${r0.id}/exchange/advance`, { step: 0 });
    expect(stale.room.exchange!.step).toBe(s1 + 1);
  });

  it("Stop wins over a late model response: nothing further is applied or saved", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const t = boot(new FakeMuse(async (purpose, messages, tools) => {
      if (purpose.startsWith("teacher")) await gate;
      return cooperative()(purpose, messages, tools);
    }));
    const r0 = await comparedRoom(t);
    await req(t, "POST", `/playground/rooms/${r0.id}/exchange`, {});
    const s1 = (await req(t, "POST", `/playground/rooms/${r0.id}/exchange/advance`, { step: 0 })).room.exchange!.step;
    const inflight = req(t, "POST", `/playground/rooms/${r0.id}/exchange/advance`, { step: s1 });
    await new Promise((r) => setTimeout(r, 20));
    const stopped = await req(t, "POST", `/playground/rooms/${r0.id}/exchange/stop`, {}, "nadani");
    expect(stopped.room.exchange).toMatchObject({ status: "stopped", outcome: expect.stringMatching(/Stopped by Nadani/) });
    release();
    await inflight;
    const ex = (await req(t, "GET", `/playground/rooms/${r0.id}`)).room.exchange!;
    expect(ex.status).toBe("stopped");
    expect(ex.messages).toHaveLength(0);
    expect(await t.adapters.store.list("agent_takeaways")).toHaveLength(0);
  });

  it("reports provider failure honestly, and labels the planner when the coordinator can't choose", async () => {
    const t = boot(new FakeMuse((purpose) => {
      if (purpose.startsWith("teacher")) throw new MuseUnavailableError("muse 503");
      return [];
    }));
    const r0 = await comparedRoom(t);
    await req(t, "POST", `/playground/rooms/${r0.id}/exchange`, {});
    const ex = (await runToEnd(t, r0.id)).exchange!;
    expect(ex.status).toBe("failed");
    expect(ex.outcome).toMatch(/Muse didn't complete the step .*Start the exchange again/);
    expect(ex.messages).toHaveLength(0);

    // Muse as coordinator (THINKETH_EXCHANGE_COORDINATOR=muse) returns no tool call: the deterministic planner decides, and says so.
    const t2 = boot(new FakeMuse((purpose, messages, tools) => (purpose === "coordinator" ? [] : cooperative()(purpose, messages, tools))));
    (t2.playground.exchange as unknown as { limits: { coordinator: string } }).limits.coordinator = "muse";
    const r2 = await comparedRoom(t2);
    await req(t2, "POST", `/playground/rooms/${r2.id}/exchange`, {});
    const ex2 = (await runToEnd(t2, r2.id)).exchange!;
    expect(ex2.actions.some((a) => a.actor === "coordinator" && a.by === "planner" && /planner did/.test(a.summary))).toBe(true);
  });

  it("without Muse there is no agent exchange, and the room says why", async () => {
    const t = boot(undefined);
    const r0 = await comparedRoom(t);
    expect(r0.exchangeAvailability).toMatchObject({ available: false, reason: expect.stringMatching(/needs Muse/) });
    expect((await req(t, "POST", `/playground/rooms/${r0.id}/exchange`, {})).status).toBe(400);
  });

  it("marks an exchange nobody advanced past its deadline as interrupted, after a restart too", async () => {
    const dir = tmp();
    const t = boot(new FakeMuse(cooperative()), dir);
    const r0 = await comparedRoom(t);
    await req(t, "POST", `/playground/rooms/${r0.id}/exchange`, {});
    const later = new Date(NOW.getTime() + 10 * 60_000);
    const t2 = createThinketh({ config: { ...offlineConfig(), dataDir: dir }, now: () => later });
    (t2.playground.exchange as unknown as { model: ExchangeModel }).model = new FakeMuse(cooperative());
    const r = (await req(t2 as T, "GET", `/playground/rooms/${r0.id}`)).room;
    expect(r.exchange).toMatchObject({ status: "interrupted", outcome: expect.stringMatching(/Interrupted/) });
  });
});
