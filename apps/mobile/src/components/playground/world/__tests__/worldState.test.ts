/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PlaygroundRoom } from "@thinketh/contracts";
import { acceptRoom } from "../../../../lib/roomSync";
import { CHECKPOINT_AT, freshEffects, PLACES, projectPlayground, sessionOutcome } from "../worldState";

// Real rooms captured from the local API (live Muse and Claude).
type Beat = "arrival" | "overview" | "peer_teaching" | "transfer" | "verified" | "second_teaching" | "not_verified" | "shared_gap" | "resource";
const rooms = JSON.parse(readFileSync(join(__dirname, "../../../../lib/__tests__/fixtures/rooms.json"), "utf8")) as Record<Beat, PlaygroundRoom>;
const ME = "demo-user";
const clone = (r: PlaygroundRoom) => JSON.parse(JSON.stringify(r)) as PlaygroundRoom;
const agent = (w: ReturnType<typeof projectPlayground>, id: string) => w.agents.find((a) => a.userId === id)!;

describe("world: who stands where", () => {
  it("before a room exists, your agent stands alone in the room", () => {
    const w = projectPlayground(null, ME, null, "Stefen");
    expect(w.phase).toBe("empty");
    expect(w.agents.map((a) => [a.label, a.at])).toEqual([["You", PLACES.hostHome]]);
    expect(w.muse.state).toBe("absent");
  });

  it("waiting: only the host; arrival: the guest stands at home, facing the host", () => {
    const waiting = clone(rooms.arrival);
    waiting.scene = "waiting";
    waiting.participants = waiting.participants.slice(0, 1);
    expect(projectPlayground(waiting, ME, null).agents).toHaveLength(1);
    const w = projectPlayground(rooms.arrival, ME, null);
    expect(w.phase).toBe("arrival");
    expect(agent(w, "nadani")).toMatchObject({ at: PLACES.guestHome, facing: "left", tone: "blue", persona: true });
    expect(agent(w, ME)).toMatchObject({ facing: "right", tone: "coral", label: "You" });
    expect(w.now.waitingFor).toMatch(/compare/);
  });

  it("the host is coral and on the left on every device", () => {
    const w = projectPlayground(rooms.overview, "nadani", null);
    expect(agent(w, ME)).toMatchObject({ tone: "coral", at: PLACES.hostHome, label: "Stefen" });
    expect(agent(w, "nadani")).toMatchObject({ tone: "blue", label: "You" });
  });

  it("comparing is Thinketh's action while the request is in flight; Muse isn't in the room yet", () => {
    const w = projectPlayground(rooms.arrival, ME, "compare");
    expect(w.phase).toBe("comparing");
    expect(w.thinketh).toBe("comparing");
    expect(w.muse.state).toBe("absent");
  });

  it("overview: the strongest teachable difference sits between them, offered, not moving", () => {
    const w = projectPlayground(rooms.overview, ME, null);
    expect(w.concept).toMatchObject({ state: "offered", teacherId: "nadani", learnerId: ME, conceptId: "evaluator-architectures" });
    expect(w.concept!.at.x).toBeCloseTo(0.5, 5);
    expect(w.checkpoint).toBeNull();
    expect(w.muse.state).toBe("resting");
  });

  it("Muse choosing is shown only while conduct is in flight", () => {
    expect(projectPlayground(rooms.overview, ME, "conduct")).toMatchObject({ phase: "choosing", muse: { state: "choosing" } });
    expect(projectPlayground(rooms.verified, ME, "conduct").phase).toBe("choosing");
  });
});

describe("world: teaching in both directions", () => {
  it("Nadani teaches you: she approaches and faces you; the idea stays with her", () => {
    const w = projectPlayground(rooms.peer_teaching, ME, null);
    const n = agent(w, "nadani");
    expect(n.role).toBe("teacher");
    expect(n.at.x).toBeLessThan(PLACES.guestHome.x);
    expect(n.facing).toBe("left");
    expect(agent(w, ME)).toMatchObject({ role: "learner", at: PLACES.hostHome, facing: "right" });
    expect(w.concept!.state).toBe("with_teacher");
    expect(w.muse).toMatchObject({ state: "directing", target: "nadani" });
    // Agents teach each other: nobody types an explanation, not even for the demo persona.
    expect(n.doing).toBe("Teaching");
    expect(w.now.teaching).toBe("Nadani is teaching you");
  });

  it("the reverse move uses its own concept and reverses who approaches whom", () => {
    const w = projectPlayground(rooms.second_teaching, ME, null);
    const me = agent(w, ME);
    expect(me.role).toBe("teacher");
    expect(me.at.x).toBeGreaterThan(PLACES.hostHome.x);
    expect(me.facing).toBe("right");
    expect(agent(w, "nadani")).toMatchObject({ role: "learner", at: PLACES.guestHome });
    expect(w.concept).toMatchObject({ conceptId: "agent-tool-use", teacherId: ME, learnerId: "nadani" });
    expect(w.now.teaching).toBe("You are teaching Nadani");
    // Nobody types for you on your own device.
    expect(me.doing).toBe("Teaching");
  });

  it("a real second device isn't labelled as typed by the host", () => {
    const r = clone(rooms.peer_teaching);
    r.participants.find((p) => p.userId === "nadani")!.demoPersona = false;
    const w = projectPlayground(r, ME, null);
    expect(agent(w, "nadani").persona).toBe(false);
    expect(agent(w, "nadani").doing).toBe("Teaching");
  });
});

describe("world: the checkpoint is the truth", () => {
  it("checkpoint: the idea stops short of the learner's Mind; Thinketh waits for the answer", () => {
    const w = projectPlayground(rooms.transfer, ME, null);
    expect(w.concept!.state).toBe("checkpoint");
    const l = agent(w, ME).at;
    const t = agent(w, "nadani").at;
    const along = (w.concept!.at.x - t.x) / (l.x - t.x);
    expect(along).toBeLessThan(CHECKPOINT_AT);
    expect(w.checkpoint).not.toBeNull();
    expect(w.now.waitingFor).toMatch(/waiting for your answer/);
    expect(w.now.verified).toBeNull();
  });

  it("grading while the answer request is in flight: still at the checkpoint, unresolved", () => {
    const w = projectPlayground(rooms.transfer, ME, "answer");
    expect(w).toMatchObject({ phase: "grading", thinketh: "grading", now: { verified: null } });
    expect(w.concept!.state).toBe("grading");
    expect(w.concept!.at).toEqual(projectPlayground(rooms.transfer, ME, null).concept!.at);
  });

  it("verified: only then does the idea reach the learner, with the recorded numbers", () => {
    const w = projectPlayground(rooms.verified, ME, null);
    expect(w.concept!.state).toBe("verified");
    expect(w.concept!.at.x).toBeCloseTo(agent(w, ME).at.x, 5);
    const tn = rooms.verified.transfer!.transition!;
    expect(agent(w, ME).doing).toBe(`Verified: mastery ${tn.before.mastery.toFixed(2)} → ${tn.after.mastery.toFixed(2)}`);
    expect(w.now.verified).toBe(true);
  });

  it("not verified: the idea stays at the checkpoint and nothing claims a transfer", () => {
    const w = projectPlayground(rooms.not_verified, ME, null);
    expect(w.concept!.state).toBe("not_yet");
    expect(w.concept!.at).toEqual(projectPlayground(rooms.transfer, ME, null).concept!.at);
    expect(w.now.verified).toBe(false);
    expect(JSON.stringify(w)).not.toMatch(/Verified:/);
  });
});

describe("world: shared gap and source are not peer transfers", () => {
  it("shared gap: both face the shared concept; Muse directs it; no checkpoint or learner Mind", () => {
    const w = projectPlayground(rooms.shared_gap, ME, null);
    expect(w.concept).toMatchObject({ state: "shared", conceptId: rooms.shared_gap.sharedGap!.conceptId });
    expect(w.checkpoint).toBeNull();
    expect(w.learnerMind).toBeNull();
    expect(w.agents.every((a) => a.role === "together")).toBe(true);
    expect(w.muse).toMatchObject({ state: "directing", target: "concept" });
    expect(w.now.verified).toBeNull();
  });

  it("resource: one source between them, each with their own computed delta", () => {
    const w = projectPlayground(rooms.resource, ME, null);
    expect(w.concept).toMatchObject({ state: "source" });
    expect(w.checkpoint).toBeNull();
    for (const s of rooms.resource.resource!.sides) expect(agent(w, s.userId).doing).toContain(`${s.newIdeas} new ideas`);
  });
});

describe("one-time effects and stale responses", () => {
  it("a remount, reconnect or late join settles: nothing replays", () => {
    const empty = new Set<string>();
    expect(freshEffects(rooms.verified, rooms.verified.seq, empty)).toEqual({ entering: [], enterKeys: [], celebrate: null });
    expect(freshEffects(rooms.arrival, rooms.arrival.seq, empty).entering).toEqual([]);
  });

  it("a newly observed join walks in once; a newly observed verification celebrates once", () => {
    const joinedAt = rooms.arrival.events.find((e) => e.type === "participant_joined")!.seq;
    expect(freshEffects(rooms.arrival, joinedAt - 1, new Set()).entering).toEqual(["nadani"]);
    const fx = freshEffects(rooms.verified, rooms.transfer.seq, new Set());
    expect(fx.celebrate).not.toBeNull();
    expect(freshEffects(rooms.verified, rooms.transfer.seq, new Set([fx.celebrate!])).celebrate).toBeNull();
  });

  it("not verified never celebrates", () => {
    expect(freshEffects(rooms.not_verified, 0, new Set()).celebrate).toBeNull();
  });

  it("an older response can't replace a newer room; same-seq resource progress still lands", () => {
    const older = { ...clone(rooms.transfer), id: rooms.verified.id };
    expect(acceptRoom(rooms.verified, older)).toBe(rooms.verified);
    expect(acceptRoom(older, rooms.verified)).toBe(rooms.verified);
    const same = clone(rooms.verified);
    expect(acceptRoom(rooms.verified, same)).toBe(rooms.verified);
    const progressed = clone(rooms.resource);
    const before = clone(rooms.resource);
    before.resource!.sides[0]!.status = "processing";
    expect(acceptRoom(before, progressed)).toBe(progressed);
    const other = clone(rooms.arrival);
    other.id = "another-room";
    expect(acceptRoom(rooms.verified, other)).toBe(other);
  });
});

describe("session outcome", () => {
  it("counts every recorded move, so a later unverified move can't erase an earlier verified one", () => {
    const r = clone(rooms.not_verified);
    r.completedTeachings = [{ conceptId: "evaluator-architectures", conceptName: "Evaluator Architectures", teacherId: "nadani", learnerId: ME, verified: true }];
    r.transfer = { ...r.transfer!, conceptId: "agent-tool-use", learnerId: "nadani", verified: false };
    const o = sessionOutcome(r);
    expect(o.moves.map((m) => [m.learnerId, m.verified])).toEqual([[ME, true], ["nadani", false]]);
    expect(o.verifiedCount).toBe(1);
  });

  it("doesn't double-count the current transfer when it's already recorded", () => {
    const r = clone(rooms.verified);
    r.completedTeachings = [{ conceptId: r.transfer!.conceptId, conceptName: "x", teacherId: "nadani", learnerId: ME, verified: true }];
    expect(sessionOutcome(r).moves).toHaveLength(1);
  });
});
