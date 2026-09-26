/**
 * Semantic room events over Supabase Realtime Broadcast (REST, server key).
 * The payload is only {seq, type}: clients refetch the room from the API,
 * which is the source of truth, so nothing private travels over the channel.
 * If Supabase isn't configured or a send fails, clients still poll.
 */
import type { RoomEventType } from "../contracts.ts";
import { logEvent } from "../log.ts";

export interface RoomRealtime {
  readonly mode: "broadcast" | "polling";
  publish(channel: string, event: { seq: number; type: RoomEventType }): void;
}

export class PollingOnly implements RoomRealtime {
  readonly mode = "polling" as const;
  publish(): void {}
}

export class SupabaseBroadcast implements RoomRealtime {
  readonly mode = "broadcast" as const;
  private readonly url: string;
  private readonly key: string;
  private readonly fetchImpl: typeof fetch;
  constructor(url: string, serviceRoleKey: string, fetchImpl: typeof fetch = fetch) {
    this.url = url;
    this.key = serviceRoleKey;
    this.fetchImpl = fetchImpl;
  }

  publish(channel: string, event: { seq: number; type: RoomEventType }): void {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    this.fetchImpl(`${this.url}/realtime/v1/api/broadcast`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { apikey: this.key, Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ topic: channel, event: "room", payload: event }] }),
    })
      .then((res) => {
        if (!res.ok) logEvent("realtime.broadcast_failed", { status: res.status, channel }, "warn");
      })
      .catch((err: unknown) => logEvent("realtime.broadcast_failed", { error: err instanceof Error ? err.message : String(err), channel }, "warn"))
      .finally(() => clearTimeout(timer));
  }
}
