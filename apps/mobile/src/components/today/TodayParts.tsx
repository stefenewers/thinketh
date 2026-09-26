import { Pressable, StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Polyline, RadialGradient, Rect, Stop } from "react-native-svg";
import { developmentDisplay, type Concept, type Development } from "@thinketh/contracts";
import { Icon } from "@/components/Icon";
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

export type NodeTone = "strong" | "developing" | "changed";

/**
 * The connected concepts, drawn in the Mindprint's own language: a few nodes on a hairline.
 * Filled = strong in your Mind, hollow = developing, coral = changed today.
 */
export function ConceptNodes({ tones }: { tones: NodeTone[] }) {
  const shown = tones.slice(0, 4);
  const pts = shown.map((_, i) => ({ x: 7 + i * 14, y: i % 2 ? 8 : 14 }));
  const w = 14 + (shown.length - 1) * 14;
  return (
    <Svg width={w} height={22} accessible={false}>
      <Polyline points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={color.ink} strokeOpacity={0.5} strokeWidth={1.2} />
      {shown.map((t, i) => (
        <Circle
          key={i}
          cx={pts[i]!.x}
          cy={pts[i]!.y}
          r={4.2}
          fill={t === "changed" ? warm.orbDeep : t === "strong" ? color.ink : color.canvas}
          stroke={t === "developing" ? color.ink : "none"}
          strokeWidth={1.2}
        />
      ))}
    </Svg>
  );
}

/** The lead development as a feature story: its photograph fills the right, the story reads on warm paper. */
export function LeadStory({ development, understood, concepts, tones, onPress }: { development: Development; understood: boolean; concepts: Concept[]; tones: NodeTone[]; onPress: () => void }) {
  const { width } = useWindowDimensions();
  const w = width - gutter * 2;
  const sources = development.sourceIds.length;
  // Consumer headline on the home screen; the real title stays on the detail view (docs/PLAYGROUND.md).
  const display = developmentDisplay(development);
  return (
    // Shadow outside, clipping inside: iOS drops shadows on views that clip.
    <View style={styles.leadShadow}>
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
                <Stop offset="0.34" stopColor={warm.paper} stopOpacity={1} />
                <Stop offset="0.6" stopColor={warm.paper} stopOpacity={0.5} />
                <Stop offset="0.86" stopColor={warm.paper} stopOpacity={0} />
              </LinearGradient>
              <LinearGradient id="leadFloor" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0.6" stopColor={warm.paper} stopOpacity={0} />
                <Stop offset="1" stopColor={warm.paper} stopOpacity={0.55} />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width="100%" height="100%" fill="url(#leadPaper)" />
            {/* The dark foot of the photo fades into the paper instead of ending in a line. */}
            <Rect x={0} y={0} width="100%" height="100%" fill="url(#leadFloor)" />
          </Svg>
        </View>
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
          <View style={styles.leadMetaRow}>
            {understood ? <Icon name="check" size={12} color={color.ink2} /> : null}
            <T style={styles.leadMeta} numberOfLines={1}>
              {understood ? "Understood" : significanceLabel(development)} · {sources} {sources === 1 ? "source" : "sources"}
            </T>
          </View>
          <View style={styles.leadFooter}>
            <View style={styles.connected}>
              <ConceptNodes tones={tones} />
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
  metricDivided: { paddingLeft: 12, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: "rgba(22,22,22,0.09)" },
  metricValue: { fontFamily: font.sansSemibold, fontSize: 26, lineHeight: 30, letterSpacing: -0.8, color: color.ink, fontVariant: ["tabular-nums"] },
  metricLabel: { fontFamily: font.sansSemibold, fontSize: 10, lineHeight: 13, letterSpacing: 1.3, textTransform: "uppercase", color: color.ink3, marginTop: 6 },
  metricSub: { fontFamily: font.sans, fontSize: 11.5, lineHeight: 17, color: color.ink3, marginTop: 2 },


  // The strongest depth on the screen: the feature story.
  leadShadow: { marginTop: space.xl, borderRadius: 26, backgroundColor: warm.paper, ...depth.feature },
  lead: { borderRadius: 26, overflow: "hidden", backgroundColor: warm.paper },
  leadImage: { position: "absolute", right: 0, top: 0, bottom: 0 },
  leadBody: { padding: space.xl, paddingTop: 22 },
  leadTag: { flexDirection: "row", alignItems: "center", gap: 7 },
  leadTagText: { fontFamily: font.sansSemibold, fontSize: 10.5, lineHeight: 13, letterSpacing: 1.8, textTransform: "uppercase", color: color.ink2 },
  leadTitle: { fontFamily: font.sansBold, fontSize: 24, lineHeight: 29, letterSpacing: -0.8, color: color.ink, marginTop: space.m, maxWidth: "64%" },
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
    backgroundColor: "rgba(255,255,255,0.9)",
    flexShrink: 1,
    ...depth.control,
    shadowOpacity: 0.06,
  },
  connectedText: { fontFamily: font.sansMedium, fontSize: 13, lineHeight: 17, color: color.ink, flexShrink: 1 },
  leadArrow: { width: 54, height: 54, borderRadius: 27, backgroundColor: color.ink, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.35)", ...depth.control, shadowOpacity: 0.22 },

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
