import { useEffect, useRef, useState } from "react";
import type { PlaygroundRoom } from "@thinketh/contracts";

// Supabase Realtime Broadcast over its Phoenix websocket, with no SDK. Events
// carry only {seq, type}; the room itself is always refetched from the API
// (the source of truth). If the socket can't connect, polling keeps working.

const HEARTBEAT_MS = 25000;

export function useRoomChannel(realtime: PlaygroundRoom["realtime"] | undefined, onEvent: (e: { seq: number; type: string }) => void): boolean {
  const [live, setLive] = useState(false);
  const handler = useRef(onEvent);
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
    let ref = 1;
    const topic = `realtime:${channel}`;

    const connect = () => {
      ws = new WebSocket(`${url.replace(/^http/, "ws")}/realtime/v1/websocket?apikey=${encodeURIComponent(key)}&vsn=1.0.0`);
      ws.onopen = () => {
        ws?.send(JSON.stringify({ topic, event: "phx_join", payload: { config: { broadcast: { self: false } } }, ref: String(ref++) }));
        beat = setInterval(() => ws?.send(JSON.stringify({ topic: "phoenix", event: "heartbeat", payload: {}, ref: String(ref++) })), HEARTBEAT_MS);
      };
      ws.onmessage = (m) => {
        try {
          const msg = JSON.parse(String(m.data)) as { event?: string; payload?: { status?: string; payload?: { seq?: unknown; type?: unknown } } };
          if (msg.event === "phx_reply" && msg.payload?.status === "ok") setLive(true);
          const p = msg.payload?.payload;
          if (msg.event === "broadcast" && typeof p?.seq === "number" && typeof p.type === "string") handler.current({ seq: p.seq, type: p.type });
        } catch {
          // Ignore anything that isn't ours.
        }
      };
      ws.onclose = () => {
        setLive(false);
        if (beat) clearInterval(beat);
        if (!closed) retry = setTimeout(connect, 3000);
      };
      ws.onerror = () => ws?.close();
    };
    connect();
    return () => {
      closed = true;
      if (beat) clearInterval(beat);
      if (retry) clearTimeout(retry);
      ws?.close();
      setLive(false);
    };
  }, [url, key, channel]);

  return live;
}
