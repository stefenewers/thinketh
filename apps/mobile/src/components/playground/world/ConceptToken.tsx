// The idea the agents exchange, as an object in the room: offered between them, carried by the
// teaching agent, then shared once a sourced takeaway is saved.
import { useEffect, useState } from "react";
import { Pressable, StyleSheet } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { T } from "@/components/Text";
import { color, font } from "@/theme/tokens";
import type { WorldConcept } from "./worldState";

type XY = { x: number; y: number };
const TOKEN_W = 112;
/** Carried above head height, so it never covers the agents. */
const LIFT = 120;

export function ConceptToken({ concept, to, tone, paused, reduced, onPress }: { concept: WorldConcept; to: XY; tone: string; paused: boolean; reduced: boolean; onPress: () => void }) {
  const [start] = useState(to);
  const x = useSharedValue(start.x);
  const y = useSharedValue(start.y);
  useEffect(() => {
    const d = reduced ? 0 : 800;
    x.set(d ? withTiming(to.x, { duration: d, easing: Easing.inOut(Easing.cubic) }) : to.x);
    y.set(d ? withTiming(to.y, { duration: d, easing: Easing.inOut(Easing.cubic) }) : to.y);
  }, [to.x, to.y, reduced, x, y]);

  // A slow float while held; still when backgrounded or reduced.
  const float = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(float);
    float.set(0);
    if (paused || reduced) return;
    float.set(withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => cancelAnimation(float);
  }, [paused, reduced, float]);

  const place = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() - TOKEN_W / 2 }, { translateY: y.get() - LIFT - float.get() * 3 }] }));
  const shadow = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() - 22 }, { translateY: y.get() - 4 }] }));

  const s = concept.state;
  const border = s === "with_teacher" ? tone : color.ink2;
  const caption = { offered: "can move", with_teacher: "being taught", shared: "takeaway saved" }[s];

  return (
    <>
      <Animated.View style={[styles.floorShadow, { pointerEvents: "none" }, shadow]} />
      <Animated.View style={[styles.wrap, place]}>
        <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`The idea: ${concept.label}. ${caption}. Show the reason and evidence`} style={[styles.token, { borderColor: border, backgroundColor: "#FFFFFF", borderStyle: s === "offered" ? "dashed" : "solid" }]}>
          <T style={styles.label} numberOfLines={2}>
            {concept.label}
          </T>
          <T style={[styles.caption, { color: color.ink2 }]} numberOfLines={1}>
            {caption}
          </T>
        </Pressable>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, top: 0, width: TOKEN_W, alignItems: "center" },
  token: { minWidth: 76, maxWidth: TOKEN_W, minHeight: 44, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10, borderWidth: 1.5, justifyContent: "center" },
  label: { fontFamily: font.sansSemibold, fontSize: 11.5, lineHeight: 14, color: color.ink, flexShrink: 1 },
  caption: { fontFamily: font.sans, fontSize: 10, lineHeight: 12, marginTop: 1 },
  floorShadow: { position: "absolute", left: 0, top: 0, width: 44, height: 8, borderRadius: 8, backgroundColor: "rgba(22,22,22,0.10)" },
});
