import { type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Icon, type IconName } from "@/components/Icon";
import { T } from "@/components/Text";
import { color, font, space } from "@/theme/tokens";

// The setup language shared by Onboarding and Profile: an Apple-style setup flow.
// A coral signal dot, a sans headline, one line, then a stack of quiet white rows.

export function SetupHeader({ title, note }: { title: string; note?: string }) {
  return (
    <View>
      <View style={styles.signal} accessibilityElementsHidden importantForAccessibility="no" />
      <T variant="display" style={styles.headline} accessibilityRole="header">
        {title}
      </T>
      {note ? (
        <T variant="support" style={styles.note}>
          {note}
        </T>
      ) : null}
    </View>
  );
}

/** A soft, neutral icon container. */
export function SoftIcon({ name }: { name: IconName }) {
  return (
    <View style={styles.iconWrap}>
      <Icon name={name} size={17} color={color.ink2} />
    </View>
  );
}

/**
 * One row inside a ListCard. `trailing` defaults to a chevron when pressable.
 * `role` lets option rows behave as checkboxes.
 */
export function SetupRow({
  icon,
  title,
  subtitle,
  trailing,
  last,
  onPress,
  checked,
  accessibilityLabel,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  last?: boolean;
  onPress?: () => void;
  /** When set, the row is a checkbox with a trailing tick. */
  checked?: boolean;
  accessibilityLabel?: string;
}) {
  const isCheckbox = checked !== undefined;
  const end = isCheckbox ? <Tick on={checked} /> : trailing ?? (onPress ? <Icon name="chevron" size={15} color={color.ink3} /> : null);
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={isCheckbox ? "checkbox" : onPress ? "button" : undefined}
      accessibilityState={isCheckbox ? { checked } : undefined}
      accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}. ${subtitle}` : title)}
      style={({ pressed }) => [styles.row, pressed && onPress ? { backgroundColor: color.surfaceMuted } : null]}
    >
      {icon ? <SoftIcon name={icon} /> : null}
      <View style={[styles.body, !icon && { marginLeft: 0 }, !last && styles.divided]}>
        <View style={{ flex: 1 }}>
          <T style={styles.title}>{title}</T>
          {subtitle ? <T style={styles.subtitle}>{subtitle}</T> : null}
        </View>
        {end}
      </View>
    </Pressable>
  );
}

function Tick({ on }: { on: boolean }) {
  return <View style={[styles.tick, on && styles.tickOn]}>{on ? <Icon name="check" size={13} color={color.onInk} /> : null}</View>;
}

/** Thin step progress: filled segments up to the current step. */
export function StepProgress({ step, total }: { step: number; total: number }) {
  return (
    <View style={styles.progress} accessibilityRole="progressbar" accessibilityLabel={`Step ${step + 1} of ${total}`} accessibilityValue={{ min: 1, max: total, now: step + 1 }}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[styles.segment, i <= step && { backgroundColor: color.ink }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  signal: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.coral, marginBottom: space.l },
  headline: { fontSize: 28, lineHeight: 34, letterSpacing: -0.7 },
  note: { marginTop: space.s, fontSize: 14, lineHeight: 20 },
  iconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: color.surfaceMuted, alignItems: "center", justifyContent: "center", alignSelf: "center" },
  row: { flexDirection: "row", alignItems: "stretch", paddingLeft: space.l, minHeight: 60 },
  body: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.m, paddingVertical: space.m, paddingRight: space.l, marginLeft: space.m },
  divided: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.hairline },
  title: { fontFamily: font.sansSemibold, fontSize: 15, lineHeight: 20, letterSpacing: -0.2, color: color.ink },
  subtitle: { fontFamily: font.sans, fontSize: 13, lineHeight: 18, color: color.ink2, marginTop: 2 },
  tick: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: color.edge, alignItems: "center", justifyContent: "center" },
  tickOn: { backgroundColor: color.ink, borderColor: color.ink },
  progress: { flexDirection: "row", gap: 4, width: 72 },
  segment: { flex: 1, height: 3, borderRadius: 1.5, backgroundColor: color.fog },
});
