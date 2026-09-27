/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("the consumer Playground hides its plumbing", () => {
  const src = readFileSync(join(__dirname, "..", "..", "app", "playground.tsx"), "utf8");
  it("renders provenance (sync, room code) only behind the diagnostics toggle", () => {
    expect(src).toMatch(/room && showDiag \? <Provenance/);
    expect(src.match(/<Provenance /g)).toHaveLength(1);
  });
  it("does not render the one-device explanation", () => {
    const jsxText = src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\/.*$/gm, "");
    expect(jsxText).not.toMatch(/One-device mode/);
  });
  it("leads with Thinketh; the agents exchange", () => {
    expect(src).toMatch(/Learn together\.\n/);
    expect(src).not.toMatch(/Learn together with Muse/);
    expect(src).toMatch(/Your agents exchange\. Thinketh checks what they keep\./);
  });
});

describe("nothing in the Playground asks a person to answer in their own words (guided session removed 2026-09-27)", () => {
  const src = readFileSync(join(__dirname, "..", "..", "app", "playground.tsx"), "utf8");
  it("has no guided-session actions or answer inputs", () => {
    for (const gone of ["Start session", "Apply it yourself", "in your own words", "exchangeCheck", "playground.conduct", "playground.answer", "playground.explain", "playground.resource", "Use another source"]) {
      expect(src, gone).not.toContain(gone);
    }
  });
  it("the exchange is the action right after the delta", () => {
    expect(src).toMatch(/<ExchangeOffer room=\{room\} me=\{me\} busy=\{busy\} onStart=\{onExchange\} \/>/);
  });
});
