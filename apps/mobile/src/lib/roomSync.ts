// Which room response wins. Polls, realtime refetches and action responses can land out of order;
// the server's seq orders them. A slower, older response must never replace a newer room.
import type { PlaygroundRoom } from "@thinketh/contracts";

const resourceKey = (r: PlaygroundRoom) => r.resource?.sides.map((s) => `${s.status}:${s.stage ?? ""}`).join("|") ?? "";

type Stepped = { id: string; step: number; status: string; pending?: { label: string } } | undefined;

/** An agent exchange or a Grokbot challenge moves by step (pending work changes it without a room event). */
const stepAhead = (a: Stepped, b: Stepped) => {
  if (!b) return false;
  if (!a || a.id !== b.id) return true;
  return b.step > a.step || (b.step === a.step && (b.status !== a.status || b.pending?.label !== a.pending?.label));
};
const agentsAhead = (prev: PlaygroundRoom, next: PlaygroundRoom) => stepAhead(prev.exchange, next.exchange) || stepAhead(prev.challenge, next.challenge);

export function acceptRoom(prev: PlaygroundRoom | null, next: PlaygroundRoom): PlaygroundRoom {
  if (!prev || prev.id !== next.id) return next;
  if (next.seq < prev.seq) return prev;
  // Same seq: only resource reading progress, or an agent exchange or challenge moving on, can change without a new event.
  if (next.seq === prev.seq && resourceKey(next) === resourceKey(prev) && !agentsAhead(prev, next)) return prev;
  // Never let an older exchange step replace a newer one at the same seq.
  if (next.seq === prev.seq && prev.exchange && next.exchange?.id === prev.exchange.id && next.exchange.step < prev.exchange.step) return prev;
  if (next.seq === prev.seq && prev.challenge && next.challenge?.id === prev.challenge.id && next.challenge.step < prev.challenge.step) return prev;
  return next;
}
