// What Grokbot is doing, projected only from the room's recorded challenge. Nothing is shown before it
// happened: "…" only while Grokbot's own call is in flight, a line only once it was delivered, an outcome
// only once it was persisted (status "completed").
import type { PlaygroundRoom, TakeawayChallenge } from "@thinketh/contracts";

export type GrokbotView = {
  /** In the room: arrived for this challenge and hasn't left. */
  present: boolean;
  /** The challenge it came for (a new id means a new arrival). */
  challengeId: string | null;
  /** Grokbot's own model call is in flight right now. */
  working: boolean;
  /** Grokbot's latest delivered line (short). */
  say: string | null;
  /** The defending agent's call is in flight, or its latest delivered line. */
  defender: { userId: string; working: boolean; say: string | null } | null;
  /** One line for the room's status. */
  status: string;
};

const BUBBLE = 110;
export const short = (s: string, n = BUBBLE) => (s.length > n ? `${s.slice(0, n - 3).trimEnd()}…` : s);

export const FINDING_LABEL: Record<NonNullable<TakeawayChallenge["finding"]>["kind"], string> = {
  objection: "an objection",
  qualification: "a missing qualification",
  counterexample: "a counterexample",
  insufficient_evidence: "that the evidence is too thin to assess it",
  no_issue: "no clear issue",
};

export const ENDED: Partial<Record<TakeawayChallenge["status"], string>> = {
  stopped: "Stopped",
  timed_out: "Grokbot ran out of time",
  unavailable: "Grokbot is unavailable",
  failed: "The challenge couldn't finish",
  stale: "The takeaway changed meanwhile",
  interrupted: "Interrupted",
};

export function projectGrokbot(room: PlaygroundRoom | null): GrokbotView {
  const ch = room?.challenge;
  if (!room || !ch || room.scene !== "agent_exchange") return { present: false, challengeId: null, working: false, say: null, defender: null, status: "" };
  const running = ch.status === "running";
  // It leaves when a challenge ends without a result; with a result it stays beside it.
  const present = running || ch.status === "completed";
  const working = running && ch.pending?.actor === "grokbot";
  const lastGrok = [...ch.messages].reverse().find((m) => m.from === "grokbot");
  const say = working ? null : lastGrok ? short(lastGrok.kind === "assessment" || lastGrok.kind === "clarification" ? lastGrok.text : (ch.finding?.say ?? lastGrok.text)) : null;
  const defenderWorking = running && ch.pending?.actor === `agent:${ch.defenderId}`;
  const last = ch.messages.at(-1);
  const defenderSay = !defenderWorking && last && last.from === ch.defenderId ? short(last.text) : null;
  const status = running
    ? ch.pending
      ? `${ch.pending.label}…`
      : "Waiting for the next step"
    : ch.status === "completed"
      ? (ch.outcome?.headline ?? "Done")
      : (ENDED[ch.status] ?? "Ended");
  return {
    present,
    challengeId: ch.id,
    working,
    say,
    defender: defenderWorking || defenderSay ? { userId: ch.defenderId, working: defenderWorking, say: defenderSay } : null,
    status,
  };
}
