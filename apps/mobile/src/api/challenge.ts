import { call } from "./playground";

// Grokbot, the optional visiting challenger: start (idempotent per takeaway version), advance one server
// step, stop. xAI is called only by the server; nothing here holds a credential.
export const challengeApi = {
  start: (roomId: string, as?: string) => call("POST", `/playground/rooms/${encodeURIComponent(roomId)}/challenge`, {}, { as }),
  // One step can be a few model calls (Grokbot reads, then speaks): give it room; the server bounds it.
  advance: (roomId: string, step: number, as?: string) => call("POST", `/playground/rooms/${encodeURIComponent(roomId)}/challenge/advance`, { step }, { as, timeoutMs: 120_000 }),
  stop: (roomId: string, as?: string) => call("POST", `/playground/rooms/${encodeURIComponent(roomId)}/challenge/stop`, {}, { as }),
};
