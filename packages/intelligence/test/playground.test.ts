/**
 * Playground: collaborative delta rules, conductor validation, and the peer
 * learning golden path over HTTP: create -> Nadani joins -> compare ->
 * Nadani teaches -> Stefen answers a transfer question -> the evidence engine
 * records a real transition (or refuses to) -> shared gap -> resource.
 */
import { PlaygroundRoomSchema, type MindSnapshot, type PlaygroundRoom } from "@thinketh/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { collaborativeDelta } from "../src/engine/collaborative.ts";
import { createThinketh } from "../src/index.ts";
import { fallbackNext, MUSE_TOOLS, MuseConductor, validateAction, type ConductorView } from "../src/playground/conductor.ts";
import { NOW, offlineConfig } from "./helpers.ts";

const snap = (userId: string, rows: Array<[string, number, number, number, boolean?, boolean?]>): MindSnapshot => ({
  userId,
  displayName: userId,
  takenAt: NOW.toISOString(),
  edges: [],
  excludes: [],
  concepts: rows.map(([conceptId, mastery, uncertainty, evidenceCount, verified = false, hasMisconception = false]) => ({
    conceptId,
    name: conceptId,
    short: conceptId,
    importance: 0.5,
    level: mastery >= 0.75 ? "strong" : mastery >= 0.55 ? "intermediate" : mastery >= 0.4 ? "developing" : "weak",
    mastery,
    uncertainty,
    evidenceCount,
    verified,
    hasMisconception,
    lastObservedAt: NOW.toISOString(),
  })),
});

describe("collaborative delta", () => {
  const a = snap("stefen", [["tools", 0.86, 0.12, 14], ["evals", 0.3, 0.6, 1], ["consol", 0.22, 0.5, 1], ["ctx", 0.8, 0.2, 9], ["thin", 0.8, 0.45, 2], ["mis", 0.9, 0.1, 9, true, true]]);
  const b = snap("nadani", [["tools", 0.38, 0.42, 2], ["evals", 0.84, 0.2, 7, true], ["consol", 0.2, 0.52, 1], ["ctx", 0.74, 0.22, 7], ["thin", 0.4, 0.4, 2], ["mis", 0.3, 0.5, 1]]);

  it("finds who can teach whom, shared strengths and shared gaps", () => {
    const d = collaborativeDelta(a, b);
    expect(d.bTeachesA.map((i) => i.conceptId)).toEqual(["evals"]);
    expect(d.bTeachesA[0]).toMatchObject({ teacherId: "nadani", learnerId: "stefen", reason: "nadani has stronger verified evidence." });
    expect(d.aTeachesB.map((i) => i.conceptId)).toEqual(["tools"]);
    expect(d.sharedStrengths.map((i) => i.conceptId)).toEqual(["ctx"]);
    expect(d.sharedGaps.map((i) => i.conceptId)).toEqual(["consol"]);
  });

  it("is conservative: thin evidence or a flagged misconception is a conflict, never a teacher", () => {
    const d = collaborativeDelta(a, b);
    expect(d.conflicts.map((i) => i.conceptId).sort()).toEqual(["mis", "thin"]);
    expect([...d.aTeachesB, ...d.bTeachesA].some((i) => i.conceptId === "thin" || i.conceptId === "mis")).toBe(false);
  });

  it("is deterministic and symmetric", () => {
    const d1 = collaborativeDelta(a, b);
    const d2 = collaborativeDelta(b, a);
    expect(d2.aTeachesB).toEqual(d1.bTeachesA.map((i) => ({ ...i, a: i.b, b: i.a })));
    expect(collaborativeDelta(a, b)).toEqual(d1);
  });
});

describe("conductor boundary", () => {
  const view: ConductorView = {
    scene: "overview",
    participants: [{ id: "demo-user", name: "Stefen" }, { id: "nadani", name: "Nadani" }],
    teachable: [{ conceptId: "evaluator-architectures", conceptName: "Evaluator Architectures", teacherId: "nadani", learnerId: "demo-user", assessmentAvailable: true }],
    sharedGaps: [{ conceptId: "memory-consolidation", conceptName: "Memory Consolidation" }],
    plan: [
      { id: "peer:evaluator-architectures:nadani", type: "peer_teach", conceptId: "evaluator-architectures", conceptName: "Evaluator Architectures", teacherId: "nadani", learnerId: "demo-user", done: false },
      { id: "gap:memory-consolidation", type: "shared_gap", conceptId: "memory-consolidation", conceptName: "Memory Consolidation", done: false },
    ],
    next: "peer:evaluator-architectures:nadani",
    progress: { teacherAssigned: false, explanationSubmitted: false, transferAsked: false, transferAnswered: false, sharedGapTaught: false, resourceIntroduced: false },
  };

  it("has no tool that can change knowledge state", () => {
    const names = MUSE_TOOLS.map((t) => t.name).join(" ");
    expect(names).not.toMatch(/mastery|understood|uncertainty|verify|knowledge|mutate|set_/i);
  });

  it("rejects actions that don't come from the computed delta", () => {
    expect(validateAction({ tool: "assign_peer_teacher", args: { conceptId: "evaluator-architectures", teacherId: "demo-user", learnerId: "nadani" }, by: "muse" }, view)).toMatch(/computed delta/);
    expect(validateAction({ tool: "teach_shared_gap", args: { conceptId: "agent-tool-use" }, by: "muse" }, view)).toMatch(/not a shared gap/);
    expect(validateAction({ tool: "ask_transfer_question", args: {}, by: "muse" }, view)).toMatch(/explanation must come first/);
    expect(validateAction({ tool: "spotlight_scene", args: { conceptId: "evaluator-architectures", mastery: 1 }, by: "muse" }, view)).toMatch(/unknown argument/);
    expect(validateAction(fallbackNext(view), view)).toBeNull();
  });

  it("falls back deterministically when Muse misbehaves", async () => {
    const bad = (async () =>
      new Response(JSON.stringify({ choices: [{ message: { tool_calls: [{ function: { name: "set_mastery", arguments: "{\"value\":1}" } }] } }] }), { status: 200 })) as typeof fetch;
    const muse = new MuseConductor({ apiKey: "k", model: "m", baseUrl: "https://example.invalid", timeoutMs: 1000 }, bad);
    const action = await muse.next(view);
    expect(action.by).toBe("fallback");
    expect(action.tool).toBe("assign_peer_teacher");

    const good = (async () =>
      new Response(JSON.stringify({ choices: [{ message: { tool_calls: [{ function: { name: "assign_peer_teacher", arguments: JSON.stringify({ conceptId: "evaluator-architectures", teacherId: "nadani", learnerId: "demo-user", say: "Nadani, take it." }) } }] } }] }), { status: 200 })) as typeof fetch;
    const live = await new MuseConductor({ apiKey: "k", model: "m", baseUrl: "https://example.invalid", timeoutMs: 1000 }, good).next(view);
    expect(live).toMatchObject({ tool: "assign_peer_teacher", by: "muse" });
  });
});

describe("Playground golden path (HTTP)", () => {
  let app: ReturnType<typeof createThinketh>["app"];
  beforeEach(() => {
    app = createThinketh({ config: offlineConfig(), now: () => NOW }).app;
  });
  const call = async (method: string, path: string, body?: object, user = "demo-user"): Promise<{ status: number; room: PlaygroundRoom }> => {
    const res = await app.request(path, { method, headers: { "content-type": "application/json", "x-thinketh-user": user }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const json = (await res.json()) as unknown;
    return { status: res.status, room: res.status === 200 ? PlaygroundRoomSchema.parse(json) : (json as PlaygroundRoom) };
  };
  const ok = async (method: string, path: string, body?: object, user?: string) => {
    const r = await call(method, path, body, user);
    expect(r.status, `${path}: ${JSON.stringify(r.room)}`).toBe(200);
    return r.room;
  };

  async function toTransfer() {
    let room = await ok("POST", "/playground/rooms", { displayName: "Stefen" });
    expect(room.scene).toBe("waiting");
    room = await ok("POST", `/playground/rooms/${room.id}/demo-guest`);
    expect(room.scene).toBe("arrival");
    expect(room.participants.map((p) => p.displayName)).toEqual(["Stefen", "Nadani"]);
    room = await ok("POST", `/playground/rooms/${room.id}/compare`);
    expect(room.scene).toBe("overview");
    expect(room.delta!.bTeachesA[0]).toMatchObject({ conceptId: "evaluator-architectures", teacherId: "nadani", learnerId: "demo-user" });
    expect(room.delta!.aTeachesB[0]?.conceptId).toBe("agent-tool-use");
    expect(room.delta!.sharedGaps.map((g) => g.conceptId)).toContain("memory-consolidation");
    // Snapshots are permissioned: knowledge state only.
    expect(JSON.stringify(room.snapshots)).not.toMatch(/misconceptionFlags|memory-equals-context-window/);
    room = await ok("POST", `/playground/rooms/${room.id}/conduct`, {});
    expect(room.scene).toBe("peer_teaching");
    expect(room.teaching).toMatchObject({ teacherId: "nadani", learnerId: "demo-user", prompt: "Why shouldn't an AI always be the final judge of its own output?" });
    expect(room.museLine).toBe("Nadani's agent will teach Stefen's agent how AI should check its own work.");
    expect(room.conductor.mode).toBe("fallback");
    // Nobody types: Nadani's agent teaches Stefen's agent, then Thinketh asks Stefen the transfer question.
    await vi.waitFor(async () => {
      room = await ok("GET", `/playground/rooms/${room.id}`);
      expect(room.scene).toBe("transfer");
    });
    expect(room.teaching).toMatchObject({ explanationSource: "agent" });
    expect(room.teaching!.explanation).toBeTruthy();
    expect(room.events.find((e) => e.type === "explanation_submitted")).toMatchObject({ actor: "agent:nadani", summary: expect.stringMatching(/Nadani's agent taught Stefen's agent/) });
    // The explanation is in: a person can't overwrite it.
    expect((await call("POST", `/playground/rooms/${room.id}/explain`, { text: "x", asUserId: "nadani" })).status).toBe(400);
    expect(room.scene).toBe("transfer");
    expect(room.transfer!.prompt).toMatch(/approve customer refunds/);
    return room;
  }

  it("a correct transfer answer moves knowledge through the real evidence path", async () => {
    let room = await toTransfer();
    const before = room.snapshots.find((s) => s.userId === "demo-user")!.concepts.find((c) => c.conceptId === "evaluator-architectures")!;
    room = await ok("POST", `/playground/rooms/${room.id}/answer`, {
      answer: "Use a separate, independent evaluator model rather than letting the agent grade its own output, because self-grading is biased. Evaluate at each commit gate with tests and CI, and feed the verdict back so the agent retries and fixes.",
    });
    expect(room.scene).toBe("knowledge_moved");
    expect(room.transfer).toMatchObject({ verified: true });
    const t = room.transfer!.transition!;
    expect(t.observation.kind).toBe("diagnostic_correct");
    expect(t.observation.sourceRef).toBe("diagnostic:dq-evaluators-transfer-coding-agent");
    expect(t.after.mastery).toBeGreaterThan(t.before.mastery);
    expect(t.reason).toMatch(/transfer question/);
    const after = room.snapshots.find((s) => s.userId === "demo-user")!.concepts.find((c) => c.conceptId === "evaluator-architectures")!;
    expect(after.mastery).toBeGreaterThan(before.mastery);
    expect(after.verified).toBe(true);
    expect(room.events.map((e) => e.type)).toContain("transfer_verified");

    // The Mind endpoint agrees: the change is real, not a Playground-only illusion.
    const res = await app.request("/knowledge", { headers: { "x-thinketh-user": "demo-user" } });
    const k = (await res.json()) as { items: Array<{ concept: { id: string }; state: { mastery: number } }> };
    expect(k.items.find((i) => i.concept.id === "evaluator-architectures")!.state.mastery).toBeCloseTo(t.after.mastery, 5);

    // "Next: the shared gap" in the app sends this intent (the plan's next item would be the second peer teaching).
    room = await ok("POST", `/playground/rooms/${room.id}/conduct`, { intent: "shared_gap" });
    expect(room.scene).toBe("shared_gap");
    expect(room.sharedGap).toMatchObject({ conceptId: "memory-consolidation" });
    expect(room.sharedGap!.lesson!.length).toBeGreaterThan(1);
  });

  it("a weak transfer answer is recorded honestly and nothing is verified", async () => {
    let room = await toTransfer();
    room = await ok("POST", `/playground/rooms/${room.id}/answer`, { answer: "I think it just makes it faster." });
    expect(room.scene).toBe("knowledge_moved");
    expect(room.transfer!.verified).toBe(false);
    expect(room.transfer!.transition!.observation.kind).not.toBe("diagnostic_correct");
    expect(room.events.map((e) => e.type)).toContain("transfer_not_verified");
  });

  it("rooms are private to their participants", async () => {
    const room = await ok("POST", "/playground/rooms", { displayName: "Stefen" });
    expect((await call("GET", `/playground/rooms/${room.id}`, undefined, "someone-else")).status).toBe(404);
    expect((await call("POST", `/playground/rooms/${room.id}/demo-guest`, undefined, "someone-else")).status).toBe(404);
  });

  it("rooms expose only the public anon key for realtime, never the service key", async () => {
    const cfg = offlineConfig();
    const t = createThinketh({ config: { ...cfg, supabase: { url: "https://example.invalid", anonKey: "anon-public", serviceRoleKey: "service-secret" } }, now: () => NOW });
    const res = await t.app.request("/playground/rooms", { method: "POST", headers: { "content-type": "application/json", "x-thinketh-user": "demo-user" }, body: JSON.stringify({ displayName: "Stefen" }) });
    const text = await res.text();
    expect(text).toContain("anon-public");
    expect(text).not.toContain("service-secret");
    expect(PlaygroundRoomSchema.parse(JSON.parse(text)).realtime.mode).toBe("broadcast");
  });

  it("the transfer question is never picked by normal adaptive selection", async () => {
    for (let i = 0; i < 3; i++) {
      const res = await app.request("/diagnostics/select", { method: "POST", headers: { "content-type": "application/json", "x-thinketh-user": "demo-user" }, body: JSON.stringify({ conceptId: "evaluator-architectures" }) });
      const q = (await res.json()) as { question: { id: string } };
      expect(q.question.id).not.toBe("dq-evaluators-transfer-coding-agent");
    }
  });
});
