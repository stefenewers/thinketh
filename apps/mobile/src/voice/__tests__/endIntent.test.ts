import { describe, expect, it } from "vitest";
import { isEndIntent, isStopTalkingIntent } from "../endIntent";

describe("end-of-call intent", () => {
  it.each([
    "end",
    "End.",
    "finish",
    "Finish.",
    "that's enough",
    "Okay, that's enough, thanks.",
    "That is enough for now.",
    "That's all for today",
    "that's it",
    "end the call",
    "Can you end the call?",
    "Could we stop here?",
    "Please end this session.",
    "stop the catch up",
    "hang up",
    "I'm done",
    "We're done here, thank you.",
    "I'm good for now",
    "let's wrap up",
    "Let's call it",
    "wrap it up",
    "goodbye",
    "bye bye",
    "Alright, talk to you later",
    "no more, thanks",
    "done",
    "Yeah I think we're finished",
  ])("ends on: %s", (t) => {
    expect(isEndIntent(t)).toBe(true);
  });

  it.each([
    "",
    "Don't stop, keep going.",
    "I'm not done yet",
    "Do not end the call, I have a question",
    "What happens at the end of a session?",
    "How does memory end up stale?",
    "Is the evaluator finished before the commit?",
    "Tell me more about how agents finish long tasks",
    "Keep going",
    "What changed with MCP?",
    "When do we stop trusting a stored fact?",
    "The end state of the agent matters to me because of retries and memory",
    "Before we finish, what about retrieval?",
    "Explain why that is enough evidence",
    "stop",
    "Stop talking.",
    "Okay, stop. Thanks.",
  ])("keeps talking on: %s", (t) => {
    expect(isEndIntent(t)).toBe(false);
  });
});

describe("stop-talking intent (silence this reply, keep the conversation)", () => {
  it.each(["stop", "Stop talking.", "Okay, stop. Thanks.", "Hold on", "wait a second", "Please be quiet", "Thinketh, stop speaking please", "shh"])("silences on: %s", (t) => {
    expect(isStopTalkingIntent(t)).toBe(true);
  });
  it.each(["End the conversation", "goodbye", "Stop the catch up", "Why did retrieval stop working?", "Wait, what changed with MCP?", "Don't stop", "stop trusting stale memory"])(
    "does not silence on: %s",
    (t) => {
      expect(isStopTalkingIntent(t)).toBe(false);
    },
  );
});
