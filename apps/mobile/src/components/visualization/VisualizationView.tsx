import { useEffect, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import type { VisualizationSpec } from "@thinketh/contracts";
import { T } from "@/components/Text";
import { useReducedMotion } from "@/lib/hooks";
import { color, font, space } from "@/theme/tokens";
import { framedCallouts } from "./layout";
import { PixelIcon } from "./PixelIcon";
import { Callout, VisualizationDiagram } from "./VisualizationDiagram";

/** The whole "Visualize this" composition: headline, framing line, the diagram, the takeaway. */
export function VisualizationView({ spec }: { spec: VisualizationSpec }) {
  const inFrames = spec.visualizationType === "quantitative" ? new Set<number>() : framedCallouts(spec);
  const loose = spec.callouts.filter((_, i) => !inFrames.has(i));
  return (
    <View>
      <T variant="display" accessibilityRole="header" style={styles.title}>
        {spec.title}
      </T>
      <T variant="support" style={styles.subtitle}>
        {spec.subtitle}
      </T>
      <View style={{ marginTop: space.xl }}>{spec.visualizationType === "quantitative" ? <Bars spec={spec} /> : <VisualizationDiagram spec={spec} />}</View>
      {loose.map((c, i) => (
        <View key={i} style={{ marginTop: space.l }}>
          <Callout callout={c} />
        </View>
      ))}
      <View style={styles.takeaway}>
        <T style={styles.takeawayLabel}>{spec.takeawayLabel}</T>
        <T style={styles.takeawayText}>{spec.takeaway}</T>
      </View>
    </View>
  );
}

/** Quantitative topics only: proportional bars that grow in once, the emphasised one in coral. */
function Bars({ spec }: { spec: VisualizationSpec }) {
  const reduced = useReducedMotion();
  const rows = spec.nodes.filter((n) => n.value !== undefined);
  const max = Math.max(...rows.map((n) => n.value!), 1e-9);
  const [grow] = useState(() => rows.map(() => new Animated.Value(reduced ? 1 : 0)));
  const [track, setTrack] = useState(0);
  useEffect(() => {
    if (reduced || !track) return;
    const anim = Animated.stagger(140, grow.map((v) => Animated.timing(v, { toValue: 1, duration: 520, easing: Easing.bezier(0.3, 0.1, 0.25, 1), useNativeDriver: false })));
    anim.start();
    return () => anim.stop();
  }, [reduced, track, grow]);
  return (
    <View accessible accessibilityLabel={rows.map((n) => `${n.label}: ${n.value}${spec.unit ? ` ${spec.unit}` : ""}`).join(". ")}>
      {rows.map((n, i) => (
        <View key={n.id} style={{ marginBottom: space.l }}>
          <View style={styles.barHead}>
            {n.icon ? <PixelIcon name={n.icon} size={24} /> : null}
            <T style={[styles.barLabel, { flex: 1 }]} numberOfLines={2}>
              {n.label}
            </T>
            <T style={[styles.barValue, n.emphasis === "primary" && { color: color.coral }]}>
              {formatValue(n.value!)}
              {spec.unit ? ` ${spec.unit}` : ""}
            </T>
          </View>
          <View style={styles.barTrack} onLayout={(e) => setTrack(e.nativeEvent.layout.width)}>
            <Animated.View
              style={[
                styles.bar,
                n.emphasis === "primary" && { backgroundColor: color.coral },
                { width: grow[i]!.interpolate({ inputRange: [0, 1], outputRange: [0, Math.max(4, (track * n.value!) / max)] }) },
              ]}
            />
          </View>
          {n.description ? <T style={styles.barNote}>{n.description}</T> : null}
        </View>
      ))}
    </View>
  );
}

const formatValue = (v: number) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString("en-US") : String(Math.round(v * 100) / 100));

/** While the planner works: the real header, and the shape of a diagram settling in. */
export function VisualizationSkeleton() {
  const reduced = useReducedMotion();
  const [pulse] = useState(() => new Animated.Value(0.55));
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.55, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, pulse]);
  return (
    <View accessibilityLiveRegion="polite" accessibilityLabel="Building the clearest view">
      <Animated.View style={{ opacity: pulse }}>
        <View style={[styles.bone, { width: "78%", height: 26 }]} />
        <View style={[styles.bone, { width: "92%", height: 14, marginTop: space.m }]} />
        <View style={styles.skeletonFrame}>
          <View style={[styles.bone, { width: 90, height: 11, backgroundColor: "#E6E1DB" }]} />
          <View style={styles.skeletonRow}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={styles.skeletonCard} />
            ))}
          </View>
        </View>
        <View style={styles.skeletonStem} />
        <View style={[styles.skeletonFrame, { backgroundColor: "#FAEFEA" }]}>
          <View style={[styles.bone, { width: 70, height: 11, backgroundColor: "#EFD9CF" }]} />
          <View style={styles.skeletonRow}>
            {[0, 1].map((i) => (
              <View key={i} style={styles.skeletonCard} />
            ))}
          </View>
        </View>
      </Animated.View>
      <T variant="support" style={{ marginTop: space.l, textAlign: "center" }}>
        Building the clearest view…
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, lineHeight: 33, letterSpacing: -0.8 },
  subtitle: { marginTop: space.s, fontSize: 16, lineHeight: 22 },
  takeaway: { marginTop: space.xl, padding: space.l, borderRadius: 18, backgroundColor: color.panel, borderWidth: StyleSheet.hairlineWidth, borderColor: color.hairline },
  takeawayLabel: { fontFamily: font.sansSemibold, fontSize: 11.5, lineHeight: 15, letterSpacing: 1.8, textTransform: "uppercase", color: color.ink3 },
  takeawayText: { fontFamily: font.sans, fontSize: 18, lineHeight: 25, letterSpacing: -0.2, color: color.ink, marginTop: space.s },
  barHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  barLabel: { fontFamily: font.sansSemibold, fontSize: 14, lineHeight: 18, color: color.ink },
  barValue: { fontFamily: font.sansSemibold, fontSize: 14, lineHeight: 18, color: color.ink2, fontVariant: ["tabular-nums"] },
  barTrack: { height: 10, borderRadius: 5, backgroundColor: "#EFEBE6", overflow: "hidden" },
  bar: { height: 10, borderRadius: 5, backgroundColor: "#BDB7B0" },
  barNote: { fontFamily: font.sans, fontSize: 12, lineHeight: 16, color: color.ink3, marginTop: 6 },
  bone: { borderRadius: 8, backgroundColor: color.fog },
  skeletonFrame: { marginTop: space.xl, padding: 14, borderRadius: 20, backgroundColor: "#F4F1EE" },
  skeletonRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  skeletonCard: { flex: 1, height: 92, borderRadius: 16, backgroundColor: color.panel },
  skeletonStem: { alignSelf: "center", width: 2, height: 32, marginTop: space.s, backgroundColor: "#E7C9BD" },
});
