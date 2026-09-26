// One agent: a pixel sprite that idles, steps while it moves, faces who it's talking to, and reacts once.
// Frames advance on the UI thread (Reanimated); position changes walk, and a fresh mount starts settled.
import { useEffect, useState } from "react";
import { Image, Platform, Pressable, StyleSheet, View, type ImageStyle } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { T } from "@/components/Text";
import { color, font } from "@/theme/tokens";
import type { SpriteStrip } from "./assets";

type XY = { x: number; y: number };

/** Crisp pixels on web (native images are pre-scaled 1:1 for @3x). */
const pixelated = (Platform.OS === "web" ? { imageRendering: "pixelated" } : {}) as ImageStyle;
const WALK_PT_PER_S = 110;

export function Character({
  sprite,
  to,
  from,
  facing,
  tone,
  label,
  tag,
  react,
  paused,
  reduced,
  a11y,
  onPress,
}: {
  sprite: SpriteStrip;
  /** Where the feet stand, in scene points. */
  to: XY;
  /** Only read on mount: walk in from here (a newly observed arrival). */
  from?: XY;
  facing: "left" | "right";
  tone: string;
  label: string;
  tag?: string;
  /** One-time reaction (a newly observed verification). */
  react: boolean;
  paused: boolean;
  reduced: boolean;
  a11y: string;
  onPress: () => void;
}) {
  const size = sprite.frame;
  const [start] = useState(() => from ?? to);
  const x = useSharedValue(start.x);
  const y = useSharedValue(start.y);
  const hop = useSharedValue(0);
  // While walking: 1 right, -1 left; 0 at rest. Lives on the UI thread with the motion itself.
  const heading = useSharedValue(0);

  // Walk to a new place. A remount starts at the settled place, so nothing replays.
  useEffect(() => {
    const dx = to.x - x.get();
    const dist = Math.hypot(dx, to.y - y.get());
    if (dist < 1) return;
    if (reduced) {
      x.set(to.x);
      y.set(to.y);
      return;
    }
    const duration = Math.max(450, Math.min(1800, (dist / WALK_PT_PER_S) * 1000));
    heading.set(dx < 0 ? -1 : 1);
    x.set(
      withTiming(to.x, { duration, easing: Easing.inOut(Easing.quad) }, () => {
        heading.set(0);
      }),
    );
    y.set(withTiming(to.y, { duration, easing: Easing.inOut(Easing.quad) }));
  }, [to.x, to.y, reduced, x, y, heading]);

  // A single restrained reaction: a small hop. Never on a remount, never with reduced motion.
  useEffect(() => {
    if (!react || reduced) return;
    hop.set(withSequence(withTiming(-7, { duration: 170, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 240, easing: Easing.in(Easing.quad) })));
  }, [react, reduced, hop]);

  // A clock in seconds drives the frames: idle bob at rest, stepping while walking. Stops when backgrounded or reduced.
  const clock = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(clock);
    clock.set(0);
    if (paused || reduced) return;
    clock.set(withRepeat(withTiming(120, { duration: 120_000, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(clock);
  }, [paused, reduced, clock]);

  const { idle, step } = sprite.clips;
  const faceLeft = facing === "left";
  const strip = useAnimatedStyle(() => {
    const c = heading.get() !== 0 ? step : idle;
    const i = c.start + (Math.floor(clock.get() * c.fps) % c.count);
    return { transform: [{ translateX: -i * size }] };
  });
  const mirror = useAnimatedStyle(() => {
    const left = heading.get() !== 0 ? heading.get() < 0 : faceLeft;
    return { transform: [{ scaleX: left ? -1 : 1 }] };
  });
  const place = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() - size / 2 }, { translateY: y.get() - size + hop.get() }] }));

  return (
    <Animated.View style={[styles.wrap, { width: size }, place]}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} hitSlop={6} style={{ alignItems: "center" }}>
        <View style={[styles.shadow, { width: size * 0.62, left: size * 0.19, top: size - 6 }]} />
        <Animated.View style={[{ width: size, height: size, overflow: "hidden" }, mirror]}>
          <Animated.View style={[{ width: size * sprite.frames, height: size }, strip]}>
            <Image source={sprite.source} style={[{ width: size * sprite.frames, height: size }, pixelated]} resizeMode="stretch" />
          </Animated.View>
        </Animated.View>
        <View style={styles.nameRow}>
          <View style={[styles.dot, { backgroundColor: tone }]} />
          <T style={styles.name} numberOfLines={1}>
            {label}
          </T>
        </View>
        {tag ? (
          <T style={styles.tag} numberOfLines={1}>
            {tag}
          </T>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, top: 0, alignItems: "center", overflow: "visible" },
  shadow: { position: "absolute", height: 8, borderRadius: 8, backgroundColor: "rgba(22,22,22,0.12)" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 1, width: 110, justifyContent: "center" },
  dot: { width: 6, height: 6, borderRadius: 3 },
  name: { fontFamily: font.sansSemibold, fontSize: 12, lineHeight: 15, color: color.ink },
  tag: { fontFamily: font.sans, fontSize: 10, lineHeight: 12, color: color.ink3, width: 150, textAlign: "center" },
});
