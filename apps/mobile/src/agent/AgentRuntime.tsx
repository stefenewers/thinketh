// Only loaded through ../voice/availability (dev/release builds): importing
// @elevenlabs/react-native registers native WebRTC globals.
//
// The one voice conversation for the whole app. It lives at the root, so moving between screens
// never reconnects, re-greets or creates a second token. It owns connection and mic state, the
// transcript and captions, the current activity (general assistance or Catch Me Up), the screen
// context sent to the agent, the client tools, audio focus, and compact/expanded presentation.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { router, type Href } from "expo-router";
import { ConversationProvider, useConversationControls, useConversationInput, useConversationMode } from "@elevenlabs/react-native";
import { useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import type { AgentActivity, VoiceSession } from "@thinketh/contracts";
import { api } from "@/api";
import { PLAYGROUND_AVAILABLE } from "@/api/playground";
import { useSession } from "@/lib/session";
import { captionLines, initialCaption, isAligned, lastCompleteSentence, pendingReveal, reduceCaption } from "@/voice/captionState";
import { isEndIntent, isStopTalkingIntent } from "@/voice/endIntent";
import { USER_HOLD_MS, USER_VAD_THRESHOLD } from "@/voice/voiceVisualState";
import {
  AgentControlsContext,
  AgentStateContext,
  type AgentControls,
  type AgentPhase,
  type AgentState,
  type AgentStatus,
  type AgentTurn,
} from "./agentContext";
import { claimAudio } from "./audioFocus";
import { describeScreen, getScreen, subscribeScreen, waitForScreen } from "./screenContext";
import { createAgentTools } from "./tools";

const CONNECT_TIMEOUT_MS = 15_000;
/** How long Thinketh must stay quiet before its turn counts as over (ms). */
const TURN_SETTLE_MS = 700;
/** Screen changes are sent once they settle, so scrolling or quick taps don't flood the agent. */
const CONTEXT_DEBOUNCE_MS = 600;
/** A prepared (unused) token is reused only while fresh; older ones are replaced. */
const PREPARED_TTL_MS = 120_000;
/** "Thinking" never lasts longer than this without a reply. */
const THINKING_MAX_MS = 10_000;
/**
 * A dead microphone: on iOS a call sometimes starts with the mic capturing pure digital silence for the
 * whole call (exactly zero, where a quiet room still reads above zero), and reconnecting doesn't revive
 * it; reopening the app does. After this long at zero (unmuted, agent not speaking, nothing heard yet)
 * the call says so, so the person can type instead of talking to nobody. No automatic reconnect: a
 * rapid end-and-restart is what crashed the voice dock before.
 */
const DEAD_MIC_MS = 4000;
const MAX_TURNS = 20;

const log = (event: string, detail: Record<string, unknown> = {}) => {
  if (__DEV__) console.log(`[agent] ${event}`, detail);
};

/** Catch Me Up, as sent to the agent when that activity starts. The backend computed every word. */
function briefingContext(session: VoiceSession): string {
  const v = session.dynamicVariables;
  return [
    `[Activity: Catch Me Up] Thinketh briefing for ${v.user_name ?? "the user"} on ${v.brief_date ?? "today"} (about ${v.brief_minutes ?? "a few"} minutes).`,
    "Deliver this as the Catch Me Up. Stay on these developments and what changed for this user.",
    "Do not estimate, invent or state mastery or uncertainty numbers: Thinketh's knowledge model owns those.",
    "",
    String(v.brief_script ?? session.fallbackTranscript.join("\n")),
  ].join("\n");
}

/** The briefing's developments with their ids, so "this one" can be explained or opened mid-briefing. */
async function briefingDevelopments(): Promise<string | null> {
  const today = await api.getTodayBrief();
  if (!today.developments.length) return null;
  const hero = today.brief.heroDevelopmentId;
  const ordered = [...today.developments].sort((a, b) => Number(b.id === hero) - Number(a.id === hero) || b.significance - a.significance);
  return [
    "[Catch Me Up developments] The developments in this briefing, in order, with the ids to pass to explain_focus (kind development) or open_development:",
    ...ordered.map((d) => `- "${d.title}" (id ${d.id})`),
  ].join("\n");
}

/** Same words as the server's assist opening (packages/intelligence/src/adapters/voice.ts), for servers that predate it. */
const ASSIST_OPENING_FALLBACK = "I'm here. What would you like to look at?";

const ASSIST_CONTEXT = [
  "[Activity: general assistance] The user opened Thinketh's voice companion from the app. Do not deliver the daily briefing unless they ask to be caught up (then call start_catch_up).",
  "Answer about what is on screen and what they ask, using your tools for facts and navigation. Keep replies short.",
].join("\n");

/** Map SDK/LiveKit errors to one calm sentence. */
function explain(reason: string): string {
  if (/permission|notallowed|not allowed|denied|microphone|audio input|recording/i.test(reason))
    return "Thinketh needs microphone access to talk. Turn it on in Settings, or type instead.";
  if (/token|expired|unauthori[sz]ed|401|403/i.test(reason)) return "The voice session expired before it connected. Try again.";
  if (/network|timeout|took too long|offline|fetch/i.test(reason)) return "Voice couldn't connect over this network. Try again, or type instead.";
  if (/configured|server/i.test(reason)) return "Voice isn't set up on the server right now. You can still type and tap.";
  return "Voice couldn't start. You can still type and tap.";
}

export function AgentRuntime({ children }: { children: ReactNode }) {
  return (
    <ConversationProvider>
      <Controller>{children}</Controller>
    </ConversationProvider>
  );
}

function Controller({ children }: { children: ReactNode }) {
  const { startSession, endSession, sendContextualUpdate, sendUserMessage, setVolume, getOutputVolume, getInputVolume } = useConversationControls();
  const { isSpeaking } = useConversationMode();
  const { isMuted, setMuted: sdkSetMuted } = useConversationInput();

  const [status, setStatus] = useState<AgentStatus>("idle");
  const [activity, setActivityState] = useState<AgentActivity>("assist");
  const [expanded, setExpanded] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const [pausedBySystem, setPausedBySystem] = useState(false);
  const [turns, setTurns] = useState<AgentTurn[]>([]);
  const [caption, dispatch] = useReducer(reduceCaption, initialCaption);
  const [now, setNow] = useState(() => Date.now());
  const [lastVoiceAt, setLastVoiceAt] = useState<number | null>(null);
  const [thinkingSince, setThinkingSince] = useState<number | null>(null);
  const [toolsRunning, setToolsRunning] = useState(0);
  const reduceMotion = useReducedMotion();
  const level = useSharedValue(0);

  // Refs read by SDK callbacks and tools, which outlive renders.
  /** Bumped whenever a conversation ends (or the account changes): late events and tool results check it. */
  const epoch = useRef(0);
  const statusRef = useRef<AgentStatus>("idle");
  const activityRef = useRef<AgentActivity>("assist");
  const session = useRef<VoiceSession | null>(null);
  const prepared = useRef<{
    session: VoiceSession;
    at: number;
    activity: AgentActivity;
  } | null>(null);
  const silenced = useRef(false);
  const lastContext = useRef("");
  const releaseAudio = useRef<(() => void) | null>(null);
  const isMutedRef = useRef(isMuted);
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);
  const isSpeakingRef = useRef(isSpeaking);
  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  const setStatusBoth = useCallback((s: AgentStatus) => {
    statusRef.current = s;
    setStatus(s);
  }, []);
  const setActivity = useCallback((a: AgentActivity) => {
    activityRef.current = a;
    setActivityState(a);
  }, []);
  const pushTurn = useCallback((t: AgentTurn) => setTurns((ts) => [...ts, t].slice(-MAX_TURNS)), []);

  const safeMute = useCallback(
    (muted: boolean) => {
      try {
        sdkSetMuted(muted);
      } catch {
        // No live conversation: nothing to mute.
      }
    },
    [sdkSetMuted],
  );

  /** Tear down this conversation locally. Always releases the mic (endSession stops the tracks). */
  const settle = useCallback(
    (message: string | null) => {
      epoch.current += 1;
      try {
        endSession();
      } catch {
        // already closed
      }
      releaseAudio.current?.();
      releaseAudio.current = null;
      session.current = null;
      silenced.current = false;
      lastContext.current = "";
      setStatusBoth("idle");
      setExpanded(false);
      setEnding(false);
      setPausedBySystem(false);
      setThinkingSince(null);
      setToolsRunning(0);
      dispatch({ type: "turn_end", now: Date.now() });
      setNotice(message);
      log("ended", { message });
    },
    [endSession, setStatusBoth],
  );

  const sendScreenContext = useCallback(
    (force = false) => {
      if (statusRef.current !== "live") return;
      const text = describeScreen(getScreen());
      if (!force && text === lastContext.current) return;
      lastContext.current = text;
      try {
        // contextId lets the server supersede the previous screen; the text also says it replaces it.
        sendContextualUpdate(text, { contextId: "screen" });
      } catch {
        // Not connected any more; the next connection sends it.
      }
    },
    [sendContextualUpdate],
  );

  /** Catch Me Up: follow the briefing with its development ids (best effort; the briefing works without them). */
  const sendBriefingDevelopments = useCallback(() => {
    const mine = epoch.current;
    briefingDevelopments()
      .then((text) => {
        if (!text || epoch.current !== mine || statusRef.current !== "live") return;
        sendContextualUpdate(text, { contextId: "briefing_developments" });
      })
      .catch(() => {});
  }, [sendContextualUpdate]);

  // Client tools: built per conversation (fresh dedupe and loop guards); dependencies are read through refs at call time.
  const buildTools = useCallback(() => {
    const raw = createAgentTools({
      api,
      nav: {
        push: (href) => router.push(href as Href),
        canGoBack: () => router.canGoBack(),
        back: () => router.back(),
      },
      screen: getScreen,
      waitForScreen,
      session: {
        epoch: () => epoch.current,
        setActivity,
        mute: () => safeMute(true),
        briefScript: () => {
          const s = session.current;
          const script = s ? String(s.dynamicVariables.brief_script ?? s.fallbackTranscript.join("\n")) : "";
          return script.trim() || null;
        },
      },
      playgroundAvailable: PLAYGROUND_AVAILABLE,
      log,
    });
    // "Thinking" while a tool runs.
    return Object.fromEntries(
      Object.entries(raw).map(([name, fn]) => [
        name,
        async (params: Record<string, unknown>) => {
          setToolsRunning((n) => n + 1);
          try {
            return await fn(params);
          } finally {
            setToolsRunning((n) => Math.max(0, n - 1));
          }
        },
      ]),
    );
  }, [safeMute, setActivity]);

  const stopTalking = useCallback(() => {
    if (statusRef.current !== "live") return;
    silenced.current = true;
    try {
      setVolume({ volume: 0 });
    } catch {
      // not connected
    }
    dispatch({ type: "turn_end", now: Date.now() });
  }, [setVolume]);

  const connect = useCallback(
    (next: AgentActivity) => {
      const run = async (withOpening: boolean): Promise<void> => {
        const mine = ++epoch.current;
        const stale = () => epoch.current !== mine;
        setStatusBoth("connecting");
        setActivity(next);
        setNotice(null);
        setEnding(false);
        setTurns([]);
        setThinkingSince(null);
        dispatch({ type: "turn_end", now: Date.now() });
        let connected = false;
        // The SDK can report one failed start twice (client error, then the provider's rejection): retry at most once.
        let retrying = false;
        const fail = (reason: string) => {
          if (stale()) return;
          log("failed", { reason });
          settle(explain(reason));
        };
        const timeout = setTimeout(() => fail("voice took too long to connect"), CONNECT_TIMEOUT_MS);

        // One owner of spoken audio: anything else that speaks must claim focus, which stops us.
        releaseAudio.current?.();
        releaseAudio.current = claimAudio("agent", () => {
          silenced.current = true;
          try {
            setVolume({ volume: 0 });
          } catch {
            // not connected
          }
        });

        let s: VoiceSession;
        const p = prepared.current;
        prepared.current = null;
        try {
          // Tokens are single-use: reuse a fresh prepared one for this activity, else ask for a new one.
          s = p && p.activity === next && Date.now() - p.at < PREPARED_TTL_MS ? p.session : await api.createVoiceSession(next);
        } catch {
          clearTimeout(timeout);
          return fail("couldn't create a voice session (network)");
        }
        if (stale()) return clearTimeout(timeout);
        if (s.mode !== "elevenlabs" || !s.conversationToken) {
          clearTimeout(timeout);
          return fail("voice isn't configured on the server");
        }
        session.current = s;
        // Older servers send no opening line; general assistance still must not open with the briefing.
        const opening = typeof s.dynamicVariables.opening_line === "string" ? s.dynamicVariables.opening_line : ASSIST_OPENING_FALLBACK;
        try {
          startSession({
            conversationToken: s.conversationToken,
            connectionType: "webrtc",
            dynamicVariables: s.dynamicVariables,
            clientTools: buildTools(),
            // General assistance must not open with the briefing. Catch Me Up keeps the agent's own first message.
            ...(withOpening && next === "assist" && opening ? { overrides: { agent: { firstMessage: opening } } } : {}),
            onConnect: () => {
              if (stale()) return;
              clearTimeout(timeout);
              connected = true;
              setStatusBoth("live");
              log("connected", { activity: next });
              try {
                sendContextualUpdate(next === "catch_up" ? briefingContext(s) : ASSIST_CONTEXT);
              } catch {
                // The agent still has its own opening.
              }
              sendScreenContext(true);
              if (next === "catch_up") sendBriefingDevelopments();
            },
            onMessage: ({ message, role }) => {
              if (stale()) return;
              dispatch(role === "agent" ? { type: "agent_message", text: message } : { type: "user_message", text: message });
              pushTurn({
                role: role === "agent" ? "agent" : "user",
                text: message,
              });
              if (role === "agent") {
                setThinkingSince(null);
                return;
              }
              setThinkingSince(Date.now());
              if (isEndIntent(message)) {
                log("end intent heard");
                setEnding(true);
                // A beat so the screen can say it is ending; then the same path as the End button.
                setTimeout(() => !stale() && settle(null), 900);
              } else if (isStopTalkingIntent(message)) {
                // The SDK already interrupts when the user talks; this also silences any reply still queued.
                stopTalking();
              }
            },
            onAudioAlignment: (chunk) => !stale() && dispatch({ type: "alignment", chunk, receivedAt: Date.now() }),
            onAgentResponseCorrection: (e) =>
              !stale() &&
              dispatch({
                type: "correction",
                text: e.corrected_agent_response,
              }),
            onInterruption: () => !stale() && dispatch({ type: "turn_end", now: Date.now() }),
            onVadScore: ({ vadScore }) => {
              if (!stale() && vadScore >= USER_VAD_THRESHOLD) setLastVoiceAt((t) => (t && Date.now() - t < 200 ? t : Date.now()));
            },
            onError: (message) => {
              // Before connecting, any error is fatal. After, the call keeps going until the SDK disconnects.
              if (!connected) {
                clearTimeout(timeout);
                if (withOpening && /override/i.test(message ?? "")) {
                  // The hosted agent doesn't allow the opening override yet: retry once without it.
                  if (retrying || stale()) return;
                  retrying = true;
                  log("opening override refused; retrying without it");
                  setTimeout(() => !stale() && void run(false), 500); // let the refused attempt release first
                  return;
                }
                if (retrying) return;
                fail(message || "voice connection error");
              } else log("error", { message });
            },
            onDisconnect: (details) => {
              clearTimeout(timeout);
              if (stale() || retrying) return;
              const reason = (details as { reason?: string } | undefined)?.reason;
              settle(reason === "error" ? "Voice disconnected. Start again when you're ready." : null);
            },
          });
        } catch (err) {
          clearTimeout(timeout);
          fail(err instanceof Error ? err.message : "couldn't start voice");
        }
      };
      return run(true);
    },
    [buildTools, pushTurn, sendBriefingDevelopments, sendContextualUpdate, sendScreenContext, setActivity, setStatusBoth, setVolume, settle, startSession, stopTalking],
  );

  // A silenced reply stays silent until Thinketh's turn is over; the next reply is heard again.
  useEffect(() => {
    if (isSpeaking || !silenced.current) return;
    silenced.current = false;
    try {
      setVolume({ volume: 1 });
    } catch {
      // not connected
    }
  }, [isSpeaking, setVolume]);

  // Screen context: debounced, only when it changed, only while live.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = subscribeScreen(() => {
      clearTimeout(timer);
      timer = setTimeout(() => sendScreenContext(), CONTEXT_DEBOUNCE_MS);
    });
    return () => {
      clearTimeout(timer);
      unsub();
    };
  }, [sendScreenContext]);

  // Backgrounding ends the conversation (no background listening). A brief interruption (a call,
  // Control Center) mutes the mic, and only the user turns it back on: never a silent resume.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "background" && statusRef.current !== "idle") {
        settle("Voice ended when you left Thinketh. Start it again whenever you like.");
      } else if (next === "inactive" && statusRef.current === "live" && !isMutedRef.current) {
        safeMute(true);
        setPausedBySystem(true);
      }
    });
    return () => sub.remove();
  }, [safeMute, settle]);

  // Logout or a different account ends the conversation and drops anything prepared for the old one.
  const auth = useSession();
  const identity = auth.status === "loading" ? null : `${auth.mode}:${auth.session?.userId ?? ""}`;
  const lastIdentity = useRef<string | null>(null);
  useEffect(() => {
    if (identity === null) return;
    if (lastIdentity.current !== null && lastIdentity.current !== identity) {
      prepared.current = null;
      if (statusRef.current !== "idle") settle("The conversation ended because the account changed.");
    }
    lastIdentity.current = identity;
  }, [identity, settle]);

  // Dead-mic watchdog (see DEAD_MIC_MS): say so once per call; never reconnect on its own.
  useEffect(() => {
    if (status !== "live") return;
    let silentSince: number | null = null;
    const mine = epoch.current;
    const id = setInterval(() => {
      if (epoch.current !== mine) return;
      let v = 0;
      try {
        v = getInputVolume();
      } catch {
        return;
      }
      if (v > 0) {
        log("mic live");
        return clearInterval(id);
      }
      if (isMutedRef.current || isSpeakingRef.current) {
        silentSince = null;
        return;
      }
      const t = Date.now();
      silentSince ??= t;
      if (t - silentSince < DEAD_MIC_MS) return;
      clearInterval(id);
      log("mic silent");
      setNotice("Thinketh can't hear your microphone. Type instead, or close and reopen Thinketh to reset it.");
    }, 250);
    return () => clearInterval(id);
  }, [status, getInputVolume]);

  // End on unmount (app teardown / fast refresh).
  useEffect(() => () => settle(null), [settle]);

  // Captions: the turn settles after a real pause (isSpeaking flickers between chunks).
  useEffect(() => {
    if (isSpeaking) return;
    const id = setTimeout(() => dispatch({ type: "turn_end", now: Date.now() }), TURN_SETTLE_MS);
    return () => clearTimeout(id);
  }, [isSpeaking]);

  // Reveal aligned words on ElevenLabs' own timings; tick only while something is pending.
  useEffect(() => {
    const t = Date.now();
    const holding = lastVoiceAt !== null && t - lastVoiceAt < USER_HOLD_MS;
    const thinking = thinkingSince !== null && t - thinkingSince < THINKING_MAX_MS;
    if (!pendingReveal(caption, t) && !holding && !thinking) return;
    const id = setTimeout(() => setNow(Date.now()), pendingReveal(caption, t) ? 80 : holding ? USER_HOLD_MS : 1000);
    return () => clearTimeout(id);
  }, [caption, now, lastVoiceAt, thinkingSince]);

  // Output level into a shared value, off the React render loop.
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

  const controls = useMemo<AgentControls>(
    () => ({
      supported: true,
      start: (next = "assist") => {
        const s = statusRef.current;
        if (s === "connecting") return; // one connection; a second tap never makes a second token
        if (s === "live") {
          // Same agent, same call: only the activity changes.
          if (next === "catch_up" && activityRef.current !== "catch_up" && session.current) {
            setActivity("catch_up");
            try {
              sendContextualUpdate(briefingContext(session.current));
              sendBriefingDevelopments();
              sendUserMessage("Catch me up.");
              pushTurn({ role: "user", text: "Catch me up." });
              setThinkingSince(Date.now());
            } catch {
              // The user can still ask by voice.
            }
          }
          return;
        }
        void connect(next);
      },
      end: () => settle(null),
      expand: () => setExpanded(true),
      minimize: () => setExpanded(false),
      setMuted: (muted) => {
        safeMute(muted);
        if (!muted) setPausedBySystem(false);
      },
      stopTalking,
      sendText: (text) => {
        const t = text.trim();
        if (!t || statusRef.current !== "live") return false;
        try {
          sendUserMessage(t);
        } catch {
          return false;
        }
        pushTurn({ role: "user", text: t });
        setThinkingSince(Date.now());
        return true;
      },
      dismissNotice: () => setNotice(null),
      prepareCatchUp: async () => {
        const p = prepared.current;
        if (p && p.activity === "catch_up" && Date.now() - p.at < PREPARED_TTL_MS) return p.session;
        // While a call is live, its session already holds today's briefing: no second token.
        if (statusRef.current !== "idle" && session.current) return session.current;
        const s = await api.createVoiceSession("catch_up");
        prepared.current = { session: s, at: Date.now(), activity: "catch_up" };
        return s;
      },
    }),
    [connect, pushTurn, safeMute, sendBriefingDevelopments, sendContextualUpdate, sendUserMessage, setActivity, settle, stopTalking],
  );

  const lines = captionLines(caption, now);
  const t = now;
  let phase: AgentPhase;
  if (status !== "live") phase = "connecting";
  else if (isSpeaking) phase = "speaking";
  else if (lastVoiceAt !== null && t - lastVoiceAt < USER_HOLD_MS) phase = "user";
  else if (toolsRunning > 0 || (thinkingSince !== null && t - thinkingSince < THINKING_MAX_MS)) phase = "thinking";
  else phase = "listening";

  const state: AgentState = {
    status,
    activity,
    phase,
    expanded,
    isMuted,
    pausedBySystem,
    caption: lines,
    announce: lastCompleteSentence(caption, now),
    aligned: isAligned(caption),
    lastUser: caption.lastUser,
    turns,
    ending,
    notice,
    level,
  };

  return (
    <AgentControlsContext.Provider value={controls}>
      <AgentStateContext.Provider value={state}>{children}</AgentStateContext.Provider>
    </AgentControlsContext.Provider>
  );
}
