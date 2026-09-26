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
  { rx: 104, ry: 34, tilt: -20, opacity: 0.36 },
  { rx: 84, ry: 58, tilt: 34, opacity: 0.2 },
] as const;

type Tone = "coral" | "stone" | "ink";
// Satellites (offsets from the orb's centre) sit up and to the right, clear of the headline.
// Two larger translucent spheres sit "further back" (their edges dissolve instead of a blur
// filter); a few small nodes stay crisp. Offsets are from the orb's centre, clear of the text.
const SATELLITES: { dx: number; dy: number; r: number; tone: Tone; far?: boolean }[] = [
  { dx: -64, dy: -46, r: 13, tone: "coral", far: true },
  { dx: 72, dy: 60, r: 10, tone: "stone", far: true },
  { dx: 54, dy: -66, r: 4, tone: "coral" },
  { dx: 94, dy: 18, r: 3, tone: "ink" },
  { dx: -22, dy: -84, r: 3, tone: "stone" },
  { dx: 24, dy: 96, r: 2.5, tone: "coral" },
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
  const shown = SATELLITES.slice(0, Math.max(4, Math.min(6, satellites)));

  return (
    <View style={[styles.box, { pointerEvents: "none" }]} accessible={false} importantForAccessibility="no-hide-descendants">
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
            <RadialGradient id="farCoral" cx="42%" cy="38%" r="60%">
              <Stop offset="0" stopColor={warm.orbLight} stopOpacity={0.9} />
              <Stop offset="0.6" stopColor={warm.orbMid} stopOpacity={0.45} />
              <Stop offset="1" stopColor={warm.orbMid} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="farStone" cx="42%" cy="38%" r="60%">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.9} />
              <Stop offset="0.6" stopColor="#CFC8C2" stopOpacity={0.45} />
              <Stop offset="1" stopColor="#CFC8C2" stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="satInk" cx="35%" cy="30%" r="75%">
              <Stop offset="0" stopColor="#8E8C8A" />
              <Stop offset="1" stopColor="#262626" />
            </RadialGradient>
          </Defs>
          {ORBITS.map((o, i) => (
            <Ellipse key={i} cx={C.x} cy={C.y} rx={o.rx} ry={o.ry} transform={`rotate(${o.tilt} ${C.x} ${C.y})`} fill="none" stroke={warm.orbit} strokeOpacity={o.opacity} strokeWidth={0.9} />
          ))}
          {shown.map((s, i) => {
            const p = { x: C.x + s.dx, y: C.y + s.dy };
            return (
              <G key={i}>
                {lit && i === 2 ? <Circle cx={p.x} cy={p.y} r={s.r + 5} fill="none" stroke={warm.orbDeep} strokeOpacity={0.35} strokeWidth={1} /> : null}
                <Circle
                  cx={p.x}
                  cy={p.y}
                  r={s.far ? s.r * 1.25 : s.r}
                  fill={s.far ? (s.tone === "coral" ? "url(#farCoral)" : "url(#farStone)") : s.tone === "coral" ? "url(#satCoral)" : s.tone === "stone" ? "url(#satStone)" : "url(#satInk)"}
                />
              </G>
            );
          })}
        </Svg>
      </Animated.View>
      <Svg width={S} height={S} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="orbBody" cx="38%" cy="32%" r="72%" fx="34%" fy="28%">
              <Stop offset="0" stopColor={warm.orbLight} />
              <Stop offset="0.55" stopColor={warm.orbMid} stopOpacity={0.88} />
              <Stop offset="0.9" stopColor="#EE8C68" stopOpacity={0.72} />
              <Stop offset="1" stopColor="#EE8C68" stopOpacity={0.4} />
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
  box: { width: S, height: S, opacity: 0.78 },
});
