/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PlaygroundRoom } from "@thinketh/contracts";
import { cuesSince, keyOf, projectRoomToWorld } from "../roomWorld";

// Real rooms captured from the local API (live Muse and Claude), one per beat.
type Beat = "arrival" | "overview" | "peer_teaching" | "transfer" | "verified" | "second_teaching" | "not_verified" | "shared_gap" | "resource";
const rooms = JSON.parse(readFileSync(join(__dirname, "fixtures/rooms.json"), "utf8")) as Record<Beat, PlaygroundRoom>;
const ME = "demo-user";
const clone = (r: PlaygroundRoom) => JSON.parse(JSON.stringify(r)) as PlaygroundRoom;

describe("projectRoomToWorld: the settled room", () => {
  it("arrival: two presences in stable places, calm: not compared, nothing moving, no Muse yet", () => {
    const w = projectRoomToWorld(rooms.arrival, ME);
    expect(w.people.map((p) => [p.label, p.side, p.persona])).toEqual([
      ["You", "left", false],
      ["Nadani", "right", true],
    ]);
    expect(w.compared).toBe(false);
    expect(w.concepts.every((c) => c.role === "quiet" && !c.changed)).toBe(true);
    expect(w.path).toBeNull();
    expect(w.muse.visible).toBe(false);
  });

  it("the room looks the same from Nadani's device (host left, guest right)", () => {
    const w = projectRoomToWorld(rooms.overview, "nadani");
    expect(w.people.find((p) => p.userId === "demo-user")?.side).toBe("left");
    expect(w.people.find((p) => p.isMe)?.label).toBe("You");
  });

  it("comparison: the teaching difference is visible, nothing has travelled", () => {
    const w = projectRoomToWorld(rooms.overview, ME);
    expect(w.path).toMatchObject({ state: "possible", progress: 0, teacherId: "nadani", learnerId: "demo-user", conceptId: "evaluator-architectures" });
    const focus = w.concepts.filter((c) => c.role === "focus");
    expect(focus.map((c) => c.side).sort()).toEqual(["left", "right"]);
    // Mirrored: the same concept faces itself across the room.
    expect(focus[0]!.x).toBeCloseTo(-focus[1]!.x, 5);
    // Height is the snapshot's mastery; nothing is invented.
    const snap = rooms.overview.snapshots.find((s) => s.userId === "nadani")!.concepts.find((c) => c.conceptId === "evaluator-architectures")!;
    expect(w.concepts.find((c) => c.key === keyOf("nadani", "evaluator-architectures"))!.height).toBeCloseTo(snap.mastery, 5);
    expect(w.muse.target).toEqual({ kind: "rest" });
  });

  it("teaching and checkpoint: Muse directs attention to the teacher; the path never completes", () => {
    for (const r of [rooms.peer_teaching, rooms.transfer]) {
      const w = projectRoomToWorld(r, ME);
      expect(w.path!.progress).toBeLessThan(1);
      expect(w.muse.target).toEqual({ kind: "concept", key: keyOf("nadani", "evaluator-architectures") });
      expect(w.concepts.some((c) => c.changed)).toBe(false);
    }
    expect(projectRoomToWorld(rooms.transfer, ME).path!.state).toBe("checkpoint");
  });

  it("grading is Thinketh's action; Muse steps back and the checkpoint stays unresolved", () => {
    const w = projectRoomToWorld(rooms.transfer, ME, "answer");
    expect(w.system.grading).toBe(true);
    expect(w.path!.state).toBe("grading");
    expect(w.path!.progress).toBeLessThan(1);
    expect(w.muse.target).toEqual({ kind: "rest" });
  });

  it("verified: the path completes and the learner's concept changes to the recorded state", () => {
    const w = projectRoomToWorld(rooms.verified, ME);
    expect(w.path).toMatchObject({ state: "verified", progress: 1 });
    const changed = w.concepts.filter((c) => c.changed);
    expect(changed.map((c) => c.key)).toEqual([keyOf("demo-user", "evaluator-architectures")]);
    expect(changed[0]!.height).toBeCloseTo(rooms.verified.transfer!.transition!.after.mastery, 2);
    expect(w.edges.some((e) => e.lit)).toBe(true);
  });

  it("not verified: stopped at the checkpoint, nothing changed, nothing lit", () => {
    const w = projectRoomToWorld(rooms.not_verified, ME);
    expect(w.path).toMatchObject({ state: "not_yet" });
    expect(w.path!.progress).toBeLessThan(w.path!.checkpointAt);
    expect(w.concepts.some((c) => c.changed)).toBe(false);
    expect(w.edges.some((e) => e.lit)).toBe(false);
  });

  it("shared gap: brought to the centre, taught by Muse to both", () => {
    const w = projectRoomToWorld(rooms.shared_gap, ME);
    expect(w.gap?.keys).toHaveLength(2);
    expect(w.muse.target).toEqual({ kind: "gap" });
    expect(w.path).toBeNull();
  });

  it("one source, two computed deltas: each side's real minutes, ideas and focus", () => {
    const w = projectRoomToWorld(rooms.resource, ME);
    expect(w.source!.claim).toBe("different");
    expect(w.source!.sides.map((s) => [s.side, s.minutes, s.ideas])).toEqual(
      rooms.resource.resource!.sides.map((s) => [s.userId === "demo-user" ? "left" : "right", s.usefulMinutes, s.newIdeas]),
    );
    expect(w.muse.target).toEqual({ kind: "source" });
  });

  it("does not manufacture a difference when the deltas match", () => {
    const r = clone(rooms.resource);
    const [a, b] = r.resource!.sides;
    Object.assign(b!, { usefulMinutes: a!.usefulMinutes, newIdeas: a!.newIdeas, focus: a!.focus });
    expect(projectRoomToWorld(r, ME).source!.claim).toBe("similar");
  });

  it("projects only permissioned snapshot data (no explanation text, Ask history or memories)", () => {
    const json = JSON.stringify(projectRoomToWorld(rooms.verified, ME));
    expect(json).not.toContain(rooms.verified.teaching!.explanation!.slice(0, 20));
    expect(json).not.toMatch(/Ask history|memories/i);
  });
});

describe("cues: newly observed actions, once", () => {
  it("a settled room has nothing to replay", () => {
    for (const r of Object.values(rooms)) expect(cuesSince(r, r.seq, ME)).toEqual([]);
  });

  it("one response with several events plays them in order", () => {
    const cues = cuesSince(rooms.transfer, rooms.peer_teaching.seq, ME);
    expect(cues.map((c) => c.kind)).toEqual(["explain", "checkpoint"]);
    expect(cues.map((c) => c.actor.kind)).toEqual(["person", "thinketh"]);
  });

  it("comparison and grading are Thinketh's, the assignment is Muse's", () => {
    const cues = cuesSince(rooms.peer_teaching, rooms.arrival.seq, ME);
    expect(cues.find((c) => c.kind === "compare")?.actor.kind).toBe("thinketh");
    expect(cues.find((c) => c.kind === "difference")?.actor.kind).toBe("thinketh");
    expect(cues.find((c) => c.kind === "assign")?.actor.kind).toBe("muse");
  });

  it("only a verified answer celebrates", () => {
    expect(cuesSince(rooms.verified, rooms.transfer.seq, ME).filter((c) => c.celebrate).map((c) => c.kind)).toEqual(["verified"]);
    expect(cuesSince(rooms.not_verified, rooms.not_verified.seq - 2, ME).some((c) => c.celebrate)).toBe(false);
  });

  it("names the planner when the deterministic conductor made the move", () => {
    const r = clone(rooms.peer_teaching);
    r.events.findLast((e) => e.type === "teacher_assigned")!.data!.by = "fallback";
    const assign = cuesSince(r, rooms.overview.seq, ME).find((c) => c.kind === "assign")!;
    expect(assign.actor).toEqual({ kind: "planner", name: "Planner" });
    expect(assign.label).toMatch(/^Planner chose Nadani to teach you/);
  });
});
