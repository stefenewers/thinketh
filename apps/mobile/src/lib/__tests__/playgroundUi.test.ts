/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { deltaClaim } from "../resourceDelta";

describe("same source, different delta: only when it's true", () => {
  const ready = (newIdeas: number, usefulMinutes: number, focus?: string) => ({ status: "ready" as const, newIdeas, usefulMinutes, focus });
  it("says nothing while either Mind is still being read", () => {
    expect(deltaClaim([ready(5, 6, "evaluators"), { status: "processing", newIdeas: 0 }])).toBe("reading");
  });
  it("claims different only when minutes, ideas or focus actually differ", () => {
    expect(deltaClaim([ready(5, 6, "evaluator architectures"), ready(5, 6, "agent tool use")])).toBe("different");
    expect(deltaClaim([ready(5, 6), ready(2, 6)])).toBe("different");
    expect(deltaClaim([ready(5, 6.2, "x"), ready(5, 5.9, "X")])).toBe("similar");
  });
  it("never claims a difference against a failed read", () => {
    expect(deltaClaim([ready(5, 6, "x"), { status: "failed", newIdeas: 0 }])).toBe("similar");
  });
});

describe("the consumer Playground hides its plumbing", () => {
  const src = readFileSync(join(__dirname, "..", "..", "app", "playground.tsx"), "utf8");
  it("renders provenance (conductor, sync, room code) only behind the diagnostics toggle", () => {
    expect(src).toMatch(/room && showDiag \? <Provenance/);
    expect(src.match(/<Provenance /g)).toHaveLength(1);
  });
  it("does not render the one-device explanation", () => {
    const jsxText = src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\/.*$/gm, "");
    expect(jsxText).not.toMatch(/One-device mode/);
  });
  it("leads with Thinketh; Muse is the conductor", () => {
    expect(src).toMatch(/Learn together\.\n/);
    expect(src).not.toMatch(/Learn together with Muse/);
    expect(src).toMatch(/Muse conducts the room\./);
  });
});
