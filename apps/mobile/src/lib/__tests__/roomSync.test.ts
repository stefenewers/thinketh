import { describe, expect, it } from "vitest";
import type { PlaygroundRoom } from "@thinketh/contracts";
import { acceptRoom } from "../roomSync";

const room = (seq: number, step?: number, pending?: string): PlaygroundRoom =>
  ({
    id: "r1",
    seq,
    ...(step === undefined
      ? {}
      : { exchange: { id: "exc1", step, status: "running", ...(pending ? { pending: { actor: "coordinator", label: pending } } : {}) } }),
  }) as unknown as PlaygroundRoom;

describe("acceptRoom", () => {
  it("keeps the newer room by seq", () => {
    const a = room(5);
    expect(acceptRoom(a, room(4))).toBe(a);
  });

  it("takes an agent exchange that moved on without a new room event", () => {
    const a = room(5, 0);
    const b = room(5, 1);
    expect(acceptRoom(a, b)).toBe(b);
    const c = room(5, 1, "Stefen's agent is responding");
    expect(acceptRoom(b, c)).toBe(c);
  });

  it("never lets an older exchange step replace a newer one", () => {
    const newer = room(5, 3);
    expect(acceptRoom(newer, room(5, 2))).toBe(newer);
  });
});
