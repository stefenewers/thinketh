import { useEffect, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import * as Haptics from "expo-haptics";
import type { Concept, KnowledgeStateTransition } from "@thinketh/contracts";
import { color, font, motion, space } from "@/theme/tokens";
import { evidenceLabel, fmt2, masteryLabel, misconceptionLabel, observationLabel } from "@/lib/knowledge";
import { useReducedMotion } from "@/lib/hooks";
import { T } from "./Text";

type Props = {
  transition: KnowledgeStateTransition;
  concepts: Concept[];
  onDone?: () => void;
};

/**
 * The Knowledge Update moment. Still until the model changes; then a single
 * coral knowledge trace on the concept, and only what the transition actually
 * contains: level, a resolved misconception, connected concepts that moved,
 * the evidence added. Raw numbers sit one tap away.
 */
export function KnowledgeStateTransitionView({ transition, concepts, onDone }: Props) {
  const reduced = useReducedMotion();
  const [trace] = useState(() => new Animated.Value(0));
  const [level] = useState(() => new Animated.Value(0));
  const [details] = useState(() => new Animated.Value(0));
  const [numbersOpen, setNumbersOpen] = useState(false);
  const { before, after } = transition;
  const name = (id: string) => concepts.find((c) => c.id === id)?.name ?? id;
  const improved = after.mastery > before.mastery;

  const levelBefore = masteryLabel(before.mastery);
  const levelAfter = masteryLabel(after.mastery);
  const evidenceBefore = evidenceLabel(before.uncertainty);
  const evidenceAfter = evidenceLabel(after.uncertainty);
  const resolved = before.misconceptionFlags.filter((f) => !after.misconceptionFlags.includes(f));
  const flagged = after.misconceptionFlags.filter((f) => !before.misconceptionFlags.includes(f));
  const strengthened = transition.propagatedChanges.filter((c) => c.deltaMastery > 0);
  const why = transition.reason.split(/(?<=\.)\s/)[0] ?? transition.reason;

  useEffect(() => {
    if (reduced) {
      trace.setValue(1);
      level.setValue(1);
      details.setValue(1);
      onDone?.();
      return;
    }
    const ease = Easing.bezier(0.2, 0.7, 0.2, 1);
    // ~1.7s: pause, trace, the level resolves, then the consequences, then calm.
    Animated.sequence([
      Animated.delay(300),
      Animated.parallel([
        Animated.timing(trace, { toValue: 1, duration: 700, easing: ease, useNativeDriver: true }),
        Animated.timing(level, { toValue: 1, duration: motion.shared, delay: 250, easing: ease, useNativeDriver: true }),
      ]),
      Animated.timing(details, { toValue: 1, duration: motion.screen, easing: ease, useNativeDriver: true }),
    ]).start(() => onDone?.());
    const h = setTimeout(() => {
      if (improved) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }, 320);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transition.id, reduced]);

  const summary = [
    `${name(transition.conceptId)}: ${levelBefore}${levelBefore !== levelAfter ? ` to ${levelAfter}` : ""}.`,
    evidenceBefore !== evidenceAfter ? `${evidenceBefore} to ${evidenceAfter}.` : "",
    resolved.length ? `Misconception resolved: ${resolved.map(misconceptionLabel).join("; ")}.` : "",
    why,
  ].join(" ");

  const rise = (v: Animated.Value) => ({ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] });

  return (
    <View accessible accessibilityLabel={summary} accessibilityLiveRegion="polite">
      <T variant="label" tone={improved ? "coral" : "ink3"}>
        {improved ? "Your understanding changed." : "Thinketh adjusted its model."}
      </T>

      {/* The concept, with a single coral knowledge trace. */}
      <View style={styles.conceptRow}>
        <View style={styles.markerBox}>
          {improved && !reduced ? (
            <Animated.View
              style={[
                styles.ring,
                {
                  opacity: trace.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.7, 0] }),
                  transform: [{ scale: trace.interpolate({ inputRange: [0, 1], outputRange: [0.6, 2.6] }) }],
                },
              ]}
            />
          ) : null}
          <View style={[styles.marker, improved && { backgroundColor: color.coral, borderColor: color.coral }]} />
        </View>
        <T variant="title" style={{ flex: 1 }}>
          {name(transition.conceptId)}
        </T>
      </View>

      <Animated.View style={[{ marginTop: space.m }, rise(level)]}>
        {levelBefore !== levelAfter ? (
          <T variant="section">
            {levelBefore} <T variant="section" style={{ color: color.ink3 }}>→</T> <T variant="section" tone="coral">{levelAfter}</T>
          </T>
        ) : (
          <T variant="section">
            {levelAfter}
            <T variant="section" style={{ color: color.ink3 }}>
              {improved ? ", on firmer ground" : ""}
            </T>
          </T>
        )}
      </Animated.View>

      <Animated.View style={[{ marginTop: space.xl, gap: space.l }, rise(details)]}>
        {resolved.length ? (
          <Fact label="Misconception resolved" accent>
            {resolved.map((f) => `“${capitalize(misconceptionLabel(f))}”`).join("\n")}
          </Fact>
        ) : null}
        {flagged.length ? <Fact label="Confusion noted">{flagged.map((f) => capitalize(misconceptionLabel(f))).join("\n")}</Fact> : null}
        {evidenceBefore !== evidenceAfter ? (
          <Fact label="Uncertainty reduced">
            {evidenceBefore} → {evidenceAfter}
          </Fact>
        ) : null}
        {strengthened.length ? (
          <Fact label={strengthened.length === 1 ? "Connected concept strengthened" : "Connected concepts strengthened"}>
            {strengthened.map((c) => name(c.conceptId)).join(" · ")}
          </Fact>
        ) : null}
        <Fact label="Evidence added">
          {observationLabel[transition.observation.kind]}. {why.replace(/^Updated because you /i, "You ")}
        </Fact>

        <Pressable onPress={() => setNumbersOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: numbersOpen }} hitSlop={8} style={styles.numbersToggle}>
          <T variant="meta">{numbersOpen ? "Hide the numbers" : "See the numbers"}</T>
        </Pressable>
        {numbersOpen ? (
          <View style={styles.numbers}>
            <Num label="Mastery" from={before.mastery} to={after.mastery} />
            <Num label="Uncertainty" from={before.uncertainty} to={after.uncertainty} />
            <T variant="meta" style={{ marginTop: space.s }}>
              Evidence {before.evidenceCount} → {after.evidenceCount} · signal weight {fmt2(transition.observation.weight)}
            </T>
            {strengthened.length ? (
              <T variant="meta" style={{ marginTop: space.xs }}>
                {strengthened.map((c) => `${name(c.conceptId)} +${c.deltaMastery.toFixed(2)}`).join(" · ")}
              </T>
            ) : null}
            <T variant="support" style={{ marginTop: space.m }}>
              {transition.reason}
            </T>
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

function Fact({ label, children, accent }: { label: string; children: string | string[]; accent?: boolean }) {
  return (
    <View style={[styles.fact, { borderLeftColor: accent ? color.coral : color.edge }]}>
      <T variant="label" tone={accent ? "coral" : undefined}>
        {label}
      </T>
      <T variant="body" style={{ marginTop: 2 }}>
        {children}
      </T>
    </View>
  );
}

function Num({ label, from, to }: { label: string; from: number; to: number }) {
  return (
    <View style={styles.numRow}>
      <T variant="meta" style={{ width: 96 }}>
        {label}
      </T>
      <T variant="body" style={styles.tabular}>
        {fmt2(from)} → {fmt2(to)}
      </T>
    </View>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const styles = StyleSheet.create({
  conceptRow: { flexDirection: "row", alignItems: "center", gap: space.m, marginTop: space.m },
  markerBox: { width: 16, height: 16, alignItems: "center", justifyContent: "center" },
  marker: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: color.ink2, backgroundColor: color.ground },
  ring: { position: "absolute", width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: color.coral },
  fact: { borderLeftWidth: 2, paddingLeft: space.l },
  numbersToggle: { alignSelf: "flex-start", minHeight: 32, justifyContent: "center" },
  numbers: { paddingTop: space.s },
  numRow: { flexDirection: "row", alignItems: "baseline" },
  tabular: { fontFamily: font.sansMedium, fontVariant: ["tabular-nums"] },
});
