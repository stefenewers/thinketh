// Live captions for Catch Me Up, from what the ElevenLabs SDK actually reports.
// Pure (no React, no SDK) so it can be tested.
//
// Truthfulness rules:
// - With audio alignment (chars + char_start_times_ms per audio chunk), text is revealed on
//   ElevenLabs' own timings. Chunks arrive faster than they play, so each chunk starts where the
//   previous chunk's audio ends (or when it arrived, if later). Never on invented timers.
// - Without alignment, the agent's transcript for the turn is shown whole: the real words, not
//   presented as word-synchronized.
// - An interruption correction replaces the turn with what was actually said.

export type AlignmentChunk = { chars: string[]; char_start_times_ms: number[]; char_durations_ms: number[] };

type TimedChar = { ch: string; at: number };

export type CaptionState = {
  /** The agent's transcript for the current turn (from onMessage / corrections). */
  turnText: string;
  /** Characters with the wall-clock time they are spoken (from alignment). */
  timed: TimedChar[];
  /** When the audio scheduled so far in this turn finishes playing (wall clock). */
  cursor: number;
  /** The turn has ended (Thinketh stopped speaking). The next agent event starts a new one. */
  closed: boolean;
  /** The last sentence of the previous turn, briefly kept above the current one. */
  previous: string;
  /** The user's last transcribed utterance, if the SDK sent one. */
  lastUser: string;
};

export const initialCaption: CaptionState = { turnText: "", timed: [], cursor: 0, closed: true, previous: "", lastUser: "" };

export type CaptionEvent =
  | { type: "agent_message"; text: string }
  | { type: "alignment"; chunk: AlignmentChunk; receivedAt: number }
  | { type: "correction"; text: string }
  | { type: "user_message"; text: string }
  | { type: "turn_end"; now: number };

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

function openTurn(s: CaptionState, now: number): CaptionState {
  if (!s.closed) return s;
  const said = shownText(s, now);
  const last = sentences(said).at(-1) ?? "";
  return { ...s, turnText: "", timed: [], cursor: 0, closed: false, previous: last || s.previous };
}

export function reduceCaption(s: CaptionState, e: CaptionEvent): CaptionState {
  switch (e.type) {
    case "agent_message": {
      const text = clean(e.text);
      if (!text) return s;
      const next = openTurn(s, Number.POSITIVE_INFINITY);
      return { ...next, turnText: next.turnText ? `${next.turnText} ${text}` : text };
    }
    case "alignment": {
      const { chars, char_start_times_ms: starts, char_durations_ms: durations } = e.chunk;
      if (!chars?.length) return s;
      const next = openTurn(s, e.receivedAt);
      // This chunk plays after the audio already queued, not the moment it arrived.
      const start = Math.max(e.receivedAt, next.cursor);
      const add: TimedChar[] = chars.map((ch, i) => ({ ch, at: start + (starts[i] ?? 0) }));
      const last = chars.length - 1;
      const end = start + (starts[last] ?? 0) + (durations?.[last] ?? 0);
      return { ...next, timed: [...next.timed, ...add], cursor: Math.max(next.cursor, end) };
    }
    case "correction": {
      const text = clean(e.text);
      if (!text) return s;
      // What was actually spoken before the interruption, shown whole: slicing the timed characters
      // by length could cut a word in half (their spacing differs from the corrected text's).
      return { ...s, turnText: text, timed: [] };
    }
    case "user_message": {
      const text = clean(e.text);
      return text ? { ...s, lastUser: text } : s;
    }
    case "turn_end":
      return s.closed ? s : { ...s, closed: true, timed: s.timed.map((c) => (c.at > e.now ? { ...c, at: e.now } : c)) };
  }
}

/** What the caption shows right now. Aligned chars revealed by their spoken time; else the transcript. */
export function shownText(s: CaptionState, now: number): string {
  if (s.timed.length) {
    let out = "";
    for (const c of s.timed) {
      if (c.at > now) break;
      out += c.ch;
    }
    return clean(out);
  }
  return s.turnText;
}

/** Is more aligned text still to be revealed (so the caption needs another tick)? */
export function pendingReveal(s: CaptionState, now: number): boolean {
  return s.timed.length > 0 && s.timed[s.timed.length - 1]!.at > now;
}

/** Whether the words on screen are timed to the audio (true) or the whole transcript (false). */
export const isAligned = (s: CaptionState) => s.timed.length > 0;

export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

const MAX_CURRENT = 220;

/** The two lines the screen shows: the sentence being spoken, and the one before it. */
export function captionLines(s: CaptionState, now: number): { current: string; previous: string } {
  const all = sentences(shownText(s, now));
  let current = all.at(-1) ?? "";
  const previous = all.length > 1 ? all.at(-2)! : s.closed ? "" : s.previous;
  if (current.length > MAX_CURRENT) current = `…${current.slice(-MAX_CURRENT).replace(/^\S*\s/, "")}`;
  return { current, previous };
}

/** Completed sentences only: what a screen reader should announce (never every character). */
export function lastCompleteSentence(s: CaptionState, now: number): string {
  const text = shownText(s, now);
  const all = sentences(text);
  if (!all.length) return "";
  const endsClean = /[.!?]$/.test(text);
  return endsClean ? all.at(-1)! : (all.at(-2) ?? "");
}
