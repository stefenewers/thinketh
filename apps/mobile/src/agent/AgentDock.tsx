// The one way to reach the personal agent from any main screen, and the compact view of a live
// conversation. Idle: a small "Talk" control (nothing is listening). Live: a slim dock with the
// state, a one-line caption, mute and end; tap it to expand. Minimize keeps the call; End releases
// the microphone. Hidden while the keyboard is up, on screens that host it themselves (Ask's
// composer: AgentComposerButton) and on Catch Me Up, which shows the full conversation itself.
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { Mark } from "@/components/Logo";
import { T } from "@/components/Text";
import { useKeyboardVisible, useReducedMotion } from "@/lib/hooks";
import { color, depth, font, gutter, radius, space } from "@/theme/tokens";
import { Pulse } from "@/voice/CatchUpScene";
import { isActive, useAgentControls, useAgentState, type AgentState } from "./agentContext";
import { setDockSpace, useTabBarHeight } from "./dockLayout";
import { getScreen, subscribeScreen, type PublishedScreen } from "./screenContext";

const TAB_SCREENS = new Set(["today", "learn", "mind", "ask"]);

export function useCurrentScreen(): PublishedScreen | null {
  const [s, setS] = useState(getScreen);
  useEffect(() => subscribeScreen(setS), []);
  return s;
}


/** One short word for what the conversation is doing. */
export function phaseLabel(s: Pick<AgentState, "status" | "phase" | "isMuted" | "ending">): string {
  if (s.ending) return "Ending";
  if (s.status === "connecting") return "Connecting";
  if (s.phase === "speaking") return "Speaking";
  if (s.phase === "thinking") return "Thinking";
  if (s.isMuted) return "Muted";
  if (s.phase === "user") return "Hearing you";
  return "Listening";
}

export function AgentDock() {
  const state = useAgentState();
  const controls = useAgentControls();
  const screen = useCurrentScreen();
  const keyboard = useKeyboardVisible();
  const tabBar = useTabBarHeight();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();

  // "inline" screens (Ask) show the conversation in their own composer instead.
  const hidden = !controls.supported || keyboard || screen?.screen === "catch_up" || screen?.entry === "inline" || state.expanded;
  const showsDock = !hidden && (isActive(state.status) || !!state.notice);
  useEffect(() => {
    setDockSpace(showsDock ? 76 : 0);
  }, [showsDock]);

  if (hidden) return null;
  const onTabs = !!screen && TAB_SCREENS.has(screen.screen);
  const bottom = (onTabs && tabBar ? tabBar : insets.bottom) + space.m;
  const enter = reduced ? undefined : FadeInDown.duration(220);
  // No exiting animation: the dock swaps between three views (call, notice, entry) and can change again
  // within a second (a call ends, another starts). Overlapping exits crashed Reanimated 4.7's layout
  // animation tree (SIGABRT in LightNode::toHostIndexForRemove), so the dock just leaves.

  if (isActive(state.status)) {
    const label = phaseLabel(state);
    const line = state.caption.current || state.caption.previous || (state.status === "connecting" ? "Starting your conversation…" : state.activity === "catch_up" ? "Catch Me Up" : "Ask anything, or say where to go.");
    return (
      <Animated.View entering={enter} style={[styles.dockWrap, { bottom }]} pointerEvents="box-none">
        <View style={styles.dock}>
          <Pressable
            onPress={controls.expand}
            accessibilityRole="button"
            accessibilityLabel={`Conversation with Thinketh. ${label}. Open the conversation.`}
            style={({ pressed }) => [styles.dockBody, pressed && { opacity: 0.7 }]}
          >
            <StateDot state={state} reduced={reduced} />
            <View style={{ flex: 1 }}>
              <T style={styles.state} accessibilityLiveRegion="polite">
                {label}
              </T>
              <T style={styles.caption} numberOfLines={1} importantForAccessibility="no" accessibilityElementsHidden>
                {line}
              </T>
            </View>
          </Pressable>
          <MicToggle muted={state.isMuted} disabled={state.status !== "live"} onPress={() => controls.setMuted(!state.isMuted)} />
          <Pressable onPress={controls.end} accessibilityRole="button" accessibilityLabel="End conversation and turn off the microphone" hitSlop={4} style={({ pressed }) => [styles.round, styles.end, pressed && { opacity: 0.7 }]}>
            <Icon name="close" size={16} color={color.onInk} />
          </Pressable>
        </View>
      </Animated.View>
    );
  }

  if (state.notice) {
    return (
      <Animated.View entering={enter} style={[styles.dockWrap, { bottom }]} pointerEvents="box-none">
        <View style={styles.dock} accessibilityLiveRegion="polite">
          <View style={[styles.dot, { backgroundColor: color.ink3, marginLeft: space.s }]} />
          <T style={[styles.caption, { flex: 1, color: color.ink }]} numberOfLines={3}>
            {state.notice}
          </T>
          <Pressable onPress={controls.dismissNotice} accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={6} style={styles.round}>
            <Icon name="close" size={16} color={color.ink2} />
          </Pressable>
        </View>
      </Animated.View>
    );
  }

  // Idle entry. Only where the screen hasn't placed its own, and nothing is listening.
  if (!screen || screen.entry !== "float") return null;
  return (
    <Animated.View entering={enter} style={[styles.entryWrap, { bottom }]} pointerEvents="box-none">
      <Pressable
        onPress={() => controls.start("assist")}
        accessibilityRole="button"
        accessibilityLabel="Talk to Thinketh"
        accessibilityHint="Starts a voice conversation. Thinketh asks for the microphone the first time."
        style={({ pressed }) => [styles.entry, pressed && { transform: [{ scale: 0.97 }] }]}
      >
        <Mark size={16} decorative />
        <T style={styles.entryText}>Talk</T>
      </Pressable>
    </Animated.View>
  );
}

export function MicToggle({ muted, disabled, onPress }: { muted: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      accessibilityLabel={muted ? "Microphone is off. Turn it on." : "Microphone is on. Turn it off."}
      hitSlop={4}
      style={({ pressed }) => [styles.round, muted && styles.muted, (pressed || disabled) && { opacity: 0.5 }]}
    >
      <Icon name="voice" size={18} color={muted ? color.ink3 : color.ink} />
      {muted ? <View style={styles.slash} /> : null}
    </Pressable>
  );
}

function StateDot({ state, reduced }: { state: AgentState; reduced: boolean }) {
  if (state.status === "connecting" || state.phase === "thinking") return <Pulse reduceMotion={reduced} />;
  const c = state.phase === "speaking" ? color.coral : state.isMuted ? color.ink3 : color.ink;
  return <View style={[styles.dot, { backgroundColor: c }]} />;
}

const styles = StyleSheet.create({
  dockWrap: { position: "absolute", left: gutter - 4, right: gutter - 4 },
  dock: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s,
    minHeight: 58,
    paddingLeft: space.s,
    paddingRight: space.s,
    paddingVertical: space.xs,
    borderRadius: radius.feature,
    backgroundColor: color.canvas,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairline,
    ...depth.control,
  },
  dockBody: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.m, paddingLeft: space.s, minHeight: 50 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  state: { fontFamily: font.sansSemibold, fontSize: 12, lineHeight: 16, color: color.ink2, letterSpacing: 0.1 },
  caption: { fontFamily: font.sans, fontSize: 14, lineHeight: 19, color: color.ink },
  round: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: color.surfaceMuted },
  muted: { backgroundColor: color.surfaceMuted },
  slash: { position: "absolute", width: 22, height: 1.5, backgroundColor: color.ink3, transform: [{ rotate: "-45deg" }] },
  end: { backgroundColor: color.ink },
  entryWrap: { position: "absolute", right: gutter },
  entry: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: color.canvas,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairline,
    ...depth.control,
  },
  entryText: { fontFamily: font.sansSemibold, fontSize: 13, color: color.ink },
  liveChip: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: color.surfaceMuted },
});

/** The agent inside a text composer (Ask): talk when idle, the live state (tap to open) when running. */
export function AgentComposerButton() {
  const state = useAgentState();
  const controls = useAgentControls();
  const reduced = useReducedMotion();
  if (!controls.supported) return null;
  if (isActive(state.status)) {
    const label = phaseLabel(state);
    return (
      <Pressable onPress={controls.expand} accessibilityRole="button" accessibilityLabel={`Conversation with Thinketh. ${label}. Open the conversation.`} hitSlop={6} style={({ pressed }) => [styles.liveChip, pressed && { opacity: 0.7 }]}>
        <StateDot state={state} reduced={reduced} />
        <T style={styles.entryText}>{label}</T>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={() => controls.start("assist")} accessibilityRole="button" accessibilityLabel="Talk to Thinketh" accessibilityHint="Starts a voice conversation about this answer." hitSlop={6} style={({ pressed }) => [styles.round, pressed && { opacity: 0.7 }]}>
      <Icon name="voice" size={18} color={color.ink} />
    </Pressable>
  );
}
