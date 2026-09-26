// Only loaded through ./availability (dev/release builds): importing
// @elevenlabs/react-native registers native WebRTC globals.
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import {
  ConversationProvider,
  useConversationControls,
  useConversationInput,
  useConversationMode,
  useConversationStatus,
} from "@elevenlabs/react-native";
import type { VoiceSession } from "@thinketh/contracts";
import { api } from "@/api";
import { T } from "@/components/Text";
import { Button } from "@/components/ui";
import { color, space } from "@/theme/tokens";

export type LiveCatchUpProps = {
  /** Voice failed at any point: the screen switches to the transcript. */
  onFallback: (reason: string) => void;
  /** The session ended normally (user or agent hung up). */
  onEnded: () => void;
  /** The user chose the text version. */
  onShowTranscript: () => void;
};

const CONNECT_TIMEOUT_MS = 15_000;

/**
 * The agent's own prompt has no dynamic-variable slots, so the briefing is also
 * sent as a contextual update once connected. The backend computes every number;
 * the agent only narrates it.
 */
function briefingContext(session: VoiceSession): string {
  const v = session.dynamicVariables;
  return [
    `Thinketh briefing for ${v.user_name ?? "the user"} on ${v.brief_date ?? "today"} (about ${v.brief_minutes ?? "a few"} minutes).`,
    "Deliver this as the Catch Me Up. Stay on these developments and what changed for this user.",
    "Do not estimate, invent or state mastery or uncertainty numbers: Thinketh's knowledge model owns those.",
    "",
    String(v.brief_script ?? session.fallbackTranscript.join("\n")),
  ].join("\n");
}

export function LiveCatchUp(props: LiveCatchUpProps) {
  return (
    <ConversationProvider>
      <LiveSession {...props} />
    </ConversationProvider>
  );
}

function LiveSession({ onFallback, onEnded, onShowTranscript }: LiveCatchUpProps) {
  const { startSession, endSession, sendContextualUpdate } = useConversationControls();
  const { status } = useConversationStatus();
  const { isSpeaking } = useConversationMode();
  const { isMuted, setMuted } = useConversationInput();
  const [connected, setConnected] = useState(false);
  // Latest callbacks for SDK events without restarting the session.
  const handlers = useRef({ onFallback, onEnded });
  useEffect(() => {
    handlers.current = { onFallback, onEnded };
  }, [onFallback, onEnded]);
  const settled = useRef(false); // a fallback or end was already reported

  useEffect(() => {
    let cancelled = false;
    const fail = (reason: string) => {
      if (settled.current || cancelled) return;
      settled.current = true;
      try {
        endSession();
      } catch {
        // already closed
      }
      handlers.current.onFallback(reason);
    };
    const timeout = setTimeout(() => fail("voice took too long to connect"), CONNECT_TIMEOUT_MS);

    (async () => {
      let session: VoiceSession;
      try {
        // A fresh token each time: tokens are short-lived and single-use.
        session = await api.createVoiceSession();
      } catch {
        return fail("couldn't create a voice session");
      }
      if (cancelled) return;
      if (session.mode !== "elevenlabs" || !session.conversationToken) return fail("voice isn't configured on the server");
      try {
        startSession({
          conversationToken: session.conversationToken,
          connectionType: "webrtc",
          dynamicVariables: session.dynamicVariables,
          onConnect: () => {
            clearTimeout(timeout);
            setConnected(true);
            try {
              sendContextualUpdate(briefingContext(session));
            } catch {
              // The agent still has its own opening; the transcript remains available.
            }
          },
          onError: (message) => fail(message || "voice connection error"),
          onDisconnect: () => {
            clearTimeout(timeout);
            if (settled.current || cancelled) return;
            settled.current = true;
            handlers.current.onEnded();
          },
        });
      } catch (err) {
        fail(err instanceof Error ? err.message : "couldn't start voice");
      }
    })();

    return () => {
      // Leaving the screen (or restarting) must never leave a live session behind.
      cancelled = true;
      clearTimeout(timeout);
      try {
        endSession();
      } catch {
        // already closed
      }
    };
    // Runs once per mount; the parent remounts this component to restart.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const end = (then: () => void) => {
    settled.current = true;
    try {
      endSession();
    } catch {
      // already closed
    }
    then();
  };

  if (!connected || status === "connecting") {
    return (
      <View style={styles.block}>
        <ActivityIndicator color={color.ink2} style={{ alignSelf: "flex-start" }} />
        <T variant="title" style={{ marginTop: space.l }}>
          Starting your personalized Catch Me Up…
        </T>
        <Button kind="quiet" label="Read it as text instead" style={styles.quiet} onPress={() => end(onShowTranscript)} />
      </View>
    );
  }

  return (
    <View style={styles.block}>
      <View style={styles.stateRow}>
        <View style={[styles.dot, { backgroundColor: isSpeaking ? color.coral : color.ink }]} />
        <T variant="meta">Live · Catch Me Up</T>
      </View>
      <T variant="display" style={{ marginTop: space.l }} accessibilityLiveRegion="polite">
        {isSpeaking ? "Thinketh is speaking" : "Thinketh is listening"}
      </T>
      <T variant="support" style={{ marginTop: space.m }}>
        {isSpeaking ? "Interrupt any time. Just start talking." : isMuted ? "Your mic is off. Turn it on to reply." : "Go ahead. Ask a question or say what you'd like next."}
      </T>
      <View style={{ marginTop: space.xxl, gap: space.m }}>
        <Button
          kind="secondary"
          label={isMuted ? "Mic off · turn on" : "Mic on · turn off"}
          accessibilityLabel={isMuted ? "Microphone is off. Turn it on." : "Microphone is on. Turn it off."}
          onPress={() => setMuted(!isMuted)}
        />
        <Button label="End catch-up" onPress={() => end(onEnded)} />
        <Button kind="quiet" label="Read it as text instead" style={styles.quiet} onPress={() => end(onShowTranscript)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { paddingTop: space.s },
  stateRow: { flexDirection: "row", alignItems: "center", gap: space.s },
  dot: { width: 8, height: 8, borderRadius: 4 },
  quiet: { alignSelf: "center" },
});
