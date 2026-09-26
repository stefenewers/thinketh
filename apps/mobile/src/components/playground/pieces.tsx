import { type ReactNode } from "react";
import { MuseMark } from "@/components/brand/MuseMark";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { Icon, type IconName } from "@/components/Icon";
import { RaisedCard } from "@/components/system";
import { T } from "@/components/Text";
import { color, font, space } from "@/theme/tokens";

// Playground presentation pieces: the same white, hairline, soft-lift language as Today.
// Coral stays a signal: the moving concept, a status dot, never a fill.

export type DotTone = "coral" | "ink" | "muted" | "partner";

/** A small status dot. Coral = the side knowledge leaves from / the active concept. */
export function Dot({ tone = "ink", size = 6 }: { tone?: DotTone; size?: number }) {
  const bg = tone === "coral" ? color.coral : tone === "partner" ? color.partner : tone === "ink" ? color.ink : color.ink3;
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg }} />;
}

/** A quiet uppercase tag led by a dot: "NADANI → STEFEN", "SHARED GAP". */
export function DotTag({ label, tone = "ink", style }: { label: string; tone?: DotTone; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.dotTag, style]}>
      <Dot tone={tone} />
      <T style={styles.tagText}>{label}</T>
    </View>
  );
}

/**
 * Two overlapping Minds as two soft circles with a person glyph in each:
 * one neutral, one faintly warm. Static, no glow.
 */
export function TwoMinds({ width = 232, height = 150 }: { width?: number; height?: number }) {
  const r = height / 2 - 6;
  const cy = height / 2;
  const overlap = r * 0.62;
  const lx = width / 2 - overlap;
  const rx = width / 2 + overlap;
  const glyph = 30;
  return (
    <View style={{ width, height }} accessible accessibilityLabel="Two Minds, side by side">
      <Svg width={width} height={height}>
        <Circle cx={lx} cy={cy} r={r} fill={color.partnerTint} stroke={color.partner} strokeOpacity={0.14} strokeWidth={1} />
        <Circle cx={rx} cy={cy} r={r} fill={color.coralTint} fillOpacity={0.75} stroke={color.coral} strokeOpacity={0.16} strokeWidth={1} />
      </Svg>
      <View style={[styles.glyph, { left: lx - r * 0.35 - glyph / 2, top: cy - glyph / 2 }]}>
        <Icon name="person" size={glyph} color={color.partner} />
      </View>
      <View style={[styles.glyph, { left: rx + r * 0.35 - glyph / 2, top: cy - glyph / 2 }]}>
        <Icon name="person" size={glyph} color={color.coral} />
      </View>
    </View>
  );
}

/** One row of "How it works": soft icon well, title, one line. Not tappable. */
export function StepRow({ icon, title, body, last }: { icon: IconName; title: string; body: string; last?: boolean }) {
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepIcon}>
        <Icon name={icon} size={17} color={color.coral} />
      </View>
      <View style={[styles.stepBody, !last && styles.divided]}>
        <T style={styles.stepTitle}>{title}</T>
        <T style={styles.stepText}>{body}</T>
      </View>
    </View>
  );
}

/** Muse speaking: a small labeled card led by an ink dot (coral is you, blue is the other Mind). */
export function MuseCard({ children, label = "Muse", style }: { children: ReactNode; label?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <RaisedCard style={[{ paddingVertical: space.m }, style]}>
      <View style={styles.museHead}>
        {label === "Muse" ? <MuseMark size={10} /> : <Dot tone="ink" size={5} />}
        <T style={styles.tagText}>{label}</T>
      </View>
      {typeof children === "string" ? <T style={styles.museText}>{children}</T> : children}
    </RaisedCard>
  );
}

/** One voice in the teaching thread (storyboard 10): a dot for who is speaking, then their card. */
export function ThreadCard({ who, tone, children, style }: { who: string; tone: DotTone; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <RaisedCard style={[{ paddingVertical: space.m }, style]}>
      <View style={styles.museHead}>
        <Dot tone={tone} size={6} />
        <T style={styles.tagText}>{who}</T>
      </View>
      <View style={{ marginTop: space.s }}>{children}</View>
    </RaisedCard>
  );
}

/** An outcome row on the payoff screen (storyboard 11): soft icon well, what changed, one line. */
export function OutcomeRow({ icon, title, body, last }: { icon: IconName; title: string; body?: string; last?: boolean }) {
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepIcon}>
        <Icon name={icon} size={17} color={color.coral} />
      </View>
      <View style={[styles.stepBody, !last && styles.divided]}>
        <T style={styles.stepTitle}>{title}</T>
        {body ? (
          <T style={styles.stepText} numberOfLines={2}>
            {body}
          </T>
        ) : null}
      </View>
    </View>
  );
}

/** Small uppercase card heading ("Emerging differences", "What changed"). */
export function CardTitle({ children }: { children: string }) {
  return <T style={styles.cardTitle}>{children}</T>;
}

const styles = StyleSheet.create({
  dotTag: { flexDirection: "row", alignItems: "center", gap: 7 },
  tagText: { fontFamily: font.sansSemibold, fontSize: 10.5, lineHeight: 13, letterSpacing: 1.1, textTransform: "uppercase", color: color.ink2 },
  glyph: { position: "absolute" },
  stepRow: { flexDirection: "row", alignItems: "center", paddingLeft: space.m },
  stepIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: color.coralTint, alignItems: "center", justifyContent: "center" },
  stepBody: { flex: 1, paddingVertical: space.m, paddingRight: space.m, marginLeft: space.m },
  divided: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.hairline },
  stepTitle: { fontFamily: font.sansSemibold, fontSize: 14.5, lineHeight: 19, letterSpacing: -0.2, color: color.ink },
  stepText: { fontFamily: font.sans, fontSize: 12.5, lineHeight: 17, color: color.ink2, marginTop: 2 },
  museHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  museText: { fontFamily: font.sansMedium, fontSize: 15, lineHeight: 22, color: color.ink, marginTop: space.s },
  cardTitle: { fontFamily: font.sansSemibold, fontSize: 15, lineHeight: 20, letterSpacing: -0.2, color: color.ink },
});
