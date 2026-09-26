import { type ReactNode } from "react";
import { BookGlyph } from "@/components/mind/world/Book";
import { Pressable, StyleSheet, View, useWindowDimensions, type ImageSourcePropType, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { Icon, type IconName } from "@/components/Icon";
import { IconButton } from "@/components/system";
import { T } from "@/components/Text";
import { Texture } from "@/components/Texture";
import { color, font, space } from "@/theme/tokens";

// Briefing primitives for the Resource and Development screens only.

const BAND_H = 196;

/** A subtle photographic band at the top of a briefing, fading into the white page, with a back control. */
/**
 * A photographic header. "band" is a faded strip; "hero" (storyboard 06) is a tall, nearly
 * full-strength image that only fades into white at its bottom edge.
 */
export function TextureHeader({ source, onBack, hero }: { source: ImageSourcePropType; onBack: () => void; hero?: boolean }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const h = hero ? Math.round(height * 0.36) + insets.top : BAND_H + insets.top;
  return (
    <View style={{ height: h, overflow: "hidden" }}>
      <Texture source={source} style={[StyleSheet.absoluteFill, { opacity: hero ? 0.92 : 0.55 }]} />
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width={width} height={h}>
          <Defs>
            <LinearGradient id="briefFade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color.ground} stopOpacity={hero ? 0 : 0.1} />
              <Stop offset={hero ? "0.72" : "0.6"} stopColor={color.ground} stopOpacity={hero ? 0 : 0.35} />
              <Stop offset="1" stopColor={color.ground} stopOpacity={1} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={width} height={h} fill="url(#briefFade)" />
        </Svg>
      </View>
      <View style={[styles.bandBar, { paddingTop: insets.top + space.xs }]}>
        <IconButton icon="back" round accessibilityLabel="Back" onPress={onBack} />
      </View>
    </View>
  );
}

/** A briefing section: a quiet sans heading and its content. */
export function BriefSection({ title, children, style }: { title: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ marginTop: space.xxl }, style]}>
      <T style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </T>
      {children}
    </View>
  );
}

/** A bullet with a small dot. Coral marks what matters to you, blue marks the shift itself; the rest stays gray. */
export function DotLine({ children, tone = "ink" }: { children: string; tone?: "signal" | "cool" | "ink" | "muted" }) {
  return (
    <View style={styles.dotLine}>
      <View style={[styles.dot, tone === "signal" && { backgroundColor: color.coral }, tone === "cool" && { backgroundColor: color.partner }]} />
      <T variant="body" style={[{ flex: 1 }, tone === "muted" && { color: color.ink2 }]}>
        {children}
      </T>
    </View>
  );
}

/** A row inside a ListCard: optional soft icon, title, one line, chevron. */
export function BriefRow({
  icon,
  kicker,
  title,
  subtitle,
  meta,
  onPress,
  last,
  accessibilityLabel,
  accessibilityRole,
  book,
}: {
  /** The row opens a concept as a book in your Mind: the book motif instead of an icon. */
  book?: boolean;
  icon?: IconName;
  kicker?: string;
  title: string;
  subtitle?: string;
  meta?: string;
  onPress?: () => void;
  last?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: "button" | "link";
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? (accessibilityRole ?? "button") : undefined}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: color.surfaceMuted }]}
    >
      {book ? (
        <View style={styles.rowIcon}>
          <BookGlyph size={16} />
        </View>
      ) : icon ? (
        <View style={styles.rowIcon}>
          <Icon name={icon} size={17} color={color.ink} />
        </View>
      ) : null}
      <View style={[styles.rowBody, !icon && !book && { marginLeft: 0 }, !last && styles.rowDivided]}>
        <View style={{ flex: 1 }}>
          {kicker ? <T style={styles.rowKicker}>{kicker}</T> : null}
          <T style={styles.rowTitle}>{title}</T>
          {subtitle ? <T style={styles.rowSub}>{subtitle}</T> : null}
          {meta ? (
            <T variant="meta" style={{ color: color.ink3, marginTop: 2 }}>
              {meta}
            </T>
          ) : null}
        </View>
        {onPress ? <Icon name="chevron" size={14} color={color.ink3} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bandBar: { position: "absolute", left: space.m, top: 0 },
  sectionTitle: { fontFamily: font.sansSemibold, fontSize: 17, lineHeight: 22, letterSpacing: -0.3, color: color.ink, marginBottom: space.m },
  dotLine: { flexDirection: "row", gap: space.m, marginBottom: space.s },
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: color.ink3, marginTop: 9 },
  row: { flexDirection: "row", alignItems: "stretch", paddingLeft: space.l },
  rowIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: color.surfaceMuted, alignItems: "center", justifyContent: "center", alignSelf: "center" },
  rowBody: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.s, paddingVertical: space.m, paddingRight: space.l, marginLeft: space.m, minHeight: 56 },
  rowDivided: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.hairline },
  rowKicker: { fontFamily: font.sansSemibold, fontSize: 10, lineHeight: 13, letterSpacing: 1.1, textTransform: "uppercase", color: color.ink3, marginBottom: 2 },
  rowTitle: { fontFamily: font.sansSemibold, fontSize: 15, lineHeight: 20, letterSpacing: -0.2, color: color.ink },
  rowSub: { fontFamily: font.sans, fontSize: 13, lineHeight: 18, color: color.ink2, marginTop: 2 },
});
