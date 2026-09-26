import { Pressable, StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from "react-native-svg";
import type { Concept, Development } from "@thinketh/contracts";
import { Icon } from "@/components/Icon";
import { T } from "@/components/Text";
import { Texture } from "@/components/Texture";
import { storyImageFor } from "@/content/imagery";
import { significanceLabel } from "@/lib/knowledge";
import { color, font, gutter, shadow, space, warm } from "@/theme/tokens";

/** The warm light behind the top of Today: one soft peach bloom, upper right, fading to white. */
export function TodayWash({ height = 620 }: { height?: number }) {
  const { width } = useWindowDimensions();
  return (
    <View style={[StyleSheet.absoluteFill, { height }]} pointerEvents="none">
      <Svg width={width} height={height}>
        <Defs>
          <RadialGradient id="todayWash" cx="82%" cy="20%" rx="78%" ry="52%">
            <Stop offset="0" stopColor={warm.wash} stopOpacity={0.34} />
            <Stop offset="0.55" stopColor={warm.wash} stopOpacity={0.1} />
            <Stop offset="1" stopColor={warm.wash} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill="url(#todayWash)" />
      </Svg>
    </View>
  );
}

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
          <Pressable key={m.label} onPress={m.onPress} accessibilityRole="button" accessibilityLabel={m.accessibilityLabel ?? `${m.value} ${m.label}`} style={({ pressed }) => [{ flex: 1 }, pressed && { opacity: 0.6 }]}>
            {cell}
          </Pressable>
        ) : (
          <View key={m.label} style={{ flex: 1 }} accessible accessibilityLabel={m.accessibilityLabel ?? `${m.value} ${m.label} ${m.sub}`}>
            {cell}
          </View>
        );
      })}
    </View>
  );
}

/** Overlapping photo chips, one per connected concept (each concept's own Today photograph). */
export function ConceptStack({ concepts, size = 30 }: { concepts: Concept[]; size?: number }) {
  return (
    <View style={{ flexDirection: "row" }} accessible={false}>
      {concepts.slice(0, 3).map((c, i) => (
        <View key={c.id} style={[styles.chip, { width: size, height: size, borderRadius: size / 2, marginLeft: i ? -size * 0.32 : 0, zIndex: 3 - i }]}>
          <Texture source={storyImageFor([c.id])} style={{ width: size - 4, height: size - 4, borderRadius: (size - 4) / 2 }} />
        </View>
      ))}
    </View>
  );
}

/** The lead development as a feature story: its photograph fills the right, the story reads on warm paper. */
export function LeadStory({ development, understood, concepts, onPress }: { development: Development; understood: boolean; concepts: Concept[]; onPress: () => void }) {
  const { width } = useWindowDimensions();
  const w = width - gutter * 2;
  const sources = development.sourceIds.length;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Lead development. ${development.title}. ${significanceLabel(development)}. ${concepts.length} connected concepts, ${sources} sources.`}
      style={({ pressed }) => [styles.lead, pressed && { transform: [{ scale: 0.99 }] }]}
    >
      <Texture source={storyImageFor(development.conceptIds)} style={[styles.leadImage, { width: w * 0.7 }]} />
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="leadPaper" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={warm.paper} stopOpacity={1} />
              <Stop offset="0.36" stopColor={warm.paper} stopOpacity={0.97} />
              <Stop offset="0.52" stopColor={warm.paper} stopOpacity={0.7} />
              <Stop offset="0.74" stopColor={warm.paper} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width="100%" height="100%" fill="url(#leadPaper)" />
        </Svg>
      </View>
      <View style={styles.leadBody}>
        <View style={styles.leadTag}>
          <View style={styles.dot} />
          <T style={styles.leadTagText}>Lead development</T>
        </View>
        <T style={styles.leadTitle} numberOfLines={4}>
          {development.title}
        </T>
        {development.summaryBullets[0] ? (
          <T style={styles.leadSummary} numberOfLines={3}>
            {development.summaryBullets[0]}
          </T>
        ) : null}
        <View style={styles.leadMetaRow}>
          {understood ? <Icon name="check" size={12} color={color.ink2} /> : null}
          <T style={styles.leadMeta} numberOfLines={1}>
            {understood ? "Understood" : significanceLabel(development)} · {sources} {sources === 1 ? "source" : "sources"}
          </T>
        </View>
        <View style={styles.leadFooter}>
          <View style={styles.connected}>
            <ConceptStack concepts={concepts} />
            <T style={styles.connectedText} numberOfLines={1}>
              {concepts.length} connected {concepts.length === 1 ? "concept" : "concepts"}
            </T>
            <Icon name="chevron" size={12} color={color.ink} />
          </View>
          <View style={styles.leadArrow}>
            <Icon name="arrow" size={20} color={color.onInk} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/** One row of Recent new insights: a photograph, the concept it touches, the headline, when. */
export function InsightItem({ development, category, meta, understood, last, onPress }: { development: Development; category: string; meta: string; understood: boolean; last: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${development.title}. ${significanceLabel(development)}.${understood ? " Understood." : ""}`}
      style={({ pressed }) => [styles.insight, pressed && { backgroundColor: color.surfaceMuted }]}
    >
      <Texture source={storyImageFor(development.conceptIds)} style={styles.insightThumb} />
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
  metric: { paddingRight: 4 },
  metricDivided: { paddingLeft: 12, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: "rgba(22,22,22,0.14)" },
  metricValue: { fontFamily: font.sansBold, fontSize: 28, lineHeight: 33, letterSpacing: -0.9, color: color.ink, fontVariant: ["tabular-nums"] },
  metricLabel: { fontFamily: font.sansSemibold, fontSize: 10, lineHeight: 13, letterSpacing: 1.25, textTransform: "uppercase", color: color.ink2, marginTop: space.s },
  metricSub: { fontFamily: font.sans, fontSize: 12, lineHeight: 17, color: color.ink3, marginTop: 2 },

  chip: { backgroundColor: color.canvas, alignItems: "center", justifyContent: "center", ...shadow.soft },

  lead: { marginTop: space.xl, borderRadius: 26, overflow: "hidden", backgroundColor: warm.paper, ...shadow.raised },
  leadImage: { position: "absolute", right: 0, top: 0, bottom: 0 },
  leadBody: { padding: space.xl, paddingTop: 22 },
  leadTag: { flexDirection: "row", alignItems: "center", gap: 7 },
  leadTagText: { fontFamily: font.sansSemibold, fontSize: 10.5, lineHeight: 13, letterSpacing: 1.8, textTransform: "uppercase", color: color.ink2 },
  leadTitle: { fontFamily: font.sansBold, fontSize: 23, lineHeight: 28, letterSpacing: -0.7, color: color.ink, marginTop: space.m, maxWidth: "66%" },
  leadSummary: { fontFamily: font.sans, fontSize: 14, lineHeight: 20, color: color.ink2, marginTop: space.s, maxWidth: "60%" },
  leadMetaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: space.m, maxWidth: "62%" },
  leadMeta: { fontFamily: font.sansMedium, fontSize: 12, lineHeight: 16, color: color.ink3 },
  leadFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space.l },
  connected: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
    paddingVertical: 5,
    paddingLeft: 5,
    paddingRight: space.m,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.82)",
    flexShrink: 1,
  },
  connectedText: { fontFamily: font.sansMedium, fontSize: 13, lineHeight: 17, color: color.ink, flexShrink: 1 },
  leadArrow: { width: 54, height: 54, borderRadius: 27, backgroundColor: color.ink, alignItems: "center", justifyContent: "center", ...shadow.raised },

  insight: { flexDirection: "row", alignItems: "stretch", paddingLeft: space.m },
  insightThumb: { width: 76, height: 68, borderRadius: 14, alignSelf: "center", backgroundColor: color.surfaceMuted },
  insightBody: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.s, paddingVertical: space.l, paddingRight: space.m, marginLeft: space.m },
  insightDivided: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.hairline },
  categoryRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: warm.orbDeep },
  category: { fontFamily: font.sansSemibold, fontSize: 10, lineHeight: 13, letterSpacing: 1.2, textTransform: "uppercase", color: color.ink2, flexShrink: 1 },
  insightTitle: { fontFamily: font.sansSemibold, fontSize: 15.5, lineHeight: 20, letterSpacing: -0.25, color: color.ink, marginTop: 4 },
  insightSummary: { fontFamily: font.sans, fontSize: 13, lineHeight: 18, color: color.ink3, marginTop: 3 },
  insightSide: { alignItems: "flex-end", alignSelf: "stretch", justifyContent: "space-between", paddingVertical: 2, gap: space.s },
  insightTime: { fontFamily: font.sans, fontSize: 12, lineHeight: 16, color: color.ink3, fontVariant: ["tabular-nums"] },
});
