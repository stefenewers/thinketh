import { useState } from "react";
import { Platform, Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { Tabs } from "expo-router";
import type { BottomTabBarProps } from "expo-router/tabs";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { Icon, type IconName } from "@/components/Icon";
import { T } from "@/components/Text";
import { setTabBarHeight } from "@/agent/dockLayout";
import { useKeyboardVisible } from "@/lib/hooks";
import { TabBarInsetContext } from "@/lib/tabBarInset";
import { color, DEPTH_INK, font, lift } from "@/theme/tokens";

// Four jobs. Today: what matters to me now. Learn: what to read, save or explore next (the
// `library` route, kept so existing links work). Mind: what I understand and why Thinketh thinks
// so. Ask: questions using my learning context. Explore and Playground are reached in context.
const TABS: Record<string, { label: string; icon: IconName; hint: string }> = {
  index: { label: "Today", icon: "today", hint: "What matters to you now" },
  library: { label: "Learn", icon: "library", hint: "Read, save or explore next" },
  mind: { label: "Mind", icon: "mind", hint: "What you understand, and why" },
  ask: { label: "Ask", icon: "sparkle", hint: "Ask using what you know" },
};

export default function TabsLayout() {
  // The space the floating bar occupies, for tab screens to clear at the end of their content.
  const [inset, setInset] = useState(0);
  return (
    <TabBarInsetContext.Provider value={inset}>
      <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} onSpace={setInset} />}>
        <Tabs.Screen name="index" />
        <Tabs.Screen name="library" />
        <Tabs.Screen name="mind" />
        <Tabs.Screen name="ask" />
      </Tabs>
    </TabBarInsetContext.Provider>
  );
}

const ORDER = ["index", "library", "mind", "ask"] as const;
const SIDE = 16;
// Real Liquid Glass where the OS has it (iOS 26+); elsewhere a translucent tray, blurred on web.
const LIQUID_GLASS = Platform.OS === "ios" && isLiquidGlassAvailable();

/**
 * Today · Learn · Mind · Ask, on a floating glass tray: the page runs on underneath it. The current
 * destination is marked by burnt orange alone (no pill, no underline).
 */
function TabBar({ state, navigation, insets, onSpace }: BottomTabBarProps & { onSpace: (space: number) => void }) {
  const keyboard = useKeyboardVisible();
  // Sits just above the home indicator (never on it); a small margin on phones without one.
  const bottom = insets.bottom > 0 ? insets.bottom - 8 : 12;
  // With the keyboard up the tray steps aside, so it never rides above the keyboard.
  if (keyboard) return null;

  const items = ORDER.map((name) => {
    const index = state.routes.findIndex((r) => r.name === name);
    const route = state.routes[index];
    const tab = TABS[name];
    if (!route || !tab) return null;
    const focused = state.index === index;
    const tint = focused ? color.navActive : color.navInactive;
    const onPress = () => {
      const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
      if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
    };
    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={tab.label}
        accessibilityHint={tab.hint}
        onPress={onPress}
        style={({ pressed }) => [styles.tab, pressed && { opacity: 0.6 }]}
      >
        <Icon name={tab.icon} size={23} color={tint} />
        <T style={[styles.label, { color: tint }]}>{tab.label}</T>
      </Pressable>
    );
  });

  return (
    <View
      style={[styles.wrap, { bottom }]}
      accessibilityRole="tablist"
      onLayout={(e) => {
        // Everything from the tray's top edge to the bottom of the screen.
        const space = Math.ceil(e.nativeEvent.layout.height + bottom);
        setTabBarHeight(space);
        onSpace(space);
      }}
    >
      {LIQUID_GLASS ? (
        <GlassView glassEffectStyle="regular" colorScheme="light" style={[styles.tray, styles.glass]}>
          {items}
        </GlassView>
      ) : (
        <View style={[styles.tray, styles.translucent]}>{items}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: SIDE, right: SIDE, pointerEvents: "box-none" },
  tray: { flexDirection: "row", borderRadius: 32, paddingVertical: 8, paddingHorizontal: 6, overflow: "hidden" },
  // The OS draws the glass, its edge and its light; only a whisper of shadow for separation.
  glass: { ...lift(DEPTH_INK, 0.06, 20, 6, 3) },
  translucent: {
    backgroundColor: "rgba(255,255,255,0.62)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.7)",
    ...lift(DEPTH_INK, 0.07, 24, 6, 4),
    ...(Platform.OS === "web" ? ({ backdropFilter: "blur(22px) saturate(150%)", WebkitBackdropFilter: "blur(22px) saturate(150%)" } as unknown as ViewStyle) : {}),
  },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 50, paddingVertical: 4 },
  label: { fontFamily: font.sansMedium, fontSize: 12, lineHeight: 15, marginTop: 3, letterSpacing: 0.1 },
});
