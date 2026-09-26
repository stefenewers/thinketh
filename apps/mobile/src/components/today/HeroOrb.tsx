import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import Svg, { Circle, Defs, Ellipse, G, RadialGradient, Stop } from "react-native-svg";
import { warm } from "@/theme/tokens";

const S = 232;
const C = { x: S / 2, y: S / 2 };
const ORB_R = 36;

// Three tilted orbits (rx, ry, tilt in degrees), drawn as hairlines behind the text.
const ORBITS = [
  { rx: 104, ry: 36, tilt: -22, opacity: 0.62 },
  { rx: 86, ry: 62, tilt: 34, opacity: 0.42 },
  { rx: 112, ry: 24, tilt: 10, opacity: 0.34 },
] as const;

type Tone = "coral" | "stone" | "ink";
// Satellites (offsets from the orb's centre) sit up and to the right, clear of the headline.
const SATELLITES: { dx: number; dy: number; r: number; tone: Tone }[] = [
  { dx: 54, dy: -66, r: 6.5, tone: "coral" },
  { dx: -26, dy: -80, r: 4, tone: "stone" },
  { dx: 92, dy: 24, r: 4.5, tone: "ink" },
  { dx: 40, dy: 72, r: 5, tone: "coral" },
  { dx: 96, dy: -30, r: 3.5, tone: "stone" },
  { dx: 26, dy: 98, r: 3, tone: "coral" },
];

/**
 * The ambient intelligence object at the top of Today: a warm sphere (your Mind) with the
 * concepts today touched around it. `satellites` is the real count of connected concepts (3–6
 * drawn); `lit` rings one of them when something changed today. Decorative, so hidden from
 * screen readers.
 */
export function HeroOrb({ satellites, lit }: { satellites: number; lit: boolean }) {
  const reduce = useReducedMotion();
  // A slow float (a few points over seconds): alive, never busy. Still under Reduce Motion.
  const lift = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    lift.set(withRepeat(withTiming(1, { duration: 5200, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [reduce, lift]);
  const float = useAnimatedStyle(() => ({ transform: [{ translateY: -3 * lift.get() }] }));
  const shown = SATELLITES.slice(0, Math.max(3, Math.min(6, satellites)));

  return (
    <View style={styles.box} pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants">
      <Svg width={S} height={S} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="orbGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={warm.wash} stopOpacity={0.55} />
            <Stop offset="0.55" stopColor={warm.wash} stopOpacity={0.16} />
            <Stop offset="1" stopColor={warm.wash} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={C.x} cy={C.y} r={S / 2} fill="url(#orbGlow)" />
      </Svg>
      <Animated.View style={[StyleSheet.absoluteFill, float]}>
        <Svg width={S} height={S}>
          <Defs>
            <RadialGradient id="satCoral" cx="35%" cy="30%" r="75%">
              <Stop offset="0" stopColor={warm.orbLight} />
              <Stop offset="1" stopColor={warm.orbDeep} />
            </RadialGradient>
            <RadialGradient id="satStone" cx="35%" cy="30%" r="75%">
              <Stop offset="0" stopColor="#F6F4F2" />
              <Stop offset="1" stopColor="#AEA7A1" />
            </RadialGradient>
            <RadialGradient id="satInk" cx="35%" cy="30%" r="75%">
              <Stop offset="0" stopColor="#8E8C8A" />
              <Stop offset="1" stopColor="#262626" />
            </RadialGradient>
          </Defs>
          {ORBITS.map((o, i) => (
            <Ellipse key={i} cx={C.x} cy={C.y} rx={o.rx} ry={o.ry} rotation={o.tilt} origin={`${C.x}, ${C.y}`} fill="none" stroke={warm.orbit} strokeOpacity={o.opacity} strokeWidth={0.9} />
          ))}
          {shown.map((s, i) => {
            const p = { x: C.x + s.dx, y: C.y + s.dy };
            return (
              <G key={i}>
                {lit && i === 0 ? <Circle cx={p.x} cy={p.y} r={s.r + 5} fill="none" stroke={warm.orbDeep} strokeOpacity={0.35} strokeWidth={1} /> : null}
                <Circle cx={p.x} cy={p.y} r={s.r} fill={s.tone === "coral" ? "url(#satCoral)" : s.tone === "stone" ? "url(#satStone)" : "url(#satInk)"} />
              </G>
            );
          })}
        </Svg>
      </Animated.View>
      <Svg width={S} height={S} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="orbBody" cx="38%" cy="32%" r="72%" fx="34%" fy="28%">
              <Stop offset="0" stopColor={warm.orbLight} />
              <Stop offset="0.6" stopColor={warm.orbMid} stopOpacity={0.92} />
              <Stop offset="1" stopColor="#EE8C68" stopOpacity={0.9} />
          </RadialGradient>
        </Defs>
        <Circle cx={C.x} cy={C.y} r={ORB_R} fill="url(#orbBody)" />
        {/* A soft specular highlight: light, not gloss. */}
        <Ellipse cx={C.x - 11} cy={C.y - 13} rx={12} ry={8} fill="#FFFFFF" fillOpacity={0.28} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  // Atmosphere, not an object: the whole piece sits back behind the headline.
  box: { width: S, height: S, opacity: 0.72 },
});
