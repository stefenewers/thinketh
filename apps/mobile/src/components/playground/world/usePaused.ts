// Pixel scenes pause their animation when the app is backgrounded or another screen covers them.
import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";

export function usePaused() {
  const [bg, setBg] = useState(AppState.currentState !== "active");
  const [covered, setCovered] = useState(false);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => setBg(s !== "active"));
    return () => sub.remove();
  }, []);
  useFocusEffect(
    useCallback(() => {
      setCovered(false);
      return () => setCovered(true);
    }, []),
  );
  return bg || covered;
}
