// The personal agent as the rest of the app sees it. No native imports: safe on web, in Expo Go
// and in tests. The live implementation (AgentRuntime) is loaded only where voice can run.
import { createContext, useContext } from "react";
import type { SharedValue } from "react-native-reanimated";
import type { AgentActivity } from "@thinketh/contracts";

/**
 * unsupported  no native voice here (web, Expo Go, missing module): text and navigation only
 * idle         nothing running, microphone released
 * connecting   token requested / call starting (mic permission is asked here, never earlier)
 * live         connected
 */
export type AgentStatus = "unsupported" | "idle" | "connecting" | "live";
/** What the dock shows. "thinking": the user finished, the agent hasn't started speaking (or a tool is running). */
export type AgentPhase = "connecting" | "listening" | "user" | "thinking" | "speaking";
export type AgentTurn = { role: "user" | "agent"; text: string };

export type AgentState = {
  status: AgentStatus;
  activity: AgentActivity;
  phase: AgentPhase;
  expanded: boolean;
  isMuted: boolean;
  /** The mic was muted by the app (backgrounding, a phone call); only the user turns it back on. */
  pausedBySystem: boolean;
  caption: { current: string; previous: string };
  /** Completed sentences for screen readers. */
  announce: string;
  aligned: boolean;
  lastUser: string;
  /** Recent turns for the expanded view (bounded). */
  turns: AgentTurn[];
  /** The user asked to end; the call is closing. */
  ending: boolean;
  /** One calm sentence about something that went wrong or changed (permission, disconnect...). */
  notice: string | null;
  /** Output level for the meter; animated off the render loop. Null when unsupported. */
  level: SharedValue<number> | null;
};

export type AgentControls = {
  supported: boolean;
  /** Start (or, if already live, switch activity). Explicit user action only: this asks for the mic. */
  start: (activity?: AgentActivity) => void;
  /** Disconnect and release the microphone. */
  end: () => void;
  expand: () => void;
  minimize: () => void;
  setMuted: (muted: boolean) => void;
  /** Silence the current reply without ending the conversation. */
  stopTalking: () => void;
  /** Type instead of talking. Returns false when there's no live conversation to send to. */
  sendText: (text: string) => boolean;
  dismissNotice: () => void;
  /** The briefing for Catch Me Up, fetched once and reused by the next start (tokens are single-use). */
  prepareCatchUp: () => Promise<import("@thinketh/contracts").VoiceSession>;
};

export const idleState: AgentState = {
  status: "unsupported",
  activity: "assist",
  phase: "listening",
  expanded: false,
  isMuted: false,
  pausedBySystem: false,
  caption: { current: "", previous: "" },
  announce: "",
  aligned: false,
  lastUser: "",
  turns: [],
  ending: false,
  notice: null,
  level: null,
};

export const AgentStateContext = createContext<AgentState>(idleState);
export const AgentControlsContext = createContext<AgentControls | null>(null);

export function useAgentState(): AgentState {
  return useContext(AgentStateContext);
}

export function useAgentControls(): AgentControls {
  const c = useContext(AgentControlsContext);
  if (!c) throw new Error("useAgentControls must be used inside AgentProvider");
  return c;
}

export const isActive = (s: AgentStatus) => s === "connecting" || s === "live";
