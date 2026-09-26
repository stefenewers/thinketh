/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PlaygroundRoom } from "@thinketh/contracts";
import { PATH_PROGRESS, railSteps, stageState } from "../roomStory";

// Real rooms captured from the local API (live Muse), at each beat of one exchange.
const rooms = JSON.parse(readFileSync(join(__dirname, "fixtures/rooms.json"), "utf8")) as Record<
  "overview" | "peer_teaching" | "transfer" | "verified" | "second_teaching" | "not_verified",
  PlaygroundRoom
>;

describe("the room canvas follows the room, not a timer", () => {
  it("overview: the difference Thinketh found, nothing travelling yet", () => {
    const s = stageState(rooms.overview, null);
    expect(s.beat).toBe("found");
    expect(s.conceptId).toBe("evaluator-architectures");
    expect(s.teacherId).toBe("nadani");
    expect(s.learnerId).toBe("demo-user");
    expect(PATH_PROGRESS[s.beat]).toBe(0);
  });

  it("teaching and checkpoint never complete the path", () => {
    expect(stageState(rooms.peer_teaching, null).beat).toBe("teaching");
    expect(stageState(rooms.transfer, null).beat).toBe("checkpoint");
    expect(stageState(rooms.transfer, "answer").beat).toBe("grading");
    for (const b of ["teaching", "checkpoint", "grading", "not_yet"] as const) expect(PATH_PROGRESS[b]).toBeLessThan(1);
  });

  it("only a verified answer completes the path; a weak one stops at the checkpoint", () => {
    expect(stageState(rooms.verified, null).beat).toBe("verified");
    expect(PATH_PROGRESS.verified).toBe(1);
    const weak = stageState(rooms.not_verified, null);
    expect(weak.beat).toBe("not_yet");
    expect(PATH_PROGRESS[weak.beat]).toBe(PATH_PROGRESS.checkpoint);
  });

  it("a request in flight is shown as waiting, not as a result", () => {
    expect(stageState(rooms.overview, "conduct").waiting).toBe("muse");
    expect(stageState(rooms.overview, "conduct").beat).toBe("found");
  });

  it("the same room always gives the same picture (refetch / remount safe)", () => {
    const again = JSON.parse(JSON.stringify(rooms.verified)) as PlaygroundRoom;
    expect(stageState(again, null)).toEqual(stageState(rooms.verified, null));
    expect(railSteps(again, null)).toEqual(railSteps(rooms.verified, null));
  });

  it("the second planned move is a different concept, with its own teacher", () => {
    const s = stageState(rooms.second_teaching, null);
    expect(s.beat).toBe("teaching");
    expect(s.conceptId).toBe("agent-tool-use");
    expect(s.teacherId).toBe("demo-user");
  });
});

describe("'What just happened' is the recorded sequence", () => {
  const labels = (r: PlaygroundRoom, p: Parameters<typeof railSteps>[1] = null) => railSteps(r, p).map((s) => `${s.state}:${s.actor}:${s.label}`);

  it("credits Thinketh with the comparison, never Muse", () => {
    const [found] = railSteps(rooms.overview, null);
    expect(found).toMatchObject({ actor: "Thinketh", state: "done" });
    const compare = rooms.overview.events.find((e) => e.type === "compare_started");
    expect(compare?.actor).toBe("thinketh");
  });

  it("walks the exchange: assigned → explained → asked → verified → updated", () => {
    expect(labels(rooms.peer_teaching)).toEqual([
      "done:Thinketh:Found a teaching gap",
      "done:Muse:Assigned Nadani",
      "current:Nadani:Explains",
      "pending:Thinketh:Transfer check",
      "pending:Stefen:Answers",
      "pending:Thinketh:Mind updates",
    ]);
    expect(labels(rooms.verified).slice(-3)).toEqual(["done:Thinketh:Asked for transfer", "done:Thinketh:Answer verified", "done:Thinketh:Mind updated"]);
    const updated = railSteps(rooms.verified, null).at(-1)!;
    expect(updated.detail).toMatch(/mastery \d\.\d\d → \d\.\d\d/);
  });

  it("a weak answer is recorded, not verified", () => {
    expect(labels(rooms.not_verified).slice(-2)).toEqual(["done:Thinketh:Not verified yet", "done:Thinketh:Recorded, not verified"]);
  });

  it("names the planner honestly when Muse couldn't act", () => {
    const r = JSON.parse(JSON.stringify(rooms.peer_teaching)) as PlaygroundRoom;
    const ev = r.events.findLast((e) => e.type === "teacher_assigned")!;
    ev.data = { ...ev.data, by: "fallback" };
    const step = railSteps(r, null)[1]!;
    expect(step.actor).toBe("Planner");
    expect(step.detail).toMatch(/deterministic planner/);
    expect(stageState(r, null).conductedBy).toBe("planner");
  });

  it("while Muse is choosing, that is the one current step", () => {
    const steps = railSteps(rooms.overview, "conduct");
    expect(steps.filter((s) => s.state === "current")).toHaveLength(1);
    expect(steps[1]).toMatchObject({ state: "current", label: "Choosing the next move…" });
  });
});
