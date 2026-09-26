// The idea being taught, as an object in the room, plus Thinketh's checkpoint and the learner's Mind.
// It only reaches the learner's Mind after the room records transfer_verified.
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { Icon } from "@/components/Icon";
import { T } from "@/components/Text";
import { color, font } from "@/theme/tokens";
import type { WorldConcept } from "./worldState";

type XY = { x: number; y: number };
const TOKEN_W = 112;
/** Carried above head height, so it never covers the agents. */
const LIFT = 120;

export function ConceptToken({ concept, to, tone, learnerTone, paused, reduced, onPress }: { concept: WorldConcept; to: XY; tone: string; learnerTone: string; paused: boolean; reduced: boolean; onPress: () => void }) {
  const [start] = useState(to);
  const x = useSharedValue(start.x);
  const y = useSharedValue(start.y);
  useEffect(() => {
    // Verified is the only move into the learner's Mind; it runs once, when newly observed.
    const d = reduced ? 0 : concept.state === "verified" ? 1100 : 800;
    x.set(d ? withTiming(to.x, { duration: d, easing: Easing.inOut(Easing.cubic) }) : to.x);
    y.set(d ? withTiming(to.y, { duration: d, easing: Easing.inOut(Easing.cubic) }) : to.y);
  }, [to.x, to.y, concept.state, reduced, x, y]);

  // A slow float while held or waiting; still when resolved, backgrounded or reduced.
  const float = useSharedValue(0);
  const moving = concept.state !== "verified" && concept.state !== "not_yet";
  useEffect(() => {
    cancelAnimation(float);
    float.set(0);
    if (paused || reduced || !moving) return;
    float.set(withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => cancelAnimation(float);
  }, [paused, reduced, moving, float]);

  const place = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() - TOKEN_W / 2 }, { translateY: y.get() - LIFT - float.get() * 3 }] }));
  const shadow = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() - 22 }, { translateY: y.get() - 4 }] }));

  const s = concept.state;
  const border = s === "not_yet" ? color.ink3 : s === "verified" ? learnerTone : s === "offered" || s === "shared" || s === "source" ? color.ink2 : tone;
  const bg = s === "verified" ? (learnerTone === color.coral ? color.coralTint : color.partnerTint) : "#FFFFFF";
  const caption = { offered: "can move", with_teacher: "being taught", checkpoint: "waiting at the check", grading: "Thinketh grading", verified: "verified", not_yet: "not verified yet", shared: "shared gap", source: "one source" }[s];

  return (
    <>
      <Animated.View style={[styles.floorShadow, { pointerEvents: "none" }, shadow]} />
      <Animated.View style={[styles.wrap, place]}>
        <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`The idea: ${concept.label}. ${caption}. Show the reason and evidence`} style={[styles.token, { borderColor: border, backgroundColor: bg, borderStyle: s === "offered" || s === "shared" ? "dashed" : "solid" }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            {s === "verified" ? <Icon name="check" size={11} color={color.ink} /> : null}
            <T style={styles.label} numberOfLines={2}>
              {concept.state === "source" ? "Source" : concept.label}
            </T>
          </View>
          <T style={[styles.caption, { color: s === "not_yet" ? color.ink3 : color.ink2 }]} numberOfLines={1}>
            {caption}
          </T>
        </Pressable>
      </Animated.View>
    </>
  );
}

/** Thinketh's checkpoint: two posts on the floor just short of the learner's Mind. */
export function CheckpointGate({ at, state, paused, reduced }: { at: XY; state: WorldConcept["state"]; paused: boolean; reduced: boolean }) {
  const pulse = useSharedValue(1);
  const grading = state === "grading";
  useEffect(() => {
    cancelAnimation(pulse);
    pulse.set(1);
    if (!grading || paused || reduced) return;
    pulse.set(withRepeat(withTiming(0.35, { duration: 700 }), -1, true));
    return () => cancelAnimation(pulse);
  }, [grading, paused, reduced, pulse]);
  const fade = useAnimatedStyle(() => ({ opacity: pulse.get() }));
  const ink = state === "not_yet" ? color.ink3 : color.ink;
  const word = state === "grading" ? "GRADING" : state === "verified" ? "PASSED" : state === "not_yet" ? "NOT YET" : "CHECK";
  return (
    <View style={{ position: "absolute", pointerEvents: "none", left: at.x - 14, top: at.y - 40, width: 28, height: 44, alignItems: "center" }}>
      <Animated.View style={[{ flexDirection: "row", justifyContent: "space-between", width: 28, height: 40 }, fade]}>
        <View style={[styles.post, { backgroundColor: ink }]} />
        <View style={[styles.bar, { backgroundColor: ink }]} />
        <View style={[styles.post, { backgroundColor: ink }]} />
      </Animated.View>
      <View style={[styles.gateBase, { borderColor: ink }]} />
      <T style={[styles.gateWord, { color: ink }]} accessible={false}>
        {word}
      </T>
    </View>
  );
}

/** The learner's Mind on the floor: dashed while unproven, solid once verified. */
export function MindRing({ at, tone, solid }: { at: XY; tone: string; solid: boolean }) {
  return <View style={[styles.ring, { pointerEvents: "none", left: at.x - 38, top: at.y - 9, borderColor: tone, borderStyle: solid ? "solid" : "dashed", backgroundColor: solid ? `${tone}14` : "transparent" }]} />;
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, top: 0, width: TOKEN_W, alignItems: "center" },
  token: { minWidth: 76, maxWidth: TOKEN_W, minHeight: 44, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10, borderWidth: 1.5, justifyContent: "center" },
  label: { fontFamily: font.sansSemibold, fontSize: 11.5, lineHeight: 14, color: color.ink, flexShrink: 1 },
  caption: { fontFamily: font.sans, fontSize: 10, lineHeight: 12, marginTop: 1 },
  floorShadow: { position: "absolute", left: 0, top: 0, width: 44, height: 8, borderRadius: 8, backgroundColor: "rgba(22,22,22,0.10)" },
  post: { width: 3, height: 40, borderRadius: 1.5 },
  bar: { position: "absolute", left: 0, right: 0, top: 0, height: 3, borderRadius: 1.5 },
  gateBase: { width: 34, height: 8, borderRadius: 8, borderWidth: 1, marginTop: -4, opacity: 0.35 },
  gateWord: { position: "absolute", top: -14, width: 70, left: -21, textAlign: "center", fontFamily: font.sansSemibold, fontSize: 9, letterSpacing: 0.8 },
  ring: { position: "absolute", width: 76, height: 16, borderRadius: 38, borderWidth: 1.5 },
});
