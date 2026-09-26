import { Pressable, StyleSheet, View } from "react-native";
import { Tabs } from "expo-router";
import type { BottomTabBarProps } from "expo-router/tabs";
import { Icon, type IconName } from "@/components/Icon";
import { T } from "@/components/Text";
import { color, font, space } from "@/theme/tokens";

const TABS: Record<string, { label: string; icon: IconName }> = {
  index: { label: "Today", icon: "today" },
  library: { label: "Library", icon: "library" },
  explore: { label: "Explore", icon: "explore" },
  ask: { label: "Ask", icon: "ask" },
};

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="library" />
      <Tabs.Screen name="explore" />
      <Tabs.Screen name="ask" />
    </Tabs>
  );
}

// Quiet, native-feeling bar: active tab is marked by weight, ink, and a rule — not color alone.
function TabBar({ state, navigation, insets }: BottomTabBarProps) {
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space.m) }]} accessibilityRole="tablist">
      {state.routes.map((route, index) => {
        const tab = TABS[route.name];
        if (!tab) return null;
        const focused = state.index === index;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={tab.label}
            onPress={() => {
              const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
            }}
            style={styles.tab}
          >
            <View style={[styles.rule, focused && { backgroundColor: color.ink }]} />
            <Icon name={tab.icon} size={22} color={focused ? color.ink : color.ink3} />
            <T
              style={{
                fontFamily: focused ? font.sansSemibold : font.sans,
                fontSize: 11,
                lineHeight: 14,
                marginTop: 3,
                color: focused ? color.ink : color.ink3,
              }}
            >
              {tab.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: color.ground,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.edge,
  },
  tab: { flex: 1, alignItems: "center", paddingTop: space.s, minHeight: 52 },
  rule: { position: "absolute", top: 0, width: 20, height: 2, borderRadius: 1, backgroundColor: "transparent" },
});
