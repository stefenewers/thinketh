import { type ReactNode } from "react";
import { BookGlyph } from "@/components/mind/world/Book";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName } from "@/components/Icon";
import { IconButton } from "@/components/system";
import { T } from "@/components/Text";
import { TopicArt, type TopicArtKind } from "@/components/TopicArt";
import { color, font, space } from "@/theme/tokens";

// Briefing primitives for the Resource and Development screens only.


/**
 * The top of a briefing: the back control, then a modest tile with the topic's pixel object (decorative;
 * the title below names the source). It replaces the old full-width photograph with something that says
 * what the source is about, at the scale of the rest of the pixel vocabulary.
 */
export function ArtHeader({ conceptIds, fallback, onBack }: { conceptIds: readonly string[]; fallback?: TopicArtKind; onBack: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + space.xs, paddingHorizontal: space.m }}>
      <View style={{ alignSelf: "flex-start" }}>
        <IconButton icon="back" round accessibilityLabel="Back" onPress={onBack} />
      </View>
      <TopicArt conceptIds={conceptIds} fallback={fallback} unit={2.5} style={styles.artTile} />
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
  artTile: { width: 96, height: 84, borderRadius: 18, backgroundColor: color.surfaceMuted, marginTop: space.l, marginLeft: space.m, marginBottom: space.xl },
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
