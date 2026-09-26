/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { captionLines, initialCaption, isAligned, lastCompleteSentence, pendingReveal, reduceCaption, shownText, type CaptionEvent, type CaptionState } from "../captionState";
import { aliasesFor, matchConcept, nextFocus, type FocusConcept } from "../conceptFocus";
import { neighbourhood, USER_HOLD_MS, voicePhase } from "../voiceVisualState";

const run = (events: CaptionEvent[], from: CaptionState = initialCaption) => events.reduce(reduceCaption, from);
const align = (text: string, receivedAt: number, stepMs = 50): CaptionEvent => ({
  type: "alignment",
  receivedAt,
  chunk: { chars: [...text], char_start_times_ms: [...text].map((_, i) => i * stepMs), char_durations_ms: [...text].map(() => stepMs) },
});

describe("captions", () => {
  it("shows the agent transcript whole when there is no alignment, and says so", () => {
    const s = run([{ type: "agent_message", text: "Memory changed this week. It now persists." }]);
    expect(shownText(s, 0)).toBe("Memory changed this week. It now persists.");
    expect(isAligned(s)).toBe(false);
    expect(captionLines(s, 0)).toEqual({ current: "It now persists.", previous: "Memory changed this week." });
  });

  it("reveals aligned text on ElevenLabs' own timings, not before", () => {
    const s = run([align("Hello there.", 1000, 100)]);
    expect(shownText(s, 999)).toBe("");
    expect(shownText(s, 1000 + 4 * 100)).toBe("Hello");
    expect(pendingReveal(s, 1000 + 4 * 100)).toBe(true);
    expect(shownText(s, 1000 + 11 * 100)).toBe("Hello there.");
    expect(pendingReveal(s, 1000 + 11 * 100)).toBe(false);
  });

  it("an interruption correction keeps only what was actually said", () => {
    const s = run([{ type: "agent_message", text: "Memory now persists across sessions and more." }, align("Memory now persists across sessions and more.", 0, 10), { type: "correction", text: "Memory now persists" }]);
    expect(shownText(s, 10_000)).toBe("Memory now persists");
  });

  it("a new turn keeps the last sentence of the previous one, then drops it once the turn has its own", () => {
    let s = run([{ type: "agent_message", text: "First idea. Second idea." }, { type: "turn_end", now: 0 }]);
    s = run([{ type: "agent_message", text: "A new answer" }], s);
    expect(captionLines(s, 0)).toEqual({ current: "A new answer", previous: "Second idea." });
    s = run([{ type: "agent_message", text: "is here. Then more." }], s);
    expect(captionLines(s, 0)).toEqual({ current: "Then more.", previous: "A new answer is here." });
  });

  it("does not accumulate a giant transcript: at most two sentences, long ones trimmed", () => {
    const long = `${"word ".repeat(80).trim()}.`;
    const s = run([{ type: "agent_message", text: `One. Two. Three. ${long}` }]);
    const { current, previous } = captionLines(s, 0);
    expect(previous).toBe("Three.");
    expect(current.length).toBeLessThanOrEqual(222);
    expect(current.startsWith("…")).toBe(true);
  });

  it("screen readers get finished sentences only", () => {
    const s = run([align("Done here. Still talki", 0, 1)]);
    expect(lastCompleteSentence(s, 1_000)).toBe("Done here.");
  });

  it("queues chunks that arrive early: the second starts when the first chunk's audio ends", () => {
    // Two 1-second chunks arrive 50 ms apart (ElevenLabs sends audio ahead of playback).
    const s = run([align("One two. ", 1000, 100), align("Three four.", 1050, 100)]);
    // Chunk one is 9 chars x 100 ms: it plays until 1900. Chunk two must not start before that.
    expect(shownText(s, 1850)).toBe("One two.");
    expect(shownText(s, 1900 + 4 * 100)).toBe("One two. Three");
    expect(shownText(s, 1900 + 11 * 100)).toBe("One two. Three four.");
  });

  it("a chunk that arrives late starts when it arrives", () => {
    const s = run([align("Hi. ", 0, 100), align("Later.", 5000, 100)]);
    expect(shownText(s, 4999)).toBe("Hi.");
    expect(shownText(s, 5000 + 6 * 100)).toBe("Hi. Later.");
  });

  it("an interruption correction never cuts a word in half", () => {
    const s = run([align("Scoped  recall matters here.", 0, 10), { type: "correction", text: "Scoped recall matters" }]);
    expect(shownText(s, 10_000)).toBe("Scoped recall matters");
  });

  it("keeps the user's last utterance for the listening state", () => {
    expect(run([{ type: "user_message", text: "  what about MCP? " }]).lastUser).toBe("what about MCP?");
  });
});

const CONCEPTS: FocusConcept[] = [
  { id: "agent-memory", name: "Agent Memory", short: "Agent Memory" },
  { id: "context-windows", name: "Context Windows", short: "Context" },
  { id: "retrieval", name: "Retrieval (RAG)", short: "Retrieval" },
  { id: "mcp", name: "Model Context Protocol", short: "MCP" },
  { id: "evaluator-architectures", name: "Evaluator Architectures", short: "Evaluators" },
];

describe("concept focus", () => {
  it("matches names, singular forms, acronyms and short labels", () => {
    expect(matchConcept("How agent memory works", CONCEPTS)).toBe("agent-memory");
    expect(matchConcept("a larger context window", CONCEPTS)).toBe("context-windows");
    expect(matchConcept("classic RAG pipelines", CONCEPTS)).toBe("retrieval");
    expect(matchConcept("servers speaking MCP", CONCEPTS)).toBe("mcp");
    expect(matchConcept("separate evaluators", CONCEPTS)).toBe("evaluator-architectures");
  });

  it("the latest mention wins: attention follows the sentence", () => {
    expect(matchConcept("Unlike a context window, agent memory persists", CONCEPTS)).toBe("agent-memory");
  });

  it("does not match generic single words or partial words", () => {
    expect(matchConcept("in this context the model decided", CONCEPTS)).toBeNull();
    expect(matchConcept("the drag of it", CONCEPTS)).toBeNull();
    expect(aliasesFor(CONCEPTS[1]!).map((a) => a.phrase)).not.toContain("Context");
  });

  it("no confident match keeps the current focus, and never invents one", () => {
    expect(nextFocus("mcp", "Let's keep going.", CONCEPTS)).toBe("mcp");
    expect(nextFocus(null, "Let's keep going.", CONCEPTS)).toBeNull();
  });
});

describe("visual state", () => {
  it("derives connecting, speaking, user and listening", () => {
    expect(voicePhase({ connected: false, isSpeaking: false, lastUserVoiceAt: null, now: 0 })).toBe("connecting");
    expect(voicePhase({ connected: true, isSpeaking: true, lastUserVoiceAt: 0, now: 10 })).toBe("speaking");
    expect(voicePhase({ connected: true, isSpeaking: false, lastUserVoiceAt: 1000, now: 1000 + USER_HOLD_MS - 1 })).toBe("user");
    expect(voicePhase({ connected: true, isSpeaking: false, lastUserVoiceAt: 1000, now: 1000 + USER_HOLD_MS })).toBe("listening");
  });

  it("the neighbourhood is the focus, its links, then second-degree, capped and deterministic", () => {
    const edges = [
      { from: "a", to: "b", weight: 0.9 },
      { from: "a", to: "c", weight: 0.5 },
      { from: "b", to: "d", weight: 0.7 },
      { from: "x", to: "y", weight: 1 },
    ];
    expect(neighbourhood("a", edges)).toEqual(["a", "b", "c", "d"]);
    expect(neighbourhood("a", edges, 2)).toEqual(["a", "b"]);
  });
});

describe("safety: voice visuals are presentation only", () => {
  const files = ["LiveBriefingCanvas.tsx", "VoiceMindprint.tsx", "LiveCaption.tsx", "captionState.ts", "conceptFocus.ts", "voiceVisualState.ts"];
  it.each(files)("%s never imports the API client (so it cannot write knowledge state)", (f) => {
    const src = readFileSync(join(__dirname, "..", f), "utf8");
    expect(src).not.toMatch(/from ["']@\/api["']/);
    expect(src).not.toMatch(/\bapi\.(answer|feedback|observe|ask|teach|diagnostic)/i);
  });
});
