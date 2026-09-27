/**
 * Playground: collaborative delta rules and the room path over HTTP: create -> Nadani joins ->
 * compare -> overview (the agent exchange starts from there; see exchange.test.ts). The guided
 * session (conductor, peer teaching, transfer questions) was removed on 2026-09-27.
 */
import { PlaygroundRoomSchema, type MindSnapshot, type PlaygroundRoom } from "@thinketh/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { collaborativeDelta } from "../src/engine/collaborative.ts";
import { createThinketh } from "../src/index.ts";
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

  it("create -> demo guest -> compare lands on the overview, with the exchange offered from the delta", async () => {
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
    // Nothing of the removed guided session is built or sent.
    expect(room).not.toHaveProperty("plan");
    expect(room).not.toHaveProperty("teaching");
    expect(room).not.toHaveProperty("conductor");
    // Without Muse configured the exchange says why instead of starting.
    expect(room.exchangeAvailability).toMatchObject({ available: false, reason: expect.stringMatching(/needs Muse/) });
  });

  it("the guided session routes are gone", async () => {
    const room = await ok("POST", "/playground/rooms", { displayName: "Stefen" });
    await ok("POST", `/playground/rooms/${room.id}/demo-guest`);
    await ok("POST", `/playground/rooms/${room.id}/compare`);
    for (const path of ["conduct", "explain", "answer", "resource", "exchange/check"]) {
      expect((await call("POST", `/playground/rooms/${room.id}/${path}`, { text: "x", answer: "x", url: "https://example.com" })).status, path).toBe(404);
    }
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
