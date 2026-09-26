import { Pressable, StyleSheet, View } from "react-native";
import { Tabs } from "expo-router";
import type { BottomTabBarProps } from "expo-router/tabs";
import { Icon, type IconName } from "@/components/Icon";
import { T } from "@/components/Text";
import { color, DEPTH_INK, font, lift, space } from "@/theme/tokens";

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
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="library" />
      <Tabs.Screen name="mind" />
      <Tabs.Screen name="ask" />
    </Tabs>
  );
}

// Native-feeling bar: Today · Learn · Mind · Ask. Active tabs are marked by weight and ink, not color alone.
const ORDER = ["index", "library", "mind", "ask"] as const;

function TabBar({ state, navigation, insets }: BottomTabBarProps) {
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space.m) }]} accessibilityRole="tablist">
      {ORDER.map((name) => {
        const index = state.routes.findIndex((r) => r.name === name);
        const route = state.routes[index];
        const tab = TABS[name];
        if (!route || !tab) return null;
        const focused = state.index === index;
        const onPress = () => {
          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        };
        return (
          <Pressable key={route.key} accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={tab.label} accessibilityHint={tab.hint} onPress={onPress} style={styles.tab}>
            <Icon name={tab.icon} size={22} color={focused ? color.ink : color.ink3} />
            <T style={[styles.label, { fontFamily: focused ? font.sansSemibold : font.sans, color: focused ? color.ink : color.ink3 }]}>{tab.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: color.canvas,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(22,22,22,0.06)",
    // A faint upward lift so the bar sits on the page like the cards do.
    ...lift(DEPTH_INK, 0.05, 24, -4, 2),
  },
  tab: { flex: 1, alignItems: "center", justifyContent: "flex-end", paddingTop: space.s, minHeight: 52 },
  label: { fontSize: 11, lineHeight: 14, marginTop: 4, letterSpacing: 0.1 },
});
