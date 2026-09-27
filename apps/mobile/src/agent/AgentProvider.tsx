// Root of the personal agent. Where native voice can run, the live runtime owns one conversation
// for the whole app; elsewhere (web, Expo Go, a build without WebRTC) the agent is text and tap
// only, and nothing that depends on voice is shown.
import { useMemo, useState, type ReactNode } from "react";
import { router } from "expo-router";
import { api } from "@/api";
import { loadAgentRuntime } from "@/voice/availability";
import { AgentControlsContext, AgentStateContext, idleState, type AgentControls } from "./agentContext";

export function AgentProvider({ children }: { children: ReactNode }) {
  // Resolved once: the native module either exists in this build or it doesn't.
  const [Runtime] = useState(() => loadAgentRuntime());
  if (Runtime) return <Runtime>{children}</Runtime>;
  return <TextOnly>{children}</TextOnly>;
}

function TextOnly({ children }: { children: ReactNode }) {
  const controls = useMemo<AgentControls>(
    () => ({
      supported: false,
      // Nothing to connect: the same companion is available by typing in Ask.
      start: () => router.push("/ask"),
      end: () => {},
      expand: () => {},
      minimize: () => {},
      setMuted: () => {},
      stopTalking: () => {},
      sendText: () => false,
      dismissNotice: () => {},
      prepareCatchUp: () => api.createVoiceSession("catch_up"),
    }),
    [],
  );
  return (
    <AgentControlsContext.Provider value={controls}>
      <AgentStateContext.Provider value={idleState}>{children}</AgentStateContext.Provider>
    </AgentControlsContext.Provider>
  );
}
