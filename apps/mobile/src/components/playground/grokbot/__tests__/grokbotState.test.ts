/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PlaygroundRoom } from "@thinketh/contracts";
import { projectGrokbot } from "../grokbotState";

// Real rooms captured from a live run (Muse agents, Claude checks, Grokbot on xAI grok-4.7):
// packages/intelligence/scripts/verify-grokbot.ts --dump.
const live = JSON.parse(readFileSync(join(__dirname, "../fixtures/challenge-rooms.json"), "utf8")) as Record<string, PlaygroundRoom>;
const clone = (r: PlaygroundRoom) => JSON.parse(JSON.stringify(r)) as PlaygroundRoom;

describe("Grokbot in the room: only what was recorded", () => {
  it("is absent before any challenge, and outside the exchange scene", () => {
    expect(projectGrokbot(live.exchange_done!).present).toBe(false);
    const r = clone(live.overbroad_done!);
    r.scene = "overview";
    expect(projectGrokbot(r).present).toBe(false);
  });

  it("arrives with the challenge; says nothing until something was delivered", () => {
    const v = projectGrokbot(live.overbroad_started!);
    expect(v.present).toBe(true);
    expect(v.say).toBeNull();
    // "…" only while its own call is actually in flight.
    const r = clone(live.overbroad_started!);
    r.challenge!.pending = { actor: "grokbot", label: "Grokbot is examining the takeaway" };
    expect(projectGrokbot(r)).toMatchObject({ working: true, say: null, status: "Grokbot is examining the takeaway…" });
  });

  it("speaks its delivered line; the defending agent is 'working' only while its call is in flight", () => {
    const r = clone(live.overbroad_challenged!);
    const v = projectGrokbot(r);
    expect(v.say).toBe(r.challenge!.finding!.say);
    expect(v.defender).toBeNull();
    r.challenge!.pending = { actor: `agent:${r.challenge!.defenderId}`, label: "Your agent is responding" };
    expect(projectGrokbot(r).defender).toMatchObject({ working: true, say: null });
  });

  it("shows an outcome only once completed (persisted), and leaves when a challenge ends without one", () => {
    const done = projectGrokbot(live.overbroad_done!);
    expect(live.overbroad_done!.challenge!.status).toBe("completed");
    expect(done.status).toBe(live.overbroad_done!.challenge!.outcome!.headline);
    const r = clone(live.overbroad_challenged!);
    r.challenge!.status = "unavailable";
    expect(projectGrokbot(r).present).toBe(false);
    expect(projectGrokbot(r).status).toBe("Grokbot is unavailable");
  });
});
