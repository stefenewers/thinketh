import { describe, expect, it } from "vitest";
import { firstSentence, nuanceOf } from "../briefText";

describe("Development short-explanation helpers", () => {
  it("surfaces only a caveat the data marks as one", () => {
    const lines = ["Recall is scoped to the task.", "Nuance: persistent memory can entrench mistakes. A wrong fact keeps getting recalled."];
    expect(nuanceOf(lines)).toBe("Persistent memory can entrench mistakes. A wrong fact keeps getting recalled.");
    expect(nuanceOf(["Recall is scoped to the task.", "But nothing marks this line"])).toBeUndefined();
    expect(nuanceOf([])).toBeUndefined();
  });

  it("keeps the first sentence", () => {
    expect(firstSentence("You follow AI agents. It bears on your goal.")).toBe("You follow AI agents.");
    expect(firstSentence("No full stop")).toBe("No full stop");
  });
});
