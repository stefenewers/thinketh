import { type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { color, font, gutter, layout, radius, space } from "@/theme/tokens";
import { T } from "./Text";
import { Icon } from "./Icon";

export function Screen({
  children,
  scroll = true,
  topInset = true,
  contentStyle,
  background,
}: {
  children: ReactNode;
  scroll?: boolean;
  topInset?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  background?: string;
}) {
  const insets = useSafeAreaInsets();
  const pad = { paddingTop: topInset ? insets.top + layout.pageTop : layout.pageTop };
  if (!scroll) {
    return <View style={[styles.screen, background ? { backgroundColor: background } : null, pad, contentStyle]}>{children}</View>;
  }
  return (
    <ScrollView
      style={[styles.screen, background ? { backgroundColor: background } : null]}
      contentContainerStyle={[pad, { paddingBottom: space.x4 }, contentStyle]}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

export function Gutter({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ paddingHorizontal: gutter }, style]}>{children}</View>;
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.divider, style]} />;
}

type ButtonProps = Omit<PressableProps, "children"> & {
  label: string;
  kind?: "primary" | "decisive" | "secondary" | "quiet";
  icon?: Parameters<typeof Icon>[0]["name"];
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

// primary = charcoal; decisive = coral (reserved for the learning moment).
export function Button({ label, kind = "primary", icon, loading, style, disabled, onPress, ...rest }: ButtonProps) {
  const filled = kind === "primary" || kind === "decisive";
  const fg = filled ? color.onInk : color.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      disabled={disabled || loading}
      onPress={(e) => {
        Haptics.selectionAsync().catch(() => {});
        onPress?.(e);
      }}
      style={({ pressed }) => [
        styles.button,
        kind === "primary" && { backgroundColor: color.ink },
        kind === "decisive" && { backgroundColor: color.coral },
        kind === "secondary" && { borderWidth: 1, borderColor: color.edge, backgroundColor: color.panel },
        kind === "quiet" && { paddingHorizontal: 0, minHeight: 44 },
        (disabled || loading) && { opacity: 0.4 },
        pressed && styles.pressed,
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          <T style={[styles.buttonLabel, { color: fg }]}>{label}</T>
          {icon ? <Icon name={icon} size={16} color={fg} /> : null}
        </>
      )}
    </Pressable>
  );
}

// A flat editorial row with a trailing chevron. Used instead of stacking cards.
export function Row({
  children,
  onPress,
  accessibilityLabel,
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && onPress ? { backgroundColor: color.surfaceMuted } : null, style]}
    >
      <View style={{ flex: 1 }}>{children}</View>
      {onPress ? <Icon name="chevron" size={16} color={color.ink3} /> : null}
    </Pressable>
  );
}

export function SectionLabel({ children, tone }: { children: string; tone?: "coral" }) {
  return (
    <T variant="label" tone={tone === "coral" ? "coral" : undefined} style={{ marginBottom: space.s }}>
      {children}
    </T>
  );
}

export function LoadingState({ message }: { message: string }) {
  return (
    <View style={styles.state} accessibilityLiveRegion="polite">
      <ActivityIndicator color={color.ink3} />
      <T variant="support" style={{ marginTop: space.l, textAlign: "center" }}>
        {message}
      </T>
    </View>
  );
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.state}>
      <T variant="section" style={{ textAlign: "center" }}>
        This didn&apos;t load.
      </T>
      <T variant="support" style={{ marginTop: space.s, textAlign: "center", marginBottom: space.xl }}>
        Your progress is saved. Try again in a moment.
      </T>
      <Button label="Try again" kind="secondary" onPress={onRetry} />
    </View>
  );
}

export function BackBar({ onBack, title }: { onBack: () => void; title?: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.backBar, { paddingTop: insets.top }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={onBack}
        hitSlop={8}
        style={styles.backButton}
      >
        <Icon name="back" size={20} color={color.ink} />
      </Pressable>
      {title ? (
        <T variant="meta" numberOfLines={1} style={{ flex: 1, textAlign: "center", marginRight: 44 }}>
          {title}
        </T>
      ) : null}
    </View>
  );
}

export function ModalHeader({ title, onClose, topInset = false }: { title: string; onClose: () => void; topInset?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.modalHeader, topInset && { paddingTop: insets.top }]}>
      <T variant="meta">{title}</T>
      <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} style={styles.backButton}>
        <Icon name="close" size={20} color={color.ink} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: gutter,
    paddingRight: space.s,
    minHeight: layout.chromeH,
    backgroundColor: color.ground,
  },
  screen:{ flex: 1, backgroundColor: color.ground },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: color.edge },
  button: {
    minHeight: 46,
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.s,
  },
  buttonLabel: { fontFamily: font.sansSemibold, fontSize: 15, lineHeight: 20 },
  // Tactile, not flashy: a slight press-in on every button.
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    minHeight: layout.rowMin,
    paddingVertical: space.m,
    paddingHorizontal: gutter,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.edge,
  },
  state: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xxl, minHeight: 280 },
  backBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.s,
    backgroundColor: color.ground,
  },
  backButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
});
