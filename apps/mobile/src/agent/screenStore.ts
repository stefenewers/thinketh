// What the user is looking at, for the voice agent. Each screen publishes a small, typed context
// while it is focused; leaving the screen replaces it. A reference only: tool handlers re-fetch
// anything authoritative through the authenticated API. Pure (no React), so it can be tested;
// the hook screens use lives in ./screenContext.
import type { AgentScreenContext } from "@thinketh/contracts";

/** Where the floating "Talk to Thinketh" entry goes on this screen. "inline": the screen has its own (Ask's composer). */
export type AgentEntry = "float" | "inline" | "none";
export type PublishedScreen = AgentScreenContext & { entry: AgentEntry; publishedAt: number };

let current: PublishedScreen | null = null;
let token = 0;
const listeners = new Set<(s: PublishedScreen | null) => void>();

function emit() {
  for (const l of listeners) l(current);
}

export function getScreen(): PublishedScreen | null {
  return current;
}

export function subscribeScreen(fn: (s: PublishedScreen | null) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Publish a context; returns a token so the publisher only clears its own context. */
export function publishScreen(ctx: AgentScreenContext, entry: AgentEntry = "float"): number {
  current = { ...ctx, entry, publishedAt: Date.now() };
  emit();
  return ++token;
}

export function clearScreen(mine: number): void {
  if (mine !== token) return; // another screen already replaced it
  current = null;
  emit();
}

/** Resolves with the first context matching `pred` (including the current one), or null after `ms`. */
export function waitForScreen(pred: (s: PublishedScreen) => boolean, ms: number): Promise<PublishedScreen | null> {
  if (current && pred(current)) return Promise.resolve(current);
  return new Promise((resolve) => {
    const unsub = subscribeScreen((s) => {
      if (s && pred(s)) {
        clearTimeout(timer);
        unsub();
        resolve(s);
      }
    });
    const timer = setTimeout(() => {
      unsub();
      resolve(null);
    }, ms);
  });
}

/** The context as the agent reads it: a few plain lines. Replaces any earlier screen context. */
export function describeScreen(s: AgentScreenContext | null): string {
  if (!s) return "[Screen context] The user is on a screen with nothing to share. Earlier screen context no longer applies.";
  const lines = [`[Screen context — replaces any earlier screen context] The user is on ${SCREEN_NAMES[s.screen]}${s.title ? `: "${s.title}"` : ""}.`];
  if (s.focus) lines.push(`"This" refers to the ${s.focus.kind} "${s.focus.label}" (id ${s.focus.id}).`);
  else lines.push(`Nothing specific is selected, so "this" means the screen as a whole.`);
  if (s.visible?.length) lines.push(`Visible: ${s.visible.join(" · ")}`);
  if (s.room) {
    lines.push(`Playground room: ${s.room.participants} participant(s), scene "${s.room.scene}".`);
    if (s.room.assessing)
      lines.push(
        "A human answer is about to count as evidence. Help only with navigation and how the screen works; do not hint at, coach or evaluate the answer, and do not describe any rubric.",
      );
  }
  return lines.join("\n");
}

export const SCREEN_NAMES: Record<AgentScreenContext["screen"], string> = {
  today: "Today",
  learn: "Learn",
  mind: "their Mind",
  ask: "Ask",
  explore: "Explore",
  development: "a development",
  resource: "a saved source",
  storyline: "a storyline",
  visualize: "a visualization",
  playground: "the Playground",
  catch_up: "Catch Me Up",
  other: "another screen",
};
