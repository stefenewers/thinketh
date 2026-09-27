// The conversation, expanded: what Thinketh is saying, recent turns, and every control. Minimize
// (top) keeps the conversation going; "End conversation" (bottom) disconnects and releases the
// microphone. The two are deliberately far apart and worded differently.
import { useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { Mark } from "@/components/Logo";
import { T } from "@/components/Text";
import { Button } from "@/components/ui";
import { useReducedMotion } from "@/lib/hooks";
import { color, font, gutter, radius, space } from "@/theme/tokens";
import { LevelMeter, VoiceStatus, type VoiceState } from "@/voice/CatchUpScene";
import { LiveCaption } from "@/voice/LiveCaption";
import { isActive, useAgentControls, useAgentState } from "./agentContext";
import { MicToggle } from "./AgentDock";

export function AgentSheet() {
  const state = useAgentState();
  const controls = useAgentControls();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [draft, setDraft] = useState("");

  const visible = state.expanded && isActive(state.status);
  const voiceState: VoiceState = state.ending
    ? "ending"
    : state.status === "connecting"
      ? "connecting"
      : state.phase === "speaking"
        ? "speaking"
        : state.phase === "thinking"
          ? "thinking"
          : state.isMuted
            ? "muted"
            : state.phase === "user"
              ? "user"
              : "listening";
  const send = () => {
    if (controls.sendText(draft)) setDraft("");
  };

  return (
    <Modal visible={visible} transparent animationType={reduced ? "fade" : "slide"} onRequestClose={controls.minimize} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={controls.minimize} accessibilityLabel="Minimize the conversation" />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.avoid} pointerEvents="box-none">
          <View style={[styles.sheet, { paddingBottom: insets.bottom + space.m }]}>
            <View style={styles.grabber} />
            <View style={styles.header}>
              <Mark size={20} decorative />
              <View style={{ flex: 1 }}>
                <T style={styles.title} accessibilityRole="header">
                  Thinketh
                </T>
                <T variant="meta" style={{ color: color.ink3 }}>
                  {state.activity === "catch_up" ? "Catch Me Up" : "With you across the app"}
                </T>
              </View>
              <VoiceStatus state={voiceState} />
              <Pressable onPress={controls.minimize} accessibilityRole="button" accessibilityLabel="Minimize. The conversation keeps going." hitSlop={8} style={styles.minimize}>
                <View style={{ transform: [{ rotate: "90deg" }] }}>
                  <Icon name="chevron" size={18} color={color.ink2} />
                </View>
              </Pressable>
            </View>

            <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: space.m }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {state.turns.slice(-8, -1).map((t, i) => (
                <T key={i} style={t.role === "user" ? styles.you : styles.earlier} numberOfLines={t.role === "user" ? 2 : 3}>
                  {t.role === "user" ? `You: ${t.text}` : t.text}
                </T>
              ))}
              {state.caption.current || state.caption.previous ? (
                <LiveCaption current={state.caption.current} previous={state.caption.previous} announce={state.announce} reduceMotion={reduced} />
              ) : (
                <T variant="support" style={{ marginTop: space.m }}>
                  {state.status === "connecting" ? "Connecting…" : "Ask about what's on screen, or say where you'd like to go."}
                </T>
              )}
              {state.level ? (
                <View style={{ marginTop: space.m, alignItems: "center" }}>
                  <LevelMeter level={state.level} active={state.phase === "speaking"} reduceMotion={reduced} />
                </View>
              ) : null}
              {state.pausedBySystem && state.isMuted ? (
                <T variant="meta" style={{ marginTop: space.s, color: color.ink2 }} accessibilityLiveRegion="polite">
                  Your mic paused while you were away. Turn it on to keep talking.
                </T>
              ) : null}
            </ScrollView>

            <View style={styles.inputWrap}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Type to Thinketh"
                placeholderTextColor={color.ink3}
                style={styles.input}
                returnKeyType="send"
                onSubmitEditing={send}
                maxLength={500}
                editable={state.status === "live"}
                accessibilityLabel="Type a message to Thinketh"
              />
              <Pressable onPress={send} disabled={!draft.trim()} accessibilityRole="button" accessibilityLabel="Send" style={({ pressed }) => [styles.send, (!draft.trim() || pressed) && { opacity: 0.4 }]}>
                <Icon name="send" size={16} color={color.onInk} />
              </Pressable>
            </View>

            <View style={styles.controls}>
              <MicToggle muted={state.isMuted} disabled={state.status !== "live"} onPress={() => controls.setMuted(!state.isMuted)} />
              {state.phase === "speaking" ? (
                <Button kind="secondary" label="Stop talking" accessibilityLabel="Stop this reply. The conversation keeps going." onPress={controls.stopTalking} style={{ flex: 1 }} />
              ) : (
                <View style={{ flex: 1 }} />
              )}
              <Button kind="quiet" label="End conversation" accessibilityLabel="End conversation and turn off the microphone" onPress={controls.end} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end", backgroundColor: color.overlay },
  avoid: { justifyContent: "flex-end" },
  sheet: {
    maxHeight: "86%",
    backgroundColor: color.ground,
    borderTopLeftRadius: radius.feature,
    borderTopRightRadius: radius.feature,
    paddingHorizontal: gutter,
  },
  grabber: { alignSelf: "center", width: 36, height: 5, borderRadius: 3, backgroundColor: color.edge, marginTop: space.s },
  header: { flexDirection: "row", alignItems: "center", gap: space.m, paddingTop: space.m, paddingBottom: space.s },
  title: { fontFamily: font.sansSemibold, fontSize: 17, lineHeight: 22, color: color.ink },
  minimize: { width: 44, height: 44, alignItems: "flex-end", justifyContent: "center" },
  body: { flexGrow: 0, minHeight: 160 },
  earlier: { marginTop: space.s, fontFamily: font.sans, fontSize: 14, lineHeight: 20, color: color.ink3 },
  you: { marginTop: space.s, fontFamily: font.sansMedium, fontSize: 14, lineHeight: 20, color: color.ink2 },
  inputWrap: { flexDirection: "row", alignItems: "center", marginTop: space.m, minHeight: 48, paddingLeft: space.l, paddingRight: 5, borderRadius: radius.pill, backgroundColor: color.canvas, borderWidth: StyleSheet.hairlineWidth, borderColor: color.hairline },
  input: { flex: 1, fontFamily: font.sans, fontSize: 15, color: color.ink, paddingVertical: space.s },
  send: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: color.ink },
  controls: { flexDirection: "row", alignItems: "center", gap: space.m, marginTop: space.l },
});
