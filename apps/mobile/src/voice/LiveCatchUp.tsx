// Only loaded through ./availability (dev/release builds): importing
// @elevenlabs/react-native registers native WebRTC globals.
import { useEffect, useReducer, useRef, useState } from "react";
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
import { useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { color, space } from "@/theme/tokens";
import { captionLines, initialCaption, isAligned, lastCompleteSentence, pendingReveal, reduceCaption } from "./captionState";
import { nextFocus, type FocusConcept } from "./conceptFocus";
import { isEndIntent } from "./endIntent";
import { LiveBriefingCanvas, type BriefingMind } from "./LiveBriefingCanvas";
import { USER_HOLD_MS, USER_VAD_THRESHOLD, voicePhase } from "./voiceVisualState";

/** How long Thinketh must stay quiet before its turn counts as over (ms). */
const TURN_SETTLE_MS = 700;

export type LiveCatchUpProps = {
  /** Voice failed at any point: the screen switches to the transcript. */
  onFallback: (reason: string) => void;
  /** The session ended normally (user or agent hung up). */
  onEnded: () => void;
  /** The user chose the text version. */
  onShowTranscript: () => void;
  /** Presentation only: the Mind to visualize while Thinketh speaks. Absent = no canvas graph. */
  mind?: BriefingMind | null;
  /** Concepts the live words can be matched against. */
  concepts?: FocusConcept[];
  /** The briefing's lead topic, shown as "Now" before any concept is named. */
  seed?: { conceptId?: string; label?: string };
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

function LiveSession({ onFallback, onEnded, onShowTranscript, mind = null, concepts = [], seed }: LiveCatchUpProps) {
  const { startSession, endSession, sendContextualUpdate, getOutputVolume } = useConversationControls();
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

  // Live Briefing Canvas state. Presentation only: none of it touches knowledge state.
  const [caption, dispatch] = useReducer(reduceCaption, initialCaption);
  const [now, setNow] = useState(() => Date.now());
  const [lastVoiceAt, setLastVoiceAt] = useState<number | null>(null);
  const [focusId, setFocusId] = useState<string | null>(seed?.conceptId ?? null);
  const reduceMotion = useReducedMotion();
  const level = useSharedValue(0);
  // Dev-only: note once per session which caption signals the device actually receives.
  const seen = useRef({ message: false, alignment: false });
  // Saying "end", "finish", "that's enough"... closes the call like the End button (the agent may not hang up itself).
  const [ending, setEnding] = useState(false);
  const endByVoice = useRef<() => void>(() => {});

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
          // Captions and attention. Pure display: dispatch into the caption reducer, nothing else.
          onMessage: ({ message, role }) => {
            if (__DEV__ && role === "agent" && !seen.current.message) {
              seen.current.message = true;
              console.log("[voice] agent transcript arriving");
            }
            dispatch(role === "agent" ? { type: "agent_message", text: message } : { type: "user_message", text: message });
            if (role === "user" && isEndIntent(message)) {
              if (__DEV__) console.log("[voice] end intent heard");
              setEnding(true);
              // A beat so the screen can say it is ending; then the same path as the End button.
              setTimeout(() => endByVoice.current(), 900);
            }
          },
          onAudioAlignment: (chunk) => {
            if (__DEV__ && !seen.current.alignment) {
              seen.current.alignment = true;
              console.log("[voice] audio alignment arriving");
            }
            dispatch({ type: "alignment", chunk, receivedAt: Date.now() });
          },
          onAgentResponseCorrection: (e) => dispatch({ type: "correction", text: e.corrected_agent_response }),
          onInterruption: () => dispatch({ type: "turn_end", now: Date.now() }),
          onVadScore: ({ vadScore }) => {
            if (vadScore >= USER_VAD_THRESHOLD) setLastVoiceAt((t) => (t && Date.now() - t < 200 ? t : Date.now()));
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

  // Thinketh stopped speaking: the turn settles, but only after a real pause. isSpeaking can
  // flicker off between audio chunks, and closing the turn then splits a sentence (and a word)
  // across two turns. Interruptions still close it at once (onInterruption).
  useEffect(() => {
    if (isSpeaking) return;
    const id = setTimeout(() => dispatch({ type: "turn_end", now: Date.now() }), TURN_SETTLE_MS);
    return () => clearTimeout(id);
  }, [isSpeaking]);

  // Reveal aligned words on ElevenLabs' own timings; tick only while there is text left to show,
  // and while the "you're talking" hold is running.
  useEffect(() => {
    const t = Date.now();
    const holding = lastVoiceAt !== null && t - lastVoiceAt < USER_HOLD_MS;
    if (!pendingReveal(caption, t) && !holding) return;
    const id = setTimeout(() => setNow(Date.now()), holding && !pendingReveal(caption, t) ? USER_HOLD_MS : 80);
    return () => clearTimeout(id);
  }, [caption, now, lastVoiceAt]);

  const lines = captionLines(caption, now);
  const spoken = `${lines.previous} ${lines.current}`.trim();
  // Attention follows the words: a newly named concept moves the view; otherwise it stays put.
  // (Adjusted during render when the spoken text changes, per React's guidance; no effect.)
  const [seenSpoken, setSeenSpoken] = useState(spoken);
  if (spoken !== seenSpoken) {
    setSeenSpoken(spoken);
    const next = nextFocus(focusId, spoken, concepts);
    if (next !== focusId) setFocusId(next);
  }

  // The only audio-reactive signal: output level into a shared value, off the React render loop.
  useEffect(() => {
    if (!isSpeaking || reduceMotion) {
      level.set(withTiming(0, { duration: 200 }));
      return;
    }
    const id = setInterval(() => {
      let v = 0;
      try {
        v = Math.max(0, Math.min(1, getOutputVolume()));
      } catch {
        v = 0;
      }
      level.set(withTiming(v, { duration: 110 }));
    }, 100);
    return () => clearInterval(id);
  }, [isSpeaking, reduceMotion, getOutputVolume, level]);

  const end = (then: () => void) => {
    settled.current = true;
    try {
      endSession();
    } catch {
      // already closed
    }
    then();
  };
  useEffect(() => {
    // Only if nothing else has already ended or failed the session.
    endByVoice.current = () => {
      if (!settled.current) end(onEnded);
    };
  });

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

  const focusName = focusId ? concepts.find((c) => c.id === focusId)?.name : undefined;
  return (
    <LiveBriefingCanvas
      phase={voicePhase({ connected: true, isSpeaking, lastUserVoiceAt: lastVoiceAt, now })}
      topic={focusName ?? seed?.label ?? null}
      focusId={focusId}
      mind={mind}
      caption={lines}
      announce={lastCompleteSentence(caption, now)}
      aligned={isAligned(caption)}
      lastUser={caption.lastUser}
      ending={ending}
      isMuted={isMuted}
      level={level}
      reduceMotion={!!reduceMotion}
      onToggleMic={() => setMuted(!isMuted)}
      onEnd={() => end(onEnded)}
      onText={() => end(onShowTranscript)}
    />
  );
}

const styles = StyleSheet.create({
  block: { paddingTop: space.s },
  stateRow: { flexDirection: "row", alignItems: "center", gap: space.s },
  dot: { width: 8, height: 8, borderRadius: 4 },
  quiet: { alignSelf: "center" },
});
