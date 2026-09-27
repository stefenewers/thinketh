import type { ComponentType, ReactNode } from "react";
import { NativeModules, Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";

/**
 * Live voice needs the native WebRTC module, which only exists in a development
 * or release build: never on web or in Expo Go. `@elevenlabs/react-native`
 * registers WebRTC globals at import time, so it is only required once this is
 * true; otherwise the agent is text-and-tap only and Catch Me Up stays on the transcript.
 */
export function liveVoiceSupported(): boolean {
  if (Platform.OS === "web") return false;
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return false;
  return NativeModules.WebRTCModule != null;
}

type Runtime = ComponentType<{ children: ReactNode }>;
let cached: Runtime | null | undefined;

/** The live agent runtime (one voice conversation for the app), or null when voice can't run here. Never throws. */
export function loadAgentRuntime(): Runtime | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = liveVoiceSupported() ? (require("../agent/AgentRuntime") as typeof import("../agent/AgentRuntime")).AgentRuntime : null;
  } catch {
    cached = null;
  }
  return cached;
}
