import { useEffect, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import type { Concept, KnowledgeStateTransition } from "@thinketh/contracts";
import { color, font, motion, radius, space } from "@/theme/tokens";
import { evidenceLabel, fmt2, masteryLabel, observationLabel } from "@/lib/knowledge";
import { useReducedMotion } from "@/lib/hooks";
import { T } from "./Text";
import { Divider } from "./ui";

type Props = {
  transition: KnowledgeStateTransition;
  concepts: Concept[];
  onDone?: () => void;
};

// The signature moment: the model visibly changes, and says why.
export function KnowledgeStateTransitionView({ transition, concepts, onDone }: Props) {
  const reduced = useReducedMotion();
  const [progress] = useState(() => new Animated.Value(0));
  const [reveal] = useState(() => new Animated.Value(0));
  const [p, setP] = useState(0);
  const { before, after } = transition;
  const name = (id: string) => concepts.find((c) => c.id === id)?.name ?? id;
  const improved = after.mastery >= before.mastery;

  useEffect(() => {
    const id = progress.addListener(({ value }) => setP(value));
    if (reduced) {
      progress.setValue(1);
      reveal.setValue(1);
      onDone?.();
    } else {
      Animated.sequence([
        Animated.delay(350),
        Animated.timing(progress, {
          toValue: 1,
          duration: motion.transition,
          easing: Easing.bezier(0.2, 0.7, 0.2, 1),
          useNativeDriver: false,
        }),
        Animated.timing(reveal, { toValue: 1, duration: motion.small, useNativeDriver: false }),
      ]).start(() => onDone?.());
    }
    return () => progress.removeListener(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transition.id, reduced]);

  const lerp = (a: number, b: number) => a + (b - a) * p;
  const pct = (a: number, b: number) =>
    progress.interpolate({ inputRange: [0, 1], outputRange: [`${a * 100}%`, `${b * 100}%`] });

  const summary = `${name(transition.conceptId)}. Mastery ${fmt2(before.mastery)} to ${fmt2(after.mastery)}. Uncertainty ${fmt2(before.uncertainty)} to ${fmt2(after.uncertainty)}. ${transition.reason}`;

  return (
    <View style={styles.card} accessible accessibilityLabel={summary} accessibilityLiveRegion="polite">
      <T variant="label" tone={improved ? "coral" : "ink3"}>
        {improved ? "Your mental model was updated" : "Thinketh adjusted its model"}
      </T>
      <T variant="title" style={{ marginTop: space.s }}>
        {name(transition.conceptId)}
      </T>
      <T variant="support" style={{ marginTop: space.xs }}>
        {masteryLabel(before.mastery)}
        {masteryLabel(before.mastery) !== masteryLabel(after.mastery) ? ` → ${masteryLabel(after.mastery)}` : ""}
        {" · "}
        {evidenceLabel(after.uncertainty).toLowerCase()}
      </T>

      {/* The headline numbers count up live; each bar sits under its number. */}
      <View style={styles.bigRow}>
        <BigDelta
          label="Mastery"
          from={before.mastery}
          value={lerp(before.mastery, after.mastery)}
          width={pct(before.mastery, after.mastery)}
          fill={color.coral}
          emphasize={improved}
        />
        <BigDelta
          label="Uncertainty"
          from={before.uncertainty}
          value={lerp(before.uncertainty, after.uncertainty)}
          width={pct(before.uncertainty, after.uncertainty)}
          fill={color.ink}
        />
      </View>

      <Animated.View style={{ opacity: reveal, marginTop: space.xl }}>
        <Divider />
        <T variant="label" style={{ marginTop: space.l, marginBottom: space.s }}>
          Why it changed
        </T>
        <T variant="body">{transition.reason}</T>
        <T variant="meta" style={{ marginTop: space.m }}>
          {observationLabel[transition.observation.kind]} · signal weight {fmt2(transition.observation.weight)} · evidence{" "}
          {before.evidenceCount} → {after.evidenceCount}
        </T>

        {transition.propagatedChanges.length > 0 ? (
          <View style={{ marginTop: space.xl }}>
            <T variant="label" style={{ marginBottom: space.s }}>
              Also updated
            </T>
            {transition.propagatedChanges.map((c) => (
              <View key={c.conceptId} style={styles.propagated}>
                <T variant="body" style={{ fontFamily: "Inter_500Medium" }}>
                  {name(c.conceptId)}
                </T>
                <T variant="meta" style={{ fontVariant: ["tabular-nums"], marginTop: 2 }}>
                  {[
                    c.deltaMastery !== 0 ? `mastery ${signed(c.deltaMastery)}` : null,
                    c.deltaUncertainty !== 0 ? `uncertainty ${signed(c.deltaUncertainty)}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </T>
                <T variant="support" style={{ marginTop: 2 }}>
                  {c.reason}
                </T>
              </View>
            ))}
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

function BigDelta({
  label,
  from,
  value,
  width,
  fill,
  emphasize,
}: {
  label: string;
  from: number;
  value: number;
  width: Animated.AnimatedInterpolation<string>;
  fill: string;
  emphasize?: boolean;
}) {
  return (
    <View style={{ flex: 1 }}>
      <T variant="label">{label}</T>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: space.xs }}>
        <T style={styles.bigFrom}>{fmt2(from)}</T>
        <T style={styles.bigArrow}>→</T>
        <T style={[styles.bigTo, emphasize && { color: color.coral }]}>{fmt2(value)}</T>
      </View>
      <View style={[styles.track, { marginTop: space.s }]}>
        {/* Where it was: a quiet marker so the change is legible without color. */}
        <View style={[styles.ghost, { left: `${from * 100}%` }]} />
        <Animated.View style={[styles.fill, { width, backgroundColor: fill }]} />
      </View>
    </View>
  )
}

const signed = (n: number) => `${n > 0 ? "+" : "−"}${Math.abs(n).toFixed(2)}`;

const styles = StyleSheet.create({
  bigRow: { flexDirection: "row", gap: space.l, marginTop: space.xl },
  bigFrom: { fontFamily: font.sansMedium, fontSize: 17, color: color.ink3, fontVariant: ["tabular-nums"] },
  bigArrow: { fontFamily: font.sans, fontSize: 17, color: color.ink3 },
  bigTo: { fontFamily: font.serif, fontSize: 34, lineHeight: 40, color: color.ink, fontVariant: ["tabular-nums"] },
  card: {
    backgroundColor: color.panel,
    borderRadius: radius.feature,
    padding: space.xl,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  track: { height: 8, borderRadius: 4, backgroundColor: color.fog, overflow: "visible", justifyContent: "center" },
  fill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 4 },
  ghost: { position: "absolute", top: -4, bottom: -4, width: 2, marginLeft: -1, backgroundColor: color.ink3, zIndex: 2 },
  propagated: { paddingVertical: space.m, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.edge },
});
