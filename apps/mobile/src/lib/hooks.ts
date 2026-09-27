import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Keyboard, Platform } from "react-native";
import { useFocusEffect } from "expo-router";

type AsyncState<T> = { data: T | null; error: unknown; loading: boolean; reload: () => void };
type Loaded<T> = { key: string; data: T | null; error: unknown };

// Loads data and (optionally) refreshes whenever the screen regains focus, so
// Today and Mind reflect knowledge updates made on other screens. Refreshes keep
// showing existing data instead of flashing a loader.
export function useApi<T>(
  fn: () => Promise<T>,
  deps: (string | number | undefined)[],
  { refetchOnFocus = false } = {},
): AsyncState<T> {
  const key = JSON.stringify(deps);
  const [nonce, setNonce] = useState(0);
  const [loaded, setLoaded] = useState<Loaded<T> | null>(null);

  useEffect(() => {
    let alive = true;
    fn().then(
      (data) => alive && setLoaded({ key, data, error: null }),
      (error) => alive && setLoaded((prev) => ({ key, data: prev?.key === key ? prev.data : null, error })),
    );
    return () => {
      alive = false;
    };
    // `fn` is intentionally re-read only when its inputs (deps) or nonce change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);

  const reload = useCallback(() => {
    setLoaded((prev) => (prev ? { ...prev, error: null } : prev));
    setNonce((n) => n + 1);
  }, []);

  // The first focus is the initial load; only later focuses refetch.
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!focusedOnce.current) focusedOnce.current = true;
      else if (refetchOnFocus) setNonce((n) => n + 1);
    }, [refetchOnFocus]),
  );

  const current = loaded?.key === key ? loaded : null;
  return {
    data: current?.data ?? null,
    error: current?.error ?? null,
    loading: !current || (current.data === null && !current.error),
    reload,
  };
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced).catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => sub.remove();
  }, []);
  return reduced;
}

/** Whether the software keyboard is up (iOS: as it starts to show, so layouts move with it). */
export function useKeyboardVisible(): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", () => setShown(true));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setShown(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return shown;
}
