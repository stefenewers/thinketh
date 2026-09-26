import { useState } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from "react-native-svg";
import { developmentDisplay, type Concept, type Development } from "@thinketh/contracts";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/system";
import { T } from "@/components/Text";
import { Texture } from "@/components/Texture";
import { storyImageFor } from "@/content/imagery";
import { significanceLabel } from "@/lib/knowledge";
import { color, depth, font, gutter, space, warm } from "@/theme/tokens";

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

/** The people around this knowledge: you and your Playground partner (portraits are local-only; initials otherwise). */
export function PeopleStack({ names, size = 28 }: { names: string[]; size?: number }) {
  return (
    <View style={{ flexDirection: "row" }} accessible={false}>
      {names.slice(0, 3).map((n, i) => (
        <View key={n} style={[styles.person, { width: size + 4, height: size + 4, borderRadius: (size + 4) / 2, marginLeft: i ? -size * 0.3 : 0, zIndex: 3 - i }]}>
          <Avatar name={n} size={size} />
        </View>
      ))}
    </View>
  );
}

// The photo panel: the right 56% of the card, fading into the paper on its left edge.
const IMAGE_SHARE = 0.56;

/** The lead development as a compact feature story: text on the left, its photograph on the right. */
export function LeadStory({ development, concepts, people, onPress }: { development: Development; concepts: Concept[]; people: string[]; onPress: () => void }) {
  const { width } = useWindowDimensions();
  const w = width - gutter * 2;
  const [h, setH] = useState(0);
  // Consumer headline on the home screen; the real title stays on the detail view (docs/PLAYGROUND.md).
  const display = developmentDisplay(development);
  const imageW = Math.round(w * IMAGE_SHARE);
  return (
    // Shadow outside, clipping inside: iOS drops shadows on views that clip.
    <View style={styles.leadShadow}>
      <Pressable
        onPress={onPress}
        onLayout={(e) => setH(Math.round(e.nativeEvent.layout.height))}
        accessibilityRole="button"
        accessibilityLabel={`Lead development. ${display.headline}. ${significanceLabel(development)}. ${concepts.length} connected concepts.`}
        style={({ pressed }) => [styles.lead, pressed && { transform: [{ scale: 0.99 }] }]}
      >
        {/* Exact pixel size: the iOS image fallback mis-sizes an image stretched by top/bottom edges. */}
        {h > 0 ? <Texture source={storyImageFor(development.conceptIds)} style={[styles.leadImage, { width: imageW, height: h }]} /> : null}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Svg width={w} height={Math.max(h, 1)}>
            <Defs>
              <LinearGradient id="leadPaper" x1="0" y1="0" x2="1" y2="0">
                {/* Opaque paper under the text; the photo keeps full contrast on the right. */}
                <Stop offset="0" stopColor={warm.paper} stopOpacity={1} />
                <Stop offset={String(1 - IMAGE_SHARE + 0.05)} stopColor={warm.paper} stopOpacity={1} />
                <Stop offset={String(1 - IMAGE_SHARE + 0.22)} stopColor={warm.paper} stopOpacity={0.4} />
                <Stop offset={String(1 - IMAGE_SHARE + 0.36)} stopColor={warm.paper} stopOpacity={0} />
              </LinearGradient>
              <LinearGradient id="leadFloor" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0.62" stopColor={warm.paper} stopOpacity={0} />
                <Stop offset="1" stopColor={warm.paper} stopOpacity={0.4} />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={w} height={Math.max(h, 1)} fill="url(#leadPaper)" />
            {/* The dark foothills soften into the paper instead of ending in a line. */}
            <Rect x={0} y={0} width={w} height={Math.max(h, 1)} fill="url(#leadFloor)" />
          </Svg>
        </View>
        <View style={styles.leadBody}>
          <View style={styles.leadTag}>
            <View style={styles.dot} />
            <T style={styles.leadTagText}>Lead development</T>
          </View>
          <T style={styles.leadTitle} numberOfLines={3}>
            {display.headline}
          </T>
          {display.summary ? (
            <T style={styles.leadSummary} numberOfLines={2}>
              {display.summary}
            </T>
          ) : null}
          <View style={styles.leadFooter}>
            <View style={styles.connected}>
              <PeopleStack names={people} />
              <T style={styles.connectedText} numberOfLines={1}>
                {concepts.length} connected {concepts.length === 1 ? "concept" : "concepts"}
              </T>
              <Icon name="chevron" size={12} color={color.ink} />
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
  metric: { paddingRight: 4, paddingVertical: 2 },
  metricDivided: { paddingLeft: 14, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: "rgba(22,22,22,0.07)" },
  metricValue: { fontFamily: font.sansSemibold, fontSize: 28, lineHeight: 32, letterSpacing: -0.8, color: color.ink, fontVariant: ["tabular-nums"] },
  metricLabel: { fontFamily: font.sansSemibold, fontSize: 10, lineHeight: 13, letterSpacing: 1.3, textTransform: "uppercase", color: color.ink3, marginTop: 6 },
  metricSub: { fontFamily: font.sans, fontSize: 11.5, lineHeight: 17, color: color.ink3, marginTop: 2 },


  // The strongest depth on the screen: the feature story.
  leadShadow: { marginTop: space.xl, borderRadius: 26, backgroundColor: warm.paper, ...depth.feature },
  lead: { borderRadius: 26, overflow: "hidden", backgroundColor: warm.paper },
  leadImage: { position: "absolute", right: 0, top: 0 },
  leadBody: { paddingHorizontal: space.xl, paddingTop: 18, paddingBottom: 16 },
  leadTag: { flexDirection: "row", alignItems: "center", gap: 7 },
  leadTagText: { fontFamily: font.sansSemibold, fontSize: 10.5, lineHeight: 13, letterSpacing: 1.8, textTransform: "uppercase", color: color.ink2 },
  leadTitle: { fontFamily: font.sansBold, fontSize: 20.5, lineHeight: 25, letterSpacing: -0.6, color: color.ink, marginTop: 10, maxWidth: "62%" },
  leadSummary: { fontFamily: font.sans, fontSize: 13.5, lineHeight: 19, color: color.ink2, marginTop: 6, maxWidth: "60%" },
  leadFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14 },
  connected: { flexDirection: "row", alignItems: "center", gap: space.s, flexShrink: 1 },
  person: { backgroundColor: color.canvas, alignItems: "center", justifyContent: "center" },
  connectedText: { fontFamily: font.sansMedium, fontSize: 13, lineHeight: 17, color: color.ink, flexShrink: 1 },
  leadArrow: { width: 48, height: 48, borderRadius: 24, backgroundColor: color.ink, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.3)", ...depth.control, shadowOpacity: 0.24 },

  insight: { flexDirection: "row", alignItems: "stretch", paddingLeft: space.m },
  insightThumb: { width: 76, height: 68, borderRadius: 14, alignSelf: "center", backgroundColor: color.surfaceMuted },
  insightBody: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.s, paddingVertical: space.l, paddingRight: space.m, marginLeft: space.m },
  insightDivided: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.hairline },
  categoryRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: warm.orbDeep },
  category: { fontFamily: font.sansMedium, fontSize: 12, lineHeight: 16, color: color.ink3, flexShrink: 1 },
  insightTitle: { fontFamily: font.sansSemibold, fontSize: 15.5, lineHeight: 20, letterSpacing: -0.25, color: color.ink, marginTop: 3 },
  insightSummary: { fontFamily: font.sans, fontSize: 13, lineHeight: 18, color: color.ink3, marginTop: 3 },
  insightSide: { alignItems: "flex-end", alignSelf: "stretch", justifyContent: "space-between", paddingVertical: 2, gap: space.s },
  insightTime: { fontFamily: font.sans, fontSize: 12, lineHeight: 16, color: color.ink3, fontVariant: ["tabular-nums"] },
});
