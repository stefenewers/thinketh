import { useEffect, useRef, useState } from "react";
import type { PlaygroundRoom } from "@thinketh/contracts";

// Supabase Realtime over its Phoenix websocket, with no SDK.
// - Broadcast: semantic room events, only {seq, type}. The room itself is
//   always refetched from the API (the source of truth).
// - Presence: low-frequency participant state (here, scene, following Muse).
//   Never animation frames.
// If the socket can't connect, polling keeps the room working.

const HEARTBEAT_MS = 25000;
const PRESENCE_DEBOUNCE_MS = 700;

export type PresenceState = { name: string; scene: string; following: boolean };

export function useRoomChannel(
  realtime: PlaygroundRoom["realtime"] | undefined,
  me: string,
  presence: PresenceState | null,
  onEvent: (e: { seq: number; type: string }) => void,
): { live: boolean; present: Record<string, PresenceState> } {
  const [live, setLive] = useState(false);
  const [present, setPresent] = useState<Record<string, PresenceState>>({});
  const handler = useRef(onEvent);
  const socket = useRef<{ send: (p: PresenceState) => void } | null>(null);
  useEffect(() => {
    handler.current = onEvent;
  });

  const url = realtime?.mode === "broadcast" ? realtime.url : undefined;
  const key = realtime?.key;
  const channel = realtime?.channel;

  useEffect(() => {
    if (!url || !key || !channel) return;
    let ws: WebSocket | null = null;
    let beat: ReturnType<typeof setInterval> | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let closed = false;
    let joined = false;
    let pending: PresenceState | null = null;
    let ref = 1;
    const topic = `realtime:${channel}`;
    // presence_state / presence_diff carry {key: {metas: [...]}}; a re-track is a join plus a leave of the old ref.
    type Meta = PresenceState & { phx_ref?: string };
    const metasOf = (v: unknown) => ((v as { metas?: Meta[] })?.metas ?? []).at(-1);
    const refs = new Map<string, string | undefined>();

    const track = (p: PresenceState) => {
      if (!joined || ws?.readyState !== 1) {
        pending = p;
        return;
      }
      ws.send(JSON.stringify({ topic, event: "presence", payload: { type: "presence", event: "track", payload: p }, ref: String(ref++) }));
    };
    socket.current = { send: track };

    const connect = () => {
      ws = new WebSocket(`${url.replace(/^http/, "ws")}/realtime/v1/websocket?apikey=${encodeURIComponent(key)}&vsn=1.0.0`);
      ws.onopen = () => {
        ws?.send(JSON.stringify({ topic, event: "phx_join", payload: { config: { broadcast: { self: false }, presence: { key: me } } }, ref: String(ref++) }));
        beat = setInterval(() => ws?.send(JSON.stringify({ topic: "phoenix", event: "heartbeat", payload: {}, ref: String(ref++) })), HEARTBEAT_MS);
      };
      ws.onmessage = (m) => {
        try {
          const msg = JSON.parse(String(m.data)) as { topic?: string; event?: string; payload?: Record<string, unknown> };
          if (msg.topic !== topic) return;
          if (msg.event === "phx_reply" && (msg.payload as { status?: string })?.status === "ok" && !joined) {
            joined = true;
            setLive(true);
            if (pending) track(pending);
          }
          if (msg.event === "broadcast") {
            const p = (msg.payload as { payload?: { seq?: unknown; type?: unknown } })?.payload;
            if (typeof p?.seq === "number" && typeof p.type === "string") handler.current({ seq: p.seq, type: p.type });
          }
          if (msg.event === "presence_state") {
            const next: Record<string, PresenceState> = {};
            for (const [k, v] of Object.entries(msg.payload ?? {})) {
              const meta = metasOf(v);
              if (meta) {
                next[k] = { name: meta.name, scene: meta.scene, following: meta.following };
                refs.set(k, meta.phx_ref);
              }
            }
            setPresent(next);
          }
          if (msg.event === "presence_diff") {
            const { joins = {}, leaves = {} } = (msg.payload ?? {}) as { joins?: Record<string, unknown>; leaves?: Record<string, unknown> };
            const joined: Record<string, PresenceState> = {};
            for (const [k, v] of Object.entries(joins)) {
              const meta = metasOf(v);
              if (meta) {
                joined[k] = { name: meta.name, scene: meta.scene, following: meta.following };
                refs.set(k, meta.phx_ref);
              }
            }
            // Only a leave of the ref we currently hold means that person actually left.
            const gone = Object.entries(leaves)
              .filter(([k, v]) => !joined[k] && ((v as { metas?: Meta[] })?.metas ?? []).some((m) => m.phx_ref === refs.get(k)))
              .map(([k]) => k);
            setPresent((prev) => {
              const next = { ...prev, ...joined };
              for (const k of gone) delete next[k];
              return next;
            });
          }
        } catch {
          // Ignore anything that isn't ours.
        }
      };
      ws.onclose = () => {
        joined = false;
        setLive(false);
        if (beat) clearInterval(beat);
        if (!closed) retry = setTimeout(connect, 3000);
      };
      ws.onerror = () => ws?.close();
    };
    connect();
    return () => {
      closed = true;
      socket.current = null;
      if (beat) clearInterval(beat);
      if (retry) clearTimeout(retry);
      ws?.close();
      setLive(false);
      setPresent({});
    };
  }, [url, key, channel, me]);

  // Presence is low-frequency by design (and Supabase rate-limits it): coalesce
  // bursts of scene changes into one track after things settle.
  const name = presence?.name;
  const scene = presence?.scene;
  const following = presence?.following;
  useEffect(() => {
    if (name === undefined || scene === undefined || following === undefined) return;
    const t = setTimeout(() => socket.current?.send({ name, scene, following }), PRESENCE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [name, scene, following, live]);

  return { live, present };
}
