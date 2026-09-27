/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PlaygroundRoom } from "@thinketh/contracts";
import { acceptRoom } from "../../../../lib/roomSync";
import { freshEffects, PLACES, projectPlayground } from "../worldState";

// Real rooms captured from the local API (live Muse and Claude). The guided-session beats in rooms.json
// (peer_teaching, transfer, ...) are rooms stored before that flow was removed on 2026-09-27.
type Beat = "arrival" | "overview" | "peer_teaching" | "transfer" | "verified" | "second_teaching" | "not_verified" | "shared_gap" | "resource";
const rooms = JSON.parse(readFileSync(join(__dirname, "../../../../lib/__tests__/fixtures/rooms.json"), "utf8")) as Record<Beat, PlaygroundRoom>;
const live = JSON.parse(readFileSync(join(__dirname, "../../grokbot/fixtures/challenge-rooms.json"), "utf8")) as Record<string, PlaygroundRoom>;
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

  it("comparing is Thinketh's action while the request is in flight; Muse isn't in the room", () => {
    const w = projectPlayground(rooms.arrival, ME, "compare");
    expect(w.phase).toBe("comparing");
    expect(w.thinketh).toBe("comparing");
    expect(w.muse.state).toBe("absent");
  });

  it("overview: the strongest teachable difference sits between them, offered, not moving", () => {
    const w = projectPlayground(rooms.overview, ME, null);
    expect(w.concept).toMatchObject({ state: "offered", teacherId: "nadani", learnerId: ME, conceptId: "evaluator-architectures" });
    expect(w.concept!.at.x).toBeCloseTo(0.5, 5);
    expect(w.muse.state).toBe("absent");
    expect(agent(w, "nadani").doing).toBe("Can teach you");
  });

  it("a room stored mid guided session (removed) is shown as the overview, never as a transfer", () => {
    for (const beat of ["peer_teaching", "transfer", "verified", "not_verified", "shared_gap", "resource"] as const) {
      const w = projectPlayground(rooms[beat], ME, null);
      expect(w.phase, beat).toBe("overview");
      expect(w.concept?.state ?? "offered", beat).toBe("offered");
    }
  });
});

describe("world: the agent exchange", () => {
  it("the teaching agent approaches; once a takeaway is saved the idea is shared", () => {
    const r = live.exchange_done!;
    const w = projectPlayground(r, ME, null);
    expect(w.phase).toBe("exchange");
    const ex = r.exchange!;
    expect(agent(w, ex.teacherId).role).toBe("teacher");
    expect(agent(w, ex.learnerId).role).toBe("learner");
    expect(w.concept).toMatchObject({ state: "shared", conceptId: ex.conceptId });
    expect(agent(w, ex.learnerId).doing).toBe("Its agent retained a sourced takeaway");
    expect(w.muse.state).toBe("resting");
  });

  it("while it runs the idea stays with the teaching agent", () => {
    const r = clone(live.exchange_done!);
    r.exchange = { ...r.exchange!, status: "running" };
    delete r.exchange.savedTakeawayId;
    const w = projectPlayground(r, ME, null);
    expect(w.concept!.state).toBe("with_teacher");
    expect(w.muse.state).not.toBe("absent");
  });
});

describe("one-time effects and stale responses", () => {
  it("a remount, reconnect or late join settles: nothing replays", () => {
    const empty = new Set<string>();
    expect(freshEffects(rooms.arrival, rooms.arrival.seq, empty)).toEqual({ entering: [], enterKeys: [] });
  });

  it("a newly observed join walks in once", () => {
    const joinedAt = rooms.arrival.events.find((e) => e.type === "participant_joined")!.seq;
    const fx = freshEffects(rooms.arrival, joinedAt - 1, new Set());
    expect(fx.entering).toEqual(["nadani"]);
    expect(freshEffects(rooms.arrival, joinedAt - 1, new Set(fx.enterKeys)).entering).toEqual([]);
  });

  it("an older response can't replace a newer room", () => {
    const older = { ...clone(rooms.arrival), id: rooms.overview.id };
    expect(acceptRoom(rooms.overview, older)).toBe(rooms.overview);
    expect(acceptRoom(older, rooms.overview)).toBe(rooms.overview);
    expect(acceptRoom(rooms.overview, clone(rooms.overview))).toBe(rooms.overview);
    const other = clone(rooms.arrival);
    other.id = "another-room";
    expect(acceptRoom(rooms.overview, other)).toBe(other);
  });
});
