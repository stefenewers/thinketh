import { PlaygroundRoomSchema, type PlaygroundRoom } from "@thinketh/contracts";
import { DEMO_USER_ID } from "./client";
import { API_URL, USE_MOCK_API } from "./index";

// The Playground talks only to the Thinketh server (it owns every room; the
// conductor and all secrets stay there). No mock: without a server the screen
// says so instead of pretending two Minds are connected.

const APP_KEY = process.env.EXPO_PUBLIC_THINKETH_APP_KEY;
const TIMEOUT_MS = 12000;
/** A graded answer can wait on Claude; the server falls back well before this. */
const ANSWER_TIMEOUT_MS = 20000;

export const PLAYGROUND_AVAILABLE = !USE_MOCK_API && !!API_URL;

export class PlaygroundError extends Error {}

async function call(method: "GET" | "POST", path: string, body?: unknown, opts: { as?: string; timeoutMs?: number } = {}): Promise<PlaygroundRoom> {
  if (!PLAYGROUND_AVAILABLE) throw new PlaygroundError("The Playground needs the Thinketh server.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? TIMEOUT_MS);
  try {
    const res = await fetch(`${API_URL!.replace(/\/$/, "")}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-thinketh-user-id": opts.as ?? DEMO_USER_ID,
        ...(APP_KEY ? { "x-thinketh-app-key": APP_KEY } : {}),
      },
      body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
      signal: controller.signal,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new PlaygroundError((json as { error?: { message?: string } } | null)?.error?.message ?? `Request failed (${res.status})`);
    return PlaygroundRoomSchema.parse(json);
  } catch (err) {
    if (err instanceof PlaygroundError) throw err;
    throw new PlaygroundError(err instanceof Error && err.name === "AbortError" ? "The server took too long. Try again." : "Couldn't reach the Thinketh server.");
  } finally {
    clearTimeout(timer);
  }
}

const id = encodeURIComponent;

/** `as` is the device's identity: the host, or a guest device joining as someone else. */
export const playground = {
  create: (displayName: string, as?: string) => call("POST", "/playground/rooms", { displayName }, { as }),
  join: (code: string, displayName: string, as: string) => call("POST", "/playground/join", { code, displayName }, { as }),
  get: (roomId: string, as?: string) => call("GET", `/playground/rooms/${id(roomId)}`, undefined, { as }),
  demoGuest: (roomId: string) => call("POST", `/playground/rooms/${id(roomId)}/demo-guest`),
  compare: (roomId: string, as?: string) => call("POST", `/playground/rooms/${id(roomId)}/compare`, {}, { as }),
  conduct: (roomId: string, intent?: "next" | "shared_gap" | "resource" | "end", as?: string) =>
    call("POST", `/playground/rooms/${id(roomId)}/conduct`, intent ? { intent } : {}, { as }),
  explain: (roomId: string, text: string, opts: { asUserId?: string; as?: string } = {}) =>
    call("POST", `/playground/rooms/${id(roomId)}/explain`, { text, ...(opts.asUserId ? { asUserId: opts.asUserId } : {}) }, { as: opts.as, timeoutMs: ANSWER_TIMEOUT_MS }),
  answer: (roomId: string, answer: string, opts: { asUserId?: string; as?: string } = {}) =>
    call("POST", `/playground/rooms/${id(roomId)}/answer`, { answer, ...(opts.asUserId ? { asUserId: opts.asUserId } : {}) }, { as: opts.as, timeoutMs: ANSWER_TIMEOUT_MS }),
  resource: (roomId: string, url: string, as?: string) => call("POST", `/playground/rooms/${id(roomId)}/resource`, { url }, { as, timeoutMs: ANSWER_TIMEOUT_MS }),
  leave: (roomId: string, as?: string) => call("POST", `/playground/rooms/${id(roomId)}/leave`, {}, { as }),
};
