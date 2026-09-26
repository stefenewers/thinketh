import { type ReactNode, useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { GestureDetector, usePanGesture, usePinchGesture, useSimultaneousGestures, useTapGesture, useExclusiveGestures } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useReducedMotion } from "@/lib/hooks";

const MIN_SCALE = 0.85;
const MAX_SCALE = 2.6;
/** Touch targets: at least 44pt, whatever the node's drawn size. */
const HIT = 22;

export type HitNode = { id: string; x: number; y: number };

/**
 * Camera for a Mindprint: pan, pinch, tap to select, double-tap to reset.
 * Gestures run on the UI thread (shared values, no React renders per frame);
 * only the tap and the settled zoom level cross back to JS.
 */
export function MindCanvas({
  width,
  height,
  hits,
  onTapNode,
  onTapEmpty,
  onZoomSettled,
  resetKey,
  children,
}: {
  width: number;
  height: number;
  hits: HitNode[];
  onTapNode?: (id: string) => void;
  onTapEmpty?: () => void;
  /** Called with the settled scale so the caller can change level of detail. */
  onZoomSettled?: (scale: number) => void;
  /** Change to recentre the camera (e.g. a new focus). */
  resetKey?: string;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const s = useSharedValue(1);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startS = useSharedValue(1);

  useEffect(() => {
    const d = reduced ? 0 : 380;
    tx.set(withTiming(0, { duration: d }));
    ty.set(withTiming(0, { duration: d }));
    s.set(withTiming(1, { duration: d }));
  }, [resetKey, reduced, s, tx, ty]);

  const clampT = (v: number, extent: number, scale: number) => {
    "worklet";
    const max = (extent * (scale - 1)) / 2 + extent * 0.25;
    return Math.min(max, Math.max(-max, v));
  };

  const pan = usePanGesture({
    minDistance: 6,
    onActivate: () => {
      "worklet";
      startX.set(tx.get());
      startY.set(ty.get());
    },
    onUpdate: (e) => {
      "worklet";
      tx.set(clampT(startX.get() + e.translationX, width, s.get()));
      ty.set(clampT(startY.get() + e.translationY, height, s.get()));
    },
  });

  const pinch = usePinchGesture({
    onActivate: () => {
      "worklet";
      startS.set(s.get());
    },
    onUpdate: (e) => {
      "worklet";
      s.set(Math.min(MAX_SCALE, Math.max(MIN_SCALE, startS.get() * e.scale)));
    },
    onDeactivate: () => {
      "worklet";
      tx.set(clampT(tx.get(), width, s.get()));
      ty.set(clampT(ty.get(), height, s.get()));
      if (onZoomSettled) scheduleOnRN(onZoomSettled, s.get());
    },
  });

  // Tap hit-testing runs on JS: it needs the node list and calls into React.
  const tap = useTapGesture({
    runOnJS: true,
    maxDuration: 300,
    onDeactivate: (e) => {
      if (e.canceled) return;
      // Screen -> content coordinates (inverse of translate + scale about the centre).
      const cx = width / 2, cy = height / 2;
      const x = (e.x - cx - tx.get()) / s.get() + cx;
      const y = (e.y - cy - ty.get()) / s.get() + cy;
      let best: HitNode | null = null;
      let bestD = (HIT / s.get()) ** 2 + HIT * HIT * 0.5;
      for (const n of hits) {
        const d = (n.x - x) ** 2 + (n.y - y) ** 2;
        if (d < bestD) { best = n; bestD = d; }
      }
      if (best) onTapNode?.(best.id);
      else onTapEmpty?.();
    },
  });

  const doubleTap = useTapGesture({
    numberOfTaps: 2,
    runOnJS: true,
    onDeactivate: (e) => {
      if (e.canceled) return;
      tx.set(withTiming(0));
      ty.set(withTiming(0));
      s.set(withTiming(1));
      onZoomSettled?.(1);
    },
  });

  const taps = useExclusiveGestures(doubleTap, tap);
  const gesture = useSimultaneousGestures(pan, pinch, taps);

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: tx.get() }, { translateY: ty.get() }, { scale: s.get() }] }));

  return (
    <GestureDetector gesture={gesture}>
      <View style={[styles.frame, { width, height }]} collapsable={false}>
        <Animated.View style={[{ width, height }, style]}>{children}</Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({ frame: { overflow: "hidden" } });
