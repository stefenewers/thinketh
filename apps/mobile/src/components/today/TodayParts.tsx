import { type ReactNode } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from "react-native";
import { developmentDisplay, type Concept, type Development } from "@thinketh/contracts";
import { Icon } from "@/components/Icon";
import { T } from "@/components/Text";
import { BookGlyph } from "@/components/mind/world/Book";
import { TopicArt } from "@/components/TopicArt";
import { significanceLabel } from "@/lib/knowledge";
import { color, depth, DEPTH_INK, font, gutter, lift, space } from "@/theme/tokens";


export type TodayMetric = { value: string; label: string; sub: string; onPress?: () => void; accessibilityLabel?: string };

/** Four calm numbers: what Thinketh read, what's new, what connects, what it filtered. */
export function TodayMetrics({ metrics, style }: { metrics: TodayMetric[]; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.metrics, style]} accessibilityRole="summary">
      {metrics.map((m, i) => {
        const cell = (
          <View style={[styles.metric, i > 0 && styles.metricDivided]}>
            <T style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit>
              {m.value}
            </T>
            <T style={styles.metricLabel} numberOfLines={1} adjustsFontSizeToFit>
              {m.label}
            </T>
            <T style={styles.metricSub} numberOfLines={1}>
              {m.sub}
            </T>
          </View>
        );
        return m.onPress ? (
          <Pressable key={m.label} onPress={m.onPress} accessibilityRole="button" accessibilityLabel={m.accessibilityLabel ?? `${m.value} ${m.label}`} style={({ pressed }) => [styles.metricCell, pressed && { opacity: 0.6 }]}>
            {cell}
          </Pressable>
        ) : (
          <View key={m.label} style={styles.metricCell} accessible accessibilityLabel={m.accessibilityLabel ?? `${m.value} ${m.label} ${m.sub}`}>
            {cell}
          </View>
        );
      })}
    </View>
  );
}

/** The people around this knowledge: you and your Playground partner (portraits are local-only; initials otherwise). */

// The photo panel: the right 56% of the card, fading into the paper on its left edge.

/** The lead development as a compact feature story: text on the left, its photograph on the right. */
export function LeadStory({ development, concepts, art, artHeight, onPress }: { development: Development; concepts: Concept[]; art: (width: number, height: number) => ReactNode; artHeight: number; onPress: () => void }) {
  const { width } = useWindowDimensions();
  const w = width - gutter * 2;
  // Consumer headline on the home screen; the real title stays on the detail view (docs/PLAYGROUND.md).
  const display = developmentDisplay(development);
  return (
    // Shadow outside, clipping inside: iOS drops shadows on views that clip.
    <View style={styles.leadShadow}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Lead development. ${display.headline}. ${significanceLabel(development)}. ${concepts.length} connected ${concepts.length === 1 ? "concept" : "concepts"}.`}
        style={({ pressed }) => [styles.lead, pressed && { transform: [{ scale: 0.99 }] }]}
      >
        {/* A small preview from your Mind: the concept this story touches, as its book. Decorative. */}
        <View style={styles.leadArt}>{art(w, artHeight)}</View>
        <View style={styles.leadBody}>
          <View style={styles.leadTag}>
            <View style={styles.dot} />
            <T style={styles.leadTagText}>Lead development</T>
          </View>
          <T style={styles.leadTitle} numberOfLines={4}>
            {display.headline}
          </T>
          {display.summary ? (
            <T style={styles.leadSummary} numberOfLines={3}>
              {display.summary}
            </T>
          ) : null}
          <View style={styles.leadFooter}>
            <View style={styles.connected}>
              <BookGlyph size={16} />
              <T style={styles.connectedText} numberOfLines={1}>
                {concepts.length} connected {concepts.length === 1 ? "concept" : "concepts"}
              </T>
            </View>
            <View style={styles.leadArrow}>
              <Icon name="arrow" size={19} color={color.onInk} />
            </View>
          </View>
        </View>
      </Pressable>
    </View>
  );
}

/** One row of Recent new insights: a pixel object for its topic, the concept it touches, the headline, when. */
export function InsightItem({ development, category, meta, understood, last, onPress }: { development: Development; category: string; meta: string; understood: boolean; last: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${development.title}. ${significanceLabel(development)}.${understood ? " Understood." : ""}`}
      style={({ pressed }) => [styles.insight, pressed && { backgroundColor: color.surfaceMuted }]}
    >
      {/* A pixel object for the topic (decorative; the text beside it says what the story is). */}
      <TopicArt conceptIds={development.conceptIds} style={styles.insightThumb} />
      <View style={[styles.insightBody, !last && styles.insightDivided]}>
        <View style={{ flex: 1 }}>
          <View style={styles.categoryRow}>
            {understood ? <Icon name="check" size={11} color={color.ink2} /> : <View style={styles.dot} />}
            <T style={styles.category} numberOfLines={1}>
              {category}
            </T>
          </View>
          <T style={styles.insightTitle} numberOfLines={2}>
            {development.title}
          </T>
          {development.summaryBullets[0] ? (
            <T style={styles.insightSummary} numberOfLines={1}>
              {development.summaryBullets[0]}
            </T>
          ) : null}
        </View>
        <View style={styles.insightSide}>
          <T style={styles.insightTime}>{meta}</T>
          <Icon name="chevron" size={13} color={color.ink3} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  metrics: { flexDirection: "row" },
  // Sized by content, not equal quarters, so a long label ("Connected") is never cut at phone width.
  metricCell: { flexGrow: 1, flexShrink: 1, flexBasis: "auto" },
  metric: { paddingRight: 4, paddingVertical: 2 },
  metricDivided: { paddingLeft: 7, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: "rgba(22,22,22,0.07)" },
  metricValue: { fontFamily: font.sansSemibold, fontSize: 28, lineHeight: 32, letterSpacing: -0.8, color: color.ink, fontVariant: ["tabular-nums"] },
  metricLabel: { fontFamily: font.sansSemibold, fontSize: 9.5, lineHeight: 13, letterSpacing: 0.7, textTransform: "uppercase", color: color.ink3, marginTop: 6 },
  metricSub: { fontFamily: font.sans, fontSize: 11.5, lineHeight: 17, color: color.ink3, marginTop: 2 },


  // The strongest depth on the screen: the feature story.
  leadShadow: { marginTop: space.xl, borderRadius: 22, backgroundColor: color.canvas, ...depth.card },
  lead: { borderRadius: 22, overflow: "hidden", backgroundColor: color.canvas, borderWidth: StyleSheet.hairlineWidth, borderColor: color.hairline },
  leadArt: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.hairline },
  leadBody: { paddingHorizontal: space.xl, paddingTop: 18, paddingBottom: 16 },
  leadTag: { flexDirection: "row", alignItems: "center", gap: 7 },
  leadTagText: { fontFamily: font.sansSemibold, fontSize: 10.5, lineHeight: 13, letterSpacing: 1.8, textTransform: "uppercase", color: color.ink2 },
  leadTitle: { fontFamily: font.sansBold, fontSize: 20.5, lineHeight: 25, letterSpacing: -0.6, color: color.ink, marginTop: 10 },
  leadSummary: { fontFamily: font.sans, fontSize: 13.5, lineHeight: 19, color: color.ink2, marginTop: 6 },
  leadFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14 },
  connected: { flexDirection: "row", alignItems: "center", gap: space.s, flexShrink: 1 },
  person: { backgroundColor: color.canvas, alignItems: "center", justifyContent: "center" },
  connectedText: { fontFamily: font.sansMedium, fontSize: 13, lineHeight: 17, color: color.ink, flexShrink: 1 },
  leadArrow: { width: 48, height: 48, borderRadius: 24, backgroundColor: color.ink, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.3)", ...lift(DEPTH_INK, 0.24, 14, 5, 5) },

  insight: { flexDirection: "row", alignItems: "stretch", paddingLeft: space.m },
  insightThumb: { width: 76, height: 68, borderRadius: 14, alignSelf: "center", backgroundColor: color.surfaceMuted },
  insightBody: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.s, paddingVertical: space.l, paddingRight: space.m, marginLeft: space.m },
  insightDivided: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.hairline },
  categoryRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.coral },
  category: { fontFamily: font.sansMedium, fontSize: 12, lineHeight: 16, color: color.ink3, flexShrink: 1 },
  insightTitle: { fontFamily: font.sansSemibold, fontSize: 15.5, lineHeight: 20, letterSpacing: -0.25, color: color.ink, marginTop: 3 },
  insightSummary: { fontFamily: font.sans, fontSize: 13, lineHeight: 18, color: color.ink3, marginTop: 3 },
  insightSide: { alignItems: "flex-end", alignSelf: "stretch", justifyContent: "space-between", paddingVertical: 2, gap: space.s },
  insightTime: { fontFamily: font.sans, fontSize: 12, lineHeight: 16, color: color.ink3, fontVariant: ["tabular-nums"] },
});
