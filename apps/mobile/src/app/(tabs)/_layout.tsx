import { Pressable, StyleSheet, View } from "react-native";
import { router, Tabs } from "expo-router";
import type { BottomTabBarProps } from "expo-router/tabs";
import { Icon, type IconName } from "@/components/Icon";
import { T } from "@/components/Text";
import { color, font, shadow, space } from "@/theme/tokens";

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

// Native-feeling bar: Today · Mind · Ask · Library · Explore. Mind opens the Mind screen (not a tab route);
// Ask is the raised coral action. Active tabs are marked by weight and ink, not color alone.
const ORDER = ["index", "mind", "ask", "library", "explore"] as const;

function TabBar({ state, navigation, insets }: BottomTabBarProps) {
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space.m) }]} accessibilityRole="tablist">
      {ORDER.map((name) => {
        if (name === "mind") {
          return (
            <Pressable key="mind" accessibilityRole="button" accessibilityLabel="Your Mind" onPress={() => router.push("/mind")} style={styles.tab}>
              <Icon name="mind" size={22} color={color.ink3} />
              <T style={[styles.label, { color: color.ink3 }]}>Mind</T>
            </Pressable>
          );
        }
        const index = state.routes.findIndex((r) => r.name === name);
        const route = state.routes[index];
        const tab = TABS[name];
        if (!route || !tab) return null;
        const focused = state.index === index;
        const onPress = () => {
          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        };
        if (name === "ask") {
          return (
            <Pressable key={route.key} accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={tab.label} onPress={onPress} style={styles.tab}>
              <View style={styles.askButton}>
                <Icon name="sparkle" size={20} color={color.coral} />
              </View>
              <T style={[styles.label, { fontFamily: focused ? font.sansSemibold : font.sans, color: focused ? color.ink : color.ink3 }]}>{tab.label}</T>
            </Pressable>
          );
        }
        return (
          <Pressable key={route.key} accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={tab.label} onPress={onPress} style={styles.tab}>
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
    borderTopColor: color.hairline,
  },
  tab: { flex: 1, alignItems: "center", justifyContent: "flex-end", paddingTop: space.s, minHeight: 52 },
  label: { fontSize: 11, lineHeight: 14, marginTop: 3 },
  // Premium, not playful: a white disc with a coral spark and a soft lift.
  askButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    marginTop: -14,
    backgroundColor: color.canvas,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairline,
    ...shadow.soft,
    shadowOpacity: 0.1,
  },
});
