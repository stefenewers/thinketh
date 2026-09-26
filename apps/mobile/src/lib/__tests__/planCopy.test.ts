/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatMinutes, planSummary } from "../planSummary";

const plan = (n: number, budgetMinutes = 7) => ({ budgetMinutes, items: Array.from({ length: n }, () => ({ done: false })) });

describe("plan summary: the budget is a planning constraint, not a countdown", () => {
  it("uses the real item count and the real budget", () => {
    expect(planSummary(plan(3))).toBe("3 learning moves planned for the next 7 minutes");
    expect(planSummary(plan(2, 5))).toBe("2 learning moves planned for the next 5 minutes");
  });
  it("pluralizes correctly", () => {
    expect(planSummary(plan(1))).toBe("1 learning move planned for the next 7 minutes");
    expect(planSummary(plan(1, 1))).toBe("1 learning move planned for the next 1 minute");
  });
  it("says nothing when there is no plan", () => {
    expect(planSummary(undefined)).toBeNull();
    expect(planSummary(null)).toBeNull();
    expect(planSummary(plan(0))).toBeNull();
  });
  it("shows estimates without fake precision", () => {
    expect(formatMinutes(2.5)).toBe("2½ min");
    expect(formatMinutes(2)).toBe("2 min");
    expect(formatMinutes(7, false)).toBe("7 minutes");
  });
});

describe("Playground copy and behaviour", () => {
  const src = readFileSync(join(__dirname, "..", "..", "app", "playground.tsx"), "utf8");
  it("the CTA is 'Start session', never a seven-minute session", () => {
    expect(src).toMatch(/<Pill label="Start session"/);
    expect(src).not.toMatch(/-minute session/);
  });
  it("has no timer, countdown or remaining-time state", () => {
    const code = src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(/countdown|minutes remaining|timeLeft|remainingMinutes|elapsed/i);
  });
  it("offers 'View learning plan' over the real plan items only, and lets you end after any move", () => {
    expect(src).toMatch(/View learning plan/);
    expect(src).toMatch(/plan\.items\.map\(/);
    expect(src).toMatch(/onEnd=\{\(\) => run\("conduct", \(\) => playground\.conduct\(room\.id, "end", me\)\)\}\n\s+\/>/);
  });
});
