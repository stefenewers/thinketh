// Screens publish what the user is looking at while they are focused. See ./screenStore.
import { useCallback } from "react";
import { useFocusEffect } from "expo-router";
import type { AgentScreenContext } from "@thinketh/contracts";
import { clearScreen, publishScreen, type AgentEntry } from "./screenStore";

export * from "./screenStore";

/**
 * Publish this screen's context while it is focused. `ctx` may change as the user selects things;
 * it is republished only when its content changes, and the session debounces what it sends.
 */
export function useAgentScreen(ctx: AgentScreenContext | null, entry: AgentEntry = "float"): void {
  // The serialized context is both the dependency and the value: republished only when it changes.
  const key = ctx ? JSON.stringify(ctx) : "";
  useFocusEffect(
    useCallback(() => {
      if (!key) return;
      const mine = publishScreen(JSON.parse(key) as AgentScreenContext, entry);
      return () => clearScreen(mine);
    }, [key, entry]),
  );
}
