// Which room response wins. Polls, realtime refetches and action responses can land out of order;
// the server's seq orders them. A slower, older response must never replace a newer room.
import type { PlaygroundRoom } from "@thinketh/contracts";

const resourceKey = (r: PlaygroundRoom) => r.resource?.sides.map((s) => `${s.status}:${s.stage ?? ""}`).join("|") ?? "";

export function acceptRoom(prev: PlaygroundRoom | null, next: PlaygroundRoom): PlaygroundRoom {
  if (!prev || prev.id !== next.id) return next;
  if (next.seq < prev.seq) return prev;
  // Same seq: only resource reading progress can change without a new event; keep the same object otherwise.
  if (next.seq === prev.seq && resourceKey(next) === resourceKey(prev)) return prev;
  return next;
}
