import { type ReactNode } from "react";
import { Pressable, StyleSheet, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, G, Path } from "react-native-svg";
import { color, depth, font, radius, shadow, space } from "@/theme/tokens";
import { Icon, type IconName } from "./Icon";
import { T } from "./Text";
import { Texture } from "./Texture";

// The Thinketh product system: white, precise, Mindprint-led. Small, boring primitives
// shared by Today, Mind, Ask, Resource, Development and Playground. Coral is a signal only.

/** A native-feeling screen header: optional back, centered title, trailing actions. */
export function AppTopBar({ title, onBack, right, left }: { title?: string; onBack?: () => void; right?: ReactNode; left?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.topBar, { paddingTop: insets.top }]}>
      <View style={styles.topSide}>
        {left ?? (onBack ? <IconButton icon="back" accessibilityLabel="Back" onPress={onBack} /> : null)}
      </View>
      {title ? (
        <T style={styles.topTitle} numberOfLines={1} accessibilityRole="header">
          {title}
        </T>
      ) : (
        <View style={{ flex: 1 }} />
      )}
      <View style={[styles.topSide, { alignItems: "flex-end" }]}>{right}</View>
    </View>
  );
}

export function IconButton({ icon, onPress, accessibilityLabel, round, tint }: { icon: IconName; onPress: () => void; accessibilityLabel: string; round?: boolean; tint?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} hitSlop={6} style={({ pressed }) => [round ? styles.iconRound : styles.iconPlain, pressed && styles.pressed]}>
      <Icon name={icon} size={19} color={tint ?? color.ink} />
    </Pressable>
  );
}

/** White, softly raised, hairline-edged. The one card surface. */
export function RaisedCard({ children, onPress, style, accessibilityLabel }: { children: ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle>; accessibilityLabel?: string }) {
  if (!onPress) return <View style={[styles.card, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={({ pressed }) => [styles.card, style, pressed && { transform: [{ scale: 0.99 }], opacity: 0.95 }]}>
      {children}
    </Pressable>
  );
}

export function Kicker({ children, style }: { children: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style}>
      <T style={styles.kicker}>{children}</T>
    </View>
  );
}

/** Small uppercase label with one coral dot: "LEAD DEVELOPMENT", "QUICK ANSWER". */
export function SignalPill({ label, muted }: { label: string; muted?: boolean }) {
  return (
    <View style={styles.signalPill}>
      <View style={[styles.dot, muted && { backgroundColor: color.ink3 }]} />
      <T style={styles.signalText}>{label}</T>
    </View>
  );
}

export function SectionHeader({ title, action, style }: { title: string; action?: { label: string; onPress: () => void }; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.sectionHeader, style]}>
      <T style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </T>
      {action ? (
        <Pressable onPress={action.onPress} accessibilityRole="button" hitSlop={8} style={styles.sectionAction}>
          <T variant="meta">{action.label}</T>
          <Icon name="chevron" size={14} color={color.ink2} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Segment control. "underline" for in-page sections; "pill" for view switches (Map · Concepts · Changes). */
export function SegmentedTabs<K extends string>({ tabs, value, onChange, style, variant = "underline" }: { tabs: { key: K; label: string }[]; value: K; onChange: (k: K) => void; style?: StyleProp<ViewStyle>; variant?: "underline" | "pill" }) {
  if (variant === "pill") {
    return (
      <View style={[styles.pillTrack, style]} accessibilityRole="tablist">
        {tabs.map((t) => {
          const on = t.key === value;
          return (
            <Pressable key={t.key} onPress={() => onChange(t.key)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={[styles.pillSeg, on && styles.pillSegOn]}>
              <T style={[styles.tabText, on && { color: color.ink, fontFamily: font.sansSemibold }]}>{t.label}</T>
            </Pressable>
          );
        })}
      </View>
    );
  }
  return (
    <View style={[styles.tabs, style]} accessibilityRole="tablist">
      {tabs.map((t) => {
        const on = t.key === value;
        return (
          <Pressable key={t.key} onPress={() => onChange(t.key)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={[styles.tab, on && styles.tabOn]}>
            <T style={[styles.tabText, on && { color: color.ink, fontFamily: font.sansSemibold }]}>{t.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

// Portraits are local-only (gitignored src/content/portraits.local.ts + assets/people/).
// Without them (a fresh clone), everyone gets a quiet initial instead.
let PORTRAITS: Record<string, ImageSourcePropType> = {};
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  PORTRAITS = (require("@/content/portraits.local") as { PORTRAITS: Record<string, ImageSourcePropType> }).PORTRAITS;
} catch {
  PORTRAITS = {};
}

/** A person: portrait if we have one, else their initial on a soft tint. */
export function Avatar({ name, size = 32, tint, ink }: { name: string; size?: number; tint?: string; ink?: string }) {
  const portrait = PORTRAITS[name.trim().toLowerCase()];
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (portrait) return <Texture source={portrait} style={[box, { backgroundColor: color.surfaceMuted }]} />;
  return (
    <View style={[box, { backgroundColor: tint ?? color.surfaceMuted, alignItems: "center", justifyContent: "center" }]} accessible={false}>
      <T style={{ fontFamily: font.sansSemibold, fontSize: size * 0.42, lineHeight: size * 0.5, color: ink ?? color.ink2 }}>{name.trim().slice(0, 1).toUpperCase()}</T>
    </View>
  );
}

export type Metric = { value: string; label: string; sub?: string; accent?: boolean; onPress?: () => void; accessibilityLabel?: string };

/** Numbers as product metrics: tabular, split by hairlines, no card. */
export function MetricStrip({ metrics, style }: { metrics: Metric[]; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.metrics, style]} accessibilityRole="summary">
      {metrics.map((m, i) => {
        const cell = (
          <View style={[styles.metric, i === 0 ? { paddingLeft: 0 } : styles.metricDivided]}>
            <T variant="metric" style={[{ fontSize: 26, lineHeight: 30 }, m.accent && { color: color.coral }]}>
              {m.value}
            </T>
            <T style={styles.metricLabel} numberOfLines={1} adjustsFontSizeToFit>
              {m.label}
            </T>
            {m.sub ? <T style={styles.metricSub}>{m.sub}</T> : null}
          </View>
        );
        return m.onPress ? (
          <Pressable key={m.label} onPress={m.onPress} accessibilityRole="button" accessibilityLabel={m.accessibilityLabel ?? `${m.value} ${m.label}`} style={({ pressed }) => [{ flex: 1 }, pressed && { opacity: 0.6 }]}>
            {cell}
          </Pressable>
        ) : (
          <View key={m.label} style={{ flex: 1 }}>
            {cell}
          </View>
        );
      })}
    </View>
  );
}

/** Compact tile with a soft icon container: Your Mind · Ask Thinketh · Playground. */
export function ActionTile({ icon, tint, ink, title, subtitle, accent, onPress }: { icon: IconName; tint: string; ink: string; title: string; subtitle: string; accent?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}. ${subtitle}.`} style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
      <View style={styles.tileHead}>
        <View style={[styles.tileIcon, { backgroundColor: tint }]}>
          <Icon name={icon} size={20} color={ink} />
        </View>
        <Icon name="arrow" size={14} color={color.ink3} />
      </View>
      <T style={styles.tileTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
        {title}
      </T>
      <T style={[styles.tileSub, accent && { color: color.coral }]} numberOfLines={2}>
        {subtitle}
      </T>
    </Pressable>
  );
}

/** A grouped white list (Recent insights, Recently changed, Sources). */
export function ListCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.listCard, style]}>{children}</View>;
}

/** One row in a ListCard: texture thumb, category, title, one line, time, chevron. */
export function InsightRow({
  thumb,
  category,
  title,
  summary,
  meta,
  understood,
  signal,
  last,
  onPress,
  accessibilityLabel,
}: {
  thumb?: ImageSourcePropType;
  category?: string;
  title: string;
  summary?: string;
  meta?: string;
  understood?: boolean;
  signal?: boolean;
  last?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? "button" : undefined} accessibilityLabel={accessibilityLabel ?? title} style={({ pressed }) => [styles.row, pressed && { backgroundColor: color.surfaceMuted }]}>
      {thumb ? <Texture source={thumb} style={styles.thumb} /> : null}
      <View style={[styles.rowBody, !thumb && { marginLeft: 0 }, !last && styles.rowDivided]}>
        <View style={{ flex: 1 }}>
          {category || understood ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              {understood ? <Icon name="check" size={12} color={color.ink} /> : <View style={signal ? styles.dot : styles.metaDot} />}
              <T style={styles.rowCategory} numberOfLines={1}>
                {understood ? "Understood" : category}
              </T>
            </View>
          ) : null}
          <T style={styles.rowTitle} numberOfLines={2}>
            {title}
          </T>
          {summary ? (
            <T style={styles.rowSummary} numberOfLines={1}>
              {summary}
            </T>
          ) : null}
        </View>
        {meta || onPress ? (
          <View style={{ alignItems: "flex-end", gap: space.s }}>
            {meta ? (
              <T variant="meta" style={{ color: color.ink3, fontVariant: ["tabular-nums"] }}>
                {meta}
              </T>
            ) : null}
            {onPress ? <Icon name="chevron" size={14} color={color.ink3} /> : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

/** A source as a small row: texture thumb, title, publisher/date. */
export function SourceCard({ title, meta, thumb, onPress }: { title: string; meta?: string; thumb?: ImageSourcePropType; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? "link" : undefined} style={({ pressed }) => [styles.source, pressed && { opacity: 0.7 }]}>
      {thumb ? <Texture source={thumb} style={styles.sourceThumb} /> : <View style={[styles.sourceThumb, { backgroundColor: color.surfaceMuted }]} />}
      <View style={{ flex: 1 }}>
        <T style={styles.sourceTitle} numberOfLines={2}>
          {title}
        </T>
        {meta ? (
          <T variant="meta" style={{ color: color.ink3, marginTop: 2 }} numberOfLines={1}>
            {meta}
          </T>
        ) : null}
      </View>
    </Pressable>
  );
}

/** A concept as a quiet pill; active = coral dot (the concept in play). */
export function ConceptChip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? "button" : undefined} style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}>
      {active ? <View style={styles.dot} /> : null}
      <T style={styles.chipText}>{label}</T>
    </Pressable>
  );
}

/** One step of "Why this answer?": numbered, titled, short. */
export function ReasoningStep({ n, title, children, last }: { n: number; title: string; children?: ReactNode; last?: boolean }) {
  return (
    <View style={styles.step}>
      <View style={{ alignItems: "center" }}>
        <View style={styles.stepNum}>
          <T style={styles.stepNumText}>{n}</T>
        </View>
        {!last ? <View style={styles.stepRail} /> : null}
      </View>
      <View style={{ flex: 1, paddingBottom: last ? 0 : space.l }}>
        <T style={styles.stepTitle}>{title}</T>
        {children ? <View style={{ marginTop: space.xs }}>{children}</View> : null}
      </View>
    </View>
  );
}

export type MindprintNode = { id: string; strong: boolean };

/**
 * A mini Mindprint, composed rather than scattered: the active concept at the centre (coral),
 * the rest on two faint rings. Filled = strong evidence, hollow = developing.
 */
export function MindprintPreview({ nodes, activeId, size = 128 }: { nodes: MindprintNode[]; activeId?: string; size?: number }) {
  const centre = nodes.find((n) => n.id === activeId) ?? nodes[0];
  if (!centre) return null;
  const others = nodes.filter((n) => n !== centre).slice(0, 10);
  const inner = others.slice(0, 4);
  const outer = others.slice(4);
  const C = 64;
  const at = (i: number, n: number, r: number, offset: number) => {
    const a = offset + (i / Math.max(n, 1)) * Math.PI * 2;
    return [C + Math.cos(a) * r, C + Math.sin(a) * r] as const;
  };
  const innerPts = inner.map((_, i) => at(i, inner.length, 28, -Math.PI / 3));
  const outerPts = outer.map((_, i) => at(i, outer.length, 52, -Math.PI / 5));
  const dot = (n: MindprintNode, [x, y]: readonly [number, number]) =>
    n.strong ? <Circle key={n.id} cx={x} cy={y} r={3.2} fill={color.ink} /> : <Circle key={n.id} cx={x} cy={y} r={3} fill={color.canvas} stroke={color.ink2} strokeWidth={1.1} />;
  return (
    <Svg width={size} height={size} viewBox="0 0 128 128">
      <Circle cx={C} cy={C} r={28} stroke={color.hairline} strokeWidth={1} fill="none" />
      <Circle cx={C} cy={C} r={52} stroke={color.hairline} strokeWidth={1} fill="none" />
      {innerPts.map(([x, y], i) => (
        <Path key={`c${i}`} d={`M${C} ${C} L${x} ${y}`} stroke={color.ink} strokeOpacity={0.16} strokeWidth={0.9} />
      ))}
      {outerPts.map(([x, y], j) => {
        const [px, py] = innerPts[Math.floor((j * innerPts.length) / Math.max(outerPts.length, 1))] ?? [C, C];
        return <Path key={`o${j}`} d={`M${px} ${py} L${x} ${y}`} stroke={color.ink} strokeOpacity={0.12} strokeWidth={0.8} />;
      })}
      {inner.map((n, i) => dot(n, innerPts[i]))}
      {outer.map((n, i) => dot(n, outerPts[i]))}
      {centre.id === activeId ? (
        <G>
          <Circle cx={C} cy={C} r={8} fill="none" stroke={color.coral} strokeOpacity={0.3} strokeWidth={1} />
          <Circle cx={C} cy={C} r={4} fill={color.coral} />
        </G>
      ) : (
        <Circle cx={C} cy={C} r={4} fill={color.ink} />
      )}
    </Svg>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.s, minHeight: 44, backgroundColor: color.canvas },
  topSide: { width: 88, flexDirection: "row", alignItems: "center" },
  topTitle: { flex: 1, textAlign: "center", fontFamily: font.sansSemibold, fontSize: 15, lineHeight: 20, letterSpacing: -0.2, color: color.ink },
  iconPlain: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  iconRound: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: color.canvas, borderWidth: StyleSheet.hairlineWidth, borderColor: color.hairline },
  card: { backgroundColor: color.canvas, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: color.hairline, padding: space.l, ...shadow.soft },
  kicker: { fontFamily: font.sansMedium, fontSize: 11.5, lineHeight: 14, letterSpacing: 2.2, textTransform: "uppercase", color: color.ink3 },
  signalPill: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: "rgba(255,255,255,0.9)", borderWidth: StyleSheet.hairlineWidth, borderColor: color.hairline },
  signalText: { fontFamily: font.sansSemibold, fontSize: 10.5, lineHeight: 13, letterSpacing: 1.1, textTransform: "uppercase", color: color.ink },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.coral },
  metaDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: color.ink3 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space.xxl, marginBottom: space.s },
  sectionTitle: { fontFamily: font.sansSemibold, fontSize: 18, lineHeight: 23, letterSpacing: -0.3, color: color.ink },
  sectionAction: { flexDirection: "row", alignItems: "center", gap: 2, minHeight: 44 },
  tabs: { flexDirection: "row", gap: space.xl, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.hairline },
  tab: { minHeight: 40, justifyContent: "center", borderBottomWidth: 2, borderBottomColor: "transparent", marginBottom: -StyleSheet.hairlineWidth },
  tabOn: { borderBottomColor: color.ink },
  pillTrack: { flexDirection: "row", padding: 3, borderRadius: radius.pill, backgroundColor: color.surfaceMuted },
  pillSeg: { flex: 1, minHeight: 34, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  pillSegOn: { backgroundColor: color.canvas, ...shadow.soft, shadowOpacity: 0.08 },
  tabText: { fontFamily: font.sansMedium, fontSize: 14, lineHeight: 18, color: color.ink3 },
  metrics: { flexDirection: "row" },
  metric: { paddingHorizontal: space.s },
  metricDivided: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: color.hairline },
  metricLabel: { fontFamily: font.sansSemibold, fontSize: 10, lineHeight: 13, letterSpacing: 0.9, textTransform: "uppercase", color: color.ink2, marginTop: space.xs },
  metricSub: { fontFamily: font.sans, fontSize: 12, lineHeight: 16, color: color.ink3 },
  tile: { flex: 1, padding: 12, borderRadius: 20, backgroundColor: color.canvas, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(22,22,22,0.05)", ...depth.card },
  tileHead: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  tileIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(22,22,22,0.04)" },
  tileTitle: { fontFamily: font.sansSemibold, fontSize: 14.5, lineHeight: 19, letterSpacing: -0.4, color: color.ink, marginTop: space.m },
  tileSub: { fontFamily: font.sans, fontSize: 12.5, lineHeight: 17, color: color.ink2, marginTop: 2, minHeight: 34 },
  listCard: { borderRadius: 18, backgroundColor: color.canvas, borderWidth: StyleSheet.hairlineWidth, borderColor: color.hairline, overflow: "hidden", ...shadow.soft },
  row: { flexDirection: "row", alignItems: "stretch", paddingLeft: space.m },
  rowBody: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.s, paddingVertical: space.m, paddingRight: space.m, marginLeft: space.m },
  rowDivided: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.hairline },
  thumb: { width: 56, height: 56, borderRadius: 12, alignSelf: "center", backgroundColor: color.surfaceMuted },
  rowCategory: { fontFamily: font.sansSemibold, fontSize: 10, lineHeight: 13, letterSpacing: 1.1, textTransform: "uppercase", color: color.ink2, flexShrink: 1 },
  rowTitle: { fontFamily: font.sansSemibold, fontSize: 15, lineHeight: 20, letterSpacing: -0.2, color: color.ink, marginTop: 3 },
  rowSummary: { fontFamily: font.sans, fontSize: 13, lineHeight: 18, color: color.ink2, marginTop: 2 },
  source: { flexDirection: "row", alignItems: "center", gap: space.m, paddingVertical: space.s },
  sourceThumb: { width: 40, height: 40, borderRadius: 8 },
  sourceTitle: { fontFamily: font.sansMedium, fontSize: 14, lineHeight: 19, color: color.ink },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: space.m, minHeight: 30, borderRadius: radius.pill, backgroundColor: color.surfaceMuted },
  chipText: { fontFamily: font.sansMedium, fontSize: 13, lineHeight: 17, color: color.ink },
  step: { flexDirection: "row", gap: space.m },
  stepNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: color.surfaceMuted, alignItems: "center", justifyContent: "center" },
  stepNumText: { fontFamily: font.sansSemibold, fontSize: 11.5, lineHeight: 14, color: color.ink, fontVariant: ["tabular-nums"] },
  stepRail: { flex: 1, width: StyleSheet.hairlineWidth, backgroundColor: color.hairline, marginTop: 4 },
  stepTitle: { fontFamily: font.sansSemibold, fontSize: 15, lineHeight: 21, color: color.ink },
});
