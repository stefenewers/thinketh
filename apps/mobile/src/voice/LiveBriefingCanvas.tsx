import { Pressable, StyleSheet, View } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import type { KnowledgeResponse } from "@thinketh/contracts";
import { Icon } from "@/components/Icon";
import { T } from "@/components/Text";
import { Button } from "@/components/ui";
import { color, depth, font, space } from "@/theme/tokens";
import { CatchUpScene, LevelMeter, VoiceStatus, type VoiceState } from "./CatchUpScene";
import { LiveCaption } from "./LiveCaption";
import type { VoicePhase } from "./voiceVisualState";

/**
 * Catch Me Up, live: the concept Thinketh is explaining, a small reading scene from your Mind, what
 * Thinketh is saying, and your controls. Presentation only. Nothing here reads or writes knowledge state.
 */
export function LiveBriefingCanvas({
  phase,
  topic,
  focusId,
  knowledge,
  caption,
  announce,
  aligned,
  lastUser,
  ending,
  isMuted,
  level,
  reduceMotion,
  onToggleMic,
  onEnd,
  onText,
  onOpenInMind,
}: {
  phase: VoicePhase;
  /** The briefing's lead topic, shown when no concept is linked. */
  topic: string | null;
  focusId: string | null;
  knowledge: KnowledgeResponse | null;
  caption: { current: string; previous: string };
  announce: string;
  /** Captions are timed to the audio (alignment) rather than the turn transcript shown whole. */
  aligned: boolean;
  lastUser: string;
  /** The user asked to end; the call is closing. */
  ending?: boolean;
  isMuted: boolean;
  level: SharedValue<number>;
  reduceMotion: boolean;
  onToggleMic: () => void;
  onEnd: () => void;
  onText: () => void;
  /** Ends the call, then opens this concept in the Mind. */
  onOpenInMind: (conceptId: string) => void;
}) {
  const speaking = phase === "speaking";
  const state: VoiceState = ending ? "ending" : speaking ? "speaking" : phase === "user" ? "user" : isMuted ? "muted" : phase === "connecting" ? "connecting" : "listening";

  return (
    <View>
      <CatchUpScene knowledge={knowledge} conceptId={focusId} fallbackTitle={topic} status={<VoiceStatus state={state} />} live onOpenInMind={onOpenInMind} />

      {/* The transcript: Thinketh's words (the assistant), then what you said. Stefen in the scene is you. */}
      <View style={styles.transcript}>
        <T variant="label" style={{ color: color.ink3 }}>
          Thinketh
        </T>
        {caption.current || caption.previous ? (
          <LiveCaption current={caption.current} previous={caption.previous} announce={announce} reduceMotion={reduceMotion} />
        ) : (
          <T variant="support" style={{ marginTop: space.s }}>
            {speaking ? "…" : "Waiting for Thinketh to begin."}
          </T>
        )}
        {caption.current && !aligned && speaking ? (
          <T variant="meta" style={{ color: color.ink3, marginTop: space.xs }}>
            Transcript of this reply
          </T>
        ) : null}
        <View style={{ marginTop: space.m, alignItems: "center" }}>
          <LevelMeter level={level} active={speaking && !ending} reduceMotion={reduceMotion} />
        </View>
      </View>

      <View style={styles.stateBlock}>
        {ending ? (
          <>
            <T style={styles.turn} accessibilityLiveRegion="polite">
              Ending your catch-up…
            </T>
            <T variant="support">Heard you. Closing the call.</T>
          </>
        ) : speaking ? (
          <T variant="support">You can interrupt anytime. Just start talking.</T>
        ) : phase === "user" ? (
          <T variant="support">Thinketh hears you and keeps this concept in view while you talk.</T>
        ) : (
          <>
            <T style={styles.turn}>Your turn</T>
            <T variant="support">{isMuted ? "Your mic is off. Turn it on to reply." : "Ask about this change, or interrupt with anything you're unsure about."}</T>
          </>
        )}
        {lastUser && !ending ? (
          <T variant="meta" style={{ color: color.ink3, marginTop: space.xs }} numberOfLines={2}>
            You said: “{lastUser}”
          </T>
        ) : null}
      </View>

      <View style={styles.controls}>
        <Pressable
          onPress={onToggleMic}
          accessibilityRole="button"
          accessibilityLabel={isMuted ? "Microphone is off. Turn it on." : "Microphone is on. Turn it off."}
          style={({ pressed }) => [styles.mic, isMuted && styles.micOff, pressed && { opacity: 0.7 }]}
        >
          <Icon name="voice" size={20} color={isMuted ? color.ink3 : color.ink} />
          {isMuted ? <View style={styles.micSlash} /> : null}
        </Pressable>
        <Button label="End catch-up" accessibilityLabel="End catch-up" onPress={onEnd} style={{ flex: 1 }} />
      </View>
      <Button kind="quiet" label="Read as text instead" style={{ alignSelf: "center" }} onPress={onText} />
    </View>
  );
}

const styles = StyleSheet.create({
  transcript: { marginTop: space.xl, paddingTop: space.l, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.edge },
  stateBlock: { marginTop: space.l, gap: 2, minHeight: 44 },
  turn: { fontFamily: font.sansSemibold, fontSize: 16, lineHeight: 21, color: color.ink },
  controls: { flexDirection: "row", alignItems: "center", gap: space.m, marginTop: space.xl },
  mic: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: color.canvas, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(22,22,22,0.05)", ...depth.control },
  micOff: { backgroundColor: color.surfaceMuted },
  micSlash: { position: "absolute", width: 26, height: 1.5, backgroundColor: color.ink3, transform: [{ rotate: "-45deg" }] },
});
