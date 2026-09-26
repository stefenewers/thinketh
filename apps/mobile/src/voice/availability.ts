import type { ComponentType } from "react";
import { NativeModules, Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import type { LiveCatchUpProps } from "./LiveCatchUp";

/**
 * Live voice needs the native WebRTC module, which only exists in a development
 * or release build: never on web or in Expo Go. `@elevenlabs/react-native`
 * registers WebRTC globals at import time, so it is only required once this is
 * true; otherwise Catch Me Up stays on the transcript.
 */
export function liveVoiceSupported(): boolean {
  if (Platform.OS === "web") return false;
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return false;
  return NativeModules.WebRTCModule != null;
}

let cached: ComponentType<LiveCatchUpProps> | null | undefined;

/** The live voice component, or null when voice can't run here. Never throws. */
export function loadLiveCatchUp(): ComponentType<LiveCatchUpProps> | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = liveVoiceSupported() ? (require("./LiveCatchUp") as typeof import("./LiveCatchUp")).LiveCatchUp : null;
  } catch {
    cached = null;
  }
  return cached;
}
